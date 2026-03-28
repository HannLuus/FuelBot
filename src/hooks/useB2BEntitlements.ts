import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

export interface B2BRoute {
  id: string
  name: string
}

export interface B2BEntitlements {
  hasNationalView: boolean
  routeIds: string[]
  routes: B2BRoute[]
  routeAccessValidUntil: Date | null
}

export function useB2BEntitlements(): B2BEntitlements & { loading: boolean, refresh: () => Promise<void> } {
  const user = useAuthStore((s) => s.user)
  const [entitlements, setEntitlements] = useState<B2BEntitlements>({
    hasNationalView: false,
    routeIds: [],
    routes: [],
    routeAccessValidUntil: null,
  })
  const [loading, setLoading] = useState(true)

  const fetchEntitlements = useCallback(async () => {
    if (!user?.id) {
      setEntitlements({ hasNationalView: false, routeIds: [], routes: [], routeAccessValidUntil: null })
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('get_my_b2b_entitlements')
      if (error) {
        setEntitlements({ hasNationalView: false, routeIds: [], routes: [], routeAccessValidUntil: null })
        return
      }
      const rows = (data ?? []) as {
        plan_type: string
        route_id: string | null
        route_name: string | null
        valid_until: string
      }[]
      const hasNationalView = rows.some((r) => r.plan_type === 'national_view')
      const routeRows = rows.filter((r) => r.plan_type === 'route_view')
      const byRouteId = new Map<string, { id: string; name: string; validUntilMs: number }>()
      for (const r of routeRows) {
        if (!r.route_id || !r.route_name) continue
        const ms = new Date(r.valid_until).getTime()
        const prev = byRouteId.get(r.route_id)
        if (!prev || ms > prev.validUntilMs) {
          byRouteId.set(r.route_id, { id: r.route_id, name: r.route_name, validUntilMs: ms })
        }
      }
      const routes: B2BRoute[] = Array.from(byRouteId.values()).map(({ id, name }) => ({ id, name }))
      const routeIds = routes.map((r) => r.id)

      let routeAccessValidUntil: Date | null = null
      for (const r of routeRows) {
        const d = new Date(r.valid_until)
        if (Number.isNaN(d.getTime())) continue
        if (!routeAccessValidUntil || d > routeAccessValidUntil) routeAccessValidUntil = d
      }

      setEntitlements({ hasNationalView, routeIds, routes, routeAccessValidUntil })
    } catch {
      setEntitlements({ hasNationalView: false, routeIds: [], routes: [], routeAccessValidUntil: null })
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    void fetchEntitlements()
  }, [fetchEntitlements])

  return { ...entitlements, loading, refresh: fetchEntitlements }
}
