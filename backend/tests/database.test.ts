import { afterEach, expect, it, vi } from 'vitest'

afterEach(() => vi.resetModules())

it('handles errors of idle pool clients instead of crashing the process', async () => {
  const { getPool } = await import('../src/config/database.js')
  const pool = getPool()
  const log = vi.spyOn(console, 'error').mockImplementation(() => {})
  expect(() => pool.emit('error', new Error('terminating connection'))).not.toThrow()
  expect(log).toHaveBeenCalled()
  await pool.end()
})
