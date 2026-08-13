import { lazy, Suspense, useState } from 'react'
import { useTranslation } from 'react-i18next'

import DepositTab from '@/components/DepositTab'
import Statistics from '@/components/Statistics'
import Transactions from '@/components/Transactions'

const WithdrawTab = lazy(() => import('@/components/WithdrawTab'))

const HomePage = () => {
  const { t } = useTranslation()
  const [activeTab, setActiveTab] = useState<'deposit' | 'withdraw'>('deposit')

  return (
    <>
      <h1 className="is-sr-only">Tornado Cash</h1>
      <div className="columns">
        <div className="column is-half">
          <div className="b-tabs is-tornado">
            <div className="tabs">
              <ul role="tablist">
                <li className={activeTab === 'deposit' ? 'is-active' : ''}>
                  <button type="button" role="tab" aria-selected={activeTab === 'deposit'} onClick={() => setActiveTab('deposit')}>{t('deposit')}</button>
                </li>
                <li className={activeTab === 'withdraw' ? 'is-active' : ''}>
                  <button type="button" role="tab" aria-selected={activeTab === 'withdraw'} onClick={() => setActiveTab('withdraw')}>{t('withdraw')}</button>
                </li>
              </ul>
            </div>
            <div className="tab-content">
              {activeTab === 'deposit' ? (
                <DepositTab />
              ) : (
                <Suspense
                  fallback={
                    <div className="b-skeleton is-animated">
                      <div className="b-skeleton-item" />
                    </div>
                  }
                >
                  <WithdrawTab />
                </Suspense>
              )}
            </div>
          </div>
        </div>
        <Statistics />
      </div>
      <Transactions />
      <section className="seo-content" aria-labelledby="privacy-transactions-title">
        <h2 id="privacy-transactions-title">{t('seo.home.title')}</h2>
        <p>{t('seo.home.description')}</p>
        <div className="seo-faq" aria-label={t('seo.faq.label')}>
          <details>
            <summary>{t('seo.faq.whatIsTornado.question')}</summary>
            <p>{t('seo.faq.whatIsTornado.answer')}</p>
          </details>
          <details>
            <summary>{t('seo.faq.cryptoMixer.question')}</summary>
            <p>{t('seo.faq.cryptoMixer.answer')}</p>
          </details>
          <details>
            <summary>{t('seo.faq.supportedChains.question')}</summary>
            <p>{t('seo.faq.supportedChains.answer')}</p>
          </details>
          <details>
            <summary>{t('seo.faq.privateDeposits.question')}</summary>
            <p>{t('seo.faq.privateDeposits.answer')}</p>
          </details>
        </div>
      </section>
    </>
  )
}

export default HomePage
