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

describe('router: edge cases', () => {
  const start = async (path: string) => {
    // A fresh answer per request (a Response body can be read once): lists are empty, everything else is not found
    vi.mocked(fetch).mockImplementation((url) =>
      Promise.resolve(
        String(url).startsWith('/api/films?')
          ? new Response(JSON.stringify({ items: [], total: 0, page: 1, pageSize: 50 }))
          : new Response(JSON.stringify({ error: 'Film not found' }), { status: 404 }),
      ),
    )
    const router = createAppRouter(createMemoryHistory())
    await router.push(path)
    const wrapper = mount(App, { global: { plugins: [createPinia(), router] }, attachTo: document.body })
    await flushPromises()
    return { router, wrapper }
  }

  it.each([
    ['/', 'Roulette'],
    ['/watchlist', 'Watchlist'],
    ['/watchlist/new', 'Add film'],
    ['/watchlist/3/edit', 'Edit film'],
    ['/watchlist/3/match', 'Choose TMDB match'],
    ['/import', 'Import'],
    ['/does/not/exist', 'Page not found'],
    ['/watchlist/abc/edit', 'Page not found'],
  ])('titles %s "%s"', async (path, title) => {
    const { wrapper } = await start(path)
    expect(document.title).toBe(`${title} · Watchlist Roulette`)
    wrapper.unmount()
  })

  it('shows the not-found page for an unknown address', async () => {
    const { wrapper } = await start('/nope')
    expect(wrapper.get('h1').text()).toBe('Page not found')
    wrapper.unmount()
  })

  it('keeps the query string when it resolves a route', () => {
    const router = createAppRouter(createMemoryHistory())
    expect(router.resolve('/watchlist?q=joy&page=2').fullPath).toBe('/watchlist?q=joy&page=2')
  })

  it('moves focus to the content again on every later navigation', async () => {
    const { router, wrapper } = await start('/import')
    await router.push('/watchlist')
    await flushPromises()
    ;(document.getElementById('search') as HTMLElement | null)?.focus()
    await router.push('/import')
    await flushPromises()
    expect(document.activeElement).toBe(document.getElementById('main'))
    wrapper.unmount()
  })

  it('keeps focus where it is when only the query string changes', async () => {
    const { router, wrapper } = await start('/watchlist')
    const select = document.getElementById('sort') as HTMLElement
    select.focus()
    await router.push({ path: '/watchlist', query: { sort: 'title' } })
    await flushPromises()
    expect(document.activeElement).toBe(select)
    wrapper.unmount()
  })
})

describe('router: hash links', () => {
  it('keeps focus on the target of an in-page #link', async () => {
    vi.mocked(fetch).mockImplementation(() => Promise.resolve(new Response('{}', { status: 404 })))
    const router = createAppRouter(createMemoryHistory())
    await router.push('/watchlist/new')
    const wrapper = mount(App, { global: { plugins: [createPinia(), router] }, attachTo: document.body })
    await flushPromises()
    const field = document.getElementById('film-title') as HTMLElement
    field.focus()
    await router.push({ path: '/watchlist/new', hash: '#film-title' })
    await flushPromises()
    expect(document.activeElement).toBe(field)
    wrapper.unmount()
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
