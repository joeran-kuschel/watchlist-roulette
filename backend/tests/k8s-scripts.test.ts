import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const k8sDir = join(import.meta.dirname, '../../k8s')
let work: string
let env: NodeJS.ProcessEnv

// A kubectl that records its calls. `exec -i` prints $FAKE_DUMP (a backup), or stores stdin in $FAKE_STDIN_FILE like psql
// would receive it: FAKE_CUT_BYTES cuts the stream off after that many bytes, FAKE_EXEC_EXIT makes the command fail, and
// the answer `restore-complete` comes only when the stream held its COMMIT and the marker after it. A plain `exec`
// (the row counts after a restore) prints $FAKE_COUNTS.
beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'k8s-scripts-'))
  const bin = join(work, 'bin')
  spawnSync('mkdir', [bin])
  writeFileSync(
    join(bin, 'kubectl'),
    `#!/bin/sh
echo "$@" >> "$FAKE_CALLS"
case "$*" in
  *" exec -i "*)
    if [ -n "$FAKE_DUMP" ]; then cat "$FAKE_DUMP"; else
      cat > "$FAKE_STDIN_FILE"
      if [ -n "$FAKE_CUT_BYTES" ]; then head -c "$FAKE_CUT_BYTES" "$FAKE_STDIN_FILE" > "$FAKE_STDIN_FILE.cut"; mv "$FAKE_STDIN_FILE.cut" "$FAKE_STDIN_FILE"; fi
      [ -n "$FAKE_EXEC_EXIT" ] && exit "$FAKE_EXEC_EXIT"
      if [ -n "$FAKE_ANSWER" ]; then printf '%b' "$FAKE_ANSWER"; [ -n "$FAKE_ANSWER_EXIT" ] && exit "$FAKE_ANSWER_EXIT"; exit 0; fi
      if grep -q '^COMMIT;$' "$FAKE_STDIN_FILE" && tail -n 1 "$FAKE_STDIN_FILE" | grep -q "^SELECT 'restore-complete';$"; then echo restore-complete; fi
    fi ;;
  *" exec "*) [ -n "$FAKE_COUNTS_EXIT" ] && exit "$FAKE_COUNTS_EXIT"; printf '%s\\n' "$FAKE_COUNTS" ;;
esac
`,
  )
  chmodSync(join(bin, 'kubectl'), 0o755)
  env = {
    PATH: `${bin}:${process.env.PATH}`,
    HOME: work,
    BACKUP_DIR: join(work, 'backups'),
    FAKE_CALLS: join(work, 'calls.txt'),
    FAKE_STDIN_FILE: join(work, 'stdin.txt'),
  }
})
afterEach(() => rmSync(work, { recursive: true, force: true }))

const run = (script: string, args: string[] = [], extra: NodeJS.ProcessEnv = {}) =>
  spawnSync('bash', [join(k8sDir, script), ...args], { env: { ...env, ...extra }, encoding: 'utf8' })
const calls = () => (existsSync(env.FAKE_CALLS!) ? readFileSync(env.FAKE_CALLS!, 'utf8') : '')
const dump = (text: string) => {
  const file = join(work, 'dump.sql')
  writeFileSync(file, text)
  return file
}
const COMPLETE = '-- data\n-- PostgreSQL database dump complete\n'
const backups = () => readdirSync(env.BACKUP_DIR!).filter((f) => f.endsWith('.sql.gz'))

describe('backup-db.sh', () => {
  it('writes a compressed dump of the postgres pod into the backup folder', () => {
    const result = run('backup-db.sh', [], { FAKE_DUMP: dump(COMPLETE) })
    expect(result.status).toBe(0)
    expect(backups()).toHaveLength(1)
    expect(calls()).toContain('--context docker-desktop -n watchlist-roulette exec -i deploy/postgres')
  })

  it('keeps the earlier backups and writes nothing when the dump is incomplete', () => {
    run('backup-db.sh', [], { FAKE_DUMP: dump(COMPLETE) })
    const before = backups()
    const result = run('backup-db.sh', [], { FAKE_DUMP: dump('-- cut off\n') })
    expect(result.status).not.toBe(0)
    expect(backups()).toEqual(before)
    expect(readdirSync(env.BACKUP_DIR!).filter((f) => f.endsWith('.partial'))).toEqual([])
  })

  it('deletes the oldest backups above BACKUP_KEEP', () => {
    run('backup-db.sh', [], { FAKE_DUMP: dump(COMPLETE) })
    const oldest = join(env.BACKUP_DIR!, 'watchlist-20200101-000000.sql.gz')
    writeFileSync(oldest, gzipSync(COMPLETE))
    utimesSync(oldest, new Date('2020-01-01'), new Date('2020-01-01'))
    run('backup-db.sh', [], { FAKE_DUMP: dump(COMPLETE), BACKUP_KEEP: '1' })
    expect(backups()).toHaveLength(1)
    expect(existsSync(oldest)).toBe(false)
  })
})

describe('restore-db.sh', () => {
  const DUMP = 'SELECT 1;\n-- PostgreSQL database dump complete\n'
  const backupFile = (text = DUMP) => {
    const file = join(work, 'b.sql.gz')
    writeFileSync(file, gzipSync(text))
    return file
  }
  const COUNTS = 'films 572\nfilm_credits 6269\ngenres 20\npeople 3000'
  const restore = (extra: NodeJS.ProcessEnv = {}, file = backupFile()) =>
    run('restore-db.sh', [file, '--yes'], { FAKE_COUNTS: COUNTS, ...extra })
  const sent = () => readFileSync(env.FAKE_STDIN_FILE!, 'utf8')
  const scaleCalls = () => calls().split('\n').filter((l) => l.includes('scale deployment/backend'))

  it('needs an existing file', () => {
    expect(run('restore-db.sh', [join(work, 'missing.sql.gz'), '--yes']).status).toBe(1)
    expect(calls()).toBe('')
  })

  it('stops the backend, loads the dump inside BEGIN and COMMIT, and starts the backend again', () => {
    const result = restore()
    expect(result.status).toBe(0)
    expect(sent()).toBe(`BEGIN;\n${DUMP}COMMIT;\nSELECT 'restore-complete';\n`)
    const lines = calls().trim().split('\n')
    expect(lines[0]).toContain('scale deployment/backend --replicas=0')
    expect(lines.at(-1)).toContain('scale deployment/backend --replicas=1')
    expect(result.stdout).toContain('Restored')
  })

  it('does not use --single-transaction: the transaction is the script\'s own, so a cut stream cannot commit', () => {
    restore()
    expect(calls()).not.toContain('single-transaction')
    expect(calls()).toContain('ON_ERROR_STOP=1')
  })

  it('shows what came back, so a restore without data is visible', () => {
    const result = restore()
    expect(result.stdout).toContain('films 572')
    expect(result.stdout).toContain('film_credits 6269')
    expect(calls()).toContain('exec deploy/postgres -- sh -c')
  })

  it.each([
    ['in the middle of the dump', 20], // psql ends without COMMIT: everything is rolled back
    ['right after the dump, before COMMIT', 'BEGIN;\n'.length + DUMP.length],
    ['after COMMIT, before the marker', 'BEGIN;\n'.length + DUMP.length + 'COMMIT;\n'.length],
    ['before anything arrived', 0],
  ])('fails when the stream is cut off %s, and says how to go on', (_where, bytes) => {
    const result = restore({ FAKE_CUT_BYTES: String(bytes) })
    expect(result.status).toBe(1)
    expect(result.stdout).not.toContain('Restored')
    expect(result.stderr).toContain('cut off before the end')
    expect(result.stderr).toContain('Run it again')
    // the backend is started again even so
    expect(scaleCalls().at(-1)).toContain('--replicas=1')
  })

  it('fails when psql reports an error, and does not claim to have restored anything', () => {
    const result = restore({ FAKE_EXEC_EXIT: '3' })
    expect(result.status).toBe(1)
    expect(result.stdout).not.toContain('Restored')
    expect(result.stderr).toContain('Run it again')
    expect(scaleCalls().at(-1)).toContain('--replicas=1')
  })

  it.each([
    ['a dump without the end marker (cut off when it was written)', () => backupFile('SELECT 1;\n')],
    ['a dump with the end marker in the middle and more after it', () => backupFile(`-- PostgreSQL database dump complete\n${'SELECT 1;\n'.repeat(50)}`)],
    ['a damaged archive', () => {
      const file = join(work, 'bad.sql.gz')
      writeFileSync(file, 'not gzip')
      return file
    }],
    ['a truncated archive', () => {
      const file = join(work, 'cut.sql.gz')
      writeFileSync(file, gzipSync(DUMP.repeat(2000)).subarray(0, 40))
      return file
    }],
  ])('refuses %s before it touches anything', (_what, make) => {
    const result = restore({}, make())
    expect(result.status).toBe(1)
    expect(result.stderr).toContain('not a complete backup')
    expect(calls()).toBe('')
  })

  // psql's answer as the script sees it: FAKE_ANSWER replaces the computed one (\\n escapes are expanded)
  it('accepts the marker after numbers that setval statements printed', () => {
    const result = restore({ FAKE_ANSWER: '5\\n12\\nrestore-complete\\n' })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Restored')
  })

  it.each([
    ['the marker is not the last line', 'restore-complete\\n7\\n'],
    ['psql answered nothing and exited 0', ' '],
    ['psql answered something else', 'ERROR\\n'],
  ])('fails when %s', (_what, answer) => {
    const result = restore({ FAKE_ANSWER: answer })
    expect(result.status).toBe(1)
    expect(result.stdout).not.toContain('Restored')
    expect(scaleCalls().at(-1)).toContain('--replicas=1')
  })

  it('fails when psql exits non-zero even though the marker was printed', () => {
    const result = restore({ FAKE_ANSWER: 'restore-complete\\n', FAKE_ANSWER_EXIT: '2' })
    expect(result.status).toBe(1)
    expect(result.stdout).not.toContain('Restored')
    expect(scaleCalls().at(-1)).toContain('--replicas=1')
  })

  it('still succeeds, and says so, when the row counts cannot be read', () => {
    const result = restore({ FAKE_COUNTS_EXIT: '1' })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Restored')
    expect(result.stdout).toContain('row counts could not be read')
    expect(scaleCalls().at(-1)).toContain('--replicas=1')
  })

  it('fails and starts the backend again when gzip dies after the check passed', () => {
    // a gzip that works for the two checks (-t and the end marker) and breaks on the third call, the one that feeds psql
    const real = spawnSync('sh', ['-c', 'command -v gzip'], { encoding: 'utf8' }).stdout.trim()
    const fake = join(work, 'bin', 'gzip')
    writeFileSync(
      fake,
      `#!/bin/sh
n=$(cat "$FAKE_GZIP_COUNT" 2>/dev/null || echo 0); n=$((n+1)); echo $n > "$FAKE_GZIP_COUNT"
if [ "$n" -ge 3 ]; then echo 'SELECT 1;'; exit 1; fi
exec ${real} "$@"
`,
    )
    chmodSync(fake, 0o755)
    const result = restore({ FAKE_GZIP_COUNT: join(work, 'gzip-count') })
    expect(result.status).toBe(1)
    expect(result.stdout).not.toContain('Restored')
    expect(sent()).not.toContain('COMMIT;')
    expect(scaleCalls().at(-1)).toContain('--replicas=1')
  })

  it('works with a file name that has spaces, and only talks to the docker-desktop context', () => {
    const file = join(work, 'my backup.sql.gz')
    writeFileSync(file, gzipSync(DUMP))
    const result = restore({}, file)
    expect(result.status).toBe(0)
    expect(sent()).toContain(DUMP)
    for (const line of calls().trim().split('\n')) expect(line).toContain('--context docker-desktop -n watchlist-roulette')
  })

  it('goes on when the confirmation is typed', () => {
    const result = spawnSync('bash', [join(k8sDir, 'restore-db.sh'), backupFile()], { env: { ...env, FAKE_COUNTS: COUNTS }, encoding: 'utf8', input: 'restore\n' })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain('Restored')
  })

  it('aborts without confirmation input at all (closed stdin)', () => {
    const result = spawnSync('bash', [join(k8sDir, 'restore-db.sh'), backupFile()], { env, encoding: 'utf8', input: '' })
    expect(result.status).toBe(1)
    expect(calls()).toBe('')
  })

  it('accepts a dump with a few lines after the end marker (pg_dump 17 adds \\unrestrict) and a big dump', () => {
    const big = `BEGIN;\n${'SELECT 1;\n'.repeat(300000)}-- PostgreSQL database dump complete\n--\n\\unrestrict abc\n`
    expect(restore({}, backupFile(big)).status).toBe(0)
  })

  it('does nothing without the confirmation', () => {
    const result = spawnSync('bash', [join(k8sDir, 'restore-db.sh'), backupFile()], { env, encoding: 'utf8', input: 'no\n' })
    expect(result.status).toBe(1)
    expect(calls()).toBe('')
  })
})

describe('deploy.sh', () => {
  const script = readFileSync(join(k8sDir, 'deploy.sh'), 'utf8')

  it('only talks to the docker-desktop context', () => {
    expect(script).toContain('CLUSTER=docker-desktop')
    const bareKubectl = script.split('\n').filter((line) => /^\s*kubectl\s/.test(line))
    expect(bareKubectl).toEqual([])
  })

  it('keeps the TMDB token out of the process list', () => {
    expect(script).not.toMatch(/--from-literal=TMDB/)
    expect(script).toContain('--from-file=TMDB_ACCESS_TOKEN=/dev/stdin')
  })

  it('does not replace an existing database secret', () => {
    expect(script).toMatch(/get secret watchlist-db[\s\S]*is kept/)
  })

  it('is valid shell', () => {
    for (const file of ['deploy.sh', 'backup-db.sh', 'restore-db.sh', 'install-backup-job.sh', 'generate-init-scripts.sh']) {
      expect({ file, status: spawnSync('bash', ['-n', join(k8sDir, file)]).status }).toEqual({ file, status: 0 })
    }
  })
})
