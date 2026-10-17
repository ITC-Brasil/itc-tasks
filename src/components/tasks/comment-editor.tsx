"use client";

import Mention from "@tiptap/extension-mention";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import type { SuggestionKeyDownProps, SuggestionProps } from "@tiptap/suggestion";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type Person = { id: string; name: string; initials: string | null };
type Doc = { type: "doc" };

const PROSE =
  "[&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5 [&_p+p]:mt-2 [&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1 [&_a]:text-accent-text [&_a]:underline [&_.mention]:font-medium [&_.mention]:text-accent-text";

type Menu = { items: Person[]; index: number; top: number; left: number } | null;

/** Tiptap + @menção (ADR-048); ⌘/Ctrl+Enter envia. */
export function CommentEditor({
  people,
  content,
  submitLabel,
  onSubmit,
  onCancel,
}: {
  people: Person[];
  content?: object;
  submitLabel: string;
  onSubmit: (doc: Doc) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const [menu, setMenu] = useState<Menu>(null);
  const [pending, setPending] = useState(false);
  // a sugestão roda fora do React: guarda o comando e o menu atual em refs
  const command = useRef<((p: { id: string; label: string }) => void) | null>(null);
  const menuRef = useRef<Menu>(null);
  const show = (m: Menu) => {
    menuRef.current = m;
    setMenu(m);
  };
  const pick = (p: Person) => command.current?.({ id: p.id, label: p.name });

  const submitRef = useRef<() => void>(() => {});
  const editor = useEditor({
    immediatelyRender: false,
    content: content ?? "",
    extensions: [
      StarterKit,
      Mention.configure({
        HTMLAttributes: { class: "mention" },
        suggestion: {
          items: ({ query }) => {
            const q = query.toLowerCase();
            return people.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 6);
          },
          render: () => {
            const update = (props: SuggestionProps<Person>) => {
              command.current = props.command;
              const rect = props.clientRect?.();
              show(
                props.items.length && rect
                  ? { items: props.items, index: 0, top: rect.bottom + 4, left: rect.left }
                  : null,
              );
            };
            return {
              onStart: update,
              onUpdate: update,
              onExit: () => show(null),
              onKeyDown: ({ event }: SuggestionKeyDownProps) => {
                const m = menuRef.current;
                if (!m) return false;
                const step = { ArrowDown: 1, ArrowUp: -1 }[event.key];
                if (step) {
                  show({ ...m, index: (m.index + step + m.items.length) % m.items.length });
                  return true;
                }
                if (event.key === "Enter" || event.key === "Tab") {
                  pick(m.items[m.index]);
                  return true;
                }
                if (event.key === "Escape") {
                  show(null);
                  return true;
                }
                return false;
              },
            };
          },
        },
      }),
    ],
    editorProps: {
      attributes: {
        "aria-label": "Comentário",
        class: cn(
          "min-h-16 rounded-control border border-input bg-surface px-3 py-2 outline-none focus-visible:border-accent focus-visible:ring-3 focus-visible:ring-accent-light",
          PROSE,
        ),
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          submitRef.current();
          return true;
        }
        return false;
      },
    },
  });

  const submit = async () => {
    if (!editor || editor.isEmpty || pending) return;
    setPending(true);
    const ok = await onSubmit(editor.getJSON() as Doc);
    setPending(false);
    if (ok && !onCancel) editor.commands.clearContent();
  };
  useEffect(() => {
    submitRef.current = submit;
  });

  return (
    <div className="flex flex-col gap-2">
      <EditorContent editor={editor} />
      {menu && (
        <ul
          role="listbox"
          aria-label="Pessoas"
          className="fixed z-50 min-w-48 rounded-md border bg-surface p-1 shadow-2"
          style={{ top: menu.top, left: menu.left }}
        >
          {menu.items.map((p, i) => (
            <li
              key={p.id}
              role="option"
              aria-selected={i === menu.index}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm",
                i === menu.index && "bg-muted",
              )}
              onMouseDown={(e) => {
                e.preventDefault(); // mantém o foco no editor
                pick(p);
              }}
            >
              <Avatar initials={p.initials ?? ""} />
              {p.name}
            </li>
          ))}
        </ul>
      )}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button variant="ghost" onClick={onCancel}>
            Cancelar
          </Button>
        )}
        <Button onClick={submit} disabled={pending}>
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

/** Comentário salvo, só leitura, com as mesmas extensões. */
export function CommentBody({ content }: { content: object }) {
  const editor = useEditor({
    immediatelyRender: false,
    editable: false,
    content,
    extensions: [StarterKit, Mention.configure({ HTMLAttributes: { class: "mention" } })],
    editorProps: { attributes: { class: PROSE } },
  });
  return <EditorContent editor={editor} />;
}
