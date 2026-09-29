-- Crazy Rich: World Tour 29.0 — Zero Dice System.
-- Patch the existing v18 core in place. No tables, economy rules or endpoints
-- are replaced. Compatible with the original 1..6 and the early 0..6 patch.
do $migration$
declare
  definition text;
begin
  definition := pg_get_functiondef('public.crwt_v18_roll_core(uuid,integer,uuid,text,boolean)'::regprocedure);
  if position('v_total:=v_d1+v_d2;' in definition)=0
     or position('v_doubles:=v_d1=v_d2;' in definition)=0
     or position('public.crwt_v15_advance' in definition)=0 then
    raise exception 'Unexpected roll core. Review drift before applying v29.';
  end if;

  definition := regexp_replace(definition, '1\s*\+\s*floor\(random\(\)\s*\*\s*6\)', 'floor(random()*7)', 'g');
  -- Rejection sampling keeps all eligible ordered pairs equally likely.
  -- No retry cap that can accidentally return the wrong parity; 0 is even.
  definition := replace(definition, 'v_tries integer:=0;', '');
  definition := replace(definition, '    v_tries:=v_tries+1;', '');
  definition := replace(definition, 'exit when v_focus is null', 'exit when v_focus is null or v_focus not in (''odd'',''even'')');
  -- Keep this patch idempotent for local verification/recovery.
  definition := replace(definition,
    'or v_focus not in (''odd'',''even'') or v_focus not in (''odd'',''even'')',
    'or v_focus not in (''odd'',''even'')');
  definition := replace(definition, E'\n      or v_tries>=12;', ';');
  definition := replace(definition, 'if v_old+v_total>=32 then', 'if v_total>0 and v_old+v_total>=32 then');

  if position('if v_total=0 then' in definition)=0 then
    definition := replace(definition, 'if v_tile.kind in (''city'',''resort'') then',
      E'if v_total=0 then\n    v_event:=''ZERO ROLL! Tetap di tempat.'';\n  elsif v_tile.kind in (''city'',''resort'') then');
  end if;
  definition := replace(definition, 'ZERO ROLL • tetap di tempat • tidak memicu tile', 'ZERO ROLL! Tetap di tempat.');
  if position('''zero_roll''' in definition)=0 then
    definition := replace(definition, '''doubles'',v_doubles,', '''doubles'',v_doubles,''zero_roll'',v_total=0,');
  end if;
  if position('''roll_id''' in definition)=0 then
    definition := replace(definition, '''seat'',p_seat,''d1''', '''roll_id'',p_idempotency_key,''seat'',p_seat,''d1''');
  end if;

  -- Concurrent retry after waiting on the row lock must replay the same result.
  if position('-- v29 locked idempotency' in definition)=0 then
    definition := replace(definition,
      'if not found or v_match.status<>''active'' then raise exception ''match_not_active''; end if;',
      E'if not found or v_match.status<>''active'' then raise exception ''match_not_active''; end if;\n  -- v29 locked idempotency\n  select payload into v_existing from public.crwt_match_events where match_id=p_match_id and idempotency_key=p_idempotency_key;\n  if found then return v_existing; end if;');
  end if;

  if (length(definition)-length(replace(definition,'floor(random()*7)','')))/length('floor(random()*7)')<>2
     or position('v_tries' in definition)>0
     or position('if v_total>0 and v_old+v_total>=32 then' in definition)=0
     or position('if v_total=0 then' in definition)=0
     or position('''zero_roll'',v_total=0' in definition)=0
     or position('''roll_id'',p_idempotency_key' in definition)=0
     or position('ZERO ROLL! Tetap di tempat.' in definition)=0 then
    raise exception 'v29 patch anchors did not match; no function was changed.';
  end if;
  execute definition;
end
$migration$;

-- Preserve the current public/authenticated boundary. Only guarded wrappers
-- are client RPCs; core and automatic timeout application remain internal.
revoke execute on function public.crwt_v18_roll_core(uuid,integer,uuid,text,boolean) from public, anon, authenticated;
revoke execute on function public.crwt_v18_timeout_apply(uuid,text) from public, anon, authenticated;
revoke execute on function public.crwt_v18_roll(uuid,text) from public, anon;
revoke execute on function public.crwt_v18_bot_step(uuid,text) from public, anon;
revoke execute on function public.crwt_v18_timeout_tick(uuid,text) from public, anon;
grant execute on function public.crwt_v18_roll(uuid,text), public.crwt_v18_bot_step(uuid,text), public.crwt_v18_timeout_tick(uuid,text) to authenticated;
