import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { api } from "@/src/api/client";
import { DateField } from "@/src/components/DateField";
import { colors } from "@/src/theme";
import { addDaysISO, formatRp, todayISO } from "@/src/utils/format";

type Item = { description: string; quantity: number; rate: number };

export default function InvoiceEditor({ invoiceId }: { invoiceId?: string }) {
  const router = useRouter();
  const isNew = !invoiceId;
  const id = invoiceId || "";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [number, setNumber] = useState("");
  const [issueDate, setIssueDate] = useState(todayISO());
  const [dueDate, setDueDate] = useState(addDaysISO(14));
  const [items, setItems] = useState<Item[]>([{ description: "", quantity: 1, rate: 0 }]);
  const [ppnEnabled, setPpnEnabled] = useState(false);
  const [ppnRate, setPpnRate] = useState("11");
  const [notes, setNotes] = useState("");
  const [clientId, setClientId] = useState<string | null>(null);
  const [clientSnapshot, setClientSnapshot] = useState<any>({});
  const [clients, setClients] = useState<any[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  const subtotal = useMemo(
    () => items.reduce((s, it) => s + (Number(it.quantity) || 0) * (Number(it.rate) || 0), 0),
    [items]
  );
  const ppnAmount = useMemo(
    () => (ppnEnabled ? subtotal * ((Number(ppnRate) || 0) / 100) : 0),
    [ppnEnabled, ppnRate, subtotal]
  );
  const total = subtotal + ppnAmount;

  const load = useCallback(async () => {
    try {
      const [cs, next] = await Promise.all([api.listClients(), isNew ? api.nextNumber() : Promise.resolve(null)]);
      setClients(cs);
      if (isNew && next) setNumber(next.number);
      if (!isNew) {
        const inv = await api.getInvoice(id);
        setNumber(inv.number);
        setIssueDate(inv.issue_date);
        setDueDate(inv.due_date);
        setItems(inv.items.length ? inv.items : [{ description: "", quantity: 1, rate: 0 }]);
        setPpnEnabled(!!inv.ppn_enabled);
        setPpnRate(String(inv.ppn_rate || 11));
        setNotes(inv.notes || "");
        setClientId(inv.client_id || null);
        setClientSnapshot(inv.client_snapshot || {});
      }
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  }, [id, isNew]);

  useEffect(() => { load(); }, [load]);

  const updateItem = (idx: number, k: keyof Item, v: any) => {
    setItems((arr) => arr.map((it, i) => (i === idx ? { ...it, [k]: k === "description" ? v : Number(v) || 0 } : it)));
  };
  const addItem = () => setItems((a) => [...a, { description: "", quantity: 1, rate: 0 }]);
  const removeItem = (idx: number) => setItems((a) => (a.length > 1 ? a.filter((_, i) => i !== idx) : a));

  const pickClient = (c: any | null) => {
    if (c) {
      setClientId(c.id);
      setClientSnapshot({ name: c.name, address: c.address, phone: c.phone, email: c.email });
    } else {
      setClientId(null);
      setClientSnapshot({});
    }
    setPickerOpen(false);
  };

  const save = async (status?: string) => {
    if (!number.trim()) return;
    setSaving(true);
    try {
      const payload = {
        number,
        client_id: clientId,
        issue_date: issueDate,
        due_date: dueDate,
        items: items.filter((i) => (i.description || "").trim() || i.quantity || i.rate),
        ppn_enabled: ppnEnabled,
        ppn_rate: Number(ppnRate) || 0,
        notes,
        status: status || "draft",
      };
      let saved;
      if (isNew) saved = await api.createInvoice(payload);
      else saved = await api.updateInvoice(id, payload);
      router.replace(`/invoice/${saved.id}`);
    } catch (e) {
      console.warn(e);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView edges={["top"]} style={styles.root}>
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.root} testID="invoice-editor">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.headerBar}>
          <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isNew ? "Invoice Baru" : "Edit Invoice"}</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 200 }} keyboardShouldPersistTaps="handled">
          {/* Invoice number */}
          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>Nomor Invoice</Text>
            <TextInput
              testID="invoice-number"
              value={number}
              onChangeText={setNumber}
              style={styles.input}
              placeholder="INV/2026/02/0001"
              placeholderTextColor={colors.textMute}
            />
          </View>

          {/* Client picker */}
          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>Klien</Text>
            <TouchableOpacity
              testID="invoice-client-picker"
              onPress={() => setPickerOpen(true)}
              style={[styles.input, styles.pickerRow]}
              activeOpacity={0.7}
            >
              <Text style={[styles.pickerText, !clientSnapshot.name && { color: colors.textMute }]}>
                {clientSnapshot.name || "Pilih klien"}
              </Text>
              <Feather name="chevron-down" size={18} color={colors.textMute} />
            </TouchableOpacity>
          </View>

          {/* Dates */}
          <View style={[styles.fieldRow, { paddingHorizontal: 24, marginTop: 14 }]}>
            <DateField testID="invoice-issue-date" label="Tgl Invoice" value={issueDate} onChange={setIssueDate} />
            <View style={{ width: 12 }} />
            <DateField testID="invoice-due-date" label="Jatuh Tempo" value={dueDate} onChange={setDueDate} />
          </View>

          {/* Line items */}
          <View style={[styles.fieldWrap, { marginTop: 20 }]}>
            <Text style={styles.sectionTitle}>Rincian</Text>
            {items.map((it, idx) => (
              <View key={idx} style={styles.itemCard} testID={`item-row-${idx}`}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                  <Text style={styles.itemIdx}>{idx + 1}</Text>
                  <TextInput
                    testID={`item-desc-${idx}`}
                    value={it.description}
                    onChangeText={(v) => updateItem(idx, "description", v)}
                    placeholder="Deskripsi pekerjaan / produk"
                    placeholderTextColor={colors.textMute}
                    style={[styles.itemInput, { flex: 1 }]}
                  />
                  {items.length > 1 && (
                    <TouchableOpacity testID={`item-remove-${idx}`} onPress={() => removeItem(idx)} style={styles.removeBtn}>
                      <Feather name="x" size={16} color={colors.textMute} />
                    </TouchableOpacity>
                  )}
                </View>
                <View style={{ flexDirection: "row", marginTop: 10, gap: 8 }}>
                  <View style={{ flex: 0.8 }}>
                    <Text style={styles.miniLabel}>Qty</Text>
                    <TextInput
                      testID={`item-qty-${idx}`}
                      value={String(it.quantity)}
                      onChangeText={(v) => updateItem(idx, "quantity", v)}
                      style={styles.itemSmall}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={{ flex: 1.4 }}>
                    <Text style={styles.miniLabel}>Harga</Text>
                    <TextInput
                      testID={`item-rate-${idx}`}
                      value={String(it.rate)}
                      onChangeText={(v) => updateItem(idx, "rate", v)}
                      style={styles.itemSmall}
                      keyboardType="numeric"
                    />
                  </View>
                  <View style={{ flex: 1.4 }}>
                    <Text style={styles.miniLabel}>Jumlah</Text>
                    <View style={[styles.itemSmall, { justifyContent: "center", backgroundColor: colors.borderLight }]}>
                      <Text style={styles.lineTotal}>{formatRp((it.quantity || 0) * (it.rate || 0))}</Text>
                    </View>
                  </View>
                </View>
              </View>
            ))}
            <TouchableOpacity testID="add-item-btn" style={styles.addBtn} onPress={addItem} activeOpacity={0.7}>
              <Feather name="plus" size={16} color={colors.primary} />
              <Text style={styles.addBtnText}>Tambah Rincian</Text>
            </TouchableOpacity>
          </View>

          {/* PPN */}
          <View style={styles.ppnCard}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <View>
                <Text style={styles.ppnTitle}>PPN</Text>
                <Text style={styles.ppnSub}>Pajak Pertambahan Nilai</Text>
              </View>
              <Switch
                testID="ppn-toggle"
                value={ppnEnabled}
                onValueChange={setPpnEnabled}
                trackColor={{ false: colors.border, true: colors.primary }}
                thumbColor="#FFFFFF"
              />
            </View>
            {ppnEnabled && (
              <View style={{ flexDirection: "row", alignItems: "center", marginTop: 12, gap: 8 }}>
                <Text style={styles.fieldLabel}>Tarif (%)</Text>
                <TextInput
                  testID="ppn-rate"
                  value={ppnRate}
                  onChangeText={setPpnRate}
                  keyboardType="numeric"
                  style={[styles.input, { flex: 1, marginLeft: 8 }]}
                />
              </View>
            )}
          </View>

          {/* Notes */}
          <View style={styles.fieldWrap}>
            <Text style={styles.fieldLabel}>Catatan</Text>
            <TextInput
              testID="invoice-notes"
              value={notes}
              onChangeText={setNotes}
              multiline
              placeholder="Catatan tambahan, syarat pembayaran…"
              placeholderTextColor={colors.textMute}
              style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
            />
          </View>

          {/* Totals preview */}
          <View style={styles.totalsCard}>
            <View style={styles.totalRow}><Text style={styles.totalLabel}>Subtotal</Text><Text style={styles.totalVal}>{formatRp(subtotal)}</Text></View>
            {ppnEnabled && (
              <View style={styles.totalRow}>
                <Text style={styles.totalLabel}>PPN {ppnRate}%</Text>
                <Text style={styles.totalVal}>{formatRp(ppnAmount)}</Text>
              </View>
            )}
            <View style={[styles.totalRow, styles.grand]}>
              <Text style={styles.grandLabel}>Total</Text>
              <Text testID="invoice-total" style={styles.grandVal}>{formatRp(total)}</Text>
            </View>
          </View>
        </ScrollView>

        <View style={styles.stickyFooter}>
          <TouchableOpacity
            testID="invoice-save-draft"
            style={[styles.secondaryBtn, !number.trim() && { opacity: 0.5 }]}
            onPress={() => save("draft")}
            disabled={saving || !number.trim()}
            activeOpacity={0.85}
          >
            <Text style={styles.secondaryBtnText}>Simpan Draft</Text>
          </TouchableOpacity>
          <TouchableOpacity
            testID="invoice-save-send"
            style={[styles.saveBtn, !number.trim() && { opacity: 0.5 }]}
            onPress={() => save(isNew ? "sent" : undefined)}
            disabled={saving || !number.trim()}
            activeOpacity={0.85}
          >
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveText}>{isNew ? "Simpan & Kirim" : "Simpan"}</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Client picker modal */}
      <Modal visible={pickerOpen} transparent animationType="slide" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.modalBg} onPress={() => setPickerOpen(false)} />
        <View style={styles.sheet} testID="client-picker-sheet">
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Pilih Klien</Text>
          <FlatList
            data={clients}
            keyExtractor={(c) => c.id}
            ListHeaderComponent={
              <TouchableOpacity testID="picker-none" style={styles.sheetItem} onPress={() => pickClient(null)}>
                <View style={styles.avatar}><Feather name="user-x" size={18} color={colors.textMute} /></View>
                <Text style={styles.sheetItemText}>Tanpa klien</Text>
              </TouchableOpacity>
            }
            ListEmptyComponent={
              <View style={{ padding: 20, alignItems: "center" }}>
                <Text style={{ color: colors.textMute }}>Belum ada klien</Text>
                <TouchableOpacity
                  style={[styles.addBtn, { marginTop: 12 }]}
                  onPress={() => {
                    setPickerOpen(false);
                    router.push("/client/new");
                  }}
                >
                  <Feather name="user-plus" size={16} color={colors.primary} />
                  <Text style={styles.addBtnText}>Tambah Klien</Text>
                </TouchableOpacity>
              </View>
            }
            renderItem={({ item }) => (
              <TouchableOpacity testID={`picker-${item.id}`} style={styles.sheetItem} onPress={() => pickClient(item)}>
                <View style={styles.avatar}><Text style={styles.avatarText}>{(item.name || "?").charAt(0).toUpperCase()}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.sheetItemText}>{item.name}</Text>
                  {item.phone ? <Text style={styles.sheetItemMeta}>{item.phone}</Text> : null}
                </View>
              </TouchableOpacity>
            )}
            ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.borderLight }} />}
          />
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700", color: colors.text },
  fieldWrap: { paddingHorizontal: 24, marginTop: 14 },
  fieldRow: { flexDirection: "row" },
  fieldLabel: { fontSize: 12, fontWeight: "700", color: colors.textMid, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: colors.text, marginBottom: 10 },
  input: { backgroundColor: colors.borderLight, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text },
  pickerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  pickerText: { fontSize: 15, color: colors.text, fontWeight: "600" },
  itemCard: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 14, padding: 12, marginBottom: 10 },
  itemIdx: { width: 22, textAlign: "center", color: colors.textMute, fontWeight: "700" },
  itemInput: { fontSize: 15, color: colors.text, paddingVertical: 6 },
  itemSmall: { backgroundColor: colors.borderLight, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 10, fontSize: 14, color: colors.text, minHeight: 40 },
  lineTotal: { fontSize: 13, fontWeight: "700", color: colors.text, textAlign: "right" },
  miniLabel: { fontSize: 10, fontWeight: "700", color: colors.textMute, textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 },
  removeBtn: { padding: 6 },
  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12, borderWidth: 1, borderColor: colors.border, borderStyle: "dashed", borderRadius: 12, marginTop: 4 },
  addBtnText: { color: colors.primary, fontWeight: "600", fontSize: 14 },
  ppnCard: { marginHorizontal: 24, marginTop: 20, padding: 16, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  ppnTitle: { fontSize: 15, fontWeight: "700", color: colors.text },
  ppnSub: { fontSize: 12, color: colors.textMute, marginTop: 2 },
  totalsCard: { marginHorizontal: 24, marginTop: 20, padding: 16, borderRadius: 14, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  totalLabel: { fontSize: 14, color: colors.textMid },
  totalVal: { fontSize: 14, color: colors.text, fontWeight: "600" },
  grand: { borderTopWidth: 2, borderTopColor: colors.primary, marginTop: 8, paddingTop: 12 },
  grandLabel: { fontSize: 16, fontWeight: "800", color: colors.primary },
  grandVal: { fontSize: 18, fontWeight: "800", color: colors.primary },
  stickyFooter: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 20, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg, flexDirection: "row", gap: 10 },
  secondaryBtn: { flex: 1, height: 54, borderRadius: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  secondaryBtnText: { color: colors.text, fontSize: 15, fontWeight: "600" },
  saveBtn: { flex: 1.4, height: 54, borderRadius: 14, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  saveText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  modalBg: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingBottom: 32, paddingTop: 8, maxHeight: "70%" },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.border, alignSelf: "center", marginBottom: 8 },
  sheetTitle: { fontSize: 17, fontWeight: "700", color: colors.text, paddingHorizontal: 8, paddingBottom: 12 },
  sheetItem: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingHorizontal: 8, gap: 12 },
  avatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.borderLight, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 15, fontWeight: "700", color: colors.primary },
  sheetItemText: { fontSize: 15, color: colors.text, fontWeight: "600" },
  sheetItemMeta: { fontSize: 12, color: colors.textMute, marginTop: 2 },
});
