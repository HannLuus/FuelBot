import { useCallback, useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Upload } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { LANDING_SPONSORS_BUCKET, sponsorImagePublicUrl } from '@/hooks/useLandingSponsors'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'

export interface SponsorSlotRow {
  id: string
  slot_number: number
  company_name: string | null
  image_path: string | null
  link_url: string | null
  caption_en: string | null
  caption_my: string | null
  is_active: boolean
  starts_at: string | null
  ends_at: string | null
  sort_order: number
}

function toLocalDateInput(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toISOString().slice(0, 10)
}

function fromLocalDateInput(value: string): string | null {
  if (!value.trim()) return null
  return new Date(`${value}T00:00:00`).toISOString()
}

function isHttpsUrl(value: string): boolean {
  try {
    const u = new URL(value.trim())
    return u.protocol === 'https:'
  } catch {
    return false
  }
}

interface SlotDraft {
  company_name: string
  link_url: string
  caption_en: string
  caption_my: string
  is_active: boolean
  starts_at: string
  ends_at: string
}

function rowToDraft(row: SponsorSlotRow): SlotDraft {
  return {
    company_name: row.company_name?.trim() ?? '',
    link_url: row.link_url?.trim() ?? '',
    caption_en: row.caption_en?.trim() ?? '',
    caption_my: row.caption_my?.trim() ?? '',
    is_active: row.is_active,
    starts_at: toLocalDateInput(row.starts_at),
    ends_at: toLocalDateInput(row.ends_at),
  }
}

export function AdminSponsorsPanel() {
  const { t } = useTranslation()
  const [slots, setSlots] = useState<SponsorSlotRow[]>([])
  const [drafts, setDrafts] = useState<Record<number, SlotDraft>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [workingSlot, setWorkingSlot] = useState<number | null>(null)
  const [uploadingSlot, setUploadingSlot] = useState<number | null>(null)
  const [savedSlot, setSavedSlot] = useState<number | null>(null)
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({})

  const loadSlots = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error: fetchErr } = await supabase
      .from('landing_sponsor_slots')
      .select('*')
      .order('slot_number', { ascending: true })

    if (fetchErr) {
      setError(fetchErr.message)
      setLoading(false)
      return
    }

    const rows = (data ?? []) as SponsorSlotRow[]
    setSlots(rows)
    const nextDrafts: Record<number, SlotDraft> = {}
    for (const row of rows) {
      nextDrafts[row.slot_number] = rowToDraft(row)
    }
    setDrafts(nextDrafts)
    setLoading(false)
  }, [])

  useEffect(() => {
    void loadSlots()
  }, [loadSlots])

  function updateDraft(slotNumber: number, patch: Partial<SlotDraft>) {
    setDrafts((prev) => ({
      ...prev,
      [slotNumber]: { ...prev[slotNumber], ...patch },
    }))
    setSavedSlot(null)
  }

  async function handleUpload(slotNumber: number, file: File) {
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
      setError(t('admin.sponsorInvalidImageType'))
      return
    }
    setUploadingSlot(slotNumber)
    setError(null)
    try {
      const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
      const objectPath = `slot-${slotNumber}.${ext}`
      const { error: upErr } = await supabase.storage
        .from(LANDING_SPONSORS_BUCKET)
        .upload(objectPath, file, { upsert: true, contentType: file.type, cacheControl: '3600' })
      if (upErr) throw upErr

      const row = slots.find((s) => s.slot_number === slotNumber)
      if (!row) return

      const { error: updateErr } = await supabase
        .from('landing_sponsor_slots')
        .update({ image_path: objectPath, updated_at: new Date().toISOString() })
        .eq('id', row.id)
      if (updateErr) throw updateErr
      await loadSlots()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setUploadingSlot(null)
    }
  }

  async function saveSlot(slotNumber: number) {
    const row = slots.find((s) => s.slot_number === slotNumber)
    const draft = drafts[slotNumber]
    if (!row || !draft) return

    if (draft.is_active) {
      if (!draft.company_name.trim()) {
        setError(t('admin.sponsorNameRequired'))
        return
      }
      if (!row.image_path) {
        setError(t('admin.sponsorImageRequired'))
        return
      }
    }
    if (draft.link_url.trim() && !isHttpsUrl(draft.link_url)) {
      setError(t('admin.sponsorInvalidLink'))
      return
    }

    setWorkingSlot(slotNumber)
    setError(null)
    try {
      const { error: updateErr } = await supabase
        .from('landing_sponsor_slots')
        .update({
          company_name: draft.company_name.trim() || null,
          link_url: draft.link_url.trim() || null,
          caption_en: draft.caption_en.trim() || null,
          caption_my: draft.caption_my.trim() || null,
          is_active: draft.is_active,
          starts_at: fromLocalDateInput(draft.starts_at),
          ends_at: fromLocalDateInput(draft.ends_at),
          sort_order: slotNumber,
          updated_at: new Date().toISOString(),
        })
        .eq('id', row.id)
      if (updateErr) throw updateErr
      setSavedSlot(slotNumber)
      await loadSlots()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('errors.generic'))
    } finally {
      setWorkingSlot(null)
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Spinner />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-700">{t('admin.sponsorsIntro')}</p>
      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="grid gap-4 lg:grid-cols-2">
        {slots.map((row) => {
          const draft = drafts[row.slot_number]
          if (!draft) return null
          const previewUrl = row.image_path
            ? `${sponsorImagePublicUrl(row.image_path)}?v=${Date.now()}`
            : null

          return (
            <div key={row.id} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-gray-900">
                  {t('admin.sponsorSlotLabel', { n: row.slot_number })}
                </h3>
                <span className="text-xs text-gray-600">
                  {row.is_active && row.image_path ? row.company_name : t('admin.sponsorVacant')}
                </span>
              </div>

              {previewUrl ? (
                <img
                  src={previewUrl}
                  alt=""
                  className="mb-3 aspect-[16/7] w-full rounded-lg border border-gray-200 object-cover"
                />
              ) : (
                <div className="mb-3 flex aspect-[16/7] w-full items-center justify-center rounded-lg border border-dashed border-gray-300 bg-gray-50 text-xs text-gray-600">
                  {t('admin.sponsorVacant')}
                </div>
              )}

              <label className="mb-1 block text-xs font-medium text-gray-700">
                {t('admin.sponsorCompanyName')}
              </label>
              <input
                value={draft.company_name}
                onChange={(e) => updateDraft(row.slot_number, { company_name: e.target.value })}
                className="mb-2 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
              />

              <label className="mb-1 block text-xs font-medium text-gray-700">
                {t('admin.sponsorLinkUrl')}
              </label>
              <input
                value={draft.link_url}
                onChange={(e) => updateDraft(row.slot_number, { link_url: e.target.value })}
                placeholder="https://"
                className="mb-2 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
              />

              <div className="mb-2 grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    {t('admin.sponsorCaptionEn')}
                  </label>
                  <input
                    value={draft.caption_en}
                    onChange={(e) => updateDraft(row.slot_number, { caption_en: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    {t('admin.sponsorCaptionMy')}
                  </label>
                  <input
                    value={draft.caption_my}
                    onChange={(e) => updateDraft(row.slot_number, { caption_my: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
                  />
                </div>
              </div>

              <div className="mb-2 grid gap-2 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    {t('admin.sponsorStartsAt')}
                  </label>
                  <input
                    type="date"
                    value={draft.starts_at}
                    onChange={(e) => updateDraft(row.slot_number, { starts_at: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-700">
                    {t('admin.sponsorEndsAt')}
                  </label>
                  <input
                    type="date"
                    value={draft.ends_at}
                    onChange={(e) => updateDraft(row.slot_number, { ends_at: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
                  />
                </div>
              </div>

              <label className="mb-3 flex items-center gap-2 text-sm text-gray-800">
                <input
                  type="checkbox"
                  checked={draft.is_active}
                  onChange={(e) => updateDraft(row.slot_number, { is_active: e.target.checked })}
                />
                {t('admin.sponsorActive')}
              </label>

              <div className="flex flex-wrap gap-2">
                <input
                  ref={(el) => {
                    fileInputRefs.current[row.slot_number] = el
                  }}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0]
                    if (file) void handleUpload(row.slot_number, file)
                    e.target.value = ''
                  }}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  loading={uploadingSlot === row.slot_number}
                  onClick={() => fileInputRefs.current[row.slot_number]?.click()}
                >
                  <Upload className="h-4 w-4" />
                  {uploadingSlot === row.slot_number
                    ? t('admin.sponsorUploading')
                    : t('admin.sponsorUploadImage')}
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  loading={workingSlot === row.slot_number}
                  onClick={() => void saveSlot(row.slot_number)}
                >
                  {savedSlot === row.slot_number ? t('admin.sponsorSaved') : t('admin.sponsorSave')}
                </Button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
