"use client";

import { Lock, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { useOnline } from "@/components/layout/pwa";
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
import { addBusinessDays, todayISO } from "@/lib/dates";
import { PROJECT_REQUIRED, type Priority } from "@/lib/validation/tasks";
import {
  type TaskFormOptions,
  createTaskAction,
  getTaskFormOptionsAction,
} from "@/server/actions/tasks";
import { DescriptionEditor } from "./description-editor";
import { Pick, PickMany, optionItems } from "./fields";

const EVENT = "itc:quick-create";

/**
 * Abre a criação rápida de qualquer lugar (botões, atalho `C`); o Kanban passa o status da coluna,
 * a tela Templates passa o template.
 */
type Preset = { statusId?: string; templateId?: string; personal?: boolean };
export const openQuickCreate = (preset?: Preset) =>
  window.dispatchEvent(new CustomEvent(EVENT, { detail: preset }));

export function CreateTaskButton() {
  return (
    <Button onClick={() => openQuickCreate()}>
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
  dueTime: "",
  labelIds: [] as string[],
  involvedIds: [] as string[],
  checklist: [] as string[],
  descriptionJson: null as { type: "doc" } | null,
  templateId: undefined as string | undefined,
};

/** UI.md §4: abre focada no título; ⌘↵ cria; "Criar outra" mantém Projeto/Cliente e UM. */
export function QuickCreate() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<TaskFormOptions | null>(null);
  const [form, setForm] = useState(EMPTY);
  const [projectIds, setProjectIds] = useState<string[]>([]);
  const [mobileUnitIds, setMobileUnitIds] = useState<string[]>([]);
  // UI.md: "Criar outra" mantém Projeto/Cliente, UM e ciclo (fora do `form`, que é limpo)
  const [cycleId, setCycleId] = useState("");
  // ADR-069: tarefa pessoal (só quem cria vê); fica marcada no "Criar outra"
  const [personal, setPersonal] = useState(false);
  const [another, setAnother] = useState(false);
  // M-086: descrição fechada por padrão; o template a abre preenchida; a chave remonta o editor
  const [desc, setDesc] = useState<{ open: false | "click" | "template"; key: number }>({
    open: false,
    key: 0,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const online = useOnline();
  const titleRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  const show = useCallback((e?: Event) => {
    // offline: a criação fica fora do fieldset do shell; todas as entradas passam por aqui (ADR-054)
    if (!navigator.onLine)
      return void toast.error("Sem conexão. Crie a tarefa quando a rede voltar.");
    const preset = (e as CustomEvent<Preset | undefined>)?.detail;
    if (preset?.statusId) setForm((f) => ({ ...f, statusId: preset.statusId! }));
    setPersonal(!!preset?.personal);
    // M16 item 1: cada abertura começa sem Projeto/Cliente, UM e ciclo; só o "Criar outra",
    // com o diálogo ainda aberto, os mantém
    setProjectIds([]);
    setMobileUnitIds([]);
    setCycleId("");
    setOpen(true);
    // recarrega a cada abertura: cadastros podem ter mudado
    getTaskFormOptionsAction().then(
      (o) => {
        setOptions(o);
        if (preset?.templateId) applyTemplate(o, preset.templateId);
      },
      () => toast.error("Não foi possível carregar os campos"),
    );
  }, []);
  useEffect(() => {
    window.addEventListener(EVENT, show);
    // atalho "Criar tarefa" do app instalado (manifest → /?criar=1, ADR-054)
    const url = new URL(window.location.href);
    if (url.searchParams.has("criar")) {
      url.searchParams.delete("criar");
      window.history.replaceState(null, "", url);
      openQuickCreate();
    }
    return () => window.removeEventListener(EVENT, show);
  }, [show]);
  useShortcut(
    "c",
    useCallback(() => show(), [show]),
  );

  const set = <K extends keyof typeof EMPTY>(key: K, value: (typeof EMPTY)[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  function chooseProjects(ids: string[]) {
    setProjectIds(ids);
    setError(null);
    // tira as UMs de projetos que saíram da lista
    const fits = new Set(
      options &&
        optionItems(options)
          .units(ids)
          .map((u) => u.value),
    );
    setMobileUnitIds((units) => units.filter((id) => fits.has(id)));
  }

  // ADR-052: o service conta o uso e troca `{UM}` pelo código da UM escolhida
  function applyTemplate(o: TaskFormOptions | null, id: string) {
    const t = o?.templates.find((x) => x.id === id)?.payload;
    if (!t) return;
    setForm((f) => ({
      ...f,
      templateId: id,
      dueDate: t.dueInDays !== undefined ? addBusinessDays(todayISO(), t.dueInDays) : f.dueDate,
      title: t.title ?? f.title,
      priority: t.priority ?? f.priority,
      labelIds: t.labelIds ?? f.labelIds,
      checklist: t.checklist ?? f.checklist,
      descriptionJson: t.descriptionJson ?? f.descriptionJson,
    }));
    if (t.descriptionJson) setDesc((d) => ({ open: "template", key: d.key + 1 }));
  }

  function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!personal && !projectIds.length) return setError(PROJECT_REQUIRED);
    startTransition(async () => {
      // a pessoal é sempre de quem cria e não entra em ciclo: o service define o responsável
      const result = await createTaskAction(
        personal
          ? { ...form, assigneeId: "", projectIds, mobileUnitIds, visibility: "personal" }
          : { ...form, projectIds, mobileUnitIds, cycleId },
      );
      if (!result.ok) return setError(result.error);
      const { number } = result.data;
      toast.success(`TI-${number} criada`, {
        action: { label: "Abrir", onClick: () => router.push(`/tarefas/${number}`) },
      });
      setError(null);
      setForm(EMPTY);
      setDesc((d) => ({ open: false, key: d.key + 1 }));
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
      <DialogContent
        initialFocus={titleRef}
        // < 768 px: painel inferior (UI.md §6)
        className="sm:max-w-xl sm:max-h-[90dvh] sm:overflow-y-auto max-md:top-auto max-md:bottom-0 max-md:max-h-[90dvh] max-md:max-w-full max-md:translate-y-0 max-md:overflow-y-auto max-md:rounded-b-none max-md:pb-[calc(1.25rem+env(safe-area-inset-bottom))]"
      >
        <DialogHeader>
          <DialogTitle>Criar tarefa</DialogTitle>
        </DialogHeader>
        <form
          ref={formRef}
          onSubmit={onSubmit}
          onKeyDown={(e) => {
            // o editor da descrição já tratou o ⌘↵ (onModEnter)
            if (e.defaultPrevented) return;
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
              onChange={(id) => applyTemplate(options, id)}
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
          {/* a dica fica fora do <label>: o nome do checkbox é só "Tarefa pessoal" */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <label className="flex items-center gap-2">
              <Checkbox
                checked={personal}
                onCheckedChange={(v) => {
                  setPersonal(v);
                  setError(null);
                }}
              />
              <Lock className="size-4 text-muted" strokeWidth={1.75} aria-hidden="true" />
              Tarefa pessoal
            </label>
            <span className="text-muted">Só você vê; Projeto/Cliente opcional.</span>
          </div>
          {desc.open ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-sm font-medium">Descrição</span>
              <DescriptionEditor
                key={desc.key}
                content={form.descriptionJson}
                autoFocus={desc.open === "click"}
                onChange={(doc) => set("descriptionJson", doc)}
                onModEnter={() => formRef.current?.requestSubmit()}
              />
            </div>
          ) : (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="self-start px-0"
              onClick={() => setDesc((d) => ({ ...d, open: "click" }))}
            >
              + Adicionar descrição
            </Button>
          )}
          {items ? (
            <>
              <PickMany
                label="Projeto/Cliente"
                items={items.projects}
                value={projectIds}
                onChange={chooseProjects}
                invalid={error === PROJECT_REQUIRED}
              />
              <PickMany
                label="Unidade Móvel"
                items={items.units(projectIds)}
                value={mobileUnitIds}
                onChange={setMobileUnitIds}
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
                {!personal && (
                  <Pick
                    label="Responsável"
                    items={items.people}
                    value={form.assigneeId}
                    onChange={(v) => set("assigneeId", v)}
                  />
                )}
                <Input
                  aria-label="Chamado GLPI"
                  placeholder="Chamado GLPI"
                  inputMode="numeric"
                  pattern="\d{1,7}"
                  className="tabular-nums"
                  value={form.glpiTicket}
                  onChange={(e) => set("glpiTicket", e.target.value)}
                />
                {!personal && (
                  <Pick label="Ciclo" items={items.cycles} value={cycleId} onChange={setCycleId} />
                )}
                <Input
                  type="date"
                  aria-label="Prazo"
                  className="tabular-nums"
                  value={form.dueDate}
                  onChange={(e) => {
                    const v = e.target.value;
                    setForm((f) => ({ ...f, dueDate: v, dueTime: v ? f.dueTime : "" }));
                  }}
                />
                {/* ADR-072: hora opcional, só com data */}
                <Input
                  type="time"
                  aria-label="Horário"
                  className="tabular-nums"
                  disabled={!form.dueDate}
                  value={form.dueTime}
                  onChange={(e) => set("dueTime", e.target.value)}
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
              {!!items.involved.length && (
                <PickMany
                  label="Envolvidos"
                  items={items.involved}
                  value={form.involvedIds}
                  onChange={(v) => set("involvedIds", v)}
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
              disabled={pending || !items || !online}
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
