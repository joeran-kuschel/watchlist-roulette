<script setup lang="ts">
import type { Fact } from '../format'

withDefaults(defineProps<{ facts: Fact[]; layout?: 'inline' | 'grid' }>(), { layout: 'inline' })
</script>

<template>
  <dl v-if="facts.length" class="facts" :class="`facts--${layout}`">
    <div v-for="fact in facts" :key="fact.label">
      <dt>{{ fact.label }}</dt>
      <dd>{{ fact.value }}</dd>
    </div>
  </dl>
</template>

<style scoped>
.facts {
  margin: 0;
}
.facts--inline {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 24px;
  color: var(--text-soft);
}
.facts--inline div {
  display: flex;
  gap: 6px;
}
.facts--grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 12px 24px;
}
.facts--grid dt {
  font-size: 0.875rem;
}
dt {
  color: var(--muted);
}
dd {
  margin: 0;
  font-weight: 700;
}
</style>
