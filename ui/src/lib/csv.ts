import type { VoltTable } from "./volt";

export function tableToCsv(t: VoltTable): string {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [t.columns.map((c) => esc(c.name)).join(","), ...t.rows.map((r) => r.map(esc).join(","))].join("\n");
}
export function tableToMarkdown(t: VoltTable): string {
  const head = `| ${t.columns.map((c) => c.name).join(" | ")} |`;
  const sep = `| ${t.columns.map(() => "---").join(" | ")} |`;
  const body = t.rows.map((r) => `| ${r.map((v) => (v == null ? "NULL" : String(v))).join(" | ")} |`);
  return [head, sep, ...body].join("\n");
}
export function downloadText(filename: string, text: string, mime = "text/plain") {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 500);
}
export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { return false; }
}
