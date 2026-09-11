-- ComePlayers V38: friend relationships, user presence, and floating private chats.
-- All mutations are performed by authenticated server routes using service_role.
-- Browser roles do not receive direct table access.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.chat_friendships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_a uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  user_b uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requested_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_friendships_distinct_users_v38 CHECK (user_a <> user_b),
  CONSTRAINT chat_friendships_status_v38 CHECK (status IN ('pending', 'accepted', 'blocked')),
  CONSTRAINT chat_friendships_requester_v38 CHECK (requested_by = user_a OR requested_by = user_b)
);

CREATE UNIQUE INDEX IF NOT EXISTS chat_friendships_pair_v38_uidx
  ON public.chat_friendships(user_a, user_b);
CREATE INDEX IF NOT EXISTS chat_friendships_user_a_status_v38_idx
  ON public.chat_friendships(user_a, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS chat_friendships_user_b_status_v38_idx
  ON public.chat_friendships(user_b, status, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.chat_user_presence (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'online',
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_user_presence_status_v38 CHECK (
    status IN ('online', 'away', 'invisible', 'offline')
  )
);

CREATE INDEX IF NOT EXISTS chat_user_presence_activity_v38_idx
  ON public.chat_user_presence(status, last_seen_at DESC);

ALTER TABLE public.chat_friendships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_user_presence ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.chat_friendships FROM anon, authenticated;
REVOKE ALL ON public.chat_user_presence FROM anon, authenticated;
GRANT ALL ON public.chat_friendships TO service_role;
GRANT ALL ON public.chat_user_presence TO service_role;

COMMIT;

SELECT 'messages_friends_presence_v38_ready' AS status;
