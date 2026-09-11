-- ComePlayers V14.1: Search Ranking compatibility fix
-- Run this instead of the original V14 SQL after V13.
-- Fixes databases where profiles.seller_rating / seller_review_count do not yet exist.

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. Compatibility columns required by the V14 ranking API
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS seller_rating numeric(4,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seller_review_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS seller_status text DEFAULT 'not_applied',
  ADD COLUMN IF NOT EXISTS seller_service_level text DEFAULT 'new',
  ADD COLUMN IF NOT EXISTS seller_on_time_rate numeric(5,2) DEFAULT 100;

UPDATE public.profiles
SET
  seller_rating = COALESCE(seller_rating, 0),
  seller_review_count = COALESCE(seller_review_count, 0),
  seller_status = COALESCE(NULLIF(trim(seller_status), ''), 'not_applied'),
  seller_service_level = COALESCE(NULLIF(lower(trim(seller_service_level)), ''), 'new'),
  seller_on_time_rate = GREATEST(0, LEAST(COALESCE(seller_on_time_rate, 100), 100));

-- Backfill seller rating summaries from existing reviews, when the table exists.
DO $$
BEGIN
  IF to_regclass('public.seller_reviews') IS NOT NULL THEN
    EXECUTE $backfill$
      UPDATE public.profiles p
      SET
        seller_rating = COALESCE(r.average_rating, 0),
        seller_review_count = COALESCE(r.review_count, 0)
      FROM (
        SELECT
          seller_id,
          round(avg(rating)::numeric, 2) AS average_rating,
          count(*)::integer AS review_count
        FROM public.seller_reviews
        WHERE seller_id IS NOT NULL
          AND rating BETWEEN 1 AND 5
        GROUP BY seller_id
      ) r
      WHERE p.id = r.seller_id
    $backfill$;
  END IF;
END;
$$;

-- Keep profile rating summaries synchronized after future seller review changes.
CREATE OR REPLACE FUNCTION public.cp_refresh_seller_rating_summary(p_seller_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_seller_id IS NULL THEN
    RETURN;
  END IF;

  UPDATE public.profiles p
  SET
    seller_rating = COALESCE((
      SELECT round(avg(sr.rating)::numeric, 2)
      FROM public.seller_reviews sr
      WHERE sr.seller_id = p_seller_id
        AND sr.rating BETWEEN 1 AND 5
    ), 0),
    seller_review_count = COALESCE((
      SELECT count(*)::integer
      FROM public.seller_reviews sr
      WHERE sr.seller_id = p_seller_id
        AND sr.rating BETWEEN 1 AND 5
    ), 0)
  WHERE p.id = p_seller_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.cp_seller_reviews_rating_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.cp_refresh_seller_rating_summary(OLD.seller_id);
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.seller_id IS DISTINCT FROM NEW.seller_id THEN
    PERFORM public.cp_refresh_seller_rating_summary(OLD.seller_id);
  END IF;

  PERFORM public.cp_refresh_seller_rating_summary(NEW.seller_id);
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.seller_reviews') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_cp_seller_reviews_rating_summary ON public.seller_reviews;
    CREATE TRIGGER trg_cp_seller_reviews_rating_summary
    AFTER INSERT OR UPDATE OR DELETE ON public.seller_reviews
    FOR EACH ROW
    EXECUTE FUNCTION public.cp_seller_reviews_rating_trigger();
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. V14 searchable offer metadata
-- -----------------------------------------------------------------------------
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

-- Explicitly populate existing rows. The original V14 updated only updated_at,
-- which did not fire the UPDATE OF search trigger for existing products.
UPDATE public.products
SET
  search_document = to_tsvector(
    'simple',
    COALESCE(title, '') || ' ' ||
    COALESCE(description, '') || ' ' ||
    COALESCE(game_name, '') || ' ' ||
    COALESCE(category, '') || ' ' ||
    COALESCE(seller_name, '') || ' ' ||
    COALESCE(offer_region, '') || ' ' ||
    COALESCE(offer_platform, '') || ' ' ||
    COALESCE(offer_server, '') || ' ' ||
    COALESCE(array_to_string(offer_tags, ' '), '')
  ),
  updated_at = COALESCE(updated_at, now());

-- -----------------------------------------------------------------------------
-- 3. Search and ranking indexes
-- -----------------------------------------------------------------------------
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
COMMENT ON COLUMN public.profiles.seller_rating IS
  'Cached average seller rating derived from seller_reviews.';
COMMENT ON COLUMN public.profiles.seller_review_count IS
  'Cached number of valid seller reviews.';

COMMIT;

SELECT
  'comeplayers_search_ranking_v14_1_ready' AS migration_status,
  count(*) AS products_indexed,
  count(*) FILTER (WHERE status = 'active') AS active_offers,
  count(*) FILTER (WHERE offer_region <> 'Global' OR offer_platform <> 'Any') AS enriched_offers,
  count(*) FILTER (WHERE search_document IS NOT NULL) AS search_documents_ready
FROM public.products;
