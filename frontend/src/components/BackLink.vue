<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

defineProps<{ to: RouteLocationRaw }>()
</script>

<template>
  <p class="back">
    <RouterLink :to="to"><slot /></RouterLink>
  </p>
</template>

<style scoped>
.back {
  margin: 0 0 16px;
}
</style>
