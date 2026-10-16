<script setup lang="ts">
import { computed, onBeforeUnmount, ref } from 'vue'
import { ApiError, describeError, getTmdbCheck, startTmdbCheck } from '../api'
import type { TmdbCheck, TmdbCheckSummary } from '../types'
import ErrorAlert from './ErrorAlert.vue'

const emit = defineEmits<{ finished: [] }>()

const POLL_MS = 2000

const includeUnmatched = ref(true)
const running = ref(false)
const progress = ref('')
const notice = ref('')
const error = ref('')

let timer: ReturnType<typeof setTimeout> | undefined
let gone = false
onBeforeUnmount(() => {
  gone = true
  clearTimeout(timer)
})

function summarize(run: TmdbCheckSummary | null, total: number): string {
  // No new summary: the run did not reach its end (for example the backend restarted)
  if (!run) return 'The check did not finish. Try again.'
  if (total === 0 && !run.stopped) return 'Nothing to check: no film is waiting for TMDB.'
  const parts = [
    `${run.matched} matched`,
    `${run.notFound} not found`,
    `${run.ambiguous} ${run.ambiguous === 1 ? 'needs' : 'need'} review`,
  ]
  if (run.error > 0) parts.push(`${run.error} failed`)
  if (run.unreachable > 0) parts.push(`${run.unreachable} could not be reached`)
  const result = `TMDB check finished: ${parts.join(', ')}.`
  if (run.stopped === 'token') return `${result} It stopped early because TMDB rejected the access token.`
  if (run.stopped === 'tmdb') return `${result} It stopped early because TMDB is having trouble. Try again later.`
  return result
}

function fail(e: unknown) {
  // The API words TMDB problems for the user (for example "TMDB is not configured"); other errors get fixed text
  error.value = e instanceof ApiError && e.code === 'tmdb_unavailable' ? e.message : describeError(e)
  running.value = false
  progress.value = ''
  notice.value = ''
}

async function poll(previous: string | null) {
  if (gone) return
  let state: TmdbCheck
  try {
    state = await getTmdbCheck()
  } catch (e) {
    if (!gone) fail(e)
    return
  }
  if (gone) return
  if (state.running) {
    progress.value = `Checking… ${state.done} of ${state.total}`
    timer = setTimeout(() => void poll(previous), POLL_MS)
    return
  }
  running.value = false
  progress.value = ''
  // A summary that is the same as before means no new run has finished (the run did not start)
  notice.value = summarize(state.lastRun?.finishedAt === previous ? null : state.lastRun, state.total)
  emit('finished')
}

async function start() {
  if (running.value) return // a click while a check runs
  running.value = true
  error.value = ''
  notice.value = 'Checking TMDB…'
  progress.value = 'Checking…'
  let previous: string | null
  try {
    previous = (await getTmdbCheck()).lastRun?.finishedAt ?? null
    await startTmdbCheck(includeUnmatched.value)
  } catch (e) {
    notice.value = ''
    fail(e)
    return
  }
  void poll(previous)
}

const label = computed(() => (running.value ? progress.value : 'Check TMDB again'))
</script>

<template>
  <section class="tmdb-check" aria-labelledby="tmdb-check-heading">
    <h2 id="tmdb-check-heading">TMDB data</h2>
    <div class="tmdb-check__controls">
      <!-- aria-disabled, not disabled: a disabled button that has the focus loses it in Firefox and Safari -->
      <button class="btn" type="button" :aria-disabled="running ? 'true' : undefined" @click="start">{{ label }}</button>
      <label class="tmdb-check__option">
        <input v-model="includeUnmatched" type="checkbox" :disabled="running" />
        <span>Also retry films that were not found or need review</span>
      </label>
    </div>
    <ErrorAlert v-if="error" :message="error" />
    <p class="tmdb-check__notice" role="status">{{ notice }}</p>
  </section>
</template>

<style scoped>
h2 {
  font-size: 1.125rem;
  margin: 0 0 8px;
}
.tmdb-check {
  margin: 24px 0 0;
}
.tmdb-check__controls {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px 24px;
}
.tmdb-check__option {
  display: flex;
  gap: 12px;
  align-items: center;
  min-height: var(--target);
}
.tmdb-check__option input {
  width: 24px;
  height: 24px;
  margin: 0;
  flex: none;
  accent-color: var(--accent);
}
.tmdb-check__notice {
  margin: 8px 0 0;
  color: var(--text-soft);
}
.tmdb-check__notice:empty {
  margin: 0; /* stays in the page, so a screen reader notices when its text changes */
}
</style>
