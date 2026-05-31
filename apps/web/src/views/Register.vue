<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { ApiError } from '../lib/api'
import Turnstile from '../components/Turnstile.vue'

const auth = useAuthStore()
const router = useRouter()

const email = ref('')
const password = ref('')
const inviteCode = ref('')
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
    await auth.register(email.value, password.value, inviteCode.value, turnstileToken.value)
    await router.push({ name: 'login', query: { registered: '1' } })
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
        <h1 class="text-xl font-semibold text-gray-900">Create your account</h1>
        <p class="mt-1 text-sm text-gray-500">An invite code is required</p>
      </div>

      <form class="space-y-5" novalidate @submit.prevent="handleSubmit">
        <!-- Email -->
        <div class="form-group">
          <label for="reg-email" class="label">Email address</label>
          <input
            id="reg-email"
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
          <label for="reg-password" class="label">Password</label>
          <input
            id="reg-password"
            v-model="password"
            type="password"
            autocomplete="new-password"
            required
            minlength="12"
            class="input"
            placeholder="At least 12 characters"
            :disabled="loading"
          />
        </div>

        <!-- Invite code -->
        <div class="form-group">
          <label for="reg-invite" class="label">Invite code</label>
          <input
            id="reg-invite"
            v-model="inviteCode"
            type="text"
            autocomplete="off"
            required
            class="input"
            placeholder="XXXX-XXXX"
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
          <span v-if="loading">Creating account...</span>
          <span v-else>Create account</span>
        </button>
      </form>

      <p class="mt-6 text-center text-sm text-gray-500">
        Already have an account?
        <router-link to="/login" class="font-medium">Sign in</router-link>
      </p>
    </div>
  </div>
</template>
