import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/authStore'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import type { InboxMessage, InboxThread } from '@/types'

const INBOX_BUCKET = 'inbox-attachments'
/** Stored when the user sends attachment-only (DB requires non-empty trimmed body). */
const ATTACHMENT_ONLY_BODY = '(attachment)'

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

async function uploadInboxAttachment(userId: string, threadId: string, file: File): Promise<string | null> {
  if (!/^image\/(jpeg|jpg|png|webp|gif)$/i.test(file.type)) return null
  if (file.size > 5 * 1024 * 1024) return null
  const path = `${userId}/${threadId}/${crypto.randomUUID()}.${extFromFile(file)}`
  const { error } = await supabase.storage.from(INBOX_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  })
  if (error) {
    console.error('inbox upload:', error)
    return null
  }
  return path
}

export function InboxPage() {
  const { t } = useTranslation()
  const user = useAuthStore((s) => s.user)
  const [threads, setThreads] = useState<InboxThread[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<InboxMessage[]>([])
  const [loadingList, setLoadingList] = useState(true)
  const [loadingMessages, setLoadingMessages] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [newSubject, setNewSubject] = useState('')
  const [newBody, setNewBody] = useState('')
  const [replyBody, setReplyBody] = useState('')
  const [pageError, setPageError] = useState<string | null>(null)

  const loadThreads = useCallback(async () => {
    if (!user) return
    setPageError(null)
    const { data, error } = await supabase
      .from('inbox_threads')
      .select('*')
      .eq('user_id', user.id)
      .order('last_message_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false })
    if (error) {
      setPageError(t('inbox.loadError'))
      return
    }
    setThreads((data ?? []) as InboxThread[])
  }, [user, t])

  const loadMessages = useCallback(
    async (threadId: string) => {
      setLoadingMessages(true)
      setSendError(null)
      const { data, error } = await supabase
        .from('inbox_messages')
        .select('*')
        .eq('thread_id', threadId)
        .order('created_at', { ascending: true })
      setLoadingMessages(false)
      if (error) {
        setSendError(t('inbox.loadError'))
        return
      }
      setMessages((data ?? []) as InboxMessage[])
      const { error: rpcErr } = await supabase.rpc('inbox_mark_thread_read', { p_thread_id: threadId })
      if (rpcErr) console.warn('inbox_mark_thread_read:', rpcErr.message)
      void loadThreads()
    },
    [loadThreads, t],
  )

  useEffect(() => {
    if (!user) return
    setLoadingList(true)
    void loadThreads().finally(() => setLoadingList(false))
  }, [user, loadThreads])

  useEffect(() => {
    if (!user) return

    const channel = supabase
      .channel(`inbox_user_threads_${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'inbox_threads', filter: `user_id=eq.${user.id}` },
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
  }, [user, loadThreads])

  useEffect(() => {
    if (!selectedId || !user) return

    const channel = supabase
      .channel(`inbox_user_msgs_${selectedId}`)
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
  }, [selectedId, user, loadMessages])

  const openThread = (id: string) => {
    setSelectedId(id)
    setShowNew(false)
    void loadMessages(id)
  }

  const sendNewThread = async (file: File | null) => {
    if (!user) return
    const subject = newSubject.trim() || 'Support'
    const body = newBody.trim()
    if (!body && !file) {
      setSendError(t('inbox.sendError'))
      return
    }
    if (file && !/^image\/(jpeg|jpg|png|webp|gif)$/i.test(file.type)) {
      setSendError(t('inbox.invalidImage'))
      return
    }
    setSending(true)
    setSendError(null)
    try {
      const { data: threadRow, error: tErr } = await supabase
        .from('inbox_threads')
        .insert({ user_id: user.id, subject })
        .select('id')
        .single()
      if (tErr || !threadRow) throw tErr ?? new Error('thread')

      let attachmentPath: string | null = null
      if (file) {
        attachmentPath = await uploadInboxAttachment(user.id, threadRow.id, file)
        if (!attachmentPath) {
          setSendError(t('inbox.invalidImage'))
          setSending(false)
          return
        }
      }

      const messageBody = body || (attachmentPath ? ATTACHMENT_ONLY_BODY : '')
      if (!messageBody && !attachmentPath) {
        setSendError(t('inbox.sendError'))
        setSending(false)
        return
      }
      const { error: mErr } = await supabase.from('inbox_messages').insert({
        thread_id: threadRow.id,
        sender_id: user.id,
        is_from_admin: false,
        body: messageBody,
        attachment_path: attachmentPath,
      })
      if (mErr) throw mErr

      setNewSubject('')
      setNewBody('')
      setShowNew(false)
      await loadThreads()
      openThread(threadRow.id)
    } catch {
      setSendError(t('inbox.sendError'))
    } finally {
      setSending(false)
    }
  }

  const sendReply = async (file: File | null) => {
    if (!user || !selectedId) return
    const body = replyBody.trim()
    if (!body && !file) {
      setSendError(t('inbox.sendError'))
      return
    }
    if (file && !/^image\/(jpeg|jpg|png|webp|gif)$/i.test(file.type)) {
      setSendError(t('inbox.invalidImage'))
      return
    }
    setSending(true)
    setSendError(null)
    try {
      let attachmentPath: string | null = null
      if (file) {
        attachmentPath = await uploadInboxAttachment(user.id, selectedId, file)
        if (!attachmentPath) {
          setSendError(t('inbox.invalidImage'))
          setSending(false)
          return
        }
      }
      const messageBody = body || (attachmentPath ? ATTACHMENT_ONLY_BODY : '')
      if (!messageBody && !attachmentPath) {
        setSendError(t('inbox.sendError'))
        setSending(false)
        return
      }
      const { error: mErr } = await supabase.from('inbox_messages').insert({
        thread_id: selectedId,
        sender_id: user.id,
        is_from_admin: false,
        body: messageBody,
        attachment_path: attachmentPath,
      })
      if (mErr) throw mErr
      setReplyBody('')
      await loadMessages(selectedId)
      await loadThreads()
    } catch {
      setSendError(t('inbox.sendError'))
    } finally {
      setSending(false)
    }
  }

  async function openSignedAttachment(path: string) {
    const { data, error } = await supabase.storage.from(INBOX_BUCKET).createSignedUrl(path, 300)
    if (error || !data?.signedUrl) return
    window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }

  if (!user) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-6">
        <p className="text-center text-gray-700">{t('inbox.signInRequired')}</p>
      </div>
    )
  }

  const selected = threads.find((x) => x.id === selectedId)

  return (
    <div className="flex h-full flex-col overflow-hidden bg-gray-50">
      <div className="shrink-0 border-b border-gray-100 bg-white px-4 py-3">
        <h1 className="text-lg font-bold text-gray-900">{t('inbox.title')}</h1>
        <p className="mt-1 text-xs text-gray-700">{t('inbox.subtitle')}</p>
      </div>

      {pageError && <p className="mx-4 mt-2 text-sm text-red-700">{pageError}</p>}

      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="flex max-h-[40vh] shrink-0 flex-col border-b border-gray-200 bg-white md:max-h-none md:w-[min(100%,320px)] md:border-b-0 md:border-r">
          <div className="flex gap-2 border-b border-gray-100 p-2">
            <Button
              type="button"
              size="sm"
              variant="primary"
              className="flex-1"
              onClick={() => {
                setShowNew(true)
                setSelectedId(null)
                setMessages([])
              }}
            >
              {t('inbox.newConversation')}
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {loadingList ? (
              <div className="flex justify-center py-8">
                <Spinner />
              </div>
            ) : threads.length === 0 && !showNew ? (
              <p className="p-4 text-center text-sm text-gray-700">{t('inbox.noThreads')}</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {threads.map((th) => (
                  <li key={th.id}>
                    <button
                      type="button"
                      onClick={() => openThread(th.id)}
                      className={`flex w-full flex-col items-start gap-0.5 px-4 py-3 text-left active:bg-gray-50 ${
                        selectedId === th.id ? 'bg-blue-50' : ''
                      }`}
                    >
                      <span className="line-clamp-1 w-full text-sm font-semibold text-gray-900">{th.subject}</span>
                      <span className="text-xs text-gray-700">
                        {th.status === 'open' ? t('inbox.open') : t('inbox.closed')}
                        {th.last_message_at
                          ? ` · ${new Date(th.last_message_at).toLocaleString()}`
                          : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-gray-50">
          {showNew ? (
            <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
              <h2 className="text-base font-semibold text-gray-900">{t('inbox.newConversation')}</h2>
              <label className="block text-xs font-medium text-gray-700">
                {t('inbox.subjectPlaceholder')}
                <input
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-600"
                  placeholder={t('inbox.subjectPlaceholder')}
                />
              </label>
              <label className="block text-xs font-medium text-gray-700">
                {t('inbox.messagePlaceholder')}
                <textarea
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                  rows={5}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-600"
                />
              </label>
              <label className="block text-xs font-medium text-gray-700">
                {t('inbox.attachImage')}
                <input
                  type="file"
                  accept="image/jpeg,image/jpg,image/png,image/webp,image/gif"
                  className="mt-1 block w-full text-sm text-gray-700"
                  id="inbox-new-file"
                />
              </label>
              {sendError && <p className="text-sm text-red-700">{sendError}</p>}
              <Button
                type="button"
                variant="primary"
                loading={sending}
                onClick={() => {
                  const input = document.getElementById('inbox-new-file') as HTMLInputElement | null
                  const f = input?.files?.[0] ?? null
                  void sendNewThread(f)
                }}
              >
                {t('inbox.send')}
              </Button>
            </div>
          ) : selected ? (
            <>
              <div className="shrink-0 border-b border-gray-200 bg-white px-4 py-2">
                <p className="text-sm font-semibold text-gray-900">{selected.subject}</p>
                <p className="text-xs text-gray-700">
                  {selected.status === 'open' ? t('inbox.open') : t('inbox.closed')}
                </p>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {loadingMessages ? (
                  <div className="flex justify-center py-8">
                    <Spinner />
                  </div>
                ) : (
                  <ul className="flex flex-col gap-3">
                    {messages.map((m) => (
                      <li
                        key={m.id}
                        className={`max-w-[min(100%,420px)] rounded-xl px-3 py-2 text-sm ${
                          m.is_from_admin
                            ? 'self-start bg-white shadow-sm ring-1 ring-gray-100'
                            : 'self-end bg-blue-600 text-white'
                        }`}
                      >
                        <p className="text-xs font-medium opacity-90">
                          {m.is_from_admin ? t('inbox.fromTeam') : t('inbox.fromYou')}
                        </p>
                        {m.body.trim() && !(m.attachment_path && m.body.trim() === ATTACHMENT_ONLY_BODY) ? (
                          <p className={`mt-1 whitespace-pre-wrap ${m.is_from_admin ? 'text-gray-900' : ''}`}>
                            {m.body.trim()}
                          </p>
                        ) : null}
                        {m.attachment_path ? (
                          <button
                            type="button"
                            onClick={() => void openSignedAttachment(m.attachment_path!)}
                            className={`mt-2 text-xs underline ${
                              m.is_from_admin ? 'text-blue-700' : 'text-white'
                            }`}
                          >
                            {t('inbox.attachImage')}
                          </button>
                        ) : null}
                        <p
                          className={`mt-1 text-[10px] ${
                            m.is_from_admin ? 'text-gray-700' : 'text-blue-100'
                          }`}
                        >
                          {new Date(m.created_at).toLocaleString()}
                        </p>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {selected.status === 'open' ? (
                <div className="shrink-0 border-t border-gray-200 bg-white p-3">
                  <textarea
                    value={replyBody}
                    onChange={(e) => setReplyBody(e.target.value)}
                    placeholder={t('inbox.messagePlaceholder')}
                    rows={2}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-600"
                  />
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <label className="text-xs text-gray-700">
                      <span className="mr-2">{t('inbox.attachImage')}</span>
                      <input type="file" accept="image/jpeg,image/jpg,image/png,image/webp,image/gif" id="inbox-reply-file" />
                    </label>
                    <Button
                      type="button"
                      size="sm"
                      variant="primary"
                      loading={sending}
                      onClick={() => {
                        const input = document.getElementById('inbox-reply-file') as HTMLInputElement | null
                        void sendReply(input?.files?.[0] ?? null)
                      }}
                    >
                      {t('inbox.send')}
                    </Button>
                  </div>
                  {sendError && <p className="mt-2 text-xs text-red-700">{sendError}</p>}
                </div>
              ) : null}
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6">
              <p className="text-center text-sm text-gray-700">{t('inbox.noThreads')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
