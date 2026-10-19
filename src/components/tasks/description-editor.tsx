"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

/**
 * Descrição rica (Tiptap). No detalhe salva ao sair do campo, só se mudou (`onSave`); na criação
 * rápida avisa a cada mudança (`onChange`, vazio = null) e ⌘↵ envia o formulário (`onModEnter`).
 */
export function DescriptionEditor({
  content,
  onSave,
  onChange,
  onModEnter,
  autoFocus = false,
}: {
  content: object | null;
  onSave?: (doc: { type: "doc" }) => void;
  onChange?: (doc: { type: "doc" } | null) => void;
  onModEnter?: () => void;
  autoFocus?: boolean;
}) {
  const editor = useEditor({
    extensions: [StarterKit],
    content,
    autofocus: autoFocus ? "end" : false,
    immediatelyRender: false, // SSR do Next
    editorProps: {
      attributes: {
        "aria-label": "Descrição",
        class:
          "min-h-24 rounded-control border border-input bg-surface px-3 py-2 outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent-light [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_h2]:text-h3 [&_p+p]:mt-2 [&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1 [&_a]:text-accent-text [&_a]:underline",
      },
      // sem onModEnter, ⌘↵ continua sendo a quebra de linha do StarterKit
      handleKeyDown: (_view, e) => {
        if (!onModEnter || e.key !== "Enter" || !(e.metaKey || e.ctrlKey)) return false;
        onModEnter();
        return true;
      },
    },
    onUpdate: ({ editor }) =>
      onChange?.(editor.isEmpty ? null : (editor.getJSON() as { type: "doc" })),
    onBlur: ({ editor }) => {
      if (!onSave) return;
      const doc = editor.getJSON() as { type: "doc" };
      if (JSON.stringify(doc) !== JSON.stringify(content ?? EMPTY_DOC)) onSave(doc);
    },
  });
  return <EditorContent editor={editor} />;
}

const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };
