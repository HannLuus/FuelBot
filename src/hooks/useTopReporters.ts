import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export interface TopReporterRow {
  user_id: string
  display_name: string
  report_count: number
  rank: number
}

export function useTopReporters() {
  const [reporters, setReporters] = useState<TopReporterRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)

  const refetch = useCallback(() => {
    setLoading(true)
    setReloadToken((n) => n + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data, error: rpcError } = await supabase.rpc('get_top_reporters', {
        period_days: 30,
        result_limit: 10,
      })
      if (cancelled) return
      if (rpcError) {
        setError(rpcError.message)
        setReporters([])
      } else {
        setReporters((data ?? []) as TopReporterRow[])
        setError(null)
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [reloadToken])

  return { reporters, loading, error, refetch }
}
