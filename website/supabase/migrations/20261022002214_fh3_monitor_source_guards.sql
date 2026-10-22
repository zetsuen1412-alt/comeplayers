-- Repair the older TAKE migration's newline-sensitive function rewrite.
-- START replies to TAKE, DONE replies to START, before any legacy order card.
do $migration$
declare src text; patched text;
begin
  src := pg_get_functiondef('public.cp_mobile_proof_begin(text,text,text,uuid)'::regprocedure);
  if position('FH3_SOURCE_REPLY_THREAD' in src) > 0 then return; end if;
  src := replace(src,E'\r\n',E'\n');
  -- On LF checkouts the old migration inserted its TAKE subquery successfully;
  -- on CRLF checkouts it did not. Normalize both shapes before repairing order.
  src := regexp_replace(src,
    '\(select tk\.telegram_message_id from public\.cp_mobile_order_take tk[[:space:]]+where tk\.order_ref=ref and tk\.status=''sent'' and tk\.chat_id=dest\.chat_id[[:space:]]+and p_action=''start'' limit 1\),[[:space:]]*',
    '');
  patched := regexp_replace(src,
    'coalesce\([[:space:]]*\(select chats\.message_id',
    'coalesce( /* FH3_SOURCE_REPLY_THREAD */
      (select tk.telegram_message_id from public.cp_mobile_order_take tk
        where p_action=''start'' and tk.order_ref=ref and tk.employee_code=code
          and tk.status=''sent'' and tk.chat_id=dest.chat_id limit 1),
      (select evidence.telegram_message_id from public.cp_mobile_order_proof evidence
        where p_action=''done'' and evidence.order_ref=ref and evidence.employee_code=code
          and evidence.action=''start'' and evidence.status=''sent'' and evidence.chat_id=dest.chat_id limit 1),
      (select chats.message_id');
  if patched = src then raise exception 'Unexpected mobile proof reply function'; end if;
  execute patched;
end
$migration$;
