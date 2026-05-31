import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, ApiError } from '../lib/api'

export interface AuthUser {
  userId: string
  admin: boolean
  roleId: string
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<AuthUser | null>(null)
  const ready = ref(false)

  async function fetchMe(): Promise<void> {
    try {
      const data = await api.get<AuthUser>('/api/auth/me')
      user.value = data
    } catch (err) {
      // Only clear the session on an explicit 401. Transient failures
      // (network down, 5xx) must NOT silently log an authenticated user out.
      if (err instanceof ApiError && err.status === 401) {
        user.value = null
      }
    } finally {
      ready.value = true
    }
  }

  async function login(
    email: string,
    password: string,
    turnstileToken: string,
  ): Promise<void> {
    const data = await api.post<{ userId: string; admin: boolean }>(
      '/api/auth/login',
      { email, password, turnstileToken },
    )
    // After login the server sets cookies; fetch full profile to get roleId
    await fetchMe()
    // Fallback if fetchMe failed to populate — use login response
    if (!user.value) {
      user.value = { userId: data.userId, admin: data.admin, roleId: '' }
    }
  }

  async function register(
    email: string,
    password: string,
    inviteCode: string,
    turnstileToken: string,
  ): Promise<void> {
    // Omit inviteCode when empty so the server's first-admin bootstrap path
    // (which expects no invite) isn't broken by an empty-string value.
    const payload: Record<string, unknown> = { email, password, turnstileToken }
    if (inviteCode) payload['inviteCode'] = inviteCode
    await api.post<unknown>('/api/auth/register', payload)
  }

  async function logout(): Promise<void> {
    try {
      await api.post<unknown>('/api/auth/logout')
    } finally {
      user.value = null
    }
  }

  return { user, ready, fetchMe, login, register, logout }
})
