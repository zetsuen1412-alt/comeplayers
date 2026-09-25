-- Additive follow-up to the already deployed 20260926030000 foundation.
-- The CLI-created filename is ordered after that future-dated baseline.
alter table public.cp_payroll_telegram_orders drop constraint cp_payroll_telegram_orders_state_check;
alter table public.cp_payroll_telegram_orders add constraint cp_payroll_telegram_orders_state_check
  check (state in ('waiting','assigned','in_progress','paused','problem','done_pending_admin','verified'));
alter table public.cp_payroll_telegram_orders add column callback_id bigint generated always as identity unique;
alter table public.cp_payroll_telegram_orders add column division text;
alter table public.cp_payroll_telegram_orders add column dispatch_status text not null default 'pending';
alter table public.cp_payroll_telegram_employees add column callback_id bigint generated always as identity unique;
alter table public.cp_payroll_telegram_evidence add column employee_code text;
alter table public.cp_payroll_telegram_evidence add column division text;
alter table public.cp_payroll_telegram_sessions add column closed_at timestamptz;
alter table public.cp_payroll_telegram_sessions drop constraint cp_payroll_telegram_sessions_telegram_user_id_chat_id_key;
create unique index cp_telegram_open_session on public.cp_payroll_telegram_sessions(telegram_user_id,chat_id) where closed_at is null;

create table public.cp_payroll_telegram_updates (
  update_id bigint primary key, received_at timestamptz not null default now(),
  processed_at timestamptz, result jsonb
);
create table public.cp_payroll_telegram_outbox (
  id bigint generated always as identity primary key,
  event_key text not null unique, order_ref text, chat_id bigint not null, payload jsonb not null,
  status text not null default 'pending' check(status in ('pending','sending','sent','uncertain')),
  message_id bigint, created_at timestamptz not null default now(), attempted_at timestamptz
);
create index cp_telegram_pending_outbox on public.cp_payroll_telegram_outbox(id) where status='pending';
alter table public.cp_payroll_telegram_updates enable row level security;
alter table public.cp_payroll_telegram_outbox enable row level security;
revoke all on public.cp_payroll_telegram_updates, public.cp_payroll_telegram_outbox from public, anon, authenticated;
grant select,insert,update,delete on public.cp_payroll_telegram_updates, public.cp_payroll_telegram_outbox to service_role;
grant usage,select on sequence public.cp_payroll_telegram_orders_callback_id_seq, public.cp_payroll_telegram_employees_callback_id_seq, public.cp_payroll_telegram_outbox_id_seq to service_role;

create function public.cp_telegram_terminal(p_order jsonb, p_workspace jsonb) returns boolean
language sql immutable set search_path='' as $$
  select coalesce(p_order->>'operationalStatus'='verified',false)
    or nullif(p_order->>'verifiedAt','') is not null
    or nullif(p_order->>'payrollClosedAt','') is not null
    or nullif(p_order->>'payrollPeriodId','') is not null
    or coalesce(p_order->>'financeStatus'='closed',false)
    or exists(select 1 from jsonb_array_elements(coalesce(p_workspace->'cp-ofs-demo-closing-v1','[]')) c,
      jsonb_array_elements_text(coalesce(c->'orderRefs','[]')) r where lower(r)=lower(p_order->>'externalReference'));
$$;

-- Called while holding the workspace lock. No external network request inside a transaction.
create function public.cp_telegram_prepare_order(p_order jsonb, p_workspace jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare o public.cp_payroll_telegram_orders; d record; ref text:=p_order->>'externalReference'; terminal boolean;
begin
  if ref is null then return; end if;
  terminal:=public.cp_telegram_terminal(p_order,p_workspace);
  select * into o from public.cp_payroll_telegram_orders where order_ref=ref for update;
  if terminal then
    if o.order_ref is not null and o.state<>'verified' then
      update public.cp_payroll_telegram_orders set state='verified',updated_at=now(),last_event_at=now() where order_ref=ref;
      update public.cp_payroll_telegram_sessions set closed_at=now() where order_ref=ref and closed_at is null;
      insert into public.cp_payroll_telegram_outbox(event_key,order_ref,chat_id,payload)
        select 'verified:'||ref||':'||chat_id,ref,chat_id,
          jsonb_build_object('text',E'✅ ORDER DIVERIFIKASI ADMIN\nOrder : '||ref||E'\n✅ SELESAI. Tidak ada aksi lain yang diperbolehkan.')
        from public.cp_payroll_telegram_order_chats where order_ref=ref on conflict do nothing;
    end if;
    return;
  end if;
  if nullif(p_order->>'sheetDeletedAt','') is not null or coalesce(p_order->>'orderType','') not in ('gold','boosting') then return; end if;
  insert into public.cp_payroll_telegram_orders(order_ref,order_type,target_quantity,division)
    values(ref,p_order->>'orderType',case when p_order->>'orderType'='gold' then greatest(coalesce((p_order->>'quantity')::numeric,0),0) else 1 end,p_order->>'team')
    on conflict(order_ref) do update set
      division=excluded.division,
      -- Never reclassify work in progress or reduce a quota below accepted contributions.
      order_type=case when cp_payroll_telegram_orders.state='waiting' then excluded.order_type else cp_payroll_telegram_orders.order_type end,
      target_quantity=greatest(excluded.target_quantity,cp_payroll_telegram_orders.delivered_quantity),updated_at=now()
    returning * into o;
  if o.state='verified' then return; end if;
  update public.cp_payroll_telegram_orders set dispatch_status=case
    when o.order_type='boosting' and coalesce(o.division,'') not in ('FH1','FH2','FH3','ADMIN','BANDAR') then 'waiting_division' else 'pending' end where order_ref=ref;
  for d in select * from public.cp_payroll_telegram_divisions where active and
    ((o.order_type='gold' and division in ('FH1','FH2','FH3')) or (o.order_type='boosting' and division=o.division)) loop
    insert into public.cp_payroll_telegram_order_chats(order_ref,division,chat_id) values(ref,d.division,d.chat_id) on conflict do nothing;
    -- Existing successful foundation dispatches must not be resent by this migration.
    if exists(select 1 from public.cp_payroll_telegram_order_chats where order_ref=ref and division=d.division and message_id is not null) then continue; end if;
    insert into public.cp_payroll_telegram_outbox(event_key,order_ref,chat_id,payload)
      values('dispatch:'||ref||':'||d.division,ref,d.chat_id,jsonb_build_object(
        'text',case when o.order_type='gold' then '🪙 ORDER GOLD — KUOTA GLOBAL' else '🎮 ORDER BOOSTING' end
          ||E'\nOrder : '||ref||E'\nNama : '||coalesce(p_order->>'orderName',p_order->>'service','—')
          ||E'\nGame : '||coalesce(p_order->>'gameName',p_order->>'game','—')||E'\nDivisi : '||d.division
          ||E'\nTarget : '||o.target_quantity||E'\nTASK : '||coalesce(p_order->>'task','—'),
        'keyboard',o.order_type,'orderId',o.callback_id)) on conflict do nothing;
  end loop;
end;
$$;

create function public.cp_telegram_workspace_changed() returns trigger
language plpgsql security definer set search_path='' as $$
declare item jsonb; previous jsonb; old_orders jsonb;
begin
  select coalesce(jsonb_object_agg(value->>'id',value),'{}') into old_orders
    from jsonb_array_elements(coalesce(old.payload->'cp-ofs-demo-user-orders-v3','[]')) where value->>'id' is not null;
  for item in select value from jsonb_array_elements(coalesce(new.payload->'cp-ofs-demo-user-orders-v3','[]')) loop
    previous:=old_orders->(item->>'id');
    if previous is null or (public.cp_telegram_terminal(item,new.payload) and not public.cp_telegram_terminal(previous,old.payload))
      or previous->>'orderType' is distinct from item->>'orderType'
      or previous->>'team' is distinct from item->>'team'
      or previous->>'quantity' is distinct from item->>'quantity' then
      perform public.cp_telegram_prepare_order(item,new.payload);
    end if;
  end loop;
  return new;
end;
$$;
create trigger cp_telegram_workspace_changed after update of payload on public.cp_payroll_workspace
  for each row execute function public.cp_telegram_workspace_changed();

-- A pre-existing verified order is terminal immediately, without backfilling old dispatches.
update public.cp_payroll_telegram_orders t set division=o->>'team'
from public.cp_payroll_workspace w, lateral jsonb_array_elements(coalesce(w.payload->'cp-ofs-demo-user-orders-v3','[]')) o
where w.id=1 and o->>'externalReference'=t.order_ref;
update public.cp_payroll_telegram_orders t set state='verified',updated_at=now()
from public.cp_payroll_workspace w, lateral jsonb_array_elements(coalesce(w.payload->'cp-ofs-demo-user-orders-v3','[]')) o
where w.id=1 and o->>'externalReference'=t.order_ref and public.cp_telegram_terminal(o,w.payload);

create function public.cp_telegram_dispatch(p_order_ref text) returns void
language plpgsql security definer set search_path='' as $$
declare w jsonb; o jsonb;
begin
  select payload into w from public.cp_payroll_workspace where id=1 for update;
  select value into o from jsonb_array_elements(coalesce(w->'cp-ofs-demo-user-orders-v3','[]')) where lower(value->>'externalReference')=lower(p_order_ref);
  if o is not null then perform public.cp_telegram_prepare_order(o,w); end if;
end;
$$;

-- Claim exactly once before contacting Telegram. Ambiguous send outcomes are never retried blindly.
create function public.cp_telegram_claim_outbox() returns setof public.cp_payroll_telegram_outbox
language sql security definer set search_path='' as $$
  update public.cp_payroll_telegram_outbox set status='sending',attempted_at=now()
  where id=(select id from public.cp_payroll_telegram_outbox where status='pending' order by id for update skip locked limit 1)
  returning *;
$$;

-- The event and all its business effects/outbox rows commit together. The workspace lock is
-- always acquired first, matching the admin-save trigger and preventing verification races.
create function public.cp_telegram_process_update(p_update_id bigint,p_event jsonb,p_is_admin boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare
  w jsonb; item jsonb; emp jsonb; e public.cp_payroll_telegram_employees; chosen public.cp_payroll_telegram_employees;
  o public.cp_payroll_telegram_orders; a public.cp_payroll_telegram_assignments; s public.cp_payroll_telegram_sessions;
  uid bigint:=(p_event->>'userId')::bigint; chat bigint:=(p_event->>'chatId')::bigint;
  action text:=p_event->>'action'; ref text:=p_event->>'ref'; result jsonb; options jsonb;
  division text; managed boolean; broadcast boolean:=false; quantity numeric; accepted numeric; contribution uuid;
  photos integer; videos integer; page integer:=greatest(coalesce((p_event->>'page')::integer,0),0);
begin
  if p_update_id is null or uid is null or uid<=0 or chat is null then raise exception 'Invalid event' using errcode='22023'; end if;
  select payload into w from public.cp_payroll_workspace where id=1 for update;
  if exists(select 1 from public.cp_payroll_telegram_updates where update_id=p_update_id) then return jsonb_build_object('duplicate',true); end if;
  insert into public.cp_payroll_telegram_updates(update_id) values(p_update_id);
  begin
    select * into e from public.cp_payroll_telegram_employees where telegram_user_id=uid and active;
    select d.division into division from public.cp_payroll_telegram_divisions d where chat_id=chat and active;
    if action='myid' then
      result:=jsonb_build_object('text','Telegram User ID: '||uid);
    elsif action in ('help','startcommand') then
      result:=jsonb_build_object('text',E'/myid — ID akun\n/link KODE_KARYAWAN — hubungkan akun di grup divisi\nAdmin: /bind FH1, /leader KODE, /dispatch ORDER\nAdmin/leader: /assign ORDER KODE\nGunakan tombol order untuk START, PAUSE, RESUME, DONE atau KIRIM GOLD.');
    elsif action='bind' then
      if not p_is_admin or p_event->>'chatType' not in ('group','supergroup') then raise exception 'Hanya admin Telegram dapat menghubungkan grup.'; end if;
      if coalesce(p_event->>'division','') not in ('FH1','FH2','FH3','ADMIN','BANDAR') then raise exception 'Divisi tidak valid.'; end if;
      insert into public.cp_payroll_telegram_divisions(division,chat_id,chat_title,chat_username,bound_by_telegram_user_id)
        values(p_event->>'division',chat,p_event->>'chatTitle',p_event->>'chatUsername',uid)
        on conflict on constraint cp_payroll_telegram_divisions_pkey do update set chat_id=excluded.chat_id,chat_title=excluded.chat_title,chat_username=excluded.chat_username,active=true,updated_at=now();
      result:=jsonb_build_object('text','✅ Grup dihubungkan ke '||(p_event->>'division'));
    elsif action='link' then
      select value into emp from jsonb_array_elements(coalesce(w->'cp-ofs-demo-employees-v2','[]')) where upper(value->>'code')=upper(p_event->>'employeeCode');
      if emp is null or coalesce(emp->>'workforceStatus','SHIFT') not in ('NEW','SHIFT','FULL') or division is distinct from emp->>'team' then raise exception 'Karyawan aktif tidak ditemukan di divisi grup ini.'; end if;
      if exists(select 1 from public.cp_payroll_telegram_employees where employee_code=emp->>'code' and telegram_user_id<>uid)
        or exists(select 1 from public.cp_payroll_telegram_employees where telegram_user_id=uid and employee_code<>emp->>'code') then raise exception 'Akun/kode sudah terhubung. Hubungi admin; tautan lama tidak ditimpa.'; end if;
      insert into public.cp_payroll_telegram_employees(employee_code,telegram_user_id,telegram_username,telegram_name,division)
        values(emp->>'code',uid,p_event->>'username',p_event->>'name',division) on conflict do nothing;
      result:=jsonb_build_object('text','✅ Akun terhubung: '||(emp->>'name'));
    elsif action='leader' then
      if not p_is_admin then raise exception 'Hanya admin Telegram dapat menentukan leader.'; end if;
      update public.cp_payroll_telegram_employees set role='leader',updated_at=now() where upper(employee_code)=upper(p_event->>'employeeCode') and active;
      if not found then raise exception 'Karyawan belum terhubung.'; end if;
      result:=jsonb_build_object('text','✅ Leader diperbarui.');
    elsif action='dispatch' then
      if not p_is_admin then raise exception 'Hanya admin Telegram dapat dispatch order.'; end if;
      select value into item from jsonb_array_elements(coalesce(w->'cp-ofs-demo-user-orders-v3','[]')) where lower(value->>'externalReference')=lower(ref);
      if item is null then raise exception 'Order tidak ditemukan.'; end if;
      perform public.cp_telegram_prepare_order(item,w);
      result:=jsonb_build_object('text','Order diperiksa. Jenis/divisi yang belum jelas menunggu perbaikan; order lama yang sudah terkirim tidak digandakan.');
    else
      -- Media/amount and upload buttons bind to a user AND a chat AND a fresh session ID.
      if action in ('media','amount','finish','more','cancel') then
        select * into s from public.cp_payroll_telegram_sessions where telegram_user_id=uid and chat_id=chat and closed_at is null and expires_at>now() for update;
        if s.id is null then
          if action in ('media','amount') then
            update public.cp_payroll_telegram_updates set processed_at=now(),result='{"ignored":true}' where update_id=p_update_id;
            return '{"ignored":true}';
          end if;
          raise exception 'Sesi bukti sudah berakhir.';
        end if;
        if action in ('finish','more','cancel') and coalesce(p_event->>'sessionId','')<>s.id::text then raise exception 'Tombol berasal dari sesi lama.'; end if;
        ref:=s.order_ref;
      end if;
      select * into o from public.cp_payroll_telegram_orders where
        (p_event->>'orderId' is not null and callback_id::text=p_event->>'orderId') or (ref is not null and lower(order_ref)=lower(ref)) for update;
      if o.order_ref is null then raise exception 'Order Telegram tidak ditemukan.'; end if;
      ref:=o.order_ref;
      select value into item from jsonb_array_elements(coalesce(w->'cp-ofs-demo-user-orders-v3','[]')) where lower(value->>'externalReference')=lower(ref);
      if o.state='verified' or public.cp_telegram_terminal(item,w) then raise exception 'Order sudah diverifikasi admin. Semua aksi ditutup.'; end if;
      if item is null or nullif(item->>'sheetDeletedAt','') is not null then raise exception 'Order tidak aktif di Payroll.'; end if;
      if item->>'orderType' is distinct from o.order_type then raise exception 'Jenis order berubah. Admin perlu memeriksa workflow.'; end if;
      if not exists(select 1 from public.cp_payroll_telegram_order_chats where order_ref=ref and chat_id=chat)
        or division is null then raise exception 'Gunakan grup divisi yang menerima order ini.'; end if;
      if o.order_type='boosting' and (division is distinct from item->>'team' or o.division is distinct from item->>'team') then raise exception 'Order bukan milik divisi grup ini.'; end if;
      select value into emp from jsonb_array_elements(coalesce(w->'cp-ofs-demo-employees-v2','[]')) where value->>'code'=e.employee_code;
      managed:=p_is_admin or (e.role='leader' and e.division=item->>'team' and emp->>'team'=e.division and coalesce(emp->>'workforceStatus','SHIFT') in ('NEW','SHIFT','FULL'));
      if action in ('picker','assign','pick') then
        if o.order_type<>'boosting' or not coalesce(managed,false) then raise exception 'Hanya admin/leader divisi order dapat memilih karyawan.'; end if;
        if o.state='done_pending_admin' then raise exception 'Order menunggu verifikasi admin.'; end if;
        if action='picker' then
          select coalesce(jsonb_agg(v),'[]') into options from (
            select l.callback_id as id,j->>'name' as name from public.cp_payroll_telegram_employees l
            join jsonb_array_elements(coalesce(w->'cp-ofs-demo-employees-v2','[]')) j on j->>'code'=l.employee_code
            where l.active and l.division=item->>'team' and j->>'team'=l.division and coalesce(j->>'workforceStatus','SHIFT') in ('NEW','SHIFT','FULL')
            order by j->>'name',l.employee_code limit 9 offset page*8) v;
          result:=jsonb_build_object('text',ref||' — PILIH KARYAWAN (aktif dan terhubung)','keyboard','picker','orderId',o.callback_id,'page',page,'employees',options);
        else
          select l.* into chosen from public.cp_payroll_telegram_employees l
            join jsonb_array_elements(coalesce(w->'cp-ofs-demo-employees-v2','[]')) j on j->>'code'=l.employee_code
            where l.active and l.division=item->>'team' and j->>'team'=l.division and coalesce(j->>'workforceStatus','SHIFT') in ('NEW','SHIFT','FULL')
              and ((action='pick' and l.callback_id::text=p_event->>'employeeId') or (action='assign' and upper(l.employee_code)=upper(p_event->>'employeeCode')));
          if chosen.employee_code is null then raise exception 'Karyawan aktif/terhubung tidak ditemukan di divisi order.'; end if;
          update public.cp_payroll_telegram_assignments set status='replaced',replaced_at=now(),updated_at=now() where order_ref=ref and status in ('assigned','in_progress','paused','problem');
          update public.cp_payroll_telegram_sessions set closed_at=now() where order_ref=ref and closed_at is null;
          insert into public.cp_payroll_telegram_assignments(order_ref,employee_code,division,telegram_user_id) values(ref,chosen.employee_code,chosen.division,chosen.telegram_user_id);
          update public.cp_payroll_telegram_orders set state='assigned',last_event_at=now(),updated_at=now() where order_ref=ref;
          result:=jsonb_build_object('text',E'✅ KARYAWAN DITENTUKAN\nOrder : '||ref||E'\nKaryawan : '||chosen.employee_code||E'\nDivisi : '||chosen.division,'keyboard','boosting','orderId',o.callback_id);
          broadcast:=true;
        end if;
      else
        if e.employee_code is null or emp is null or coalesce(emp->>'workforceStatus','SHIFT') not in ('NEW','SHIFT','FULL')
          or e.division is distinct from division or emp->>'team' is distinct from division then raise exception 'Akun harus terhubung ke karyawan aktif di divisi grup ini.'; end if;
        select * into a from public.cp_payroll_telegram_assignments where order_ref=ref and employee_code=e.employee_code and telegram_user_id=uid and status in ('assigned','in_progress','paused','problem') for update;
        if o.order_type='boosting' and a.id is null then raise exception 'Anda bukan karyawan yang ditugaskan pada order ini.'; end if;
        if o.state='done_pending_admin' then raise exception 'Order menunggu verifikasi admin; pengiriman ditutup.'; end if;
        if s.id is not null and o.order_type='boosting' and s.assignment_id is distinct from a.id then raise exception 'Assignment sesi sudah diganti.'; end if;
        if action in ('start','done','gold') then
          if (action='start' and (o.order_type<>'boosting' or a.status<>'assigned'))
            or (action='done' and (o.order_type<>'boosting' or a.status not in ('in_progress','paused')))
            or (action='gold' and (o.order_type<>'gold' or o.delivered_quantity>=o.target_quantity or division not in ('FH1','FH2','FH3'))) then raise exception 'Aksi tidak sesuai status order.'; end if;
          update public.cp_payroll_telegram_sessions set closed_at=now() where telegram_user_id=uid and chat_id=chat and closed_at is null;
          insert into public.cp_payroll_telegram_sessions(telegram_user_id,chat_id,order_ref,assignment_id,kind,stage)
            values(uid,chat,ref,a.id,action,case when action='gold' then 'amount' else 'evidence' end) returning * into s;
          result:=jsonb_build_object('text',case when action='gold' then 'Masukkan jumlah Gold (unit sama dengan target order).' else '📸🎥 BUKTI '||upper(action)||' WAJIB — '||ref||E'\nKirim foto/screenshot/video. DONE baru selesai setelah SELESAI UPLOAD.' end,'keyboard','session','sessionId',s.id);
        elsif action='amount' then
          quantity:=(p_event->>'quantity')::numeric;
          if s.kind<>'gold' or s.stage<>'amount' or quantity is null or quantity<=0 or quantity>1e15 then raise exception 'Masukkan jumlah Gold positif yang valid.'; end if;
          update public.cp_payroll_telegram_sessions set requested_quantity=quantity,stage='evidence',updated_at=now() where id=s.id;
          result:=jsonb_build_object('text','📸🎥 Kirim minimal satu bukti Gold, lalu tekan SELESAI UPLOAD.','keyboard','session','sessionId',s.id);
        elsif action='media' then
          if s.stage<>'evidence' or p_event->>'mediaType' not in ('photo','video') then raise exception 'Masukkan jumlah dahulu sebelum bukti.'; end if;
          insert into public.cp_payroll_telegram_evidence(order_ref,assignment_id,session_id,evidence_type,media_type,telegram_chat_id,telegram_chat_username,telegram_message_id,telegram_file_id,telegram_file_unique_id,telegram_user_id,employee_code,division)
            values(ref,s.assignment_id,s.id,s.kind,p_event->>'mediaType',chat,p_event->>'chatUsername',(p_event->>'messageId')::bigint,p_event->>'fileId',p_event->>'fileUniqueId',uid,e.employee_code,e.division) on conflict do nothing;
          select count(*) filter(where media_type='photo'),count(*) filter(where media_type='video') into photos,videos from public.cp_payroll_telegram_evidence where session_id=s.id;
          update public.cp_payroll_telegram_sessions set evidence_count=photos+videos,updated_at=now() where id=s.id;
          if s.kind='start' then
            if a.status<>'assigned' or photos+videos<1 then raise exception 'START membutuhkan bukti dan assignment aktif.'; end if;
            update public.cp_payroll_telegram_assignments set status='in_progress',started_at=now(),updated_at=now() where id=a.id;
            update public.cp_payroll_telegram_orders set state='in_progress',updated_at=now(),last_event_at=now() where order_ref=ref;
            update public.cp_payroll_telegram_sessions set closed_at=now() where id=s.id;
            result:=jsonb_build_object('text','🟢 START — '||ref||' — '||e.employee_code,'keyboard','boosting','orderId',o.callback_id); broadcast:=true;
          else
            result:=jsonb_build_object('text',E'Bukti terkirim — '||ref||E'\n📷 Foto: '||photos||E'\n🎥 Video: '||videos,'keyboard','session','sessionId',s.id);
          end if;
        elsif action='finish' then
          if s.kind not in ('done','gold') or s.stage<>'evidence' or not exists(select 1 from public.cp_payroll_telegram_evidence where session_id=s.id) then raise exception 'Minimal satu foto/video wajib sebelum selesai.'; end if;
          if s.kind='gold' then
            if o.order_type<>'gold' or s.requested_quantity is null or s.requested_quantity<=0 then raise exception 'Jumlah Gold tidak valid.'; end if;
            accepted:=least(s.requested_quantity,greatest(o.target_quantity-o.delivered_quantity,0));
            if accepted<=0 then raise exception 'Kuota Gold telah penuh.'; end if;
            insert into public.cp_payroll_telegram_gold_contributions(order_ref,employee_code,division,telegram_user_id,requested_quantity,accepted_quantity)
              values(ref,e.employee_code,e.division,uid,s.requested_quantity,accepted) returning id into contribution;
            update public.cp_payroll_telegram_evidence set contribution_id=contribution where session_id=s.id;
            update public.cp_payroll_telegram_orders set delivered_quantity=delivered_quantity+accepted,
              state=case when delivered_quantity+accepted>=target_quantity then 'done_pending_admin' else 'in_progress' end,updated_at=now(),last_event_at=now() where order_ref=ref returning * into o;
            result:=jsonb_build_object('text',case when o.delivered_quantity>=o.target_quantity then '🟡 GOLD ORDER TERPENUHI' else '✅ SETORAN GOLD DITERIMA' end||E'\nOrder : '||ref||E'\nDiterima : '||accepted||' dari '||s.requested_quantity||E'\nTerkirim : '||o.delivered_quantity||' / '||o.target_quantity||E'\nSisa : '||(o.target_quantity-o.delivered_quantity)||case when o.delivered_quantity>=o.target_quantity then E'\n⛔ Pengiriman Gold telah ditutup.' else '' end,
              'accepted',accepted,'delivered',o.delivered_quantity,'remaining',o.target_quantity-o.delivered_quantity,'state',o.state);
          else
            if a.status not in ('in_progress','paused') then raise exception 'DONE hanya untuk pekerjaan berlangsung atau dijeda.'; end if;
            update public.cp_payroll_telegram_assignments set status='done',done_at=now(),updated_at=now() where id=a.id;
            update public.cp_payroll_telegram_orders set state='done_pending_admin',updated_at=now(),last_event_at=now() where order_ref=ref;
            result:=jsonb_build_object('text','🟡 DONE — '||ref||E'\nMenunggu verifikasi admin.','state','done_pending_admin');
          end if;
          update public.cp_payroll_telegram_sessions set closed_at=now() where id=s.id; broadcast:=true;
        elsif action='cancel' then
          update public.cp_payroll_telegram_sessions set closed_at=now() where id=s.id;
          result:=jsonb_build_object('text','Sesi dibatalkan. Status order tidak diubah; bukti yang sudah dikirim tetap tersimpan.');
        elsif action='more' then
          result:=jsonb_build_object('text','Kirim foto/video tambahan di grup ini.','keyboard','session','sessionId',s.id);
        elsif action in ('pause','resume','problem') then
          if action='pause' and (o.order_type<>'boosting' or a.status<>'in_progress') then raise exception 'PAUSE hanya saat pekerjaan berlangsung.'; end if;
          if action='resume' and (o.order_type<>'boosting' or a.status<>'paused') then raise exception 'RESUME hanya saat dijeda.'; end if;
          update public.cp_payroll_telegram_assignments set status=case action when 'pause' then 'paused' when 'resume' then 'in_progress' else 'problem' end,paused_at=case when action='pause' then now() else paused_at end,updated_at=now() where id=a.id;
          update public.cp_payroll_telegram_orders set state=case action when 'pause' then 'paused' when 'resume' then 'in_progress' else 'problem' end,updated_at=now(),last_event_at=now() where order_ref=ref;
          result:=jsonb_build_object('text',upper(action)||' — '||ref,'keyboard',o.order_type,'orderId',o.callback_id); broadcast:=true;
        else raise exception 'Aksi tidak dikenal.';
        end if;
      end if;
    end if;
  exception when raise_exception then
    -- Expected business rejection rolls back only this action, and is itself durable.
    result:=jsonb_build_object('text',SQLERRM,'rejected',true); broadcast:=false;
  end;
  if broadcast then
    insert into public.cp_payroll_telegram_outbox(event_key,order_ref,chat_id,payload)
      select 'update:'||p_update_id||':'||chat_id,ref,chat_id,result from public.cp_payroll_telegram_order_chats where order_ref=ref on conflict do nothing;
  else
    insert into public.cp_payroll_telegram_outbox(event_key,order_ref,chat_id,payload) values('update:'||p_update_id,ref,chat,result) on conflict do nothing;
  end if;
  update public.cp_payroll_telegram_updates set processed_at=now(),result=result where update_id=p_update_id;
  return result;
end;
$$;

-- Retire the insecure evidence-free entry point; preserve its signature for a clear error
-- during rolling deployment. Gold now commits inside cp_telegram_process_update.
create or replace function public.cp_payroll_telegram_accept_gold(p_order_ref text,p_employee_code text,p_division text,p_telegram_user_id bigint,p_requested_quantity numeric)
returns jsonb language plpgsql security definer set search_path='' as $$
begin raise exception 'Perbarui webhook: setoran Gold wajib melalui sesi bukti atomik.'; end;
$$;

revoke all on function public.cp_telegram_terminal(jsonb,jsonb),public.cp_telegram_prepare_order(jsonb,jsonb),public.cp_telegram_workspace_changed(),public.cp_telegram_dispatch(text),public.cp_telegram_claim_outbox(),public.cp_telegram_process_update(bigint,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.cp_telegram_terminal(jsonb,jsonb),public.cp_telegram_prepare_order(jsonb,jsonb),public.cp_telegram_workspace_changed(),public.cp_telegram_dispatch(text),public.cp_telegram_claim_outbox(),public.cp_telegram_process_update(bigint,jsonb,boolean) to service_role;
