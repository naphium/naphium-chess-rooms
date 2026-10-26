ALTER TABLE public.games
  ADD COLUMN white_name text,
  ADD COLUMN black_name text,
  ADD COLUMN initial_ms integer NOT NULL DEFAULT 600000,
  ADD COLUMN increment_ms integer NOT NULL DEFAULT 0,
  ADD COLUMN white_ms integer NOT NULL DEFAULT 600000,
  ADD COLUMN black_ms integer NOT NULL DEFAULT 600000,
  ADD COLUMN turn_started_at timestamptz,
  ADD COLUMN ply integer NOT NULL DEFAULT 0,
  ADD COLUMN status text NOT NULL DEFAULT 'waiting',
  ADD COLUMN result text,
  ADD COLUMN reason text,
  ADD COLUMN draw_offer text,
  ADD COLUMN takeback_offer text,
  ADD COLUMN rematch_id text;

CREATE OR REPLACE FUNCTION public.seat_color(p_id text, p_token text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE WHEN white_token = p_token THEN 'w' WHEN black_token = p_token THEN 'b' END
  FROM game_seats WHERE game_id = p_id
$$;
REVOKE EXECUTE ON FUNCTION public.seat_color(text,text) FROM anon, authenticated, public;

CREATE OR REPLACE FUNCTION public.new_game(p_id text, p_token text, p_name text, p_color text, p_initial integer, p_inc integer)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c text := p_color;
BEGIN
  IF length(p_token) < 16 OR p_id !~ '^[a-z0-9-]{4,32}$' THEN RAISE EXCEPTION 'invalid'; END IF;
  IF p_initial < 0 OR p_initial > 10800000 OR p_inc < 0 OR p_inc > 180000 THEN RAISE EXCEPTION 'invalid time'; END IF;
  IF c NOT IN ('w','b') THEN c := CASE WHEN random() < 0.5 THEN 'w' ELSE 'b' END; END IF;
  INSERT INTO games(id, white_joined, black_joined, white_name, black_name, initial_ms, increment_ms, white_ms, black_ms)
  VALUES (p_id, c='w', c='b', CASE WHEN c='w' THEN left(p_name,24) END, CASE WHEN c='b' THEN left(p_name,24) END, p_initial, p_inc, p_initial, p_initial);
  INSERT INTO game_seats(game_id, white_token, black_token)
  VALUES (p_id, CASE WHEN c='w' THEN p_token END, CASE WHEN c='b' THEN p_token END);
  RETURN c;
END $$;

CREATE OR REPLACE FUNCTION public.enter_game(p_id text, p_token text, p_name text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s game_seats;
BEGIN
  SELECT * INTO s FROM game_seats WHERE game_id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'missing'; END IF;
  IF s.white_token = p_token THEN RETURN 'white'; END IF;
  IF s.black_token = p_token THEN RETURN 'black'; END IF;
  IF length(p_token) < 16 OR coalesce(p_name,'') = '' THEN RETURN 'spectator'; END IF;
  IF s.white_token IS NULL THEN
    UPDATE game_seats SET white_token = p_token WHERE game_id = p_id;
    UPDATE games SET white_joined = true, white_name = left(p_name,24), status = 'active', updated_at = now() WHERE id = p_id;
    RETURN 'white';
  ELSIF s.black_token IS NULL THEN
    UPDATE game_seats SET black_token = p_token WHERE game_id = p_id;
    UPDATE games SET black_joined = true, black_name = left(p_name,24), status = 'active', updated_at = now() WHERE id = p_id;
    RETURN 'black';
  END IF;
  RETURN 'spectator';
END $$;

-- returns true if the side to move has flagged (and ends the game)
CREATE OR REPLACE FUNCTION public.check_flag(g games)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE turn text := split_part(g.fen,' ',2); rem integer;
BEGIN
  IF g.status <> 'active' OR g.initial_ms = 0 OR g.ply < 2 OR g.turn_started_at IS NULL THEN RETURN false; END IF;
  rem := (CASE WHEN turn='w' THEN g.white_ms ELSE g.black_ms END) - (extract(epoch FROM now() - g.turn_started_at)*1000)::int;
  IF rem > 0 THEN RETURN false; END IF;
  UPDATE games SET status='over', result = CASE WHEN turn='w' THEN '0-1' ELSE '1-0' END, reason='timeout',
    white_ms = CASE WHEN turn='w' THEN 0 ELSE white_ms END, black_ms = CASE WHEN turn='b' THEN 0 ELSE black_ms END,
    draw_offer=null, takeback_offer=null, updated_at=now() WHERE id = g.id;
  RETURN true;
END $$;
REVOKE EXECUTE ON FUNCTION public.check_flag(games) FROM anon, authenticated, public;

CREATE OR REPLACE FUNCTION public.claim_timeout(p_id text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g games;
BEGIN
  SELECT * INTO g FROM games WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  RETURN check_flag(g);
END $$;

CREATE OR REPLACE FUNCTION public.play_move(p_id text, p_token text, p_prev_fen text, p_fen text, p_pgn text, p_last jsonb, p_result text, p_reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g games; c text; turn text; elapsed integer := 0;
BEGIN
  SELECT * INTO g FROM games WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR g.status <> 'active' OR g.fen <> p_prev_fen THEN RETURN false; END IF;
  c := seat_color(p_id, p_token); turn := split_part(g.fen,' ',2);
  IF c IS NULL OR c <> turn THEN RETURN false; END IF;
  IF check_flag(g) THEN RETURN false; END IF;
  IF g.initial_ms > 0 AND g.ply >= 2 THEN elapsed := (extract(epoch FROM now() - g.turn_started_at)*1000)::int; END IF;
  UPDATE games SET fen=p_fen, pgn=p_pgn, last_move=p_last, ply=ply+1, turn_started_at=now(),
    white_ms = CASE WHEN turn='w' AND g.initial_ms>0 THEN white_ms - elapsed + CASE WHEN g.ply>=2 THEN increment_ms ELSE 0 END ELSE white_ms END,
    black_ms = CASE WHEN turn='b' AND g.initial_ms>0 THEN black_ms - elapsed + CASE WHEN g.ply>=2 THEN increment_ms ELSE 0 END ELSE black_ms END,
    draw_offer=null, takeback_offer=null,
    status = CASE WHEN p_result IS NOT NULL THEN 'over' ELSE status END,
    result = p_result, reason = p_reason, updated_at=now()
  WHERE id = p_id;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.game_action(p_id text, p_token text, p_action text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g games; c text;
BEGIN
  SELECT * INTO g FROM games WHERE id = p_id FOR UPDATE;
  c := seat_color(p_id, p_token);
  IF NOT FOUND OR c IS NULL OR g.status <> 'active' THEN RETURN false; END IF;
  IF check_flag(g) THEN RETURN false; END IF;
  IF p_action = 'resign' THEN
    UPDATE games SET status='over', result = CASE WHEN c='w' THEN '0-1' ELSE '1-0' END, reason='resignation', draw_offer=null, takeback_offer=null, updated_at=now() WHERE id=p_id;
  ELSIF p_action = 'abort' AND g.ply < 2 THEN
    UPDATE games SET status='over', result='*', reason='aborted', updated_at=now() WHERE id=p_id;
  ELSIF p_action = 'offer_draw' THEN
    IF g.draw_offer IS NOT NULL AND g.draw_offer <> c THEN
      UPDATE games SET status='over', result='1/2-1/2', reason='agreement', draw_offer=null, updated_at=now() WHERE id=p_id;
    ELSE UPDATE games SET draw_offer=c, updated_at=now() WHERE id=p_id; END IF;
  ELSIF p_action = 'decline_draw' AND g.draw_offer IS NOT NULL AND g.draw_offer <> c THEN
    UPDATE games SET draw_offer=null, updated_at=now() WHERE id=p_id;
  ELSIF p_action = 'offer_takeback' AND g.ply > 0 THEN
    UPDATE games SET takeback_offer=c, updated_at=now() WHERE id=p_id;
  ELSIF p_action IN ('decline_takeback','cancel_takeback') THEN
    UPDATE games SET takeback_offer=null, updated_at=now() WHERE id=p_id;
  ELSE RETURN false; END IF;
  RETURN true;
END $$;

-- opponent accepts a takeback; client supplies the rewound position
CREATE OR REPLACE FUNCTION public.accept_takeback(p_id text, p_token text, p_fen text, p_pgn text, p_ply integer, p_last jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g games; c text;
BEGIN
  SELECT * INTO g FROM games WHERE id = p_id FOR UPDATE;
  c := seat_color(p_id, p_token);
  IF NOT FOUND OR c IS NULL OR g.status <> 'active' OR g.takeback_offer IS NULL OR g.takeback_offer = c THEN RETURN false; END IF;
  IF p_ply < 0 OR p_ply >= g.ply OR p_ply < g.ply - 2 THEN RETURN false; END IF;
  UPDATE games SET fen=p_fen, pgn=p_pgn, ply=p_ply, last_move=p_last, takeback_offer=null, draw_offer=null,
    turn_started_at = now(), updated_at=now() WHERE id=p_id;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.request_rematch(p_id text, p_token text, p_new_id text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE g games; s game_seats;
BEGIN
  SELECT * INTO g FROM games WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR g.status <> 'over' OR seat_color(p_id, p_token) IS NULL THEN RETURN null; END IF;
  IF g.rematch_id IS NOT NULL THEN RETURN g.rematch_id; END IF;
  IF p_new_id !~ '^[a-z0-9-]{4,32}$' THEN RETURN null; END IF;
  SELECT * INTO s FROM game_seats WHERE game_id = p_id;
  INSERT INTO games(id, white_joined, black_joined, white_name, black_name, initial_ms, increment_ms, white_ms, black_ms, status)
  VALUES (p_new_id, s.black_token IS NOT NULL, s.white_token IS NOT NULL, g.black_name, g.white_name, g.initial_ms, g.increment_ms, g.initial_ms, g.initial_ms,
    CASE WHEN s.white_token IS NOT NULL AND s.black_token IS NOT NULL THEN 'active' ELSE 'waiting' END);
  INSERT INTO game_seats(game_id, white_token, black_token) VALUES (p_new_id, s.black_token, s.white_token);
  UPDATE games SET rematch_id = p_new_id, updated_at=now() WHERE id = p_id;
  RETURN p_new_id;
END $$;

GRANT EXECUTE ON FUNCTION public.new_game(text,text,text,text,integer,integer), public.enter_game(text,text,text),
  public.claim_timeout(text), public.play_move(text,text,text,text,text,jsonb,text,text), public.game_action(text,text,text),
  public.accept_takeback(text,text,text,text,integer,jsonb), public.request_rematch(text,text,text) TO anon, authenticated;