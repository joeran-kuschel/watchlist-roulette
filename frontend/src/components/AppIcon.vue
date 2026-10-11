<script setup lang="ts">
export type IconName =
  | 'spin'
  | 'eye'
  | 'eye-off'
  | 'pencil'
  | 'match'
  | 'plus'
  | 'left'
  | 'right'
  | 'x'
  | 'alert'

defineProps<{ name: IconName; size?: number }>()

const PATHS: Record<IconName, string> = {
  spin: 'M20 11a8 8 0 0 0-14.5-4.5L4 8M4 4v4h4M4 13a8 8 0 0 0 14.5 4.5L20 16M20 20v-4h-4',
  eye: 'M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  'eye-off':
    'M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.5 6.6C3.8 8.4 2 12 2 12s3.6 7 10 7a9.7 9.7 0 0 0 4.4-1M9.9 9.9a3 3 0 0 0 4.2 4.2',
  pencil: 'M4 20l1-4L16.5 4.5a2 2 0 0 1 3 3L8 19l-4 1z',
  match: 'M17 10.5a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0zM21 21l-5.2-5.2M8 10.5l2 2 3.5-4',
  plus: 'M12 5v14M5 12h14',
  left: 'M15 5l-7 7 7 7',
  right: 'M9 5l7 7-7 7',
  x: 'M6 6l12 12M18 6L6 18',
  alert: 'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0zM12 7.5v5M12 16v.5',
}
</script>

<template>
  <svg
    aria-hidden="true"
    focusable="false"
    :width="size ?? 24"
    :height="size ?? 24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path :d="PATHS[name]" />
  </svg>
</template>
