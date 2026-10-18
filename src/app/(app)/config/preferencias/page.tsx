import type { Metadata } from "next";
import { Suspense } from "react";
import { PushDevice } from "@/components/notifications/push-device";
import { env } from "@/lib/env";
import { requireUser } from "@/server/actor";
import { getPreferences } from "@/server/services/notifications";
import { AdminConfigPage } from "../admin-only";
import { ChannelMatrix, ScheduleForm, ThemePicker } from "./preferences-client";
import { Card } from "@/components/ui/card";

export const metadata: Metadata = { title: "Minhas preferências · ITC Tasks" };

const card = "flex flex-col gap-3.5 md:p-5";

// ADR-050: tema, evento × canal, push neste dispositivo, expediente e resumo
export default function PreferencesPage() {
  return (
    <Suspense>
      <AdminConfigPage
        title="Minhas preferências"
        members
        render={async (actor) => {
          if (actor.kind !== "user") throw new Error("Só pessoas têm preferências");
          const [prefs, { profile }] = await Promise.all([getPreferences(actor), requireUser()]);
          return {
            content: (
              <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
                <Card as="section" padding="md" aria-labelledby="h-notif" className={card}>
                  <div>
                    <h2 id="h-notif" className="text-h3 font-bold">
                      Notificações
                    </h2>
                    <p className="text-sm text-muted">
                      Escolha o que chega e por onde. Ações feitas por você mesmo nunca geram aviso;
                      as do seu agente chegam como “Ação de agente”.
                    </p>
                  </div>
                  <ChannelMatrix channels={prefs.channels} />
                </Card>
                <div className="flex flex-col gap-5">
                  <Card as="section" padding="md" aria-labelledby="h-theme" className={card}>
                    <h2 id="h-theme" className="text-h3 font-bold">
                      Aparência
                    </h2>
                    <ThemePicker initial={profile.theme} />
                  </Card>
                  <Card as="section" padding="md" aria-labelledby="h-push" className={card}>
                    <h2 id="h-push" className="text-h3 font-bold">
                      Push neste dispositivo
                    </h2>
                    <PushDevice publicKey={env.VAPID_PUBLIC_KEY ?? null} />
                  </Card>
                  <Card as="section" padding="md" aria-labelledby="h-hours" className={card}>
                    <h2 id="h-hours" className="text-h3 font-bold">
                      Horário e resumo
                    </h2>
                    <ScheduleForm
                      start={prefs.quietHoursStart}
                      end={prefs.quietHoursEnd}
                      emailDigest={prefs.emailDigest}
                    />
                  </Card>
                </div>
              </div>
            ),
          };
        }}
      />
    </Suspense>
  );
}
