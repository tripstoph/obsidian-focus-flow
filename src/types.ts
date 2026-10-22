export const VIEW_TYPE = "focus-flow";

export type SessionStatus = "IDLE" | "RUNNING" | "COMPLETED";
export type DeltaTone = "ahead" | "even" | "behind";

export interface FocusFlowSettings {
  wordsPerHour: number;
}

export interface SessionConfig {
  wordsPerHour: number;
}

export interface SessionState {
  status: SessionStatus;
  boundPath: string | null;
  startedAt: number | null;
  segmentStartedAt: number | null;
  accumulatedTrackingMs: number;
  credit: number;
}

export interface SessionRecord {
  id: string;
  startedAt: number;
  endedAt: number;
  actualWords: number;
  targetWords: number;
  delta: number;
  elapsedTrackingMs: number;
  activeDurationMs: number;
  roundsCompleted: number;
  peakIntervalWph: number;
  filePath: string;
  goalMet: boolean;
  burstWords: number;
}

export interface ActiveSessionSnapshot {
  status: "RUNNING";
  boundPath: string;
  credit: number;
  elapsedTrackingMs: number;
  startedAt: number;
  savedAt: number;
}

export interface Debrief {
  words: number;
  targetWords: number;
  delta: number;
  activeMs: number;
  callout: string;
}

export interface HudModel {
  status: SessionStatus;
  activeFileName: string | null;
  canStart: boolean;
  actualWords: number;
  targetWords: number;
  delta: number;
  tone: DeltaTone;
  deltaLabel: string;
  debrief: Debrief | null;
  statusText: string;
}

export interface PersistedData {
  version: 1;
  settings: FocusFlowSettings;
  history: SessionRecord[];
  activeSession: ActiveSessionSnapshot | null;
}

export const DEFAULT_SETTINGS: FocusFlowSettings = {
  wordsPerHour: 500,
};

export function idleSession(): SessionState {
  return {
    status: "IDLE",
    boundPath: null,
    startedAt: null,
    segmentStartedAt: null,
    accumulatedTrackingMs: 0,
    credit: 0,
  };
}

export function configFromSettings(settings: FocusFlowSettings): SessionConfig {
  return { wordsPerHour: settings.wordsPerHour };
}
