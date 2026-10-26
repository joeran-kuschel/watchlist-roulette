<script setup lang="ts">
import { computed, nextTick, ref } from 'vue'
import { ApiError, applyImport, describeError, previewImport } from '../api'
import ErrorAlert from '../components/ErrorAlert.vue'
import FormField from '../components/FormField.vue'
import ImportSummary from '../components/ImportSummary.vue'
import { formatFileSize } from '../format'
import type { ImportReport } from '../types'

const file = ref<File | null>(null)
const report = ref<ImportReport | null>(null)
const busy = ref(false)
const error = ref('')
const fileError = ref('')
const confirmRemoval = ref(false)
const confirmLarge = ref(false)
const heading = ref<HTMLElement | null>(null)
// Said aloud by a status region: the chosen file, or why a dropped file was refused
const announcement = ref('')
const dragging = ref(false)
const input = ref<HTMLInputElement | null>(null)

// Cleared first: a status region does not repeat text that did not change, and the same refusal can come twice
async function say(message: string) {
  announcement.value = ''
  await nextTick()
  announcement.value = message
}

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

function chooseFile(next: File | null) {
  file.value = next
  fileError.value = ''
  if (next) void say(`Chosen file: ${next.name} (${formatFileSize(next.size)})`)
  else announcement.value = ''
  reset()
}

const waitMessage = 'Wait until the check or import has finished before choosing another file.'

function onFile(event: Event) {
  const target = event.target as HTMLInputElement
  if (busy.value) {
    // A request for the file shown is still running: its result must not end up next to another name
    target.value = ''
    void say(waitMessage)
    return
  }
  chooseFile(target.files?.[0] ?? null)
}

const isCsv = (f: File) => /\.csv$/i.test(f.name) || f.type === 'text/csv'

// Dropping is a convenience; the file input stays the way that works for everyone (WCAG 2.5.7)
function onDrop(event: DragEvent) {
  dragging.value = false
  if (busy.value) {
    if (carriesFiles(event)) void say(waitMessage)
    return
  }
  const files = [...(event.dataTransfer?.files ?? [])]
  if (files.length === 0) return // dragged text or a link, not a file
  const refusal =
    files.length > 1 ? 'Drop one CSV file at a time.' : !isCsv(files[0]!) ? 'That is not a CSV file.' : ''
  if (refusal) {
    fileError.value = refusal
    void say(refusal)
  } else {
    // So that choosing the file that was there before with the button fires a change event again
    if (input.value) input.value.value = ''
    chooseFile(files[0]!)
  }
}

// Dragged text or a link is no reason to show the drop state; a missing type list (not a real drag) counts as files
const carriesFiles = (event: DragEvent) => {
  const types = event.dataTransfer?.types
  return !types || [...types].includes('Files')
}

function onDragOver(event: DragEvent) {
  if (!busy.value && carriesFiles(event)) dragging.value = true
}

// dragleave also fires when the pointer moves onto a child of the box
function onDragLeave(event: DragEvent) {
  if (!(event.currentTarget as Node).contains(event.relatedTarget as Node | null)) dragging.value = false
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
      Upload a Letterboxd or IMDb export. Check the file first: nothing changes until you confirm. Rows that cannot be
      imported are listed, never skipped silently.
    </p>

    <form class="card import__form" novalidate @submit.prevent="check">
      <FormField
        id="csv"
        label="CSV file"
        hint="Letterboxd: Date, Name, Year, Letterboxd URI. IMDb: Const, Title, Year, Created, URL"
        :error="fileError"
        v-slot="{ attrs }"
      >
        <div
          class="filepick"
          :class="{ 'filepick--over': dragging }"
          @dragenter.prevent="onDragOver"
          @dragover.prevent="onDragOver"
          @dragleave="onDragLeave"
          @drop.prevent="onDrop"
        >
          <input
            v-bind="attrs"
            ref="input"
            class="sr-only"
            type="file"
            accept=".csv,text/csv"
            :aria-describedby="[attrs['aria-describedby'], 'csv-name'].filter(Boolean).join(' ')"
            @change="onFile"
          />
          <!-- A second label for the input: its visible text becomes part of the input's name, so voice control
               can say what it sees (WCAG 2.5.3). The name is then "CSV file Choose CSV file" -->
          <label class="btn filepick__button" for="csv">Choose CSV file</label>
          <span id="csv-name" class="filepick__name">{{ file?.name ?? 'No file chosen' }}</span>
          <span class="filepick__drop" aria-hidden="true">{{
            dragging ? 'Drop to choose this file' : 'or drop a CSV file here'
          }}</span>
        </div>
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

    <p class="sr-only import__chosen" role="status">{{ announcement }}</p>
  </div>
</template>

<style scoped>
.filepick {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border: 2px dashed var(--border-strong);
  border-radius: var(--radius);
}
/* The border turns solid and the hint text changes, so the state is not shown by color alone */
.filepick--over {
  border-style: solid;
  border-color: var(--accent);
  background: var(--surface-2);
}
.filepick__drop {
  flex-basis: 100%;
  color: var(--text-soft);
  font-size: 0.875rem;
}
.filepick__button {
  flex: none;
}
/* The input is visually hidden, so its own focus ring is clipped: the same ring is drawn on the button instead */
.filepick input:focus-visible + .filepick__button {
  outline: 3px solid var(--focus);
  outline-offset: 2px;
}
.filepick__name {
  min-width: 0;
  overflow-wrap: anywhere;
}
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
