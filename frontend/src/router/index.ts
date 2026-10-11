import { nextTick } from 'vue'
import {
  createRouter,
  createWebHistory,
  START_LOCATION,
  type RouteRecordRaw,
  type RouterHistory,
} from 'vue-router'

const APP_NAME = 'Watchlist Roulette'

export const routes: RouteRecordRaw[] = [
  { path: '/', component: () => import('../views/RouletteView.vue'), meta: { title: 'Roulette' } },
  {
    path: '/watchlist',
    component: () => import('../views/WatchlistView.vue'),
    meta: { title: 'Watchlist' },
  },
  {
    path: '/watchlist/new',
    component: () => import('../views/FilmFormView.vue'),
    meta: { title: 'Add film' },
  },
  {
    path: '/watchlist/:id(\\d+)/edit',
    component: () => import('../views/FilmFormView.vue'),
    meta: { title: 'Edit film' },
  },
  {
    path: '/watchlist/:id(\\d+)/match',
    component: () => import('../views/MatchView.vue'),
    meta: { title: 'Choose TMDB match' },
  },
  { path: '/import', component: () => import('../views/ImportView.vue'), meta: { title: 'Import' } },
  {
    path: '/:pathMatch(.*)*',
    component: () => import('../views/NotFoundView.vue'),
    meta: { title: 'Page not found' },
  },
]

export function createAppRouter(history: RouterHistory = createWebHistory(import.meta.env.BASE_URL)) {
  const router = createRouter({ history, routes })

  router.afterEach(async (to, from) => {
    document.title = `${to.meta.title} · ${APP_NAME}`
    // A single-page app does not reload, so screen readers need focus moved to the new content
    if (from !== START_LOCATION) {
      await nextTick()
      document.getElementById('main')?.focus()
    }
  })

  return router
}

export default createAppRouter()
