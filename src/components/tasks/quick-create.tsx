"use client";

import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { useShortcut } from "@/components/layout/shortcuts";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { PROJECT_REQUIRED, type Priority } from "@/lib/validation/tasks";
import {
  type TaskFormOptions,
  createTaskAction,
  getTaskFormOptionsAction,
} from "@/server/actions/tasks";
import { Pick, PickMany, optionItems } from "./fields";

const EVENT = "itc:quick-create";

/** Abre a criação rápida de qualquer lugar (botões, atalho `C`). */
export const openQuickCreate = () => window.dispatchEvent(new Event(EVENT));

export function CreateTaskButton() {
  return (
    <Button onClick={openQuickCreate}>
      <Plus aria-hidden="true" /> Criar tarefa
    </Button>
  );
}

const EMPTY = {
  title: "",
  statusId: "",
  priority: "none" as Priority,
  assigneeId: "",
  glpiTicket: "",
  dueDate: "",
  labelIds: [] as string[],
  checklist: [] as string[],
  descriptionJson: null as { type: "doc" } | null,
};

/** UI.md §4: abre focada no título; ⌘↵ cria; "Criar outra" mantém Projeto/Cliente e UM. */
export function QuickCreate() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<TaskFormOptions | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [projectId, setProjectId] = useState("");
  const [mobileUnitId, setMobileUnitId] = useState("");
  const [another, setAnother] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const titleRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const show = useCallback(() => {
    setOpen(true);
    // recarrega a cada abertura: cadastros podem ter mudado
    getTaskFormOptionsAction().then(setOptions, () =>
      toast.error("Não foi possível carregar os campos"),
    );
  }, []);
  useEffect(() => {
    window.addEventListener(EVENT, show);
    return () => window.removeEventListener(EVENT, show);
  }, [show]);
  useShortcut("c", show);

  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function chooseProject(id: string) {
    setProjectId(id);
    setError(null);
    const p = options?.projects.find((x) => x.id === id);
    if (p?.defaultAssigneeId && !form.assigneeId) set("assigneeId", p.defaultAssigneeId);
    const unit = options?.units.find((u) => u.id === mobileUnitId);
    if (unit?.projectId && unit.projectId !== id) setMobileUnitId("");
  }

  function applyTemplate(id: string) {
    const t = options?.templates.find((x) => x.id === id)?.payload;
    if (!t) return;
    setForm((f) => ({
      ...f,
      title: t.title ?? f.title,
      priority: t.priority ?? f.priority,
      labelIds: t.labelIds ?? f.labelIds,
      checklist: t.checklist ?? f.checklist,
      descriptionJson: t.descriptionJson ?? f.descriptionJson,
    }));
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!projectId) return setError(PROJECT_REQUIRED);
    startTransition(async () => {
      const result = await createTaskAction({ ...form, projectId, mobileUnitId });
      if (!result.ok) return setError(result.error);
      const { number } = result.data;
      toast.success(`TI-${number} criada`, {
        action: { label: "Abrir", onClick: () => router.push(`/tarefas/${number}`) },
      });
      setError(null);
      setForm(EMPTY);
      router.refresh();
      if (another) titleRef.current?.focus();
      else setOpen(false);
    });
  }

  const items = options && optionItems(options);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <DialogContent initialFocus={titleRef} className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Criar tarefa</DialogTitle>
        </DialogHeader>
        <form
          ref={formRef}
          onSubmit={onSubmit}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              formRef.current?.requestSubmit();
            }
          }}
          className="flex flex-col gap-3"
        >
          {!!options?.templates.length && (
            <Pick
              label="Usar template"
              items={options.templates.map((t) => ({ value: t.id, label: t.name }))}
              value=""
              onChange={applyTemplate}
            />
          )}
          <Input
            ref={titleRef}
            aria-label="Título"
            placeholder="Título da tarefa"
            required
            maxLength={200}
            value={form.title}
            onChange={(e) => set("title", e.target.value)}
            autoComplete="off"
          />
          {items ? (
            <>
              <Pick
                label="Projeto/Cliente"
                items={items.projects}
                value={projectId}
                onChange={chooseProject}
                invalid={error === PROJECT_REQUIRED}
              />
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Pick
                  label="Status"
                  items={items.statuses}
                  value={form.statusId}
                  onChange={(v) => set("statusId", v)}
                />
                <Pick
                  label="Prioridade"
                  items={items.priorities}
                  value={form.priority}
                  onChange={(v) => set("priority", v as Priority)}
                />
                <Pick
                  label="Responsável"
                  items={items.people}
                  value={form.assigneeId}
                  onChange={(v) => set("assigneeId", v)}
                />
                <Pick
                  label="Unidade Móvel"
                  items={items.units(projectId)}
                  value={mobileUnitId}
                  onChange={setMobileUnitId}
                />
                <Input
                  aria-label="Chamado GLPI"
                  placeholder="Chamado GLPI"
                  inputMode="numeric"
                  pattern="\d{1,7}"
                  className="tabular-nums"
                  value={form.glpiTicket}
                  onChange={(e) => set("glpiTicket", e.target.value)}
                />
                <Input
                  type="date"
                  aria-label="Prazo"
                  className="tabular-nums"
                  value={form.dueDate}
                  onChange={(e) => set("dueDate", e.target.value)}
                />
              </div>
              {!!items.labels.length && (
                <PickMany
                  label="Etiquetas"
                  items={items.labels}
                  value={form.labelIds}
                  onChange={(v) => set("labelIds", v)}
                />
              )}
              {!!form.checklist.length && (
                <p className="text-sm text-muted">{form.checklist.length} subtarefas do template</p>
              )}
            </>
          ) : (
            <p className="text-sm text-muted">Carregando campos…</p>
          )}
          {error && (
            <p role="alert" className="text-err">
              {error}
            </p>
          )}
          <DialogFooter className="items-center">
            <label className="mr-auto flex items-center gap-2 text-sm">
              <Checkbox checked={another} onCheckedChange={setAnother} />
              Criar outra
            </label>
            <Button
              type="submit"
              disabled={pending || !items}
              aria-keyshortcuts="Meta+Enter Control+Enter"
            >
              {pending ? "Criando…" : "Criar tarefa"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
