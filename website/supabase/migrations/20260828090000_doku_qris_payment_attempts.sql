begin;

alter table public.doku_payment_attempts
  drop constraint if exists doku_payment_attempts_payment_type_check;

alter table public.doku_payment_attempts
  add column if not exists qr_content text,
  add column if not exists qr_image_url text,
  add column if not exists terminal_id text;

alter table public.doku_payment_attempts
  add constraint doku_payment_attempts_payment_type_check
    check (payment_type in ('virtual_account', 'qris')),
  add constraint doku_payment_attempts_qr_content_check
    check (
      qr_content is null
      or char_length(qr_content) between 80 and 1024
    ),
  add constraint doku_payment_attempts_qr_image_url_check
    check (
      qr_image_url is null
      or qr_image_url ~ '^https://api(-sandbox)?[.]doku[.]com/doku-mcp-server/api/qr/generate([?].*)?$'
    );

comment on column public.doku_payment_attempts.qr_content is
  'Server-only EMV QRIS content returned by DOKU.';
comment on column public.doku_payment_attempts.qr_image_url is
  'Validated DOKU-hosted QR image URL for an active QRIS attempt.';
comment on column public.doku_payment_attempts.terminal_id is
  'DOKU QRIS terminal identifier returned by the provider.';

commit;
