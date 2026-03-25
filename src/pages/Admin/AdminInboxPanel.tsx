import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { FunctionsHttpError } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import type { InboxMessage, InboxThread } from '@/types'

const INBOX_BUCKET = 'inbox-attachments'
const ADMIN_EDGE_UNAUTHORIZED = 'ADMIN_EDGE_UNAUTHORIZED'
const ATTACHMENT_ONLY_BODY = '(attachment)'

async function invokeAdminEdgeFunction(name: string, body: Record<string, unknown>) {
  const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession()
  if (refreshErr) console.warn('refreshSession before admin invoke:', refreshErr.message)
  const session = refreshed.session ?? (await supabase.auth.getSession()).data.session
  if (!session?.access_token) {
    throw new Error('Not signed in')
  }
  const result = await supabase.functions.invoke(name, {
    body,
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
  if (result.error instanceof FunctionsHttpError) {
    const ctx = result.error.context
    const status = ctx instanceof Response ? ctx.status : undefined
    if (status === 401) {
      throw new Error(ADMIN_EDGE_UNAUTHORIZED)
    }
  }
  return result
}

function extFromFile(f: File): string {
  const parts = f.name.split('.')
  const last = parts.length > 1 ? parts.pop() ?? '' : ''
  if (last && /^[a-z0-9]+$/i.test(last) && last.length <= 8) {
    return last.toLowerCase()
  }
  if (f.type === 'image/jpeg' || f.type === 'image/jpg') return 'jpg'
  if (f.type === 'image/png') return 'png'
  if (f.type === 'image/webp') return 'webp'
  if (f.type === 'image/gif') return 'gif'
  return 'bin'
}

async function uploadInboxAttachment(ownerUserId: string, threadId: string, file: File): Promise<string | null> {
  if (!/^image\/(jpeg|jpg|png|webp|gif)$/i.test(file.type)) return null
  if (file.size > 5 * 1024 * 1024) return null
  const path = `${ownerUserId}/${threadId}/${crypto.randomUUID()}.${extFromFile(file)}`
  const { error } = await supabase.storage.from(INBOX_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  })
  if (error) {
    console.error('admin inbox upload:', error)
    return null
  }
  return path
}

type StatusFilter = 'all' | 'open' | 'closed'

export function AdminInboxPanel() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const [threads, setThreads] = useState<InboxThread[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<InboxMessage[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [replyBody, setReplyBody] = useState('')

  const [newUserId, setNewUserId] = useState('')
  const [newSubject, setNewSubject] = useState('')
  const [newBody, setNewBody] = useState('')

  const [bulkSegment, setBulkSegment] = useState<'active_b2b' | 'all_users' | 'paid_station_owners'>('active_b2b')
  const [bulkSubject, setBulkSubject] = useState('')
  const [bulkBody, setBulkBody] = useState('')
  const [bulkMax, setBulkMax] = useState(500)
  const [bulkSending, setBulkSending] = useState(false)
  const [bulkResult, setBulkResult] = useState<string | null>(null)

  const loadThreads = useCallback(async () => {
    setError(null)
    let q = supabase
      .from('inbox_threads')
      .select('*')
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
    if (statusFilter !== 'all') {
      q = q.eq('status', statusFilter)
    }
    const { data, error: err } = await q
    if (err) {
      setError(err.message)
      return
    }
    setThreads((data ?? []) as InboxThread[])
  }, [statusFilter])

  const loadMessages = useCallback(
    async (threadId: string) => {
      setLoadingMessages(true)
      const { data, error: err } = await supabase
        .from('inbox_messages')
        .select('*')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true })
      setLoadingMessages(false)
      if (err) {
        setError(err.message)
        return
      }
      setMessages((data ?? []) as InboxMessage[])
      const { error: rpcErr } = await supabase.rpc('inbox_mark_thread_read', { p_thread_id: threadId })
      if (rpcErr) console.warn('inbox_mark_thread_read:', rpcErr.message)
      void loadThreads()
    },
    [loadThreads],
  )

  useEffect(() => {
    setLoadingList(true)
    void loadThreads().finally(() => setLoadingList(false))
  }, [loadThreads])

  useEffect(() => {
    const channel = supabase
      .channel('admin_inbox_threads')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inbox_threads' },
        () => {
          void loadThreads()
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
  }, [loadThreads])

  useEffect(() => {
    if (!selectedId) return
    const channel = supabase
      .channel(`admin_inbox_msgs_${selectedId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'inbox_messages', filter: `thread_id=eq.${selectedId}` },
        () => {
          void loadMessages(selectedId)
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
  }, [selectedId, loadMessages])

  const selected = useMemo(() => threads.find((x) => x.id === selectedId) ?? null, [threads, selectedId])

  const openThread = (id: string) => {
    setSelectedId(id)
    void loadMessages(id)
  }

  async function openSignedAttachment(path: string) {
    const { data, error: err } = await supabase.storage.from(INBOX_BUCKET).createSignedUrl(path, 300)
    if (err || !data?.signedUrl) return
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  async function startThreadForUser(file: File | null) {
    if (!user) return
    const uid = newUserId.trim()
    const subject = newSubject.trim() || 'Support'
    const body = newBody.trim()
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid)) {
      setError(t('admin.invalidUserUuid'))
      return
    }
    if (!body && !file) {
      setError(t('inbox.sendError'))
      return
    }
    if (file && !/^image\/(jpeg|jpg|png|webp|gif)$/i.test(file.type)) {
      setError(t('inbox.invalidImage'))
      return
    }
    setSending(true)
    setError(null)
    try {
      const { data: threadRow, error: tErr } = await supabase
        .from('inbox_threads')
        .insert({ user_id: uid, subject })
        .select('id')
        .single()
      if (tErr || !threadRow) throw tErr ?? new Error('thread')

      let attachmentPath: string | null = null
      if (file) {
        attachmentPath = await uploadInboxAttachment(uid, threadRow.id, file)
        if (!attachmentPath) {
          setError(t('inbox.invalidImage'))
          setSending(false)
          return
        }
      }
      const messageBody = body || (attachmentPath ? ATTACHMENT_ONLY_BODY : '')
      const { error: mErr } = await supabase.from('inbox_messages').insert({
        thread_id: threadRow.id,
        sender_id: user.id,
        is_from_admin: true,
        body: messageBody,
        attachment_path: attachmentPath,
      })
      if (mErr) throw mErr
      setNewUserId('')
      setNewSubject('')
      setNewBody('')
      await loadThreads()
      openThread(threadRow.id)
    } catch (e) {
      setError(e instanceof Error ? e.message : t('inbox.sendError'))
    } finally {
      setSending(false)
    }
  }

  async function sendReply(file: File | null) {
    if (!user || !selected) return
    const body = replyBody.trim()
    if (!body && !file) {
      setError(t('inbox.sendError'))
      return
    }
    if (file && !/^image\/(jpeg|jpg|png|webp|gif)$/i.test(file.type)) {
      setError(t('inbox.invalidImage'))
      return
    }
    setSending(true)
    setError(null)
    try {
      let attachmentPath: string | null = null
      if (file) {
        attachmentPath = await uploadInboxAttachment(selected.user_id, selected.id, file)
        if (!attachmentPath) {
          setError(t('inbox.invalidImage'))
          setSending(false)
          return
        }
      }
      const messageBody = body || (attachmentPath ? ATTACHMENT_ONLY_BODY : '')
      const { error: mErr } = await supabase.from('inbox_messages').insert({
        thread_id: selected.id,
        sender_id: user.id,
        is_from_admin: true,
        body: messageBody,
        attachment_path: attachmentPath,
      })
      if (mErr) throw mErr
      setReplyBody('')
      await loadMessages(selected.id)
      await loadThreads()
    } catch (e) {
      setError(e instanceof Error ? e.message : t('inbox.sendError'))
    } finally {
      setSending(false)
    }
  }

  async function setThreadStatus(next: 'open' | 'closed') {
    if (!selected) return
    setError(null)
    const { error: err } = await supabase.from('inbox_threads').update({ status: next, updated_at: new Date().toISOString() }).eq('id', selected.id)
    if (err) {
      setError(err.message)
      return
    }
    await loadThreads()
    const { data } = await supabase.from('inbox_threads').select('*').eq('id', selected.id).single()
    if (data) {
      setThreads((prev) => prev.map((x) => (x.id === selected.id ? (data as InboxThread) : x)))
    }
  }

  async function runBulkSend() {
    setBulkSending(true)
    setBulkResult(null)
    setError(null)
    try {
      const result = await invokeAdminEdgeFunction('admin-inbox-bulk', {
        segment: bulkSegment,
        subject: bulkSubject.trim(),
        body: bulkBody.trim(),
        max_users: bulkMax,
      })
      if (result.error) {
        setError(result.error.message)
        return
      }
      const payload = result.data as { ok?: boolean; targeted?: number; threads_created?: number; errors?: string[] }
      if (!payload?.ok) {
        setError(typeof result.data === 'object' && result.data ? JSON.stringify(result.data) : t('errors.generic'))
        return
      }
      setBulkResult(
        t('admin.inboxBulkResult', {
          targeted: payload.targeted ?? 0,
          created: payload.threads_created ?? 0,
        }),
      )
      if (payload.errors?.length) {
        setError(payload.errors.join('; '))
      }
      await loadThreads()
    } catch (e) {
      if (e instanceof Error && e.message === ADMIN_EDGE_UNAUTHORIZED) {
        setError(t('errors.adminEdgeUnauthorized'))
      } else {
        setError(e instanceof Error ? e.message : t('errors.generic'))
      }
    } finally {
      setBulkSending(false)
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      {error && <p className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{error}</p>}
      {bulkResult && <p className="rounded-lg bg-green-50 p-2 text-sm text-green-800">{bulkResult}</p>}

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-sm font-semibold text-gray-900">{t('admin.inboxBulkTitle')}</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-gray-700">
            {t('admin.inboxBulkSegment')}
            <select
              value={bulkSegment}
              onChange={(e) => setBulkSegment(e.target.value as typeof bulkSegment)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
            >
              <option value="active_b2b">{t('admin.inboxSegmentActiveB2b')}</option>
              <option value="all_users">{t('admin.inboxSegmentAllUsers')}</option>
              <option value="paid_station_owners">{t('admin.inboxSegmentPaidOwners')}</option>
            </select>
          </label>
          <label className="text-xs text-gray-700">
            {t('admin.inboxBulkMaxUsers')}
            <input
              type="number"
              min={1}
              max={2000}
              value={bulkMax}
              onChange={(e) => setBulkMax(Number(e.target.value) || 500)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
            />
          </label>
        </div>
        <label className="mt-2 block text-xs text-gray-700">
          {t('admin.inboxSubjectLabel')}
          <input
            value={bulkSubject}
            onChange={(e) => setBulkSubject(e.target.value)}
            className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
          />
        </label>
        <label className="mt-2 block text-xs text-gray-700">
          {t('admin.inboxMessageLabel')}
          <textarea
            value={bulkBody}
            onChange={(e) => setBulkBody(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
          />
        </label>
        <Button className="mt-3" variant="primary" loading={bulkSending} onClick={() => void runBulkSend()}>
          {t('admin.inboxBulkSend')}
        </Button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="text-sm font-semibold text-gray-900">{t('admin.inboxNewForUser')}</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <label className="text-xs text-gray-700">
            {t('admin.inboxUserIdLabel')}
            <input
              value={newUserId}
              onChange={(e) => setNewUserId(e.target.value)}
              placeholder="uuid"
              className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 font-mono text-sm text-gray-900"
            />
          </label>
          <label className="text-xs text-gray-700">
            {t('admin.inboxSubjectLabel')}
            <input
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
            />
          </label>
        </div>
        <label className="mt-2 block text-xs text-gray-700">
          {t('admin.inboxMessageLabel')}
          <textarea
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm text-gray-900"
          />
        </label>
        <label className="mt-1 block text-xs text-gray-700">
          {t('inbox.attachImage')}
          <input type="file" accept="image/jpeg,image/jpg,image/png,image/webp,image/gif" id="admin-inbox-new-file" />
        </label>
        <Button
          className="mt-2"
          size="sm"
          variant="secondary"
          loading={sending}
          onClick={() => {
            const input = document.getElementById('admin-inbox-new-file') as HTMLInputElement | null
            void startThreadForUser(input?.files?.[0] ?? null)
          }}
        >
          {t('admin.inboxStartThread')}
        </Button>
      </div>

      <div className="flex min-h-[420px] flex-1 flex-col gap-2 overflow-hidden rounded-xl border border-gray-200 bg-white md:flex-row">
        <div className="flex max-h-[220px] shrink-0 flex-col border-b border-gray-100 md:max-h-none md:w-[300px] md:border-b-0 md:border-r">
          <div className="flex gap-1 border-b border-gray-100 p-2">
            {(['all', 'open', 'closed'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setStatusFilter(f)}
                className={`rounded-lg px-2 py-1 text-xs font-medium ${
                  statusFilter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'
                }`}
              >
                {f === 'all' ? t('admin.inboxFilterAll') : f === 'open' ? t('admin.inboxFilterOpen') : t('admin.inboxFilterClosed')}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loadingList ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : threads.length === 0 ? (
              <p className="p-4 text-center text-sm text-gray-700">{t('admin.inboxNoThreads')}</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {threads.map((th) => (
                  <li key={th.id}>
                    <button
                      type="button"
                      onClick={() => openThread(th.id)}
                      className={`flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left active:bg-gray-50 ${
                        selectedId === th.id ? 'bg-blue-50' : ''
                      }`}
                    >
                      <span className="line-clamp-1 w-full text-xs font-semibold text-gray-900">{th.subject}</span>
                      <span className="font-mono text-[10px] text-gray-700">{th.user_id.slice(0, 8)}…</span>
                      <span className="text-[10px] text-gray-700">{th.status}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {selected ? (
            <>
              <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-gray-100 px-3 py-2">
                <div>
                  <p className="text-sm font-semibold text-gray-900">{selected.subject}</p>
                  <p className="font-mono text-xs text-gray-700">{selected.user_id}</p>
                </div>
                <div className="flex gap-2">
                  {selected.status === 'open' ? (
                    <Button type="button" size="sm" variant="secondary" onClick={() => void setThreadStatus('closed')}>
                      {t('admin.inboxCloseThread')}
                    </Button>
                  ) : (
                    <Button type="button" size="sm" variant="secondary" onClick={() => void setThreadStatus('open')}>
                      {t('admin.inboxReopenThread')}
                    </Button>
                  )}
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {loadingMessages ? (
                  <Spinner />
                ) : (
                  <ul className="flex flex-col gap-2">
                    {messages.map((m) => (
                      <li
                        key={m.id}
                        className={`max-w-[min(100%,400px)] rounded-lg px-3 py-2 text-sm ${
                          m.is_from_admin
                            ? 'self-end bg-blue-600 text-white'
                            : 'self-start bg-gray-100 text-gray-900'
                        }`}
                      >
                        <p className="text-xs font-medium opacity-90">
                          {m.is_from_admin ? t('inbox.fromTeam') : t('admin.inboxFromUser')}
                        </p>
                        {m.body.trim() && !(m.attachment_path && m.body.trim() === ATTACHMENT_ONLY_BODY) ? (
                          <p className="mt-1 whitespace-pre-wrap">{m.body.trim()}</p>
                        ) : null}
                        {m.attachment_path ? (
                          <button
                            type="button"
                            onClick={() => void openSignedAttachment(m.attachment_path!)}
                            className={`mt-1 text-xs underline ${m.is_from_admin ? 'text-blue-100' : 'text-blue-700'}`}
                          >
                            {t('inbox.attachImage')}
                          </button>
                        ) : null}
                        <p className={`mt-1 text-[10px] ${m.is_from_admin ? 'text-blue-100' : 'text-gray-700'}`}>
                          {new Date(m.created_at).toLocaleString()}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {selected.status === 'open' ? (
                <div className="shrink-0 border-t border-gray-100 p-3">
                  <textarea
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    placeholder={t('admin.inboxReplyPlaceholder')}
                    rows={2}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-600"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <input type="file" accept="image/jpeg,image/jpg,image/png,image/webp,image/gif" id="admin-inbox-reply-file" />
                    <Button
                      type="button"
                      size="sm"
                      variant="primary"
                      loading={sending}
                      onClick={() => {
                        const input = document.getElementById('admin-inbox-reply-file') as HTMLInputElement | null
                        void sendReply(input?.files?.[0] ?? null)
                      }}
                    >
                      {t('inbox.send')}
                    </Button>
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <p className="p-6 text-center text-sm text-gray-700">{t('admin.inboxNoThreads')}</p>
          )}
        </div>
      </div>
    </div>
  )
}
