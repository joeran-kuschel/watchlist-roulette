import { createApp } from './app.js'
import { getPool } from './config/database.js'
import { createTmdbClient } from './tmdb/client.js'
import { createEnricher } from './tmdb/enricher.js'

process.env.TZ = 'UTC'

const token = process.env.TMDB_ACCESS_TOKEN
const client = token ? createTmdbClient(token, process.env.TMDB_LANGUAGE ?? 'en-US') : null
if (!client) console.warn('TMDB_ACCESS_TOKEN is not set: films are not enriched with TMDB data.')
const enricher = createEnricher(client)

const app = createApp({ enricher, corsOrigin: process.env.CORS_ORIGIN })
const port = Number(process.env.PORT ?? 3000)
const server = app.listen(port, () => {
  console.log(`Backend listening on port ${port}`)
  void enricher.trigger()
})

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => void getPool().end().finally(() => process.exit(0)))
  })
}
