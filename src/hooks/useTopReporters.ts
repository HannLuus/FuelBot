import { useEffect, useState } from 'react'
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
      }
      setLoading(false)
    })()
    return () => {
      cancelled = true
    }
  }, [])

  return { reporters, loading, error }
}
