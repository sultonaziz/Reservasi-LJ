// Shared invoice PDF HTML template + WhatsApp helpers.
import { formatDateID, formatRp, statusLabel } from "@/src/utils/format";

function esc(s: any): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildInvoiceHTML(invoice: any, profile: any): string {
  const items = (invoice.items || [])
    .map(
      (it: any, idx: number) => `
      <tr>
        <td style="padding:10px 8px;border-bottom:1px solid #E7E5E4;color:#44403C;">${idx + 1}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #E7E5E4;color:#1C1917;">${esc(it.description)}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #E7E5E4;text-align:right;color:#44403C;">${it.quantity}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #E7E5E4;text-align:right;color:#44403C;">${formatRp(it.rate)}</td>
        <td style="padding:10px 8px;border-bottom:1px solid #E7E5E4;text-align:right;color:#1C1917;font-weight:600;">${formatRp((it.quantity || 0) * (it.rate || 0))}</td>
      </tr>`
    )
    .join("");

  const client = invoice.client_snapshot || {};
  const logo = profile?.logo_base64
    ? `<img src="${profile.logo_base64}" style="max-width:120px;max-height:60px;object-fit:contain;" />`
    : `<div style="font-size:22px;font-weight:800;color:#166534;">${esc(profile?.name || "Bisnis Anda")}</div>`;

  const signature = profile?.signature_base64
    ? `<img src="${profile.signature_base64}" style="max-width:160px;max-height:60px;object-fit:contain;" />`
    : `<div style="height:50px;"></div>`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"/>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Helvetica Neue", Arial, sans-serif; color:#1C1917; margin:0; padding:40px; background:#FAFAF9; }
  .wrap { background:#FFFFFF; padding:36px; border-radius:8px; }
  .top { display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:32px; }
  .biz-name { font-size:14px; font-weight:700; color:#1C1917; margin-top:8px; }
  .biz-meta { font-size:11px; color:#78716C; line-height:1.5; }
  .h1 { font-size:28px; font-weight:800; color:#166534; letter-spacing:-0.5px; margin:0; }
  .badge { display:inline-block; padding:4px 10px; border-radius:999px; font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1px; }
  .meta { display:flex; justify-content:space-between; margin-bottom:24px; gap:24px; }
  .meta-block { flex:1; }
  .label { font-size:10px; font-weight:700; color:#78716C; text-transform:uppercase; letter-spacing:1px; margin-bottom:4px; }
  .value { font-size:13px; color:#1C1917; line-height:1.5; }
  table { width:100%; border-collapse:collapse; font-size:12px; margin-bottom:24px; }
  th { background:#F5F5F4; color:#44403C; font-size:10px; font-weight:700; letter-spacing:0.8px; text-transform:uppercase; text-align:left; padding:10px 8px; }
  .total-block { margin-left:auto; width:55%; }
  .total-row { display:flex; justify-content:space-between; padding:6px 0; font-size:13px; color:#44403C; }
  .total-row.grand { border-top:2px solid #166534; padding-top:12px; margin-top:6px; font-size:18px; font-weight:800; color:#166534; }
  .footer { margin-top:36px; display:flex; justify-content:space-between; }
  .bank { font-size:11px; color:#44403C; max-width:280px; line-height:1.6; }
  .sig-area { display:flex; align-items:flex-end; gap:24px; }
  .sig-block { text-align:center; }
  .sig-line { border-top:1px solid #E7E5E4; padding-top:6px; min-width:160px; font-size:11px; color:#44403C; }
  .qr-block { text-align:center; }
  .qr-label { font-size:9px; color:#78716C; margin-top:4px; }
  .notes { margin-top:16px; padding:14px; background:#F5F5F4; border-radius:8px; font-size:12px; color:#44403C; line-height:1.5; }
</style>
</head><body>
  <div class="wrap">
    <div class="top">
      <div>
        ${logo}
        <div class="biz-name">${esc(profile?.name || "")}</div>
        <div class="biz-meta">
          ${esc(profile?.address || "")}<br/>
          ${profile?.npwp ? "NPWP: " + esc(profile.npwp) + "<br/>" : ""}
          ${profile?.phone ? esc(profile.phone) + " · " : ""}${esc(profile?.email || "")}
        </div>
      </div>
      <div style="text-align:right;">
        <h1 class="h1">INVOICE</h1>
        <div style="font-size:13px;color:#44403C;margin-top:6px;">${esc(invoice.number)}</div>
        <div class="badge" style="background:#F0FDF4;color:#15803D;margin-top:8px;">${esc(statusLabel(invoice.status))}</div>
      </div>
    </div>

    <div class="meta">
      <div class="meta-block">
        <div class="label">Ditagihkan kepada</div>
        <div class="value"><strong>${esc(client.name || "-")}</strong><br/>${esc(client.address || "")}<br/>${esc(client.phone || "")}<br/>${esc(client.email || "")}</div>
      </div>
      <div class="meta-block" style="text-align:right;">
        <div class="label">Tanggal Invoice</div>
        <div class="value">${esc(formatDateID(invoice.issue_date))}</div>
        <div class="label" style="margin-top:10px;">Jatuh Tempo</div>
        <div class="value">${esc(formatDateID(invoice.due_date))}</div>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th style="width:30px;">#</th>
          <th>Deskripsi</th>
          <th style="text-align:right;width:50px;">Qty</th>
          <th style="text-align:right;width:120px;">Harga</th>
          <th style="text-align:right;width:130px;">Jumlah</th>
        </tr>
      </thead>
      <tbody>${items}</tbody>
    </table>

    <div class="total-block">
      <div class="total-row"><span>Subtotal</span><span>${formatRp(invoice.subtotal)}</span></div>
      ${invoice.ppn_enabled ? `<div class="total-row"><span>PPN ${invoice.ppn_rate}%</span><span>${formatRp(invoice.ppn_amount)}</span></div>` : ""}
      <div class="total-row grand"><span>Total</span><span>${formatRp(invoice.total)}</span></div>
    </div>

    ${invoice.notes ? `<div class="notes"><strong>Catatan:</strong><br/>${esc(invoice.notes).replace(/\n/g, "<br/>")}</div>` : ""}

    <div class="footer">
      <div class="bank">
        ${profile?.bank_info ? `<div class="label">Pembayaran</div>${esc(profile.bank_info).replace(/\n/g, "<br/>")}` : ""}
      </div>
      <div class="sig-area">
        <div class="sig-block">
          ${signature}
          <div class="sig-line">${esc(profile?.name || "Tanda Tangan")}</div>
        </div>
        ${profile?.signature_qr_base64 ? `
        <div class="qr-block">
          <img src="${profile.signature_qr_base64}" style="width:80px;height:80px;" />
          <div class="qr-label">Verifikasi Digital</div>
        </div>
        ` : ""}
      </div>
    </div>
  </div>
</body></html>`;
}

export function buildWhatsAppMessage(invoice: any, profile: any): string {
  const client = invoice.client_snapshot || {};
  const lines: string[] = [];
  lines.push(`Halo ${client.name || ""},`);
  lines.push("");
  lines.push(`Berikut invoice dari ${profile?.name || "kami"}:`);
  lines.push("");
  lines.push(`No. Invoice: ${invoice.number}`);
  lines.push(`Tanggal: ${formatDateID(invoice.issue_date)}`);
  lines.push(`Jatuh Tempo: ${formatDateID(invoice.due_date)}`);
  lines.push(`Total: ${formatRp(invoice.total)}`);
  if (invoice.payment_url) {
    lines.push("");
    lines.push(`Bayar online (QRIS / VA / e-wallet):`);
    lines.push(invoice.payment_url);
  } else if (profile?.bank_info) {
    lines.push("");
    lines.push(`Pembayaran dapat ditransfer ke:`);
    lines.push(profile.bank_info);
  }
  lines.push("");
  lines.push(`Mohon konfirmasi setelah pembayaran. Terima kasih atas kerjasamanya 🙏`);
  return lines.join("\n");
}

export function normalizeWAPhone(phone: string): string {
  // Convert Indonesian phones to international format for wa.me
  const digits = (phone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("0")) return "62" + digits.slice(1);
  if (digits.startsWith("62")) return digits;
  return digits;
}
