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
}

export function useB2BEntitlements(): B2BEntitlements & { loading: boolean } {
  const user = useAuthStore((s) => s.user)
  const [entitlements, setEntitlements] = useState<B2BEntitlements>({
    hasNationalView: false,
    routeIds: [],
    routes: [],
  })
  const [loading, setLoading] = useState(true)

  const fetchEntitlements = useCallback(async () => {
    if (!user?.id) {
      setEntitlements({ hasNationalView: false, routeIds: [], routes: [] })
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('get_my_b2b_entitlements')
      if (error) {
        setEntitlements({ hasNationalView: false, routeIds: [], routes: [] })
        return
      }
      const rows = (data ?? []) as {
        plan_type: string
        route_id: string | null
        route_name: string | null
      }[]
      const hasNationalView = rows.some((r) => r.plan_type === 'national_view')
      const routes: B2BRoute[] = rows
        .filter((r) => r.plan_type === 'route_view' && r.route_id && r.route_name)
        .map((r) => ({ id: r.route_id!, name: r.route_name! }))
      const routeIds = routes.map((r) => r.id)
      setEntitlements({ hasNationalView, routeIds, routes })
    } catch {
      setEntitlements({ hasNationalView: false, routeIds: [], routes: [] })
    } finally {
      setLoading(false)
    }
  }, [user?.id])

  useEffect(() => {
    void fetchEntitlements()
  }, [fetchEntitlements])

  return { ...entitlements, loading }
}
