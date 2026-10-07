import { ChangeSet, RangeSet, RangeValue, type ChangeDesc } from "@codemirror/state";
import type { SpanKind } from "../types";

const WORD = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;
const WORD_CHAR = /[\p{L}\p{N}'’-]/u;
export const PASTE_WORD_THRESHOLD = 40;

export class SpanMark extends RangeValue {
  endSide = -1;
  startSide = -1;

  constructor(
    readonly kind: SpanKind,
    readonly generation: number,
    readonly burst = false,
  ) {
    super();
  }

  eq(other: RangeValue): boolean {
    return (
      other instanceof SpanMark &&
      other.kind === this.kind &&
      other.generation === this.generation &&
      other.burst === this.burst
    );
  }
}

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
}

export interface LedgerEffect {
  ledger: WordLedger;
  sessionDelta: number;
  intervalDelta: number;
  burstDelta: number;
  sprintDelta: number;
}

export class WordLedger {
  readonly spans: RangeSet<SpanMark>;
  readonly docLength: number;
  readonly resynced: boolean;

  private constructor(spans: RangeSet<SpanMark>, docLength: number, resynced: boolean) {
    this.spans = spans;
    this.docLength = docLength;
    this.resynced = resynced;
  }

  static empty(docLength: number): WordLedger {
    return new WordLedger(RangeSet.empty as RangeSet<SpanMark>, docLength, false);
  }

  apply(edit: PreparedEdit, kind: SpanKind, generation: number): LedgerEffect {
    if (edit.oldLength !== this.docLength) {
      return {
        ledger: new WordLedger(RangeSet.empty as RangeSet<SpanMark>, edit.newLength, true),
        sessionDelta: 0,
        intervalDelta: 0,
        burstDelta: 0,
        sprintDelta: 0,
      };
    }

    let sessionDelta = 0;
    let intervalDelta = 0;
    let burstDelta = 0;
    let sprintDelta = 0;
    const mapped = this.spans.map(edit.changeSet);
    const additions: SpanAddition[] = [];

    for (const change of edit.changes) {
      const inside = isInsideFrontmatter(change, edit.frontmatterEnd);
      if (!inside && kind !== "paused") {
        const removed = removedWritingWords(this.spans, change, generation);
        if (kind === "writing" || kind === "thinking") {
          sessionDelta -= removed.session;
        }
        if (kind === "writing") {
          intervalDelta -= removed.interval;
          const addedWords = wordsAdded(change);
          sessionDelta += addedWords;
          intervalDelta += addedWords;
          if (addedWords >= PASTE_WORD_THRESHOLD) burstDelta += addedWords;
          else sprintDelta += addedWords;
          sprintDelta -= removed.sprint;
        }
      }
      if (!inside && change.inserted.length > 0 && change.fromB < change.toB) {
        const addedWords = wordsAdded(change);
        additions.push({
          from: change.fromB,
          to: change.toB,
          mark: new SpanMark(
            kind,
            kind === "writing" ? generation : 0,
            kind === "writing" && addedWords >= PASTE_WORD_THRESHOLD,
          ),
        });
      }
    }

    let spans: RangeSet<SpanMark>;
    try {
      spans = carveSpans(mapped, additions);
    } catch {
      return {
        ledger: new WordLedger(RangeSet.empty as RangeSet<SpanMark>, edit.newLength, true),
        sessionDelta,
        intervalDelta,
        burstDelta,
        sprintDelta,
      };
    }
    return {
      ledger: new WordLedger(spans, edit.newLength, this.resynced),
      sessionDelta,
      intervalDelta,
      burstDelta,
      sprintDelta,
    };
  }
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

export function isMarkdownPath(path: string): boolean {
  return path.toLowerCase().endsWith(".md");
}

export class VaultLedger {
  private constructor(private readonly files: ReadonlyMap<string, WordLedger>) {}

  static empty(): VaultLedger {
    return new VaultLedger(new Map());
  }

  file(path: string): WordLedger | undefined {
    return this.files.get(path);
  }

  replace(path: string, ledger: WordLedger): VaultLedger {
    const next = new Map(this.files);
    next.set(path, ledger);
    return new VaultLedger(next);
  }

  rename(from: string, to: string): VaultLedger {
    const current = this.files.get(from);
    if (!current || from === to) return this;
    const next = new Map(this.files);
    next.delete(from);
    next.set(to, current);
    return new VaultLedger(next);
  }

  drop(path: string): VaultLedger {
    if (!this.files.has(path)) return this;
    const next = new Map(this.files);
    next.delete(path);
    return new VaultLedger(next);
  }
}

export function editInDocument(
  doc: string,
  from: number,
  to: number,
  insert: string,
  path = "note.md",
  matterEnd = frontmatterEnd(doc.slice(0, Math.min(doc.length, 20_000))),
): PreparedEdit {
  const deleted = doc.slice(from, to);
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
  };
}

interface SpanAddition {
  from: number;
  to: number;
  mark: SpanMark;
}

function carveSpans(mapped: RangeSet<SpanMark>, additions: SpanAddition[]): RangeSet<SpanMark> {
  if (additions.length === 0) return mapped;
  const pieces: Array<ReturnType<SpanMark["range"]>> = [];
  mapped.between(0, Number.MAX_SAFE_INTEGER, (from, to, value) => {
    let cursor = from;
    const cuts = additions
      .filter((addition) => addition.from < to && addition.to > from)
      .sort((left, right) => left.from - right.from);
    for (const cut of cuts) {
      const cutFrom = Math.max(cut.from, from);
      const cutTo = Math.min(cut.to, to);
      if (cursor < cutFrom) pieces.push(value.range(cursor, cutFrom));
      cursor = Math.max(cursor, cutTo);
    }
    if (cursor < to) pieces.push(value.range(cursor, to));
  });
  for (const addition of additions) {
    pieces.push(addition.mark.range(addition.from, addition.to));
  }
  return RangeSet.of(pieces, true);
}

function isInsideFrontmatter(change: TextChange, end: number): boolean {
  return end > 0 && change.fromA >= 0 && change.toA <= end;
}

function wordsAdded(change: TextChange): number {
  const before = countWords(change.left + change.right);
  const after = countWords(change.left + change.inserted + change.right);
  return Math.max(0, after - before);
}

function removedWritingWords(
  spans: RangeSet<SpanMark>,
  change: TextChange,
  generation: number,
): { session: number; interval: number; sprint: number } {
  if (change.deleted.length === 0) return { session: 0, interval: 0, sprint: 0 };
  const region = change.left + change.deleted + change.right;
  const regionStart = change.fromA - change.left.length;
  const deletedStart = change.left.length;
  const deletedEnd = deletedStart + change.deleted.length;
  let session = 0;
  let interval = 0;
  let sprint = 0;
  WORD.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = WORD.exec(region)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    if (end <= deletedStart || start >= deletedEnd) continue;
    const absFrom = regionStart + start;
    const absTo = regionStart + end;
    const length = absTo - absFrom;
    if (length <= 0) continue;
    const overlap = overlapWriting(spans, absFrom, absTo, generation);
    if (overlap.writing / length >= 0.5) session += 1;
    if (overlap.current / length >= 0.5) interval += 1;
    if (overlap.current / length >= 0.5 && overlap.burst / length < 0.5) sprint += 1;
    if (match[0].length === 0) break;
  }
  return { session, interval, sprint };
}

function overlapWriting(
  spans: RangeSet<SpanMark>,
  from: number,
  to: number,
  generation: number,
): { writing: number; current: number; burst: number } {
  let writing = 0;
  let current = 0;
  let burst = 0;
  spans.between(from, to, (start, end, value) => {
    if (value.kind !== "writing") return;
    const overlap = Math.min(end, to) - Math.max(start, from);
    if (overlap <= 0) return;
    writing += overlap;
    if (value.generation === generation) current += overlap;
    if (value.burst) burst += overlap;
  });
  return { writing, current, burst };
}
