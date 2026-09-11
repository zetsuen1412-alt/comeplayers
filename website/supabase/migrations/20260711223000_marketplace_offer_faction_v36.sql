BEGIN;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS offer_faction text;

CREATE INDEX IF NOT EXISTS products_marketplace_faction_idx
  ON public.products (game_category_id, offer_faction)
  WHERE status = 'active' AND offer_faction IS NOT NULL;

COMMENT ON COLUMN public.products.offer_faction IS
  'Optional game-side or faction discriminator used with server and region marketplace filters.';

COMMIT;
