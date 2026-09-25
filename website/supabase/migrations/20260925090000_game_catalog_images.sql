-- Canonical catalog artwork, safe admin image storage, and atomic image/category saves.
-- No existing images or games are deleted by this migration.
CREATE OR REPLACE FUNCTION public.cp_catalog_image_url(p_urls text[])
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $function$
  SELECT btrim(candidate)
  FROM unnest(p_urls) WITH ORDINALITY AS urls(candidate, position)
  WHERE nullif(btrim(candidate), '') IS NOT NULL
    AND char_length(btrim(candidate)) <= 4096
    AND candidate !~ '[[:space:][:cntrl:]]'
    AND strpos(candidate, chr(92)) = 0
    AND (candidate ~* '^https://[a-z0-9][a-z0-9.:-]*(/|\?|#|$)' OR candidate ~ '^/[^/]')
    AND candidate !~* '^https://([^/?#]+\.)?(placehold\.co|placeholder\.com|dummyimage\.com|placeimg\.com)([/:?#]|$)'
    AND candidate !~* '/(placeholder([._/-]|$)|game-cover-fallback)'
  ORDER BY position
  LIMIT 1;
$function$;

ALTER TABLE public.game_master ADD COLUMN IF NOT EXISTS catalog_image_url text
GENERATED ALWAYS AS (public.cp_catalog_image_url(ARRAY[
  image_url, cover_image_url, banner_image_url, banner_url,
  background_image, background_url, hero_url, provider_cover_url,
  provider_background_url, icon_url, logo_url
])) STORED;

CREATE INDEX IF NOT EXISTS idx_game_master_missing_catalog_image
ON public.game_master (name, id) WHERE catalog_image_url IS NULL;

-- Preserve column names/types/order and category mapping semantics used by /api/games.
CREATE OR REPLACE VIEW public.game_master_marketplace_catalog
WITH (security_invoker = true) AS
SELECT gm.id, gm.name, gm.slug, gm.first_letter, gm.status, gm.is_active,
  gm.catalog_image_url AS image_url,
  gm.catalog_image_url AS cover_image_url,
  gm.background_image, gm.offer_count, gm.is_trending, gm.is_featured, gm.rating, gm.metacritic,
  CASE WHEN EXISTS (
    SELECT 1 FROM public.category_game_master m WHERE m.game_master_id = gm.id
  ) THEN ARRAY(
    SELECT m.category_id FROM public.category_game_master m
    WHERE m.game_master_id = gm.id AND m.status = 'active' ORDER BY m.category_id
  ) ELSE ARRAY(
    SELECT c.id FROM public.categories c WHERE c.id = gm.category_id
  ) END AS marketplace_category_ids,
  gm.normalized_name
FROM public.game_master gm;

CREATE OR REPLACE FUNCTION public.cp_admin_save_game_catalog(
  p_game_id bigint, p_details jsonb, p_category_ids bigint[]
) RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_game public.game_master%rowtype;
  v_name text := btrim(p_details->>'name');
  v_slug text := btrim(p_details->>'slug');
  v_status text := p_details->>'status';
  v_image text := nullif(btrim(p_details->>'image_url'), '');
  v_image_changed boolean;
  v_overrides text[];
  v_field text;
BEGIN
  IF auth.uid() IS NULL OR NOT public.cp_is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Hanya admin yang dapat mengubah game.' USING errcode = '42501';
  END IF;
  IF jsonb_typeof(p_details) IS DISTINCT FROM 'object'
    OR v_name IS NULL OR char_length(v_name) NOT BETWEEN 1 AND 200
    OR v_slug IS NULL OR v_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    OR char_length(v_slug) > 300 OR v_status IS NULL OR v_status NOT IN ('active', 'inactive') THEN
    RAISE EXCEPTION 'Nama, slug, atau status game tidak valid.' USING errcode = '22023';
  END IF;
  SELECT * INTO v_game FROM public.game_master WHERE id = p_game_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Game tidak ditemukan.' USING errcode = 'P0002'; END IF;
  v_image_changed := v_game.image_url IS DISTINCT FROM v_image;
  IF v_image_changed AND v_image IS NOT NULL AND public.cp_catalog_image_url(ARRAY[v_image]) IS NULL THEN
    RAISE EXCEPTION 'Gunakan URL HTTPS gambar asli atau unggah gambar, bukan placeholder.' USING errcode = '22023';
  END IF;
  v_overrides := coalesce(v_game.local_override_fields, '{}'::text[]);
  FOREACH v_field IN ARRAY ARRAY['name', 'slug', 'image_url', 'description'] LOOP
    IF (to_jsonb(v_game)->>v_field) IS DISTINCT FROM nullif(btrim(p_details->>v_field), '') THEN
      v_overrides := array_append(v_overrides, v_field);
    END IF;
  END LOOP;
  IF v_image_changed THEN v_overrides := array_append(v_overrides, 'cover_image_url'); END IF;
  UPDATE public.game_master SET
    name = v_name, slug = v_slug,
    normalized_name = lower(regexp_replace(v_name, '[[:space:]]+', ' ', 'g')),
    first_letter = upper(left(v_name, 1)), status = v_status, is_active = (v_status = 'active'),
    image_url = v_image,
    -- Legacy marketplace cards also read cover_image_url; keep admin artwork consistent.
    cover_image_url = CASE WHEN v_image_changed THEN v_image ELSE v_game.cover_image_url END,
    icon_url = nullif(btrim(p_details->>'icon_url'), ''),
    logo_url = nullif(btrim(p_details->>'logo_url'), ''),
    banner_url = nullif(btrim(p_details->>'banner_url'), ''),
    mobile_banner_url = nullif(btrim(p_details->>'mobile_banner_url'), ''),
    background_url = nullif(btrim(p_details->>'background_url'), ''),
    hero_url = nullif(btrim(p_details->>'hero_url'), ''),
    description = nullif(btrim(p_details->>'description'), ''),
    local_override_fields = ARRAY(SELECT DISTINCT f FROM unnest(v_overrides) x(f)),
    updated_at = now()
  WHERE id = p_game_id;
  PERFORM public.cp_admin_map_game_categories(p_game_id, p_category_ids, true);
END;
$function$;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('game-catalog-images', 'game-catalog-images', true, 2097152, ARRAY['image/jpeg', 'image/png', 'image/webp'])
ON CONFLICT (id) DO NOTHING;

CREATE POLICY cp_game_catalog_images_admin_insert ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'game-catalog-images'
  AND public.cp_is_admin((SELECT auth.uid()))
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
  AND array_length(storage.foldername(name), 1) = 2
  AND (storage.foldername(name))[2] ~ '^[1-9][0-9]*$'
  AND storage.filename(name) ~ '^[0-9a-f-]{36}\.(webp|png|jpg|jpeg)$'
);

CREATE POLICY cp_game_catalog_images_admin_select ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id = 'game-catalog-images' AND public.cp_is_admin((SELECT auth.uid()))
);

CREATE POLICY cp_game_catalog_images_admin_delete_own ON storage.objects
FOR DELETE TO authenticated USING (
  bucket_id = 'game-catalog-images'
  AND public.cp_is_admin((SELECT auth.uid()))
  AND (storage.foldername(name))[1] = (SELECT auth.uid())::text
);

NOTIFY pgrst, 'reload schema';
