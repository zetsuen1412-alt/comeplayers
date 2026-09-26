-- Item orders use the division-scoped assignment and evidence workflow.
-- No backfill dispatch, stock mutation, salary payment or automatic verification.

create or replace function public.cp_telegram_save_worker(p_ref text,p_employee jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare w jsonb; items jsonb;
begin
  select payload into w from public.cp_payroll_workspace where id=1 for update;
  select jsonb_agg(case when j->>'externalReference'=p_ref then j || jsonb_build_object(
    'employeeCode',p_employee->>'code','employeeName',p_employee->>'name',
    'workerAssignments',jsonb_build_array(jsonb_build_object('id','telegram:'||p_ref||':'||(p_employee->>'code'),
      'employeeCode',p_employee->>'code','employeeName',p_employee->>'name','team',p_employee->>'team',
      'process',coalesce(j->>'process',case when j->>'orderType'='item' then 'MAIL' else 'JOKI' end),'quantity',coalesce((j->>'quantity')::numeric,1))),
    'operationalStatus','assigned') else j end order by n) into items
    from jsonb_array_elements(w->'cp-ofs-demo-user-orders-v3') with ordinality x(j,n);
  update public.cp_payroll_workspace set payload=jsonb_set(w,'{cp-ofs-demo-user-orders-v3}',items),revision=revision+1,updated_at=clock_timestamp() where id=1;
end;
$$;

create or replace function public.cp_telegram_prepare_order(p_order jsonb, p_workspace jsonb) returns void
language plpgsql security definer set search_path='' as $$
declare o public.cp_payroll_telegram_orders; d record; ref text:=p_order->>'externalReference'; terminal boolean; requested jsonb; chosen public.cp_payroll_telegram_employees;
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
  if nullif(p_order->>'sheetDeletedAt','') is not null or coalesce(p_order->>'orderType','') not in ('gold','boosting','item') then return; end if;
  insert into public.cp_payroll_telegram_orders(order_ref,order_type,target_quantity,division)
    values(ref,p_order->>'orderType',case when p_order->>'orderType' in ('gold','item') then greatest(coalesce((p_order->>'quantity')::numeric,0),0) else 1 end,p_order->>'team')
    on conflict(order_ref) do update set
      division=excluded.division,
      -- Never reclassify work in progress or reduce a quota below accepted contributions.
      order_type=case when cp_payroll_telegram_orders.state='waiting' then excluded.order_type else cp_payroll_telegram_orders.order_type end,
      target_quantity=greatest(excluded.target_quantity,cp_payroll_telegram_orders.delivered_quantity),updated_at=now()
    returning * into o;
  if o.state='verified' then return; end if;
  perform public.cp_telegram_refresh_roster(p_workspace);
  -- Honor one explicitly requested Boosting/Item worker without requiring that worker's Telegram.
  if o.order_type in ('boosting','item') and o.state='waiting' and p_order->>'assignmentMode'='direct'
    and jsonb_array_length(coalesce(p_order->'workerAssignments','[]'))=1 then
    requested:=p_order->'workerAssignments'->0;
    select * into chosen from public.cp_payroll_telegram_employees
      where employee_code=requested->>'employeeCode' and division=o.division and active;
    if chosen.employee_code is not null then
      insert into public.cp_payroll_telegram_assignments(order_ref,employee_code,division,telegram_user_id)
        values(ref,chosen.employee_code,chosen.division,chosen.telegram_user_id);
      update public.cp_payroll_telegram_orders set state='assigned' where order_ref=ref returning * into o;
    end if;
  end if;
  update public.cp_payroll_telegram_orders set dispatch_status=case
    when (o.order_type in ('boosting','item') or p_order->>'assignmentMode' is not null) and coalesce(o.division,'') not in ('FH1','FH2','FH3','ADMIN','BANDAR') then 'waiting_division' else 'pending' end where order_ref=ref;
  for d in select * from public.cp_payroll_telegram_divisions where active and (o.order_type<>'gold' or division in ('FH1','FH2','FH3')) and
    ((o.order_type='gold' and p_order->>'assignmentMode' is null and division in ('FH1','FH2','FH3')) or (division=o.division)) loop
    insert into public.cp_payroll_telegram_order_chats(order_ref,division,chat_id) values(ref,d.division,d.chat_id)
      on conflict(order_ref,division) do update set chat_id=excluded.chat_id,message_id=null
      where cp_payroll_telegram_order_chats.chat_id<>excluded.chat_id;
    -- Existing successful foundation dispatches must not be resent by this migration.
    if exists(select 1 from public.cp_payroll_telegram_order_chats where order_ref=ref and division=d.division and message_id is not null) then continue; end if;
    insert into public.cp_payroll_telegram_outbox(event_key,order_ref,chat_id,payload)
        values('dispatch:'||ref||':'||d.chat_id,ref,d.chat_id,jsonb_build_object(
        'text',case when o.order_type='gold' then '🪙 ORDER GOLD — KUOTA GLOBAL' when o.order_type='item' then '📦 ORDER ITEM' else '🎮 ORDER BOOSTING' end
          ||E'\nOrder : '||ref||E'\nNama : '||coalesce(p_order->>'orderName',p_order->>'service','—')
          ||E'\nGame : '||coalesce(p_order->>'gameName',p_order->>'game','—')||E'\nDivisi : '||d.division
          ||E'\nKaryawan : '||coalesce(nullif((select string_agg(a->>'employeeName',', ') from jsonb_array_elements(coalesce(p_order->'workerAssignments','[]')) a),''),'Ditentukan leader')
          ||E'\nTarget : '||o.target_quantity||E'\nTASK : '||coalesce(p_order->>'task','—'),
        'keyboard',o.order_type,'orderId',o.callback_id)) on conflict do nothing;
  end loop;
end;
$$;

create or replace function public.cp_telegram_process_update(p_update_id bigint,p_event jsonb,p_is_admin boolean default false) returns jsonb
language plpgsql security definer set search_path='' as $$
#variable_conflict use_variable
declare
  w jsonb; item jsonb; emp jsonb; e public.cp_payroll_telegram_employees; chosen public.cp_payroll_telegram_employees;
  o public.cp_payroll_telegram_orders; a public.cp_payroll_telegram_assignments; s public.cp_payroll_telegram_sessions;
  uid bigint:=(p_event->>'userId')::bigint; chat bigint:=(p_event->>'chatId')::bigint;
  action text:=p_event->>'action'; ref text:=p_event->>'ref'; result jsonb; options jsonb;
  division text; managed boolean; leader_managed boolean; broadcast boolean:=false; quantity numeric; accepted numeric; contribution uuid;
  photos integer; videos integer; page integer:=greatest(coalesce((p_event->>'page')::integer,0),0);
begin
  if p_update_id is null or uid is null or uid<=0 or chat is null then raise exception 'Invalid event' using errcode='22023'; end if;
  select payload into w from public.cp_payroll_workspace where id=1 for update;
  if exists(select 1 from public.cp_payroll_telegram_updates where update_id=p_update_id) then return jsonb_build_object('duplicate',true); end if;
  insert into public.cp_payroll_telegram_updates(update_id) values(p_update_id);
  begin
    perform public.cp_telegram_refresh_roster(w);
    select * into e from public.cp_payroll_telegram_employees where telegram_user_id=uid and active;
    select d.division into division from public.cp_payroll_telegram_divisions d where chat_id=chat and active order by d.division limit 1;
    if action='myid' then
      result:=jsonb_build_object('text','Telegram User ID: '||uid);
    elsif action in ('help','startcommand') then
      result:=jsonb_build_object('text',E'Admin → Leader → Karyawan\nCukup akun leader yang terhubung. Admin mendaftarkan ID leader dan divisinya di website Payroll → Telegram Booster.\n/myid — lihat ID untuk didaftarkan admin.\nLeader memilih karyawan dari tombol order, lalu mengirim status dan bukti atas nama karyawan. Karyawan tidak perlu /link.\n/assign KODE_ORDER KODE_KARYAWAN — pilih karyawan Boosting/Item.\nAdmin: /dispatch KODE_ORDER — kirim order lama.');
    elsif action='bind' then
      if not p_is_admin then raise exception 'Hanya admin Telegram dapat menghubungkan grup.'; end if;
      if p_event->>'chatType' not in ('group','supergroup') then raise exception 'Kirim /bind FH3 di grup. Untuk chat pribadi leader, gunakan pengaturan Telegram di website.'; end if;
      if coalesce(p_event->>'division','') not in ('FH1','FH2','FH3','ADMIN','BANDAR') then raise exception 'Divisi tidak valid.'; end if;
      insert into public.cp_payroll_telegram_divisions(division,chat_id,chat_title,chat_username,bound_by_telegram_user_id)
        values(p_event->>'division',chat,p_event->>'chatTitle',p_event->>'chatUsername',uid)
        on conflict on constraint cp_payroll_telegram_divisions_pkey do update set chat_id=excluded.chat_id,chat_title=excluded.chat_title,chat_username=excluded.chat_username,active=true,updated_at=now();
      result:=jsonb_build_object('text','✅ Grup dihubungkan ke '||(p_event->>'division'));
    elsif action='link' then
      if nullif(p_event->>'employeeCode','') is null then raise exception 'Gunakan /link KODE_KARYAWAN. Pada alur leader, karyawan tidak perlu /link.'; end if;
      select value into emp from jsonb_array_elements(coalesce(w->'cp-ofs-demo-employees-v2','[]')) where upper(value->>'code')=upper(p_event->>'employeeCode');
      if emp is null or coalesce(emp->>'workforceStatus','SHIFT') not in ('NEW','SHIFT','FULL') or division is distinct from emp->>'team' then raise exception 'Karyawan aktif tidak ditemukan di divisi grup ini.'; end if;
      if exists(select 1 from public.cp_payroll_telegram_employees where employee_code=emp->>'code' and telegram_user_id<>uid)
        or exists(select 1 from public.cp_payroll_telegram_employees where telegram_user_id=uid and employee_code<>emp->>'code') then raise exception 'Akun/kode sudah terhubung. Hubungi admin; tautan lama tidak ditimpa.'; end if;
      insert into public.cp_payroll_telegram_employees(employee_code,telegram_user_id,telegram_username,telegram_name,division)
        values(emp->>'code',uid,p_event->>'username',p_event->>'name',division) on conflict(employee_code) do update set telegram_user_id=excluded.telegram_user_id,telegram_username=excluded.telegram_username,telegram_name=excluded.telegram_name;
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
      if action='assign' and (nullif(ref,'') is null or nullif(p_event->>'employeeCode','') is null) then raise exception 'Gunakan /assign KODE_ORDER KODE_KARYAWAN atau tombol PILIH KARYAWAN.'; end if;
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
      -- Resolve the division from the order/session, never from an arbitrary shared chat row.
      -- Legacy Gold can serve several divisions sharing one leader chat.
      if action='pickgold' and o.order_type='gold' and item->>'assignmentMode' is null then
        select l.division into s.division from public.cp_payroll_telegram_employees l where l.callback_id::text=p_event->>'employeeId' and l.active;
      end if;
      select d.division into division from public.cp_payroll_telegram_divisions d
        join public.cp_payroll_telegram_order_chats c on c.division=d.division and c.chat_id=d.chat_id
        where c.order_ref=ref and d.chat_id=chat and d.active
          and (coalesce(s.division,item->>'team')=d.division or (o.order_type='gold' and item->>'assignmentMode' is null and s.division is null))
        order by (d.division=coalesce(s.division,item->>'team')) desc,d.division limit 1;
      if division is null then raise exception 'Gunakan percakapan leader/divisi yang menerima order ini.'; end if;
      if o.order_type in ('boosting','item') and (division is distinct from item->>'team' or o.division is distinct from item->>'team') then raise exception 'Order bukan milik divisi ini.'; end if;
      select value into emp from jsonb_array_elements(coalesce(w->'cp-ofs-demo-employees-v2','[]')) where value->>'code'=e.employee_code;
      leader_managed:=exists(select 1 from public.cp_payroll_telegram_divisions d where d.division=division and d.active and d.chat_id=chat and d.leader_telegram_user_id=uid);
      managed:=p_is_admin or leader_managed or (e.role='leader' and e.division=division and emp->>'team'=e.division and coalesce(emp->>'workforceStatus','SHIFT') in ('NEW','SHIFT','FULL'));
      if action='gold' and coalesce(managed,false) then action:='goldpicker'; end if;
      if action='problem' and o.order_type='gold' and coalesce(managed,false) then
        if o.state='done_pending_admin' then raise exception 'Order menunggu verifikasi admin.'; end if;
        update public.cp_payroll_telegram_orders set state='problem',updated_at=now(),last_event_at=now() where order_ref=ref;
        result:=jsonb_build_object('text','BERMASALAH — '||ref,'keyboard','gold','orderId',o.callback_id); broadcast:=true;
      elsif action in ('picker','assign','pick','goldpicker') then
        if (action<>'goldpicker' and o.order_type not in ('boosting','item')) or (action='goldpicker' and o.order_type<>'gold') or not coalesce(managed,false) then raise exception 'Hanya admin/leader divisi order dapat memilih karyawan.'; end if;
        if o.state='done_pending_admin' then raise exception 'Order menunggu verifikasi admin.'; end if;
        if action in ('picker','goldpicker') then
          select coalesce(jsonb_agg(v),'[]') into options from (
            select l.callback_id as id,case when action='goldpicker' and item->>'assignmentMode' is null then (j->>'name')||' · '||l.division else j->>'name' end as name from public.cp_payroll_telegram_employees l
            join jsonb_array_elements(coalesce(w->'cp-ofs-demo-employees-v2','[]')) j on j->>'code'=l.employee_code
            where l.active and (l.division=division or (action='goldpicker' and item->>'assignmentMode' is null and exists(
              select 1 from public.cp_payroll_telegram_divisions d join public.cp_payroll_telegram_order_chats c on c.division=d.division and c.chat_id=d.chat_id
              where c.order_ref=ref and d.division=l.division and d.chat_id=chat and d.active and (d.leader_telegram_user_id=uid or p_is_admin))))
              and j->>'team'=l.division and coalesce(j->>'workforceStatus','SHIFT') in ('NEW','SHIFT','FULL')
            order by j->>'name',l.employee_code limit 9 offset page*8) v;
          result:=jsonb_build_object('text',ref||' — PILIH KARYAWAN','keyboard',case when action='goldpicker' then 'goldpicker' else 'picker' end,'orderId',o.callback_id,'page',page,'employees',options);
        else
          select l.* into chosen from public.cp_payroll_telegram_employees l
            join jsonb_array_elements(coalesce(w->'cp-ofs-demo-employees-v2','[]')) j on j->>'code'=l.employee_code
            where l.active and l.division=division and j->>'team'=l.division and coalesce(j->>'workforceStatus','SHIFT') in ('NEW','SHIFT','FULL')
              and ((action='pick' and l.callback_id::text=p_event->>'employeeId') or (action='assign' and upper(l.employee_code)=upper(p_event->>'employeeCode')));
          if chosen.employee_code is null then raise exception 'Karyawan aktif tidak ditemukan di divisi order.'; end if;
          update public.cp_payroll_telegram_assignments set status='replaced',replaced_at=now(),updated_at=now() where order_ref=ref and status in ('assigned','in_progress','paused','problem');
          update public.cp_payroll_telegram_sessions set closed_at=now() where order_ref=ref and closed_at is null;
          insert into public.cp_payroll_telegram_assignments(order_ref,employee_code,division,telegram_user_id,assigned_by_telegram_user_id) values(ref,chosen.employee_code,chosen.division,chosen.telegram_user_id,uid);
          select j into emp from jsonb_array_elements(w->'cp-ofs-demo-employees-v2') j where j->>'code'=chosen.employee_code;
          perform public.cp_telegram_save_worker(ref,emp);
          update public.cp_payroll_telegram_orders set state='assigned',last_event_at=now(),updated_at=now() where order_ref=ref;
          result:=jsonb_build_object('text',E'✅ KARYAWAN DITENTUKAN\nOrder : '||ref||E'\nKaryawan : '||chosen.employee_code||E'\nDivisi : '||chosen.division,'keyboard',o.order_type,'orderId',o.callback_id);
          broadcast:=true;
        end if;
      else
        if coalesce(managed,false) then
          if o.order_type in ('boosting','item') then
            select * into a from public.cp_payroll_telegram_assignments where order_ref=ref and status in ('assigned','in_progress','paused','problem') for update;
            select * into e from public.cp_payroll_telegram_employees where employee_code=a.employee_code and active;
          else
            select * into e from public.cp_payroll_telegram_employees
              where active and cp_payroll_telegram_employees.division=division and
                ((action='pickgold' and callback_id::text=p_event->>'employeeId') or (s.id is not null and employee_code=s.employee_code));
            if action='pickgold' then action:='gold'; end if;
          end if;
          select j into emp from jsonb_array_elements(w->'cp-ofs-demo-employees-v2') j where j->>'code'=e.employee_code;
        else
          select * into a from public.cp_payroll_telegram_assignments where order_ref=ref and employee_code=e.employee_code and telegram_user_id=uid and status in ('assigned','in_progress','paused','problem') for update;
        end if;
        if e.employee_code is null or emp is null or coalesce(emp->>'workforceStatus','SHIFT') not in ('NEW','SHIFT','FULL')
          or e.division is distinct from division or emp->>'team' is distinct from division then raise exception 'Pilih karyawan aktif di divisi order terlebih dahulu.'; end if;
        if not coalesce(managed,false) and e.telegram_user_id is distinct from uid then raise exception 'Akun tidak berwenang.'; end if;
        if s.id is not null and s.employee_code is not null and s.employee_code<>e.employee_code then raise exception 'Karyawan sesi telah berubah.'; end if;
        if o.order_type in ('boosting','item') and a.id is null then raise exception 'Anda bukan karyawan yang ditugaskan pada order ini.'; end if;
        if o.state='done_pending_admin' then raise exception 'Order menunggu verifikasi admin; pengiriman ditutup.'; end if;
        if s.id is not null and o.order_type in ('boosting','item') and s.assignment_id is distinct from a.id then raise exception 'Assignment sesi sudah diganti.'; end if;
        if action in ('start','done','gold') then
          if (action='start' and (o.order_type not in ('boosting','item') or a.status<>'assigned'))
            or (action='done' and (o.order_type not in ('boosting','item') or a.status not in ('in_progress','paused')))
            or (action='gold' and (o.order_type<>'gold' or o.delivered_quantity>=o.target_quantity or division not in ('FH1','FH2','FH3'))) then raise exception 'Aksi tidak sesuai status order.'; end if;
          update public.cp_payroll_telegram_sessions set closed_at=now() where telegram_user_id=uid and chat_id=chat and closed_at is null;
          insert into public.cp_payroll_telegram_sessions(telegram_user_id,chat_id,order_ref,assignment_id,employee_code,division,kind,stage)
            values(uid,chat,ref,a.id,e.employee_code,e.division,action,case when action='gold' then 'amount' else 'evidence' end) returning * into s;
          result:=jsonb_build_object('text','Order: '||ref||E'\nKaryawan: '||(emp->>'name')||' · '||e.division||E'\n'||case when action='gold' then 'Masukkan jumlah Gold (unit sama dengan target order).' else '📸🎥 BUKTI '||upper(action)||' WAJIB'||E'\nKirim foto/screenshot/video. DONE baru selesai setelah SELESAI UPLOAD.' end,'keyboard','session','sessionId',s.id);
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
            result:=jsonb_build_object('text','🟢 START — '||ref||' — '||e.employee_code,'keyboard',o.order_type,'orderId',o.callback_id); broadcast:=true;
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
            perform public.cp_telegram_save_gold_workers(ref);
            result:=jsonb_build_object('text',case when o.delivered_quantity>=o.target_quantity then '🟡 GOLD ORDER TERPENUHI' else '✅ SETORAN GOLD DITERIMA' end||E'\nOrder : '||ref||E'\nDiterima : '||accepted||' dari '||s.requested_quantity||E'\nTerkirim : '||o.delivered_quantity||' / '||o.target_quantity||E'\nSisa : '||(o.target_quantity-o.delivered_quantity)||case when o.delivered_quantity>=o.target_quantity then E'\n⛔ Pengiriman Gold telah ditutup.' else '' end,
              'accepted',accepted,'delivered',o.delivered_quantity,'remaining',o.target_quantity-o.delivered_quantity,'state',o.state);
          else
            if a.status not in ('in_progress','paused') then raise exception 'DONE hanya untuk pekerjaan berlangsung atau dijeda.'; end if;
            update public.cp_payroll_telegram_assignments set status='done',done_at=now(),updated_at=now() where id=a.id;
            update public.cp_payroll_telegram_orders set state='done_pending_admin',
              delivered_quantity=case when order_type='item' then target_quantity else delivered_quantity end,
              updated_at=now(),last_event_at=now() where order_ref=ref;
            result:=jsonb_build_object('text','🟡 DONE — '||ref||E'\nMenunggu verifikasi admin.','state','done_pending_admin');
          end if;
          update public.cp_payroll_telegram_sessions set closed_at=now() where id=s.id; broadcast:=true;
        elsif action='cancel' then
          update public.cp_payroll_telegram_sessions set closed_at=now() where id=s.id;
          result:=jsonb_build_object('text','Sesi dibatalkan. Status order tidak diubah; bukti yang sudah dikirim tetap tersimpan.');
        elsif action='more' then
          result:=jsonb_build_object('text','Kirim foto/video tambahan di percakapan ini.','keyboard','session','sessionId',s.id);
        elsif action in ('pause','resume','problem') then
          if action='pause' and (o.order_type not in ('boosting','item') or a.status<>'in_progress') then raise exception 'PAUSE hanya saat pekerjaan berlangsung.'; end if;
          if action='resume' and (o.order_type not in ('boosting','item') or a.status<>'paused') then raise exception 'RESUME hanya saat dijeda.'; end if;
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
      select 'update:'||p_update_id||':'||chat_id,ref,chat_id,result from public.cp_payroll_telegram_order_chats c where order_ref=ref and exists(select 1 from public.cp_payroll_telegram_divisions d where d.division=c.division and d.chat_id=c.chat_id and d.active) on conflict do nothing;
  else
    insert into public.cp_payroll_telegram_outbox(event_key,order_ref,chat_id,payload) values('update:'||p_update_id,ref,chat,result) on conflict do nothing;
  end if;
  update public.cp_payroll_telegram_updates set processed_at=now(),result=result where update_id=p_update_id;
  return result;
end;
$$;

-- Replacements retain the existing private service-role boundary.
revoke all on function public.cp_telegram_save_worker(text,jsonb),public.cp_telegram_prepare_order(jsonb,jsonb),public.cp_telegram_process_update(bigint,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.cp_telegram_save_worker(text,jsonb),public.cp_telegram_prepare_order(jsonb,jsonb),public.cp_telegram_process_update(bigint,jsonb,boolean) to service_role;
