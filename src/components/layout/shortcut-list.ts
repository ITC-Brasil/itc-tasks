// fora do "use client": a página /ajuda (servidor) também lê a lista (ADR-065)
// UI.md §5. Cada módulo acrescenta aqui os atalhos que passa a atender.
export const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["⌘", "K"], label: "Busca e comandos" },
  { keys: ["C"], label: "Criar tarefa" },
  { keys: ["⌘", "↵"], label: "Enviar (criar, comentar)" },
  { keys: ["G", "M"], label: "Ir para Minhas tarefas" },
  { keys: ["G", "T"], label: "Ir para Tarefas" },
  { keys: ["G", "C"], label: "Ir para o ciclo atual" },
  { keys: ["G", "N"], label: "Ir para Notificações" },
  { keys: ["V", "K"], label: "Tarefas: visão Kanban · Minhas tarefas: Cards" },
  { keys: ["V", "L"], label: "Tarefas e Minhas tarefas: visão Lista" },
  { keys: ["V", "C"], label: "Tarefas e Minhas tarefas: visão Calendário" },
  { keys: ["["], label: "Recolher/expandir menu" },
  { keys: ["?"], label: "Mostrar atalhos" },
  { keys: ["Esc"], label: "Fechar modal/painel" },
];
