import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
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

export default function ClientsScreen() {
  const router = useRouter();
  const [clients, setClients] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = await api.listClients();
      setClients(data);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <SafeAreaView edges={["top"]} style={styles.root} testID="clients-screen">
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={styles.overline}>DATA</Text>
          <Text style={styles.title}>Klien</Text>
        </View>
        <TouchableOpacity
          testID="client-create-btn"
          style={styles.iconBtn}
          onPress={() => router.push("/client/new")}
          activeOpacity={0.85}
        >
          <Feather name="plus" size={22} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      ) : clients.length === 0 ? (
        <View style={styles.empty} testID="clients-empty">
          <View style={styles.emptyIcon}>
            <Feather name="users" size={32} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>Belum ada klien</Text>
          <Text style={styles.emptySub}>Tambahkan klien untuk mempercepat pembuatan invoice.</Text>
          <TouchableOpacity
            testID="client-create-empty-btn"
            style={styles.primaryBtn}
            onPress={() => router.push("/client/new")}
            activeOpacity={0.85}
          >
            <Feather name="user-plus" size={18} color="#FFFFFF" />
            <Text style={styles.primaryBtnText}>Tambah Klien</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          testID="client-list"
          data={clients}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 100 }}
          ItemSeparatorComponent={() => <View style={styles.divider} />}
          renderItem={({ item }) => (
            <TouchableOpacity
              testID={`client-row-${item.id}`}
              style={styles.row}
              onPress={() => router.push(`/client/${item.id}`)}
              activeOpacity={0.7}
            >
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{(item.name || "?").charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={styles.rowName}>{item.name}</Text>
                {item.phone ? <Text style={styles.rowMeta}>{item.phone}</Text> : null}
                {item.email ? <Text style={styles.rowMeta}>{item.email}</Text> : null}
              </View>
              <Feather name="chevron-right" size={18} color={colors.textMute} />
            </TouchableOpacity>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 24, paddingTop: 8, paddingBottom: 20, gap: 12 },
  overline: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5, color: colors.textMute, marginBottom: 6 },
  title: { fontSize: 28, fontWeight: "800", color: colors.text, letterSpacing: -0.6 },
  iconBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  divider: { height: 1, backgroundColor: colors.borderLight, marginVertical: 4 },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 14, gap: 14 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.borderLight, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 18, fontWeight: "700", color: colors.primary },
  rowName: { fontSize: 16, fontWeight: "600", color: colors.text },
  rowMeta: { fontSize: 13, color: colors.textMute },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 12 },
  emptyIcon: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.status.paid.bg, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  emptyTitle: { fontSize: 20, fontWeight: "700", color: colors.text },
  emptySub: { fontSize: 14, color: colors.textMute, textAlign: "center", lineHeight: 20 },
  primaryBtn: { marginTop: 16, height: 50, paddingHorizontal: 24, borderRadius: 14, backgroundColor: colors.primary, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  primaryBtnText: { color: "#FFFFFF", fontWeight: "700", fontSize: 15 },
});
