import { trackingMs } from "../engine/clock";
import { sanitizeSettings } from "../engine/validate";
import {
  emptyRecords,
  idleSession,
  type ActiveSessionSnapshot,
  type HighScores,
  type PersistedData,
  type SessionRecord,
  type NoteCount,
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
    frozenScoreSession: null,
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
    frozenScoreSession: stamp(data.frozenScoreSession),
  };
}

export function pushHistory(history: SessionRecord[], record: SessionRecord): SessionRecord[] {
  return [...history, record].slice(-HISTORY_LIMIT);
}

export function toSnapshot(state: SessionState, now: number): ActiveSessionSnapshot | null {
  if (state.status !== "RUNNING" || state.startedAt == null) return null;
  return {
    status: "RUNNING",
    boundPath: state.boundPath ?? "",
    credit: state.credit,
    burstWords: state.burstWords,
    elapsedTrackingMs: trackingMs(state, now),
    startedAt: state.startedAt,
    savedAt: now,
    sprintPoints: state.sprintPoints,
    noteCounts: state.noteCounts,
  };
}

export function sessionFromSnapshot(snapshot: ActiveSessionSnapshot, now: number): SessionState {
  return {
    ...idleSession(),
    status: "RUNNING",
    boundPath: snapshot.boundPath.length > 0 ? snapshot.boundPath : null,
    startedAt: snapshot.startedAt,
    segmentStartedAt: now,
    accumulatedTrackingMs: snapshot.elapsedTrackingMs,
    credit: snapshot.credit,
    burstWords: snapshot.burstWords,
    sprintPoints: snapshot.sprintPoints,
    noteCounts: snapshot.noteCounts,
  };
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
  const raw = value as Partial<ActiveSessionSnapshot> & { status?: string };
  if (raw.status !== "RUNNING" && raw.status !== "PAUSED") return null;
  if (typeof raw.boundPath !== "string") return null;
  if (typeof raw.startedAt !== "number") return null;
  return {
    status: "RUNNING",
    boundPath: raw.boundPath,
    credit: numberOr(raw.credit, 0),
    burstWords: numberOr(raw.burstWords, 0),
    elapsedTrackingMs: numberOr(raw.elapsedTrackingMs, 0),
    startedAt: raw.startedAt,
    savedAt: numberOr(raw.savedAt, raw.startedAt),
    sprintPoints: sprintPoints(raw.sprintPoints),
    noteCounts: noteCounts(raw.noteCounts),
  };
}

function noteCounts(value: unknown): Record<string, NoteCount> {
  if (!value || typeof value !== "object") return {};
  const counts: Record<string, NoteCount> = {};
  for (const [path, entry] of Object.entries(value)) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Partial<NoteCount>;
    if (typeof raw.baseline !== "number" || typeof raw.current !== "number") continue;
    counts[path] = { baseline: raw.baseline, current: raw.current };
  }
  return counts;
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
