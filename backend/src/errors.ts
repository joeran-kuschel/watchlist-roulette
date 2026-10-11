export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
  }
}

export const notFound = (what = 'Film') => new HttpError(404, `${what} not found`)

const UNIQUE_VIOLATION = '23505'
export const isUniqueViolation = (error: unknown) => (error as { code?: string } | null)?.code === UNIQUE_VIOLATION
