import { cn } from "@/lib/utils";
import { pieceUrl } from "@/lib/prefs";

const GLYPH: Record<string, string> = { k: "♚", q: "♛", r: "♜", b: "♝", n: "♞", p: "♟" };

export function Piece({ set, color, type, className }: { set: string; color: "w" | "b"; type: string; className?: string }) {
  if (set === "unicode")
    return (
      <span className={cn("select-none leading-none", color === "w" ? "piece-white" : "piece-black", className)}>
        {GLYPH[type]}
      </span>
    );
  return <img src={pieceUrl(set, color, type)} alt={`${color}${type}`} draggable={false} className={cn("select-none", className)} />;
}
