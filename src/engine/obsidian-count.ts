import type { NoteCount } from "../types";
export { obsidianWordCount } from "./word-ledger";

export function noteDelta(counts: Record<string, NoteCount>, path: string | null): number | null {
  if (path == null) return null;
  const entry = counts[path];
  if (!entry) return null;
  return entry.current - entry.baseline;
}

export function notesDelta(counts: Record<string, NoteCount>): number {
  let total = 0;
  for (const entry of Object.values(counts)) total += entry.current - entry.baseline;
  return total;
}
