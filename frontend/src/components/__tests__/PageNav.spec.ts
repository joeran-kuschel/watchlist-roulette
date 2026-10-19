import { afterEach, describe, expect, it } from 'vitest'
import { enableAutoUnmount } from '@vue/test-utils'
import { expectNoA11yViolations, mountWithApp } from '../../__tests__/helpers'
import PageNav from '../PageNav.vue'

enableAutoUnmount(afterEach)
afterEach(() => {
  document.body.innerHTML = ''
})

const props = (page: number, pageCount = 3) => ({
  label: 'Pagination, top',
  text: `Page ${page} of ${pageCount}`,
  page,
  pageCount,
  to: (n: number) => ({ path: '/watchlist', query: { page: String(n) } }),
})

describe('PageNav', () => {
  it('is a navigation with the given name, the text and links to both neighbours', async () => {
    const { wrapper } = await mountWithApp(PageNav, '/', { props: props(2) })
    expect(wrapper.get('nav').attributes('aria-label')).toBe('Pagination, top')
    expect(wrapper.get('p').text()).toBe('Page 2 of 3')
    expect(wrapper.get('a[aria-label="Previous page"]').attributes('href')).toBe('/watchlist?page=1')
    expect(wrapper.get('a[aria-label="Next page"]').attributes('href')).toBe('/watchlist?page=3')
    await expectNoA11yViolations(wrapper.element)
  })

  it('disables Previous on the first page and Next on the last', async () => {
    const first = await mountWithApp(PageNav, '/', { props: props(1) })
    expect(first.wrapper.get('button[aria-label="Previous page"]').attributes('disabled')).toBeDefined()
    expect(first.wrapper.find('a[aria-label="Next page"]').exists()).toBe(true)
    const last = await mountWithApp(PageNav, '/', { props: props(3) })
    expect(last.wrapper.get('button[aria-label="Next page"]').attributes('disabled')).toBeDefined()
    expect(last.wrapper.find('a[aria-label="Previous page"]').exists()).toBe(true)
    await expectNoA11yViolations(last.wrapper.element)
  })
})
