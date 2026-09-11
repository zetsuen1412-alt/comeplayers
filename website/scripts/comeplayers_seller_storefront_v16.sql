-- ComePlayers V16: Seller Storefront & Marketplace Branding
-- Run after V15 Verified Reviews.
-- Idempotent migration. Existing sellers receive a private-safe default slug.

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS store_slug text,
  ADD COLUMN IF NOT EXISTS store_name text,
  ADD COLUMN IF NOT EXISTS store_tagline text,
  ADD COLUMN IF NOT EXISTS store_description text,
  ADD COLUMN IF NOT EXISTS store_banner_url text,
  ADD COLUMN IF NOT EXISTS store_logo_url text,
  ADD COLUMN IF NOT EXISTS store_accent_color text NOT NULL DEFAULT '#22d3ee',
  ADD COLUMN IF NOT EXISTS store_announcement text,
  ADD COLUMN IF NOT EXISTS store_policies jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS store_vacation_mode boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS store_vacation_message text,
  ADD COLUMN IF NOT EXISTS store_reopens_at timestamptz,
  ADD COLUMN IF NOT EXISTS store_is_published boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS store_updated_at timestamptz NOT NULL DEFAULT now();

UPDATE public.profiles
SET
  store_slug = CASE
    WHEN lower(trim(COALESCE(store_slug, ''))) ~ '^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$'
      AND lower(trim(COALESCE(store_slug, ''))) NOT IN (
        'admin', 'api', 'account', 'seller', 'sellers', 'store', 'marketplace',
        'support', 'help', 'about', 'login', 'signup'
      )
      THEN lower(trim(store_slug))
    ELSE 'seller-' || left(replace(id::text, '-', ''), 12)
  END,
  store_name = COALESCE(
    NULLIF(trim(store_name), ''),
    NULLIF(trim(seller_name), ''),
    NULLIF(trim(username), ''),
    'ComePlayers Store'
  ),
  store_accent_color = CASE
    WHEN COALESCE(store_accent_color, '') ~ '^#[0-9A-Fa-f]{6}$' THEN store_accent_color
    ELSE '#22d3ee'
  END,
  store_policies = COALESCE(store_policies, '{}'::jsonb),
  store_vacation_mode = COALESCE(store_vacation_mode, false),
  store_is_published = COALESCE(store_is_published, true),
  store_updated_at = COALESCE(store_updated_at, now())
WHERE role IN ('seller', 'admin') OR seller_status = 'approved';

-- Protect idempotent installs from pre-existing duplicate custom slugs.
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (PARTITION BY lower(store_slug) ORDER BY id) AS duplicate_rank
  FROM public.profiles
  WHERE store_slug IS NOT NULL
)
UPDATE public.profiles AS profile
SET store_slug = 'seller-' || left(replace(profile.id::text, '-', ''), 12)
FROM ranked
WHERE profile.id = ranked.id
  AND ranked.duplicate_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS uq_profiles_store_slug_v16
  ON public.profiles (lower(store_slug))
  WHERE store_slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_store_public_v16
  ON public.profiles (store_is_published, store_slug)
  WHERE store_is_published = true AND store_slug IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.seller_store_featured_products (
  id bigserial PRIMARY KEY,
  seller_id uuid NOT NULL,
  product_id bigint NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(seller_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_store_featured_seller_v16
  ON public.seller_store_featured_products(seller_id, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_store_featured_product_v16
  ON public.seller_store_featured_products(product_id);

ALTER TABLE public.seller_store_featured_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS seller_store_featured_no_direct_access_v16
  ON public.seller_store_featured_products;

REVOKE ALL ON public.seller_store_featured_products FROM anon, authenticated;
GRANT ALL ON public.seller_store_featured_products TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.seller_store_featured_products_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.cp_update_seller_storefront_v16(
  p_seller_id uuid,
  p_store_slug text,
  p_store_name text,
  p_store_tagline text DEFAULT NULL,
  p_store_description text DEFAULT NULL,
  p_store_banner_url text DEFAULT NULL,
  p_store_logo_url text DEFAULT NULL,
  p_store_accent_color text DEFAULT '#22d3ee',
  p_store_announcement text DEFAULT NULL,
  p_store_policies jsonb DEFAULT '{}'::jsonb,
  p_store_vacation_mode boolean DEFAULT false,
  p_store_vacation_message text DEFAULT NULL,
  p_store_reopens_at timestamptz DEFAULT NULL,
  p_store_is_published boolean DEFAULT true,
  p_featured_product_ids bigint[] DEFAULT ARRAY[]::bigint[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_slug text := lower(trim(COALESCE(p_store_slug, '')));
  v_featured_count integer := COALESCE(array_length(p_featured_product_ids, 1), 0);
  v_owned_count integer := 0;
BEGIN
  IF p_seller_id IS NULL THEN
    RAISE EXCEPTION 'Seller ID is required.';
  END IF;

  IF v_slug !~ '^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$' THEN
    RAISE EXCEPTION 'Store slug must be 3-40 lowercase letters, numbers, or dashes.';
  END IF;

  IF v_slug IN ('admin', 'api', 'account', 'seller', 'sellers', 'store', 'marketplace', 'support', 'help', 'about', 'login', 'signup') THEN
    RAISE EXCEPTION 'This store slug is reserved.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE lower(store_slug) = v_slug
      AND id <> p_seller_id
  ) THEN
    RAISE EXCEPTION 'This store URL is already in use.';
  END IF;

  IF v_featured_count > 8 THEN
    RAISE EXCEPTION 'A storefront can feature at most 8 products.';
  END IF;

  IF v_featured_count > 0 THEN
    SELECT count(DISTINCT p.id)::integer
    INTO v_owned_count
    FROM public.products p
    WHERE p.id = ANY(p_featured_product_ids)
      AND p.seller_id = p_seller_id
      AND lower(COALESCE(p.status, 'active')) = 'active';

    IF v_owned_count <> (
      SELECT count(DISTINCT item)::integer
      FROM unnest(p_featured_product_ids) AS item
    ) THEN
      RAISE EXCEPTION 'One or more featured products are invalid or inactive.';
    END IF;
  END IF;

  UPDATE public.profiles
  SET
    store_slug = v_slug,
    store_name = trim(COALESCE(p_store_name, '')),
    store_tagline = NULLIF(trim(COALESCE(p_store_tagline, '')), ''),
    store_description = NULLIF(trim(COALESCE(p_store_description, '')), ''),
    store_banner_url = NULLIF(trim(COALESCE(p_store_banner_url, '')), ''),
    store_logo_url = NULLIF(trim(COALESCE(p_store_logo_url, '')), ''),
    store_accent_color = p_store_accent_color,
    store_announcement = NULLIF(trim(COALESCE(p_store_announcement, '')), ''),
    store_policies = COALESCE(p_store_policies, '{}'::jsonb),
    store_vacation_mode = COALESCE(p_store_vacation_mode, false),
    store_vacation_message = NULLIF(trim(COALESCE(p_store_vacation_message, '')), ''),
    store_reopens_at = p_store_reopens_at,
    store_is_published = COALESCE(p_store_is_published, true),
    store_updated_at = now()
  WHERE id = p_seller_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Seller profile not found.';
  END IF;

  DELETE FROM public.seller_store_featured_products
  WHERE seller_id = p_seller_id;

  IF v_featured_count > 0 THEN
    INSERT INTO public.seller_store_featured_products(seller_id, product_id, sort_order)
    SELECT p_seller_id, item, ordinality::integer - 1
    FROM unnest(p_featured_product_ids) WITH ORDINALITY AS featured(item, ordinality)
    ON CONFLICT (seller_id, product_id)
    DO UPDATE SET sort_order = EXCLUDED.sort_order;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.cp_update_seller_storefront_v16(
  uuid, text, text, text, text, text, text, text, text, jsonb,
  boolean, text, timestamptz, boolean, bigint[]
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cp_update_seller_storefront_v16(
  uuid, text, text, text, text, text, text, text, text, jsonb,
  boolean, text, timestamptz, boolean, bigint[]
) TO service_role;

COMMENT ON COLUMN public.profiles.store_slug IS 'Public seller storefront URL slug.';
COMMENT ON COLUMN public.profiles.store_policies IS 'Public storefront policy sections: delivery, refund, support.';
COMMENT ON TABLE public.seller_store_featured_products IS 'Seller-curated products shown first on the public storefront.';

COMMIT;

SELECT
  'comeplayers_seller_storefront_v16_ready' AS migration_status,
  count(*) FILTER (WHERE store_slug IS NOT NULL) AS storefronts_ready,
  count(*) FILTER (WHERE store_is_published = true AND store_slug IS NOT NULL) AS storefronts_published
FROM public.profiles;
