import { MarkdownView, normalizePath, Platform, Plugin, TFile } from "obsidian";
import { trackingMs } from "./engine/clock";
import { buildCallout, deltaTone, formatDelta } from "./engine/format";
import { dismissSession, endSession, startSession, type EngineEvent } from "./engine/fsm";
import { targetWords } from "./engine/ghost";
import { applyEdit } from "./engine/session";
import type { PreparedEdit } from "./engine/word-ledger";
import { appendCallout } from "./obsidian/callout";
import { createEditorExtension, type EditorGate } from "./obsidian/editor-bridge";
import { FocusFlowView } from "./obsidian/sidebar-view";
import { renderStatus } from "./obsidian/status-bar";
import { migrate, pushHistory, sessionFromSnapshot, toSnapshot } from "./persistence/store";
import { FocusFlowSettingTab } from "./settings";
import {
  idleSession,
  VIEW_TYPE,
  type ActiveSessionSnapshot,
  type Debrief,
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
  private history: SessionRecord[] = [];
  private pending: ActiveSessionSnapshot | null = null;
  private debrief: Debrief | null = null;
  private completedPath: string | null = null;
  private timer: number | null = null;
  private persistTimer: number | null = null;
  private readonly editorExtension: Extension[] = [];
  private readonly gate: EditorGate = {
    listening: false,
    onEdit: () => {},
  };
  private statusEl: HTMLElement | null = null;

  async onload(): Promise<void> {
    this.data = migrate(await this.loadData());
    this.settings = this.data.settings;
    this.history = this.data.history;
    this.pending = this.data.activeSession;
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
      this.continueSaved();
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

  getHud(): HudModel {
    const now = Date.now();
    const target = targetWords(this.settings.wordsPerHour, trackingMs(this.session, now));
    const delta = this.session.credit - target;
    const tone = deltaTone(this.debrief && this.session.status === "COMPLETED" ? this.debrief.delta : delta);
    const note = this.writingView();
    const activeFile = note?.file ?? null;
    const shownDelta = this.session.status === "COMPLETED" && this.debrief ? this.debrief.delta : delta;
    return {
      status: this.session.status,
      activeFileName: activeFile ? baseName(activeFile.path) : null,
      canStart: this.session.status === "IDLE",
      actualWords: this.session.credit,
      targetWords: target,
      delta: shownDelta,
      tone,
      deltaLabel: tone,
      debrief: this.session.status === "COMPLETED" ? this.debrief : null,
      statusText: statusText(this.session, shownDelta),
    };
  }

  start(): void {
    if (this.session.status !== "IDLE") return;
    this.pending = null;
    this.debrief = null;
    this.completedPath = null;
    const view = this.writingView();
    const path = view?.file ? normalizePath(view.file.path) : null;
    const now = Date.now();
    const step = startSession(now, path);
    this.adopt(step.state, step.events, now);
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
    const step = applyEdit(this.session, edit);
    this.adopt(step.state, step.events, now);
  }

  private adopt(state: SessionState, events: EngineEvent[], now: number): void {
    const statusBefore = this.session.status;
    this.session = state;
    this.gate.listening = state.status === "RUNNING";

    for (const event of events) {
      if (event.type === "completed") {
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
      callout: buildCallout({
        words: state.credit,
        targetWords: target,
        delta,
        activeMs: state.accumulatedTrackingMs,
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
      burstWords: 0,
    };
  }

  private onTick(): void {
    this.timer = null;
    if (this.session.status !== "RUNNING") return;
    this.refresh();
    this.schedulePersist();
    this.armTimer();
  }

  private armTimer(): void {
    if (this.session.status !== "RUNNING") {
      this.clearTimer();
      return;
    }
    if (this.timer != null) return;
    this.timer = window.setTimeout(() => this.onTick(), 1000);
  }

  private clearTimer(): void {
    if (this.timer == null) return;
    window.clearTimeout(this.timer);
    this.timer = null;
  }

  private continueSaved(): void {
    if (!this.pending || this.session.status !== "IDLE") return;
    const now = Date.now();
    const state = sessionFromSnapshot(this.pending, now);
    this.pending = null;
    this.debrief = null;
    this.adopt(state, [], now);
  }

  private renameBound(from: string, to: string): void {
    if (this.session.boundPath === from) this.session = { ...this.session, boundPath: to };
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
