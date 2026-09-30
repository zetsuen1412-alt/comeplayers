create index if not exists crwt_match_results_user_created_idx
  on public.crwt_match_results(user_id, created_at desc);
create index if not exists crwt_match_results_user_placement_created_idx
  on public.crwt_match_results(user_id, placement, created_at desc);
create index if not exists crwt_progression_events_user_type_created_idx
  on public.crwt_progression_events(user_id, event_type, created_at desc);
create index if not exists crwt_mission_claims_mission_idx
  on public.crwt_mission_claims(mission_id);
