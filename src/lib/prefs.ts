import { useEffect, useState } from "react";

export const PIECE_SETS = [
  { id: "cburnett", label: "Classic" },
  { id: "merida", label: "Merida" },
  { id: "alpha", label: "Alpha" },
  { id: "california", label: "California" },
  { id: "cardinal", label: "Cardinal" },
  { id: "staunty", label: "Staunty" },
  { id: "maestro", label: "Maestro" },
  { id: "fresca", label: "Fresca" },
  { id: "tatiana", label: "Tatiana" },
  { id: "pixel", label: "Pixel" },
  { id: "unicode", label: "Glyphs" },
] as const;

export const BOARD_THEMES = [
  { id: "brown", label: "Walnut" },
  { id: "green", label: "Tournament" },
  { id: "blue", label: "Ocean" },
  { id: "ice", label: "Ice" },
  { id: "coral", label: "Coral" },
  { id: "slate", label: "Slate" },
] as const;

export type Prefs = {
  pieceSet: string;
  board: string;
  sound: boolean;
  coords: boolean;
  showMoves: boolean;
  autoQueen: boolean;
};

const DEFAULTS: Prefs = { pieceSet: "cburnett", board: "brown", sound: true, coords: true, showMoves: true, autoQueen: false };
const KEY = "naphium:prefs";

export function usePrefs() {
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) setPrefs({ ...DEFAULTS, ...JSON.parse(raw) });
    } catch {
      /* ignore */
    }
  }, []);
  const update = (p: Partial<Prefs>) =>
    setPrefs((cur) => {
      const next = { ...cur, ...p };
      localStorage.setItem(KEY, JSON.stringify(next));
      return next;
    });
  return [prefs, update] as const;
}

export function pieceUrl(set: string, color: "w" | "b", type: string) {
  return `https://lichess1.org/assets/piece/${set}/${color}${type.toUpperCase()}.svg`;
}

export function getName(): string {
  return localStorage.getItem("naphium:name") ?? "";
}
export function setName(n: string) {
  localStorage.setItem("naphium:name", n.trim().slice(0, 24));
}

let ctx: AudioContext | null = null;
export function playSound(kind: "move" | "capture" | "check" | "end" | "low") {
  try {
    ctx ??= new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    const f = { move: 520, capture: 300, check: 880, end: 220, low: 1000 }[kind];
    o.frequency.value = f;
    o.type = kind === "capture" ? "square" : "sine";
    g.gain.setValueAtTime(0.15, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + (kind === "end" ? 0.6 : 0.12));
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.6);
  } catch {
    /* ignore */
  }
}

export function formatClock(ms: number) {
  const t = Math.max(0, ms);
  const m = Math.floor(t / 60000);
  const s = Math.floor((t % 60000) / 1000);
  if (t < 10000) return `${m}:${String(s).padStart(2, "0")}.${Math.floor((t % 1000) / 100)}`;
  if (m >= 60) return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function timeLabel(initialMs: number, incMs: number) {
  if (!initialMs) return "Unlimited";
  const min = initialMs / 60000;
  return `${min < 1 ? min.toFixed(2).replace(/0+$/, "") : min}+${incMs / 1000}`;
}

export function category(initialMs: number, incMs: number) {
  if (!initialMs) return "Casual";
  const est = initialMs / 1000 + (40 * incMs) / 1000;
  if (est < 180) return "Bullet";
  if (est < 480) return "Blitz";
  if (est < 1500) return "Rapid";
  return "Classical";
}
