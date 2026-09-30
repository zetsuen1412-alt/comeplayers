begin;
do $test$
declare
  a uuid := gen_random_uuid();
  b uuid := gen_random_uuid();
  a_number text;
  b_number text;
  rejected boolean;
begin
  if (select count(*) from cp_private.reserved_cp_numbers) <> 10
    or exists (select '008'||repeat(d::text,10) from generate_series(0,9) d
      except select cp_number from cp_private.reserved_cp_numbers)
  then raise exception 'FAIL ten admin CP reservations'; end if;
  if exists (select 1 from cp_private.account_numbers a join cp_private.reserved_cp_numbers r using(cp_number))
  then raise exception 'FAIL reserved CP already assigned'; end if;
  if has_table_privilege('authenticated','cp_private.reserved_cp_numbers','select,insert,update,delete,truncate')
    or has_table_privilege('anon','cp_private.reserved_cp_numbers','select,insert,update,delete,truncate')
    or has_table_privilege('service_role','cp_private.reserved_cp_numbers','select,insert,update,delete,truncate')
  then raise exception 'FAIL client admin reservation access'; end if;
  insert into auth.users(id,aud,role,email,raw_user_meta_data)
    values(a,'authenticated','authenticated',a::text||'@example.invalid','{}'),
          (b,'authenticated','authenticated',b::text||'@example.invalid','{}');
  select cp_number into a_number from public.profiles where id=a;
  select cp_number into b_number from public.profiles where id=b;
  if a_number !~ '^008[0-9]{10}$' or b_number !~ '^008[0-9]{10}$' or a_number=b_number then
    raise exception 'FAIL signup CP number'; end if;
  if exists (select 1 from cp_private.reserved_cp_numbers where cp_number in (a_number,b_number))
  then raise exception 'FAIL signup used an admin reservation'; end if;
  if cp_private.cp_number_for_user(a) <> a_number then raise exception 'FAIL stable allocation'; end if;
  rejected := false;
  begin update public.profiles set cp_number=b_number where id=a;
    exception when check_violation then rejected:=true; end;
  if not rejected then raise exception 'FAIL editable CP'; end if;
  rejected:=false;
  begin update public.profiles set cp_number=null where id=a;
    exception when check_violation then rejected:=true; end;
  if not rejected then raise exception 'FAIL cleared CP'; end if;
  rejected:=false;
  begin update public.profiles set id=gen_random_uuid() where id=a;
    exception when check_violation then rejected:=true; end;
  if not rejected then raise exception 'FAIL identity swap'; end if;
  update public.profiles set bio='Transactional CP identity test' where id=a;
  delete from public.profiles where id=a;
  rejected:=false;
  begin insert into public.profiles(id,cp_number) values(a,b_number);
    exception when check_violation then rejected:=true; end;
  if not rejected then raise exception 'FAIL spoofed CP'; end if;
  insert into public.profiles(id) values(a);
  if (select cp_number from public.profiles where id=a) <> a_number then raise exception 'FAIL recreated profile'; end if;
  delete from auth.users where id=a;
  if (select cp_number from cp_private.account_numbers where user_id=a) <> a_number then raise exception 'FAIL recycled CP'; end if;
  rejected:=false;
  begin delete from cp_private.account_numbers where user_id=a;
    exception when check_violation then rejected:=true; end;
  if not rejected then raise exception 'FAIL removable reservation'; end if;
  if has_function_privilege('authenticated','cp_private.cp_number_for_user(uuid)','execute')
    or has_table_privilege('authenticated','cp_private.account_numbers','select')
    or has_function_privilege('anon','cp_private.assign_auth_cp_number()','execute')
  then raise exception 'FAIL client allocator access'; end if;
end $test$;
rollback;
select 'PASS: signup, format, uniqueness, immutable number/id, profile edits, recreation, account deletion reservation, ten unassigned admin reservations, private privileges; fixtures rolled back.' as result;
