import {
  App,
  DropdownComponent,
  PluginSettingTab,
  requireApiVersion,
  Setting,
  TextComponent,
  type SettingDefinitionItem,
  type ToggleComponent,
} from "obsidian";
import { formatPace, formatThinkingBurden } from "./engine/format";
import {
  parseMaxRounds,
  parseMinutes,
  parseWordGoal,
  parseWordsPerHour,
} from "./engine/validate";
import type FocusFlowPlugin from "./main";
import type { FocusFlowSettings } from "./types";

export class FocusFlowSettingTab extends PluginSettingTab {
  private paceEl: HTMLElement | null = null;
  private burdenEl: HTMLElement | null = null;
  private hideBehindToggle: ToggleComponent | null = null;
  private roundLimit: TextComponent | null = null;
  private wordGoal: TextComponent | null = null;
  private finishWhen: DropdownComponent | null = null;
  private infiniteSetting: Setting | null = null;

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
    this.addNumber(containerEl, "Thinking duration", "Minutes, from 0.5 to 180.", String(settings.thinkingMinutes), (value) => {
      const parsed = parseMinutes(value);
      if (parsed == null) return "Enter a duration from 0.5 to 180 minutes.";
      settings.thinkingMinutes = parsed;
      return null;
    });
    this.addNumber(containerEl, "Writing duration", "Minutes, from 0.5 to 180.", String(settings.writingMinutes), (value) => {
      const parsed = parseMinutes(value);
      if (parsed == null) return "Enter a duration from 0.5 to 180 minutes.";
      settings.writingMinutes = parsed;
      return null;
    });

    new Setting(containerEl)
      .setName("Count thinking time toward the pace")
      .setDesc("The ghost keeps moving during thinking, so the writing sprint has a little catching up to do.")
      .addToggle((toggle) =>
        toggle.setValue(settings.thinkingCountsTowardTarget).onChange(async (value) => {
          settings.thinkingCountsTowardTarget = value;
          this.hideBehindToggle?.setDisabled(!value);
          await this.persist();
        }),
      );
    this.burdenEl = containerEl.createEl("p", {
      cls: "focus-flow-pace",
      text: formatThinkingBurden(settings),
    });
    new Setting(containerEl)
      .setName("Hide the ghost during thinking")
      .setDesc("The behind count stays hidden while you think. Those words are spread evenly across the next writing interval.")
      .addToggle((toggle) => {
        this.hideBehindToggle = toggle;
        toggle.setValue(settings.hideBehindDuringThinking).setDisabled(!settings.thinkingCountsTowardTarget);
        toggle.onChange(async (value) => {
          settings.hideBehindDuringThinking = value;
          await this.persist();
        });
      });

    new Setting(containerEl).setName("Session end").setHeading();
    new Setting(containerEl)
      .setName("Maximum rounds")
      .setDesc("End after this many writing intervals, when the limit is on.")
      .addToggle((toggle) =>
        toggle.setValue(settings.maxRoundsEnabled).onChange(async (value) => {
          settings.maxRoundsEnabled = value;
          this.roundLimit?.setDisabled(!value);
          this.syncFinishWhen();
          await this.persist();
        }),
      );
    this.roundLimit = this.addNumber(containerEl, "Round limit", "A whole number from 1 to 99.", String(settings.maxRounds), (value) => {
      const parsed = parseMaxRounds(value);
      if (parsed == null) return "Enter a whole number from 1 to 99.";
      settings.maxRounds = parsed;
      return null;
    }, !settings.maxRoundsEnabled);

    new Setting(containerEl)
      .setName("Word goal")
      .setDesc("End after this many sprint words, when the goal is on.")
      .addToggle((toggle) =>
        toggle.setValue(settings.wordGoalEnabled).onChange(async (value) => {
          settings.wordGoalEnabled = value;
          this.wordGoal?.setDisabled(!value);
          this.syncFinishWhen();
          await this.persist();
        }),
      );
    this.wordGoal = this.addNumber(containerEl, "Words in the goal", "A whole number from 1 to 100,000.", String(settings.wordGoal), (value) => {
      const parsed = parseWordGoal(value);
      if (parsed == null) return "Enter a whole number from 1 to 100,000.";
      settings.wordGoal = parsed;
      return null;
    }, !settings.wordGoalEnabled);

    new Setting(containerEl)
      .setName("Finish when")
      .setDesc("Used when both a round limit and a word goal are on.")
      .addDropdown((dropdown) => {
        this.finishWhen = dropdown;
        dropdown.addOption("OR", "Either limit").addOption("AND", "Both limits").setValue(settings.terminationOperator);
        dropdown.setDisabled(!(settings.maxRoundsEnabled && settings.wordGoalEnabled));
        dropdown.onChange(async (value) => {
          settings.terminationOperator = value === "AND" ? "AND" : "OR";
          await this.persist();
        });
      });

    this.infiniteSetting = new Setting(containerEl)
      .setName("Keep going after the goal")
      .setDesc(infiniteDesc(settings.infiniteMode))
      .addToggle((toggle) =>
        toggle.setValue(settings.infiniteMode).onChange(async (value) => {
          settings.infiniteMode = value;
          this.infiniteSetting?.setDesc(infiniteDesc(value));
          await this.persist();
        }),
      );

    new Setting(containerEl).setName("Display").setHeading();
    new Setting(containerEl)
      .setName("Hide the timer")
      .setDesc("Show the phase and the word delta without a numeric countdown.")
      .addToggle((toggle) =>
        toggle.setValue(settings.hideTimer).onChange(async (value) => {
          settings.hideTimer = value;
          await this.persist();
        }),
      );
    new Setting(containerEl)
      .setName("Play a soft chime")
      .setDesc("A short tone marks the next interval. No audio files are used.")
      .addToggle((toggle) =>
        toggle.setValue(settings.audioEnabled).onChange(async (value) => {
          settings.audioEnabled = value;
          await this.persist();
        }),
      );
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
        name: "Thinking duration",
        desc: "Minutes, from 0.5 to 180.",
        control: {
          type: "text",
          key: "thinkingMinutes",
          validate: (value) => (parseMinutes(value) == null ? "Enter a duration from 0.5 to 180 minutes." : undefined),
        },
      },
      {
        name: "Writing duration",
        desc: "Minutes, from 0.5 to 180.",
        control: {
          type: "text",
          key: "writingMinutes",
          validate: (value) => (parseMinutes(value) == null ? "Enter a duration from 0.5 to 180 minutes." : undefined),
        },
      },
      {
        name: "Count thinking time toward the pace",
        desc: "The ghost keeps moving during thinking, so the writing sprint has a little catching up to do.",
        control: { type: "toggle", key: "thinkingCountsTowardTarget" },
      },
      {
        name: "Writing pace if thinking counts",
        desc: formatThinkingBurden(settings),
        render: (setting) => {
          this.burdenEl = setting.descEl;
          setting.descEl.setText(formatThinkingBurden(this.focus.settings));
        },
      },
      {
        name: "Hide the ghost during thinking",
        desc: "The behind count stays hidden while you think. Those words are spread evenly across the next writing interval.",
        control: {
          type: "toggle",
          key: "hideBehindDuringThinking",
          disabled: () => !this.focus.settings.thinkingCountsTowardTarget,
        },
      },
      {
        type: "group",
        heading: "Session end",
        items: [
          {
            name: "Maximum rounds",
            desc: "End after this many writing intervals, when the limit is on.",
            control: { type: "toggle", key: "maxRoundsEnabled" },
          },
          {
            name: "Round limit",
            desc: "A whole number from 1 to 99.",
            control: {
              type: "text",
              key: "maxRounds",
              validate: (value) => (parseMaxRounds(value) == null ? "Enter a whole number from 1 to 99." : undefined),
              disabled: () => !this.focus.settings.maxRoundsEnabled,
            },
          },
          {
            name: "Word goal",
            desc: "End after this many sprint words, when the goal is on.",
            control: { type: "toggle", key: "wordGoalEnabled" },
          },
          {
            name: "Words in the goal",
            desc: "A whole number from 1 to 100,000.",
            control: {
              type: "text",
              key: "wordGoal",
              validate: (value) => (parseWordGoal(value) == null ? "Enter a whole number from 1 to 100,000." : undefined),
              disabled: () => !this.focus.settings.wordGoalEnabled,
            },
          },
          {
            name: "Finish when",
            desc: "Used when both a round limit and a word goal are on.",
            control: {
              type: "dropdown",
              key: "terminationOperator",
              options: { OR: "Either limit", AND: "Both limits" },
              disabled: () => !(this.focus.settings.maxRoundsEnabled && this.focus.settings.wordGoalEnabled),
            },
          },
          {
            name: "Keep going after the goal",
            desc: "Reaching a goal plays a celebration and the session keeps going until you end it.",
            control: { type: "toggle", key: "infiniteMode" },
          },
        ],
      },
      {
        type: "group",
        heading: "Display",
        items: [
          {
            name: "Hide the timer",
            desc: "Show the phase and the word delta without a numeric countdown.",
            control: { type: "toggle", key: "hideTimer" },
          },
          {
            name: "Play a soft chime",
            desc: "A short tone marks the next interval. No audio files are used.",
            control: { type: "toggle", key: "audioEnabled" },
          },
        ],
      },
    ];
  }

  override getControlValue(key: string): unknown {
    const value = this.focus.settings[key as keyof FocusFlowSettings];
    return typeof value === "number" ? String(value) : value;
  }

  override async setControlValue(key: string, value: unknown): Promise<void> {
    const settings = this.focus.settings;
    if (key === "wordsPerHour" && typeof value === "string") {
      const parsed = parseWordsPerHour(value);
      if (parsed == null) return;
      settings.wordsPerHour = parsed;
    } else if ((key === "thinkingMinutes" || key === "writingMinutes") && typeof value === "string") {
      const parsed = parseMinutes(value);
      if (parsed == null) return;
      settings[key] = parsed;
    } else if (key === "maxRounds" && typeof value === "string") {
      const parsed = parseMaxRounds(value);
      if (parsed == null) return;
      settings.maxRounds = parsed;
    } else if (key === "wordGoal" && typeof value === "string") {
      const parsed = parseWordGoal(value);
      if (parsed == null) return;
      settings.wordGoal = parsed;
    } else if (key === "terminationOperator" && (value === "AND" || value === "OR")) {
      settings.terminationOperator = value;
    } else if (
      (key === "maxRoundsEnabled" ||
        key === "wordGoalEnabled" ||
        key === "infiniteMode" ||
        key === "hideTimer" ||
        key === "thinkingCountsTowardTarget" ||
        key === "hideBehindDuringThinking" ||
        key === "audioEnabled") &&
      typeof value === "boolean"
    ) {
      settings[key] = value;
    } else {
      return;
    }
    await this.persist();
    if (requireApiVersion("1.13.0")) this.refreshDomState();
  }

  private syncFinishWhen(): void {
    const settings = this.focus.settings;
    this.finishWhen?.setDisabled(!(settings.maxRoundsEnabled && settings.wordGoalEnabled));
  }

  private addNumber(
    containerEl: HTMLElement,
    name: string,
    desc: string,
    initial: string,
    apply: (value: string) => string | null,
    disabled = false,
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
      text.setDisabled(disabled);
    });
    return input;
  }

  private async persist(): Promise<void> {
    await this.focus.saveSettings();
    if (this.paceEl) this.paceEl.setText(formatPace(this.focus.settings));
    if (this.burdenEl) this.burdenEl.setText(formatThinkingBurden(this.focus.settings));
  }
}

function infiniteDesc(infiniteMode: boolean): string {
  return infiniteMode
    ? "Reaching a goal plays a celebration and the session keeps going until you end it."
    : "Reaching a goal ends the session and opens the summary.";
}
