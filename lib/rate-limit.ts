import type { NextRequest } from "next/server";

const hits = new Map<string, number[]>();

export function rateLimit(
  req: NextRequest,
  limit = 5,
  windowMs = 60_000,
): boolean {
  const key = `${req.nextUrl.pathname}:${req.headers.get("x-forwarded-for") ?? "unknown"}`;
  const now = Date.now();
  const isFresh = (t: number) => now - t < windowMs;

  // prune keys whose hits have all aged out so this map doesn't grow forever
  for (const [key, timestamps] of hits) {
    if (!timestamps.some(isFresh)) hits.delete(key);
  }

  const timestamps = (hits.get(key) ?? []).filter(isFresh);
  timestamps.push(now);
  hits.set(key, timestamps);

  return timestamps.length <= limit;
}
