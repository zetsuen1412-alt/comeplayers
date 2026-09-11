-- Serialize blocking with direct-room creation, message delivery, and group invitations.
create or replace function public.cp_set_contact_block(p_actor uuid, p_target uuid, p_block boolean)
returns void language plpgsql security invoker set search_path = '' as $$
begin
  if p_actor is null or p_target is null or p_actor = p_target then raise exception 'Invalid contact'; end if;
  perform pg_advisory_xact_lock(hashtextextended(least(p_actor::text,p_target::text)||':'||greatest(p_actor::text,p_target::text), 0));
  if p_block then
    insert into public.chat_user_blocks(blocker_id,blocked_id) values(p_actor,p_target) on conflict do nothing;
    update public.chat_party_invitations set status='declined',responded_at=now()
      where status='pending' and ((inviter_id=p_actor and invitee_id=p_target) or (inviter_id=p_target and invitee_id=p_actor));
  else
    delete from public.chat_user_blocks where blocker_id=p_actor and blocked_id=p_target;
  end if;
end;
$$;
revoke all on function public.cp_set_contact_block(uuid,uuid,boolean) from public, anon, authenticated;
grant execute on function public.cp_set_contact_block(uuid,uuid,boolean) to service_role;
