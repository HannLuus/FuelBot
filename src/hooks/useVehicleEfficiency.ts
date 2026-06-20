import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import type { FleetVehicle, FuelLog, VehicleEfficiency, FleetBenchmark } from '@/types'

export type FuelLogInput = Omit<
  FuelLog,
  'id' | 'vehicle_id' | 'owner_user_id' | 'created_at'
>

interface VehicleDetailState {
  vehicle: FleetVehicle | null
  logs: FuelLog[]
  efficiency: VehicleEfficiency | null
  benchmark: FleetBenchmark | null
  loading: boolean
  error: string | null
}

const EMPTY: VehicleDetailState = {
  vehicle: null,
  logs: [],
  efficiency: null,
  benchmark: null,
  loading: true,
  error: null,
}

export function useVehicleEfficiency(vehicleId: string | undefined) {
  const userId = useAuthStore((s) => s.user?.id)
  const [state, setState] = useState<VehicleDetailState>(EMPTY)

  const refresh = useCallback(async () => {
    if (!userId || !vehicleId) {
      setState({ ...EMPTY, loading: false })
      return
    }
    setState((prev) => ({ ...prev, loading: true }))

    const [vehicleRes, logsRes, effRes] = await Promise.all([
      supabase.from('fleet_vehicles').select('*').eq('id', vehicleId).maybeSingle(),
      supabase
        .from('fuel_logs')
        .select('*')
        .eq('vehicle_id', vehicleId)
        .order('filled_at', { ascending: false }),
      supabase.rpc('get_vehicle_efficiency', { p_vehicle_id: vehicleId }),
    ])

    if (vehicleRes.error || !vehicleRes.data) {
      setState({ ...EMPTY, loading: false, error: vehicleRes.error?.message ?? 'NOT_FOUND' })
      return
    }

    const vehicle = vehicleRes.data as FleetVehicle
    const logs = (logsRes.data ?? []) as FuelLog[]
    const efficiency = (Array.isArray(effRes.data) ? effRes.data[0] : null) as
      | VehicleEfficiency
      | null

    // Peer benchmark only makes sense once we know make/model.
    let benchmark: FleetBenchmark | null = null
    if (vehicle.manufacturer && vehicle.model) {
      const { data: benchData } = await supabase.rpc('get_fleet_benchmark', {
        p_manufacturer: vehicle.manufacturer,
        p_model: vehicle.model,
        p_year: vehicle.year,
        p_region: vehicle.region,
      })
      benchmark = (Array.isArray(benchData) ? benchData[0] : null) as FleetBenchmark | null
    }

    setState({ vehicle, logs, efficiency, benchmark, loading: false, error: null })
  }, [userId, vehicleId])

  useEffect(() => {
    queueMicrotask(() => {
      void refresh()
    })
  }, [refresh])

  const addLog = useCallback(
    async (input: FuelLogInput): Promise<{ error?: string }> => {
      if (!userId || !vehicleId) return { error: 'NOT_AUTHENTICATED' }
      const { error } = await supabase.from('fuel_logs').insert({
        ...input,
        vehicle_id: vehicleId,
        owner_user_id: userId,
      })
      if (error) return { error: error.message }
      await refresh()
      return {}
    },
    [userId, vehicleId, refresh],
  )

  const deleteLog = useCallback(
    async (logId: string): Promise<{ error?: string }> => {
      const { error } = await supabase.from('fuel_logs').delete().eq('id', logId)
      if (error) return { error: error.message }
      await refresh()
      return {}
    },
    [refresh],
  )

  return { ...state, refresh, addLog, deleteLog }
}
