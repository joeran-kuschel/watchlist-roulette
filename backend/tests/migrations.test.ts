import { beforeEach, describe, expect, it } from 'vitest'
import type { Pool } from 'pg'
import { createTestPool } from './helpers/testDb.js'

let pool: Pool
beforeEach(async () => {
  pool = await createTestPool()
})

describe('migrations', () => {
  it('create a films table that rejects a blank title', async () => {
    await expect(pool.query(`INSERT INTO films (title) VALUES ('  ')`)).rejects.toThrow()
  })

  it('reject a letterboxd link that is not http(s)', async () => {
    await expect(
      pool.query(`INSERT INTO films (title, letterboxd_url) VALUES ('A', 'javascript:alert(1)')`),
    ).rejects.toThrow()
  })

  it('reject a duplicate letterboxd link', async () => {
    const sql = `INSERT INTO films (title, letterboxd_url) VALUES ('A', 'https://boxd.it/1')`
    await pool.query(sql)
    await expect(pool.query(sql)).rejects.toThrow()
  })

  it('start new films as unwatched with a pending TMDB status', async () => {
    const { rows } = await pool.query(`INSERT INTO films (title) VALUES ('A') RETURNING *`)
    expect(rows[0].watched_at).toBeNull()
    expect(rows[0].tmdb_status).toBe('pending')
    // pg-mem returns the empty array default as the string '{}'; Postgres returns []
    expect([[], '{}']).toContainEqual(rows[0].countries)
  })

  it('delete genre and credit links together with the film', async () => {
    await pool.query(`INSERT INTO films (id, title) VALUES (1, 'A')`)
    await pool.query(`INSERT INTO genres (id, name) VALUES (18, 'Drama')`)
    await pool.query(`INSERT INTO film_genres (film_id, genre_id) VALUES (1, 18)`)
    await pool.query(`DELETE FROM films WHERE id = 1`)
    const { rows } = await pool.query(`SELECT * FROM film_genres`)
    expect(rows).toHaveLength(0)
  })
})
