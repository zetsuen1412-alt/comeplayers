-- Allow short encrypted videos while keeping bounded uploads and the existing
-- per-account storage quota. The ciphertext includes a 40-byte AEAD overhead.
alter table public.cp_secure_blobs
  drop constraint cp_secure_blobs_size_bytes_check;
alter table public.cp_secure_blobs
  add constraint cp_secure_blobs_size_bytes_check
  check (size_bytes between 41 and 8388648);

create or replace function public.cp_secure_prepare_blob(
  p_id uuid, p_actor uuid, p_device uuid, p_room uuid, p_epoch uuid, p_size integer
)
returns text language plpgsql security invoker set search_path='' as $$
declare object_path text;
begin
  perform pg_advisory_xact_lock(hashtextextended('secure-blob:'||p_actor::text,0));
  if p_size not between 41 and 8388648 then raise exception 'Invalid blob size'; end if;
  if not exists(select 1 from public.chat_rooms r where r.id=p_room and coalesce(r.room_type,'direct')<>'group' and r.status='active' and p_actor in(r.buyer_id,r.seller_id)) then raise exception 'Private room unavailable'; end if;
  if not exists(select 1 from public.cp_secure_devices d where d.user_id=p_actor and d.device_id=p_device and d.revoked_revision is null) then raise exception 'Inactive device'; end if;
  if not exists(select 1 from public.cp_secure_epochs e where e.id=p_epoch and e.room_id=p_room and e.epoch=(select max(last.epoch) from public.cp_secure_epochs last where last.room_id=p_room)) then raise exception 'Use the current conversation key'; end if;
  if (select count(*) from public.cp_secure_blobs where owner_id=p_actor and created_at>now()-interval '1 hour')>=30 then raise exception 'Attachment rate limit'; end if;
  if (select coalesce(sum(size_bytes),0) from public.cp_secure_blobs where owner_id=p_actor)+p_size>268435456 then raise exception 'Encrypted attachment quota'; end if;
  object_path='secure-history/v2/'||p_actor::text||'/'||p_id::text;
  insert into public.cp_secure_blobs(id,room_id,epoch_id,owner_id,owner_device_id,object_key,size_bytes,prepare_expires_at)
    values(p_id,p_room,p_epoch,p_actor,p_device,object_path,p_size,now()+interval '1 hour');
  return object_path;
end $$;
revoke all on function public.cp_secure_prepare_blob(uuid,uuid,uuid,uuid,uuid,integer) from public,anon,authenticated;
grant execute on function public.cp_secure_prepare_blob(uuid,uuid,uuid,uuid,uuid,integer) to service_role;
