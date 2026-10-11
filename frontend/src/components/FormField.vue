<script setup lang="ts">
import { computed } from 'vue'
import AppIcon from './AppIcon.vue'

const props = defineProps<{
  id: string
  label: string
  hint?: string
  error?: string
  required?: boolean
}>()

const hintId = computed(() => `${props.id}-hint`)
const errorId = computed(() => `${props.id}-error`)
const describedBy = computed(
  () => [props.hint && hintId.value, props.error && errorId.value].filter(Boolean).join(' ') || undefined,
)
// Spread onto the control in the slot
const attrs = computed(() => ({
  id: props.id,
  'aria-describedby': describedBy.value,
  'aria-invalid': props.error ? (true as const) : undefined,
}))
</script>

<template>
  <div class="field">
    <label class="field__label" :for="id"
      >{{ label }}<span v-if="required" class="field__hint"> (required)</span></label
    >
    <span v-if="hint" :id="hintId" class="field__hint">{{ hint }}</span>
    <slot :attrs="attrs" />
    <p v-if="error" :id="errorId" class="field__error">
      <AppIcon name="alert" :size="16" />{{ error }}
    </p>
  </div>
</template>
