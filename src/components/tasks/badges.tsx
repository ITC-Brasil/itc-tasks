import { Folder, Hourglass, Lock, Ticket, Truck } from "lucide-react";
import type { ProjectColor } from "@/lib/validation/catalog";
import type { Priority } from "@/lib/validation/tasks";
import { cn } from "@/lib/utils";

// Design System: StatusIcon/StatusBadge, PriorityIcon/PriorityBadge, Chip
export type Category = "backlog" | "todo" | "in_progress" | "waiting" | "done";

/** A forma diferencia a categoria mesmo sem cor. */
export function StatusIcon({ category, className }: { category: Category; className?: string }) {
  // ADR-067: ampulheta em `warn`, só no ícone (warn nunca é texto no tema claro)
  if (category === "waiting")
    return (
      <Hourglass
        aria-hidden="true"
        strokeWidth={1.75}
        className={cn("size-4 flex-none text-warn", className)}
      />
    );
  const color =
    category === "done" ? "text-ok" : category === "in_progress" ? "text-info" : "text-muted";
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={cn("size-4 flex-none", color, className)}
    >
      {category === "backlog" && (
        <circle
          cx="8"
          cy="8"
          r="6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeDasharray="2.4 2"
        />
      )}
      {category === "todo" && (
        <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.75" />
      )}
      {category === "in_progress" && (
        <>
          <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeWidth="1.75" />
          <path d="M8 4a4 4 0 0 1 0 8z" fill="currentColor" />
        </>
      )}
      {category === "done" && (
        <>
          <circle cx="8" cy="8" r="7" fill="currentColor" />
          <path d="m5 8.2 2 2 4-4.2" fill="none" stroke="var(--bg-surface)" strokeWidth="1.75" />
        </>
      )}
    </svg>
  );
}

// ordem de PRIORITIES; Map evita indexação dinâmica de objeto
const PRIORITY = new Map<Priority, { label: string; bars: number; color: string }>([
  ["none", { label: "Sem prioridade", bars: 0, color: "" }],
  ["low", { label: "Baixa", bars: 1, color: "text-info" }],
  ["medium", { label: "Média", bars: 2, color: "text-sev-medium" }],
  ["high", { label: "Alta", bars: 3, color: "text-warn" }],
  ["urgent", { label: "Urgente", bars: 0, color: "text-err" }],
]);
export const priorityLabel = (p: Priority) => PRIORITY.get(p)!.label;

/** Barras de sinal; Urgente é um quadrado com "!". O rótulo nunca usa a cor (contraste). */
export function PriorityIcon({ priority, className }: { priority: Priority; className?: string }) {
  const { bars: n, color } = PRIORITY.get(priority)!;
  return (
    <svg
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={cn("size-4 flex-none", color, className)}
    >
      {priority === "urgent" ? (
        <>
          <rect x="1.5" y="1.5" width="13" height="13" rx="3" fill="currentColor" />
          <path
            d="M8 4.5v4.5M8 11v.5"
            stroke="var(--bg-surface)"
            strokeWidth="1.75"
            strokeLinecap="round"
          />
        </>
      ) : (
        [0, 1, 2].map((i) => (
          <rect
            key={i}
            x={2 + i * 4.5}
            y={10 - i * 3.5}
            width="3"
            height={4 + i * 3.5}
            rx="1"
            className={i < n ? "fill-current" : "fill-border"}
          />
        ))
      )}
    </svg>
  );
}

// chips neutros fixam text-base: herdar text-muted sobre bg-muted dá 4,27:1 (axe)
const chip =
  "inline-flex h-[22px] max-w-full items-center gap-1 rounded-sm px-1.5 text-xs font-medium [&>span]:truncate";

// ADR-068: a chave da paleta vira os tokens do chip; sem cor, o visual de sempre
const tint = (color: ProjectColor | null | undefined, bg: "bg" | "unit-bg") =>
  color
    ? { background: `var(--project-${color}-${bg})`, color: `var(--project-${color}-fg)` }
    : undefined;

/**
 * ADR-068: compacto mostra só a sigla; o nome fica no tooltip e para o leitor de tela.
 * `full` (detalhe da tarefa, Marcos) mostra "SIGLA · Nome". `color` é a cor do projeto.
 */
export function ProjectChip({
  code,
  name,
  full,
  color,
}: {
  code: string;
  name: string;
  full?: boolean;
  color?: ProjectColor | null;
}) {
  return (
    <span
      className={cn(chip, !color && "bg-accent-light text-accent-text")}
      style={tint(color, "bg")}
      title={name}
    >
      <Folder className="size-3.5 flex-none" aria-hidden="true" />
      <span>
        <span className="tabular-nums">{code}</span>
        <span className={full ? undefined : "sr-only"}> · {name}</span>
      </span>
    </span>
  );
}

/** `color` é a cor do projeto da UM: mesmo texto, fundo mais suave (ADR-068). */
export function UnitChip({ code, color }: { code: string; color?: ProjectColor | null }) {
  return (
    <span
      className={cn(chip, !color && "bg-muted text-base")}
      style={tint(color, "unit-bg")}
      title={code}
    >
      <Truck className="size-3.5 flex-none" aria-hidden="true" />
      <span className="tabular-nums">{code}</span>
    </span>
  );
}

/** ADR-069: marca discreta de tarefa pessoal (só quem criou vê). */
export function PersonalMark({ className }: { className?: string }) {
  return (
    <span title="Tarefa pessoal: só você vê" className={cn("inline-flex flex-none", className)}>
      <Lock className="size-3.5 text-muted" strokeWidth={1.75} aria-hidden="true" />
      <span className="sr-only">Tarefa pessoal</span>
    </span>
  );
}

/** Chip só de texto (tipo de notificação). */
export function TextChip({ children }: { children: React.ReactNode }) {
  return (
    <span className={cn(chip, "bg-muted text-base")}>
      <span>{children}</span>
    </span>
  );
}

/** ADR-023: só o número e o link para o GLPI, em nova aba. */
export function GlpiChip({ ticket, href }: { ticket: number; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className={cn(chip, "bg-muted text-base hover:underline")}
      title={`Abrir o chamado ${ticket} no GLPI`}
    >
      <Ticket className="size-3.5 flex-none" aria-hidden="true" />
      <span className="tabular-nums">#{ticket}</span>
    </a>
  );
}

// ADR-041: a cor da etiqueta é só o ponto; o nome usa a cor de texto normal
export function LabelChip({ name, colorToken }: { name: string; colorToken: string }) {
  return (
    <span className={cn(chip, "bg-muted text-base")} title={name}>
      <span
        aria-hidden="true"
        className="size-2 flex-none rounded-full"
        style={{ background: `var(--${colorToken})` }}
      />
      <span>{name}</span>
    </span>
  );
}

export const glpiUrl = (base: string, ticket: number) =>
  `${base.replace(/\/$/, "")}/front/ticket.form.php?id=${ticket}`;
