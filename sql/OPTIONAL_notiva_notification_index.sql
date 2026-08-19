-- NOTIVA_PATCH_01_SAFE_NOTIFICATION_INDEX_V1
-- Optional only. Run manually in Supabase SQL Editor after the app patch is verified.
-- Does not modify data, RLS, columns, or application behavior.

CREATE INDEX IF NOT EXISTS idx_wa_conversations_unread_last_message_at
ON public.wa_conversations (last_message_at DESC)
WHERE unread_count > 0;
