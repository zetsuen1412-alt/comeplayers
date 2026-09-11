-- ComePlayers V58: CP Empires & Allies online presence, invitations and social bridge.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.empires_allies_presence (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'online',
  world_name text,
  level integer NOT NULL DEFAULT 0,
  service_region text NOT NULL DEFAULT 'global',
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT empires_presence_status_v58 CHECK (status IN ('online', 'playing', 'offline'))
);

CREATE INDEX IF NOT EXISTS empires_presence_status_seen_v58_idx
  ON public.empires_allies_presence(status, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.empires_allies_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending',
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '10 minutes'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT empires_invites_distinct_users_v58 CHECK (sender_id <> recipient_id),
  CONSTRAINT empires_invites_status_v58 CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'expired'))
);

CREATE INDEX IF NOT EXISTS empires_invites_recipient_v58_idx
  ON public.empires_allies_invites(recipient_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS empires_invites_sender_v58_idx
  ON public.empires_allies_invites(sender_id, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS empires_invites_pending_pair_v58_uidx
  ON public.empires_allies_invites(sender_id, recipient_id)
  WHERE status = 'pending';

ALTER TABLE public.empires_allies_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.empires_allies_invites ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.empires_allies_presence FROM anon, authenticated;
REVOKE ALL ON public.empires_allies_invites FROM anon, authenticated;
GRANT ALL ON public.empires_allies_presence TO service_role;
GRANT ALL ON public.empires_allies_invites TO service_role;

COMMIT;

SELECT 'empires_allies_online_social_v58_ready' AS status;
