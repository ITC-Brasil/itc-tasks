import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// tamanhos de texto do @theme: sem isso o twMerge lê `text-small` como cor e apaga `text-on-accent`
const twMerge = extendTailwindMerge({
  extend: { theme: { text: ["body", "caption", "display", "h1", "h2", "h3", "small", "tech"] } },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
