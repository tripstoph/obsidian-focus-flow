export const VIEW_TYPE = "focus-flow";

export type SessionStatus = "IDLE" | "RUNNING" | "PAUSED" | "COMPLETED";
export type Phase = "THINKING" | "WRITING";
export type SpanKind = "thinking" | "writing" | "paused";
export type TerminationOperator = "AND" | "OR";
export type DeltaTone = "ahead" | "even" | "behind";

export interface FocusFlowSettings {
  wordsPerHour: number;
  thinkingMinutes: number;
  writingMinutes: number;
  maxRoundsEnabled: boolean;
  maxRounds: number;
  wordGoalEnabled: boolean;
  wordGoal: number;
  terminationOperator: TerminationOperator;
  infiniteMode: boolean;
  hideTimer: boolean;
  thinkingCountsTowardTarget: boolean;
  hideBehindDuringThinking: boolean;
  audioEnabled: boolean;
}

export interface SessionConfig {
  wordsPerHour: number;
  thinkingMs: number;
  writingMs: number;
  thinkingCountsTowardTarget: boolean;
  maxRoundsEnabled: boolean;
  maxRounds: number;
  wordGoalEnabled: boolean;
  wordGoal: number;
  terminationOperator: TerminationOperator;
  infiniteMode: boolean;
}

export interface SessionState {
  status: SessionStatus;
  phase: Phase | null;
  boundPath: string | null;
  startedAt: number | null;
  deadlineAt: number | null;
  remainingMs: number;
  segmentStartedAt: number | null;
  segmentCountsTowardTarget: boolean;
  accumulatedTrackingMs: number;
  accumulatedActiveMs: number;
  intervalDurationMs: number;
  intervalWritingMs: number;
  intervalWords: number;
  intervalBurstWords: number;
  credit: number;
  burstWords: number;
  creditAtIntervalStart: number;
  trackingAtRoundStart: number;
  roundsCompleted: number;
  writingGeneration: number;
  peakIntervalWph: number;
  goalCelebrated: boolean;
  resynced: boolean;
  docLength: number;
  missingNote: boolean;
  accumulatedWritingMs: number;
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
  status: "RUNNING" | "PAUSED";
  phase: Phase;
  boundPath: string;
  credit: number;
  burstWords: number;
  elapsedTrackingMs: number;
  accumulatedActiveMs: number;
  remainingMs: number;
  roundsCompleted: number;
  peakIntervalWph: number;
  intervalWords: number;
  intervalBurstWords: number;
  intervalWritingMs: number;
  trackingAtRoundStart: number;
  creditAtIntervalStart: number;
  writingGeneration: number;
  goalCelebrated: boolean;
  startedAt: number;
  savedAt: number;
  segmentCountsTowardTarget: boolean;
  intervalDurationMs: number;
  docLength: number;
  missingNote: boolean;
  accumulatedWritingMs: number;
  sprintPoints: SprintPoint[];
}

export interface Debrief {
  words: number;
  targetWords: number;
  delta: number;
  activeMs: number;
  rounds: number;
  peakWph: number;
  burstWords: number;
  broken: string[];
  callout: string;
}

export interface HudModel {
  status: SessionStatus;
  phase: Phase | null;
  boundName: string | null;
  activeFileName: string | null;
  canStart: boolean;
  resumeAvailable: boolean;
  remainingMs: number;
  intervalDurationMs: number;
  hideTimer: boolean;
  actualWords: number;
  targetWords: number;
  delta: number;
  tone: DeltaTone;
  deltaLabel: string;
  resynced: boolean;
  burstWords: number;
  missingNote: boolean;
  records: HighScores;
  debrief: Debrief | null;
  celebrate: boolean;
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
  thinkingMinutes: 5,
  writingMinutes: 10,
  maxRoundsEnabled: false,
  maxRounds: 8,
  wordGoalEnabled: false,
  wordGoal: 500,
  terminationOperator: "OR",
  infiniteMode: true,
  hideTimer: false,
  thinkingCountsTowardTarget: true,
  hideBehindDuringThinking: true,
  audioEnabled: true,
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
    phase: null,
    boundPath: null,
    startedAt: null,
    deadlineAt: null,
    remainingMs: 0,
    segmentStartedAt: null,
    segmentCountsTowardTarget: false,
    accumulatedTrackingMs: 0,
    accumulatedActiveMs: 0,
    intervalDurationMs: 0,
    intervalWritingMs: 0,
    accumulatedWritingMs: 0,
    intervalWords: 0,
    intervalBurstWords: 0,
    credit: 0,
    burstWords: 0,
    creditAtIntervalStart: 0,
    trackingAtRoundStart: 0,
    roundsCompleted: 0,
    writingGeneration: 0,
    peakIntervalWph: 0,
    goalCelebrated: false,
    resynced: false,
    docLength: 0,
    missingNote: false,
    sprintPoints: [],
  };
}

export function configFromSettings(settings: FocusFlowSettings): SessionConfig {
  return {
    wordsPerHour: settings.wordsPerHour,
    thinkingMs: settings.thinkingMinutes * 60_000,
    writingMs: settings.writingMinutes * 60_000,
    thinkingCountsTowardTarget: settings.thinkingCountsTowardTarget,
    maxRoundsEnabled: settings.maxRoundsEnabled,
    maxRounds: settings.maxRounds,
    wordGoalEnabled: settings.wordGoalEnabled,
    wordGoal: settings.wordGoal,
    terminationOperator: settings.terminationOperator,
    infiniteMode: settings.infiniteMode,
  };
}
