export function safeSlug(s: string): string {
  return s.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "repo";
}

export function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

export type Format = "html" | "markdown";

export function normalizeFormat(input: string): Format {
  const v = input.toLowerCase();
  if (v === "md" || v === "markdown") return "markdown";
  if (v === "html" || v === "htm") return "html";
  throw new Error(`Unknown format: ${input}. Use 'html' or 'markdown'.`);
}

export function parseThreshold(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 100) {
    throw new Error(`Invalid --threshold: ${raw}. Expected a number 0-100.`);
  }
  return n;
}
