import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { lazy, Suspense, type ReactNode } from 'react'
import { WagmiProvider } from 'wagmi'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RainbowKitProvider, darkTheme, type DisclaimerComponent } from '@rainbow-me/rainbowkit'
import '@rainbow-me/rainbowkit/styles.css'

import { wagmiConfig } from '@/wagmi'
import { AppProvider, useAppContext } from '@/context/AppContext'
import { AccountProvider } from '@/context/AccountContext'
import { TransactionsProvider } from '@/context/TransactionsContext'
import { LoadingProvider } from '@/context/LoadingContext'
import { NoticeProvider } from '@/context/NoticeContext'
import { RelayerJobProvider } from '@/context/RelayerJobContext'
import { StatisticProvider } from '@/context/StatisticContext'

import Footer from './components/Footer'
import GlobalLoadingOverlay from './components/GlobalLoadingOverlay'
import Navbar from './components/Navbar'
import Notices from './components/Notices'
import RouteMetadata from './components/RouteMetadata'
import HomePage from './pages/HomePage'

const CompliancePage = lazy(() => import('./pages/CompliancePage'))
const AccountPage = lazy(() => import('./pages/AccountPage'))

// AppProvider calls wagmi's hooks internally (see hooks/useWallet.ts), so wagmi/react-query still
// need to sit above it. RainbowKit lives just inside AppProvider so its initialChain can follow
// the app's currently selected network instead of falling back to the first configured chain.
const queryClient = new QueryClient()

// Suppresses the connect modal's default "New to Ethereum wallets? Learn More" footer via
// RainbowKit's own documented appInfo.disclaimer slot (it replaces that default block outright -
// there's no separate prop to just hide it) rather than fighting it with CSS overrides.
const NoDisclaimer: DisclaimerComponent = () => null

const RainbowKitAppShell = ({ children }: { children: ReactNode }) => {
  const { netId } = useAppContext()

  return (
    <RainbowKitProvider
      initialChain={netId}
      // RainbowKit's own stock dark theme, deliberately unmodified: the connect modal keeps
      // the official look (its borders, radii, type and accent colours) rather than being
      // reskinned to this app's green/monospace/sharp-cornered style. Only the wallet *list*
      // is customised, and that lives in wagmi.ts - not here.
      theme={darkTheme()}
      modalSize="compact"
      appInfo={{ disclaimer: NoDisclaimer }}
    >
      {children}
    </RainbowKitProvider>
  )
}

const App = () => {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <LoadingProvider>
          <NoticeProvider>
            <AppProvider>
              <RainbowKitAppShell>
                <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                  <RouteMetadata />
                  <TransactionsProvider>
                    <AccountProvider>
                      <StatisticProvider>
                        <RelayerJobProvider>
                          <div className="wrapper">
                            <Navbar />
                            <section className="main-content section">
                              <div className="container">
                                <Suspense
                                  fallback={
                                    <div className="b-skeleton is-animated">
                                      <div className="b-skeleton-item" />
                                    </div>
                                  }
                                >
                                  <Routes>
                                    <Route path="/" element={<HomePage />} />
                                    <Route path="/compliance" element={<CompliancePage />} />
                                    <Route path="/account" element={<AccountPage />} />
                                    <Route path="*" element={<Navigate to="/" replace />} />
                                  </Routes>
                                </Suspense>
                              </div>
                            </section>
                            <Footer />
                          </div>
                        </RelayerJobProvider>
                      </StatisticProvider>
                    </AccountProvider>
                  </TransactionsProvider>
                </BrowserRouter>
                <Notices />
              </RainbowKitAppShell>
            </AppProvider>
          </NoticeProvider>
          <GlobalLoadingOverlay />
        </LoadingProvider>
      </QueryClientProvider>
    </WagmiProvider>
  )
}

export default App
