import axe from 'axe-core'
import { expect } from 'vitest'
import { mount, flushPromises, type ComponentMountingOptions } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createMemoryHistory } from 'vue-router'
import type { Component } from 'vue'
import { createAppRouter } from '../router'
import type { Film } from '../types'

export function makeFilm(overrides: Partial<Film> = {}): Film {
  return {
    id: 1,
    title: 'Perfect Days',
    releaseYear: 2023,
    letterboxdUrl: 'https://boxd.it/abc',
    addedAt: '2025-03-12',
    watchedAt: null,
    tmdb: { id: 976893, status: 'matched', syncedAt: '2026-10-11T12:00:00.000Z' },
    originalTitle: null,
    tagline: null,
    overview: 'A janitor in Tokyo finds joy in small things.',
    runtimeMinutes: 124,
    voteAverage: 7.9,
    voteCount: 1000,
    posterPath: '/p.jpg',
    backdropPath: null,
    countries: ['JP'],
    genres: [{ id: 18, name: 'Drama' }],
    directors: [{ id: 1, name: 'Wim Wenders' }],
    cast: [],
    ...overrides,
  }
}

/** Fails with the list of rules axe finds broken. Contrast needs a real browser, so it is skipped. */
export async function expectNoA11yViolations(element: Element) {
  const results = await axe.run(element, {
    rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
  })
  expect(results.violations.map((v) => `${v.id}: ${v.help} (${v.nodes[0]?.html})`)).toEqual([])
}

/** Mounts with a fresh Pinia and a router on memory history, attached to the document for axe. */
export async function mountWithApp(
  component: Component,
  path = '/',
  options: ComponentMountingOptions<Component> = {},
) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const router = createAppRouter(createMemoryHistory())
  await router.push(path)
  await router.isReady()
  const wrapper = mount(component, {
    ...options,
    attachTo: document.body,
    global: { plugins: [pinia, router], ...options.global },
  })
  await flushPromises()
  return { wrapper, router }
}
