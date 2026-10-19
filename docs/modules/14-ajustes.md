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

**Depois do merge:** o Matheus troca a senha do admin em Minhas preferências (#22).

## Item 2 — Excluir tarefa

Pendente (aguarda a revisão do item 1).
