/** Nächste freie laufende Nummer für IDs wie `opening-7`, damit neue IDs nicht kollidieren. */
export function nextNumber(items: readonly { id: string }[], prefix: string): number {
  let max = 0;
  for (const { id } of items) {
    const match = id.startsWith(prefix) ? /^\d+$/.exec(id.slice(prefix.length)) : null;
    if (match) max = Math.max(max, Number(match[0]));
  }
  return max + 1;
}
