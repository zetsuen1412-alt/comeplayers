BEGIN;
ALTER TABLE public.cp_loker_banners
  DROP CONSTRAINT IF EXISTS cp_loker_banners_body_check;
ALTER TABLE public.cp_loker_banners
  ADD CONSTRAINT cp_loker_banners_body_check CHECK (length(body) <= 6990508);
COMMIT;
