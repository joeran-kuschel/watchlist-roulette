<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import AppIcon from './AppIcon.vue'

// A live region that already holds text when it appears is often not read out, so its text is set a tick later
const announced = ref(false)
onMounted(async () => {
  await nextTick()
  announced.value = true
})
</script>

<template>
  <div class="tmdb-off">
    <AppIcon name="alert" :size="20" />
    <p role="status">
      <template v-if="announced"
        >TMDB data is turned off, so films get no poster or details. Set TMDB_ACCESS_TOKEN and restart the app.</template
      >
    </p>
  </div>
</template>

<style scoped>
.tmdb-off {
  display: flex;
  gap: 8px;
  align-items: flex-start;
  color: var(--text-soft);
}
.tmdb-off p {
  margin: 0;
  max-width: 60ch;
}
</style>
