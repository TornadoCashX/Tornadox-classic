import { Buffer } from 'buffer'

import React from 'react'
import ReactDOM from 'react-dom/client'

import App from './App'
import AppErrorBoundary from './components/AppErrorBoundary'
import './i18n'
import './styles/app.scss'

// utils/crypto.js and friends assume a global Buffer (as in the Nuxt/Webpack build).
if (!(globalThis as any).Buffer) {
  ;(globalThis as any).Buffer = Buffer
}

// WalletConnect's relay client (bundled inside @walletconnect/ethereum-provider, used by wagmi's
// walletConnect() connector) initializes its relay websocket eagerly whenever wagmi probes a
// connector's getProvider() - including during the automatic reconnect-on-mount scan that runs on
// every page load (see wagmi.ts), not just when the user actually picks WalletConnect. If that
// socket closes while a subscribe() call is in flight - which happens whenever the relay rejects
// the connection (e.g. an invalid/placeholder VITE_WALLETCONNECT_PROJECT_ID failing its origin
// allowlist check) or on ordinary network hiccups - the SDK rejects a promise nothing in our code
// ever touches directly, so it surfaces as an uncaught rejection with no actionable stack trace
// into our own code. This is a widely-reported issue in WalletConnect/Reown's own SDK (occurs
// even with valid project IDs on relay reconnects), not something we can catch at a call site -
// downgrade it to a console warning instead of letting it crash out as unhandled. Get a real
// project ID from https://cloud.walletconnect.com (see .env.example) to make this rare in
// practice; this guard just stops the SDK's own internal noise from looking like an app crash.
window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  const isWalletConnectInterruption =
    reason instanceof Error &&
    reason.message === 'Connection interrupted while trying to subscribe' &&
    /walletconnect|reown|relay/i.test(reason.stack || '')
  if (isWalletConnectInterruption) {
    event.preventDefault()
    console.warn('[WalletConnect relay] connection interrupted while subscribing (non-fatal):', reason)
  }
})

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
)
