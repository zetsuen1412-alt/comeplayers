-- ComePlayers V25: Local game catalog ownership and WOW Ascension coin listing.
-- Seeds the WOW Ascension Game Coins listing with server/faction variants.
-- Legacy provider rows remain in game_master for audit; runtime catalog pages
-- read from Supabase and no longer depend on the retired RAWG seed script.

BEGIN;

INSERT INTO public.categories (name, slug, icon)
VALUES ('Game Coins', 'game-coins', NULL)
ON CONFLICT (slug) DO UPDATE
SET
  name = EXCLUDED.name;

DO $$
DECLARE
  v_category_id bigint;
  v_game_id bigint;
  v_product_id bigint;
  v_seller_id uuid;
  v_seller_name text;
  v_variant record;
BEGIN
  SELECT id INTO v_category_id
  FROM public.categories
  WHERE slug = 'game-coins'
  LIMIT 1;

  SELECT id, COALESCE(NULLIF(trim(seller_name), ''), NULLIF(trim(username), ''), email, 'evogaming')
  INTO v_seller_id, v_seller_name
  FROM public.profiles
  WHERE lower(COALESCE(seller_status, '')) = 'approved'
    AND (
      lower(COALESCE(email, '')) = 'admin@comeplayers.com'
      OR lower(COALESCE(username, '')) = 'evogaming'
      OR lower(COALESCE(seller_name, '')) = 'evogaming'
    )
  ORDER BY created_at DESC NULLS LAST
  LIMIT 1;

  IF v_seller_id IS NULL THEN
    RAISE EXCEPTION 'Approved evogaming seller profile is required for the WOW Ascension listing.';
  END IF;

  INSERT INTO public.game_master (
    name,
    slug,
    first_letter,
    status,
    image_url,
    cover_image_url,
    background_image,
    description,
    is_active,
    normalized_name,
    category_id,
    source,
    source_url,
    offer_count,
    search_count,
    is_trending,
    is_featured,
    metadata,
    rating,
    rating_top,
    genres,
    platforms,
    stores,
    tags,
    sync_status,
    local_override_fields,
    updated_at
  )
  VALUES (
    'WOW Ascension',
    'wow-ascension',
    'W',
    'active',
    '/category-banners/game-coins.png',
    '/category-banners/game-coins.png',
    '/category-banners/game-coins.png',
    'WOW Ascension private server marketplace catalog for gold and coin offers across Rexxar and Vol''jin.',
    true,
    'wow ascension',
    v_category_id,
    'local',
    NULL,
    1,
    0,
    true,
    true,
    jsonb_build_object(
      'catalog_owner', 'comeplayers',
      'category_slug', 'game-coins',
      'servers', jsonb_build_array('Rexxar', 'Vol''jin'),
      'factions', jsonb_build_array('Alliance', 'Horde')
    ),
    0,
    0,
    jsonb_build_array(jsonb_build_object('name', 'MMORPG', 'slug', 'mmorpg')),
    jsonb_build_array(jsonb_build_object('name', 'PC', 'slug', 'pc')),
    '[]'::jsonb,
    jsonb_build_array(
      jsonb_build_object('name', 'Gold', 'slug', 'gold'),
      jsonb_build_object('name', 'Game Coins', 'slug', 'game-coins')
    ),
    'manual',
    ARRAY['name', 'slug', 'description', 'image_url', 'category_id'],
    now()
  )
  ON CONFLICT (slug) DO UPDATE
  SET
    name = EXCLUDED.name,
    first_letter = EXCLUDED.first_letter,
    status = EXCLUDED.status,
    image_url = EXCLUDED.image_url,
    cover_image_url = EXCLUDED.cover_image_url,
    background_image = EXCLUDED.background_image,
    description = EXCLUDED.description,
    is_active = EXCLUDED.is_active,
    normalized_name = EXCLUDED.normalized_name,
    category_id = EXCLUDED.category_id,
    source = EXCLUDED.source,
    offer_count = GREATEST(public.game_master.offer_count, EXCLUDED.offer_count),
    is_trending = EXCLUDED.is_trending,
    is_featured = EXCLUDED.is_featured,
    metadata = EXCLUDED.metadata,
    genres = EXCLUDED.genres,
    platforms = EXCLUDED.platforms,
    tags = EXCLUDED.tags,
    sync_status = EXCLUDED.sync_status,
    local_override_fields = EXCLUDED.local_override_fields,
    updated_at = now()
  RETURNING id INTO v_game_id;

  SELECT id INTO v_product_id
  FROM public.products
  WHERE slug = 'wow-ascension-gold-free'
  ORDER BY id ASC
  LIMIT 1
  FOR UPDATE;

  IF v_product_id IS NULL THEN
    INSERT INTO public.products (
      title,
      description,
      price,
      seller,
      seller_id,
      seller_name,
      category,
      category_id,
      game_name,
      game_category_id,
      slug,
      image_url,
      stock,
      status,
      delivery_eta_minutes,
      offer_region,
      offer_platform,
      offer_server,
      offer_tags,
      policy_status,
      policy_reasons,
      policy_checked_at,
      updated_at
    )
    VALUES (
      'WOW Ascension Gold (Free)',
      'Game coin listing for WOW Ascension gold. Choose Rexxar or Vol''jin, then select Alliance or Horde. Prices follow the provided rate per 1k gold, with each server and faction stocked at 99999.',
      '555',
      v_seller_name,
      v_seller_id,
      v_seller_name,
      'Game Coins',
      v_category_id,
      'WOW Ascension',
      v_game_id,
      'wow-ascension-gold-free',
      '/category-banners/game-coins.png',
      399996,
      'active',
      60,
      'Global',
      'PC',
      NULL,
      ARRAY['wow ascension', 'gold', 'game coins', 'rexxar', 'voljin', 'alliance', 'horde'],
      'allowed',
      '[]'::jsonb,
      now(),
      now()
    )
    RETURNING id INTO v_product_id;
  ELSE
    UPDATE public.products
    SET
      title = 'WOW Ascension Gold (Free)',
      description = 'Game coin listing for WOW Ascension gold. Choose Rexxar or Vol''jin, then select Alliance or Horde. Prices follow the provided rate per 1k gold, with each server and faction stocked at 99999.',
      price = '555',
      seller = v_seller_name,
      seller_id = v_seller_id,
      seller_name = v_seller_name,
      category = 'Game Coins',
      category_id = v_category_id,
      game_name = 'WOW Ascension',
      game_category_id = v_game_id,
      image_url = '/category-banners/game-coins.png',
      stock = 399996,
      status = 'active',
      delivery_eta_minutes = 60,
      offer_region = 'Global',
      offer_platform = 'PC',
      offer_server = NULL,
      offer_tags = ARRAY['wow ascension', 'gold', 'game coins', 'rexxar', 'voljin', 'alliance', 'horde'],
      policy_status = 'allowed',
      policy_reasons = '[]'::jsonb,
      policy_checked_at = now(),
      updated_at = now()
    WHERE id = v_product_id;
  END IF;

  FOR v_variant IN
    SELECT *
    FROM (
      VALUES
        ('WOW-ASC-REXXAR-ALLIANCE', 'Rexxar Alliance - price per 1k gold', 'Rexxar', 'Alliance', 4756::numeric, 0.30::numeric, 0.38::numeric, 0),
        ('WOW-ASC-REXXAR-HORDE', 'Rexxar Horde - price per 1k gold', 'Rexxar', 'Horde', 8878::numeric, 0.56::numeric, 0.70::numeric, 1),
        ('WOW-ASC-VOLJIN-ALLIANCE', 'Vol''jin Alliance - price per 1k gold', 'Vol''jin', 'Alliance', 555::numeric, 0.035::numeric, 0.044::numeric, 2),
        ('WOW-ASC-VOLJIN-HORDE', 'Vol''jin Horde - price per 1k gold', 'Vol''jin', 'Horde', 555::numeric, 0.035::numeric, 0.044::numeric, 3)
    ) AS desired(sku, name, server_name, faction_name, price_idr, rate_usd_per_1k, catalog_price_usd, sort_order)
  LOOP
    UPDATE public.product_variants
    SET
      product_id = v_product_id,
      seller_id = v_seller_id,
      name = v_variant.name,
      attributes = jsonb_build_object(
        'server', v_variant.server_name,
        'faction', v_variant.faction_name,
        'realm', 'Ascension.gg ' || v_variant.server_name,
        'unit', 'per 1k gold',
        'rate_usd_per_1k', v_variant.rate_usd_per_1k,
        'catalog_price_usd', v_variant.catalog_price_usd
      ),
      price = v_variant.price_idr,
      stock = 99999,
      status = 'active',
      sort_order = v_variant.sort_order,
      updated_at = now()
    WHERE seller_id = v_seller_id
      AND lower(sku) = lower(v_variant.sku)
      AND status <> 'archived';

    IF NOT FOUND THEN
      INSERT INTO public.product_variants (
        product_id,
        seller_id,
        sku,
        name,
        attributes,
        price,
        stock,
        status,
        sort_order,
        updated_at
      )
      VALUES (
        v_product_id,
        v_seller_id,
        v_variant.sku,
        v_variant.name,
        jsonb_build_object(
          'server', v_variant.server_name,
          'faction', v_variant.faction_name,
          'realm', 'Ascension.gg ' || v_variant.server_name,
          'unit', 'per 1k gold',
          'rate_usd_per_1k', v_variant.rate_usd_per_1k,
          'catalog_price_usd', v_variant.catalog_price_usd
        ),
        v_variant.price_idr,
        99999,
        'active',
        v_variant.sort_order,
        now()
      );
    END IF;
  END LOOP;

  PERFORM public.cp_sync_product_variant_summary(v_product_id);
END
$$;

COMMIT;

SELECT 'comeplayers_local_game_catalog_wow_ascension_ready' AS status;
