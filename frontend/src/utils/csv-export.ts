// CSV export helper — generates CSV string and shares on native; downloads on web.
import { Platform } from "react-native";
import * as Sharing from "expo-sharing";
import * as FileSystem from "expo-file-system/legacy";
import { formatDateID, statusLabel } from "@/src/utils/format";

function escapeCSV(v: any): string {
  const s = String(v ?? "");
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function buildInvoicesCSV(invoices: any[]): string {
  const header = [
    "Nomor", "Tanggal", "Jatuh Tempo", "Klien", "Telepon", "Subtotal",
    "PPN", "Total", "Status",
  ];
  const rows = invoices.map((i) => [
    i.number,
    formatDateID(i.issue_date),
    formatDateID(i.due_date),
    i.client_snapshot?.name || "",
    i.client_snapshot?.phone || "",
    i.subtotal || 0,
    i.ppn_amount || 0,
    i.total || 0,
    statusLabel(i.status),
  ]);
  return [header, ...rows].map((r) => r.map(escapeCSV).join(",")).join("\n");
}

export async function shareInvoicesCSV(invoices: any[]): Promise<void> {
  const csv = buildInvoicesCSV(invoices);
  const filename = `faktur-export-${new Date().toISOString().slice(0, 10)}.csv`;

  if (Platform.OS === "web") {
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }

  const dir = (FileSystem as any).cacheDirectory || (FileSystem as any).documentDirectory;
  const uri = `${dir}${filename}`;
  await FileSystem.writeAsStringAsync(uri, csv, { encoding: FileSystem.EncodingType.UTF8 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: "text/csv", dialogTitle: "Export CSV Invoice" });
  }
}
