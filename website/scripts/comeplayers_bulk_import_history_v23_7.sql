-- ComePlayers V23.7 - seller bulk catalog import history and idempotency.
-- Run after V23.6. The application continues to import listings when this table
-- is unavailable, but history/reporting/idempotency require this migration.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.seller_catalog_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  request_token uuid NOT NULL DEFAULT gen_random_uuid(),
  source_filename text NOT NULL DEFAULT 'bulk-listing-import',
  source_format text NOT NULL DEFAULT 'csv',
  source_sheet text,
  source_size_bytes bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'processing',
  total_rows integer NOT NULL DEFAULT 0,
  valid_rows integer NOT NULL DEFAULT 0,
  invalid_rows integer NOT NULL DEFAULT 0,
  created_rows integer NOT NULL DEFAULT 0,
  updated_rows integer NOT NULL DEFAULT 0,
  pending_review_rows integer NOT NULL DEFAULT 0,
  failed_rows integer NOT NULL DEFAULT 0,
  warning_count integer NOT NULL DEFAULT 0,
  result_rows jsonb NOT NULL DEFAULT '[]'::jsonb,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT seller_catalog_imports_seller_request_unique
    UNIQUE (seller_id, request_token),
  CONSTRAINT seller_catalog_imports_source_format_check
    CHECK (source_format IN ('csv', 'xlsx')),
  CONSTRAINT seller_catalog_imports_status_check
    CHECK (status IN ('processing', 'completed', 'partial', 'failed')),
  CONSTRAINT seller_catalog_imports_source_filename_length_check
    CHECK (char_length(source_filename) BETWEEN 1 AND 255),
  CONSTRAINT seller_catalog_imports_source_sheet_length_check
    CHECK (source_sheet IS NULL OR char_length(source_sheet) <= 120),
  CONSTRAINT seller_catalog_imports_source_size_check
    CHECK (source_size_bytes BETWEEN 0 AND 8388608),
  CONSTRAINT seller_catalog_imports_counts_check
    CHECK (
      total_rows >= 0
      AND valid_rows >= 0
      AND invalid_rows >= 0
      AND created_rows >= 0
      AND updated_rows >= 0
      AND pending_review_rows >= 0
      AND failed_rows >= 0
      AND warning_count >= 0
      AND valid_rows + invalid_rows <= total_rows
      AND created_rows + updated_rows + failed_rows <= total_rows
    ),
  CONSTRAINT seller_catalog_imports_result_rows_check
    CHECK (jsonb_typeof(result_rows) = 'array')
);

CREATE INDEX IF NOT EXISTS seller_catalog_imports_seller_started_idx
  ON public.seller_catalog_imports (seller_id, started_at DESC);

CREATE INDEX IF NOT EXISTS seller_catalog_imports_status_started_idx
  ON public.seller_catalog_imports (status, started_at DESC);

ALTER TABLE public.seller_catalog_imports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS seller_catalog_imports_select_own
  ON public.seller_catalog_imports;

CREATE POLICY seller_catalog_imports_select_own
  ON public.seller_catalog_imports
  FOR SELECT
  TO authenticated
  USING (auth.uid() = seller_id);

DROP POLICY IF EXISTS seller_catalog_imports_admin_select
  ON public.seller_catalog_imports;

CREATE POLICY seller_catalog_imports_admin_select
  ON public.seller_catalog_imports
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles
      WHERE profiles.id = auth.uid()
        AND lower(COALESCE(profiles.role, '')) = 'admin'
    )
  );

REVOKE ALL ON TABLE public.seller_catalog_imports FROM anon;
GRANT SELECT ON TABLE public.seller_catalog_imports TO authenticated;

COMMENT ON TABLE public.seller_catalog_imports IS
  'Seller-owned audit history for committed CSV/XLSX catalog imports. Writes are performed by authenticated server routes using the service role.';
COMMENT ON COLUMN public.seller_catalog_imports.request_token IS
  'Client-generated idempotency token. Unique per seller to prevent duplicate imports.';
COMMENT ON COLUMN public.seller_catalog_imports.result_rows IS
  'Row-level import result summary only; source spreadsheet contents are not retained.';

COMMIT;

SELECT 'comeplayers_bulk_import_history_v23_7_ready' AS status;
