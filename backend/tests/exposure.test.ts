import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { load, loadAll } from 'js-yaml'
import { describe, expect, it } from 'vitest'

// The API has no login, so what is reachable from outside is decided by these files, not by the app.
const root = join(import.meta.dirname, '../..')
const read = (file: string) => readFileSync(join(root, file), 'utf8')
type Compose = { services: Record<string, { ports?: string[] }> }
const compose = (file: string) => load(read(file)) as Compose

describe('docker compose', () => {
  const base = compose('docker-compose.yml')

  it('publishes only the frontend, and only on this computer', () => {
    expect(base.services.postgres!.ports).toBeUndefined()
    expect(base.services.backend!.ports).toBeUndefined()
    expect(base.services.frontend!.ports).toEqual(['127.0.0.1:8080:80'])
  })

  it('has exactly these services, and the development file adds nothing but the backend port', () => {
    expect(Object.keys(base.services).sort()).toEqual(['backend', 'frontend', 'postgres'])
    const dev = compose('docker-compose.dev.yml')
    expect(Object.keys(dev.services.backend!)).toEqual(['ports'])
  })

  it('checks the merged development setup in CI', () => {
    expect(read('.github/workflows/ci.yml')).toContain(
      'docker compose -f docker-compose.yml -f docker-compose.dev.yml config --quiet',
    )
  })

  it('publishes the backend on this computer only in the development file', () => {
    const dev = compose('docker-compose.dev.yml')
    expect(Object.keys(dev.services)).toEqual(['backend'])
    expect(dev.services.backend!.ports).toEqual(['127.0.0.1:3000:3000'])
  })
})

describe('frontend nginx', () => {
  const template = read('frontend/nginx.conf.template')

  it('forwards /api and the health check to the backend', () => {
    expect(template).toMatch(/location \/api\/ \{[\s\S]*?proxy_pass \$backend\$request_uri;/)
    expect(template).toMatch(/location = \/health \{[\s\S]*?proxy_pass \$backend\/health;/)
  })

  // Only blocks with a name: a regex over the whole file could match text in another location
  const block = (header: string) => {
    const start = template.indexOf(header)
    expect(start, `${header} is missing`).toBeGreaterThan(-1)
    return template.slice(start, template.indexOf('\n  }', start))
  }

  it('forwards /health only as an exact match, so no other path leaks through it', () => {
    expect(template.match(/location\s*=?\s*\/health/g)).toHaveLength(1)
    expect(block('location = /health')).toContain('proxy_pass $backend/health;')
  })

  it('takes the backend address from BACKEND_URL in every proxied location, not a fixed host', () => {
    for (const header of ['location /api/ {', 'location = /health {']) {
      expect(block(header)).toContain('set $backend ${BACKEND_URL};')
    }
    expect(template).not.toMatch(/proxy_pass\s+https?:/)
  })

  it('still serves the app for every other path', () => {
    expect(block('location / {')).toContain('try_files $uri $uri/ /index.html;')
  })
})

describe('where the frontend finds the backend', () => {
  it('uses the Compose service name by default, and the full service name in Kubernetes', () => {
    expect(read('frontend/Dockerfile')).toContain('BACKEND_URL=http://backend:3000')
    const deployment = loadAll(read('k8s/frontend.yaml')).find((d: any) => d.kind === 'Deployment') as any
    const env = deployment.spec.template.spec.containers[0].env
    expect(env).toContainEqual({ name: 'BACKEND_URL', value: 'http://backend.watchlist-roulette.svc.cluster.local:3000' })
  })

  it('is what deploy.sh probes: the ingress host and /health, which nginx forwards', () => {
    const script = read('k8s/deploy.sh')
    expect(script).toMatch(/-H "Host: \$\{HOST\}" "http:\/\/127\.0\.0\.1\/health"/)
    expect(read('frontend/nginx.conf.template')).toContain('location = /health')
  })
})
