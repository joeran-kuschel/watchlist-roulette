import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gzipSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const k8sDir = join(import.meta.dirname, '../../k8s')
let work: string
let env: NodeJS.ProcessEnv

// A kubectl that records its calls; `exec` prints $FAKE_DUMP (or stores stdin in $FAKE_STDIN_FILE)
beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'k8s-scripts-'))
  const bin = join(work, 'bin')
  spawnSync('mkdir', [bin])
  writeFileSync(
    join(bin, 'kubectl'),
    `#!/bin/sh
echo "$@" >> "$FAKE_CALLS"
case "$*" in
  *" exec "*) if [ -n "$FAKE_DUMP" ]; then cat "$FAKE_DUMP"; else cat > "$FAKE_STDIN_FILE"; fi ;;
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
  const backupFile = () => {
    const file = join(work, 'b.sql.gz')
    writeFileSync(file, gzipSync('SELECT 1;\n'))
    return file
  }

  it('needs an existing file', () => {
    expect(run('restore-db.sh', [join(work, 'missing.sql.gz'), '--yes']).status).toBe(1)
    expect(calls()).toBe('')
  })

  it('stops the backend, loads the dump and starts the backend again', () => {
    const result = run('restore-db.sh', [backupFile(), '--yes'])
    expect(result.status).toBe(0)
    expect(readFileSync(env.FAKE_STDIN_FILE!, 'utf8')).toBe('SELECT 1;\n')
    const lines = calls().trim().split('\n')
    expect(lines[0]).toContain('scale deployment/backend --replicas=0')
    expect(lines.at(-1)).toContain('scale deployment/backend --replicas=1')
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
      expect(spawnSync('bash', ['-n', join(k8sDir, file)]).status, file).toBe(0)
    }
  })
})
