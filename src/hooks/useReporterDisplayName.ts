import { useCallback, useEffect, useRef, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import {
  buildBaseDisplayNameSuggestion,
  findAvailableDisplayName,
  normalizeDisplayNameInput,
  validateDisplayNameForSave,
} from '@/lib/reporterDisplayName'

type LoadStatus = 'idle' | 'loading' | 'ready'

export function useReporterDisplayName(
  user: User | null | undefined,
  options?: { onSaved?: () => void },
) {
  const [loadStatus, setLoadStatus] = useState<LoadStatus>('idle')
  const [draft, setDraftInternal] = useState('')
  const [suggested, setSuggested] = useState('')
  const [hasSavedRow, setHasSavedRow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [message, setMessage] = useState<'saved' | 'removed' | null>(null)
  const [fieldError, setFieldError] = useState<
    'too_short' | 'too_long' | 'taken' | 'save_failed' | 'remove_failed' | null
  >(null)

  const onSaved = options?.onSaved
  const userRef = useRef(user)
  userRef.current = user

  const setDraft = useCallback((value: string) => {
    setMessage(null)
    setFieldError(null)
    setDraftInternal(value)
  }, [])

  useEffect(() => {
    const uid = user?.id
    if (!uid) {
      setLoadStatus('idle')
      setDraftInternal('')
      setSuggested('')
      setHasSavedRow(false)
      return
    }

    let cancelled = false
    setLoadStatus('loading')
    setFieldError(null)
    setMessage(null)

    void (async () => {
      const { data: row, error: rowErr } = await supabase
        .from('reporter_display_names')
        .select('display_name')
        .eq('user_id', uid)
        .maybeSingle()

      if (cancelled || userRef.current?.id !== uid) return

      const u = userRef.current
      if (!u) return

      if (rowErr) {
        setHasSavedRow(false)
        const base = buildBaseDisplayNameSuggestion(u)
        if (base.length >= 2) {
          const avail = await findAvailableDisplayName(supabase, base, uid)
          if (cancelled || userRef.current?.id !== uid) return
          setSuggested(avail)
          setDraftInternal(avail)
        } else {
          setSuggested('')
          setDraftInternal('')
        }
        setLoadStatus('ready')
        return
      }

      if (row?.display_name && row.display_name.trim().length > 0) {
        setDraftInternal(row.display_name.trim())
        setHasSavedRow(true)
        const base = buildBaseDisplayNameSuggestion(u)
        if (base.length >= 2) {
          const avail = await findAvailableDisplayName(supabase, base, uid)
          if (cancelled || userRef.current?.id !== uid) return
          setSuggested(avail)
        } else {
          setSuggested('')
        }
        setLoadStatus('ready')
        return
      }

      setHasSavedRow(false)
      const base = buildBaseDisplayNameSuggestion(u)
      if (base.length >= 2) {
        const avail = await findAvailableDisplayName(supabase, base, uid)
        if (cancelled || userRef.current?.id !== uid) return
        setSuggested(avail)
        setDraftInternal(avail)
      } else {
        setSuggested('')
        setDraftInternal('')
      }
      setLoadStatus('ready')
    })()

    return () => {
      cancelled = true
    }
  }, [user?.id])

  const applySuggestion = useCallback(() => {
    setFieldError(null)
    setMessage(null)
    if (suggested) setDraftInternal(suggested)
  }, [suggested])

  const save = useCallback(async () => {
    if (!user?.id) return
    const normalized = normalizeDisplayNameInput(draft)
    const v = validateDisplayNameForSave(normalized)
    if (v === 'too_short') {
      setFieldError('too_short')
      return
    }
    if (v === 'too_long') {
      setFieldError('too_long')
      return
    }
    setFieldError(null)
    setMessage(null)
    setSaving(true)
    try {
      const { data: takenRow, error: takenErr } = await supabase
        .from('reporter_display_names')
        .select('user_id')
        .eq('display_name', normalized)
        .neq('user_id', user.id)
        .limit(1)
        .maybeSingle()
      if (takenErr) throw takenErr
      if (takenRow) {
        setFieldError('taken')
        return
      }

      const { error: upErr } = await supabase.from('reporter_display_names').upsert(
        { user_id: user.id, display_name: normalized },
        { onConflict: 'user_id' },
      )
      if (upErr) throw upErr
      setDraftInternal(normalized)
      setHasSavedRow(true)
      setMessage('saved')
      onSaved?.()
    } catch {
      setFieldError('save_failed')
    } finally {
      setSaving(false)
    }
  }, [draft, user?.id, onSaved])

  const remove = useCallback(async () => {
    const uid = user?.id
    if (!uid) return
    setFieldError(null)
    setMessage(null)
    setRemoving(true)
    try {
      const { error: delErr } = await supabase.from('reporter_display_names').delete().eq('user_id', uid)
      if (delErr) throw delErr
      setHasSavedRow(false)
      setMessage('removed')
      const u = userRef.current
      const base = u ? buildBaseDisplayNameSuggestion(u) : ''
      if (base.length >= 2) {
        const avail = await findAvailableDisplayName(supabase, base, uid)
        if (userRef.current?.id === uid) {
          setSuggested(avail)
          setDraftInternal(avail)
        }
      } else {
        setSuggested('')
        setDraftInternal('')
      }
      onSaved?.()
    } catch {
      setFieldError('remove_failed')
    } finally {
      setRemoving(false)
    }
  }, [user?.id, onSaved])

  return {
    loadStatus,
    draft,
    setDraft,
    suggested,
    hasSavedRow,
    saving,
    removing,
    message,
    fieldError,
    applySuggestion,
    save,
    remove,
  }
}
