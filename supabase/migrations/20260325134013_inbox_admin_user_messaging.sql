-- Admin ↔ user in-app messaging (threads + messages), attachments bucket, realtime, helper RPCs.

-- ─── Tables ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.inbox_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject text NOT NULL DEFAULT 'Support',
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
  last_message_at timestamptz,
  user_last_read_at timestamptz NOT NULL DEFAULT '1970-01-01T00:00:00Z',
  admin_last_read_at timestamptz NOT NULL DEFAULT '1970-01-01T00:00:00Z',
  bulk_batch_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS inbox_threads_user_id_last_message_at
  ON public.inbox_threads(user_id, last_message_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS inbox_threads_status ON public.inbox_threads(status);

CREATE TABLE IF NOT EXISTS public.inbox_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES public.inbox_threads(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_from_admin boolean NOT NULL,
  body text NOT NULL DEFAULT '',
  attachment_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inbox_messages_body_or_attachment CHECK (
    length(trim(body)) > 0 OR attachment_path IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS inbox_messages_thread_id_created_at
  ON public.inbox_messages(thread_id, created_at);

-- ─── updated_at / last_message_at ────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.inbox_touch_thread_on_message()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.inbox_threads
  SET
    last_message_at = NEW.created_at,
    updated_at = now()
  WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inbox_messages_touch_thread ON public.inbox_messages;
CREATE TRIGGER inbox_messages_touch_thread
  AFTER INSERT ON public.inbox_messages
  FOR EACH ROW
  EXECUTE PROCEDURE public.inbox_touch_thread_on_message();

-- ─── RLS helper (inline in policies elsewhere; used in RPCs) ─────────────────

ALTER TABLE public.inbox_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbox_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inbox_threads_select ON public.inbox_threads;
CREATE POLICY inbox_threads_select ON public.inbox_threads
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.admin_users WHERE admin_users.user_id = auth.uid())
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

DROP POLICY IF EXISTS inbox_threads_insert_owner ON public.inbox_threads;
CREATE POLICY inbox_threads_insert_owner ON public.inbox_threads
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS inbox_threads_insert_admin ON public.inbox_threads;
CREATE POLICY inbox_threads_insert_admin ON public.inbox_threads
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.admin_users WHERE admin_users.user_id = auth.uid())
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

DROP POLICY IF EXISTS inbox_threads_update_owner ON public.inbox_threads;
CREATE POLICY inbox_threads_update_owner ON public.inbox_threads
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS inbox_threads_update_admin ON public.inbox_threads;
CREATE POLICY inbox_threads_update_admin ON public.inbox_threads
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.admin_users WHERE admin_users.user_id = auth.uid())
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.admin_users WHERE admin_users.user_id = auth.uid())
    OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
  );

DROP POLICY IF EXISTS inbox_messages_select ON public.inbox_messages;
CREATE POLICY inbox_messages_select ON public.inbox_messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.inbox_threads t
      WHERE t.id = thread_id
        AND (
          t.user_id = auth.uid()
          OR EXISTS (SELECT 1 FROM public.admin_users WHERE admin_users.user_id = auth.uid())
          OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
        )
    )
  );

DROP POLICY IF EXISTS inbox_messages_insert_owner ON public.inbox_messages;
CREATE POLICY inbox_messages_insert_owner ON public.inbox_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND is_from_admin = false
    AND EXISTS (
      SELECT 1 FROM public.inbox_threads t
      WHERE t.id = thread_id AND t.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS inbox_messages_insert_admin ON public.inbox_messages;
CREATE POLICY inbox_messages_insert_admin ON public.inbox_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND is_from_admin = true
    AND (
      EXISTS (SELECT 1 FROM public.admin_users WHERE admin_users.user_id = auth.uid())
      OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    )
    AND EXISTS (SELECT 1 FROM public.inbox_threads t WHERE t.id = thread_id)
  );

-- ─── RPCs ────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.inbox_mark_thread_read(p_thread_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tuid uuid;
  is_adm boolean;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  SELECT user_id INTO tuid FROM public.inbox_threads WHERE id = p_thread_id;
  IF tuid IS NULL THEN
    RAISE EXCEPTION 'thread not found';
  END IF;
  is_adm :=
    (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    OR EXISTS (SELECT 1 FROM public.admin_users WHERE admin_users.user_id = auth.uid());
  IF is_adm THEN
    UPDATE public.inbox_threads
    SET admin_last_read_at = now(), updated_at = now()
    WHERE id = p_thread_id;
  ELSIF tuid = auth.uid() THEN
    UPDATE public.inbox_threads
    SET user_last_read_at = now(), updated_at = now()
    WHERE id = p_thread_id;
  ELSE
    RAISE EXCEPTION 'forbidden';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.inbox_mark_thread_read(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.inbox_user_unread_thread_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer
  FROM public.inbox_threads t
  WHERE t.user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.inbox_messages m
      WHERE m.thread_id = t.id
        AND m.is_from_admin = true
        AND m.created_at > t.user_last_read_at
    );
$$;

GRANT EXECUTE ON FUNCTION public.inbox_user_unread_thread_count() TO authenticated;

CREATE OR REPLACE FUNCTION public.inbox_admin_unread_thread_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN
      (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
      OR EXISTS (SELECT 1 FROM public.admin_users WHERE admin_users.user_id = auth.uid())
    THEN (
      SELECT count(*)::integer
      FROM public.inbox_threads t
      WHERE EXISTS (
        SELECT 1 FROM public.inbox_messages m
        WHERE m.thread_id = t.id
          AND m.is_from_admin = false
          AND m.created_at > t.admin_last_read_at
      )
    )
    ELSE 0
  END;
$$;

GRANT EXECUTE ON FUNCTION public.inbox_admin_unread_thread_count() TO authenticated;

-- ─── Storage ─────────────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'inbox-attachments',
  'inbox-attachments',
  false,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS inbox_attachments_insert_own ON storage.objects;
CREATE POLICY inbox_attachments_insert_own
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'inbox-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS inbox_attachments_select_own ON storage.objects;
CREATE POLICY inbox_attachments_select_own
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'inbox-attachments'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS inbox_attachments_select_admin ON storage.objects;
CREATE POLICY inbox_attachments_select_admin
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'inbox-attachments'
    AND (
      EXISTS (SELECT 1 FROM public.admin_users WHERE admin_users.user_id = auth.uid())
      OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    )
  );

DROP POLICY IF EXISTS inbox_attachments_insert_admin ON storage.objects;
CREATE POLICY inbox_attachments_insert_admin
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'inbox-attachments'
    AND (
      EXISTS (SELECT 1 FROM public.admin_users WHERE admin_users.user_id = auth.uid())
      OR (auth.jwt() -> 'app_metadata' ->> 'role') = 'admin'
    )
  );

-- ─── Realtime ────────────────────────────────────────────────────────────────

ALTER PUBLICATION supabase_realtime ADD TABLE public.inbox_threads;
ALTER PUBLICATION supabase_realtime ADD TABLE public.inbox_messages;
