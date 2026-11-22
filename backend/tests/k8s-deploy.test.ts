import { spawnSync } from 'node:child_process'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

// k8s/deploy.sh (local overrides, old images and the node disk) and k8s/image-cleanup.sh, run against a fake kubectl, docker, curl and sleep on the PATH. Nothing
// reaches a real cluster or the Docker daemon. See documentation/backend/kubernetes.md ("Old images").
const k8sDir = join(import.meta.dirname, '../../k8s')

// Logs every call. `get nodes -o jsonpath` names the node, `get deployment <name> -o jsonpath` prints the image the
// Deployment runs now (DEPLOYED_BACKEND_IMAGE, DEPLOYED_FRONTEND_IMAGE; FAIL_DEPLOY_GET makes it fail), `get pods`
// prints PODS_IMAGES (FAIL_PODS makes it fail), `get secret` says nothing exists, and FAIL_ROLLOUT fails the rollout.
const FAKE_KUBECTL = `#!/bin/bash
echo "$*" >> "$FAKE_DIR/calls.log"
case "$*" in
  *"get nodes -o jsonpath"*) printf 'desktop-control-plane' ;;
  *"get nodes"*) exit 0 ;;
  *"get ingressclass nginx"*) exit 0 ;;
  *"kustomize k8s"*) printf 'image: watchlist-backend:dev\\nimage: watchlist-frontend:dev\\n' ;;
  *"get secret watchlist-tls"*) exit "\${TLS_SECRET_EXIT:-1}" ;;
  *"get secret"*) exit 1 ;;
  # Reads what deploy.sh pipes into it, like the real kubectl does (--from-env-file=/dev/stdin). A fake that exits without
  # reading makes the writer's printf die with SIGPIPE (exit 141 under pipefail), depending on timing.
  *"create secret generic"*) cat > /dev/null ;;
  *"create secret tls"*)
    while [ $# -gt 0 ]; do
      case "$1" in --cert) cert="$2" ;; --key) key="$2" ;; esac
      shift
    done
    printf 'kind: Secret\ntype: kubernetes.io/tls\ndata:\n  tls.crt: %s\n  tls.key: %s\n' "$(cat "$cert")" "$(cat "$key")" ;;
  *"create -f -"*) tee -a "$FAKE_DIR/created-all.yaml" > /dev/null ;;
  *"apply -f -"*) tee -a "$FAKE_DIR/applied-all.yaml" > /dev/null ;;
  *"rollout status deployment/"*) exit "\${FAIL_ROLLOUT:-0}" ;;
  *"get deployment backend -o jsonpath"*)
    [ -n "\${FAIL_DEPLOY_GET:-}" ] && exit 1
    printf '%s' "\${DEPLOYED_BACKEND_IMAGE-watchlist-backend:20261014114253}" ;;
  *"get deployment frontend -o jsonpath"*)
    [ -n "\${FAIL_DEPLOY_GET:-}" ] && exit 1
    printf '%s' "\${DEPLOYED_FRONTEND_IMAGE-watchlist-frontend:20261014114253}" ;;
  *"get pods"*)
    [ -n "\${FAIL_PODS:-}" ] && exit 1
    printf '%s' "\${PODS_IMAGES-}" ;;
esac
exit 0
`

// docker save prints the image name, docker exec stores what is piped into the node. The node's images are the lines
// "<ref> <digest>" of FAKE_NODE_IMAGES (plus what is imported, each with a digest of its own), printed like
// \`ctr images ls\`; removing one takes it out of the list and is logged (removed-node). The host's are the lines of
// FAKE_HOST_IMAGES (plus what was built); removing one is logged (removed-host). FAIL_RM makes every removal fail.
// The node's free space is FAKE_FREE_KB, and FAKE_FREE_AFTER_KB once an image has been removed from the node
// ("-" means df gives no answer).
const FAKE_DOCKER = `#!/bin/bash
echo "$*" >> "$FAKE_DIR/docker.log"
echo "docker $*" >> "$FAKE_DIR/calls.log"
nodefile="$FAKE_DIR/node-images"
case "$1" in
  save) echo "IMAGE $2" ;;
  build) ;;
  images)
    printf '%s\\n' "\${FAKE_HOST_IMAGES-}"
    awk '/^build/ {for (i = 1; i <= NF; i++) if ($i == "--tag") print $(i + 1)}' "$FAKE_DIR/docker.log" ;;
  image)
    [ -n "\${FAIL_RM:-}" ] && exit 1
    echo "$3" >> "$FAKE_DIR/removed-host" ;;
  exec)
    case "$*" in
      *"images import -"*) cat >> "$FAKE_DIR/imported" ;;
      *"images ls"*)
        [ -f "$nodefile" ] || printf '%s\\n' "\${FAKE_NODE_IMAGES-}" > "$nodefile"
        echo "REF TYPE DIGEST SIZE PLATFORMS LABELS"
        { cat "$nodefile"; [ -f "$FAKE_DIR/imported" ] && awk '{print $2, "sha256:imported" NR}' "$FAKE_DIR/imported"; } |
          while read -r ref digest; do
            [ -n "$ref" ] && echo "$ref application/vnd.oci.image.index.v1+json $digest 1.0MiB linux/arm64 -"
          done ;;
      *"images rm"*)
        [ -n "\${FAIL_RM:-}" ] && exit 1
        ref="\${@: -1}"
        echo "$ref" >> "$FAKE_DIR/removed-node"
        [ -f "$nodefile" ] || printf '%s\\n' "\${FAKE_NODE_IMAGES-}" > "$nodefile"
        awk -v r="$ref" '$1 != r' "$nodefile" > "$nodefile.tmp" && mv "$nodefile.tmp" "$nodefile" ;;
      *"df -Pk"*)
        free="\${FAKE_FREE_KB-9999999}"
        if [ -f "$FAKE_DIR/removed-node" ] && [ -n "\${FAKE_FREE_AFTER_KB:-}" ]; then free="$FAKE_FREE_AFTER_KB"; fi
        [ "$free" = "-" ] && exit 1
        printf 'Filesystem 1024-blocks Used Available Capacity Mounted on\\n/dev/vda1 61202244 1 %s 99%% /\\n' "$free" ;;
    esac ;;
esac
`
// mkcert writes a certificate and a key (a random one) to the files it is told, and logs where; its certificate
// authority is in $FAKE_DIR/ca unless FAKE_NO_CA is set.
const FAKE_MKCERT = `#!/bin/bash
echo "$*" >> "$FAKE_DIR/mkcert.log"
if [ "$1" = "-CAROOT" ]; then
  [ -n "$FAKE_NO_CA" ] && mkdir -p "$FAKE_DIR/noca" && echo "$FAKE_DIR/noca" || echo "$FAKE_DIR/ca"
  exit 0
fi
while [ $# -gt 0 ]; do
  case "$1" in -cert-file) cert="$2" ;; -key-file) key="$2" ;; esac
  shift
done
echo "$cert" >> "$FAKE_DIR/mkcert-files"
echo "$key" >> "$FAKE_DIR/mkcert-files"
[ -n "$FAKE_MKCERT_FAILS" ] && { echo "mkcert: boom" >&2; exit 1; }
echo "CERTIFICATE-$RANDOM" > "$cert"
echo "PRIVATE-KEY-$RANDOM$RANDOM" > "$key"
`
const FAKE_CURL = '#!/bin/bash\necho "$*" >> "$FAKE_DIR/curl.log"\nexit 0\n'
const FAKE_SLEEP = '#!/bin/bash\nexit 0\n'

let work: string

const writeExecutable = (file: string, content: string) => {
  writeFileSync(file, content)
  chmodSync(file, 0o755)
}

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'k8s-images-'))
  mkdirSync(join(work, 'bin'))
  writeExecutable(join(work, 'bin', 'kubectl'), FAKE_KUBECTL)
  writeExecutable(join(work, 'bin', 'docker'), FAKE_DOCKER)
  writeExecutable(join(work, 'bin', 'mkcert'), FAKE_MKCERT)
  mkdirSync(join(work, 'ca'))
  writeFileSync(join(work, 'ca', 'rootCA.pem'), 'ROOT CA')
  writeExecutable(join(work, 'bin', 'curl'), FAKE_CURL)
  writeExecutable(join(work, 'bin', 'sleep'), FAKE_SLEEP)
})
afterEach(() => rmSync(work, { recursive: true, force: true }))

// A TMDB token in the environment keeps the script from reading the developer's own .env (it only goes to the fake kubectl)
// `withoutMkcert` leaves only the fakes and the system's own tools on the PATH, as on a machine without mkcert.
const run = (env: Record<string, string> = {}, { withoutMkcert = false } = {}) => {
  if (withoutMkcert) rmSync(join(work, 'bin', 'mkcert'), { force: true })
  return spawnSync('bash', [join(k8sDir, 'deploy.sh')], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${join(work, 'bin')}:${withoutMkcert ? '/usr/bin:/bin' : process.env.PATH}`,
      FAKE_DIR: work,
      TMDB_ACCESS_TOKEN: 'test',
      LOCAL_ENV_FILE: join(work, 'no-local.env'),
      ...env,
    },
  })
}
const log = (name: string) =>
  existsSync(join(work, name)) ? readFileSync(join(work, name), 'utf8') : ''
const lines = (name: string) => log(name).split('\n').filter(Boolean).sort()
const newTag = () => /--tag watchlist-backend:(\d{14}) /.exec(log('docker.log'))![1]

describe('deploy.sh: HTTPS', () => {
  it('makes the certificate with mkcert for watchlist.local the first time, before anything is built', () => {
    const result = run()

    expect(result.status).toBe(0)
    expect(log('mkcert.log')).toContain('watchlist.local')
    expect(result.stdout).toContain(
      'Created the watchlist-tls Secret with a certificate for watchlist.local.',
    )
    expect(log('calls.log')).toContain(
      '-n watchlist-roulette create secret tls watchlist-tls --cert',
    )
    const calls = log('calls.log')
    expect(calls.indexOf('create secret tls')).toBeLessThan(calls.indexOf('docker build'))
    expect(log('created-all.yaml')).toContain('tls.crt: CERTIFICATE-')
  })

  it('never leaves the key anywhere: not in a command line, the output, or a file that stays behind', () => {
    const result = run()

    const key = readFileSync(join(work, 'mkcert-files'), 'utf8').split('\n').filter(Boolean)[1]!
    expect(existsSync(key)).toBe(false)
    expect(existsSync(key.replace(/tls\.key$/, ''))).toBe(false)
    const keyText = /tls\.key: (PRIVATE-KEY-\d+)/.exec(log('created-all.yaml'))![1]!
    expect(
      result.stdout + result.stderr + log('calls.log') + log('docker.log') + log('mkcert.log'),
    ).not.toContain(keyText)
  })

  it('stops before building, creates no Secret and leaves no temporary directory when mkcert cannot make the certificate', () => {
    const result = run({ FAKE_MKCERT_FAILS: '1' })

    expect(result.status).not.toBe(0)
    expect(result.stderr).toContain('mkcert could not make a certificate for watchlist.local.')
    expect(log('docker.log')).not.toContain('build')
    expect(log('created-all.yaml')).not.toContain('watchlist-tls')
    for (const file of log('mkcert-files').split('\n').filter(Boolean))
      expect({ file, exists: existsSync(file) }).toEqual({ file, exists: false })
  })

  it('keeps an existing Secret, without needing mkcert at all', () => {
    const result = run({ TLS_SECRET_EXIT: '0' }, { withoutMkcert: true })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain('The watchlist-tls Secret exists and is kept.')
    expect(log('calls.log')).not.toContain('create secret tls')
  })

  it('stops with the install commands, before building, when mkcert is missing, and installs nothing itself', () => {
    const result = run({}, { withoutMkcert: true })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('brew install mkcert && mkcert -install')
    expect(log('docker.log')).not.toContain('build')
    expect(log('applied-all.yaml')).not.toContain('image:')
  })

  it('stops and asks for `mkcert -install` when mkcert has no certificate authority yet', () => {
    const result = run({ FAKE_NO_CA: '1' })

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('mkcert -install')
    expect(log('docker.log')).not.toContain('build')
    expect(log('mkcert.log')).not.toContain('watchlist.local')
  })

  it("checks https://watchlist.local:8443 against mkcert's own authority, and says where to open the app", () => {
    const result = run()

    expect(result.status).toBe(0)
    const curl = log('curl.log')
    expect(curl).toContain(`--cacert ${join(work, 'ca', 'rootCA.pem')}`)
    expect(curl).toContain(
      '--resolve watchlist.local:8443:127.0.0.1 https://watchlist.local:8443/health',
    )
    expect(result.stdout).toContain('Open https://watchlist.local:8443')
  })

  it('reminds you of CORS_ORIGIN only when the local file does not name the HTTPS address', () => {
    const without = run()
    expect(without.stdout).toContain(
      'add CORS_ORIGIN=http://watchlist.local,https://watchlist.local:8443 to',
    )

    const file = join(work, 'local.env')
    writeFileSync(file, 'CORS_ORIGIN=http://watchlist.local,https://watchlist.local:8443\n')
    const withIt = run({ LOCAL_ENV_FILE: file })
    expect(withIt.stdout).toContain('Open https://watchlist.local:8443')
    expect(withIt.stdout).not.toContain('add CORS_ORIGIN=')
  })

  it('still succeeds, with a warning, when only the plain HTTP address answers', () => {
    writeExecutable(
      join(work, 'bin', 'curl'),
      '#!/bin/bash\ncase "$*" in *https://*) exit 60 ;; *) exit 0 ;; esac\n',
    )
    const result = run()

    expect(result.status).toBe(0)
    expect(result.stderr).toContain('The app is deployed and answers at http://watchlist.local')
    expect(result.stderr).toContain('mkcert -install')
    expect(result.stdout).not.toContain('Open https://')
  })

  it('does not take a commented-out or foreign line for the HTTPS origin in the local file', () => {
    const file = join(work, 'local.env')
    writeFileSync(
      file,
      '# CORS_ORIGIN=http://watchlist.local,https://watchlist.local:8443\nOTHER=https://watchlistXlocal:8443\n',
    )
    expect(run({ LOCAL_ENV_FILE: file }).stdout).toContain('add CORS_ORIGIN=')
  })

  it('stops with a hint when the HTTPS address never answers', () => {
    writeExecutable(join(work, 'bin', 'curl'), '#!/bin/bash\nexit 22\n')
    const result = run()

    expect(result.status).toBe(1)
    expect(result.stderr).toContain('https://watchlist.local:8443 did not answer')
    expect(result.stderr).toContain('mkcert -install')
  })
})

describe('deploy.sh: local overrides', () => {
  it('turns the file into the ConfigMap watchlist-local, before anything is built', () => {
    const file = join(work, 'local.env')
    writeFileSync(file, 'CORS_ORIGIN=http://localhost:8080\n')
    const result = run({ LOCAL_ENV_FILE: file })

    expect(result.status).toBe(0)
    expect(result.stdout).toContain(`Applied local overrides from ${file}.`)
    const calls = log('calls.log')
    expect(calls).toContain(
      `-n watchlist-roulette create configmap watchlist-local --from-env-file=${file}`,
    )
    expect(calls.indexOf('create configmap watchlist-local')).toBeLessThan(
      calls.indexOf('docker build'),
    )
  })

  it('removes a ConfigMap left over from an earlier deploy when there is no file', () => {
    const result = run({ LOCAL_ENV_FILE: join(work, 'missing.env') })

    expect(result.status).toBe(0)
    expect(log('calls.log')).toContain(
      '-n watchlist-roulette delete configmap watchlist-local --ignore-not-found',
    )
    expect(log('calls.log')).not.toContain('create configmap watchlist-local')
  })

  it('applies the ConfigMap after the namespace exists, and does not delete it when the file is there', () => {
    const file = join(work, 'local.env')
    writeFileSync(file, 'CORS_ORIGIN=http://localhost:8080\n')
    run({ LOCAL_ENV_FILE: file })

    const calls = log('calls.log')
    expect(calls.indexOf('apply -f k8s/namespace.yaml')).toBeGreaterThan(-1)
    expect(calls.indexOf('apply -f k8s/namespace.yaml')).toBeLessThan(
      calls.indexOf('create configmap watchlist-local'),
    )
    expect(calls).not.toContain('delete configmap watchlist-local')
  })

  it('is applied even when the file is empty (clears earlier overrides instead of keeping the old ConfigMap)', () => {
    const file = join(work, 'empty.env')
    writeFileSync(file, '')
    const result = run({ LOCAL_ENV_FILE: file })

    expect(result.status).toBe(0)
    expect(log('calls.log')).toContain('create configmap watchlist-local')
  })

  it('is git-ignored in its default place, so overrides never reach the repo', () => {
    const ignored = spawnSync('git', ['check-ignore', '-q', 'k8s/.env.local'], {
      cwd: join(k8sDir, '..'),
    })
    expect(ignored.status).toBe(0)
  })
})

describe('deploy.sh: old images and the node disk', () => {
  // "<ref> <digest>", like `ctr images ls`. Importing an image makes a second reference named sha256:… next to its tag,
  // with the same digest; two builds of the same content (the frontend, 20261010… and 20261014…) share one digest.
  const NODE_IMAGES = [
    'docker.io/library/watchlist-backend:20261001100000 sha256:d1',
    'sha256:ref-of-d1 sha256:d1',
    'docker.io/library/watchlist-backend:20261010100000 sha256:d2',
    'sha256:ref-of-d2 sha256:d2',
    'docker.io/library/watchlist-backend:20261014114253 sha256:d3',
    'sha256:ref-of-d3 sha256:d3',
    'docker.io/library/watchlist-frontend:20261001100000 sha256:d4',
    'sha256:ref-of-d4 sha256:d4',
    'docker.io/library/watchlist-frontend:20261010100000 sha256:d5',
    'docker.io/library/watchlist-frontend:20261014114253 sha256:d5',
    'sha256:ref-of-d5 sha256:d5',
    'docker.io/library/watchlist-backend:dev sha256:dev',
    'docker.io/library/dinner-planner:20261001100000 sha256:w1',
    'sha256:ref-of-w1 sha256:w1',
    'docker.io/library/postgres:17-alpine sha256:pg',
  ].join('\n')
  const HOST_IMAGES = [
    'watchlist-backend:20261001100000',
    'watchlist-frontend:20261001100000',
    'watchlist-backend:20261014114253',
    'postgres:17-alpine',
    'dinner-planner:20261001100000',
  ].join('\n')
  const env = { FAKE_NODE_IMAGES: NODE_IMAGES, FAKE_HOST_IMAGES: HOST_IMAGES }

  it('removes the old images of this project from the node and the host after the new version runs, and nothing else', () => {
    const result = run(env)

    expect(result.status).toBe(0)
    // The tags, and the second reference of every image that no kept tag shares a digest with (d1, d2, d4; not d3 and d5).
    expect(lines('removed-node')).toEqual([
      'docker.io/library/watchlist-backend:20261001100000',
      'docker.io/library/watchlist-backend:20261010100000',
      'docker.io/library/watchlist-frontend:20261001100000',
      'docker.io/library/watchlist-frontend:20261010100000',
      'sha256:ref-of-d1',
      'sha256:ref-of-d2',
      'sha256:ref-of-d4',
    ])
    expect(lines('removed-host')).toEqual([
      'watchlist-backend:20261001100000',
      'watchlist-frontend:20261001100000',
    ])
    expect(result.stdout).toContain(
      'Removed docker.io/library/watchlist-backend:20261001100000 from the node.',
    )
    expect(result.stdout).toContain('Removed sha256:ref-of-d1 from the node.')
  })

  it('keeps the second reference of an image that a kept tag still shares', () => {
    run(env)

    // d5 is the digest of the frontend tag that was removed (20261010…) and of the one kept (20261014…).
    expect(log('removed-node')).not.toContain('sha256:ref-of-d5')
    expect(log('removed-node')).not.toContain('sha256:ref-of-d3')
  })

  it('keeps the new tag, the tag the app ran before, and every tag a pod uses, on the node and the host', () => {
    run({
      ...env,
      PODS_IMAGES:
        'watchlist-backend:20261010100000\nwatchlist-frontend:20261010100000\npostgres:17-alpine\n',
    })

    const removed = `${log('removed-node')}${log('removed-host')}`
    expect(removed).not.toContain('20261014114253')
    expect(removed).not.toContain('20261010100000')
    expect(removed).not.toContain('sha256:ref-of-d2')
    expect(removed).toContain('watchlist-backend:20261001100000')
    // The new images are in the node's list (imported) and the host's (built), and are not removed.
    expect(log('imported')).toContain(`watchlist-backend:${newTag()}`)
    expect(log('imported')).toContain(`watchlist-frontend:${newTag()}`)
    expect(removed).not.toContain(newTag())
    expect(removed).not.toContain('sha256:imported')
  })

  it('keeps the tag each Deployment ran before, even when the two differ', () => {
    run({
      ...env,
      DEPLOYED_BACKEND_IMAGE: 'watchlist-backend:20261010100000',
      DEPLOYED_FRONTEND_IMAGE: 'watchlist-frontend:20261001100000',
    })

    const removed = `${log('removed-node')}${log('removed-host')}`
    expect(removed).not.toContain('20261010100000')
    expect(removed).not.toContain('20261001100000')
    expect(removed).toContain('watchlist-backend:20261014114253')
  })

  it("never touches another project's image, an image without a timestamp tag, or the postgres image", () => {
    run(env)

    const removed = `${log('removed-node')}${log('removed-host')}`
    for (const kept of [
      'dinner-planner',
      'ref-of-w1',
      'postgres',
      'watchlist-backend:dev',
      'sha256:dev',
      'sha256:pg',
    ]) {
      expect(removed).not.toContain(kept)
    }
  })

  it('removes nothing before the rollout has succeeded, and nothing when it fails', () => {
    const failed = run({ ...env, FAIL_ROLLOUT: '1' })

    expect(failed.status).toBe(1)
    expect(log('removed-node')).toBe('')
    expect(log('removed-host')).toBe('')

    rmSync(join(work, 'docker.log'), { force: true })
    rmSync(join(work, 'calls.log'), { force: true })
    run(env)
    const calls = log('calls.log')
    expect(calls.indexOf('rollout status deployment/')).toBeGreaterThan(-1)
    expect(calls.indexOf('images rm')).toBeGreaterThan(
      calls.lastIndexOf('rollout status deployment/'),
    )
  })

  it('only warns when an image cannot be removed: the deploy still succeeds', () => {
    const result = run({ ...env, FAIL_RM: '1' })

    expect(result.status).toBe(0)
    expect(result.stderr).toContain(
      'Warning: could not remove docker.io/library/watchlist-backend:20261001100000 from the node.',
    )
    expect(result.stderr).toContain(
      'Warning: could not remove watchlist-backend:20261001100000 from the host.',
    )
    expect(result.stdout).toContain('Open https://watchlist.local:8443')
  })

  it.each([
    ['the pods cannot be read', { FAIL_PODS: '1' }],
    ['a Deployment cannot be read', { FAIL_DEPLOY_GET: '1' }],
  ])(
    'removes nothing when %s, since it cannot tell what a pod might need (and still deploys)',
    (_what, fail) => {
      const result = run({ ...env, ...fail })

      expect(result.status).toBe(0)
      expect(log('removed-node')).toBe('')
      expect(log('removed-host')).toBe('')
      expect(result.stderr).toContain(
        'could not tell which images are in use, so no old images were removed',
      )
    },
  )

  it('has no rollback tag on the first deploy (nothing answers) and still removes only stale ones', () => {
    const result = run({ ...env, DEPLOYED_BACKEND_IMAGE: '', DEPLOYED_FRONTEND_IMAGE: '' })

    expect(result.status).toBe(0)
    expect(log('removed-node')).not.toContain('dinner-planner')
    expect(log('removed-node')).toContain('watchlist-backend:20261014114253')
    expect(log('removed-node')).not.toContain(newTag())
  })

  it('reads the node and the previous tags before it applies anything, and only talks to docker-desktop and that node', () => {
    run(env)

    const calls = log('calls.log').split('\n').filter(Boolean)
    const first = (needle: string) => calls.findIndex((c) => c.includes(needle))
    expect(first('get deployment backend -o jsonpath')).toBeGreaterThan(-1)
    expect(first('get nodes -o jsonpath')).toBeLessThan(first('apply -f'))
    expect(first('get deployment frontend -o jsonpath')).toBeLessThan(first('apply -f'))
    for (const call of calls.filter((c) => !c.startsWith('docker ')))
      expect(call).toMatch(/^--context docker-desktop /)
    for (const call of calls.filter((c) => c.startsWith('docker exec')))
      expect(call).toContain(' desktop-control-plane ')
  })

  describe('free space', () => {
    it.each([
      ['exactly 2 GiB', '2097152', false],
      ['one KiB under 2 GiB', '2097151', true],
    ])('with %s free, removes old images first: %s', (_what, free, prunes) => {
      const result = run({ ...env, FAKE_FREE_KB: free, FAKE_FREE_AFTER_KB: '5000000' })

      expect(result.status).toBe(0)
      const calls = log('calls.log')
      expect(
        calls.includes('images rm') && calls.indexOf('images rm') < calls.indexOf('docker build'),
      ).toBe(prunes)
    })

    it('stops when it removed images but the free space can no longer be read', () => {
      const result = run({ ...env, FAKE_FREE_KB: '500000', FAKE_FREE_AFTER_KB: '-' })

      expect(result.status).toBe(1)
      expect(result.stderr).toContain('Not enough disk space on the node')
      expect(log('docker.log')).not.toContain('build')
    })

    it('is checked on the node before anything is built, and does not stop a deploy with room', () => {
      const result = run({ ...env, FAKE_FREE_KB: '5000000' })

      expect(result.status).toBe(0)
      const calls = log('calls.log')
      expect(calls.indexOf('df -Pk /')).toBeGreaterThan(-1)
      expect(calls.indexOf('df -Pk /')).toBeLessThan(calls.indexOf('docker build'))
      // Nothing is removed before the build when there is room.
      expect(calls.indexOf('images rm')).toBeGreaterThan(calls.indexOf('docker build'))
    })

    it('removes the old images first when the node is nearly full, and carries on when that is enough', () => {
      const result = run({ ...env, FAKE_FREE_KB: '500000', FAKE_FREE_AFTER_KB: '5000000' })

      expect(result.status).toBe(0)
      expect(result.stdout).toContain('Only 488 MB are free on the node')
      expect(result.stdout).toContain('MB are free now.')
      const calls = log('calls.log')
      expect(calls.indexOf('images rm')).toBeLessThan(calls.indexOf('docker build'))
      expect(log('removed-node')).not.toContain('20261014114253')
    })

    it('keeps the rollback tag and the tags pods use when it removes images before the build, on the node and the host', () => {
      run({
        ...env,
        FAKE_FREE_KB: '500000',
        FAKE_FREE_AFTER_KB: '5000000',
        PODS_IMAGES: 'watchlist-backend:20261010100000\nwatchlist-frontend:20261010100000\n',
      })

      const beforeBuild = log('calls.log').slice(0, log('calls.log').indexOf('docker build'))
      expect(beforeBuild).toContain('images rm')
      const removed = `${log('removed-node')}${log('removed-host')}`
      expect(removed).not.toContain('20261014114253')
      expect(removed).not.toContain('20261010100000')
      expect(removed).toContain('20261001100000')
    })

    it('does not remove anything before the build when it cannot tell what is in use, and then stops if the space is short', () => {
      const result = run({
        ...env,
        FAKE_FREE_KB: '500000',
        FAKE_FREE_AFTER_KB: '5000000',
        FAIL_PODS: '1',
      })

      expect(result.status).toBe(1)
      expect(log('removed-node')).toBe('')
      expect(result.stderr).toContain('could not tell which images are in use')
      expect(result.stderr).toContain('Not enough disk space on the node')
    })

    it('stops before building and says what to free by hand when removing the old images is not enough', () => {
      const result = run({ ...env, FAKE_FREE_KB: '500000', FAKE_FREE_AFTER_KB: '800000' })

      expect(result.status).toBe(1)
      expect(result.stderr).toContain(
        'Not enough disk space on the node: 781 MB free, 2048 MB needed. Nothing was deployed.',
      )
      expect(result.stderr).toContain('docker builder prune')
      expect(result.stderr).toContain('docker volume ls')
      expect(log('docker.log')).not.toContain('build')
      // No manifest with an image was applied (only what comes before: the namespace and the Secrets).
      expect(log('applied-all.yaml')).not.toContain('image:')
    })

    it('does not stop a deploy when the free space cannot be read', () => {
      const result = run({ ...env, FAKE_FREE_KB: '-' })

      expect(result.status).toBe(0)
      expect(log('docker.log')).toContain('build --tag watchlist-backend:')
    })
  })
})

describe('image-cleanup.sh functions', () => {
  const bash = (code: string, input: string) =>
    spawnSync('bash', ['-c', `source "${join(k8sDir, 'image-cleanup.sh')}"; ${code}`], {
      encoding: 'utf8',
      input,
    })
      .stdout.split('\n')
      .filter(Boolean)

  describe('orphan_refs', () => {
    const orphans = (digests: string[], listing: string[]) =>
      bash(
        `orphan_refs ${digests.join(' ')}`,
        ['REF TYPE DIGEST SIZE', ...listing].join('\n') + '\n',
      )

    it('selects the sha256 reference of a removed digest that no tag shares, and only that', () => {
      expect(
        orphans(
          ['sha256:a', 'sha256:b'],
          [
            'sha256:one idx sha256:a 1MiB',
            'sha256:two idx sha256:b 1MiB',
            'watchlist-backend:x idx sha256:b 1MiB',
            'sha256:three idx sha256:c 1MiB',
            'docker.io/library/postgres:17 idx sha256:a 1MiB',
          ],
        ),
      ).toEqual([])
      expect(
        orphans(['sha256:a'], ['sha256:one idx sha256:a 1MiB', 'sha256:three idx sha256:c 1MiB']),
      ).toEqual(['sha256:one'])
    })
  })

  describe('stale_images', () => {
    const stale = (keep: string[], refs: string[]) =>
      bash(`stale_images ${keep.join(' ')}`, refs.join('\n') + '\n')

    it("keeps the tags it is given, and matches only this project's timestamp tags, with or without the registry prefix", () => {
      expect(
        stale(
          ['20261014114253'],
          [
            'watchlist-backend:20261001100000',
            'docker.io/library/watchlist-frontend:20261001100000',
            'watchlist-backend:20261014114253',
          ],
        ),
      ).toEqual([
        'watchlist-backend:20261001100000',
        'docker.io/library/watchlist-frontend:20261001100000',
      ])
    })

    it.each([
      'watchlist-backend:dev',
      'watchlist-backend:2026100110000',
      'watchlist-backend:202610011000001',
      'watchlist-backend:2026100110000a',
      'watchlist-backend-seed:20261001100000',
      'my-watchlist-backend:20261001100000',
      'registry.example.com/watchlist-backend:20261001100000',
      'dinner-planner:20261001100000',
      'time-tracking-backend:20261001100000',
      'postgres:17-alpine',
    ])('never selects %s', (ref) => {
      expect(stale([], [ref])).toEqual([])
    })

    it('selects everything stale when it is given no tag', () => {
      expect(stale([], ['watchlist-backend:20261001100000'])).toEqual([
        'watchlist-backend:20261001100000',
      ])
    })
  })
})
