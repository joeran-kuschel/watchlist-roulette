<script setup lang="ts">
import { onBeforeUnmount, ref } from 'vue'
import { RouterLink, type RouteLocationRaw } from 'vue-router'
import AppIcon, { type IconName } from './AppIcon.vue'

const props = defineProps<{
  /** Accessible name; the visible tooltip shows `tooltip` or, by default, this text. A `tooltip` must be part of the name (WCAG 2.5.3). */
  label: string
  icon: IconName
  tooltip?: string
  to?: RouteLocationRaw
  variant?: 'primary'
  large?: boolean
}>()

// WCAG 1.4.13: the tooltip can be dismissed with Esc without moving focus or the pointer, also when the pointer
// alone has opened it (then the button has no focus, so the key is listened for on the window while it is hovered)
const dismissed = ref(false)
const show = () => (dismissed.value = false)
const dismissOnEsc = (event: KeyboardEvent) => {
  if (event.key === 'Escape') dismissed.value = true
}
function enter() {
  show()
  window.addEventListener('keydown', dismissOnEsc)
}
const leave = () => window.removeEventListener('keydown', dismissOnEsc)
onBeforeUnmount(leave)
</script>

<template>
  <component
    :is="props.to ? RouterLink : 'button'"
    v-bind="props.to ? { to: props.to } : { type: 'button' }"
    class="icon-button"
    :class="{ 'icon-button--primary': variant === 'primary', 'icon-button--large': large }"
    :aria-label="label"
    @mouseenter="enter"
    @mouseleave="leave"
    @focus="show"
    @keydown.esc="dismissed = true"
  >
    <AppIcon :name="icon" />
    <!-- A click on the tooltip does nothing; it is only there to be read (and hovered, WCAG 1.4.13) -->
    <span v-show="!dismissed" class="icon-button__tip" aria-hidden="true" @click.prevent.stop>{{
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
  /* Only while it is shown, so its invisible box does not catch the pointer */
  pointer-events: none;
}
/* Bridges the gap to the button, so the pointer can move onto the tooltip without it disappearing (WCAG 1.4.13) */
.icon-button__tip::before {
  content: '';
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  height: 8px;
}
.icon-button:hover .icon-button__tip,
.icon-button:focus-visible .icon-button__tip {
  opacity: 1;
  pointer-events: auto;
}
/* A disabled button gets no tooltip: browsers differ on whether it fires pointer events, so Esc could not
   dismiss it reliably (WCAG 1.4.13). Its accessible name is still read. */
.icon-button:disabled .icon-button__tip {
  display: none;
}
</style>
