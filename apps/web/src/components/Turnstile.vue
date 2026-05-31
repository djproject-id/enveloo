<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue'

const emit = defineEmits<{
  verified: [token: string]
}>()

const SITE_KEY = import.meta.env['VITE_TURNSTILE_SITE_KEY'] as string | undefined
const containerId = `cf-turnstile-${Math.random().toString(36).slice(2)}`
const widgetId = ref<string | null>(null)
const scriptLoaded = ref(false)
const isDev = !SITE_KEY

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string
          callback: (token: string) => void
          'expired-callback'?: () => void
          'error-callback'?: () => void
          theme?: 'light' | 'dark' | 'auto'
        },
      ) => string
      remove: (widgetId: string) => void
      reset: (widgetId: string) => void
    }
    onTurnstileLoad?: () => void
  }
}

function renderWidget() {
  if (!window.turnstile || !SITE_KEY) return

  widgetId.value = window.turnstile.render(`#${containerId}`, {
    sitekey: SITE_KEY,
    callback(token: string) {
      emit('verified', token)
    },
    'expired-callback'() {
      // Token expired; parent should disable submit until re-verified
    },
    theme: 'light',
  })
}

onMounted(() => {
  if (isDev) {
    // Dev mode: emit a dummy token immediately so forms work locally
    emit('verified', 'dev')
    return
  }

  // If the Turnstile script is already loaded (e.g. navigating back to page)
  if (window.turnstile) {
    scriptLoaded.value = true
    renderWidget()
    return
  }

  // Set up global callback that Turnstile script will call when ready
  window.onTurnstileLoad = () => {
    scriptLoaded.value = true
    renderWidget()
  }

  const script = document.createElement('script')
  script.src =
    'https://challenges.cloudflare.com/turnstile/v0/api.js?onload=onTurnstileLoad'
  script.async = true
  script.defer = true
  document.head.appendChild(script)
})

onUnmounted(() => {
  if (widgetId.value && window.turnstile) {
    window.turnstile.remove(widgetId.value)
    widgetId.value = null
  }
})
</script>

<template>
  <div v-if="isDev" class="rounded border border-dashed border-amber-400 bg-amber-50 px-3 py-2 text-xs text-amber-700">
    Turnstile bypassed in dev mode (no <code>VITE_TURNSTILE_SITE_KEY</code> set)
  </div>
  <div v-else :id="containerId" />
</template>
