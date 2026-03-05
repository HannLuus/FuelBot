import { create } from 'zustand'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
  isAdmin: boolean
  init: () => void
  signOut: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  session: null,
  loading: true,
  isAdmin: false,

  init: () => {
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user ?? null
      set({
        session: data.session,
        user,
        loading: false,
        isAdmin: user?.app_metadata?.role === 'admin',
      })
    })

    supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null
      set({
        session,
        user,
        loading: false,
        isAdmin: user?.app_metadata?.role === 'admin',
      })
    })
  },

  signOut: async () => {
    await supabase.auth.signOut()
    set({ user: null, session: null, isAdmin: false })
  },
}))
