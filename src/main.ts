import { MarkdownView, normalizePath, Notice, Platform, Plugin, TFile } from "obsidian";
import { activeMs, writingMs } from "./engine/clock";
import { noteDelta, notesDelta } from "./engine/obsidian-count";
import { buildCallout, brokenLabels, deltaTone, formatDelta } from "./engine/format";
import { dismissSession, endSession, startSession, suspendSession, tickSession, type EngineEvent } from "./engine/fsm";
import { targetWords } from "./engine/ghost";
import { applyMarathon, applySessionDelta, applySprintPace, applyVolume } from "./engine/records";
import { sprintPaceWph } from "./engine/sprint-pace";
import { applyEdit } from "./engine/session";
import { isMarkdownPath, obsidianWordCount, type PreparedEdit } from "./engine/word-ledger";
import { appendCallout } from "./obsidian/callout";
import { createEditorExtension, type EditorGate } from "./obsidian/editor-bridge";
import { FocusFlowView } from "./obsidian/sidebar-view";
import { renderStatus } from "./obsidian/status-bar";
import { migrate, pushHistory, sessionFromSnapshot, toSnapshot } from "./persistence/store";
import { FocusFlowSettingTab } from "./settings";
import {
  emptyRecords,
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

export default class FocusFlowPlugin extends Plugin {
  settings = configSettings();
  private data: PersistedData = migrate(null);
  private session: SessionState = idleSession();
  private records: HighScores = this.data.records;
  private history: SessionRecord[] = [];
  private pending: ActiveSessionSnapshot | null = null;
  private recordsAtStart: HighScores = this.data.records;
  private frozenScoreSession: number | null = null;
  private debrief: Debrief | null = null;
  private completedPath: string | null = null;
  private lastTick: number | null = null;
  private timer: number | null = null;
  private persistTimer: number | null = null;
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
    this.frozenScoreSession = this.data.frozenScoreSession;
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
        this.seedOpenNote();
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
    this.data.settings = this.settings;
    await this.persistNow();
    this.refresh();
  }

  resetHighScores(): void {
    this.records = emptyRecords();
    this.recordsAtStart = emptyRecords();
    this.frozenScoreSession =
      this.session.status === "RUNNING" && this.session.startedAt != null ? this.session.startedAt : null;
    this.refresh();
    void this.persistNow();
    new Notice("High scores reset.");
  }

  getHud(): HudModel {
    const now = Date.now();
    const target = targetWords(this.settings.wordsPerHour, activeMs(this.session, now));
    const delta = this.session.credit - target;
    const tone = deltaTone(this.debrief && this.session.status === "COMPLETED" ? this.debrief.delta : delta);
    const note = this.writingView();
    const activeFile = note?.file ?? null;
    const activePath = activeFile ? normalizePath(activeFile.path) : null;
    const shownDelta = this.session.status === "COMPLETED" && this.debrief ? this.debrief.delta : delta;
    return {
      status: this.session.status,
      activeFileName: activeFile ? baseName(activeFile.path) : null,
      canStart: this.session.status === "IDLE",
      resumeAvailable: this.pending != null && this.session.status === "IDLE",
      actualWords: this.session.credit,
      targetWords: target,
      delta: shownDelta,
      tone,
      deltaLabel: tone,
      burstWords: this.session.burstWords,
      noteDelta: noteDelta(this.session.noteCounts, activePath),
      notesDelta: notesDelta(this.session.noteCounts),
      noteFiles: Object.keys(this.session.noteCounts).length,
      records: this.records,
      debrief: this.session.status === "COMPLETED" ? this.debrief : null,
      statusText: statusText(this.session, shownDelta),
    };
  }

  start(): void {
    if (this.session.status !== "IDLE") return;
    this.pending = null;
    this.debrief = null;
    this.completedPath = null;
    this.recordsAtStart = { ...this.records };
    this.frozenScoreSession = null;
    const view = this.writingView();
    const path = view?.file ? normalizePath(view.file.path) : null;
    const now = Date.now();
    this.lastTick = now;
    const step = startSession(now, path);
    this.adopt(step.state, step.events, now);
    this.seedOpenNote();
    this.refresh();
  }

  resumeSaved(): void {
    if (!this.pending || this.session.status !== "IDLE") return;
    const now = Date.now();
    const state = sessionFromSnapshot(this.pending, now);
    this.recordsAtStart = { ...this.records };
    this.pending = null;
    this.debrief = null;
    this.lastTick = now;
    this.adopt(state, [], now);
    this.seedOpenNote();
    this.refresh();
  }

  end(): void {
    const now = Date.now();
    const step = endSession(this.session, now);
    this.adopt(step.state, step.events, now);
  }

  dismiss(): void {
    const step = dismissSession();
    this.debrief = null;
    this.completedPath = null;
    this.pending = null;
    this.adopt(step.state, step.events, Date.now());
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
      id: "end-session",
      name: "Stop session",
      checkCallback: (checking) => {
        const ready = this.session.status === "RUNNING";
        if (ready && !checking) this.end();
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
    const step = applyEdit(this.session, edit, now);
    this.adopt(step.state, step.events, now);
  }

  private adopt(state: SessionState, events: EngineEvent[], now: number): void {
    const statusBefore = this.session.status;
    this.session = state;
    if (this.scoresOpen(state)) {
      let records = applySprintPace(this.records, sprintPaceWph(state.sprintPoints, writingMs(state, now)), now);
      records = applyVolume(records, state.credit, now);
      records = applyMarathon(records, activeMs(state, now), now);
      this.records = records;
    }
    this.gate.listening = state.status === "RUNNING";

    for (const event of events) {
      if (event.type === "completed") {
        const delta = state.credit - targetWords(this.settings.wordsPerHour, state.accumulatedTrackingMs);
        if (this.scoresOpen(state)) this.records = applySessionDelta(this.records, delta, now);
        this.completedPath = this.writingView()?.file?.path ?? state.boundPath ?? this.completedPath;
        this.debrief = this.makeDebrief(state);
        this.history = pushHistory(this.history, this.makeRecord(state, now));
      }
    }

    if (state.status === "RUNNING") this.armTimer();
    else this.clearTimer();
    this.refresh();
    if (events.some((event) => event.type === "completed") || statusBefore !== state.status) void this.persistNow();
    else this.schedulePersist();
  }

  private makeDebrief(state: SessionState): Debrief {
    const target = targetWords(this.settings.wordsPerHour, state.accumulatedTrackingMs);
    const delta = state.credit - target;
    return {
      words: state.credit,
      targetWords: target,
      delta,
      activeMs: state.accumulatedTrackingMs,
      burstWords: state.burstWords,
      notesDelta: notesDelta(state.noteCounts),
      broken: brokenLabels(this.recordsAtStart, this.records),
      callout: buildCallout({
        words: state.credit,
        targetWords: target,
        delta,
        activeMs: state.accumulatedTrackingMs,
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
      activeDurationMs: state.accumulatedTrackingMs,
      roundsCompleted: 0,
      peakIntervalWph: 0,
      filePath: state.boundPath ?? "",
      goalMet: false,
      burstWords: state.burstWords,
    };
  }

  private onTick(): void {
    const now = Date.now();
    const step = tickSession(this.session, now, this.lastTick);
    this.lastTick = now;
    if (step.state !== this.session || step.events.length > 0) {
      this.adopt(step.state, step.events, now);
      return;
    }
    if (this.scoresOpen(this.session)) {
      this.records = applyMarathon(this.records, activeMs(this.session, now), now);
      this.records = applySprintPace(
        this.records,
        sprintPaceWph(this.session.sprintPoints, writingMs(this.session, now)),
        now,
      );
    }
    this.refresh();
    this.schedulePersist();
    this.armTimer();
  }

  private armTimer(): void {
    this.clearTimer();
    if (this.session.status !== "RUNNING") return;
    this.timer = window.setTimeout(() => this.onTick(), 1000);
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
      this.adopt(step.state, step.events, now);
      return;
    }
    this.refresh();
  }

  private hiddenAt: number | null = null;

  private seedOpenNote(): void {
    if (this.session.status !== "RUNNING") return;
    const view = this.writingView();
    const file = view?.file;
    const editor = view?.editor;
    if (!file || !editor) return;
    const path = normalizePath(file.path);
    if (!isMarkdownPath(path) || this.session.noteCounts[path]) return;
    const words = obsidianWordCount(editor.getValue());
    this.session = {
      ...this.session,
      noteCounts: { ...this.session.noteCounts, [path]: { baseline: words, current: words } },
    };
    this.schedulePersist();
  }

  private renameBound(from: string, to: string): void {
    if (this.session.boundPath === from) this.session = { ...this.session, boundPath: to };
    const counted = this.session.noteCounts[from];
    if (counted) {
      const noteCounts = { ...this.session.noteCounts };
      noteCounts[to] = counted;
      delete noteCounts[from];
      this.session = { ...this.session, noteCounts };
    }
    if (this.lastNotePath === from) this.lastNotePath = to;
    if (this.pending?.boundPath === from) this.pending = { ...this.pending, boundPath: to };
    if (this.completedPath === from) this.completedPath = to;
    this.refresh();
    this.schedulePersist();
  }

  private forgetBound(path: string): void {
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
    this.data.frozenScoreSession = this.frozenScoreSession;
    this.data.activeSession =
      toSnapshot(this.session, Date.now()) ?? (this.session.status === "IDLE" ? this.pending : null);
    try {
      await this.saveData(this.data);
    } catch (error) {
      console.error("Focus Flow could not save its data.", error);
    }
  }

  private scoresOpen(state: SessionState): boolean {
    return this.frozenScoreSession == null || state.startedAt !== this.frozenScoreSession;
  }

  private async reloadSettings(): Promise<void> {
    const data = migrate(await this.loadData());
    this.settings = data.settings;
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

function statusText(state: SessionState, delta: number): string {
  if (state.status !== "RUNNING") return "Focus Flow";
  return `${formatDelta(delta)} · ${state.credit} words`;
}
