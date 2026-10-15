export function targetWords(wordsPerHour: number, elapsedTrackingMs: number): number {
  if (elapsedTrackingMs <= 0 || wordsPerHour <= 0) return 0;
  return (wordsPerHour / 3600) * (elapsedTrackingMs / 1000);
}
