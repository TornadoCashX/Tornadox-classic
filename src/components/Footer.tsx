import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import FlagIcon from './FlagIcon'
import { TrndIcon } from './Icon'

const LOCALES = ['en', 'es', 'fr', 'ru', 'tr', 'uk', 'zh']

const printLang = (locale: string) => (locale === 'zh' ? 'CN' : locale.toUpperCase())

const Footer = () => {
  const { i18n } = useTranslation()
  const [isLangOpen, setIsLangOpen] = useState(false)
  const langRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!isLangOpen) return
    const onClickOutside = (e: MouseEvent) => {
      if (langRef.current && !langRef.current.contains(e.target as Node)) setIsLangOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsLangOpen(false)
    }
    document.addEventListener('mousedown', onClickOutside)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [isLangOpen])

  const changeLang = (locale: string) => {
    i18n.changeLanguage(locale)
    localStorage.setItem('lang', locale)
    setIsLangOpen(false)
  }

  return (
    <footer className="footer">
      <div className="container">
        <div className="level">
          <div className="level-right">
            <div className="level-item is-column">
              <div className="level-subitem">
                <div className="buttons">
                  <a
                    className="button is-icon"
                    href="https://dune.com/davidcaviar/tornado-cash"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Tornado Cash statistics on Dune"
                  >
                    <TrndIcon name="stats" />
                  </a>
                  <a
                    className="button is-icon"
                    href="https://github.com/williamdrivera/tornadocash-classic"
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="Tornado Cash source code on GitHub"
                  >
                    <TrndIcon name="github" />
                  </a>
                  <div className="break" />
                  <div
                    ref={langRef}
                    className={`dropdown dropdown-langs is-top-left is-mobile-modal ${isLangOpen ? 'is-active' : ''}`}
                  >
                    <button
                      type="button"
                      className="dropdown-trigger button is-icon"
                      aria-label="Select language"
                      aria-haspopup="listbox"
                      aria-expanded={isLangOpen}
                      onClick={() => setIsLangOpen((open) => !open)}
                    >
                      <FlagIcon code={i18n.language} className={`is-active-locale-${i18n.language}`} />
                    </button>
                    {isLangOpen && (
                      <div className="dropdown-menu">
                        <div role="listbox" className="dropdown-content">
                          {LOCALES.map((locale) => (
                            <button
                              type="button"
                              key={locale}
                              role="option"
                              aria-selected={locale === i18n.language}
                              className={`dropdown-item ${locale === i18n.language ? 'is-active' : ''}`}
                              onClick={() => changeLang(locale)}
                            >
                              <FlagIcon code={locale} /> {printLang(locale)}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </footer>
  )
}

export default Footer
