// fora do "use client": a página /ajuda (servidor) também lê a lista (ADR-065)
// UI.md §5. Cada módulo acrescenta aqui os atalhos que passa a atender.
export const SHORTCUTS: { keys: string[]; label: string }[] = [
  { keys: ["⌘", "K"], label: "Busca e comandos" },
  { keys: ["C"], label: "Criar tarefa" },
  { keys: ["⌘", "↵"], label: "Enviar (criar, comentar)" },
  { keys: ["G", "I"], label: "Ir para Minhas Tarefas" },
  { keys: ["G", "M"], label: "Ir para Minhas Tarefas (atalho antigo)" },
  { keys: ["G", "T"], label: "Ir para Equipe" },
  { keys: ["G", "C"], label: "Ir para o ciclo atual" },
  { keys: ["G", "N"], label: "Ir para Notificações" },
  { keys: ["V", "K"], label: "Minhas Tarefas e Equipe: visão Kanban" },
  { keys: ["V", "L"], label: "Minhas Tarefas e Equipe: visão Lista" },
  { keys: ["V", "C"], label: "Minhas Tarefas e Equipe: visão Calendário" },
  { keys: ["["], label: "Recolher/expandir menu" },
  { keys: ["?"], label: "Mostrar atalhos" },
  { keys: ["Esc"], label: "Fechar modal/painel" },
];
