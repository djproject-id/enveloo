<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { api, ApiError } from '../lib/api'

interface Invite {
  id: string
  code: string
  maxUses: number
  uses: number
  createdAt: string
}

const invites = ref<Invite[]>([])
const loading = ref(false)
const listError = ref('')

// Create form
const maxUses = ref(1)
const creating = ref(false)
const createError = ref('')
const newlyCreatedId = ref<string | null>(null)

// Delete tracking
const deletingId = ref<string | null>(null)

// Copy tracking
const copiedId = ref<string | null>(null)

async function fetchInvites() {
  loading.value = true
  listError.value = ''
  try {
    invites.value = await api.get<Invite[]>('/api/admin/invites')
  } catch (err) {
    if (err instanceof ApiError) {
      listError.value = err.message
    } else {
      listError.value = 'Failed to load invites.'
    }
  } finally {
    loading.value = false
  }
}

async function handleCreate() {
  createError.value = ''
  creating.value = true
  newlyCreatedId.value = null
  try {
    const created = await api.post<{ id: string; code: string; maxUses: number }>(
      '/api/admin/invites',
      { maxUses: maxUses.value },
    )
    await fetchInvites()
    newlyCreatedId.value = created.id
    maxUses.value = 1
  } catch (err) {
    if (err instanceof ApiError) {
      createError.value = err.message
    } else {
      createError.value = 'Failed to create invite.'
    }
  } finally {
    creating.value = false
  }
}

async function handleDelete(id: string) {
  deletingId.value = id
  if (newlyCreatedId.value === id) {
    newlyCreatedId.value = null
  }
  try {
    await api.del<{ deleted: boolean }>(`/api/admin/invites/${id}`)
    await fetchInvites()
  } catch (err) {
    if (err instanceof ApiError) {
      listError.value = err.message
    } else {
      listError.value = 'Failed to delete invite.'
    }
  } finally {
    deletingId.value = null
  }
}

async function handleCopy(invite: Invite) {
  try {
    await navigator.clipboard.writeText(invite.code)
    copiedId.value = invite.id
    setTimeout(() => {
      if (copiedId.value === invite.id) {
        copiedId.value = null
      }
    }, 2000)
  } catch {
    // Clipboard not available — silently ignore
  }
}

onMounted(fetchInvites)
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 py-8 sm:px-6">
    <div class="mb-6">
      <h1 class="text-xl font-semibold text-gray-900">Invites</h1>
      <p class="mt-1 text-sm text-gray-500">Create and manage invite codes for new user registration.</p>
    </div>

    <!-- Invite list -->
    <div class="mb-8">
      <h2 class="mb-3 text-sm font-medium text-gray-700">Active invite codes</h2>

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
        v-else-if="invites.length === 0"
        class="rounded-lg border border-dashed border-gray-300 bg-white px-6 py-8 text-center text-sm text-gray-400"
      >
        No invite codes yet. Create one below.
      </div>

      <!-- List -->
      <div v-else class="card divide-y divide-gray-100 overflow-hidden">
        <div
          v-for="invite in invites"
          :key="invite.id"
          class="flex items-center justify-between gap-4 px-5 py-3 transition-colors"
          :class="newlyCreatedId === invite.id ? 'bg-green-50' : ''"
        >
          <div class="flex min-w-0 flex-1 items-center gap-3">
            <!-- Code pill -->
            <code class="rounded bg-gray-100 px-2 py-0.5 font-mono text-sm text-gray-800 select-all">{{ invite.code }}</code>
            <!-- Copy button -->
            <button
              type="button"
              class="flex-none text-xs text-brand-600 hover:text-brand-800 transition-colors disabled:opacity-40"
              :disabled="copiedId === invite.id"
              @click="handleCopy(invite)"
              :aria-label="`Copy invite code ${invite.code}`"
            >
              <span v-if="copiedId === invite.id">Copied!</span>
              <span v-else>Copy</span>
            </button>
            <!-- Usage -->
            <span class="text-xs text-gray-400">{{ invite.uses }} / {{ invite.maxUses }} uses</span>
            <!-- New badge -->
            <span
              v-if="newlyCreatedId === invite.id"
              class="rounded bg-green-100 px-1.5 py-0.5 text-xs font-medium text-green-700"
            >
              New
            </span>
          </div>
          <button
            type="button"
            class="flex-none text-sm text-red-500 hover:text-red-700 transition-colors disabled:opacity-40"
            :disabled="deletingId === invite.id"
            @click="handleDelete(invite.id)"
          >
            <span v-if="deletingId === invite.id">Deleting...</span>
            <span v-else>Delete</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Create form -->
    <div class="card px-6 py-5">
      <h2 class="mb-4 text-sm font-medium text-gray-700">Create an invite</h2>
      <form class="space-y-4" novalidate @submit.prevent="handleCreate">
        <div class="form-group max-w-xs">
          <label for="invite-max-uses" class="label">Max uses</label>
          <input
            id="invite-max-uses"
            v-model.number="maxUses"
            type="number"
            min="1"
            max="1000"
            required
            class="input"
            placeholder="1"
            :disabled="creating"
          />
        </div>
        <p class="text-xs text-gray-400">How many times this code can be used to register a new account (1–1000).</p>

        <!-- Inline error -->
        <p v-if="createError" role="alert" class="error-text">{{ createError }}</p>

        <button
          type="submit"
          class="btn-primary"
          :disabled="creating || maxUses < 1 || maxUses > 1000"
        >
          <span v-if="creating">Creating...</span>
          <span v-else>Create invite</span>
        </button>
      </form>
    </div>
  </div>
</template>
