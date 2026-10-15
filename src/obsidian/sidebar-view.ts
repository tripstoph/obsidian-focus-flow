import { ItemView, WorkspaceLeaf } from "obsidian";
import { formatActive, formatDelta, formatTarget } from "../engine/format";
import type { HudModel } from "../types";
import { VIEW_TYPE } from "../types";

export interface FocusFlowHost {
  getHud(): HudModel;
  start(): void;
  resumeSaved(): void;
  end(): void;
  dismiss(): void;
  insertCallout(): Promise<void>;
  openSettings(): void;
}

interface RunningRefs {
  root: HTMLElement;
  summary: HTMLElement;
  hero: HTMLElement;
  tone: HTMLElement;
  actual: HTMLElement;
  target: HTMLElement;
  note: HTMLElement;
}

export class FocusFlowView extends ItemView {
  private mode: "idle" | "running" | "completed" | null = null;
  private running: RunningRefs | null = null;
  private inserting = false;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly host: FocusFlowHost,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.host.getHud().statusText;
  }

  getIcon(): string {
    return "timer";
  }

  async onOpen(): Promise<void> {
    this.render(this.host.getHud());
  }

  render(model: HudModel): void {
    const mode = model.status === "COMPLETED" ? "completed" : model.status === "IDLE" ? "idle" : "running";
    if (mode !== this.mode) {
      this.mode = mode;
      this.contentEl.empty();
      this.running = null;
      if (mode === "idle") this.buildIdle();
      else if (mode === "running") this.buildRunning();
      else this.buildCompleted();
    }
    if (mode === "idle") this.patchIdle(model);
    else if (mode === "running" && this.running) this.patchRunning(model);
    else this.patchCompleted(model);
  }

  private buildIdle(): void {
    const root = this.contentEl.createDiv({ cls: "focus-flow" });
    root.createEl("p", { cls: "focus-flow-mobile-summary" });
    root.createEl("h3", { cls: "focus-flow-file", text: "Every note in the vault counts" });
    const actions = root.createDiv({ cls: "focus-flow-actions" });
    const resume = actions.createEl("button", {
      text: "Resume session",
      cls: "focus-flow-button focus-flow-resume is-hidden",
      attr: { type: "button" },
    });
    resume.addEventListener("click", () => this.host.resumeSaved());
    const start = actions.createEl("button", {
      text: "Start session",
      cls: "focus-flow-button focus-flow-start",
      attr: { type: "button" },
    });
    start.addEventListener("click", () => this.host.start());
    root.createEl("h4", { text: "Personal bests" });
    root.createEl("ul", { cls: "focus-flow-records" });
    const settings = root.createEl("button", { text: "Open settings", cls: "focus-flow-button", attr: { type: "button" } });
    settings.addEventListener("click", () => this.host.openSettings());
  }

  private patchIdle(model: HudModel): void {
    const root = this.contentEl.querySelector(".focus-flow");
    if (!root) return;
    const file = root.querySelector(".focus-flow-file");
    if (file) file.setText("Every note in the vault counts");
    const resume = root.querySelector(".focus-flow-resume");
    if (resume) resume.toggleClass("is-hidden", !model.resumeAvailable);
    const start = root.querySelector(".focus-flow-start");
    if (start instanceof HTMLButtonElement) start.disabled = !model.canStart;
    const list = root.querySelector(".focus-flow-records");
    if (list instanceof HTMLElement) {
      list.empty();
      for (const line of recordLines(model)) list.createEl("li", { text: line });
    }
  }

  private buildRunning(): void {
    const root = this.contentEl.createDiv({ cls: "focus-flow" });
    const summary = root.createEl("p", { cls: "focus-flow-mobile-summary" });
    const hero = root.createDiv({ cls: "focus-flow-hero" });
    const value = hero.createEl("p", { cls: "focus-flow-delta" });
    const tone = hero.createEl("p", { cls: "focus-flow-tone" });
    for (let index = 0; index < 8; index += 1) {
      hero.createDiv({ cls: "focus-flow-particle", attr: { "aria-hidden": "true" } });
    }
    const counts = root.createDiv({ cls: "focus-flow-counts" });
    const actual = counts.createEl("p", { cls: "focus-flow-actual" });
    const target = counts.createEl("p", { cls: "focus-flow-target" });
    const note = root.createEl("p", { cls: "focus-flow-note", text: "Whole vault" });
    const controls = root.createDiv({ cls: "focus-flow-controls" });
    this.button(controls, "Stop session", () => this.host.end());
    this.running = { root, summary, hero: value, tone, actual, target, note };
  }

  private patchRunning(model: HudModel): void {
    const refs = this.running;
    if (!refs) return;
    refs.summary.setText(model.statusText);
    refs.hero.className = `focus-flow-delta is-${model.tone}`;
    refs.hero.setText(formatDelta(model.delta));
    refs.hero.setAttr("aria-label", `${formatDelta(model.delta)} ${model.tone}`);
    refs.tone.setText(model.tone);
    refs.actual.setText(`Words typed ${model.actualWords}`);
    refs.target.setText(`Ghost target ${formatTarget(model.targetWords)}`);
    refs.note.setText("Whole vault");
  }

  private buildCompleted(): void {
    const root = this.contentEl.createDiv({ cls: "focus-flow is-completed" });
    root.createEl("p", { cls: "focus-flow-banner", text: "Session complete" });
    const hero = root.createDiv({ cls: "focus-flow-hero" });
    hero.createEl("p", { cls: "focus-flow-delta" });
    hero.createEl("p", { cls: "focus-flow-tone" });
    for (let index = 0; index < 8; index += 1) {
      hero.createDiv({ cls: "focus-flow-particle", attr: { "aria-hidden": "true" } });
    }
    root.createEl("ul", { cls: "focus-flow-debrief" });
    root.createEl("ul", { cls: "focus-flow-broken" });
    root.createEl("p", { cls: "focus-flow-burst" });
    const insert = root.createEl("button", {
      text: "Insert session callout",
      cls: "focus-flow-button",
      attr: { type: "button" },
    });
    insert.addEventListener("click", () => {
      if (this.inserting) return;
      this.inserting = true;
      insert.disabled = true;
      void this.host.insertCallout().finally(() => {
        this.inserting = false;
        insert.disabled = false;
      });
    });
    const dismiss = root.createEl("button", { text: "Dismiss", cls: "focus-flow-button", attr: { type: "button" } });
    dismiss.addEventListener("click", () => this.host.dismiss());
  }

  private patchCompleted(model: HudModel): void {
    const root = this.contentEl.querySelector(".focus-flow");
    if (!root || !model.debrief) return;
    const delta = root.querySelector(".focus-flow-delta");
    const tone = root.querySelector(".focus-flow-tone");
    if (delta) {
      delta.setText(formatDelta(model.debrief.delta));
      delta.className = `focus-flow-delta is-${model.tone}`;
    }
    if (tone) tone.setText(model.tone);
    const list = root.querySelector(".focus-flow-debrief");
    if (list instanceof HTMLElement) {
      list.empty();
      list.createEl("li", { text: `Wrote ${model.debrief.words} words` });
      list.createEl("li", { text: `Ghost target ${formatTarget(model.debrief.targetWords)}` });
      list.createEl("li", { text: `Active ${formatActive(model.debrief.activeMs)}` });
    }
    const broken = root.querySelector(".focus-flow-broken");
    if (broken instanceof HTMLElement) {
      broken.empty();
      for (const label of model.debrief.broken) broken.createEl("li", { text: `New ${label.toLowerCase()}` });
    }
    const burst = root.querySelector(".focus-flow-burst");
    if (burst) {
      burst.setText(
        model.debrief.burstWords > 0 ? `Includes ${model.debrief.burstWords} words added in large pastes.` : "",
      );
    }
  }

  private button(parent: HTMLElement, text: string, onClick: () => void): void {
    const button = parent.createEl("button", { text, cls: "focus-flow-button", attr: { type: "button" } });
    button.addEventListener("click", onClick);
  }
}

function recordLines(model: HudModel): string[] {
  const records = model.records;
  if (
    records.apexSprintWph === 0 &&
    records.volumeRecordWords === 0 &&
    records.flowMarathonMs === 0 &&
    records.positiveDeltaStreak === 0
  ) {
    return ["No sessions yet"];
  }
  return [
    `Sprint pace ${Math.round(records.apexSprintWph)} words per hour`,
    `Volume record ${records.volumeRecordWords} words`,
    `Flow marathon ${formatActive(records.flowMarathonMs)}`,
    `Positive delta streak ${records.positiveDeltaStreak}`,
  ];
}
