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
  burstWords: number;
  sprintPoints: SprintPoint[];
}

export interface SprintPoint {
  writingMs: number;
  words: number;
}

export interface HighScores {
  apexSprintWph: number;
  apexSprintAt: number | null;
  volumeRecordWords: number;
  volumeRecordAt: number | null;
  flowMarathonMs: number;
  flowMarathonAt: number | null;
  positiveDeltaStreak: number;
  positiveDeltaStreakAt: number | null;
  currentPositiveDeltaStreak: number;
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
  burstWords: number;
  elapsedTrackingMs: number;
  startedAt: number;
  savedAt: number;
  sprintPoints: SprintPoint[];
}

export interface Debrief {
  words: number;
  targetWords: number;
  delta: number;
  activeMs: number;
  burstWords: number;
  broken: string[];
  callout: string;
}

export interface HudModel {
  status: SessionStatus;
  activeFileName: string | null;
  canStart: boolean;
  resumeAvailable: boolean;
  actualWords: number;
  targetWords: number;
  delta: number;
  tone: DeltaTone;
  deltaLabel: string;
  burstWords: number;
  records: HighScores;
  debrief: Debrief | null;
  statusText: string;
}

export interface PersistedData {
  version: 1;
  settings: FocusFlowSettings;
  records: HighScores;
  history: SessionRecord[];
  activeSession: ActiveSessionSnapshot | null;
}

export const DEFAULT_SETTINGS: FocusFlowSettings = {
  wordsPerHour: 500,
};

export function emptyRecords(): HighScores {
  return {
    apexSprintWph: 0,
    apexSprintAt: null,
    volumeRecordWords: 0,
    volumeRecordAt: null,
    flowMarathonMs: 0,
    flowMarathonAt: null,
    positiveDeltaStreak: 0,
    positiveDeltaStreakAt: null,
    currentPositiveDeltaStreak: 0,
  };
}

export function idleSession(): SessionState {
  return {
    status: "IDLE",
    boundPath: null,
    startedAt: null,
    segmentStartedAt: null,
    accumulatedTrackingMs: 0,
    credit: 0,
    burstWords: 0,
    sprintPoints: [],
  };
}

export function configFromSettings(settings: FocusFlowSettings): SessionConfig {
  return { wordsPerHour: settings.wordsPerHour };
}
