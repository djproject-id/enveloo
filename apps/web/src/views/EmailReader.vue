<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { api, ApiError } from '../lib/api'

interface EmailDetail {
  id: string
  fromAddress: string
  fromName: string
  toAddress: string
  subject: string
  html: string
  text: string
  unread: number
  direction: 'received' | 'sent'
  createdAt: string
}

const route = useRoute()

const email = ref<EmailDetail | null>(null)
const loading = ref(false)
const errorMessage = ref('')

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

async function fetchEmail() {
  const id = route.params['id'] as string
  loading.value = true
  errorMessage.value = ''
  try {
    email.value = await api.get<EmailDetail>(`/api/emails/${id}`)
  } catch (err) {
    if (err instanceof ApiError) {
      errorMessage.value = err.message
    } else {
      errorMessage.value = 'Failed to load email. Please try again.'
    }
  } finally {
    loading.value = false
  }
}

onMounted(fetchEmail)
</script>

<template>
  <div class="mx-auto max-w-5xl px-4 py-8 sm:px-6">
    <!-- Back link -->
    <div class="mb-6">
      <router-link
        to="/"
        class="inline-flex items-center gap-1.5 text-sm text-gray-500 no-underline hover:text-gray-900 transition-colors"
      >
        <svg
          class="h-4 w-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <path d="m15 18-6-6 6-6" />
        </svg>
        Back to Inbox
      </router-link>
    </div>

    <!-- Loading state -->
    <div v-if="loading" class="flex items-center justify-center py-20">
      <svg
        class="h-6 w-6 animate-spin text-brand-500"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
        <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
      </svg>
      <span class="ml-3 text-sm text-gray-500">Loading email...</span>
    </div>

    <!-- Error state -->
    <div v-else-if="errorMessage" role="alert" class="rounded-lg border border-red-200 bg-red-50 px-5 py-4">
      <p class="text-sm font-medium text-red-700">{{ errorMessage }}</p>
      <button
        type="button"
        class="mt-2 text-sm text-red-600 underline hover:text-red-800"
        @click="fetchEmail"
      >
        Try again
      </button>
    </div>

    <!-- Email detail -->
    <div v-else-if="email" class="card overflow-hidden">
      <!-- Header -->
      <div class="border-b border-gray-100 px-6 py-5">
        <h1 class="text-lg font-semibold text-gray-900 break-words">
          {{ email.subject || '(no subject)' }}
        </h1>
        <dl class="mt-3 space-y-1 text-sm">
          <div class="flex gap-2">
            <dt class="flex-none w-8 font-medium text-gray-500">From</dt>
            <dd class="text-gray-700 break-all">
              <span v-if="email.fromName">{{ email.fromName }} &lt;{{ email.fromAddress }}&gt;</span>
              <span v-else>{{ email.fromAddress }}</span>
            </dd>
          </div>
          <div class="flex gap-2">
            <dt class="flex-none w-8 font-medium text-gray-500">To</dt>
            <dd class="text-gray-700 break-all">{{ email.toAddress }}</dd>
          </div>
          <div class="flex gap-2">
            <dt class="flex-none w-8 font-medium text-gray-500">Date</dt>
            <dd class="text-gray-500">{{ formatDate(email.createdAt) }}</dd>
          </div>
        </dl>
      </div>

      <!-- Body -->
      <div class="px-6 py-5">
        <!-- HTML body rendered in a sandboxed iframe — NO allow-scripts, NO allow-same-origin -->
        <iframe
          v-if="email.html"
          :srcdoc="email.html"
          sandbox=""
          class="w-full rounded border border-gray-100"
          style="min-height: 400px; display: block;"
          title="Email body"
          aria-label="Email body"
        />
        <!-- Plain text fallback -->
        <pre
          v-else
          class="whitespace-pre-wrap break-words font-sans text-sm text-gray-700 leading-relaxed"
        >{{ email.text }}</pre>
      </div>
    </div>
  </div>
</template>
