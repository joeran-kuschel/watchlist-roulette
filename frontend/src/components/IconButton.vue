<script setup lang="ts">
import { ref } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import AppIcon, { type IconName } from './AppIcon.vue'

const props = defineProps<{
  /** Accessible name; the visible tooltip shows `tooltip` or, by default, this text. */
  label: string
  icon: IconName
  tooltip?: string
  to?: RouteLocationRaw
  variant?: 'primary'
  large?: boolean
}>()

// WCAG 1.4.13: the tooltip can be dismissed with Esc without moving focus or the pointer
const dismissed = ref(false)
const show = () => (dismissed.value = false)
</script>

<template>
  <component
    :is="props.to ? RouterLink : 'button'"
    v-bind="props.to ? { to: props.to } : { type: 'button' }"
    class="icon-button"
    :class="{ 'icon-button--primary': variant === 'primary', 'icon-button--large': large }"
    :aria-label="label"
    @mouseenter="show"
    @focus="show"
    @keydown.esc="dismissed = true"
  >
    <AppIcon :name="icon" />
    <span v-show="!dismissed" class="icon-button__tip" aria-hidden="true">{{
      tooltip ?? label
    }}</span>
  </component>
</template>

<style scoped>
.icon-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 48px;
  height: 48px;
  padding: 0;
  border-radius: var(--radius);
  border: 1px solid var(--border-strong);
  background: transparent;
  color: var(--text);
  cursor: pointer;
  text-decoration: none;
}
.icon-button:hover {
  background: var(--surface-2);
  color: var(--text);
}
.icon-button--primary,
.icon-button--primary:hover {
  background: var(--accent);
  border-color: var(--accent);
  color: var(--accent-text);
}
.icon-button--large {
  width: 64px;
  height: 64px;
  border-radius: 50%;
}
.icon-button:disabled {
  color: var(--disabled);
  border-color: var(--border);
  background: transparent;
  cursor: default;
}
.icon-button__tip {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
  padding: 4px 8px;
  border-radius: 6px;
  background: var(--text);
  color: var(--accent-text);
  font-size: 0.8125rem;
  font-weight: 700;
  white-space: nowrap;
  opacity: 0;
  pointer-events: none;
}
.icon-button:hover .icon-button__tip,
.icon-button:focus-visible .icon-button__tip {
  opacity: 1;
}
</style>
