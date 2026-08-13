import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const DEFAULT_TITLE = 'Tornado Cash Privacy Transactions | Crypto Mixer'
const DEFAULT_DESCRIPTION =
  'Use an independent Tornado Cash app for privacy transactions, private deposits, withdrawals and compliance reports on Ethereum, BNB Chain, Polygon, Arbitrum, Optimism, Gnosis Chain, Avalanche and Ethereum Classic.'
const DEFAULT_KEYWORDS =
  'tornadocash, tornado cash, Tornado Cash, Crypto Mixer, crypto mixer, cryptocurrency mixer, privacy transactions, private transactions, 隐私交易, Ethereum privacy, BNB Chain privacy, BSC privacy, Polygon privacy, Arbitrum privacy, Optimism privacy, Gnosis Chain privacy, Avalanche privacy, Ethereum Classic privacy, Sepolia testnet, private deposits, private withdrawals, deposit, withdraw, compliance report, zero-knowledge proofs, zk-SNARK, relayers, non-custodial smart contracts'

const SITE_URL = 'https://tornadox.one'

const PAGE_METADATA: Record<
  string,
  { title: string; description: string; keywords: string; robots: string; url: string }
> = {
  '/': {
    title: DEFAULT_TITLE,
    description: DEFAULT_DESCRIPTION,
    keywords: DEFAULT_KEYWORDS,
    robots: 'index, follow',
    url: `${SITE_URL}/`
  },
  '/compliance': {
    title: 'Tornado Cash Compliance Tool | Transaction History Report',
    description:
      'Generate a Tornado Cash compliance report for private deposit and withdrawal history on supported Ethereum, BNB Chain, Polygon, Arbitrum, Optimism, Gnosis Chain, Avalanche and Ethereum Classic pools.',
    keywords:
      'tornadocash compliance, tornado cash compliance, Tornado Cash compliance tool, compliance report, transaction history report, private transaction report, deposit history, withdrawal history, private note, cryptographic proof, zero-knowledge proofs',
    robots: 'index, follow',
    url: `${SITE_URL}/compliance`
  },
  '/account': {
    title: 'Tornado Cash Note Account',
    description:
      'Manage encrypted Tornado Cash note account backups in the browser using an independent web app.',
    keywords:
      'Tornado Cash account, note account, encrypted notes, private notes, Ethereum blockchain, secure note backup',
    robots: 'noindex, nofollow',
    url: `${SITE_URL}/account`
  }
}

const RouteMetadata = () => {
  const { pathname } = useLocation()

  useEffect(() => {
    const metadata = PAGE_METADATA[pathname] || PAGE_METADATA['/']
    document.title = metadata.title
    document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute('content', metadata.description)
    document.querySelector<HTMLMetaElement>('meta[name="keywords"]')?.setAttribute('content', metadata.keywords)
    document.querySelector<HTMLMetaElement>('meta[name="robots"]')?.setAttribute('content', metadata.robots)
    document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.setAttribute('href', metadata.url)
    document.querySelector<HTMLMetaElement>('meta[property="og:title"]')?.setAttribute('content', metadata.title)
    document.querySelector<HTMLMetaElement>('meta[property="og:description"]')?.setAttribute('content', metadata.description)
    document.querySelector<HTMLMetaElement>('meta[property="og:url"]')?.setAttribute('content', metadata.url)
    document.querySelector<HTMLMetaElement>('meta[name="twitter:title"]')?.setAttribute('content', metadata.title)
    document.querySelector<HTMLMetaElement>('meta[name="twitter:description"]')?.setAttribute('content', metadata.description)
  }, [pathname])

  return null
}

export default RouteMetadata
