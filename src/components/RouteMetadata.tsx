import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

const DEFAULT_DESCRIPTION =
  'Access the Tornado Cash interface for deposits and withdrawals across supported EVM networks using non-custodial smart contracts and zero-knowledge proofs.'

const PAGE_METADATA: Record<string, { title: string; description: string }> = {
  '/': {
    title: 'Tornado Cash Interface | Deposit & Withdraw',
    description: DEFAULT_DESCRIPTION
  },
  '/compliance': {
    title: 'Tornado Cash Compliance Tool | Verify Transaction History',
    description:
      'Generate a cryptographically verifiable Tornado Cash compliance report for deposit and withdrawal history using your private note.'
  },
  '/account': {
    title: 'Tornado Cash Account',
    description: DEFAULT_DESCRIPTION
  }
}

const RouteMetadata = () => {
  const { pathname } = useLocation()

  useEffect(() => {
    const metadata = PAGE_METADATA[pathname] || PAGE_METADATA['/']
    document.title = metadata.title
    document.querySelector<HTMLMetaElement>('meta[name="description"]')?.setAttribute('content', metadata.description)
  }, [pathname])

  return null
}

export default RouteMetadata
