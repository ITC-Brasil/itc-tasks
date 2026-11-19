"use client";

import { X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const MAX = 50; // o mesmo limite do Zod de criação (checklist ≤ 50, texto ≤ 200)

/**
 * Módulo 18, item 18: subtarefas já na criação, recolhidas por padrão. Enter acrescenta e mantém o
 * foco para a próxima; o service grava na mesma transação da tarefa.
 */
export function ChecklistDraft({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  if (!open && value.length === 0)
    return (
      <Button
        type="button"
        variant="link"
        size="sm"
        className="self-start px-0"
        onClick={() => setOpen(true)}
      >
        + Adicionar subtarefas
      </Button>
    );
  const add = () => {
    const t = text.trim();
    if (!t || value.length >= MAX) return;
    onChange([...value, t]);
    setText("");
  };
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">Subtarefas</span>
      {value.length > 0 && (
        <ul className="flex flex-col gap-1">
          {value.map((item, i) => (
            <li key={`${i}-${item}`} className="flex items-center gap-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{item}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Tirar ${item}`}
                onClick={() => onChange(value.filter((_, j) => j !== i))}
              >
                <X aria-hidden="true" />
              </Button>
            </li>
          ))}
        </ul>
      )}
      <Input
        aria-label="Nova subtarefa"
        placeholder="Texto da subtarefa e Enter"
        maxLength={200}
        autoFocus={value.length === 0}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // Enter acrescenta (⌘/Ctrl+Enter continua criando a tarefa)
          if (e.key === "Enter" && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            add();
          }
        }}
      />
    </div>
  );
}

/**
 * Módulo 18, item 19: clicar (ou Enter) no texto da subtarefa edita. Enter ou sair salva, Esc
 * cancela; vazio ou igual não salva. O checkbox continua sendo só o marcar/desmarcar.
 */
export function ChecklistText({
  text,
  done,
  onSave,
}: {
  text: string;
  done: boolean;
  onSave: (text: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  if (!editing)
    return (
      <button
        type="button"
        aria-label={`Editar ${text}`}
        onClick={() => setEditing(true)}
        className={cn(
          "min-w-0 flex-1 cursor-text rounded-sm text-left focus-visible:ring-3 focus-visible:ring-accent-light focus-visible:outline-none",
          done && "text-muted line-through",
        )}
      >
        {text}
      </button>
    );
  const finish = (value: string | null) => {
    if (!editing) return; // Enter/Esc já fecharam; o blur da desmontagem não salva de novo
    setEditing(false);
    const t = value?.trim();
    if (t && t !== text) onSave(t);
  };
  return (
    <Input
      autoFocus
      aria-label={`Texto de ${text}`}
      maxLength={200}
      defaultValue={text}
      className="h-7 min-w-0 flex-1 px-1.5"
      onBlur={(e) => finish(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          finish(e.currentTarget.value);
        } else if (e.key === "Escape") {
          e.preventDefault();
          e.stopPropagation();
          finish(null);
        }
      }}
    />
  );
}
