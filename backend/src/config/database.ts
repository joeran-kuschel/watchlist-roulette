import pg from 'pg'
import type { Pool, PoolClient, QueryResultRow } from 'pg'

let pool: Pool | undefined

export function getPool(): Pool {
  if (!pool) {
    pool = new pg.Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    })
    // an idle client dropped by a database restart must not crash the process
    pool.on('error', (error) => console.error('Idle database client failed:', error.message))
  }
  return pool
}

/** Replaces the shared pool (used by tests). */
export function setPool(next: Pool): void {
  pool = next
}

export type Db = Pick<Pool | PoolClient, 'query'>

export async function query<R extends QueryResultRow>(
  sql: string,
  params: unknown[] = [],
  db: Db = getPool(),
): Promise<R[]> {
  return (await db.query<R>(sql, params)).rows
}

export async function withTransaction<T>(work: (db: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect()
  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK')
    throw error
  } finally {
    client.release()
  }
}

// DATE columns stay plain 'YYYY-MM-DD' strings and NUMERIC columns become numbers
pg.types.setTypeParser(1082, (value) => value)
pg.types.setTypeParser(1700, (value) => Number(value))
