<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api, ApiError } from '../lib/api'

interface Account {
  id: string
  email: string
  createdAt: string
}

const accounts = ref<Account[]>([])
const loading = ref(false)
const listError = ref('')

// Create form
const localPart = ref('')
const domain = ref('')
const creating = ref(false)
const createError = ref('')

// Delete tracking
const deletingId = ref<string | null>(null)

async function fetchAccounts() {
  loading.value = true
  listError.value = ''
  try {
    accounts.value = await api.get<Account[]>('/api/accounts')
  } catch (err) {
    if (err instanceof ApiError) {
      listError.value = err.message
    } else {
      listError.value = 'Failed to load accounts.'
    }
  } finally {
    loading.value = false
  }
}

async function handleCreate() {
  createError.value = ''
  creating.value = true
  try {
    await api.post<{ id: string; email: string }>('/api/accounts', {
      localPart: localPart.value.trim(),
      domain: domain.value.trim(),
    })
    localPart.value = ''
    domain.value = ''
    await fetchAccounts()
  } catch (err) {
    if (err instanceof ApiError) {
      createError.value = err.message
    } else {
      createError.value = 'Failed to create account.'
    }
  } finally {
    creating.value = false
  }
}

async function handleDelete(id: string) {
  deletingId.value = id
  try {
    await api.del<{ deleted: boolean }>(`/api/accounts/${id}`)
    await fetchAccounts()
  } catch (err) {
    if (err instanceof ApiError) {
      listError.value = err.message
    } else {
      listError.value = 'Failed to delete account.'
    }
  } finally {
    deletingId.value = null
  }
}

onMounted(fetchAccounts)
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 py-8 sm:px-6">
    <div class="mb-6">
      <h1 class="text-xl font-semibold text-gray-900">Accounts</h1>
      <p class="mt-1 text-sm text-gray-500">Manage the email addresses tied to your account.</p>
    </div>

    <!-- Account list -->
    <div class="mb-8">
      <h2 class="mb-3 text-sm font-medium text-gray-700">Your addresses</h2>

      <!-- Loading -->
      <div v-if="loading" class="flex items-center gap-2 py-4 text-sm text-gray-500">
        <svg class="h-4 w-4 animate-spin text-brand-500" fill="none" viewBox="0 0 24 24" aria-hidden="true">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4" />
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
        Loading...
      </div>

      <!-- List error -->
      <p v-else-if="listError" role="alert" class="error-text mb-3">{{ listError }}</p>

      <!-- Empty -->
      <div
        v-else-if="accounts.length === 0"
        class="rounded-lg border border-dashed border-gray-300 bg-white px-6 py-8 text-center text-sm text-gray-400"
      >
        No email addresses yet. Add one below.
      </div>

      <!-- List -->
      <div v-else class="card divide-y divide-gray-100 overflow-hidden">
        <div
          v-for="account in accounts"
          :key="account.id"
          class="flex items-center justify-between gap-4 px-5 py-3"
        >
          <span class="truncate text-sm font-medium text-gray-800">{{ account.email }}</span>
          <button
            type="button"
            class="flex-none text-sm text-red-500 hover:text-red-700 transition-colors disabled:opacity-40"
            :disabled="deletingId === account.id"
            @click="handleDelete(account.id)"
          >
            <span v-if="deletingId === account.id">Deleting...</span>
            <span v-else>Delete</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Create form -->
    <div class="card px-6 py-5">
      <h2 class="mb-4 text-sm font-medium text-gray-700">Add an address</h2>
      <form class="space-y-4" novalidate @submit.prevent="handleCreate">
        <div class="flex gap-3">
          <!-- Local part -->
          <div class="form-group flex-1">
            <label for="acc-local" class="label">Local part</label>
            <input
              id="acc-local"
              v-model="localPart"
              type="text"
              autocomplete="off"
              required
              class="input"
              placeholder="alice"
              :disabled="creating"
            />
          </div>
          <!-- Separator -->
          <div class="flex flex-none items-end pb-2 text-gray-400 text-lg font-light">@</div>
          <!-- Domain -->
          <div class="form-group flex-1">
            <label for="acc-domain" class="label">Domain</label>
            <input
              id="acc-domain"
              v-model="domain"
              type="text"
              autocomplete="off"
              required
              class="input"
              placeholder="example.com"
              :disabled="creating"
            />
          </div>
        </div>
        <p class="text-xs text-gray-400">The domain must be one of the allowed domains configured on this server.</p>

        <!-- Inline error -->
        <p v-if="createError" role="alert" class="error-text">{{ createError }}</p>

        <button
          type="submit"
          class="btn-primary"
          :disabled="creating || !localPart.trim() || !domain.trim()"
        >
          <span v-if="creating">Adding...</span>
          <span v-else>Add address</span>
        </button>
      </form>
    </div>
  </div>
</template>
