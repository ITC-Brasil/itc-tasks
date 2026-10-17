"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** ADR-048: mudança em qualquer tarefa → recarrega os Server Components (debounce de 500 ms). */
export function LiveRefresh() {
  const router = useRouter();
  useEffect(() => {
    const source = new EventSource("/api/events"); // reconecta sozinho (retry: 5000)
    let timer: ReturnType<typeof setTimeout> | undefined;
    source.addEventListener("task.changed", () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 500);
    });
    return () => {
      clearTimeout(timer);
      source.close();
    };
  }, [router]);
  return null;
}
