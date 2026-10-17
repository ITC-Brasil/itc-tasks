"use client";

import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

/** Descrição rica (Tiptap); salva ao sair do campo, só se mudou. */
export function DescriptionEditor({
  content,
  onSave,
}: {
  content: object | null;
  onSave: (doc: { type: "doc" }) => void;
}) {
  const editor = useEditor({
    extensions: [StarterKit],
    content,
    immediatelyRender: false, // SSR do Next
    editorProps: {
      attributes: {
        "aria-label": "Descrição",
        class:
          "min-h-24 rounded-control border border-input bg-surface px-3 py-2 outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent-light [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_h2]:text-h3 [&_p+p]:mt-2 [&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1 [&_a]:text-accent-text [&_a]:underline",
      },
    },
    onBlur: ({ editor }) => {
      const doc = editor.getJSON() as { type: "doc" };
      if (JSON.stringify(doc) !== JSON.stringify(content ?? EMPTY_DOC)) onSave(doc);
    },
  });
  return <EditorContent editor={editor} />;
}

const EMPTY_DOC = { type: "doc", content: [{ type: "paragraph" }] };
