-- ComePlayers V14: Search, Filters, Offer Ranking & Comparison
-- Run after V13 Catalog Variants.
-- Adds searchable offer metadata and database indexes used by the V14 marketplace API.

BEGIN;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS offer_region text NOT NULL DEFAULT 'Global',
  ADD COLUMN IF NOT EXISTS offer_platform text NOT NULL DEFAULT 'Any',
  ADD COLUMN IF NOT EXISTS offer_server text,
  ADD COLUMN IF NOT EXISTS offer_tags text[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS search_document tsvector;

UPDATE public.products
SET
  offer_region = COALESCE(NULLIF(trim(offer_region), ''), 'Global'),
  offer_platform = COALESCE(NULLIF(trim(offer_platform), ''), 'Any'),
  offer_server = NULLIF(trim(offer_server), ''),
  offer_tags = COALESCE(offer_tags, '{}'::text[])
WHERE
  offer_region IS NULL
  OR trim(offer_region) = ''
  OR offer_platform IS NULL
  OR trim(offer_platform) = ''
  OR offer_tags IS NULL
  OR (offer_server IS NOT NULL AND trim(offer_server) = '');

CREATE OR REPLACE FUNCTION public.cp_update_product_search_document()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.search_document := to_tsvector(
    'simple',
    COALESCE(NEW.title, '') || ' ' ||
    COALESCE(NEW.description, '') || ' ' ||
    COALESCE(NEW.game_name, '') || ' ' ||
    COALESCE(NEW.category, '') || ' ' ||
    COALESCE(NEW.seller_name, '') || ' ' ||
    COALESCE(NEW.offer_region, '') || ' ' ||
    COALESCE(NEW.offer_platform, '') || ' ' ||
    COALESCE(NEW.offer_server, '') || ' ' ||
    COALESCE(array_to_string(NEW.offer_tags, ' '), '')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cp_product_search_document ON public.products;
CREATE TRIGGER trg_cp_product_search_document
BEFORE INSERT OR UPDATE OF
  title,
  description,
  game_name,
  category,
  seller_name,
  offer_region,
  offer_platform,
  offer_server,
  offer_tags
ON public.products
FOR EACH ROW
EXECUTE FUNCTION public.cp_update_product_search_document();

UPDATE public.products
SET updated_at = COALESCE(updated_at, now());

CREATE INDEX IF NOT EXISTS idx_products_search_document_v14
  ON public.products USING gin(search_document);

CREATE INDEX IF NOT EXISTS idx_products_offer_region_v14
  ON public.products(lower(offer_region))
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_products_offer_platform_v14
  ON public.products(lower(offer_platform))
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_products_offer_server_v14
  ON public.products(lower(offer_server))
  WHERE status = 'active' AND offer_server IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_offer_tags_v14
  ON public.products USING gin(offer_tags)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_products_game_offer_listing_v14
  ON public.products(game_category_id, status, category_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_products_active_price_v14
  ON public.products(status, min_variant_price, id)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_product_variants_attributes_v14
  ON public.product_variants USING gin(attributes)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_profiles_offer_ranking_v14
  ON public.profiles(
    seller_status,
    seller_service_level,
    seller_on_time_rate DESC,
    seller_rating DESC
  );

COMMENT ON COLUMN public.products.offer_region IS
  'Primary marketplace region used by offer search and filters. Variant attributes may add more regions.';
COMMENT ON COLUMN public.products.offer_platform IS
  'Primary platform/device/store compatibility used by offer search and filters.';
COMMENT ON COLUMN public.products.offer_server IS
  'Optional server, shard, realm, or cluster identifier used by offer search and filters.';
COMMENT ON COLUMN public.products.offer_tags IS
  'Seller-provided discovery tags. External contact details are not permitted.';
COMMENT ON COLUMN public.products.search_document IS
  'Server-maintained PostgreSQL full-text search document for marketplace discovery.';

COMMIT;

SELECT
  'comeplayers_search_ranking_v14_ready' AS migration_status,
  count(*) AS products_indexed,
  count(*) FILTER (WHERE status = 'active') AS active_offers,
  count(*) FILTER (WHERE offer_region <> 'Global' OR offer_platform <> 'Any') AS enriched_offers
FROM public.products;
