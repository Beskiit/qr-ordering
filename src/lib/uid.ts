/**
 * Random id for storage file names.
 *
 * `crypto.randomUUID()` only exists in secure contexts (HTTPS / localhost),
 * so it throws when the app is accessed over a LAN IP during development.
 * Fall back to `crypto.getRandomValues`, which works everywhere.
 */
export function randomId(): string {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}
