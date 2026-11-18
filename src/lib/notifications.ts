// ADR-050: textos, padrões e expediente das notificações (puro; usado pela tela, push e e-mail)

export const NOTIFICATION_EVENTS = [
  "assigned",
  "mentioned",
  "commented",
  "due_today",
  "overdue",
  "status_changed",
  "agent_action",
  "automation",
] as const;
export type NotificationEvent = (typeof NOTIFICATION_EVENTS)[number];
export type Channels = { inApp: boolean; push: boolean; email: boolean };

/** Linha ausente em notification_preferences = este padrão (tela de Preferências). */
export const DEFAULT_CHANNELS: Record<NotificationEvent, Channels> = {
  assigned: { inApp: true, push: true, email: false },
  mentioned: { inApp: true, push: true, email: false },
  commented: { inApp: true, push: false, email: false },
  due_today: { inApp: true, push: true, email: true },
  overdue: { inApp: true, push: true, email: true },
  status_changed: { inApp: true, push: false, email: false },
  agent_action: { inApp: true, push: false, email: false },
  automation: { inApp: true, push: false, email: false },
};

export const EVENT_LABELS: Record<NotificationEvent, { name: string; hint: string; chip: string }> =
  {
    assigned: {
      name: "Tarefa atribuída a mim",
      hint: "Por uma pessoa, automação ou agente",
      chip: "Atribuída",
    },
    mentioned: { name: "@Menção", hint: "Em comentário ou descrição", chip: "Menção" },
    commented: {
      name: "Comentário em tarefa minha",
      hint: "Tarefas que criei ou em que sou responsável",
      chip: "Comentário",
    },
    due_today: { name: "Prazo hoje", hint: "Aviso às 08:00 do dia", chip: "Prazo hoje" },
    overdue: { name: "Tarefa vencida", hint: "Na virada do dia", chip: "Vencida" },
    status_changed: {
      name: "Status mudou em tarefa que criei",
      hint: "Inclui conclusão",
      chip: "Status",
    },
    agent_action: {
      name: "Ação de agente em tarefa minha",
      hint: "Criação, mudança ou conclusão via MCP",
      chip: "Agente",
    },
    automation: {
      name: "Aviso de automação",
      hint: "Regras de Configurações › Automações",
      chip: "Automação",
    },
  };

export type NotificationData = {
  quote?: string;
  from?: string;
  to?: string;
  rule?: string;
  subtask?: string; // Módulo 15: lembrete de prazo de uma subtarefa
  dueTime?: string; // ADR-072: hora do prazo no aviso "vence hoje"
  waiting?: string; // ADR-078: motivo do Aguardando no aviso da data prevista
};

/** "Ana mencionou você em" — o que vem antes de "TI-149 Título". */
export function verb(event: NotificationEvent, data: NotificationData) {
  switch (event) {
    case "assigned":
      return "atribuiu a você";
    case "mentioned":
      return "mencionou você em";
    case "commented":
      return "comentou em";
    case "due_today":
      if (data.waiting) return `previsão do Aguardando (${data.waiting}) é hoje em`;
      if (data.subtask)
        return `subtarefa “${data.subtask}” vence hoje${data.dueTime ? ` às ${data.dueTime}` : ""} em`;
      return data.dueTime ? `vence hoje às ${data.dueTime}:` : "vence hoje:";
    case "overdue":
      return data.subtask ? `subtarefa “${data.subtask}” venceu em` : "venceu:";
    case "status_changed":
      return data.to ? `mudou para ${data.to}` : "mudou o status de";
    case "agent_action":
      return "alterou";
    case "automation":
      return data.rule ? `“${data.rule}” avisou sobre` : "avisou sobre";
  }
}

/** Uma linha para push e e-mail: "Ana mencionou você em TI-149 Trocar nobreak". */
export function describe(
  n: { event: NotificationEvent; actorLabel: string; data: NotificationData },
  task: { number: number; title: string } | null,
) {
  const ref = task ? ` TI-${task.number} ${task.title}` : "";
  return `${n.actorLabel} ${verb(n.event, n.data)}${ref}`;
}

const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** Dentro do expediente [início, fim) no fuso dado; início > fim = atravessa a meia-noite. */
export function withinHours(now: Date, start: string, end: string, timeZone: string) {
  const hhmm = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(now);
  const t = minutes(hhmm);
  const [s, e] = [minutes(start), minutes(end)];
  return s <= e ? t >= s && t < e : t >= s || t < e;
}
