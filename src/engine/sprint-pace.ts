import type { SprintPoint } from "../types";

export const SPRINT_WINDOW_MS = 15 * 60 * 1000;

export function appendSprintPoint(points: SprintPoint[], writingMs: number, delta: number): SprintPoint[] {
  if (delta === 0) return points;
  const previous = points.length > 0 ? points[points.length - 1].words : 0;
  const words = Math.max(0, previous + delta);
  const point = { writingMs, words };
  if (points.length > 0 && points[points.length - 1].writingMs === writingMs) {
    const next = points.slice(0, -1);
    next.push(point);
    return next;
  }
  return [...points, point];
}

export function sprintPaceWph(points: SprintPoint[], writingMs: number): number | null {
  if (writingMs < SPRINT_WINDOW_MS || points.length === 0) return null;
  let best = wordsInWindow(points, writingMs);
  for (const point of points) {
    if (point.writingMs >= SPRINT_WINDOW_MS && point.writingMs <= writingMs) {
      best = Math.max(best, wordsInWindow(points, point.writingMs));
    }
    const agedOut = point.writingMs + SPRINT_WINDOW_MS;
    if (agedOut <= writingMs) best = Math.max(best, wordsInWindow(points, agedOut));
  }
  if (best <= 0) return null;
  return (best * 3_600_000) / SPRINT_WINDOW_MS;
}

function wordsInWindow(points: SprintPoint[], end: number): number {
  const start = end - SPRINT_WINDOW_MS;
  const right = lastAtOrBefore(points, end);
  if (right < 0) return 0;
  const left = lastBefore(points, start);
  const baseline = left >= 0 ? points[left].words : 0;
  return points[right].words - baseline;
}

function lastAtOrBefore(points: SprintPoint[], time: number): number {
  let lo = 0;
  let hi = points.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].writingMs <= time) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}

function lastBefore(points: SprintPoint[], time: number): number {
  let lo = 0;
  let hi = points.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid].writingMs < time) {
      found = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return found;
}
