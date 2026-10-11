/** A DATE column as 'YYYY-MM-DD' (a string with the pg type parser, a Date in pg-mem). */
export const dateOnly = (value: string | Date) =>
  typeof value === 'string' ? value.slice(0, 10) : value.toISOString().slice(0, 10)
