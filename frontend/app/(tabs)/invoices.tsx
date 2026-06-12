import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { api } from "@/src/api/client";
import { colors } from "@/src/theme";
import { formatDateID, formatRp, statusLabel } from "@/src/utils/format";

const FILTERS = [
  { key: "all", label: "Semua" },
  { key: "draft", label: "Draft" },
  { key: "sent", label: "Terkirim" },
  { key: "paid", label: "Lunas" },
  { key: "overdue", label: "Jatuh Tempo" },
];

export default function InvoicesScreen() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<string>("all");

  const load = useCallback(async () => {
    try {
      const data = await api.listInvoices();
      setInvoices(data);
    } catch (e) {
      console.warn("load invoices", e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const filtered = useMemo(
    () => (filter === "all" ? invoices : invoices.filter((i) => i.status === filter)),
    [filter, invoices]
  );

  const totalReceivable = useMemo(
    () =>
      invoices
        .filter((i) => i.status === "sent" || i.status === "overdue")
        .reduce((sum, i) => sum + (i.total || 0), 0),
    [invoices]
  );

  const totalPaidThisMonth = useMemo(() => {
    const now = new Date();
    return invoices
      .filter((i) => {
        if (i.status !== "paid") return false;
        const d = new Date(i.updated_at || i.created_at);
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      })
      .reduce((sum, i) => sum + (i.total || 0), 0);
  }, [invoices]);

  return (
    <SafeAreaView edges={["top"]} style={styles.root} testID="invoices-screen">
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.overline}>RINGKASAN</Text>
          <Text style={styles.title}>Tagihan Anda</Text>
        </View>
        <TouchableOpacity
          testID="invoice-create-btn-header"
          style={styles.iconBtn}
          onPress={() => router.push("/invoice/new")}
          activeOpacity={0.8}
        >
          <Feather name="plus" size={22} color={colors.surface} />
        </TouchableOpacity>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>Total Tagihan</Text>
          <Text style={styles.summaryAmount} numberOfLines={1} adjustsFontSizeToFit>
            {formatRp(totalReceivable)}
          </Text>
        </View>
        <View style={[styles.summaryCard, styles.summaryCardAlt]}>
          <Text style={styles.summaryLabel}>Lunas Bulan Ini</Text>
          <Text style={[styles.summaryAmount, styles.summaryAmountAlt]} numberOfLines={1} adjustsFontSizeToFit>
            {formatRp(totalPaidThisMonth)}
          </Text>
        </View>
      </View>

      <View style={styles.filterWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.filterRow}
        >
          {FILTERS.map((f) => {
            const active = filter === f.key;
            return (
              <TouchableOpacity
                key={f.key}
                testID={`filter-${f.key}`}
                onPress={() => setFilter(f.key)}
                activeOpacity={0.8}
                style={[styles.chip, active && styles.chipActive]}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : filtered.length === 0 ? (
        <EmptyState onCreate={() => router.push("/invoice/new")} />
      ) : (
        <FlatList
          testID="invoice-list"
          data={filtered}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 100, paddingTop: 8 }}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={colors.primary}
            />
          }
          renderItem={({ item }) => (
            <InvoiceRow item={item} onPress={() => router.push(`/invoice/${item.id}`)} />
          )}
        />
      )}
    </SafeAreaView>
  );
}

function InvoiceRow({ item, onPress }: { item: any; onPress: () => void }) {
  const s = colors.status[item.status] || colors.status.draft;
  const clientName = item.client_snapshot?.name || "Tanpa klien";
  return (
    <TouchableOpacity
      testID={`invoice-row-${item.id}`}
      style={styles.row}
      onPress={onPress}
      activeOpacity={0.85}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.rowNumber}>{item.number}</Text>
        <Text style={styles.rowClient} numberOfLines={1}>{clientName}</Text>
        <Text style={styles.rowDate}>Jatuh tempo {formatDateID(item.due_date)}</Text>
      </View>
      <View style={{ alignItems: "flex-end", gap: 6 }}>
        <Text style={styles.rowAmount}>{formatRp(item.total)}</Text>
        <View style={[styles.badge, { backgroundColor: s.bg }]}>
          <Text style={[styles.badgeText, { color: s.text }]}>{statusLabel(item.status)}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <View style={styles.empty} testID="empty-state">
      <View style={styles.emptyIcon}>
        <Feather name="file-text" size={36} color={colors.primary} />
      </View>
      <Text style={styles.emptyTitle}>Belum ada invoice</Text>
      <Text style={styles.emptySub}>
        Buat invoice pertama Anda dan kirim langsung ke klien via WhatsApp.
      </Text>
      <TouchableOpacity
        testID="invoice-create-btn"
        style={styles.primaryBtn}
        onPress={onCreate}
        activeOpacity={0.85}
      >
        <Feather name="plus" size={18} color="#FFFFFF" />
        <Text style={styles.primaryBtnText}>Buat Invoice</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 24, paddingTop: 8, paddingBottom: 16, gap: 12 },
  overline: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5, color: colors.textMute, marginBottom: 6 },
  title: { fontSize: 28, fontWeight: "800", color: colors.text, letterSpacing: -0.6 },
  iconBtn: {
    width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primary,
    alignItems: "center", justifyContent: "center",
  },
  summaryRow: { flexDirection: "row", gap: 12, paddingHorizontal: 24 },
  summaryCard: {
    flex: 1, backgroundColor: colors.primary, padding: 16, borderRadius: 18, gap: 8, minHeight: 96,
  },
  summaryCardAlt: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  summaryLabel: { fontSize: 12, color: "rgba(255,255,255,0.75)", fontWeight: "600" },
  summaryAmount: { fontSize: 22, color: "#FFFFFF", fontWeight: "700", letterSpacing: -0.5 },
  summaryAmountAlt: { color: colors.text },
  filterWrap: { paddingTop: 18, paddingBottom: 4 },
  filterRow: { paddingHorizontal: 24, gap: 8, flexDirection: "row" },
  chip: {
    flexShrink: 0,
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  chipActive: { backgroundColor: colors.text, borderColor: colors.text },
  chipText: { color: colors.textMid, fontWeight: "600", fontSize: 13 },
  chipTextActive: { color: "#FFFFFF" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  row: {
    backgroundColor: colors.surface,
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 18, padding: 16,
    flexDirection: "row", gap: 12,
  },
  rowNumber: { fontSize: 14, fontWeight: "700", color: colors.text },
  rowClient: { fontSize: 14, color: colors.textMid },
  rowDate: { fontSize: 12, color: colors.textMute },
  rowAmount: { fontSize: 17, fontWeight: "700", color: colors.text, letterSpacing: -0.3 },
  badge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  badgeText: { fontSize: 10, fontWeight: "800", letterSpacing: 0.5, textTransform: "uppercase" },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 12 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.status.paid.bg, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: colors.text },
  emptySub: { fontSize: 14, color: colors.textMute, textAlign: "center", lineHeight: 20 },
  primaryBtn: {
    marginTop: 16, height: 50, paddingHorizontal: 24, borderRadius: 14, backgroundColor: colors.primary,
    flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8,
  },
  primaryBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
});
