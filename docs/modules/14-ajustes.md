# Módulo 14 — Ajustes pós-auditoria

Módulo adicional (M-117, 19/10/2026), na `feat/14-ajustes` a partir da `develop`. Dois itens, em
PRs separados: o 1 sai primeiro porque o merge publica em produção.

## Item 1 — Trocar a própria senha (ADR-062)

- **Onde:** Minhas preferências › cartão "Senha" (`PasswordForm` em
  `src/app/(app)/config/preferencias/preferences-client.tsx`). Senha atual, nova e confirmação.
- **Validação:** `changePasswordSchema` em `src/lib/validation/members.ts` (nova = `passwordSchema`,
  12 a 128 caracteres; confirmação igual).
- **Service:** `changeOwnPassword` em `src/server/services/members.ts`. Só ator `user`; senha atual
  errada → `MemberError("Senha atual incorreta")`. Hash Argon2id do Better Auth; apaga as outras
  sessões e mantém a da requisição (o id vem do `auth.api.getSession` na action).
- **Rastro:** linha `[auth] senha trocada userId=… actor=user` no log do servidor.
- **MCP:** sem ferramenta. A allowlist do ADR-058 não muda.
- **Testes:** `tests/integration/change-password.test.ts` (senha atual errada, fraca, confirmação
  diferente e agente recusados; outras sessões caem, a atual fica; senha antiga 401, nova 200) e
  `tests/e2e/members.spec.ts` (erro de senha atual na tela, axe nos dois temas).

**Limite de tentativas (M-119):** 5 erros de senha atual por pessoa em 15 min; a 6ª tentativa,
mesmo com a senha certa, recebe "Muitas tentativas". Contagem em memória do processo (um container
só); reiniciar o app zera.

**Depois do merge:** o Matheus troca a senha do admin em Minhas preferências (#22). Aprovado na
M-119; PR #30 `develop → main`.

## Item 2 — Excluir tarefa

ADR-063. Muda a regra "`task_events` é só-inserção" só para este caso (CLAUDE.md e `SCHEMA.md`
atualizados).

- **Quem pode:** `canDeleteTask` em `src/server/permissions.ts` (puro, usado pelo service e pela UI).
  Admin exclui qualquer uma; member só as que criou (`creatorId` dele e `createdVia` `user` ou
  `agent`). Criada por automação, importação ou sistema: só admin. Agente nunca; o MCP não tem
  ferramenta.
- **Service:** `deleteTasks(actor, { taskIds })` em `src/server/services/tasks.ts`, tudo ou nada
  (até 200). Trava as tarefas, confere cada uma, grava o rastro, emite `task_changed` com
  `fields: ["deleted"]` e apaga; o cascade leva checklist, vínculos, projetos, UMs, etiquetas,
  comentários, eventos, anexos, avisos e `task_imports`. Os arquivos saem do volume depois do
  commit (`removeStoredFiles`).
- **Rastro:** tabela `task_deletions` (`number`, `title`, `deleted_by`, `deleted_at`), sem FK para
  `tasks`. Migração `0013_task_deletions`, só aditiva.
- **Número:** vem do `task_number_seq` e não volta. `/tarefas/<n>` excluída mostra o 404 (com
  status 200, porque o `Suspense` já começou a enviar a página).
- **Quem está com a tarefa aberta:** o SSE recarrega a tela, que cai no 404. Os jobs pendentes
  (`fanout`, `evaluate`) já ignoram eventos e tarefas que não existem.
- **UI:** `DeleteTasksDialog` (`src/components/tasks/delete-tasks-dialog.tsx`) com `TI-<n>` e
  título de cada tarefa. Botão "Excluir" no rodapé do cartão de propriedades do detalhe (volta
  para a Lista) e na barra de ações em massa da Lista, que só aparece se a pessoa pode excluir
  todas as selecionadas.
- **Testes:** `tests/integration/delete-task.test.ts` (member que não criou, agente e lote misto
  recusados; tarefa do sistema só admin; a do agente conta como do dono; dependentes, arquivo e
  rota somem; rastro gravado; número não volta; admin exclui a de outro) e
  `tests/e2e/delete.spec.ts` (detalhe com axe nos dois temas e 404; Lista em massa). O
  `createTask` dos E2E foi para `tests/e2e/session.ts`.

**Depois do pull:** `npm run db:migrate` (`0013_task_deletions`).

## Item 3 — Ações de Membros num menu (M-122)

- **Por quê:** com 4 botões por linha, a tabela de Membros passava da largura do card e criava
  rolagem horizontal mesmo em tela larga.
- **UI:** `MemberActions` em `src/app/(app)/config/membros/members-client.tsx`. Botão de ícone
  `MoreHorizontal` (`aria-label="Ações de <nome>"`) com "Editar nome", "Redefinir senha" e, por
  último e destrutivo, "Desativar/Reativar". Na linha "(você)": "Editar nome" e "Trocar senha",
  que leva a `/config/preferencias#h-password`. Os diálogos de nome e senha viraram controlados e
  abrem a partir do menu.
- **Largura:** sem rolagem horizontal a partir de 1024 px (conferido em 1024 e 1280); abaixo
  disso o `overflow-x-auto` continua.
- **Testes:** `tests/e2e/members.spec.ts` (editar nome, redefinir senha, desativar e reativar pelo
  menu; axe nos dois temas na tabela e nos diálogos; `scrollWidth <= clientWidth` da região em
  1280 px; menu da linha "(você)"). Axe com o menu aberto acusa `region` (o portal do Base UI fica
  fora dos landmarks), por isso roda antes de abrir o menu.
