CREATE TABLE public.games (
  id text PRIMARY KEY,
  fen text NOT NULL DEFAULT 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  pgn text NOT NULL DEFAULT '',
  last_move jsonb,
  white_joined boolean NOT NULL DEFAULT false,
  black_joined boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.games TO anon, authenticated;
GRANT ALL ON public.games TO service_role;
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view games" ON public.games FOR SELECT TO anon, authenticated USING (true);

CREATE TABLE public.game_seats (
  game_id text PRIMARY KEY REFERENCES public.games(id) ON DELETE CASCADE,
  white_token text,
  black_token text
);
GRANT ALL ON public.game_seats TO service_role;
ALTER TABLE public.game_seats ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.create_game(p_id text, p_token text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF length(p_token) < 16 OR p_id !~ '^[a-z0-9-]{4,32}$' THEN RAISE EXCEPTION 'invalid'; END IF;
  INSERT INTO games(id, white_joined) VALUES (p_id, true);
  INSERT INTO game_seats(game_id, white_token) VALUES (p_id, p_token);
END $$;

CREATE OR REPLACE FUNCTION public.join_game(p_id text, p_token text)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s game_seats;
BEGIN
  SELECT * INTO s FROM game_seats WHERE game_id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'missing'; END IF;
  IF s.white_token = p_token THEN RETURN 'white'; END IF;
  IF s.black_token = p_token THEN RETURN 'black'; END IF;
  IF s.black_token IS NULL AND length(p_token) >= 16 THEN
    UPDATE game_seats SET black_token = p_token WHERE game_id = p_id;
    UPDATE games SET black_joined = true, updated_at = now() WHERE id = p_id;
    RETURN 'black';
  END IF;
  RETURN 'spectator';
END $$;

CREATE OR REPLACE FUNCTION public.make_move(p_id text, p_token text, p_prev_fen text, p_fen text, p_pgn text, p_last jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE s game_seats; g games; turn text;
BEGIN
  SELECT * INTO s FROM game_seats WHERE game_id = p_id;
  SELECT * INTO g FROM games WHERE id = p_id FOR UPDATE;
  IF NOT FOUND OR g.fen <> p_prev_fen THEN RETURN false; END IF;
  turn := split_part(g.fen, ' ', 2);
  IF (turn = 'w' AND s.white_token = p_token) OR (turn = 'b' AND s.black_token = p_token) THEN
    UPDATE games SET fen = p_fen, pgn = p_pgn, last_move = p_last, updated_at = now() WHERE id = p_id;
    RETURN true;
  END IF;
  RETURN false;
END $$;

GRANT EXECUTE ON FUNCTION public.create_game(text,text), public.join_game(text,text), public.make_move(text,text,text,text,text,jsonb) TO anon, authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.games;