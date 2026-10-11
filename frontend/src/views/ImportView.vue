<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { ApiError, applyImport, describeError, previewImport } from '../api'
import ErrorAlert from '../components/ErrorAlert.vue'
import FormField from '../components/FormField.vue'
import ImportSummary from '../components/ImportSummary.vue'
import type { ImportReport } from '../types'

const file = ref<File | null>(null)
const report = ref<ImportReport | null>(null)
const busy = ref(false)
const error = ref('')
const fileError = ref('')
const confirmRemoval = ref(false)
const confirmLarge = ref(false)
const heading = ref<HTMLElement | null>(null)

const hasRemovals = computed(() => (report.value?.removed.length ?? 0) > 0)
const needsLarge = computed(() => report.value?.requiresLargeRemovalConfirmation === true)
const canApply = computed(
  () =>
    report.value !== null &&
    !report.value.applied &&
    (!hasRemovals.value || confirmRemoval.value) &&
    (!needsLarge.value || confirmLarge.value),
)

function reset() {
  report.value = null
  error.value = ''
  confirmRemoval.value = false
  confirmLarge.value = false
}

function onFile(event: Event) {
  const input = event.target as HTMLInputElement
  file.value = input.files?.[0] ?? null
  fileError.value = ''
  reset()
}

async function showReport(next: ImportReport) {
  report.value = next
  await nextTick()
  heading.value?.focus()
}

async function check() {
  if (!file.value) {
    fileError.value = 'Choose a CSV file first.'
    return
  }
  reset()
  busy.value = true
  try {
    await showReport(await previewImport(file.value))
  } catch (e) {
    error.value = describeError(e)
  } finally {
    busy.value = false
  }
}

async function apply() {
  if (!file.value || !report.value || !canApply.value) return
  busy.value = true
  error.value = ''
  try {
    await showReport(
      await applyImport(file.value, {
        removalToken: hasRemovals.value ? report.value.removalToken : undefined,
        confirmLargeRemoval: needsLarge.value && confirmLarge.value,
      }),
    )
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      // The films to remove are no longer the ones that were shown, so nothing was changed
      reset()
      error.value = 'Your list or the file changed since the check, so nothing was imported. Check the file again.'
    } else {
      error.value = describeError(e)
    }
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <div class="page page--narrow">
    <h1>Import from CSV</h1>
    <p class="lead">
      Upload your Letterboxd export. Check the file first: nothing changes until you confirm. Rows that cannot be
      imported are listed, never skipped silently.
    </p>

    <form class="card import__form" novalidate @submit.prevent="check">
      <FormField
        id="csv"
        label="CSV file"
        hint="Columns: Date, Name, Year, Letterboxd URI"
        :error="fileError"
        v-slot="{ attrs }"
      >
        <input v-bind="attrs" type="file" accept=".csv,text/csv" @change="onFile" />
      </FormField>
      <div>
        <button class="btn btn--primary" type="submit" :disabled="busy">
          {{ busy && !report ? 'Checking…' : 'Check file' }}
        </button>
      </div>
    </form>

    <ErrorAlert v-if="error" :message="error" />

    <section v-if="report" class="import__result" aria-labelledby="result-heading">
      <h2 id="result-heading" ref="heading" tabindex="-1">
        {{ report.applied ? 'Import finished' : 'Check result' }}
      </h2>
      <p class="sr-only" role="status">
        {{ report.applied ? 'Import finished.' : 'Check finished. Nothing has been changed yet.' }}
      </p>
      <ImportSummary :report="report" />

      <form v-if="!report.applied" class="import__confirm" @submit.prevent="apply">
        <label v-if="hasRemovals" class="import__check">
          <input v-model="confirmRemoval" type="checkbox" />
          <span
            >I understand that {{ report.removed.length }}
            {{ report.removed.length === 1 ? 'film' : 'films' }} will be removed from my list.</span
          >
        </label>
        <label v-if="needsLarge" class="import__check">
          <input v-model="confirmLarge" type="checkbox" />
          <span>This removes more than half of my unwatched films. The file is correct.</span>
        </label>
        <div>
          <button class="btn btn--primary" type="submit" :disabled="!canApply || busy">
            {{ busy ? 'Importing…' : 'Import films' }}
          </button>
        </div>
      </form>
      <p v-else>
        <RouterLink to="/watchlist">Go to your watchlist</RouterLink>
      </p>
    </section>
  </div>
</template>

<style scoped>
.import__form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  margin-bottom: 24px;
}
.import__result {
  display: flex;
  flex-direction: column;
  gap: 20px;
  margin-top: 32px;
}
.import__result h2 {
  font-size: 1.625rem;
}
.import__confirm {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.import__check {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  min-height: var(--target);
}
.import__check input {
  width: 24px;
  height: 24px;
  margin: 0;
  flex: none;
  accent-color: var(--accent);
}
</style>
