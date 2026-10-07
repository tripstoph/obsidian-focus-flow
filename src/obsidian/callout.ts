import { MarkdownView, normalizePath, TFile, type App } from "obsidian";

export async function appendCallout(app: App, path: string, markdown: string): Promise<void> {
  const file = app.vault.getFileByPath(normalizePath(path));
  if (!(file instanceof TFile)) return;
  const active = app.workspace.getActiveViewOfType(MarkdownView);
  if (active?.file?.path === file.path && active.editor) {
    const editor = active.editor;
    const last = editor.lastLine();
    const line = editor.getLine(last);
    const value = editor.getValue();
    const separator = value.length === 0 ? "" : value.endsWith("\n") ? "\n" : "\n\n";
    editor.replaceRange(`${separator}${markdown}\n`, { line: last, ch: line.length });
    return;
  }
  await app.vault.process(file, (data) => {
    const separator = data.length === 0 ? "" : data.endsWith("\n") ? "\n" : "\n\n";
    return `${data}${separator}${markdown}\n`;
  });
}
