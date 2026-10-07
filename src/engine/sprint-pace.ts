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
  const words = wordsAt(points, writingMs) - wordsBefore(points, writingMs - SPRINT_WINDOW_MS);
  if (words <= 0) return null;
  return (words * 3_600_000) / SPRINT_WINDOW_MS;
}

function wordsAt(points: SprintPoint[], time: number): number {
  let words = 0;
  for (const point of points) {
    if (point.writingMs > time) break;
    words = point.words;
  }
  return words;
}

function wordsBefore(points: SprintPoint[], time: number): number {
  let words = 0;
  for (const point of points) {
    if (point.writingMs >= time) break;
    words = point.words;
  }
  return words;
}
