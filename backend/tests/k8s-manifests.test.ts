import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { loadAll } from 'js-yaml'
import { describe, expect, it } from 'vitest'

const k8sDir = join(import.meta.dirname, '../../k8s')
const migrationsDir = join(import.meta.dirname, '../migrations')

type Doc = {
  kind: string
  metadata: { name: string; namespace?: string; annotations?: Record<string, string> }
  data?: Record<string, string>
  spec?: any
}

const read = (file: string) => readFileSync(join(k8sDir, file), 'utf8')
const docs = (file: string) => loadAll(read(file)) as Doc[]
const yamlFiles = readdirSync(k8sDir).filter((f) => f.endsWith('.yaml') && f !== 'kustomization.yaml')
const all = yamlFiles.flatMap((file) => docs(file).map((doc) => ({ file, doc })))
const find = (kind: string, name: string) => all.find((d) => d.doc.kind === kind && d.doc.metadata.name === name)?.doc as Doc

describe('k8s manifests', () => {
  it('are all valid YAML with a kind and a name', () => {
    for (const { doc } of all) {
      expect(doc.kind).toBeTruthy()
      expect(doc.metadata.name).toBeTruthy()
    }
  })

  it('are listed in the kustomization, which sets the namespace', () => {
    const [kustomization] = docs('kustomization.yaml') as unknown as { namespace: string; resources: string[] }[]
    expect([...kustomization!.resources].sort()).toEqual([...yamlFiles].sort())
    expect(kustomization!.namespace).toBe('watchlist-roulette')
    expect(find('Namespace', 'watchlist-roulette')).toBeTruthy()
  })

  it('contain no Secret: passwords and tokens are created by deploy.sh', () => {
    expect(all.filter(({ doc }) => doc.kind === 'Secret')).toEqual([])
    expect(yamlFiles.map(read).join('\n')).not.toMatch(/password:|PASSWORD: ?\S|TMDB_ACCESS_TOKEN: ?\S/i)
  })

  it('carry the init scripts exactly as they are in backend/migrations', () => {
    const configMap = find('ConfigMap', 'postgres-init-scripts')
    const files = readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'))
    expect(Object.keys(configMap.data!).sort()).toEqual(files.sort())
    for (const file of files) {
      expect(configMap.data![file], `${file} differs: run k8s/generate-init-scripts.sh`).toBe(
        readFileSync(join(migrationsDir, file), 'utf8'),
      )
    }
  })

  it('run our images from the node store, never pulling them', () => {
    for (const name of ['backend', 'frontend']) {
      const container = find('Deployment', name).spec.template.spec.containers[0]
      expect(container.image).toMatch(/^watchlist-(backend|frontend):dev$/)
      expect(container.imagePullPolicy).toBe('Never')
      expect(container.resources.limits).toBeTruthy()
    }
  })

  it('give each Service the selector and port of its Deployment', () => {
    const ports: Record<string, number> = { backend: 3000, frontend: 80, postgres: 5432 }
    for (const [name, port] of Object.entries(ports)) {
      const deployment = find('Deployment', name)
      const service = find('Service', name)
      expect(service.spec.selector).toEqual(deployment.spec.template.metadata.labels)
      expect(service.spec.ports[0].port).toBe(port)
      expect(deployment.spec.template.spec.containers.at(-1).ports[0].containerPort).toBe(port)
      expect(service.spec.type).toBe('ClusterIP')
    }
  })

  it('keep the database on a volume and let only one postgres pod use it', () => {
    const deployment = find('Deployment', 'postgres')
    expect(deployment.spec.strategy.type).toBe('Recreate')
    expect(find('PersistentVolumeClaim', 'postgres-pvc').spec.accessModes).toEqual(['ReadWriteOnce'])
    const mounts = deployment.spec.template.spec.containers[0].volumeMounts.map((m: any) => m.mountPath)
    expect(mounts).toContain('/var/lib/postgresql/data')
    expect(mounts).toContain('/docker-entrypoint-initdb.d')
  })

  it('read the database login from the watchlist-db Secret that deploy.sh creates', () => {
    const keys = (container: any) =>
      container.env.filter((e: any) => e.valueFrom?.secretKeyRef?.name === 'watchlist-db').map((e: any) => e.valueFrom.secretKeyRef.key)
    const backend = find('Deployment', 'backend').spec.template.spec
    expect(keys(backend.containers[0])).toEqual(['DATABASE_URL'])
    expect(keys(backend.initContainers[0])).toEqual(['DATABASE_URL'])
    expect(keys(find('Deployment', 'postgres').spec.template.spec.containers[0]).sort()).toEqual([
      'POSTGRES_DB',
      'POSTGRES_PASSWORD',
      'POSTGRES_USER',
    ])
    const tmdb = backend.containers[0].env.find((e: any) => e.name === 'TMDB_ACCESS_TOKEN')
    expect(tmdb.valueFrom.secretKeyRef).toMatchObject({ name: 'watchlist-tmdb', optional: true })
  })

  it('run the backend as a non-root user and probe /health', () => {
    const container = find('Deployment', 'backend').spec.template.spec.containers[0]
    expect(container.securityContext).toMatchObject({ runAsNonRoot: true, allowPrivilegeEscalation: false })
    expect(container.livenessProbe.httpGet.path).toBe('/health')
    expect(container.readinessProbe.httpGet.path).toBe('/health')
  })

  it('point the frontend at the backend by its full service name', () => {
    const env = find('Deployment', 'frontend').spec.template.spec.containers[0].env
    expect(env).toContainEqual({ name: 'BACKEND_URL', value: 'http://backend.watchlist-roulette.svc.cluster.local:3000' })
  })
})

describe('ingress', () => {
  const ingress = find('Ingress', 'watchlist-roulette')
  const rule = ingress.spec.rules[0]

  it('serves watchlist.local through the shared nginx controller', () => {
    expect(ingress.spec.ingressClassName).toBe('nginx')
    expect(rule.host).toBe('watchlist.local')
  })

  it('allows CSV uploads above the backend limit of 5 MB', () => {
    expect(ingress.metadata.annotations!['nginx.ingress.kubernetes.io/proxy-body-size']).toBe('6m')
  })

  it('sends everything to the frontend, so the backend has no route of its own and is reached through nginx', () => {
    const routes = Object.fromEntries(rule.http.paths.map((p: any) => [p.path, p.backend.service.name]))
    expect(routes).toEqual({ '/': 'frontend' })
  })

  it('matches the CORS origin the backend allows writes from', () => {
    expect(find('ConfigMap', 'watchlist-config').data!.CORS_ORIGIN).toBe(`http://${rule.host}`)
  })
})

describe('network policy', () => {
  const policy = find('NetworkPolicy', 'backend-from-frontend')

  it('protects the backend pods and only restricts what comes in', () => {
    expect(policy.spec.podSelector).toEqual({ matchLabels: { app: 'backend' } })
    expect(policy.spec.policyTypes).toEqual(['Ingress'])
    expect(find('Deployment', 'backend').spec.template.metadata.labels.app).toBe('backend')
  })

  it('lets only the frontend pods in, on the backend port', () => {
    expect(policy.spec.ingress).toEqual([
      { from: [{ podSelector: { matchLabels: { app: 'frontend' } } }], ports: [{ port: 3000, protocol: 'TCP' }] },
    ])
    expect(find('Deployment', 'frontend').spec.template.metadata.labels.app).toBe('frontend')
    const port = find('Service', 'backend').spec.ports[0].targetPort
    expect(port).toBe(3000)
  })

  it('has no namespace or address rule that would let other callers in', () => {
    const [rule] = policy.spec.ingress
    for (const peer of rule.from) {
      expect(peer.namespaceSelector).toBeUndefined()
      expect(peer.ipBlock).toBeUndefined()
    }
  })

  it('does not select the database pods, and restricts nothing that goes out', () => {
    expect(find('Deployment', 'postgres').spec.template.metadata.labels.app).not.toBe('backend')
    expect(policy.spec.egress).toBeUndefined()
  })

  it('selects by labels that the kustomization does not change', () => {
    const [kustomization] = docs('kustomization.yaml') as unknown as { labels: { includeSelectors: boolean }[] }[]
    expect(kustomization!.labels.every((l) => l.includeSelectors === false)).toBe(true)
    expect(find('Deployment', 'backend').spec.selector.matchLabels).toEqual({ app: 'backend' })
    expect(find('Service', 'backend').spec.selector).toEqual({ app: 'backend' })
  })

  it('leaves the frontend open, which is the way in for the ingress', () => {
    const targets = all.filter(({ doc }) => doc.kind === 'NetworkPolicy').map(({ doc }) => doc.spec.podSelector)
    expect(targets).toHaveLength(2)
    expect(targets).toEqual(expect.arrayContaining([{ matchLabels: { app: 'backend' } }, { matchLabels: { app: 'postgres' } }]))
  })
})

describe('network policy for the database', () => {
  const policy = find('NetworkPolicy', 'postgres-from-backend')

  it('protects the database pods and only restricts what comes in', () => {
    expect(policy.spec.podSelector).toEqual({ matchLabels: { app: 'postgres' } })
    expect(policy.spec.policyTypes).toEqual(['Ingress'])
    expect(policy.spec.egress).toBeUndefined()
    expect(find('Deployment', 'postgres').spec.selector.matchLabels).toEqual({ app: 'postgres' })
    expect(find('Deployment', 'postgres').spec.template.metadata.labels.app).toBe('postgres')
  })

  it('lets only the backend pods in, on the PostgreSQL port', () => {
    expect(policy.spec.ingress).toEqual([
      { from: [{ podSelector: { matchLabels: { app: 'backend' } } }], ports: [{ port: 5432, protocol: 'TCP' }] },
    ])
    expect(find('Service', 'postgres').spec.ports[0].targetPort).toBe(5432)
    expect(find('Deployment', 'backend').spec.template.metadata.labels.app).toBe('backend')
  })

  it('has no namespace or address rule that would let other callers in', () => {
    for (const peer of policy.spec.ingress[0].from) {
      expect(peer.namespaceSelector).toBeUndefined()
      expect(peer.ipBlock).toBeUndefined()
    }
  })

  it('keeps every script off the network: the database is only reached through kubectl exec', () => {
    const scripts = readdirSync(k8sDir).filter((f) => f.endsWith('.sh'))
    expect(scripts).toEqual(expect.arrayContaining(['backup-db.sh', 'restore-db.sh', 'db-common.sh']))
    for (const file of scripts) {
      const code = read(file)
        .split('\n')
        .filter((line) => !line.trim().startsWith('#'))
        .join('\n')
      // no way for a pod of ours or the Mac to open a connection to the database over the network
      expect(code, file).not.toMatch(/port-forward|\bkubectl\b(\s+-{1,2}[A-Za-z][\w-]*(=\S+)?(\s+[^\s-]\S*)?)*\s+(run|debug|attach)\b/)
      expect(code, file).not.toMatch(/\b(psql|pg_dump|pg_isready)\b[^\n|]*(\s-h[\s=]|--host|postgres(ql)?:\/\/)/)
    }
    expect(read('db-common.sh')).toMatch(/kubectl[^\n]* exec -i deploy\/postgres /)
  })

  it('has the backend as the only pod template that gets the database URL, so no other pod needs access', () => {
    const workloads = all.filter(({ doc }) => ['Deployment', 'Job', 'CronJob', 'StatefulSet', 'DaemonSet'].includes(doc.kind))
    const usesUrl = workloads
      .filter(({ doc }) => JSON.stringify(doc.spec).includes('DATABASE_URL'))
      .map(({ doc }) => doc.metadata.name)
    expect(usesUrl).toEqual(['backend'])
    // taking the whole Secret (envFrom) or one key of it would hand over the URL too
    const usesSecret = workloads
      .filter(({ doc }) => /"name":"watchlist-db"/.test(JSON.stringify(doc.spec)))
      .map(({ doc }) => doc.metadata.name)
    expect(usesSecret.sort()).toEqual(['backend', 'postgres'])
  })

  it('has the database wait in the backend pod (init container), where the policy lets it in', () => {
    const pod = find('Deployment', 'backend').spec.template.spec
    expect(pod.initContainers.map((c: any) => c.name)).toContain('wait-for-db')
  })

  it('has no pod other than the backend and the database labelled so that the two policies select it', () => {
    const labelled = (app: string) =>
      all
        .filter(({ doc }) => doc.spec?.template?.metadata?.labels?.app === app)
        .map(({ doc }) => doc.metadata.name)
    expect(labelled('postgres')).toEqual(['postgres'])
    expect(labelled('backend')).toEqual(['backend'])
  })

  it('points the database Service and the policy at the same pods and port as the connection string', () => {
    const service = find('Service', 'postgres')
    expect(service.spec.selector).toEqual(policy.spec.podSelector.matchLabels)
    expect(service.spec.ports[0].port).toBe(5432)
    expect(find('Deployment', 'postgres').spec.template.spec.containers[0].ports[0].containerPort).toBe(5432)
    expect(read('deploy.sh')).toContain('@postgres:5432/')
  })

  it('has both policies in network-policy.yaml, which the kustomization lists', () => {
    const names = docs('network-policy.yaml').map((d) => d.metadata.name)
    expect(names).toEqual(expect.arrayContaining(['backend-from-frontend', 'postgres-from-backend']))
  })
})
