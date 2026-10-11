const dateFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
})

/** `2025-03-12` or an ISO timestamp -> `12 Mar 2025`. */
export const formatDate = (iso: string) => dateFormat.format(new Date(iso))

export const formatRuntime = (minutes: number | null) => (minutes === null ? null : `${minutes} min`)

/** A trimmed string from a form value; `v-model` on a number input yields a number, not text. */
export const text = (value: unknown) => String(value ?? '').trim()

export const joinNames = (people: { name: string }[]) => people.map((p) => p.name).join(', ')
