import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DataType, newDb } from 'pg-mem'
import type { Pool } from 'pg'
import { setPool } from '../../src/config/database.js'

const migrationsDir = join(import.meta.dirname, '../../migrations')

/** An in-memory Postgres with all migrations applied, installed as the app's pool. */
export async function createTestPool(): Promise<Pool> {
  const db = newDb()
  // pg-mem lacks btrim(); this stand-in matches Postgres for the whitespace case the schema relies on
  db.public.registerFunction({
    name: 'btrim',
    args: [DataType.text],
    returns: DataType.text,
    implementation: (value: string) => value.trim(),
  })
  const { Pool: MemPool } = db.adapters.createPg()
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    db.public.none(readFileSync(join(migrationsDir, file), 'utf8'))
  }
  const pool = new MemPool() as Pool
  setPool(pool)
  return pool
}
