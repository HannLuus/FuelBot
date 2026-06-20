import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export const LANDING_SPONSORS_BUCKET = 'landing-sponsors'

export interface LandingSponsor {
  id: string
  slot_number: number
  company_name: string | null
  image_path: string | null
  link_url: string | null
  caption_en: string | null
  caption_my: string | null
  sort_order: number
  image_url: string | null
}

export function sponsorImagePublicUrl(imagePath: string, cacheBust?: number): string {
  const { data } = supabase.storage.from(LANDING_SPONSORS_BUCKET).getPublicUrl(imagePath)
  const base = data.publicUrl
  if (cacheBust != null) return `${base}?v=${cacheBust}`
  return base
}

export function useLandingSponsors() {
  const [sponsors, setSponsors] = useState<LandingSponsor[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      const { data } = await supabase
        .from('landing_sponsor_slots')
        .select('id, slot_number, company_name, image_path, link_url, caption_en, caption_my, sort_order')
        .eq('is_active', true)
        .not('image_path', 'is', null)
        .order('sort_order', { ascending: true })

      if (cancelled) return
      const rows = (data ?? []) as Omit<LandingSponsor, 'image_url'>[]
      setSponsors(
        rows.map((row) => ({
          ...row,
          image_url: row.image_path ? sponsorImagePublicUrl(row.image_path) : null,
        })),
      )
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return { sponsors, loading }
}
