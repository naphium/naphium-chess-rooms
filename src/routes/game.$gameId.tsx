import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Chess, type Square, type PieceSymbol, type Move } from "chess.js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { SiteFooter } from "@/components/SiteFooter";
import { Piece } from "@/components/chess/Piece";
import { supabase } from "@/integrations/supabase/client";
import { getPlayerToken, newGameId, saveRole } from "@/lib/session";
import {
  BOARD_THEMES, PIECE_SETS, category, formatClock, getName, playSound, setName as storeName, timeLabel, usePrefs,
} from "@/lib/prefs";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/game/$gameId")({
  head: ({ params }) => ({
    meta: [
      { title: `Game ${params.gameId} — Naphium Chess` },
      { name: "description", content: "Join this live chess match on Naphium Chess. No login needed." },
      { property: "og:title", content: "You're invited to a chess match — Naphium Chess" },
      { property: "og:description", content: "Click to join the game and play in real time." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: GamePage,
});

type Role = "white" | "black" | "spectator";
type GameRow = {
  id: string; fen: string; pgn: string; last_move: { from: string; to: string } | null;
  white_joined: boolean; black_joined: boolean; white_name: string | null; black_name: string | null;
  initial_ms: number; increment_ms: number; white_ms: number; black_ms: number; turn_started_at: string | null; updated_at: string;
  ply: number; status: string; result: string | null; reason: string | null;
  draw_offer: string | null; takeback_offer: string | null; rematch_id: string | null;
};
type ChatMsg = { name: string; text: string; at: number };

const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const START: Record<PieceSymbol, number> = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };
const FILES = "abcdefgh";
const REASONS: Record<string, string> = {
  checkmate: "Checkmate", stalemate: "Stalemate", timeout: "Time out", resignation: "Resignation",
  agreement: "Draw by agreement", repetition: "Threefold repetition", insufficient: "Insufficient material",
  fifty: "50-move rule", aborted: "Game aborted",
};

function fromPgn(pgn: string, fen: string) {
  const c = new Chess();
  if (pgn) c.loadPgn(pgn);
  else c.load(fen);
  return c;
}

function GamePage() {
  const { gameId } = Route.useParams();
  const navigate = useNavigate();
  const [prefs, setPrefs] = usePrefs();
  const [game, setGame] = useState<GameRow | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [missing, setMissing] = useState(false);
  const [needName, setNeedName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [selected, setSelected] = useState<Square | null>(null);
  const [promo, setPromo] = useState<{ from: Square; to: Square } | null>(null);
  const [copied, setCopied] = useState("");
  const [flip, setFlip] = useState(false);
  const [viewPly, setViewPly] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [chat, setChat] = useState<ChatMsg[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [watchers, setWatchers] = useState(1);
  const chatChannel = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const prevPly = useRef<number | null>(null);
  const claimed = useRef(0);
  const skew = useRef(0); // server time minus local time

  async function enter(name: string) {
    const { data: r } = await supabase.rpc("enter_game", { p_id: gameId, p_token: getPlayerToken(), p_name: name });
    if (r === "missing") return setMissing(true);
    const { data } = await supabase.from("games").select("*").eq("id", gameId).maybeSingle();
    if (data) setGame(data as unknown as GameRow);
    setRole(r as Role);
    saveRole(gameId, r as string);
    const g = data as unknown as GameRow | null;
    setNeedName(r === "spectator" && !name && !!g && (!g.white_joined || !g.black_joined));
  }

  useEffect(() => {
    setGame(null);
    setRole(null);
    setViewPly(null);
    setChat([]);
    prevPly.current = null;
    const t0 = Date.now();
    void supabase.rpc("server_now").then(({ data }) => {
      if (data) skew.current = Date.parse(data as string) - (t0 + Date.now()) / 2;
    });
    const n = getName();
    setNameInput(n);
    void enter(""); // never auto-join: always confirm the name first
    const channel = supabase
      .channel(`game-${gameId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${gameId}` }, (p) =>
        setGame((cur) => {
          const n = p.new as GameRow;
          // ignore stale/out-of-order updates
          if (cur && Date.parse(n.updated_at) < Date.parse(cur.updated_at)) return cur;
          return n;
        }),
      )
      .subscribe();
    const room = supabase.channel(`room-${gameId}`, { config: { presence: { key: getPlayerToken() } } });
    room
      .on("broadcast", { event: "chat" }, ({ payload }) => setChat((c) => [...c.slice(-99), payload as ChatMsg]))
      .on("presence", { event: "sync" }, () => setWatchers(Object.keys(room.presenceState()).length))
      .subscribe((s) => {
        if (s === "SUBSCRIBED") void room.track({ at: Date.now() });
      });
    chatChannel.current = room;
    const t = setInterval(() => setNow(Date.now()), 100);
    return () => {
      clearInterval(t);
      supabase.removeChannel(channel);
      supabase.removeChannel(room);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  const chess = useMemo(() => (game ? fromPgn(game.pgn, game.fen) : new Chess()), [game?.fen, game?.pgn]);
  const history = useMemo(() => chess.history({ verbose: true }) as Move[], [chess]);
  const fens = useMemo(() => [history[0]?.before ?? chess.fen(), ...history.map((m) => m.after)], [history, chess]);

  // sounds on new moves
  useEffect(() => {
    if (!game) return;
    if (prevPly.current !== null && game.ply !== prevPly.current && prefs.sound) {
      const last = history[history.length - 1];
      if (game.status === "over") playSound("end");
      else if (chess.inCheck()) playSound("check");
      else playSound(last?.captured ? "capture" : "move");
    }
    if (prevPly.current !== null && game.status === "over" && prefs.sound && game.ply === prevPly.current) playSound("end");
    prevPly.current = game.ply;
    setViewPly(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.ply, game?.status]);

  const myColor = role === "white" ? "w" : role === "black" ? "b" : null;
  const live = viewPly === null;
  const active = game?.status === "active";
  const myTurn = !!myColor && live && active && chess.turn() === myColor;
  const shown = useMemo(() => (live ? chess : new Chess(fens[viewPly!])), [live, chess, fens, viewPly]);
  const targets = useMemo(
    () => (selected ? chess.moves({ square: selected, verbose: true }).map((m) => m.to) : []),
    [selected, chess],
  );

  // clocks
  const clockRunning = !!game && active && game.initial_ms > 0 && game.ply >= 2 && !!game.turn_started_at;
  const elapsed = clockRunning ? Math.max(0, now + skew.current - Date.parse(game!.turn_started_at!)) : 0;
  const clockFor = (c: "w" | "b") => {
    if (!game) return 0;
    const base = c === "w" ? game.white_ms : game.black_ms;
    return clockRunning && chess.turn() === c ? base - elapsed : base;
  };
  const turnMs = clockFor(chess.turn());
  useEffect(() => {
    if (clockRunning && turnMs <= 0 && Date.now() - claimed.current > 1500) {
      claimed.current = Date.now();
      void supabase.rpc("claim_timeout", { p_id: gameId }).then(() => undefined);
    }
  }, [clockRunning, turnMs, gameId]);

  const captured = useMemo(() => {
    const counts: Record<string, number> = {};
    shown.board().flat().forEach((p) => p && (counts[p.color + p.type] = (counts[p.color + p.type] ?? 0) + 1));
    const lost = (color: "w" | "b") =>
      (Object.keys(START) as PieceSymbol[]).flatMap((t) =>
        Array(Math.max(0, START[t] - (counts[color + t] ?? 0))).fill(t) as PieceSymbol[],
      );
    return { w: lost("b"), b: lost("w") }; // pieces captured BY color
  }, [shown]);
  const score = (a: PieceSymbol[]) => a.reduce((s, t) => s + VALUE[t], 0);

  async function commit(from: Square, to: Square, promotion?: string) {
    if (!game) return;
    const next = fromPgn(game.pgn, game.fen);
    try {
      next.move(promotion ? { from, to, promotion } : { from, to });
    } catch {
      return;
    }
    let result: string | null = null;
    let reason: string | null = null;
    if (next.isCheckmate()) { result = next.turn() === "w" ? "0-1" : "1-0"; reason = "checkmate"; }
    else if (next.isStalemate()) { result = "1/2-1/2"; reason = "stalemate"; }
    else if (next.isInsufficientMaterial()) { result = "1/2-1/2"; reason = "insufficient"; }
    else if (next.isThreefoldRepetition()) { result = "1/2-1/2"; reason = "repetition"; }
    else if (next.isDraw()) { result = "1/2-1/2"; reason = "fifty"; }
    const prev = game;
    // optimistic: stop my clock immediately and start the opponent's
    const mover = game.fen.split(" ")[1] as "w" | "b";
    const timed = game.initial_ms > 0;
    const spent = timed && game.ply >= 2 && game.turn_started_at
      ? Math.max(0, Date.now() + skew.current - Date.parse(game.turn_started_at)) : 0;
    const bonus = timed && game.ply >= 2 ? game.increment_ms : 0;
    const key = mover === "w" ? "white_ms" : "black_ms";
    setGame({
      ...game, fen: next.fen(), pgn: next.pgn(), last_move: { from, to }, ply: game.ply + 1,
      turn_started_at: new Date(Date.now() + skew.current).toISOString(),
      [key]: timed ? game[key] - spent + bonus : game[key],
      ...(result ? { status: "over", result, reason } : {}),
    });
    const { data } = await supabase.rpc("play_move", {
      p_id: gameId, p_token: getPlayerToken(), p_prev_fen: prev.fen, p_fen: next.fen(), p_pgn: next.pgn(),
      p_last: { from, to }, p_result: result as string, p_reason: reason as string,
    });
    if (!data) {
      const { data: fresh } = await supabase.from("games").select("*").eq("id", gameId).maybeSingle();
      setGame((fresh as unknown as GameRow) ?? prev);
    }
  }

  function tryMove(from: Square, to: Square) {
    const mover = chess.get(from);
    setSelected(null);
    if (!chess.moves({ square: from, verbose: true }).some((m) => m.to === to)) return;
    if (mover?.type === "p" && (to[1] === "8" || to[1] === "1")) {
      if (prefs.autoQueen) return commit(from, to, "q");
      return setPromo({ from, to });
    }
    void commit(from, to);
  }

  function onSquare(sq: Square) {
    if (!myTurn) return;
    if (selected && targets.includes(sq)) return tryMove(selected, sq);
    const piece = chess.get(sq);
    setSelected(piece && piece.color === myColor && selected !== sq ? sq : null);
  }

  const action = async (a: string) => {
    await supabase.rpc("game_action", { p_id: gameId, p_token: getPlayerToken(), p_action: a });
  };

  async function acceptTakeback() {
    if (!game || !game.takeback_offer) return;
    const undo = chess.turn() === game.takeback_offer ? 2 : 1;
    const c = fromPgn(game.pgn, game.fen);
    for (let i = 0; i < undo && c.history().length; i++) c.undo();
    const h = c.history({ verbose: true }) as Move[];
    const last = h[h.length - 1];
    await supabase.rpc("accept_takeback", {
      p_id: gameId, p_token: getPlayerToken(), p_fen: c.fen(), p_pgn: c.pgn(), p_ply: h.length,
      p_last: (last ? { from: last.from, to: last.to } : null) as never,
    });
  }

  async function rematch() {
    const { data } = await supabase.rpc("request_rematch", { p_id: gameId, p_token: getPlayerToken(), p_new_id: newGameId() });
    if (data) navigate({ to: "/game/$gameId", params: { gameId: data } });
  }

  function sendChat(e: React.FormEvent) {
    e.preventDefault();
    const text = chatInput.trim().slice(0, 200);
    if (!text) return;
    const msg = { name: getName() || "Spectator", text, at: Date.now() };
    void chatChannel.current?.send({ type: "broadcast", event: "chat", payload: msg });
    setChat((c) => [...c.slice(-99), msg]);
    setChatInput("");
  }

  function copy(text: string, label: string) {
    void navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 1500);
  }

  function downloadPgn() {
    if (!game) return;
    const c = fromPgn(game.pgn, game.fen);
    c.setHeader("Event", "Naphium Chess casual game");
    c.setHeader("White", game.white_name ?? "White");
    c.setHeader("Black", game.black_name ?? "Black");
    c.setHeader("TimeControl", game.initial_ms ? `${game.initial_ms / 1000}+${game.increment_ms / 1000}` : "-");
    c.setHeader("Result", game.result ?? "*");
    const blob = new Blob([c.pgn()], { type: "application/x-chess-pgn" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `naphium-${gameId}.pgn`;
    a.click();
  }

  // keyboard navigation through moves
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      const cur = viewPly ?? history.length;
      if (e.key === "ArrowLeft") setViewPly(Math.max(0, cur - 1));
      else if (e.key === "ArrowRight") setViewPly(cur + 1 >= history.length ? null : cur + 1);
      else if (e.key === "ArrowUp") setViewPly(0);
      else if (e.key === "ArrowDown") setViewPly(null);
      else if (e.key === "f") setFlip((f) => !f);
      else return;
      e.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewPly, history.length]);

  if (missing)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
        <h1 className="text-3xl">Game not found</h1>
        <Button asChild><Link to="/">Back home</Link></Button>
      </div>
    );

  const flipped = (role === "black") !== flip;
  const ranks = flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const files = flipped ? FILES.split("").reverse() : FILES.split("");
  const checkSq = shown.inCheck()
    ? (shown.board().flat().find((p) => p?.type === "k" && p.color === shown.turn())?.square ?? null)
    : null;
  const lastMove = live ? game?.last_move : viewPly ? history[viewPly - 1] : null;

  const top: "w" | "b" = flipped ? "w" : "b";
  const bottom: "w" | "b" = flipped ? "b" : "w";
  const opp = myColor === "w" ? "b" : "w";

  let status = "";
  if (!game) status = "Loading…";
  else if (game.status === "over")
    status = game.result === "1-0" ? "White wins" : game.result === "0-1" ? "Black wins" : game.result === "*" ? "Aborted" : "Draw";
  else if (game.status === "waiting") status = "Waiting for an opponent…";
  else status = `${chess.turn() === "w" ? "White" : "Black"} to move${chess.inCheck() ? " — check!" : ""}`;

  const PlayerBar = ({ c }: { c: "w" | "b" }) => {
    const name = (c === "w" ? game?.white_name : game?.black_name) ?? (c === "w" ? "Waiting…" : "Waiting…");
    const joined = c === "w" ? game?.white_joined : game?.black_joined;
    const caps = captured[c];
    const adv = score(caps) - score(captured[c === "w" ? "b" : "w"]);
    const ms = clockFor(c);
    const running = clockRunning && chess.turn() === c;
    return (
      <div className="flex items-center justify-between gap-3 py-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn("h-3 w-3 shrink-0 rounded-full border border-border", c === "w" ? "bg-piece-white" : "bg-piece-black")} />
            <span className={cn("truncate font-medium", !joined && "text-muted-foreground")}>{name}</span>
            {myColor === c && <span className="text-xs text-primary">(you)</span>}
          </div>
          <div className="flex h-5 items-center">
            {caps.map((t, i) => (
              <Piece key={i} set={prefs.pieceSet} color={c === "w" ? "b" : "w"} type={t} className="-mr-1.5 h-5 w-5 text-lg" />
            ))}
            {adv > 0 && <span className="ml-2.5 text-xs text-muted-foreground">+{adv}</span>}
          </div>
        </div>
        {game && game.initial_ms > 0 && (
          <div
            className={cn(
              "rounded-md px-3 py-1.5 font-mono text-2xl tabular-nums",
              running ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground",
              running && ms < 20000 && "bg-destructive text-destructive-foreground animate-low-time",
            )}
          >
            {formatClock(ms)}
          </div>
        )}
      </div>
    );
  };

  const pairs = history.reduce<Move[][]>((a, m, i) => (i % 2 ? a[a.length - 1]!.push(m) : a.push([m]), a), []);
  const curView = viewPly ?? history.length;

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-4 py-4">
        <Link to="/" className="font-display text-2xl">Naphium <span className="italic text-primary">Chess</span></Link>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {game && <span className="hidden sm:inline">{timeLabel(game.initial_ms, game.increment_ms)} · {category(game.initial_ms, game.increment_ms)}</span>}
          <span className="rounded-full border border-border px-2 py-0.5 font-mono text-xs">{gameId}</span>
          <span title="People here">👁 {watchers}</span>
        </div>
      </header>

      <main className="mx-auto grid w-full max-w-7xl flex-1 gap-6 px-4 lg:grid-cols-[1fr_340px] xl:grid-cols-[280px_1fr_340px]">
        {/* chat (left on xl) */}
        <aside className="order-3 flex flex-col rounded-lg border border-border bg-card xl:order-1 xl:max-h-[720px]">
          <p className="border-b border-border px-4 py-3 text-xs uppercase tracking-widest text-muted-foreground">Chat</p>
          <div className="min-h-40 flex-1 space-y-1.5 overflow-auto px-4 py-3 text-sm">
            {chat.length === 0 && <p className="text-muted-foreground">Say hi to your opponent 👋</p>}
            {chat.map((m, i) => (
              <p key={i}><b className="text-primary">{m.name}:</b> {m.text}</p>
            ))}
          </div>
          <form onSubmit={sendChat} className="flex gap-2 border-t border-border p-3">
            <Input value={chatInput} onChange={(e) => setChatInput(e.target.value)} placeholder="Message…" maxLength={200} />
          </form>
        </aside>

        {/* board */}
        <div className="order-1 mx-auto w-full max-w-[680px] xl:order-2">
          <PlayerBar c={top} />
          <div
            className={cn("board-" + prefs.board, "relative grid aspect-square grid-cols-8 grid-rows-8 overflow-hidden rounded-sm shadow-board")}
          >
            {ranks.map((r, ri) =>
              files.map((f, fi) => {
                const sq = `${f}${r}` as Square;
                const p = shown.get(sq);
                const dark = (FILES.indexOf(f) + r) % 2 === 0;
                const isLast = lastMove && (lastMove.from === sq || lastMove.to === sq);
                const isTarget = prefs.showMoves && targets.includes(sq);
                return (
                  <div
                    key={sq}
                    role="button"
                    onClick={() => onSquare(sq)}
                    onDragOver={(e) => myTurn && e.preventDefault()}
                    onDrop={(e) => { e.preventDefault(); if (selected) tryMove(selected, sq); }}
                    className={cn("relative flex cursor-pointer items-center justify-center", dark ? "bg-sq-dark" : "bg-sq-light")}
                  >
                    {(isLast || selected === sq) && <span className="absolute inset-0 bg-sq-hl" />}
                    {checkSq === sq && <span className="absolute inset-0 bg-sq-check" />}
                    {p && (
                      <span
                        draggable={myTurn && p.color === myColor}
                        onDragStart={() => setSelected(sq)}
                        className="relative flex h-full w-full items-center justify-center"
                      >
                        <Piece set={prefs.pieceSet} color={p.color} type={p.type} className="h-[92%] w-[92%] text-[min(9vw,64px)] flex items-center justify-center" />
                      </span>
                    )}
                    {isTarget && (
                      <span className={cn("pointer-events-none absolute rounded-full", p ? "inset-1 border-4 border-primary/70" : "h-1/4 w-1/4 bg-primary/60")} />
                    )}
                    {prefs.coords && fi === 0 && <span className={cn("pointer-events-none absolute left-1 top-0.5 text-[10px] font-semibold", dark ? "text-sq-light" : "text-sq-dark")}>{r}</span>}
                    {prefs.coords && ri === 7 && <span className={cn("pointer-events-none absolute bottom-0.5 right-1 text-[10px] font-semibold", dark ? "text-sq-light" : "text-sq-dark")}>{f}</span>}
                  </div>
                );
              }),
            )}
            {promo && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-sm">
                <div className="flex gap-2 rounded-lg bg-card p-3">
                  {(["q", "r", "b", "n"] as PieceSymbol[]).map((t) => (
                    <button key={t} onClick={() => { void commit(promo.from, promo.to, t); setPromo(null); }} className="flex h-16 w-16 items-center justify-center rounded-md bg-secondary text-5xl hover:bg-accent">
                      <Piece set={prefs.pieceSet} color={myColor ?? "w"} type={t} className="h-14 w-14" />
                    </button>
                  ))}
                </div>
              </div>
            )}
            {needName && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80 backdrop-blur-sm">
                <form
                  onSubmit={(e) => { e.preventDefault(); if (!nameInput.trim()) return; storeName(nameInput); void enter(nameInput.trim()); }}
                  className="w-72 rounded-lg bg-card p-5 text-center"
                >
                  <h2 className="text-2xl">Join this game</h2>
                  <p className="mt-1 text-sm text-muted-foreground">Enter a name to take the open seat.</p>
                  <Input autoFocus className="mt-4" value={nameInput} maxLength={24} onChange={(e) => setNameInput(e.target.value)} placeholder="Your name" />
                  <Button type="submit" className="mt-3 w-full">Play</Button>
                  <button type="button" onClick={() => setNeedName(false)} className="mt-2 text-xs text-muted-foreground hover:underline">Just watch</button>
                </form>
              </div>
            )}
          </div>
          <PlayerBar c={bottom} />
        </div>

        {/* side panel */}
        <aside className="order-2 flex flex-col gap-3 xl:order-3">
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">
                {role === "spectator" ? "Spectating" : role ? `You play ${role}` : "…"}
              </span>
              <SettingsMenu prefs={prefs} setPrefs={setPrefs} />
            </div>
            <p className="mt-2 font-display text-2xl">{status}</p>
            {game?.status === "over" && game.reason && <p className="text-sm text-muted-foreground">{REASONS[game.reason] ?? game.reason} · {game.result}</p>}
            {myTurn && <p className="mt-1 text-sm text-primary">Your move</p>}
            {!live && <p className="mt-1 text-sm text-primary">Reviewing move {viewPly} — press ↓ to return</p>}

            {/* offers */}
            {active && myColor && game?.draw_offer === opp && (
              <div className="mt-3 rounded-md bg-secondary p-3 text-sm">
                Opponent offers a draw
                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={() => action("offer_draw")}>Accept</Button>
                  <Button size="sm" variant="outline" onClick={() => action("decline_draw")}>Decline</Button>
                </div>
              </div>
            )}
            {active && myColor && game?.takeback_offer === opp && (
              <div className="mt-3 rounded-md bg-secondary p-3 text-sm">
                Opponent asks for a takeback
                <div className="mt-2 flex gap-2">
                  <Button size="sm" onClick={acceptTakeback}>Accept</Button>
                  <Button size="sm" variant="outline" onClick={() => action("decline_takeback")}>Decline</Button>
                </div>
              </div>
            )}
            {active && myColor && game?.draw_offer === myColor && <p className="mt-3 text-sm text-muted-foreground">Draw offer sent…</p>}
            {active && myColor && game?.takeback_offer === myColor && (
              <p className="mt-3 text-sm text-muted-foreground">
                Takeback requested… <button className="text-primary hover:underline" onClick={() => action("cancel_takeback")}>cancel</button>
              </p>
            )}

            {active && myColor && (
              <div className="mt-4 grid grid-cols-3 gap-2">
                <Button size="sm" variant="secondary" disabled={!game?.ply || !!game?.takeback_offer} onClick={() => action("offer_takeback")} title="Request takeback">↶ Takeback</Button>
                <Button size="sm" variant="secondary" disabled={game?.draw_offer === myColor} onClick={() => action("offer_draw")}>½ Draw</Button>
                {game && game.ply < 2 ? (
                  <Button size="sm" variant="secondary" onClick={() => action("abort")}>✕ Abort</Button>
                ) : (
                  <Button size="sm" variant="secondary" onClick={() => confirm("Resign this game?") && action("resign")}>⚑ Resign</Button>
                )}
              </div>
            )}
            {game?.status === "over" && myColor && game.result !== "*" && (
              <Button className="mt-4 w-full" onClick={rematch}>{game.rematch_id ? "Join rematch" : "Rematch"}</Button>
            )}
            {game?.status === "over" && game.rematch_id && !myColor && (
              <Button variant="secondary" className="mt-4 w-full" asChild>
                <Link to="/game/$gameId" params={{ gameId: game.rematch_id }}>Watch rematch</Link>
              </Button>
            )}
          </div>

          <Button onClick={() => copy(window.location.href, "link")} size="lg">{copied === "link" ? "Link copied!" : "Copy Invite Link"}</Button>

          <div className="rounded-lg border border-border bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-2">
              <span className="text-xs uppercase tracking-widest text-muted-foreground">Moves</span>
              <div className="flex gap-1">
                {[
                  ["⏮", () => setViewPly(0)],
                  ["◀", () => setViewPly(Math.max(0, curView - 1))],
                  ["▶", () => setViewPly(curView + 1 >= history.length ? null : curView + 1)],
                  ["⏭", () => setViewPly(null)],
                  ["⇅", () => setFlip((f) => !f)],
                ].map(([l, fn]) => (
                  <button key={l as string} onClick={fn as () => void} className="rounded px-2 py-1 text-sm hover:bg-accent">{l as string}</button>
                ))}
              </div>
            </div>
            <ol className="max-h-72 overflow-auto px-2 py-2 font-mono text-sm">
              {pairs.map((pair, i) => (
                <li key={i} className="grid grid-cols-[2.25rem_1fr_1fr]">
                  <span className="px-1 text-muted-foreground">{i + 1}.</span>
                  {pair.map((m, j) => {
                    const ply = i * 2 + j + 1;
                    return (
                      <button key={j} onClick={() => setViewPly(ply === history.length ? null : ply)} className={cn("rounded px-1 text-left hover:bg-accent", curView === ply && "bg-primary/20 text-primary")}>
                        {m.san}
                      </button>
                    );
                  })}
                </li>
              ))}
              {!history.length && <li className="px-1 text-muted-foreground">No moves yet</li>}
            </ol>
            <div className="flex gap-2 border-t border-border p-2">
              <Button size="sm" variant="ghost" onClick={() => copy(chess.pgn(), "pgn")}>{copied === "pgn" ? "Copied" : "Copy PGN"}</Button>
              <Button size="sm" variant="ghost" onClick={() => copy(shown.fen(), "fen")}>{copied === "fen" ? "Copied" : "Copy FEN"}</Button>
              <Button size="sm" variant="ghost" onClick={downloadPgn}>Download</Button>
            </div>
          </div>
        </aside>
      </main>
      <SiteFooter />
    </div>
  );
}

function SettingsMenu({ prefs, setPrefs }: { prefs: ReturnType<typeof usePrefs>[0]; setPrefs: ReturnType<typeof usePrefs>[1] }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="rounded px-2 py-1 text-sm text-muted-foreground hover:bg-accent" aria-label="Board settings">⚙ Settings</button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">Pieces</p>
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {PIECE_SETS.map((s) => (
            <button key={s.id} onClick={() => setPrefs({ pieceSet: s.id })} title={s.label}
              className={cn("flex flex-col items-center rounded-md border p-1", prefs.pieceSet === s.id ? "border-primary bg-primary/15" : "border-border hover:bg-accent")}>
              <Piece set={s.id} color="w" type="n" className="h-9 w-9 text-3xl" />
              <span className="text-[10px]">{s.label}</span>
            </button>
          ))}
        </div>
        <p className="mt-4 text-xs uppercase tracking-widest text-muted-foreground">Board</p>
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {BOARD_THEMES.map((t) => (
            <button key={t.id} onClick={() => setPrefs({ board: t.id })}
              className={cn("rounded-md border p-1 text-[11px]", prefs.board === t.id ? "border-primary" : "border-border hover:bg-accent")}>
              <div className={cn("board-" + t.id, "mb-1 grid h-8 grid-cols-4 overflow-hidden rounded-sm")}>
                {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => <span key={i} className={(i + Math.floor(i / 4)) % 2 ? "bg-sq-dark" : "bg-sq-light"} />)}
              </div>
              {t.label}
            </button>
          ))}
        </div>
        <div className="mt-4 space-y-2 text-sm">
          {([
            ["sound", "Sounds"],
            ["coords", "Coordinates"],
            ["showMoves", "Show legal moves"],
            ["autoQueen", "Auto-promote to queen"],
          ] as const).map(([k, l]) => (
            <label key={k} className="flex items-center justify-between">
              {l}
              <Switch checked={prefs[k]} onCheckedChange={(v) => setPrefs({ [k]: v })} />
            </label>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
