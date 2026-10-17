// "Matheus Lima" → "ML"; nome de uma palavra → duas primeiras letras
export function initialsOf(name: string) {
  const words = name.trim().split(/\s+/);
  const letters = words.length > 1 ? words[0][0] + words.at(-1)![0] : words[0].slice(0, 2);
  return letters.toUpperCase();
}
