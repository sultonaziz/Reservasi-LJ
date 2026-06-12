// Indonesian Rupiah formatting + helpers.

export function formatRp(n: number | string | null | undefined): string {
  const num = typeof n === "string" ? Number(n) : n ?? 0;
  if (!isFinite(num as number)) return "Rp 0";
  const fixed = Math.round((num as number) * 100) / 100;
  const [intPart, decPart] = String(Math.abs(fixed)).split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const sign = (fixed as number) < 0 ? "-" : "";
  return decPart && decPart !== "0"
    ? `${sign}Rp ${grouped},${decPart}`
    : `${sign}Rp ${grouped}`;
}

export function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function addDaysISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function formatDateID(iso: string): string {
  if (!iso) return "-";
  const [y, m, d] = iso.split("-");
  const months = [
    "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
    "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
  ];
  return `${parseInt(d, 10)} ${months[parseInt(m, 10) - 1]} ${y}`;
}

export function statusLabel(s: string): string {
  return ({
    draft: "Draft",
    sent: "Terkirim",
    paid: "Lunas",
    overdue: "Jatuh Tempo",
  } as Record<string, string>)[s] || s;
}
