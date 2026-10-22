import { trackingMs } from "../engine/clock";
import { sanitizeSettings } from "../engine/validate";
import { idleSession, type ActiveSessionSnapshot, type PersistedData, type SessionRecord, type SessionState } from "../types";

const HISTORY_LIMIT = 100;

export function emptyData(): PersistedData {
  return {
    version: 1,
    settings: sanitizeSettings({}),
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
    history,
    activeSession: sanitizeSnapshot(data.activeSession),
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
    elapsedTrackingMs: trackingMs(state, now),
    startedAt: state.startedAt,
    savedAt: now,
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
    elapsedTrackingMs: numberOr(raw.elapsedTrackingMs, 0),
    startedAt: raw.startedAt,
    savedAt: numberOr(raw.savedAt, raw.startedAt),
  };
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}
