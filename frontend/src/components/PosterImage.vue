<script setup lang="ts">
import { ref, watch } from 'vue'
import { posterUrl } from '../api'

const props = defineProps<{ filmId: number; hasPoster: boolean }>()

const failed = ref(false)
watch(
  () => props.filmId,
  () => (failed.value = false),
)
</script>

<template>
  <img
    v-if="hasPoster && !failed"
    class="poster"
    :src="posterUrl(filmId)"
    alt=""
    loading="lazy"
    @error="failed = true"
  />
  <span v-else class="poster poster--empty" aria-hidden="true">No poster</span>
</template>

<style scoped>
.poster {
  display: block;
  width: 100%;
  aspect-ratio: 2 / 3;
  object-fit: cover;
  border-radius: 10px;
  background: var(--surface-2);
}
.poster--empty {
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px dashed var(--border-strong);
  color: var(--muted);
  font-size: 0.875rem;
  text-align: center;
}
</style>
