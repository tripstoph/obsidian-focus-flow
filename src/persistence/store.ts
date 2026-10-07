import { activeMs, currentRemainingMs, thawClock, trackingMs, writingMs } from "../engine/clock";
import { sanitizeSettings } from "../engine/validate";
import {
  emptyRecords,
  idleSession,
  type ActiveSessionSnapshot,
  type HighScores,
  type PersistedData,
  type SessionRecord,
  type SessionState,
  type SprintPoint,
} from "../types";

const HISTORY_LIMIT = 100;

export function emptyData(): PersistedData {
  return {
    version: 1,
    settings: sanitizeSettings({}),
    records: emptyRecords(),
    history: [],
    activeSession: null,
  };
}

export function migrate(raw: unknown): PersistedData {
  const data = raw && typeof raw === "object" ? (raw as Partial<PersistedData>) : {};
  const history = Array.isArray(data.history) ? data.history.slice(-HISTORY_LIMIT) : [];
  return {
    version: 1,
    settings: sanitizeSettings(data.settings),
    records: sanitizeRecords(data.records),
    history,
    activeSession: sanitizeSnapshot(data.activeSession),
  };
}

export function pushHistory(history: SessionRecord[], record: SessionRecord): SessionRecord[] {
  return [...history, record].slice(-HISTORY_LIMIT);
}

export function toSnapshot(state: SessionState, now: number): ActiveSessionSnapshot | null {
  if (
    (state.status !== "RUNNING" && state.status !== "PAUSED") ||
    state.phase == null ||
    state.boundPath == null ||
    state.startedAt == null
  ) {
    return null;
  }
  const writingElapsed =
    state.phase === "WRITING" && state.status === "RUNNING" && state.segmentStartedAt != null
      ? Math.max(0, now - state.segmentStartedAt)
      : 0;
  return {
    status: state.status,
    phase: state.phase,
    boundPath: state.boundPath,
    credit: state.credit,
    burstWords: state.burstWords,
    elapsedTrackingMs: trackingMs(state, now),
    accumulatedActiveMs: activeMs(state, now),
    remainingMs: currentRemainingMs(state, now),
    roundsCompleted: state.roundsCompleted,
    peakIntervalWph: state.peakIntervalWph,
    intervalWords: state.intervalWords,
    intervalBurstWords: state.intervalBurstWords,
    intervalWritingMs: state.intervalWritingMs + writingElapsed,
    trackingAtRoundStart: state.trackingAtRoundStart,
    creditAtIntervalStart: state.creditAtIntervalStart,
    writingGeneration: state.writingGeneration,
    goalCelebrated: state.goalCelebrated,
    startedAt: state.startedAt,
    savedAt: now,
    segmentCountsTowardTarget: state.segmentCountsTowardTarget,
    intervalDurationMs: state.intervalDurationMs,
    docLength: state.docLength,
    missingNote: state.missingNote,
    accumulatedWritingMs: writingMs(state, now),
    sprintPoints: state.sprintPoints,
  };
}

export function sessionFromSnapshot(snapshot: ActiveSessionSnapshot, now: number): SessionState {
  const restored: SessionState = {
    ...idleSession(),
    status: snapshot.status,
    phase: snapshot.phase,
    boundPath: snapshot.boundPath,
    startedAt: snapshot.startedAt,
    remainingMs: snapshot.remainingMs,
    segmentCountsTowardTarget: snapshot.segmentCountsTowardTarget,
    accumulatedTrackingMs: snapshot.elapsedTrackingMs,
    accumulatedActiveMs: snapshot.accumulatedActiveMs,
    intervalDurationMs: snapshot.intervalDurationMs,
    intervalWritingMs: snapshot.intervalWritingMs,
    intervalWords: snapshot.intervalWords,
    intervalBurstWords: snapshot.intervalBurstWords,
    credit: snapshot.credit,
    burstWords: snapshot.burstWords,
    creditAtIntervalStart: snapshot.creditAtIntervalStart,
    trackingAtRoundStart: snapshot.trackingAtRoundStart,
    roundsCompleted: snapshot.roundsCompleted,
    writingGeneration: snapshot.writingGeneration,
    peakIntervalWph: snapshot.peakIntervalWph,
    goalCelebrated: snapshot.goalCelebrated,
    docLength: snapshot.docLength,
    missingNote: snapshot.missingNote,
    accumulatedWritingMs: snapshot.accumulatedWritingMs,
    sprintPoints: snapshot.sprintPoints,
    resynced: true,
  };
  if (snapshot.status === "PAUSED") return restored;
  return thawClock(restored, now);
}

function sanitizeRecords(value: unknown): HighScores {
  const raw = value && typeof value === "object" ? (value as Partial<HighScores>) : {};
  const base = emptyRecords();
  return {
    apexSprintWph: numberOr(raw.apexSprintWph, base.apexSprintWph),
    apexSprintAt: stamp(raw.apexSprintAt),
    volumeRecordWords: numberOr(raw.volumeRecordWords, base.volumeRecordWords),
    volumeRecordAt: stamp(raw.volumeRecordAt),
    flowMarathonMs: numberOr(raw.flowMarathonMs, base.flowMarathonMs),
    flowMarathonAt: stamp(raw.flowMarathonAt),
    positiveDeltaStreak: numberOr(raw.positiveDeltaStreak, base.positiveDeltaStreak),
    positiveDeltaStreakAt: stamp(raw.positiveDeltaStreakAt),
    currentPositiveDeltaStreak: numberOr(raw.currentPositiveDeltaStreak, 0),
  };
}

function sanitizeSnapshot(value: unknown): ActiveSessionSnapshot | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<ActiveSessionSnapshot>;
  if ((raw.status !== "RUNNING" && raw.status !== "PAUSED") || (raw.phase !== "THINKING" && raw.phase !== "WRITING")) {
    return null;
  }
  if (typeof raw.boundPath !== "string" || raw.boundPath.length === 0) return null;
  if (typeof raw.startedAt !== "number") return null;
  return {
    status: raw.status,
    phase: raw.phase,
    boundPath: raw.boundPath,
    credit: numberOr(raw.credit, 0),
    burstWords: numberOr(raw.burstWords, 0),
    elapsedTrackingMs: numberOr(raw.elapsedTrackingMs, 0),
    accumulatedActiveMs: numberOr(raw.accumulatedActiveMs, 0),
    remainingMs: numberOr(raw.remainingMs, 0),
    roundsCompleted: numberOr(raw.roundsCompleted, 0),
    peakIntervalWph: numberOr(raw.peakIntervalWph, 0),
    intervalWords: numberOr(raw.intervalWords, 0),
    intervalBurstWords: numberOr(raw.intervalBurstWords, 0),
    intervalWritingMs: numberOr(raw.intervalWritingMs, 0),
    trackingAtRoundStart: numberOr(raw.trackingAtRoundStart, 0),
    creditAtIntervalStart: numberOr(raw.creditAtIntervalStart, 0),
    writingGeneration: numberOr(raw.writingGeneration, 0),
    goalCelebrated: raw.goalCelebrated === true,
    startedAt: raw.startedAt,
    savedAt: numberOr(raw.savedAt, raw.startedAt),
    segmentCountsTowardTarget: raw.segmentCountsTowardTarget === true,
    intervalDurationMs: numberOr(raw.intervalDurationMs, 0),
    docLength: numberOr(raw.docLength, 0),
    missingNote: raw.missingNote === true,
    accumulatedWritingMs: numberOr(raw.accumulatedWritingMs, numberOr(raw.intervalWritingMs, 0)),
    sprintPoints: sprintPoints(raw.sprintPoints),
  };
}

function sprintPoints(value: unknown): SprintPoint[] {
  if (!Array.isArray(value)) return [];
  const points: SprintPoint[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const point = item as Partial<SprintPoint>;
    if (typeof point.writingMs !== "number" || typeof point.words !== "number") continue;
    points.push({ writingMs: point.writingMs, words: point.words });
  }
  return points;
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stamp(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
