import type { HudModel } from "../types";

export function renderStatus(el: HTMLElement, model: HudModel): void {
  el.empty();
  el.createSpan({
    text: model.statusText,
    cls: `focus-flow-status is-${model.tone}`,
  });
  el.toggleClass("is-celebrating", model.celebrate);
}
