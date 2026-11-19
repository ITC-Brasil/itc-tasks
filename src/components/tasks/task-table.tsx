"use client";

import {
  createColumnHelper,
  createSortedRowModel,
  flexRender,
  rowSelectionFeature,
  rowSortingFeature,
  sortFns,
  tableFeatures,
  useTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { PRIORITIES, type UpdateTaskInput } from "@/lib/validation/tasks";
import { type TaskFormOptions, bulkUpdateTasksAction } from "@/server/actions/tasks";
import { statusToast } from "./status-toast";
import { type Actor, canDeleteTask } from "@/server/permissions";
import type { TaskRow } from "@/server/services/tasks";
import { DeleteTasksDialog } from "./delete-tasks-dialog";
import { PersonalMark, PriorityIcon, ProjectChip, StatusIcon, priorityLabel } from "./badges";
import { useWaitingPrompt } from "./waiting";
import { Pick, optionItems } from "./fields";
import { dueKey, isOverdue } from "@/lib/dates";
import { DueDate } from "./task-card";

const features = tableFeatures({
  rowSelectionFeature,
  rowSortingFeature,
  sortedRowModel: createSortedRowModel(),
  sortFns,
});
const col = createColumnHelper<typeof features, TaskRow>();

/** PRD V3: tabela com ordenação e ações em massa (status, responsável, prioridade — ADR-046). */
export function TaskTable({
  tasks,
  options,
  viewer,
}: {
  tasks: TaskRow[];
  options: TaskFormOptions;
  /** ponytail: não usado desde o ADR-072 (o atraso vem do isOverdue); quem chama ainda passa */
  today?: string;
  viewer: Actor;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const statusName = new Map(options.statuses.map((s) => [s.id, s.name]));
  const columns = col.columns([
    col.display({
      id: "select",
      header: ({ table }) => (
        <Checkbox
          aria-label="Selecionar todas"
          checked={table.getIsAllRowsSelected()}
          indeterminate={table.getIsSomeRowsSelected()}
          onCheckedChange={(v) => table.toggleAllRowsSelected(!!v)}
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          aria-label={`Selecionar TI-${row.original.number}`}
          checked={row.getIsSelected()}
          onCheckedChange={(v) => row.toggleSelected(!!v)}
        />
      ),
    }),
    col.accessor("number", {
      header: "ID",
      cell: (c) => <span className="text-muted tabular-nums">TI-{c.getValue()}</span>,
    }),
    col.accessor("title", {
      header: "Título",
      cell: (c) => (
        <span className="inline-flex items-center gap-1.5">
          <Link href={`/tarefas/${c.row.original.number}`} className="font-medium hover:underline">
            {c.getValue()}
          </Link>
          {c.row.original.visibility === "personal" && <PersonalMark />}
        </span>
      ),
    }),
    col.accessor((t) => statusName.get(t.statusId) ?? "", {
      id: "status",
      header: "Status",
      cell: (c) => (
        <span className="inline-flex items-center gap-1.5">
          <StatusIcon category={c.row.original.category} />
          {c.getValue()}
        </span>
      ),
    }),
    col.accessor((t) => PRIORITIES.indexOf(t.priority), {
      id: "priority",
      header: "Prioridade",
      cell: (c) => (
        <span className="inline-flex items-center gap-1.5">
          <PriorityIcon priority={c.row.original.priority} />
          {priorityLabel(c.row.original.priority)}
        </span>
      ),
    }),
    col.accessor((t) => t.projects.map((p) => p.code).join(" "), {
      id: "projects",
      header: "Projeto/Cliente",
      cell: (c) => (
        <span className="flex flex-wrap gap-1">
          {c.row.original.projects.map((p) => (
            <ProjectChip key={p.id} code={p.code} name={p.name} color={p.color} />
          ))}
        </span>
      ),
    }),
    col.accessor((t) => t.assigneeName ?? "", {
      id: "assignee",
      header: "Responsável",
      cell: (c) =>
        c.row.original.assigneeInitials ? (
          <span className="inline-flex items-center gap-1.5">
            <Avatar initials={c.row.original.assigneeInitials} />
            {c.getValue()}
          </span>
        ) : (
          <span className="text-muted">—</span>
        ),
    }),
    col.accessor((t) => dueKey(t.dueDate, t.dueTime), {
      id: "due",
      header: "Prazo",
      cell: ({ row: { original: t } }) =>
        t.dueDate ? (
          <DueDate
            due={t.dueDate}
            time={t.dueTime}
            overdue={t.category !== "done" && isOverdue(t.dueDate, t.dueTime)}
          />
        ) : null,
    }),
  ]);

  const table = useTable({ features, columns, data: tasks, getRowId: (t) => t.id });
  const selectedRows = table.getSelectedRowModel().rows.map((r) => r.original);
  const selected = selectedRows.map((t) => t.id);
  // ADR-063: o botão só aparece se a pessoa pode excluir todas as selecionadas
  const canDelete = selectedRows.every((t) => canDeleteTask(viewer, t));
  const items = optionItems(options);

  const [askWaiting, waitingDialog] = useWaitingPrompt();

  function bulk(patch: UpdateTaskInput) {
    start(async () => {
      const r = await bulkUpdateTasksAction({ taskIds: selected, patch });
      if (!r.ok) return void toast.error(r.error);
      // Módulo 18: concluir uma só tarefa em massa convida a comentar (sem Desfazer em massa)
      const only = selectedRows.length === 1 ? selectedRows[0] : null;
      const to = options.statuses.find((s) => s.id === patch.statusId);
      if (only && to && to.category === "done" && only.category !== "done")
        statusToast(router, {
          ...only,
          taskId: only.id,
          statusName: to.name,
          done: true,
          eventId: null,
        });
      else toast.success(r.data === 1 ? "1 tarefa atualizada" : `${r.data} tarefas atualizadas`);
      table.resetRowSelection();
      router.refresh();
    });
  }

  return (
    <div className="p-4 md:p-6">
      {waitingDialog}
      {selected.length > 0 && (
        <div
          role="toolbar"
          aria-label="Ações em massa"
          className="mb-3 flex flex-wrap items-center gap-2 rounded-md border bg-surface p-2"
        >
          <span className="px-1 text-sm font-medium tabular-nums">
            {selected.length} selecionada{selected.length > 1 ? "s" : ""}
          </span>
          {/* key: o seletor volta vazio depois de cada ação */}
          <div className="w-44" key={`s${pending}`}>
            <Pick
              label="Mover para…"
              items={items.statuses}
              value=""
              onChange={async (v) => {
                // ADR-078: em massa também pede motivo e previsão
                if (options.statuses.find((x) => x.id === v)?.category !== "waiting")
                  return bulk({ statusId: v });
                const waiting = await askWaiting();
                if (waiting) bulk({ statusId: v, ...waiting });
              }}
            />
          </div>
          <div className="w-44" key={`a${pending}`}>
            <Pick
              label="Atribuir a…"
              items={items.people}
              value="__"
              onChange={(v) => bulk({ assigneeId: v || null })}
            />
          </div>
          <div className="w-44" key={`p${pending}`}>
            <Pick
              label="Prioridade…"
              items={items.priorities}
              value=""
              onChange={(v) => bulk({ priority: v as never })}
            />
          </div>
          <div className="w-44" key={`c${pending}`}>
            <Pick
              label="Mudar ciclo…"
              items={items.cycles}
              value="__"
              onChange={(v) => bulk({ cycleId: v || null })}
            />
          </div>
          {canDelete && (
            <DeleteTasksDialog
              tasks={selectedRows}
              onDeleted={() => {
                table.resetRowSelection();
                router.refresh();
              }}
              trigger={
                <Button variant="secondary" size="sm">
                  <Trash2 strokeWidth={1.75} aria-hidden="true" />
                  Excluir
                </Button>
              }
            />
          )}
        </div>
      )}
      <div className="overflow-x-auto rounded-md border bg-surface">
        <table className="w-full text-sm">
          <thead className="border-b text-left text-xs text-muted">
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => {
                  const sorted = h.column.getIsSorted();
                  return (
                    <th
                      key={h.id}
                      scope="col"
                      className="px-3 py-2 font-medium"
                      aria-sort={
                        sorted ? (sorted === "asc" ? "ascending" : "descending") : undefined
                      }
                    >
                      {h.column.getCanSort() && h.column.id !== "select" ? (
                        <button
                          type="button"
                          className="inline-flex items-center gap-1 hover:text-foreground"
                          onClick={h.column.getToggleSortingHandler()}
                        >
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {sorted === "asc" && <ArrowUp className="size-3.5" aria-hidden="true" />}
                          {sorted === "desc" && (
                            <ArrowDown className="size-3.5" aria-hidden="true" />
                          )}
                        </button>
                      ) : (
                        flexRender(h.column.columnDef.header, h.getContext())
                      )}
                    </th>
                  );
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                data-selected={row.getIsSelected() || undefined}
                className="border-b last:border-0 data-selected:bg-accent-light"
              >
                {row.getAllCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2 align-middle">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
