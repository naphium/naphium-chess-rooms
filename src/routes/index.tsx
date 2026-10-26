import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { SiteFooter } from "@/components/SiteFooter";
import { supabase } from "@/integrations/supabase/client";
import { getPlayerToken, newGameId, saveRole } from "@/lib/session";
import { category, getName, setName as storeName, timeLabel } from "@/lib/prefs";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Naphium Chess — Play chess with a friend, no login" },
      { name: "description", content: "Pick a time control, share the link, and play live chess. No sign-up required." },
      { property: "og:title", content: "Naphium Chess" },
      { property: "og:description", content: "Real-time multiplayer chess with clocks, takebacks and themes. No login." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const PRESETS: [number, number][] = [
  [1, 0], [2, 1], [3, 0], [3, 2], [5, 0], [5, 3], [10, 0], [10, 5], [15, 10], [30, 0], [30, 20], [0, 0],
];
const MINUTE_STEPS = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20, 25, 30, 40, 45, 60, 90, 120, 180];

function Index() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [preset, setPreset] = useState<number>(6);
  const [custom, setCustom] = useState(false);
  const [minIdx, setMinIdx] = useState(12);
  const [inc, setInc] = useState(0);
  const [color, setColor] = useState<"w" | "random" | "b">("random");
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  useEffect(() => setName(getName()), []);

  const [minutes, incSec] = custom ? [MINUTE_STEPS[minIdx]!, inc] : PRESETS[preset]!;
  const initialMs = Math.round(minutes * 60000);
  const incMs = incSec * 1000;

  async function create() {
    if (!name.trim()) return setError("Enter your name first.");
    setBusy(true);
    setError("");
    storeName(name);
    const id = newGameId();
    const { data, error } = await supabase.rpc("new_game", {
      p_id: id, p_token: getPlayerToken(), p_name: name.trim(), p_color: color, p_initial: initialMs, p_inc: incMs,
    });
    if (error) {
      setError("Couldn't create a game. Please try again.");
      setBusy(false);
      return;
    }
    saveRole(id, data === "w" ? "white" : "black");
    navigate({ to: "/game/$gameId", params: { gameId: id } });
  }

  function join(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim()) storeName(name);
    const id = code.trim().toLowerCase().split("/").pop();
    if (id) navigate({ to: "/game/$gameId", params: { gameId: id } });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto grid w-full max-w-6xl flex-1 items-center gap-12 px-4 pt-16 lg:grid-cols-[1fr_440px]">
        <div>
          <div className="mb-4 text-6xl piece-white select-none">♞</div>
          <h1 className="text-5xl font-semibold tracking-tight md:text-7xl">
            Naphium <span className="italic text-primary">Chess</span>
          </h1>
          <p className="mt-5 max-w-md text-lg text-muted-foreground">
            Live chess with clocks, takebacks, draw offers, chat and rematches. Just pick a name and share the link.
          </p>
          <form onSubmit={join} className="mt-10 flex max-w-sm gap-2">
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Have a code? e.g. k7m2p" />
            <Button type="submit" variant="secondary">Join</Button>
          </form>
        </div>

        <div className="rounded-xl border border-border bg-card p-6">
          <label className="text-xs uppercase tracking-widest text-muted-foreground">Your name</label>
          <Input className="mt-2" value={name} maxLength={24} onChange={(e) => setName(e.target.value)} placeholder="e.g. Magnus" />

          <div className="mt-6 flex items-center justify-between">
            <span className="text-xs uppercase tracking-widest text-muted-foreground">Time control</span>
            <button onClick={() => setCustom(!custom)} className="text-xs text-primary hover:underline">
              {custom ? "Use presets" : "Custom"}
            </button>
          </div>
          {!custom ? (
            <div className="mt-3 grid grid-cols-3 gap-2">
              {PRESETS.map(([m, i], idx) => (
                <button
                  key={idx}
                  onClick={() => setPreset(idx)}
                  className={cn(
                    "rounded-md border px-2 py-3 text-center transition-colors",
                    preset === idx ? "border-primary bg-primary/15" : "border-border bg-secondary hover:bg-accent",
                  )}
                >
                  <div className="font-display text-lg">{m ? `${m}+${i}` : "∞"}</div>
                  <div className="text-[11px] text-muted-foreground">{category(m * 60000, i * 1000)}</div>
                </button>
              ))}
            </div>
          ) : (
            <div className="mt-4 space-y-5">
              <div>
                <div className="mb-2 flex justify-between text-sm"><span>Minutes per side</span><b>{MINUTE_STEPS[minIdx]}</b></div>
                <Slider value={[minIdx]} min={0} max={MINUTE_STEPS.length - 1} step={1} onValueChange={(v) => setMinIdx(v[0]!)} />
              </div>
              <div>
                <div className="mb-2 flex justify-between text-sm"><span>Increment (seconds)</span><b>{inc}</b></div>
                <Slider value={[inc]} min={0} max={60} step={1} onValueChange={(v) => setInc(v[0]!)} />
              </div>
            </div>
          )}
          <p className="mt-3 text-sm text-muted-foreground">
            {timeLabel(initialMs, incMs)} · {category(initialMs, incMs)}
          </p>

          <span className="mt-6 block text-xs uppercase tracking-widest text-muted-foreground">Play as</span>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {(["w", "random", "b"] as const).map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={cn("rounded-md border py-2 text-sm", color === c ? "border-primary bg-primary/15" : "border-border bg-secondary hover:bg-accent")}
              >
                {c === "w" ? "♔ White" : c === "b" ? "♚ Black" : "⚄ Random"}
              </button>
            ))}
          </div>

          <Button size="lg" className="mt-6 h-12 w-full text-base" onClick={create} disabled={busy}>
            {busy ? "Creating…" : "Create Game"}
          </Button>
          {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
