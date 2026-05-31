<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { api, ApiError } from '../lib/api'

interface EmailSummary {
  id: string
  fromAddress: string
  fromName: string
  toAddress: string
  subject: string
  unread: number
  direction: 'received' | 'sent'
  createdAt: string
}

const router = useRouter()

const emails = ref<EmailSummary[]>([])
const loading = ref(false)
const errorMessage = ref('')

function relativeDate(isoString: string): string {
  const now = Date.now()
  const then = new Date(isoString).getTime()
  const diffMs = now - then
  const diffSec = Math.floor(diffMs / 1000)
  const diffMin = Math.floor(diffSec / 60)
  const diffHour = Math.floor(diffMin / 60)
  const diffDay = Math.floor(diffHour / 24)

  if (diffSec < 60) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  if (diffHour < 24) return `${diffHour}h ago`
  if (diffDay < 7) return `${diffDay}d ago`
  return new Date(isoString).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

async function fetchEmails() {
  loading.value = true
  errorMessage.value = ''
  try {
    emails.value = await api.get<EmailSummary[]>('/api/emails')
  } catch (err) {
    if (err instanceof ApiError) {
      errorMessage.value = err.message
    } else {
      errorMessage.value = 'Failed to load emails. Please try again.'
    }
  } finally {
    loading.value = false
  }
}

function openEmail(id: string) {
  router.push(`/email/${id}`)
}

onMounted(fetchEmails)
</script>

<template>
  <div class="mx-auto max-w-5xl px-4 py-8 sm:px-6">
    <!-- Header row -->
    <div class="mb-6 flex items-center justify-between">
      <h1 class="text-xl font-semibold text-gray-900">Inbox</h1>
      <router-link to="/compose" class="btn-primary text-sm no-underline">
        Compose
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
        <path
          class="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8v8H4z"
        />
      </svg>
      <span class="ml-3 text-sm text-gray-500">Loading emails...</span>
    </div>

    <!-- Error state -->
    <div v-else-if="errorMessage" role="alert" class="rounded-lg border border-red-200 bg-red-50 px-5 py-4">
      <p class="text-sm font-medium text-red-700">{{ errorMessage }}</p>
      <button
        type="button"
        class="mt-2 text-sm text-red-600 underline hover:text-red-800"
        @click="fetchEmails"
      >
        Try again
      </button>
    </div>

    <!-- Empty state -->
    <div
      v-else-if="emails.length === 0"
      class="rounded-lg border border-dashed border-gray-300 bg-white px-8 py-16 text-center"
    >
      <svg
        class="mx-auto mb-4 h-12 w-12 text-gray-300"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.25"
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
      >
        <rect x="2" y="4" width="20" height="16" rx="2" />
        <path d="m2 7 10 7 10-7" />
      </svg>
      <p class="text-base font-medium text-gray-500">No emails yet</p>
      <p class="mt-1 text-sm text-gray-400">Your inbox is empty. Compose a new message to get started.</p>
    </div>

    <!-- Email list -->
    <div v-else class="card divide-y divide-gray-100 overflow-hidden">
      <button
        v-for="email in emails"
        :key="email.id"
        type="button"
        class="flex w-full items-start gap-4 px-5 py-4 text-left transition-colors hover:bg-gray-50 focus-visible:bg-gray-50"
        :class="{ 'bg-brand-50/40': email.unread === 1 }"
        @click="openEmail(email.id)"
      >
        <!-- Unread dot -->
        <span class="mt-1.5 flex-none">
          <span
            v-if="email.unread === 1"
            class="block h-2 w-2 rounded-full bg-brand-500"
            aria-label="Unread"
          />
          <span v-else class="block h-2 w-2" aria-hidden="true" />
        </span>

        <!-- Content -->
        <div class="min-w-0 flex-1">
          <div class="flex items-center justify-between gap-3">
            <span
              class="truncate text-sm"
              :class="email.unread === 1 ? 'font-semibold text-gray-900' : 'font-medium text-gray-700'"
            >
              {{ email.fromName || email.fromAddress }}
            </span>
            <div class="flex flex-none items-center gap-2">
              <span
                v-if="email.direction === 'sent'"
                class="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500"
              >
                Sent
              </span>
              <span class="text-xs text-gray-400">{{ relativeDate(email.createdAt) }}</span>
            </div>
          </div>
          <p
            class="mt-0.5 truncate text-sm"
            :class="email.unread === 1 ? 'text-gray-700' : 'text-gray-500'"
          >
            {{ email.subject || '(no subject)' }}
          </p>
        </div>
      </button>
    </div>
  </div>
</template>
