import { describe, expect, it } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { expectNoA11yViolations } from '../../__tests__/helpers'
import TmdbOffNotice from '../TmdbOffNotice.vue'

const TEXT = 'TMDB data is turned off, so films get no poster or details. Set TMDB_ACCESS_TOKEN and restart the app.'
const mountNotice = () => mount(TmdbOffNotice, { attachTo: document.body })

describe('TmdbOffNotice', () => {
  it('has an empty status region right after mounting, so screen readers announce the text when it arrives', () => {
    const wrapper = mountNotice()
    expect(wrapper.get('[role="status"]').text()).toBe('')
    wrapper.unmount()
  })

  it('fills the status region with the hint one tick later', async () => {
    const wrapper = mountNotice()
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toBe(TEXT)
    wrapper.unmount()
  })

  it('has no axe violations', async () => {
    const wrapper = mountNotice()
    await flushPromises()
    expect(wrapper.get('[role="status"]').text()).toBe(TEXT)
    await expectNoA11yViolations(wrapper.element)
    wrapper.unmount()
  })
})
