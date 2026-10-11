import { afterEach, describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createMemoryHistory } from 'vue-router'
import { vi } from 'vitest'
import App from '../../App.vue'
import { expectNoA11yViolations } from '../../__tests__/helpers'
import NotFoundView from '../../views/NotFoundView.vue'
import { createAppRouter, routes } from '..'

vi.stubGlobal(
  'fetch',
  vi.fn(() => Promise.resolve(new Response(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 50 })))),
)

afterEach(() => {
  document.body.innerHTML = ''
  document.title = ''
})

describe('router', () => {
  it('has a title for every route', () => {
    for (const route of routes) expect(route.meta?.title).toBeTruthy()
  })

  it('resolves the screens', () => {
    const router = createAppRouter(createMemoryHistory())
    const path = (url: string) => router.resolve(url).matched[0]?.path
    expect(path('/')).toBe('/')
    expect(path('/watchlist')).toBe('/watchlist')
    expect(path('/watchlist/new')).toBe('/watchlist/new')
    expect(path('/watchlist/12/edit')).toBe('/watchlist/:id(\\d+)/edit')
    expect(path('/watchlist/12/match')).toBe('/watchlist/:id(\\d+)/match')
    expect(path('/import')).toBe('/import')
    expect(path('/watchlist/abc/edit')).toBe('/:pathMatch(.*)*')
    expect(path('/nope')).toBe('/:pathMatch(.*)*')
  })

  it('sets the document title and moves focus to the content after navigating', async () => {
    const router = createAppRouter(createMemoryHistory())
    await router.push('/import')
    const wrapper = mount(App, { global: { plugins: [createPinia(), router] }, attachTo: document.body })
    await flushPromises()
    expect(document.title).toBe('Import · Watchlist Roulette')

    await router.push('/watchlist')
    await flushPromises()
    expect(document.title).toBe('Watchlist · Watchlist Roulette')
    expect(document.activeElement).toBe(document.getElementById('main'))
    wrapper.unmount()
  })

  it('does not steal focus on the first page load', async () => {
    const router = createAppRouter(createMemoryHistory())
    await router.push('/import')
    expect(document.activeElement).toBe(document.body)
  })
})

describe('NotFoundView', () => {
  it('says the page does not exist and links home', async () => {
    const router = createAppRouter(createMemoryHistory())
    await router.push('/')
    const wrapper = mount(NotFoundView, { global: { plugins: [router] }, attachTo: document.body })
    expect(wrapper.get('h1').text()).toBe('Page not found')
    expect(wrapper.get('a').attributes('href')).toBe('/')
    await expectNoA11yViolations(wrapper.element)
  })
})
