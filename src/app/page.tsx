import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";

// ponytail: vitrine provisória dos tokens; a tela real chega no Módulo 02
export default function Home() {
  return (
    <main className="flex max-w-xl flex-col gap-5 p-6">
      <h1 className="text-h1">ITC Tasks</h1>
      <p className="text-muted">
        <span className="tech">TI-142</span> ·{" "}
        <span className="text-accent-text">Em andamento</span>
      </p>
      <div className="flex flex-wrap gap-2">
        <Button>
          <Plus /> Criar tarefa
        </Button>
        <Button variant="secondary">Cancelar</Button>
        <Button variant="ghost">Ver todas</Button>
        <Button variant="destructive">Arquivar projeto</Button>
      </div>
      <Input placeholder="Título da tarefa" />
      <div className="flex items-center gap-4">
        <Checkbox defaultChecked aria-label="Concluída" />
        <Switch defaultChecked aria-label="Notificações" />
      </div>
      <div className="rounded-xl bg-surface p-5 shadow-1">bg-surface</div>
    </main>
  );
}
