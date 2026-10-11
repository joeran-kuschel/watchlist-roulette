<script setup lang="ts">
import { RouterLink, RouterView, useRoute } from 'vue-router'
import BrandMark from './BrandMark.vue'
import TmdbAttribution from './TmdbAttribution.vue'

const links = [
  { to: '/', label: 'Roulette' },
  { to: '/watchlist', label: 'Watchlist' },
  { to: '/import', label: 'Import' },
]

const route = useRoute()
// /watchlist/new belongs to the Watchlist section, but only /watchlist itself is the current page
const inSection = (to: string) => (to === '/' ? route.path === '/' : route.path.startsWith(to))
</script>

<template>
  <div class="layout">
    <a class="skip" href="#main">Skip to main content</a>
    <header class="layout__header">
      <div class="layout__brand">
        <BrandMark :size="36" class="layout__logo" />
        <span>Watchlist Roulette</span>
      </div>
      <nav aria-label="Main">
        <ul>
          <li v-for="link in links" :key="link.to">
            <RouterLink
              :to="link.to"
              :class="{ 'is-section': inSection(link.to) }"
              :aria-current="route.path === link.to ? 'page' : undefined"
              >{{ link.label }}</RouterLink
            >
          </li>
        </ul>
      </nav>
    </header>
    <main id="main" tabindex="-1">
      <RouterView />
    </main>
    <TmdbAttribution />
  </div>
</template>

<style scoped>
.layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}
main {
  flex: 1;
}
.skip {
  position: absolute;
  left: 16px;
  top: -60px;
  padding: 10px 16px;
  border-radius: 6px;
  background: var(--focus);
  color: var(--accent-text);
  font-weight: 700;
}
.skip:focus {
  top: 12px;
  z-index: 10;
}
.layout__header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 20px 48px;
  border-bottom: 1px solid var(--border);
}
.layout__brand {
  display: flex;
  align-items: center;
  gap: 12px;
  font-family: var(--font-display);
  font-weight: 800;
  font-size: 1.375rem;
}
.layout__logo {
  color: var(--text);
}
ul {
  display: flex;
  gap: 8px;
  list-style: none;
  margin: 0;
  padding: 0;
}
nav a {
  display: inline-flex;
  align-items: center;
  min-height: var(--target);
  padding: 0 16px;
  border-radius: 8px;
  color: var(--text-soft);
  text-decoration: none;
  font-weight: 500;
}
nav a.is-section {
  background: var(--surface-2);
  color: var(--text);
  font-weight: 700;
}
@media (max-width: 640px) {
  .layout__header {
    padding: 16px;
  }
}
</style>
