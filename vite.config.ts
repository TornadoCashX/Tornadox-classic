import path from 'node:path'
import { fileURLToPath, pathToFileURL, URL } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))
const nodeModulesDir = path.resolve(projectRoot, 'node_modules')

const litProductionPackages = new Map([
  ['lit', { root: path.join(nodeModulesDir, 'lit'), entry: 'index.js' }],
  ['lit-html', { root: path.join(nodeModulesDir, 'lit-html'), entry: 'lit-html.js' }],
  ['lit-element', { root: path.join(nodeModulesDir, 'lit-element'), entry: 'index.js' }],
  [
    '@lit/reactive-element',
    { root: path.join(nodeModulesDir, '@lit/reactive-element'), entry: 'reactive-element.js' }
  ]
])

const resolveLitProductionEntry = (source: string) => {
  for (const [packageName, { root, entry }] of litProductionPackages) {
    if (source === packageName) return path.join(root, entry)
    if (source.startsWith(`${packageName}/`)) return path.join(root, source.slice(packageName.length + 1))
  }
  return null
}

// Reown's wallet UI is the only Lit consumer in this React app. Vite deliberately selects Lit's
// development conditional export while serving, which emits a generic warning even though the
// production build already uses Lit's production files. Resolve only those third-party Lit entry
// points to their production equivalents so React and the rest of the app keep normal dev checks.
const useLitProductionInDev = (): Plugin => ({
  name: 'use-lit-production-in-dev',
  apply: 'serve',
  enforce: 'pre',
  resolveId(source) {
    return resolveLitProductionEntry(source)
  }
})

// src/styles/components/_base.scss imports bulma/buefy with webpack sass-loader's legacy
// `~package/...` convention (this file was copied from the original Nuxt app). Modern Dart
// Sass doesn't strip `~` on its own, so resolve it here.
const tildeImporter = {
  findFileUrl(url: string) {
    if (!url.startsWith('~')) return null
    return pathToFileURL(path.join(nodeModulesDir, url.slice(1)))
  }
}

// The cache/proving-key bundles under public/ are raw zlib streams that app code decompresses.
// They are not real gzip-framed HTTP bodies, and the circuit is not JSON until after inflate.
// Static servers inferred the wrong headers from the historically used .gz suffix:
//   - Content-Encoding: gzip (from the outer .gz) - the browser tries to transparently gunzip
//     a non-gzip-framed stream and fails with ERR_CONTENT_DECODING_FAILED.
// Local assets now use .zlib, while this middleware also keeps older .gz deployments safe.
const fixGzipAssetHeaders = (): Plugin => ({
  name: 'fix-gzip-asset-headers-for-raw-blobs',
  configureServer(server) {
    server.middlewares.use(fixRawZlibResponseHeaders)
  },
  configurePreviewServer(server) {
    server.middlewares.use(fixRawZlibResponseHeaders)
  }
})

const fixRawZlibResponseHeaders = (
  req: { url?: string },
  res: { setHeader: (name: string, value: string | number | readonly string[]) => unknown },
  next: () => void
) => {
  if (req.url?.endsWith('.gz') || req.url?.endsWith('.zlib')) {
    const setHeader = res.setHeader.bind(res)
    res.setHeader = (name: string, value: string | number | readonly string[]) => {
      const lower = name.toLowerCase()
      if (lower === 'content-encoding') return res
      if (lower === 'content-type') return setHeader(name, 'application/octet-stream')
      return setHeader(name, value)
    }
  }
  next()
}

export default defineConfig({
  plugins: [
    react(),
    useLitProductionInDev(),
    fixGzipAssetHeaders(),
    // crypto/stream/util/buffer: legacy account crypto and Tornado hashing utilities still rely
    // on Node-compatible browser polyfills.
    // zlib: runtimeAssets uses inflateSync as a fallback when DecompressionStream is unavailable.
    nodePolyfills({ include: ['buffer', 'crypto', 'stream', 'util', 'zlib'] })
  ],
  resolve: {
    alias: {
      '@': path.resolve(projectRoot, 'src')
    }
  },
  optimizeDeps: {
    esbuildOptions: {
      plugins: [
        {
          name: 'use-lit-production-in-dev',
          setup(build) {
            build.onResolve(
              {
                filter: /^(lit|lit-html|lit-element|@lit\/reactive-element)(\/.*)?$/
              },
              ({ path: source }) => {
                const resolved = resolveLitProductionEntry(source)
                return resolved ? { path: resolved } : null
              }
            )
          }
        }
      ]
    }
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern',
        importers: [tildeImporter]
      }
    }
  }
})
