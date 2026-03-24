import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { supabase } from '@/lib/supabase'

export function ContactPage() {
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const lang = i18n.language === 'my' ? 'my' : 'en'
  const [contactForm, setContactForm] = useState({
    name: '',
    email: '',
    subject: '',
    message: '',
  })
  const [contactScreenshot, setContactScreenshot] = useState<{
    base64: string
    mimeType: string
    fileName: string
  } | null>(null)
  const [contactSending, setContactSending] = useState(false)
  const [contactResult, setContactResult] = useState<'success' | 'error' | null>(null)
  const [contactError, setContactError] = useState<string | null>(null)

  async function handleContactScreenshotChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) {
      setContactScreenshot(null)
      return
    }
    if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) {
      setContactError(t('landing.contactInvalidImage'))
      e.target.value = ''
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setContactError(t('landing.contactImageTooLarge'))
      e.target.value = ''
      return
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(new Error('READ_FAILED'))
        reader.onload = () => resolve(String(reader.result ?? ''))
        reader.readAsDataURL(file)
      })
      const m = dataUrl.match(/^data:(.+);base64,(.+)$/)
      if (!m) throw new Error('INVALID_DATA_URL')
      setContactScreenshot({
        mimeType: m[1],
        base64: m[2],
        fileName: file.name,
      })
      setContactError(null)
    } catch {
      setContactError(t('landing.contactInvalidImage'))
    } finally {
      e.target.value = ''
    }
  }

  async function submitContactForm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    if (contactSending) return
    setContactSending(true)
    setContactResult(null)
    setContactError(null)
    try {
      const { data, error } = await supabase.functions.invoke('contact-us', {
        body: {
          name: contactForm.name.trim(),
          email: contactForm.email.trim(),
          subject: contactForm.subject.trim(),
          message: contactForm.message.trim(),
          screenshot_base64: contactScreenshot?.base64 ?? null,
          screenshot_mime_type: contactScreenshot?.mimeType ?? null,
          screenshot_filename: contactScreenshot?.fileName ?? null,
          locale: lang,
          page: 'contact',
        },
      })
      if (error) throw error
      if (data?.error) throw new Error(String(data.error))
      setContactResult('success')
      setContactForm({ name: '', email: '', subject: '', message: '' })
      setContactScreenshot(null)
    } catch (err) {
      setContactResult('error')
      setContactError(err instanceof Error ? err.message : t('landing.contactError'))
    } finally {
      setContactSending(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <Button size="sm" variant="secondary" onClick={() => navigate('/landing')}>
            <ArrowLeft className="h-4 w-4" />
            {t('common.close')}
          </Button>
          <h1 className="text-lg font-semibold text-gray-900">{t('landing.contactTitle')}</h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-6">
        <section className="rounded-2xl bg-white p-6 shadow-sm">
          <p className="text-sm text-gray-700">{t('landing.contactBody')}</p>
          <form className="mt-4 space-y-3" onSubmit={submitContactForm}>
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">{t('landing.contactNameLabel')}</label>
                <input
                  type="text"
                  required
                  value={contactForm.name}
                  onChange={(evt) => setContactForm((prev) => ({ ...prev, name: evt.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder={t('landing.contactNamePlaceholder')}
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-gray-700">{t('landing.contactEmailLabel')}</label>
                <input
                  type="email"
                  required
                  value={contactForm.email}
                  onChange={(evt) => setContactForm((prev) => ({ ...prev, email: evt.target.value }))}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder={t('landing.contactEmailPlaceholder')}
                />
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">{t('landing.contactSubjectLabel')}</label>
              <input
                type="text"
                required
                value={contactForm.subject}
                onChange={(evt) => setContactForm((prev) => ({ ...prev, subject: evt.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder={t('landing.contactSubjectPlaceholder')}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">{t('landing.contactMessageLabel')}</label>
              <textarea
                required
                rows={5}
                value={contactForm.message}
                onChange={(evt) => setContactForm((prev) => ({ ...prev, message: evt.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-600 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder={t('landing.contactMessagePlaceholder')}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">{t('landing.contactScreenshotLabel')}</label>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                onChange={handleContactScreenshotChange}
                className="block w-full text-sm text-gray-700"
              />
              <p className="mt-1 text-xs text-gray-700">{t('landing.contactScreenshotHint')}</p>
              {contactScreenshot ? (
                <p className="mt-1 text-xs font-medium text-green-700">
                  {t('landing.contactScreenshotReady', { file: contactScreenshot.fileName })}
                </p>
              ) : null}
            </div>
            {contactResult === 'success' ? <p className="text-sm text-green-700">{t('landing.contactSuccess')}</p> : null}
            {contactResult === 'error' ? <p className="text-sm text-red-700">{contactError ?? t('landing.contactError')}</p> : null}
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" size="sm" loading={contactSending}>
                {contactSending ? t('landing.contactSending') : t('landing.contactSubmit')}
              </Button>
              <Link to={`mailto:${t('landing.contactEmail')}`} className="text-sm text-blue-600 underline">
                {t('landing.contactEmail')}
              </Link>
            </div>
          </form>
        </section>
      </main>
    </div>
  )
}

