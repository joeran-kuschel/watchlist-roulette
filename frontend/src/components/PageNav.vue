<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'
import IconButton from './IconButton.vue'

defineProps<{
  /** The accessible name; two pagers on one screen need different names */
  label: string
  text: string
  page: number
  pageCount: number
  to: (page: number) => RouteLocationRaw
}>()
</script>

<template>
  <nav class="page-nav" :aria-label="label">
    <p>{{ text }}</p>
    <div class="btn-row">
      <IconButton v-if="page > 1" label="Previous page" icon="left" :to="to(page - 1)" />
      <IconButton v-else label="Previous page" icon="left" disabled />
      <IconButton v-if="page < pageCount" label="Next page" icon="right" :to="to(page + 1)" />
      <IconButton v-else label="Next page" icon="right" disabled />
    </div>
  </nav>
</template>

<style scoped>
.page-nav {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--muted);
}
.page-nav p {
  margin: 0;
}
</style>
