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

function hasAdminClaim(user: User | null): boolean {
  if (!user) return false
  const metadata = user.app_metadata as Record<string, unknown> | undefined
  const role = metadata?.role
  if (role === 'admin') return true
  const roles = metadata?.roles
  if (Array.isArray(roles) && roles.includes('admin')) return true
  if (metadata?.is_admin === true) return true
  return false
}

async function resolveIsAdmin(user: User | null): Promise<boolean> {
  if (!user) return false
  if (hasAdminClaim(user)) return true
  const { data, error } = await supabase
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (error) return false
  return Boolean(data)
}

let idleSignOutTimer: ReturnType<typeof setTimeout> | null = null
let activityHandler: (() => void) | null = null
const ACTIVITY_EVENTS = ['click', 'keydown', 'touchstart', 'pointermove'] as const

function scheduleIdleSignOut(signOut: () => Promise<void>) {
  if (idleSignOutTimer) clearTimeout(idleSignOutTimer)
  idleSignOutTimer = setTimeout(() => {
    idleSignOutTimer = null
    void signOut()
  }, IDLE_SIGNOUT_MS)
}

function attachActivityListeners(signOut: () => Promise<void>) {
  if (activityHandler) return
  activityHandler = () => scheduleIdleSignOut(signOut)
  ACTIVITY_EVENTS.forEach((e) =>
    document.addEventListener(e, activityHandler!, { passive: true }),
  )
}

function detachActivityListeners() {
  if (!activityHandler) return
  ACTIVITY_EVENTS.forEach((e) =>
    document.removeEventListener(e, activityHandler!),
  )
  activityHandler = null
}

function clearIdleSignOut() {
  if (idleSignOutTimer) {
    clearTimeout(idleSignOutTimer)
    idleSignOutTimer = null
  }
  detachActivityListeners()
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  session: null,
  loading: true,
  isAdmin: false,

  init: () => {
    let authSeq = 0
    supabase.auth.getSession().then(({ data }) => {
      const user = data.session?.user ?? null
      const seq = ++authSeq
      set({
        session: data.session,
        user,
        loading: false,
        isAdmin: hasAdminClaim(user),
      })
      void resolveIsAdmin(user).then((isAdmin) => {
        if (seq !== authSeq) return
        set({ isAdmin })
      })
      if (data.session) {
        scheduleIdleSignOut(get().signOut)
        attachActivityListeners(get().signOut)
        void supabase.rpc('ensure_user_legal_acceptance')
      } else {
        clearIdleSignOut()
      }
    })

    supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null
      const seq = ++authSeq
      set({
        session,
        user,
        loading: false,
        isAdmin: hasAdminClaim(user),
      })
      void resolveIsAdmin(user).then((isAdmin) => {
        if (seq !== authSeq) return
        set({ isAdmin })
      })
      if (session) {
        scheduleIdleSignOut(get().signOut)
        attachActivityListeners(get().signOut)
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
