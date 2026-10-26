// Browser-only helpers: call from effects / handlers.
export function getPlayerToken(): string {
  let t = localStorage.getItem("naphium:token");
  if (!t) {
    t = crypto.randomUUID().replace(/-/g, "");
    localStorage.setItem("naphium:token", t);
  }
  return t;
}

export function saveRole(gameId: string, role: string) {
  localStorage.setItem(`naphium:role:${gameId}`, role);
}

export function newGameId(): string {
  const chars = "abcdefghijkmnpqrstuvwxyz23456789";
  const pick = (n: number) =>
    Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => chars[b % chars.length]).join("");
  return `${pick(3)}-${pick(3)}`;
}
