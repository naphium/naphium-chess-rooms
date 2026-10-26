import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Chess, type Square, type PieceSymbol } from "chess.js";
import { Button } from "@/components/ui/button";
import { SiteFooter } from "@/components/SiteFooter";
import { supabase } from "@/integrations/supabase/client";
import { getPlayerToken, saveRole } from "@/lib/session";
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
type GameRow = { id: string; fen: string; pgn: string; last_move: { from: string; to: string } | null; black_joined: boolean };

const GLYPH: Record<PieceSymbol, string> = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };
const VALUE: Record<PieceSymbol, number> = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
const START: Record<PieceSymbol, number> = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };
const FILES = "abcdefgh";

function GamePage() {
  const { gameId } = Route.useParams();
  const [game, setGame] = useState<GameRow | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [missing, setMissing] = useState(false);
  const [selected, setSelected] = useState<Square | null>(null);
  const [promo, setPromo] = useState<{ from: Square; to: Square } | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const cached = localStorage.getItem(`naphium:role:${gameId}`) as Role | null;
    if (cached) setRole(cached);
    let active = true;
    (async () => {
      const { data: r } = await supabase.rpc("join_game", { p_id: gameId, p_token: getPlayerToken() });
      if (!active) return;
      if (r === "missing") return setMissing(true);
      setRole(r as Role);
      saveRole(gameId, r as string);
      const { data } = await supabase.from("games").select("*").eq("id", gameId).maybeSingle();
      if (active && data) setGame(data as unknown as GameRow);
    })();
    const channel = supabase
      .channel(`game-${gameId}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "games", filter: `id=eq.${gameId}` }, (p) =>
        setGame(p.new as GameRow),
      )
      .subscribe();
    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [gameId]);

  const chess = useMemo(() => {
    const c = new Chess();
    if (game?.pgn) c.loadPgn(game.pgn);
    else if (game) c.load(game.fen);
    return c;
  }, [game?.fen, game?.pgn]);

  const myColor = role === "white" ? "w" : role === "black" ? "b" : null;
  const myTurn = !!myColor && chess.turn() === myColor && !chess.isGameOver() && !!game?.black_joined;
  const targets = useMemo(
    () => (selected ? chess.moves({ square: selected, verbose: true }).map((m) => m.to) : []),
    [selected, chess],
  );

  const captured = useMemo(() => {
    const counts: Record<string, number> = {};
    chess.board().flat().forEach((p) => p && (counts[p.color + p.type] = (counts[p.color + p.type] ?? 0) + 1));
    const lost = (color: "w" | "b") =>
      (Object.keys(START) as PieceSymbol[]).flatMap((t) =>
        Array(Math.max(0, START[t] - (counts[color + t] ?? 0))).fill(t) as PieceSymbol[],
      );
    return { byWhite: lost("b"), byBlack: lost("w") };
  }, [chess]);
  const score = (a: PieceSymbol[]) => a.reduce((s, t) => s + VALUE[t], 0);

  async function commit(from: Square, to: Square, promotion?: string) {
    if (!game) return;
    const next = new Chess();
    if (game.pgn) next.loadPgn(game.pgn);
    else next.load(game.fen);
    try {
      next.move({ from, to, promotion });
    } catch {
      return;
    }
    const prev = game;
    const optimistic = { ...game, fen: next.fen(), pgn: next.pgn(), last_move: { from, to } };
    setGame(optimistic);
    const { data } = await supabase.rpc("make_move", {
      p_id: gameId,
      p_token: getPlayerToken(),
      p_prev_fen: prev.fen,
      p_fen: optimistic.fen,
      p_pgn: optimistic.pgn,
      p_last: { from, to },
    });
    if (!data) setGame(prev);
  }

  function onSquare(sq: Square) {
    if (!myTurn) return;
    const piece = chess.get(sq);
    if (selected && targets.includes(sq)) {
      const mover = chess.get(selected);
      setSelected(null);
      if (mover?.type === "p" && (sq[1] === "8" || sq[1] === "1")) return setPromo({ from: selected, to: sq });
      return commit(selected, sq);
    }
    setSelected(piece && piece.color === myColor ? sq : null);
  }

  function copy() {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (missing)
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 text-center">
        <h1 className="text-3xl">Game not found</h1>
        <Button asChild><Link to="/">Back home</Link></Button>
      </div>
    );

  const flipped = role === "black";
  const ranks = flipped ? [1, 2, 3, 4, 5, 6, 7, 8] : [8, 7, 6, 5, 4, 3, 2, 1];
  const files = flipped ? FILES.split("").reverse() : FILES.split("");
  const checkSq = chess.inCheck()
    ? (chess.board().flat().find((p) => p?.type === "k" && p.color === chess.turn())?.square ?? null)
    : null;

  let status = "";
  if (!game) status = "Loading…";
  else if (chess.isCheckmate()) status = `Checkmate — ${chess.turn() === "w" ? "Black" : "White"} wins`;
  else if (chess.isStalemate()) status = "Stalemate — draw";
  else if (chess.isDraw()) status = "Draw";
  else if (!game.black_joined) status = "Waiting for an opponent to join…";
  else status = `${chess.turn() === "w" ? "White" : "Black"} to move${chess.inCheck() ? " — check!" : ""}`;

  const topCaps = flipped ? captured.byWhite : captured.byBlack;
  const bottomCaps = flipped ? captured.byBlack : captured.byWhite;
  const CapRow = ({ pieces, cls, adv }: { pieces: PieceSymbol[]; cls: string; adv: number }) => (
    <div className="flex h-8 items-center gap-0.5 text-2xl">
      {pieces.map((t, i) => <span key={i} className={cls}>{GLYPH[t]}</span>)}
      {adv > 0 && <span className="ml-2 text-sm text-muted-foreground">+{adv}</span>}
    </div>
  );
  const topScore = score(topCaps) - score(bottomCaps);

  return (
    <div className="flex min-h-screen flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5">
        <Link to="/" className="font-display text-2xl">Naphium <span className="italic text-primary">Chess</span></Link>
        <span className="rounded-full border border-border px-3 py-1 font-mono text-sm text-muted-foreground">{gameId}</span>
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-8 px-4 lg:grid-cols-[1fr_320px]">
        <div className="mx-auto w-full max-w-[640px]">
          <CapRow pieces={topCaps} cls={flipped ? "piece-black" : "piece-white"} adv={topScore} />
          <div className="relative mt-2 grid aspect-square grid-cols-8 overflow-hidden rounded-sm shadow-board">
            {ranks.map((r, ri) =>
              files.map((f, fi) => {
                const sq = `${f}${r}` as Square;
                const p = chess.get(sq);
                const dark = (FILES.indexOf(f) + r) % 2 === 0;
                const last = game?.last_move && (game.last_move.from === sq || game.last_move.to === sq);
                const isTarget = targets.includes(sq);
                return (
                  <button
                    key={sq}
                    onClick={() => onSquare(sq)}
                    className={cn("relative flex items-center justify-center", dark ? "bg-sq-dark" : "bg-sq-light")}
                  >
                    {(last || selected === sq) && <span className="absolute inset-0 bg-sq-hl" />}
                    {checkSq === sq && <span className="absolute inset-0 bg-sq-check" />}
                    {p && (
                      <span className={cn("relative select-none text-[min(9vw,64px)] leading-none", p.color === "w" ? "piece-white" : "piece-black")}>
                        {GLYPH[p.type]}
                      </span>
                    )}
                    {isTarget && (
                      <span className={cn("absolute rounded-full", p ? "inset-1 border-4 border-primary/70" : "h-1/4 w-1/4 bg-primary/70")} />
                    )}
                    {fi === 0 && <span className={cn("absolute left-1 top-0.5 text-[10px] font-semibold", dark ? "text-sq-light" : "text-sq-dark")}>{r}</span>}
                    {ri === 7 && <span className={cn("absolute bottom-0.5 right-1 text-[10px] font-semibold", dark ? "text-sq-light" : "text-sq-dark")}>{f}</span>}
                  </button>
                );
              }),
            )}
            {promo && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/70 backdrop-blur-sm">
                <div className="flex gap-2 rounded-lg bg-card p-3">
                  {(["q", "r", "b", "n"] as PieceSymbol[]).map((t) => (
                    <button
                      key={t}
                      onClick={() => { commit(promo.from, promo.to, t); setPromo(null); }}
                      className={cn("h-16 w-16 rounded-md bg-secondary text-5xl hover:bg-accent", myColor === "w" ? "piece-white" : "piece-black")}
                    >
                      {GLYPH[t]}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          <div className="mt-2"><CapRow pieces={bottomCaps} cls={flipped ? "piece-white" : "piece-black"} adv={-topScore} /></div>
        </div>

        <aside className="flex flex-col gap-4">
          <div className="rounded-lg border border-border bg-card p-5">
            <p className="text-xs uppercase tracking-widest text-muted-foreground">You are</p>
            <p className="mt-1 font-display text-2xl capitalize">{role ?? "…"}</p>
            <div className="mt-4 flex items-center gap-3">
              <span className={cn("h-4 w-4 rounded-full border border-border", chess.turn() === "w" ? "bg-piece-white" : "bg-piece-black")} />
              <span className="text-sm">{status}</span>
            </div>
            {myTurn && <p className="mt-2 text-sm text-primary">Your move</p>}
          </div>
          <Button onClick={copy} size="lg">{copied ? "Link copied!" : "Copy Invite Link"}</Button>
          <div className="rounded-lg border border-border bg-card p-5">
            <p className="mb-2 text-xs uppercase tracking-widest text-muted-foreground">Moves</p>
            <ol className="max-h-64 overflow-auto font-mono text-sm">
              {chess.history().reduce<string[][]>((a, m, i) => (i % 2 ? a[a.length - 1].push(m) : a.push([m]), a), []).map((pair, i) => (
                <li key={i} className="grid grid-cols-[2rem_1fr_1fr]">
                  <span className="text-muted-foreground">{i + 1}.</span><span>{pair[0]}</span><span>{pair[1]}</span>
                </li>
              ))}
            </ol>
          </div>
        </aside>
      </main>
      <SiteFooter />
    </div>
  );
}
