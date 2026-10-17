import { toast } from "sonner";

/** Grava a preferência; se falhar, desfaz a mudança otimista e avisa (UI.md §3). */
export function savePreference(save: Promise<unknown>, revert: () => void) {
  save.catch(() => {
    revert();
    toast.error("Não foi possível salvar a preferência");
  });
}
