import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { api } from "@/src/api/client";
import { colors } from "@/src/theme";
import { formatDateID, formatRp, statusLabel } from "@/src/utils/format";
import {
  buildInvoiceHTML,
  buildWhatsAppMessage,
  normalizeWAPhone,
} from "@/src/utils/invoice-template";

const STATUSES = [
  { key: "draft", label: "Draft" },
  { key: "sent", label: "Terkirim" },
  { key: "paid", label: "Lunas" },
  { key: "overdue", label: "Jatuh Tempo" },
];

export default function InvoiceDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [invoice, setInvoice] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [statusOpen, setStatusOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");

  const load = useCallback(async () => {
    try {
      const [inv, p] = await Promise.all([api.getInvoice(id), api.getProfile()]);
      setInvoice(inv);
      setProfile(p);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2200);
  };

  const setStatus = async (s: string) => {
    setStatusOpen(false);
    try {
      const updated = await api.setStatus(id, s);
      setInvoice(updated);
    } catch (e) {
      console.warn(e);
    }
  };

  const togglePaid = async () => {
    const next = invoice.status === "paid" ? (invoice.status_before || "sent") : "paid";
    try {
      const updated = await api.setStatus(id, next);
      setInvoice(updated);
    } catch (e) {
      console.warn(e);
    }
  };

  const generatePDF = async (): Promise<string | null> => {
    try {
      const html = buildInvoiceHTML(invoice, profile);
      const { uri } = await Print.printToFileAsync({ html });
      return uri;
    } catch (e) {
      console.warn("pdf", e);
      return null;
    }
  };

  const sharePDF = async () => {
    setBusy(true);
    try {
      const uri = await generatePDF();
      if (!uri) return;
      if (Platform.OS === "web") {
        // On web, printToFileAsync may not work; fallback to print preview
        await Print.printAsync({ html: buildInvoiceHTML(invoice, profile) });
        return;
      }
      const available = await Sharing.isAvailableAsync();
      if (available) {
        await Sharing.shareAsync(uri, {
          mimeType: "application/pdf",
          dialogTitle: `Invoice ${invoice.number}`,
          UTI: "com.adobe.pdf",
        });
      } else {
        showToast("Berbagi tidak tersedia di perangkat ini");
      }
    } finally {
      setBusy(false);
    }
  };

  const shareWhatsApp = async () => {
    const phone = normalizeWAPhone(invoice.client_snapshot?.phone || "");
    const message = buildWhatsAppMessage(invoice, profile);
    const encoded = encodeURIComponent(message);
    const url = phone ? `https://wa.me/${phone}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
    try {
      const can = await Linking.canOpenURL(url);
      if (can || Platform.OS === "web") {
        await Linking.openURL(url);
      } else {
        showToast("WhatsApp tidak tersedia");
      }
    } catch (e) {
      console.warn(e);
    }
  };

  const del = async () => {
    setBusy(true);
    try {
      await api.deleteInvoice(id);
      router.back();
    } finally {
      setBusy(false);
    }
  };

  const duplicate = async () => {
    setBusy(true);
    try {
      const dup = await api.duplicateInvoice(id);
      showToast("Invoice diduplikasi");
      router.replace(`/invoice/edit/${dup.id}`);
    } catch (e) {
      console.warn(e);
      showToast("Gagal duplikasi");
    } finally {
      setBusy(false);
    }
  };

  const createPayment = async () => {
    setBusy(true);
    try {
      const updated = await api.createPaymentLink(id);
      setInvoice(updated);
      showToast("Link pembayaran dibuat");
    } catch (e: any) {
      console.warn(e);
      showToast("Gagal membuat link");
    } finally {
      setBusy(false);
    }
  };

  if (loading || !invoice) {
    return (
      <SafeAreaView edges={["top"]} style={styles.root}>
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  const s = colors.status[invoice.status] || colors.status.draft;
  const client = invoice.client_snapshot || {};

  return (
    <SafeAreaView edges={["top"]} style={styles.root} testID="invoice-detail">
      <View style={styles.headerBar}>
        <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={styles.iconBtn}>
          <Feather name="arrow-left" size={22} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{invoice.number}</Text>
        <TouchableOpacity
          testID="invoice-edit-btn"
          onPress={() => router.push(`/invoice/edit/${invoice.id}`)}
          style={styles.iconBtn}
        >
          <Feather name="edit-2" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={{ paddingBottom: 220 }}>
        {/* Big total */}
        <View style={styles.totalSection}>
          <Text style={styles.overline}>TOTAL</Text>
          <Text style={styles.bigTotal} numberOfLines={1} adjustsFontSizeToFit>{formatRp(invoice.total)}</Text>
          <TouchableOpacity
            testID="invoice-status-toggle"
            style={[styles.badgeBtn, { backgroundColor: s.bg }]}
            onPress={() => setStatusOpen(true)}
            activeOpacity={0.7}
          >
            <Text style={[styles.badgeText, { color: s.text }]}>{statusLabel(invoice.status)}</Text>
            <Feather name="chevron-down" size={12} color={s.text} />
          </TouchableOpacity>
        </View>

        {/* Quick paid toggle */}
        <View style={styles.paidRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.paidLabel}>Tandai sudah dibayar</Text>
            <Text style={styles.paidSub}>Toggle status pembayaran cepat</Text>
          </View>
          <TouchableOpacity
            testID="paid-toggle"
            onPress={togglePaid}
            style={[styles.paidToggle, invoice.status === "paid" && styles.paidToggleOn]}
            activeOpacity={0.8}
          >
            <Feather
              name={invoice.status === "paid" ? "check-circle" : "circle"}
              size={20}
              color={invoice.status === "paid" ? "#FFFFFF" : colors.textMute}
            />
          </TouchableOpacity>
        </View>

        {/* Client + dates */}
        <View style={styles.metaCard}>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Klien</Text>
            <Text style={styles.metaValue}>{client.name || "-"}</Text>
          </View>
          {client.phone ? (
            <View style={styles.metaRow}>
              <Text style={styles.metaLabel}>Telepon</Text>
              <Text style={styles.metaValue}>{client.phone}</Text>
            </View>
          ) : null}
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Tgl Invoice</Text>
            <Text style={styles.metaValue}>{formatDateID(invoice.issue_date)}</Text>
          </View>
          <View style={styles.metaRow}>
            <Text style={styles.metaLabel}>Jatuh Tempo</Text>
            <Text style={styles.metaValue}>{formatDateID(invoice.due_date)}</Text>
          </View>
        </View>

        {/* Items */}
        <View style={styles.itemsCard}>
          <Text style={styles.sectionTitle}>Rincian</Text>
          {(invoice.items || []).map((it: any, idx: number) => (
            <View key={idx} style={styles.itemLine}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemDesc}>{it.description || "-"}</Text>
                <Text style={styles.itemMeta}>{it.quantity} × {formatRp(it.rate)}</Text>
              </View>
              <Text style={styles.itemTotal}>{formatRp((it.quantity || 0) * (it.rate || 0))}</Text>
            </View>
          ))}
          <View style={styles.totalsBlock}>
            <View style={styles.totalRow}><Text style={styles.totalLabel}>Subtotal</Text><Text style={styles.totalVal}>{formatRp(invoice.subtotal)}</Text></View>
            {invoice.ppn_enabled && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>PPN {invoice.ppn_rate}%</Text>
                <Text style={styles.totalVal}>{formatRp(invoice.ppn_amount)}</Text>
              </View>
            )}
            <View style={[styles.totalRow, styles.grand]}>
              <Text style={styles.grandLabel}>Total</Text>
              <Text style={styles.grandVal}>{formatRp(invoice.total)}</Text>
            </View>
          </View>
        </View>

        {invoice.notes ? (
          <View style={styles.notesCard}>
            <Text style={styles.notesLabel}>Catatan</Text>
            <Text style={styles.notesText}>{invoice.notes}</Text>
          </View>
        ) : null}

        {/* Payment link card */}
        <View style={styles.paymentCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.paymentLabel}>Link Pembayaran Midtrans</Text>
            <Text style={styles.paymentSub} numberOfLines={1}>
              {invoice.payment_url ? "QRIS / VA / e-wallet siap dibagikan" : "Buat link pembayaran online"}
            </Text>
          </View>
          {invoice.payment_url ? (
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TouchableOpacity
                testID="payment-link-open-btn"
                style={styles.paymentBtnGhost}
                onPress={() => Linking.openURL(invoice.payment_url)}
                activeOpacity={0.8}
              >
                <Feather name="external-link" size={16} color={colors.text} />
              </TouchableOpacity>
              <TouchableOpacity
                testID="payment-link-refresh-btn"
                style={styles.paymentBtnGhost}
                onPress={createPayment}
                activeOpacity={0.8}
                disabled={busy}
              >
                <Feather name="refresh-cw" size={16} color={colors.text} />
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              testID="payment-link-create-btn"
              style={styles.paymentBtn}
              onPress={createPayment}
              disabled={busy}
              activeOpacity={0.85}
            >
              {busy ? <ActivityIndicator color="#FFFFFF" /> : (
                <>
                  <Feather name="credit-card" size={14} color="#FFFFFF" />
                  <Text style={styles.paymentBtnText}>Buat Link</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>

        <View style={{ paddingHorizontal: 24, marginTop: 8 }}>
          <TouchableOpacity testID="invoice-duplicate-btn" style={styles.actionRow} onPress={duplicate} activeOpacity={0.7} disabled={busy}>
            <Feather name="copy" size={16} color={colors.primary} />
            <Text style={styles.actionText}>Duplikat Invoice</Text>
          </TouchableOpacity>
          <TouchableOpacity testID="invoice-delete-btn" style={styles.delRow} onPress={del} activeOpacity={0.7} disabled={busy}>
            <Feather name="trash-2" size={16} color={colors.accent} />
            <Text style={styles.delText}>Hapus Invoice</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Sticky bottom actions */}
      <View style={styles.stickyFooter}>
        <TouchableOpacity
          testID="pdf-preview-btn"
          style={styles.pdfBtn}
          onPress={sharePDF}
          disabled={busy}
          activeOpacity={0.85}
        >
          {busy ? <ActivityIndicator color={colors.text} /> : (
            <>
              <Feather name="file-text" size={18} color={colors.text} />
              <Text style={styles.pdfBtnText}>PDF</Text>
            </>
          )}
        </TouchableOpacity>
        <TouchableOpacity
          testID="whatsapp-share-btn"
          style={styles.waBtn}
          onPress={shareWhatsApp}
          activeOpacity={0.85}
        >
          <Feather name="message-circle" size={18} color="#FFFFFF" />
          <Text style={styles.waBtnText}>Kirim WhatsApp</Text>
        </TouchableOpacity>
      </View>

      {/* Status sheet */}
      <Modal visible={statusOpen} transparent animationType="slide" onRequestClose={() => setStatusOpen(false)}>
        <Pressable style={styles.modalBg} onPress={() => setStatusOpen(false)} />
        <View style={styles.sheet} testID="status-sheet">
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Ubah Status</Text>
          {STATUSES.map((opt) => {
            const ss = colors.status[opt.key];
            const active = invoice.status === opt.key;
            return (
              <TouchableOpacity
                key={opt.key}
                testID={`status-${opt.key}`}
                style={[styles.statusItem, active && { backgroundColor: colors.borderLight }]}
                onPress={() => setStatus(opt.key)}
              >
                <View style={[styles.dot, { backgroundColor: ss.text }]} />
                <Text style={styles.statusLabel}>{opt.label}</Text>
                {active && <Feather name="check" size={18} color={colors.primary} />}
              </TouchableOpacity>
            );
          })}
        </View>
      </Modal>

      {toast ? (
        <View style={styles.toast} pointerEvents="none">
          <Text style={styles.toastText}>{toast}</Text>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 12, gap: 8 },
  iconBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: colors.text },
  totalSection: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 24, alignItems: "flex-start" },
  overline: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5, color: colors.textMute, marginBottom: 6 },
  bigTotal: { fontSize: 44, fontWeight: "800", color: colors.primary, letterSpacing: -1.5 },
  badgeBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999, marginTop: 12 },
  badgeText: { fontSize: 11, fontWeight: "800", letterSpacing: 0.6, textTransform: "uppercase" },
  paidRow: { flexDirection: "row", alignItems: "center", marginHorizontal: 24, marginBottom: 16, paddingVertical: 14, paddingHorizontal: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14 },
  paidLabel: { fontSize: 14, fontWeight: "700", color: colors.text },
  paidSub: { fontSize: 12, color: colors.textMute, marginTop: 2 },
  paidToggle: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center", backgroundColor: colors.borderLight },
  paidToggleOn: { backgroundColor: colors.primary },
  metaCard: { marginHorizontal: 24, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 8 },
  metaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.borderLight },
  metaLabel: { fontSize: 12, color: colors.textMute, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.6 },
  metaValue: { fontSize: 14, color: colors.text, fontWeight: "600", maxWidth: "60%", textAlign: "right" },
  itemsCard: { marginHorizontal: 24, marginTop: 16, backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: 12 },
  itemLine: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.borderLight, gap: 12 },
  itemDesc: { fontSize: 14, color: colors.text, fontWeight: "600" },
  itemMeta: { fontSize: 12, color: colors.textMute, marginTop: 2 },
  itemTotal: { fontSize: 14, fontWeight: "700", color: colors.text },
  totalsBlock: { marginTop: 12 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  totalLabel: { fontSize: 13, color: colors.textMid },
  totalVal: { fontSize: 13, color: colors.text, fontWeight: "600" },
  grand: { marginTop: 8, borderTopWidth: 2, borderTopColor: colors.primary, paddingTop: 10 },
  grandLabel: { fontSize: 15, fontWeight: "800", color: colors.primary },
  grandVal: { fontSize: 17, fontWeight: "800", color: colors.primary },
  notesCard: { marginHorizontal: 24, marginTop: 16, padding: 16, borderRadius: 14, backgroundColor: colors.borderLight },
  notesLabel: { fontSize: 11, fontWeight: "800", color: colors.textMute, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 },
  notesText: { fontSize: 14, color: colors.textMid, lineHeight: 20 },
  paymentCard: { marginHorizontal: 24, marginTop: 16, padding: 16, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", gap: 12 },
  paymentLabel: { fontSize: 14, fontWeight: "700", color: colors.text },
  paymentSub: { fontSize: 12, color: colors.textMute, marginTop: 2 },
  paymentBtn: { height: 40, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6, minWidth: 100 },
  paymentBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 13 },
  paymentBtnGhost: { width: 40, height: 40, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
  actionRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12 },
  actionText: { color: colors.primary, fontWeight: "600", fontSize: 14 },
  delRow: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14 },
  delText: { color: colors.accent, fontWeight: "600", fontSize: 14 },
  stickyFooter: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 20, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg, flexDirection: "row", gap: 10 },
  pdfBtn: { flex: 1, height: 54, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  pdfBtnText: { color: colors.text, fontSize: 15, fontWeight: "700" },
  waBtn: { flex: 1.5, height: 54, borderRadius: 14, backgroundColor: colors.whatsapp, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 },
  waBtnText: { color: "#FFFFFF", fontSize: 15, fontWeight: "700" },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingBottom: 32, paddingTop: 8 },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: 8 },
  sheetTitle: { fontSize: 17, fontWeight: "700", color: colors.text, paddingHorizontal: 8, paddingBottom: 12 },
  statusItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 14, paddingHorizontal: 12, borderRadius: 12 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  statusLabel: { flex: 1, fontSize: 15, color: colors.text, fontWeight: "600" },
  toast: { position: "absolute", left: 24, right: 24, bottom: 100, backgroundColor: colors.text, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 12, alignItems: "center" },
  toastText: { color: "#FFFFFF", fontSize: 13, fontWeight: "600" },
});
