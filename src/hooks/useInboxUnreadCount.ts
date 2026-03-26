import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'

/**
 * Unread admin→user threads for the signed-in customer (RPC + realtime refresh).
 */
export function useInboxUnreadCount(): number {
  const user = useAuthStore((s) => s.user)
  const [count, setCount] = useState(0)

  const refresh = useCallback(async () => {
    if (!user) {
      setCount(0)
      return
    }
    const { data, error } = await supabase.rpc('inbox_user_unread_thread_count')
    if (error) {
      console.warn('inbox_user_unread_thread_count:', error.message)
      return
    }
    setCount(typeof data === 'number' ? data : 0)
  }, [user])

  useEffect(() => {
    queueMicrotask(() => {
      void refresh()
    })
  }, [refresh])

  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel(`inbox_unread_user_${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inbox_threads', filter: `user_id=eq.${user.id}` },
        () => {
          void refresh()
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'inbox_messages' },
        () => {
          void refresh()
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' && channel) {
          void supabase.removeChannel(channel)
        }
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [user, refresh])

  return count
}

/**
 * Threads with unread user→admin messages (admin inbox badge).
 */
export function useAdminInboxUnreadCount(): number {
  const isAdmin = useAuthStore((s) => s.isAdmin)
  const [count, setCount] = useState(0)

  const refresh = useCallback(async () => {
    if (!isAdmin) {
      setCount(0)
      return
    }
    const { data, error } = await supabase.rpc('inbox_admin_unread_thread_count')
    if (error) {
      console.warn('inbox_admin_unread_thread_count:', error.message)
      return
    }
    setCount(typeof data === 'number' ? data : 0)
  }, [isAdmin])

  useEffect(() => {
    queueMicrotask(() => {
      void refresh()
    })
  }, [refresh])

  useEffect(() => {
    if (!isAdmin) return

    const channel = supabase
      .channel('inbox_unread_admin')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inbox_threads' },
        () => {
          void refresh()
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'inbox_messages' },
        () => {
          void refresh()
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' && channel) {
          void supabase.removeChannel(channel)
        }
      })

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [isAdmin, refresh])

  return count
}
