<script setup lang="ts">
import { ref } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { ApiError } from '../lib/api'
import Turnstile from '../components/Turnstile.vue'

const auth = useAuthStore()
const router = useRouter()
const route = useRoute()

const email = ref('')
const password = ref('')
const turnstileToken = ref('')
const errorMessage = ref('')
const loading = ref(false)

function onTurnstileVerified(token: string) {
  turnstileToken.value = token
}

async function handleSubmit() {
  if (!turnstileToken.value) {
    errorMessage.value = 'Please complete the security challenge.'
    return
  }

  errorMessage.value = ''
  loading.value = true

  try {
    await auth.login(email.value, password.value, turnstileToken.value)
    const raw = route.query['redirect']
    // Only allow same-origin relative paths (open-redirect guard).
    const redirect =
      typeof raw === 'string' && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/'
    await router.push(redirect)
  } catch (err) {
    if (err instanceof ApiError) {
      errorMessage.value = err.message
    } else {
      errorMessage.value = 'An unexpected error occurred. Please try again.'
    }
    turnstileToken.value = ''
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-[calc(100vh-7rem)] items-center justify-center px-4 py-12">
    <div class="card w-full max-w-sm p-8">
      <!-- Header -->
      <div class="mb-8 text-center">
        <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-brand-50">
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
            <rect x="2" y="4" width="20" height="16" rx="2" />
            <path d="m2 7 10 7 10-7" />
          </svg>
        </div>
        <h1 class="text-xl font-semibold text-gray-900">Sign in to Enveloo</h1>
        <p class="mt-1 text-sm text-gray-500">Enter your credentials to continue</p>
      </div>

      <form class="space-y-5" novalidate @submit.prevent="handleSubmit">
        <!-- Email -->
        <div class="form-group">
          <label for="login-email" class="label">Email address</label>
          <input
            id="login-email"
            v-model="email"
            type="email"
            autocomplete="email"
            required
            class="input"
            placeholder="you@example.com"
            :disabled="loading"
          />
        </div>

        <!-- Password -->
        <div class="form-group">
          <label for="login-password" class="label">Password</label>
          <input
            id="login-password"
            v-model="password"
            type="password"
            autocomplete="current-password"
            required
            class="input"
            placeholder="••••••••"
            :disabled="loading"
          />
        </div>

        <!-- Turnstile -->
        <div>
          <Turnstile @verified="onTurnstileVerified" />
        </div>

        <!-- Error -->
        <p v-if="errorMessage" role="alert" class="error-text text-center">
          {{ errorMessage }}
        </p>

        <!-- Submit -->
        <button
          type="submit"
          class="btn-primary w-full"
          :disabled="loading"
        >
          <span v-if="loading">Signing in...</span>
          <span v-else>Sign in</span>
        </button>
      </form>

      <p class="mt-6 text-center text-sm text-gray-500">
        Don&apos;t have an account?
        <router-link to="/register" class="font-medium">Request access</router-link>
      </p>
    </div>
  </div>
</template>
