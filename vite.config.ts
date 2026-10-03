import { defineConfig, loadEnv } from 'vite'
import { fileURLToPath } from 'node:url'
import { emeraldHtml, readLqip, validCa } from './web/build/html.js'
import { mockApi } from './web/mock/plugin.js'

const r = (p: string) => fileURLToPath(new URL(p, import.meta.url))

export default defineConfig(({ mode }) => {
  // Prefix '' = server variables too (they are only read here; the bundle only gets what is defined below).
  const env = { ...loadEnv(mode, r('.'), ''), ...process.env }
  // One source for the CA: EMERALD_TOKEN_ADDRESS (the server one). VITE_ overrides it only if set on purpose.
  const ca = validCa(env.VITE_EMERALD_TOKEN_ADDRESS || env.EMERALD_TOKEN_ADDRESS || '')
  const github = env.VITE_GITHUB_URL || ''
  const site = env.SITE_URL || ''
  return {
    root: r('./web'),
    publicDir: r('./web/public'),
    envDir: r('.'),
    envPrefix: 'VITE_',
    resolve: { alias: { '@engine': r('./engine') } },
    define: { 'import.meta.env.VITE_EMERALD_TOKEN_ADDRESS': JSON.stringify(ca) },
    build: {
      outDir: r('./dist'),
      emptyOutDir: true,
      target: 'es2022',
      // Two pages: Emerald.exe, the retro desktop (/), and the classic night landing (/classic/, noindex).
      rolldownOptions: { input: { main: r('./web/index.html'), classic: r('./web/classic/index.html') } },
    },
    // Outside the mock, /api goes to the plan 1 local API (npx tsx scripts/dev-api.ts, port 8787) or to EMERALD_API_URL.
    // Toward the local API the Host is NOT rewritten: the plan 1 SIWE takes the domain from the request URL
    // (new URL(req.url).host) and it must match the page's location.host. changeOrigin only for a remote API.
    server:
      mode === 'mock'
        ? {}
        : { proxy: { '/api': { target: env.EMERALD_API_URL || 'http://localhost:8787', changeOrigin: Boolean(env.EMERALD_API_URL) } } },
    plugins: [
      emeraldHtml(() => ({ ca, github, site, lqip: readLqip(r('./web/public/plates/lqip.json')) })),
      ...(mode === 'mock' ? [mockApi()] : []),
    ],
  }
})
