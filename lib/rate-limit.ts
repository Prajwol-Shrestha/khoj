import type { NextRequest } from "next/server";

// In-memory, per-process. Resets on deploy and doesn't work across instances —
// fine at khoj's scale, swap for Redis if it ever runs on more than one machine.
const hits = new Map<string, number[]>();

export function rateLimit(
  req: NextRequest,
  limit = 5,
  windowMs = 60_000,
): boolean {
  const ip = req.headers.get("x-forwarded-for") ?? "unknown";
  const now = Date.now();
  const isFresh = (t: number) => now - t < windowMs;

  // prune IPs whose hits have all aged out so this map doesn't grow forever
  for (const [key, timestamps] of hits) {
    if (!timestamps.some(isFresh)) hits.delete(key);
  }

  const timestamps = (hits.get(ip) ?? []).filter(isFresh);
  timestamps.push(now);
  hits.set(ip, timestamps);

  return timestamps.length <= limit;
}
