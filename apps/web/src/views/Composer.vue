<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api, ApiError } from '../lib/api'

interface Account {
  id: string
  email: string
  createdAt: string
}

const accounts = ref<Account[]>([])
const from = ref('')
const to = ref('')
const subject = ref('')
const body = ref('')
const loading = ref(false)
const errorMessage = ref('')
const successId = ref('')

async function fetchAccounts() {
  try {
    const data = await api.get<Account[]>('/api/accounts')
    accounts.value = data
    if (data.length > 0 && data[0]) {
      from.value = data[0].email
    }
  } catch {
    // If we can't load accounts, the select will be empty but user can still see an error after submit
  }
}

async function handleSubmit() {
  errorMessage.value = ''
  loading.value = true
  try {
    const result = await api.post<{ id: string }>('/api/emails/send', {
      from: from.value,
      to: to.value,
      subject: subject.value,
      text: body.value,
    })
    successId.value = result.id
  } catch (err) {
    if (err instanceof ApiError) {
      errorMessage.value = err.message
    } else {
      errorMessage.value = 'Failed to send email. Please try again.'
    }
  } finally {
    loading.value = false
  }
}

onMounted(fetchAccounts)
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 py-8 sm:px-6">
    <div class="mb-6">
      <h1 class="text-xl font-semibold text-gray-900">Compose</h1>
    </div>

    <!-- Success state -->
    <div v-if="successId" class="card px-6 py-8 text-center">
      <div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-50">
        <svg
          class="h-6 w-6 text-green-600"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
          aria-hidden="true"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <p class="text-base font-medium text-gray-900">Email sent</p>
      <p class="mt-1 text-sm text-gray-500">Message ID: {{ successId }}</p>
      <router-link to="/" class="btn-primary mt-6 inline-flex no-underline">
        Back to Inbox
      </router-link>
    </div>

    <!-- Compose form -->
    <div v-else class="card px-6 py-6">
      <form class="space-y-5" novalidate @submit.prevent="handleSubmit">
        <!-- From -->
        <div class="form-group">
          <label for="compose-from" class="label">From</label>
          <select
            id="compose-from"
            v-model="from"
            class="input"
            :disabled="loading"
          >
            <option v-for="account in accounts" :key="account.id" :value="account.email">
              {{ account.email }}
            </option>
            <option v-if="accounts.length === 0" value="" disabled>
              No accounts available
            </option>
          </select>
        </div>

        <!-- To -->
        <div class="form-group">
          <label for="compose-to" class="label">To</label>
          <input
            id="compose-to"
            v-model="to"
            type="email"
            autocomplete="off"
            required
            class="input"
            placeholder="recipient@example.com"
            :disabled="loading"
          />
        </div>

        <!-- Subject -->
        <div class="form-group">
          <label for="compose-subject" class="label">Subject</label>
          <input
            id="compose-subject"
            v-model="subject"
            type="text"
            class="input"
            placeholder="Subject"
            :disabled="loading"
          />
        </div>

        <!-- Body -->
        <div class="form-group">
          <label for="compose-body" class="label">Message</label>
          <textarea
            id="compose-body"
            v-model="body"
            rows="10"
            class="input resize-y"
            placeholder="Write your message..."
            :disabled="loading"
          />
        </div>

        <!-- Error -->
        <p v-if="errorMessage" role="alert" class="error-text">
          {{ errorMessage }}
        </p>

        <!-- Actions -->
        <div class="flex items-center justify-between gap-3 pt-1">
          <router-link to="/" class="btn-ghost text-sm no-underline">
            Cancel
          </router-link>
          <button
            type="submit"
            class="btn-primary"
            :disabled="loading || accounts.length === 0"
          >
            <span v-if="loading">Sending...</span>
            <span v-else>Send</span>
          </button>
        </div>
      </form>
    </div>
  </div>
</template>
