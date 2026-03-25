import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export interface PaymentConfig {
  payment_instructions: string | null
  payment_qr_url: string | null
  payment_phone_kpay: string | null
}

export interface UsePaymentConfigResult {
  config: PaymentConfig
  loading: boolean
  error: string | null
  refresh: () => Promise<void>
}

const DEFAULT_CONFIG: PaymentConfig = {
  payment_instructions: null,
  payment_qr_url: null,
  payment_phone_kpay: null,
}

export function usePaymentConfig(): UsePaymentConfigResult {
  const [config, setConfig] = useState<PaymentConfig>(DEFAULT_CONFIG)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchConfig = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await supabase
      .from('payment_config')
      .select('payment_instructions, payment_qr_url, payment_phone_kpay')
      .eq('id', 'default')
      .single()
    if (!error && data) {
      setConfig({
        payment_instructions: data.payment_instructions ?? null,
        payment_qr_url: data.payment_qr_url ?? null,
        payment_phone_kpay: data.payment_phone_kpay ?? null,
      })
    } else {
      setConfig(DEFAULT_CONFIG)
      setError(error?.message ?? 'PAYMENT_CONFIG_UNAVAILABLE')
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void fetchConfig()
    }, 0)
    return () => window.clearTimeout(timeoutId)
  }, [fetchConfig])

  return {
    config: {
      payment_instructions: config.payment_instructions ?? null,
      payment_qr_url: config.payment_qr_url ?? null,
      payment_phone_kpay: config.payment_phone_kpay ?? null,
    },
    loading,
    error,
    refresh: fetchConfig,
  }
}
