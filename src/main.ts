import { MarkdownView, normalizePath, Platform, Plugin, TFile } from "obsidian";
import { Chime } from "./audio/chime";
import { activeMs, currentRemainingMs, writingMs } from "./engine/clock";
import { buildCallout, brokenLabels, deltaTone, formatClock, formatDelta } from "./engine/format";
import {
  dismissSession,
  endSession,
  extendSession,
  pauseSession,
  resumeSession,
  skipSession,
  startSession,
  suspendSession,
  tickSession,
  type EngineEvent,
} from "./engine/fsm";
import { displayTrackingMs, targetWords } from "./engine/ghost";
import { applyEngineEvents, applyMarathon, applySprintPace, applyVolume } from "./engine/records";
import { sprintPaceWph } from "./engine/sprint-pace";
import { applyEdit } from "./engine/session";
import { VaultLedger, type PreparedEdit } from "./engine/word-ledger";
import { appendCallout } from "./obsidian/callout";
import { createEditorExtension, type EditorGate } from "./obsidian/editor-bridge";
import { FocusFlowView } from "./obsidian/sidebar-view";
import { renderStatus } from "./obsidian/status-bar";
import { migrate, pushHistory, sessionFromSnapshot, toSnapshot } from "./persistence/store";
import { FocusFlowSettingTab } from "./settings";
import {
  configFromSettings,
  idleSession,
  VIEW_TYPE,
  type ActiveSessionSnapshot,
  type Debrief,
  type HighScores,
  type HudModel,
  type PersistedData,
  type SessionRecord,
  type SessionState,
} from "./types";
import type { Extension } from "@codemirror/state";

const ONE_MINUTE = 60_000;
const FIVE_MINUTES = 300_000;

export default class FocusFlowPlugin extends Plugin {
  settings = configSettings();
  private data: PersistedData = migrate(null);
  private session: SessionState = idleSession();
  private ledger: VaultLedger = VaultLedger.empty();
  private records: HighScores = this.data.records;
  private history: SessionRecord[] = [];
  private pending: ActiveSessionSnapshot | null = null;
  private recordsAtStart: HighScores = this.data.records;
  private debrief: Debrief | null = null;
  private completedPath: string | null = null;
  private lastTick: number | null = null;
  private timer: number | null = null;
  private persistTimer: number | null = null;
  private celebrateUntil = 0;
  private readonly watched = new Set<Document>();
  private readonly editorExtension: Extension[] = [];
  private readonly gate: EditorGate = {
    listening: false,
    onEdit: () => {},
  };
  private statusEl: HTMLElement | null = null;

  async onload(): Promise<void> {
    this.data = migrate(await this.loadData());
    this.settings = this.data.settings;
    this.records = this.data.records;
    this.history = this.data.history;
    this.pending = this.data.activeSession;
    this.recordsAtStart = { ...this.records };
    this.chime.enabled = this.settings.audioEnabled;
    this.gate.onEdit = (edit) => this.handleEdit(edit);

    this.addSettingTab(new FocusFlowSettingTab(this.app, this));
    this.registerView(VIEW_TYPE, (leaf) => new FocusFlowView(leaf, this));
    this.editorExtension.push(createEditorExtension(this.gate));
    this.registerEditorExtension(this.editorExtension);
    this.addRibbonIcon("timer", "Open writing panel", () => {
      void this.openPanel();
    });
    this.addCommands();
    if (!Platform.isMobile) {
      this.statusEl = this.addStatusBarItem();
      this.registerDomEvent(this.statusEl, "click", () => {
        void this.openPanel();
      });
    }

    this.registerEvent(
      this.app.workspace.on("active-leaf-change", () => {
        this.refresh();
      }),
    );
    this.registerEvent(
      this.app.vault.on("rename", (file, oldPath) => {
        this.renameBound(normalizePath(oldPath), normalizePath(file.path));
      }),
    );
    this.registerEvent(
      this.app.vault.on("delete", (file) => {
        this.forgetBound(normalizePath(file.path));
      }),
    );

    this.app.workspace.onLayoutReady(() => {
      this.watchDocument(activeDocument);
      this.registerEvent(
        this.app.workspace.on("window-open", (_container, popup: Window) => {
          this.watchDocument(popup.document);
        }),
      );
      this.registerEvent(
        this.app.workspace.on("window-close", (_container, popup: Window) => {
          this.watched.delete(popup.document);
        }),
      );
      this.refresh();
    });
  }

  onunload(): void {
    this.clearTimer();
    if (this.persistTimer != null) window.clearTimeout(this.persistTimer);
    void this.persistNow();
  }

  onExternalSettingsChange(): void {
    void this.reloadSettings();
  }

  async saveSettings(): Promise<void> {
    this.chime.enabled = this.settings.audioEnabled;
    this.data.settings = this.settings;
    await this.persistNow();
    this.refresh();
  }

  getHud(): HudModel {
    const now = Date.now();
    const ease = this.settings.hideBehindDuringThinking && this.settings.thinkingCountsTowardTarget;
    const target = targetWords(this.settings.wordsPerHour, displayTrackingMs(this.session, now, ease));
    const delta = this.session.credit - target;
    const tone = deltaTone(this.debrief && this.session.status === "COMPLETED" ? this.debrief.delta : delta);
    const note = this.writingView();
    const activeFile = note?.file ?? null;
    const celebrate = this.session.status !== "COMPLETED" && now < this.celebrateUntil;
    const shownDelta = this.session.status === "COMPLETED" && this.debrief ? this.debrief.delta : delta;
    return {
      status: this.session.status,
      phase: this.session.phase,
      boundName: "Whole vault",
      activeFileName: activeFile ? baseName(activeFile.path) : null,
      canStart: this.session.status === "IDLE",
      resumeAvailable: this.pending != null && this.session.status === "IDLE",
      remainingMs: currentRemainingMs(this.session, now),
      intervalDurationMs: this.session.intervalDurationMs,
      hideTimer: this.settings.hideTimer,
      actualWords: this.session.credit,
      targetWords: target,
      delta: shownDelta,
      tone,
      deltaLabel: tone,
      resynced: this.session.resynced,
      burstWords: this.session.burstWords,
      missingNote: this.session.missingNote,
      records: this.records,
      debrief: this.session.status === "COMPLETED" ? this.debrief : null,
      celebrate,
      statusText: statusText(this.session, this.settings.hideTimer, shownDelta, currentRemainingMs(this.session, now)),
    };
  }

  start(): void {
    if (this.session.status !== "IDLE") return;
    this.chime.unlock();
    this.pending = null;
    this.debrief = null;
    this.completedPath = null;
    this.recordsAtStart = { ...this.records };
    const view = this.writingView();
    const path = view?.file ? normalizePath(view.file.path) : null;
    const now = Date.now();
    this.lastTick = now;
    this.ledger = VaultLedger.empty();
    const step = startSession(configFromSettings(this.settings), now, path, 0);
    this.adopt(step.state, this.ledger, step.events, now);
  }

  resumeSaved(): void {
    if (!this.pending || this.session.status !== "IDLE") return;
    this.chime.unlock();
    const now = Date.now();
    const state = { ...sessionFromSnapshot(this.pending, now), missingNote: false };
    this.ledger = VaultLedger.empty();
    this.recordsAtStart = { ...this.records };
    this.pending = null;
    this.debrief = null;
    this.lastTick = now;
    this.adopt(state, this.ledger, [], now);
  }

  togglePause(): void {
    const now = Date.now();
    if (this.session.status === "RUNNING") {
      const step = pauseSession(this.session, now);
      this.adopt(step.state, this.ledger, step.events, now);
      return;
    }
    if (this.session.status === "PAUSED") {
      this.chime.unlock();
      this.lastTick = now;
      const step = resumeSession(this.session, now);
      this.adopt(step.state, this.ledger, step.events, now);
    }
  }

  extend(minutes: 1 | 5): void {
    const now = Date.now();
    const step = extendSession(this.session, now, minutes === 1 ? ONE_MINUTE : FIVE_MINUTES);
    this.adopt(step.state, this.ledger, step.events, now);
  }

  skip(): void {
    const now = Date.now();
    this.lastTick = now;
    const step = skipSession(this.session, configFromSettings(this.settings), now);
    this.adopt(step.state, this.ledger, step.events, now);
  }

  end(): void {
    const now = Date.now();
    const step = endSession(this.session, configFromSettings(this.settings), now);
    this.adopt(step.state, this.ledger, step.events, now);
  }

  dismiss(): void {
    const step = dismissSession();
    this.debrief = null;
    this.completedPath = null;
    this.pending = null;
    this.ledger = VaultLedger.empty();
    this.adopt(step.state, this.ledger, step.events, Date.now());
  }

  async insertCallout(): Promise<void> {
    if (!this.debrief) return;
    const path = this.writingView()?.file?.path ?? this.completedPath;
    if (!path) return;
    await appendCallout(this.app, path, this.debrief.callout);
  }

  openSettings(): void {
    const setting = (this.app as AppWithSettings).setting;
    if (!setting) return;
    setting.open();
    setting.openTabById(this.manifest.id);
  }

  async openPanel(): Promise<void> {
    const { workspace } = this.app;
    const existing = workspace.getLeavesOfType(VIEW_TYPE);
    if (existing.length > 0) {
      void workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = workspace.getRightLeaf(false);
    if (!leaf) return;
    await leaf.setViewState({ type: VIEW_TYPE, active: true });
    void workspace.revealLeaf(leaf);
  }

  private readonly chime = new Chime();

  private addCommands(): void {
    this.addCommand({
      id: "open-panel",
      name: "Open writing panel",
      callback: () => {
        void this.openPanel();
      },
    });
    this.addCommand({
      id: "start-session",
      name: "Start session",
      checkCallback: (checking) => {
        const ready = this.session.status === "IDLE";
        if (ready && !checking) this.start();
        return ready;
      },
    });
    this.addCommand({
      id: "toggle-pause",
      name: "Pause or resume session",
      checkCallback: (checking) => {
        const ready = this.session.status === "RUNNING" || this.session.status === "PAUSED";
        if (ready && !checking) this.togglePause();
        return ready;
      },
    });
    this.addCommand({
      id: "skip-interval",
      name: "Skip interval",
      checkCallback: (checking) => {
        const ready = this.session.status === "RUNNING" || this.session.status === "PAUSED";
        if (ready && !checking) this.skip();
        return ready;
      },
    });
    this.addCommand({
      id: "end-session",
      name: "End session",
      checkCallback: (checking) => {
        const ready = this.session.status === "RUNNING" || this.session.status === "PAUSED";
        if (ready && !checking) this.end();
        return ready;
      },
    });
    this.addCommand({
      id: "add-one-minute",
      name: "Add 1 minute",
      checkCallback: (checking) => {
        const ready = this.session.status === "RUNNING" || this.session.status === "PAUSED";
        if (ready && !checking) this.extend(1);
        return ready;
      },
    });
    this.addCommand({
      id: "add-five-minutes",
      name: "Add 5 minutes",
      checkCallback: (checking) => {
        const ready = this.session.status === "RUNNING" || this.session.status === "PAUSED";
        if (ready && !checking) this.extend(5);
        return ready;
      },
    });
  }

  private lastNotePath: string | null = null;

  private writingView(): MarkdownView | null {
    const active = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (isMarkdownNote(active)) {
      this.lastNotePath = active.file.path;
      return active;
    }
    const recent = this.app.workspace.getMostRecentLeaf()?.view;
    if (recent instanceof MarkdownView && isMarkdownNote(recent)) {
      this.lastNotePath = recent.file.path;
      return recent;
    }
    if (this.lastNotePath == null) return null;
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (view instanceof MarkdownView && view.file?.path === this.lastNotePath && view.editor) return view;
    }
    return null;
  }

  private handleEdit(edit: PreparedEdit): void {
    const now = Date.now();
    const step = applyEdit(this.session, this.ledger, configFromSettings(this.settings), edit, now);
    this.adopt(step.state, step.ledger, step.events, now);
  }

  private adopt(state: SessionState, ledger: VaultLedger, events: EngineEvent[], now: number): void {
    const phaseBefore = this.session.phase;
    const statusBefore = this.session.status;
    this.session = state;
    this.ledger = ledger;
    let records = applyEngineEvents(this.records, events, now);
    records = applySprintPace(records, sprintPaceWph(state.sprintPoints, writingMs(state, now)), now);
    records = applyVolume(records, state.credit, now);
    records = applyMarathon(records, activeMs(state, now), now);
    this.records = records;
    this.gate.listening = state.status === "RUNNING" || state.status === "PAUSED";

    for (const event of events) {
      if (event.type === "phase" && event.phase === "WRITING" && phaseBefore === "THINKING") {
        void this.chime.play("up");
      } else if (event.type === "phase" && event.phase === "THINKING" && phaseBefore === "WRITING") {
        void this.chime.play("down");
      } else if (event.type === "goal") {
        void this.chime.play("goal");
        if (state.status !== "COMPLETED") this.celebrateUntil = now + 1600;
      } else if (event.type === "completed") {
        this.completedPath = this.writingView()?.file?.path ?? state.boundPath ?? this.completedPath;
        this.debrief = this.makeDebrief(state);
        this.history = pushHistory(this.history, this.makeRecord(state, now));
        this.celebrateUntil = 0;
      }
    }

    if (state.status === "RUNNING") this.armTimer(now);
    else this.clearTimer();
    this.refresh();
    const snapshotNow =
      events.some((event) => event.type === "phase" || event.type === "goal" || event.type === "completed") ||
      state.status === "PAUSED" ||
      statusBefore !== state.status;
    if (snapshotNow) void this.persistNow();
    else this.schedulePersist();
  }

  private makeDebrief(state: SessionState): Debrief {
    const target = targetWords(this.settings.wordsPerHour, state.accumulatedTrackingMs);
    const delta = state.credit - target;
    return {
      words: state.credit,
      targetWords: target,
      delta,
      activeMs: state.accumulatedActiveMs,
      rounds: state.roundsCompleted,
      peakWph: state.peakIntervalWph,
      burstWords: state.burstWords,
      broken: brokenLabels(this.recordsAtStart, this.records),
      callout: buildCallout({
        words: state.credit,
        targetWords: target,
        delta,
        activeMs: state.accumulatedActiveMs,
        rounds: state.roundsCompleted,
        peakWph: state.peakIntervalWph,
        burstWords: state.burstWords,
      }),
    };
  }

  private makeRecord(state: SessionState, now: number): SessionRecord {
    const target = targetWords(this.settings.wordsPerHour, state.accumulatedTrackingMs);
    return {
      id: window.crypto.randomUUID(),
      startedAt: state.startedAt ?? now,
      endedAt: now,
      actualWords: state.credit,
      targetWords: target,
      delta: state.credit - target,
      elapsedTrackingMs: state.accumulatedTrackingMs,
      activeDurationMs: state.accumulatedActiveMs,
      roundsCompleted: state.roundsCompleted,
      peakIntervalWph: state.peakIntervalWph,
      filePath: state.boundPath ?? "",
      goalMet: state.goalCelebrated,
      burstWords: state.burstWords,
    };
  }

  private onTick(): void {
    const now = Date.now();
    const step = tickSession(this.session, configFromSettings(this.settings), now, this.lastTick);
    this.lastTick = now;
    if (step.state !== this.session || step.events.length > 0) {
      this.adopt(step.state, this.ledger, step.events, now);
      return;
    }
    this.records = applyMarathon(this.records, activeMs(this.session, now), now);
    this.records = applySprintPace(this.records, sprintPaceWph(this.session.sprintPoints, writingMs(this.session, now)), now);
    this.refresh();
    this.schedulePersist();
    this.armTimer(now);
  }

  private armTimer(now: number): void {
    this.clearTimer();
    if (this.session.status !== "RUNNING" || this.session.deadlineAt == null) return;
    const delay = Math.max(0, Math.min(1000, this.session.deadlineAt - now));
    this.timer = window.setTimeout(() => this.onTick(), delay);
  }

  private clearTimer(): void {
    if (this.timer == null) return;
    window.clearTimeout(this.timer);
    this.timer = null;
  }

  private watchDocument(doc: Document): void {
    if (this.watched.has(doc)) return;
    this.watched.add(doc);
    this.registerDomEvent(doc, "visibilitychange", () => this.onVisibility());
  }

  private onVisibility(): void {
    let visible = false;
    for (const doc of this.watched) {
      if (doc.visibilityState === "visible") visible = true;
    }
    if (!visible) {
      if (this.hiddenAt == null) this.hiddenAt = Date.now();
      return;
    }
    if (this.hiddenAt == null) return;
    const gap = Date.now() - this.hiddenAt;
    this.hiddenAt = null;
    const now = Date.now();
    if (gap >= 2000 && this.session.status === "RUNNING") {
      if (this.lastTick != null && now - this.lastTick < 2000) {
        this.refresh();
        return;
      }
      this.lastTick = now;
      const step = suspendSession(this.session, gap);
      this.adopt(step.state, this.ledger, step.events, now);
      return;
    }
    this.refresh();
  }

  private hiddenAt: number | null = null;

  private renameBound(from: string, to: string): void {
    this.ledger = this.ledger.rename(from, to);
    if (this.session.boundPath === from) this.session = { ...this.session, boundPath: to };
    if (this.lastNotePath === from) this.lastNotePath = to;
    if (this.pending?.boundPath === from) this.pending = { ...this.pending, boundPath: to };
    if (this.completedPath === from) this.completedPath = to;
    this.refresh();
    this.schedulePersist();
  }

  private forgetBound(path: string): void {
    this.ledger = this.ledger.drop(path);
    if (this.lastNotePath === path) this.lastNotePath = null;
    if (this.completedPath === path) this.completedPath = null;
    this.refresh();
  }

  private refresh(): void {
    const model = this.getHud();
    for (const leaf of this.app.workspace.getLeavesOfType(VIEW_TYPE)) {
      const view = leaf.view;
      if (view instanceof FocusFlowView) view.render(model);
    }
    if (this.statusEl) renderStatus(this.statusEl, model);
  }

  private schedulePersist(): void {
    if (this.persistTimer != null) return;
    this.persistTimer = window.setTimeout(() => {
      this.persistTimer = null;
      void this.persistNow();
    }, 2000);
  }

  private async persistNow(): Promise<void> {
    this.data.settings = this.settings;
    this.data.records = this.records;
    this.data.history = this.history;
    this.data.activeSession =
      toSnapshot(this.session, Date.now()) ?? (this.session.status === "IDLE" ? this.pending : null);
    try {
      await this.saveData(this.data);
    } catch (error) {
      console.error("Focus Flow could not save its data.", error);
    }
  }

  private async reloadSettings(): Promise<void> {
    const data = migrate(await this.loadData());
    this.settings = data.settings;
    this.chime.enabled = this.settings.audioEnabled;
    this.data.settings = this.settings;
    this.refresh();
  }
}

interface AppWithSettings {
  setting?: {
    open(): void;
    openTabById(id: string): void;
  };
}

function configSettings() {
  return migrate(null).settings;
}

function isMarkdownNote(view: MarkdownView | null): view is MarkdownView & { file: TFile } {
  return view?.file?.extension === "md" && view.editor != null;
}

function baseName(path: string): string {
  const slash = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return path.slice(slash + 1);
}

function statusText(state: SessionState, hideTimer: boolean, delta: number, remainingMs: number): string {
  if (state.status === "IDLE" || state.status === "COMPLETED") return "Focus Flow";
  const phase = state.phase === "WRITING" ? "Writing" : "Thinking";
  const marked = formatDelta(delta);
  if (hideTimer) return `${phase} · ${marked}`;
  const prefix = state.status === "PAUSED" ? "Paused" : phase;
  return `${prefix} ${formatClock(remainingMs)} · ${marked}`;
}
