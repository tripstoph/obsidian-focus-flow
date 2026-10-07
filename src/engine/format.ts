import type { DeltaTone, FocusFlowSettings } from "../types";

export function round1(value: number): string {
  return (Math.round(value * 10) / 10).toFixed(1);
}

export function formatMinutes(minutes: number): string {
  const label = Number.isInteger(minutes) ? String(minutes) : round1(minutes);
  return minutes === 1 ? "1 minute" : `${label} minutes`;
}

export function formatPace(settings: Pick<
  FocusFlowSettings,
  "wordsPerHour" | "thinkingMinutes" | "writingMinutes" | "thinkingCountsTowardTarget"
>): string {
  const wpm = settings.wordsPerHour / 60;
  const base = `${settings.wordsPerHour} words per hour is about ${round1(wpm)} words per minute.`;
  if (!settings.thinkingCountsTowardTarget) {
    return `${base} During writing, that pace stays about ${round1(wpm)} words per minute.`;
  }
  const sprint =
    (settings.wordsPerHour * (settings.thinkingMinutes + settings.writingMinutes)) /
    settings.writingMinutes /
    60;
  return `${base} Across ${formatMinutes(settings.thinkingMinutes)} of thinking and ${formatMinutes(settings.writingMinutes)} of writing, that pace is about ${round1(sprint)} words per minute during writing.`;
}

export function writingWpmIfThinkingCounts(settings: Pick<
  FocusFlowSettings,
  "wordsPerHour" | "thinkingMinutes" | "writingMinutes"
>): number {
  if (settings.writingMinutes <= 0) return settings.wordsPerHour / 60;
  return (
    (settings.wordsPerHour * (settings.thinkingMinutes + settings.writingMinutes)) /
    settings.writingMinutes /
    60
  );
}

export function formatThinkingBurden(settings: Pick<
  FocusFlowSettings,
  "wordsPerHour" | "thinkingMinutes" | "writingMinutes"
>): string {
  return `If the ghost advances during thinking, writing is about ${round1(writingWpmIfThinkingCounts(settings))} words per minute.`;
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const seconds = total % 60;
  const minutes = Math.floor(total / 60);
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60);
    const remain = minutes % 60;
    return `${hours}:${remain.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

export function formatActive(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  if (totalMinutes < 60) return `${totalMinutes} min`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours} h` : `${hours} h ${minutes} min`;
}

export function deltaTone(delta: number): DeltaTone {
  if (Math.abs(delta) < 0.5) return "even";
  return delta > 0 ? "ahead" : "behind";
}

export function formatDelta(delta: number): string {
  const rounded = Math.round(delta);
  if (rounded > 0) return `+${rounded}`;
  return String(rounded);
}

export function formatTarget(value: number): string {
  return round1(value);
}

export function baseName(path: string): string {
  const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return path.slice(slash + 1);
}

export function progressRatio(remainingMs: number, durationMs: number): number {
  if (durationMs <= 0) return 0;
  const elapsed = 1 - remainingMs / durationMs;
  return Math.min(1, Math.max(0, elapsed));
}

export interface CalloutInput {
  words: number;
  targetWords: number;
  delta: number;
  activeMs: number;
  rounds: number;
  peakWph: number;
  burstWords: number;
}

export function buildCallout(input: CalloutInput): string {
  const lines = [
    "> [!success] Focus Flow session",
    `> **Wrote** ${input.words} words · ghost ${Math.round(input.targetWords)} · delta ${formatDelta(input.delta)}`,
    `> **Active** ${formatActive(input.activeMs)} · ${input.rounds} rounds · peak ${Math.round(input.peakWph)} WPH`,
  ];
  if (input.burstWords > 0) {
    lines.push(`> Includes ${input.burstWords} words added in large pastes.`);
  }
  return lines.join("\n");
}

export function brokenLabels(
  before: {
    apexSprintWph: number;
    volumeRecordWords: number;
    flowMarathonMs: number;
    positiveDeltaStreak: number;
  },
  after: {
    apexSprintWph: number;
    volumeRecordWords: number;
    flowMarathonMs: number;
    positiveDeltaStreak: number;
  },
): string[] {
  const labels: string[] = [];
  if (after.apexSprintWph > before.apexSprintWph) labels.push("Sprint pace");
  if (after.volumeRecordWords > before.volumeRecordWords) labels.push("Volume record");
  if (after.flowMarathonMs > before.flowMarathonMs) labels.push("Flow marathon");
  if (after.positiveDeltaStreak > before.positiveDeltaStreak) labels.push("Positive delta streak");
  return labels;
}
