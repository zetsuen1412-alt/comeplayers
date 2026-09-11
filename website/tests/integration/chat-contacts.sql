begin;
do $test$
declare a uuid:=gen_random_uuid(); b uuid:=gen_random_uuid(); r jsonb; r2 jsonb; rid uuid; blocked boolean; gid uuid;
begin
  insert into auth.users(id, aud, role, email, raw_user_meta_data) values
    (a,'authenticated','authenticated',a::text||'@example.invalid','{}'),
    (b,'authenticated','authenticated',b::text||'@example.invalid','{}');
  insert into public.profiles(id,username) values(a,'qa_'||replace(a::text,'-','')),(b,'qa_'||replace(b::text,'-','')) on conflict(id) do nothing;
  r:=public.cp_open_direct_contact(a,b); r2:=public.cp_open_direct_contact(b,a);
  if r->>'id' <> r2->>'id' then raise exception 'FAIL duplicate rooms'; end if;
  rid:=(r->>'id')::uuid;
  insert into public.chat_messages(room_id,sender_id,receiver_id,message) values(rid,a,b,'transaction-only QA');
  perform public.cp_set_contact_block(a,b,true);
  blocked:=false;
  begin perform public.cp_open_direct_contact(b,a); exception when others then if sqlerrm like '%blocked%' then blocked:=true; else raise; end if; end;
  if not blocked then raise exception 'FAIL blocked contact reopened'; end if;
  blocked:=false;
  begin insert into public.chat_messages(room_id,sender_id,receiver_id,message) values(rid,b,a,'must fail'); exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'FAIL reverse blocked send'; end if;
  blocked:=false;
  begin insert into public.chat_messages(room_id,sender_id,receiver_id,message) values(rid,a,b,'must also fail'); exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'FAIL outgoing blocked send'; end if;
  insert into public.chat_rooms(buyer_id,seller_id,room_type,title,created_by) values(a,a,'group','QA temporary group',a) returning id into gid;
  blocked:=false;
  begin insert into public.chat_party_invitations(room_id,inviter_id,invitee_id,source,status) values(gid,b,a,'direct','pending'); exception when insufficient_privilege then blocked:=true; end;
  if not blocked then raise exception 'FAIL blocked invite'; end if;
  insert into public.chat_messages(room_id,sender_id,receiver_id,message) values(gid,a,a,'shared groups remain usable');
  perform public.cp_set_contact_block(a,b,false);
  insert into public.chat_messages(room_id,sender_id,receiver_id,message) values(rid,b,a,'unblocked');
  insert into public.user_verifications(user_id,phone_number,phone_verified) values(b,'+1 202 555 0199',false) on conflict(user_id) do update set phone_number=excluded.phone_number,phone_verified=false;
  if exists(select 1 from public.cp_find_contact_phone('12025550199') where user_id=b) then raise exception 'FAIL unverified phone exposed'; end if;
  update public.user_verifications set phone_verified=true where user_id=b;
  if not exists(select 1 from public.cp_find_contact_phone('12025550199') where user_id=b) then raise exception 'FAIL verified phone not found'; end if;
  if exists(select 1 from public.cp_find_contact_phone('1202555') where user_id=b) then raise exception 'FAIL partial phone exposed'; end if;
  if has_function_privilege('authenticated','public.cp_open_direct_contact(uuid,uuid)','execute') or has_function_privilege('anon','public.cp_find_contact_phone(text)','execute') or has_function_privilege('authenticated','public.cp_set_contact_block(uuid,uuid,boolean)','execute') then raise exception 'FAIL privileged RPC exposed'; end if;
end $test$;
rollback;
select 'PASS: direct reuse, both-way blocking, blocked invitations, shared groups, unblock, verified-only full phone lookup, RPC access. All fixtures rolled back.' as result;
