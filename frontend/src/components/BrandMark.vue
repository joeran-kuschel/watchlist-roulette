<script setup lang="ts">
// The "film ring": a ring of film perforations around a dot (the pick). Concept C in documentation/ui/branding.md.
// The ring takes the text color, the dot the accent color.
defineProps<{ size?: number }>()
</script>

<template>
  <svg
    aria-hidden="true"
    focusable="false"
    :width="size ?? 32"
    :height="size ?? 32"
    viewBox="0 0 64 64"
  >
    <circle
      cx="32"
      cy="32"
      r="24"
      fill="none"
      stroke="currentColor"
      stroke-width="8"
      stroke-dasharray="8.8 3.77"
    />
    <circle cx="32" cy="32" r="10" fill="var(--accent)" />
  </svg>
</template>
