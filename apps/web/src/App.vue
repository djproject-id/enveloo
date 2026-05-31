<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from './stores/auth'

const auth = useAuthStore()
const router = useRouter()

const isLoggedIn = computed(() => auth.user !== null)

async function handleLogout() {
  await auth.logout()
  await router.push({ name: 'login' })
}
</script>

<template>
  <div class="min-h-screen flex flex-col bg-gray-50">
    <!-- Top bar -->
    <header class="bg-white border-b border-gray-200 shadow-sm">
      <div class="mx-auto max-w-5xl px-4 sm:px-6 flex h-14 items-center justify-between">
        <!-- Wordmark -->
        <router-link
          to="/"
          class="flex items-center gap-2 no-underline group"
          aria-label="Enveloo home"
        >
          <svg
            class="h-6 w-6 text-brand-600"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="1.75"
            stroke-linecap="round"
            stroke-linejoin="round"
            aria-hidden="true"
          >
            <!-- Envelope icon -->
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m2 7 10 7 10-7" />
          </svg>
          <span class="text-lg font-semibold tracking-tight text-gray-900 group-hover:text-brand-700 transition-colors">
            Enveloo
          </span>
        </router-link>

        <!-- Nav / auth actions -->
        <nav class="flex items-center gap-1" aria-label="Main navigation">
          <template v-if="isLoggedIn">
            <router-link
              to="/"
              class="text-sm text-gray-600 hover:text-gray-900 transition-colors px-3 py-1.5 rounded no-underline"
              active-class="text-brand-600 font-medium"
              :exact-active-class="'text-brand-600 font-medium'"
            >
              Inbox
            </router-link>
            <router-link
              to="/compose"
              class="text-sm text-gray-600 hover:text-gray-900 transition-colors px-3 py-1.5 rounded no-underline"
              active-class="text-brand-600 font-medium"
            >
              Compose
            </router-link>
            <router-link
              to="/accounts"
              class="text-sm text-gray-600 hover:text-gray-900 transition-colors px-3 py-1.5 rounded no-underline"
              active-class="text-brand-600 font-medium"
            >
              Accounts
            </router-link>
            <router-link
              v-if="auth.user?.admin === true"
              to="/admin/invites"
              class="text-sm text-gray-600 hover:text-gray-900 transition-colors px-3 py-1.5 rounded no-underline"
              active-class="text-brand-600 font-medium"
            >
              Invites
            </router-link>
            <span class="mx-1 text-gray-200" aria-hidden="true">|</span>
            <button
              type="button"
              class="btn-ghost text-sm"
              @click="handleLogout"
            >
              Sign out
            </button>
          </template>
          <template v-else>
            <router-link
              to="/login"
              class="btn-ghost text-sm no-underline"
            >
              Sign in
            </router-link>
            <router-link
              to="/register"
              class="btn-primary text-sm no-underline"
            >
              Register
            </router-link>
          </template>
        </nav>
      </div>
    </header>

    <!-- Page content -->
    <main class="flex-1">
      <router-view />
    </main>

    <!-- Footer -->
    <footer class="border-t border-gray-200 bg-white py-4 text-center text-xs text-gray-400">
      Enveloo &mdash; secure, self-hosted email
    </footer>
  </div>
</template>
