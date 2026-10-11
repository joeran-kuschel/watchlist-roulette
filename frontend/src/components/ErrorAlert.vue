<script setup lang="ts">
import AppIcon from './AppIcon.vue'

defineProps<{ message: string }>()
</script>

<template>
  <div class="alert error-alert" role="alert">
    <p class="error-alert__message"><AppIcon name="alert" :size="20" />{{ message }}</p>
    <slot />
  </div>
</template>

<style scoped>
.error-alert__message {
  display: flex;
  gap: 8px;
  align-items: center;
  margin: 0;
  color: var(--warn);
  font-weight: 700;
}
.error-alert :deep(.btn) {
  margin-top: 12px;
}
</style>
