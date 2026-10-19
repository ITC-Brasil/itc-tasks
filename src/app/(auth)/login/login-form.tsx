"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { clearPageCache } from "@/components/layout/pwa";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { authClient } from "@/lib/auth-client";

export function LoginForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    const { error } = await authClient.signIn.email({
      email: String(form.get("email")),
      password: String(form.get("password")),
    });
    if (error) {
      setPending(false);
      setError(
        error.code === "BANNED_USER"
          ? "Sua conta está desativada. Fale com um admin."
          : error.status === 429
            ? "Muitas tentativas. Aguarde um minuto e tente de novo."
            : "E-mail ou senha incorretos.",
      );
      return;
    }
    // ADR-064: sem "Sair" antes (sessão expirada), as telas guardadas são de outra pessoa
    await clearPageCache().catch(() => {});
    router.replace("/");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        E-mail
        <Input
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          aria-invalid={!!error}
        />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium">
        Senha
        <Input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          aria-invalid={!!error}
        />
      </label>
      <p role="alert" className="min-h-5 text-sm text-err">
        {error}
      </p>
      <Button type="submit" disabled={pending}>
        {pending ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}
