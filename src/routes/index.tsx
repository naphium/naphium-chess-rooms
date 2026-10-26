import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SiteFooter } from "@/components/SiteFooter";
import { supabase } from "@/integrations/supabase/client";
import { getPlayerToken, newGameId, saveRole } from "@/lib/session";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Naphium Chess — Play chess with a friend, no login" },
      { name: "description", content: "Create a chess room, share the link, and play in real time. No sign-up required." },
      { property: "og:title", content: "Naphium Chess" },
      { property: "og:description", content: "Real-time multiplayer chess with zero login. Share a link and play." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  async function create() {
    setBusy(true);
    setError("");
    const id = newGameId();
    const { error } = await supabase.rpc("create_game", { p_id: id, p_token: getPlayerToken() });
    if (error) {
      setError("Couldn't create a game. Please try again.");
      setBusy(false);
      return;
    }
    saveRole(id, "white");
    navigate({ to: "/game/$gameId", params: { gameId: id } });
  }

  function join(e: React.FormEvent) {
    e.preventDefault();
    const id = code.trim().toLowerCase().split("/").pop();
    if (id) navigate({ to: "/game/$gameId", params: { gameId: id } });
  }

  return (
    <div className="flex min-h-screen flex-col">
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-4 pt-20 text-center">
        <div className="mb-6 text-7xl piece-white select-none">♞</div>
        <h1 className="text-5xl font-semibold tracking-tight md:text-7xl">
          Naphium <span className="italic text-primary">Chess</span>
        </h1>
        <p className="mt-5 max-w-md text-lg text-muted-foreground">
          Create a room, send the link, play instantly. No accounts, no waiting.
        </p>
        <Button size="lg" className="mt-10 h-14 px-10 text-base" onClick={create} disabled={busy}>
          {busy ? "Creating…" : "Create Game"}
        </Button>
        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        <form onSubmit={join} className="mt-8 flex w-full max-w-sm gap-2">
          <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Have a code? e.g. abc-123" />
          <Button type="submit" variant="secondary">Join</Button>
        </form>
      </main>
      <SiteFooter />
    </div>
  );
}
