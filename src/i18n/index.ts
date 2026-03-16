import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en'
import my from './locales/my'

const savedLang = localStorage.getItem('fuelbot_lang') || 'my'

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      my: { translation: my },
    },
    lng: savedLang,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
  })

export default i18n
