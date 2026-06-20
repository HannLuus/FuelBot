import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import type { FleetVehicle, FleetEfficiencySummary } from '@/types'

export type VehicleInput = Omit<
  FleetVehicle,
  'id' | 'owner_user_id' | 'created_at' | 'updated_at'
>

interface MutationResult {
  data?: FleetVehicle
  error?: string
}

function toNum(value: number | string | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function useFleetVehicles() {
  const userId = useAuthStore((s) => s.user?.id)
  const [vehicles, setVehicles] = useState<FleetVehicle[]>([])
  const [efficiencyByVehicleId, setEfficiencyByVehicleId] = useState<
    Record<string, FleetEfficiencySummary>
  >({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!userId) {
      setVehicles([])
      setEfficiencyByVehicleId({})
      setLoading(false)
      return
    }
    setLoading(true)
    const [vehiclesRes, summaryRes] = await Promise.all([
      supabase.from('fleet_vehicles').select('*').order('created_at', { ascending: false }),
      supabase.rpc('get_my_fleet_efficiency_summary'),
    ])
    if (vehiclesRes.error) {
      setError(vehiclesRes.error.message)
      setVehicles([])
      setEfficiencyByVehicleId({})
    } else {
      setError(null)
      setVehicles((vehiclesRes.data ?? []) as FleetVehicle[])
      const summaryMap: Record<string, FleetEfficiencySummary> = {}
      for (const row of (summaryRes.data ?? []) as FleetEfficiencySummary[]) {
        summaryMap[row.vehicle_id] = {
          vehicle_id: row.vehicle_id,
          has_sufficient_data: row.has_sufficient_data,
          samples_count: toNum(row.samples_count) ?? 0,
          avg_l_per_100km: toNum(row.avg_l_per_100km),
          last_l_per_100km: toNum(row.last_l_per_100km),
        }
      }
      setEfficiencyByVehicleId(summaryMap)
    }
    setLoading(false)
  }, [userId])

  useEffect(() => {
    queueMicrotask(() => {
      void refresh()
    })
  }, [refresh])

  const createVehicle = useCallback(
    async (input: VehicleInput): Promise<MutationResult> => {
      if (!userId) return { error: 'NOT_AUTHENTICATED' }
      const { data, error: insertError } = await supabase
        .from('fleet_vehicles')
        .insert({ ...input, owner_user_id: userId })
        .select('*')
        .single()
      if (insertError) return { error: insertError.message }
      await refresh()
      return { data: data as FleetVehicle }
    },
    [userId, refresh],
  )

  const updateVehicle = useCallback(
    async (id: string, input: Partial<VehicleInput>): Promise<MutationResult> => {
      const { data, error: updateError } = await supabase
        .from('fleet_vehicles')
        .update(input)
        .eq('id', id)
        .select('*')
        .single()
      if (updateError) return { error: updateError.message }
      await refresh()
      return { data: data as FleetVehicle }
    },
    [refresh],
  )

  const deleteVehicle = useCallback(
    async (id: string): Promise<{ error?: string }> => {
      const { error: deleteError } = await supabase
        .from('fleet_vehicles')
        .delete()
        .eq('id', id)
      if (deleteError) return { error: deleteError.message }
      await refresh()
      return {}
    },
    [refresh],
  )

  return {
    vehicles,
    efficiencyByVehicleId,
    loading,
    error,
    refresh,
    createVehicle,
    updateVehicle,
    deleteVehicle,
  }
}
