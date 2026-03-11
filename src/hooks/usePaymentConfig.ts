import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export interface PaymentConfig {
  payment_instructions: string | null
  payment_qr_url: string | null
  payment_phone_wavepay: string | null
  payment_phone_kpay: string | null
}

const DEFAULT_CONFIG: PaymentConfig = {
  payment_instructions: null,
  payment_qr_url: null,
  payment_phone_wavepay: null,
  payment_phone_kpay: null,
}

export function usePaymentConfig(): PaymentConfig {
  const [config, setConfig] = useState<PaymentConfig>(DEFAULT_CONFIG)

  const fetchConfig = useCallback(async () => {
    const { data, error } = await supabase
      .from('payment_config')
      .select('payment_instructions, payment_qr_url, payment_phone_wavepay, payment_phone_kpay')
      .eq('id', 'default')
      .single()
    if (!error && data) {
      setConfig({
        payment_instructions: data.payment_instructions ?? null,
        payment_qr_url: data.payment_qr_url ?? null,
        payment_phone_wavepay: data.payment_phone_wavepay ?? null,
        payment_phone_kpay: data.payment_phone_kpay ?? null,
      })
    }
  }, [])

  useEffect(() => {
    void fetchConfig()
  }, [fetchConfig])

  return {
    payment_instructions: config.payment_instructions ?? null,
    payment_qr_url: config.payment_qr_url ?? null,
    payment_phone_wavepay: config.payment_phone_wavepay ?? null,
    payment_phone_kpay: config.payment_phone_kpay ?? null,
  }
}
