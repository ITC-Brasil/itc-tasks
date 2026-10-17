import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Entrar · ITC Tasks" };

export default function LoginPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center p-4">
      <div className="flex w-full max-w-sm flex-col gap-6 rounded-xl bg-surface p-8 shadow-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- SVG da marca, sem otimização */}
        <img
          src="/brand/itc-tasks-horizontal-principal.svg"
          alt="ITC Tasks"
          className="h-8 self-start"
        />
        <div className="flex flex-col gap-1">
          <h1 className="text-h2">Entrar</h1>
          <p className="text-sm text-muted">Use o e-mail e a senha que o admin criou para você.</p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
