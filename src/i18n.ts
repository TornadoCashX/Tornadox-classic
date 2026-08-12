import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

import langs from '@/langs'

i18n.use(initReactI18next).init({
  resources: Object.fromEntries(Object.entries(langs).map(([locale, translation]) => [locale, { translation }])),
  lng: 'en',
  fallbackLng: 'en',
  interpolation: { escapeValue: false }
})

const syncDocumentLanguage = (language: string) => {
  document.documentElement.lang = language.split('-')[0]
}

syncDocumentLanguage(i18n.language)
i18n.on('languageChanged', syncDocumentLanguage)

export default i18n
