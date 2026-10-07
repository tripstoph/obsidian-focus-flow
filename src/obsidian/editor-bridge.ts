import { editorInfoField } from "obsidian";
import type { Extension, Transaction } from "@codemirror/state";
import { ViewPlugin, type ViewUpdate } from "@codemirror/view";
import {
  editTargetsBoundNote,
  frontmatterEnd,
  trimContextAfter,
  trimContextBefore,
  type PreparedEdit,
  type TextChange,
} from "../engine/word-ledger";

export interface EditorGate {
  boundPath: string | null;
  listening: boolean;
  onEdit: (edit: PreparedEdit) => void;
}

export function createEditorExtension(gate: EditorGate): Extension {
  return ViewPlugin.fromClass(
    class {
      update(update: ViewUpdate): void {
        if (!update.docChanged || !gate.listening || gate.boundPath == null) return;
        for (const transaction of update.transactions) {
          if (!transaction.docChanged) continue;
          const info = transaction.startState.field(editorInfoField, false);
          const path = info?.file?.path ?? null;
          if (!editTargetsBoundNote(gate.boundPath, path) || path == null) continue;
          gate.onEdit(editFromTransaction(transaction, path));
        }
      }
    },
  );
}

export function editFromTransaction(transaction: Transaction, path: string): PreparedEdit {
  const doc = transaction.startState.doc;
  const changes: TextChange[] = [];
  transaction.changes.iterChanges((fromA, toA, fromB, toB, inserted) => {
    const leftStart = Math.max(0, fromA - 80);
    const rightEnd = Math.min(doc.length, toA + 80);
    changes.push({
      fromA,
      toA,
      fromB,
      toB,
      inserted: inserted.toString(),
      deleted: doc.sliceString(fromA, toA),
      left: trimContextBefore(doc.sliceString(leftStart, fromA), leftStart > 0),
      right: trimContextAfter(doc.sliceString(toA, rightEnd), rightEnd < doc.length),
    });
  });
  const head = doc.sliceString(0, Math.min(doc.length, 20_000));
  return {
    path,
    oldLength: doc.length,
    newLength: transaction.newDoc.length,
    frontmatterEnd: frontmatterEnd(head),
    changes,
    changeSet: transaction.changes,
  };
}
