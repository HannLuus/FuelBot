import { create } from 'zustand'
import type { User, Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

const IDLE_SIGNOUT_MS = 4 * 60 * 60 * 1000 // 4 hours

interface AuthState {
  user: User | null
  session: Session | null
  loading: boolean
  isAdmin: boolean
  init: () => void
  signOut: () => Promise<void>
}

let idleSignOutTimer: ReturnType<typeof setTimeout> | null = null

function scheduleIdleSignOut(signOut: () => Promise<void>) {
  if (idleSignOutTimer) clearTimeout(idleSignOutTimer)
  idleSignOutTimer = setTimeout(() => {
    idleSignOutTimer = null
    void signOut()
  }, IDLE_SIGNOUT_MS)
}

function clearIdleSignOut() {
  if (idleSignOutTimer) {
    clearTimeout(idleSignOutTimer)
    idleSignOutTimer = null
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
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
      if (data.session) {
        scheduleIdleSignOut(get().signOut)
        void supabase.rpc('ensure_user_legal_acceptance')
      } else {
        clearIdleSignOut()
      }
    })

    supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null
      set({
        session,
        user,
        loading: false,
        isAdmin: user?.app_metadata?.role === 'admin',
      })
      if (session) {
        scheduleIdleSignOut(get().signOut)
        void supabase.rpc('ensure_user_legal_acceptance')
      } else {
        clearIdleSignOut()
      }
    })
  },

  signOut: async () => {
    clearIdleSignOut()
    await supabase.auth.signOut()
    set({ user: null, session: null, isAdmin: false })
  },
}))
