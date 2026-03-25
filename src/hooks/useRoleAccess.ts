import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { useB2BEntitlements } from '@/hooks/useB2BEntitlements'

const ACTIVE_ROLE_STORAGE_KEY = 'fuelbot_active_role'

export type AppRole = 'general' | 'station' | 'fleet' | 'admin'

interface RoleAccessResult {
  userId: string | null
  isAdmin: boolean
  loading: boolean
  hasStationAccess: boolean
  hasFleetAccess: boolean
  stationId: string | null
  availableRoles: AppRole[]
  activeRole: AppRole
  setActiveRole: (role: AppRole) => void
}

function getStoredRole(): AppRole | null {
  if (typeof window === 'undefined') return null
  const stored = window.localStorage.getItem(ACTIVE_ROLE_STORAGE_KEY)
  return stored === 'general' || stored === 'station' || stored === 'fleet' || stored === 'admin'
    ? stored
    : null
}

function pickFallbackRole(availableRoles: AppRole[]): AppRole {
  if (availableRoles.includes('station')) return 'station'
  if (availableRoles.includes('fleet')) return 'fleet'
  if (availableRoles.includes('admin')) return 'admin'
  return 'general'
}

export function useRoleAccess(): RoleAccessResult {
  const { user, isAdmin, loading: authLoading } = useAuthStore()
  const { hasNationalView, routes, loading: fleetLoading } = useB2BEntitlements()
  const [stationLoading, setStationLoading] = useState(false)
  const [stationId, setStationId] = useState<string | null>(null)
  const [preferredRole, setPreferredRole] = useState<AppRole>(() => getStoredRole() ?? 'general')

  useEffect(() => {
    let cancelled = false
    async function loadStationAccess() {
      if (!user?.id) {
        if (!cancelled) {
          setStationId(null)
          setStationLoading(false)
        }
        return
      }

      setStationLoading(true)
      const { data, error } = await supabase
        .from('stations')
        .select('id')
        .eq('verified_owner_id', user.id)
        .limit(1)
        .maybeSingle()

      if (cancelled) return
      if (error || !data) {
        setStationId(null)
      } else {
        setStationId(data.id)
      }
      setStationLoading(false)
    }

    void loadStationAccess()

    return () => {
      cancelled = true
    }
  }, [user?.id])

  const hasStationAccess = stationId != null
  const hasFleetAccess = hasNationalView || routes.length > 0

  const availableRoles = useMemo<AppRole[]>(() => {
    const next: AppRole[] = ['general']
    if (hasStationAccess) next.push('station')
    if (hasFleetAccess) next.push('fleet')
    if (isAdmin) next.push('admin')
    return next
  }, [hasFleetAccess, hasStationAccess, isAdmin])

  const activeRole = availableRoles.includes(preferredRole)
    ? preferredRole
    : pickFallbackRole(availableRoles)

  useEffect(() => {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(ACTIVE_ROLE_STORAGE_KEY, activeRole)
  }, [activeRole])

  return {
    userId: user?.id ?? null,
    isAdmin,
    loading: authLoading || stationLoading || fleetLoading,
    hasStationAccess,
    hasFleetAccess,
    stationId,
    availableRoles,
    activeRole,
    setActiveRole: (role) => {
      if (!availableRoles.includes(role)) return
      setPreferredRole(role)
    },
  }
}
