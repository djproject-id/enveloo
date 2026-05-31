import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'inbox',
    component: () => import('../views/Inbox.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/email/:id',
    name: 'email-reader',
    component: () => import('../views/EmailReader.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/compose',
    name: 'compose',
    component: () => import('../views/Composer.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/accounts',
    name: 'accounts',
    component: () => import('../views/Accounts.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/admin/invites',
    name: 'admin-invites',
    component: () => import('../views/AdminInvites.vue'),
    meta: { requiresAuth: true, requiresAdmin: true },
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/Login.vue'),
    meta: { public: true },
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('../views/Register.vue'),
    meta: { public: true },
  },
  {
    path: '/:pathMatch(.*)*',
    redirect: '/',
  },
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

let initialFetchDone = false

router.beforeEach(async (to) => {
  const auth = useAuthStore()

  // Ensure we have fetched the current user exactly once per page load
  if (!initialFetchDone) {
    await auth.fetchMe()
    initialFetchDone = true
  }

  const isPublic = to.meta['public'] === true
  const requiresAuth = to.meta['requiresAuth'] === true
  const requiresAdmin = to.meta['requiresAdmin'] === true

  if (requiresAuth && auth.user === null) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }

  if (requiresAdmin && auth.user?.admin !== true) {
    return { name: 'inbox' }
  }

  // If already authenticated, redirect away from login/register
  if (isPublic && auth.user !== null && (to.name === 'login' || to.name === 'register')) {
    return { name: 'inbox' }
  }

  return true
})

export default router
