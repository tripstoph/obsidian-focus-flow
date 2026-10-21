import { ChangeSet, type ChangeDesc } from "@codemirror/state";

const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;
const WORD_CHAR = /[\p{L}\p{N}'’-]/u;
export const PASTE_WORD_THRESHOLD = 40;

export interface TextChange {
  fromA: number;
  toA: number;
  fromB: number;
  toB: number;
  inserted: string;
  deleted: string;
  left: string;
  right: string;
}

export interface PreparedEdit {
  path: string;
  oldLength: number;
  newLength: number;
  frontmatterEnd: number;
  changes: TextChange[];
  changeSet: ChangeDesc;
  userEvent: string | null;
  wordsBefore: number;
  wordsAfter: number;
}

export interface TypedWords {
  typed: number;
  burst: number;
}

export function wordsTypedInEdit(edit: PreparedEdit): TypedWords {
  let typed = 0;
  let burst = 0;
  for (const change of edit.changes) {
    if (isInsideFrontmatter(change, edit.frontmatterEnd)) continue;
    const added = wordsAdded(change);
    if (added <= 0) continue;
    if (added >= PASTE_WORD_THRESHOLD) burst += added;
    else typed += added;
  }
  return { typed, burst };
}

export function wordsRemovedInEdit(edit: PreparedEdit): number {
  let removed = 0;
  for (const change of edit.changes) {
    if (isInsideFrontmatter(change, edit.frontmatterEnd)) continue;
    removed += wordsRemoved(change);
  }
  return removed;
}

export function isWordChar(char: string): boolean {
  return WORD_CHAR.test(char);
}

export function countWords(text: string): number {
  WORD.lastIndex = 0;
  const matches = text.match(WORD);
  WORD.lastIndex = 0;
  return matches ? matches.length : 0;
}

export function frontmatterEnd(head: string): number {
  if (!head.startsWith("---")) return 0;
  const close = head.indexOf("\n---", 3);
  if (close < 0) return 0;
  let end = close + 4;
  if (head.charAt(end) === "\r") end += 1;
  if (head.charAt(end) === "\n") end += 1;
  return end;
}

export function trimContextBefore(slice: string, truncated: boolean): string {
  let index = slice.length;
  while (index > 0 && isWordChar(slice.charAt(index - 1))) index -= 1;
  if (index === 0 && truncated) return slice;
  return slice.slice(index);
}

export function trimContextAfter(slice: string, truncated: boolean): string {
  let index = 0;
  while (index < slice.length && isWordChar(slice.charAt(index))) index += 1;
  if (index === slice.length && truncated) return slice;
  return slice.slice(0, index);
}

export function obsidianWordCount(text: string): number {
  const end = frontmatterEnd(text);
  const body = end > 0 ? text.slice(end) : text;
  const matches = body.match(/\S+/g);
  return matches ? matches.length : 0;
}

export function isMarkdownPath(path: string): boolean {
  return path.toLowerCase().endsWith(".md");
}

export function editInDocument(
  doc: string,
  from: number,
  to: number,
  insert: string,
  path = "note.md",
  matterEnd = frontmatterEnd(doc.slice(0, Math.min(doc.length, 20_000))),
  userEvent: string | null = "input",
): PreparedEdit {
  const deleted = doc.slice(from, to);
  const next = doc.slice(0, from) + insert + doc.slice(to);
  const leftSliceStart = Math.max(0, from - 80);
  const rightSliceEnd = Math.min(doc.length, to + 80);
  const changeSet = ChangeSet.of([{ from, to, insert }], doc.length);
  return {
    path,
    oldLength: doc.length,
    newLength: doc.length - (to - from) + insert.length,
    frontmatterEnd: matterEnd,
    changeSet,
    changes: [
      {
        fromA: from,
        toA: to,
        fromB: from,
        toB: from + insert.length,
        inserted: insert,
        deleted,
        left: trimContextBefore(doc.slice(leftSliceStart, from), leftSliceStart > 0),
        right: trimContextAfter(doc.slice(to, rightSliceEnd), rightSliceEnd < doc.length),
      },
    ],
    userEvent,
    wordsBefore: obsidianWordCount(doc),
    wordsAfter: obsidianWordCount(next),
  };
}

function isInsideFrontmatter(change: TextChange, end: number): boolean {
  return end > 0 && change.fromA >= 0 && change.toA <= end;
}

function wordsAdded(change: TextChange): number {
  const before = countWords(change.left + change.right);
  const after = countWords(change.left + change.inserted + change.right);
  return Math.max(0, after - before);
}

function wordsRemoved(change: TextChange): number {
  const before = countWords(change.left + change.deleted + change.right);
  const after = countWords(change.left + change.inserted + change.right);
  return Math.max(0, before - after);
}
