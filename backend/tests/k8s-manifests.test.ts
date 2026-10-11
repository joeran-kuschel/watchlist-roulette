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

  it('sends /api and /health to the backend and everything else to the frontend', () => {
    const routes = Object.fromEntries(rule.http.paths.map((p: any) => [p.path, p.backend.service.name]))
    expect(routes).toEqual({ '/api': 'backend', '/health': 'backend', '/': 'frontend' })
  })

  it('matches the CORS origin the backend allows writes from', () => {
    expect(find('ConfigMap', 'watchlist-config').data!.CORS_ORIGIN).toBe(`http://${rule.host}`)
  })
})
