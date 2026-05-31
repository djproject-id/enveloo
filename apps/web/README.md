# Enveloo Web

Vue 3 SPA frontend for the Enveloo email service.

## Stack

- Vue 3 (`<script setup>` + TypeScript, strict mode)
- Vite
- vue-router 4
- Pinia
- Tailwind CSS v3

## Setup

```bash
npm install
```

Copy the env example and fill in your Cloudflare Turnstile site key:

```bash
cp .env.example .env
# Edit .env and set VITE_TURNSTILE_SITE_KEY=<your-key>
# If left blank, a dev bypass is used automatically.
```

## Development

Requires the Enveloo Worker running at `http://localhost:8787`:

```bash
# In apps/worker:
npm run dev

# In apps/web:
npm run dev
```

The Vite dev server proxies `/api` requests to `:8787`.

## Build

```bash
npm run build
```

Output is written to `dist/`. Serve it from your Cloudflare Worker or any static host.
