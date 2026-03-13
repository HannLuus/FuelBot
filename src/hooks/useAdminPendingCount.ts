import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

interface AdminPendingCount {
  registrations: number
  claims: number
  suggestions: number
  total: number
}

/**
 * Returns a count of all items waiting for admin attention.
 * Only fetches when the current user is an admin.
 */
export function useAdminPendingCount(): AdminPendingCount {
  const { isAdmin } = useAuthStore()
  const [counts, setCounts] = useState<AdminPendingCount>({
    registrations: 0,
    claims: 0,
    suggestions: 0,
    total: 0,
  })

  useEffect(() => {
    if (!isAdmin) return

    void (async () => {
      const [regRes, claimRes, sugRes] = await Promise.all([
        supabase
          .from('stations')
          .select('id', { count: 'exact', head: true })
          .not('verified_owner_id', 'is', null)
          .eq('is_verified', false)
          .is('registration_rejected_at', null),
        supabase
          .from('station_claims')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'PENDING'),
        supabase
          .from('station_suggestions')
          .select('id', { count: 'exact', head: true })
          .eq('status', 'pending'),
      ])

      const registrations = regRes.count ?? 0
      const claims = claimRes.count ?? 0
      const suggestions = sugRes.count ?? 0
      setCounts({ registrations, claims, suggestions, total: registrations + claims + suggestions })
    })()
  }, [isAdmin])

  return counts
}
