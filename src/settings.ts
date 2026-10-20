import { App, PluginSettingTab, requireApiVersion, Setting, TextComponent, type SettingDefinitionItem } from "obsidian";
import { formatPace } from "./engine/format";
import { parseWordsPerHour } from "./engine/validate";
import type FocusFlowPlugin from "./main";
import type { FocusFlowSettings } from "./types";

export class FocusFlowSettingTab extends PluginSettingTab {
  private paceEl: HTMLElement | null = null;

  constructor(
    app: App,
    private readonly focus: FocusFlowPlugin,
  ) {
    super(app, focus);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const settings = this.focus.settings;
    this.paceEl = containerEl.createEl("p", {
      cls: "focus-flow-pace",
      text: formatPace(settings),
    });
    this.addNumber(containerEl, "Words per hour", "Enter a whole number from 50 to 5,000.", String(settings.wordsPerHour), (value) => {
      const parsed = parseWordsPerHour(value);
      if (parsed == null) return "Enter a whole number from 50 to 5,000.";
      settings.wordsPerHour = parsed;
      return null;
    });
    const reset = new Setting(containerEl)
      .setName("High scores")
      .setDesc("Clear sprint pace, volume, marathon, and the positive delta streak.");
    this.addReset(reset);
  }

  override getSettingDefinitions(): SettingDefinitionItem[] {
    const settings = this.focus.settings;
    return [
      {
        name: "Current pace",
        desc: formatPace(settings),
        render: (setting) => {
          this.paceEl = setting.descEl;
          setting.descEl.setText(formatPace(this.focus.settings));
        },
      },
      {
        name: "Words per hour",
        desc: "Enter a whole number from 50 to 5,000.",
        control: {
          type: "text",
          key: "wordsPerHour",
          validate: (value) => (parseWordsPerHour(value) == null ? "Enter a whole number from 50 to 5,000." : undefined),
        },
      },
      {
        name: "High scores",
        desc: "Clear sprint pace, volume, marathon, and the positive delta streak.",
        render: (setting) => {
          this.addReset(setting);
        },
      },
    ];
  }

  override getControlValue(key: string): unknown {
    const value = this.focus.settings[key as keyof FocusFlowSettings];
    return typeof value === "number" ? String(value) : value;
  }

  override async setControlValue(key: string, value: unknown): Promise<void> {
    if (key !== "wordsPerHour" || typeof value !== "string") return;
    const parsed = parseWordsPerHour(value);
    if (parsed == null) return;
    this.focus.settings.wordsPerHour = parsed;
    await this.persist();
    if (requireApiVersion("1.13.0")) this.refreshDomState();
  }

  private addReset(setting: Setting): void {
    setting.addButton((button) => {
      button.setButtonText("Reset high scores").onClick(() => {
        this.focus.resetHighScores();
      });
      if (requireApiVersion("1.13.0")) button.setDestructive();
    });
  }

  private addNumber(
    containerEl: HTMLElement,
    name: string,
    desc: string,
    initial: string,
    apply: (value: string) => string | null,
  ): TextComponent {
    const setting = new Setting(containerEl).setName(name).setDesc(desc);
    let input!: TextComponent;
    setting.addText((text) => {
      input = text;
      text.setValue(initial).onChange(async (value) => {
        const error = apply(value);
        if (error) {
          setting.setDesc(error);
          return;
        }
        setting.setDesc(desc);
        await this.persist();
      });
    });
    return input;
  }

  private async persist(): Promise<void> {
    await this.focus.saveSettings();
    if (this.paceEl) this.paceEl.setText(formatPace(this.focus.settings));
  }
}
