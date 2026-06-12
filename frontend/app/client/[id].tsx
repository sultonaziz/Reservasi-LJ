import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { api } from "@/src/api/client";
import { colors } from "@/src/theme";

export default function ClientForm() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const isNew = !id || id === "new";

  const [form, setForm] = useState<any>({ name: "", address: "", phone: "", email: "" });
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (isNew) return;
    try {
      const all = await api.listClients();
      const c = all.find((x: any) => x.id === id);
      if (c) setForm(c);
    } finally {
      setLoading(false);
    }
  }, [id, isNew]);

  useEffect(() => { load(); }, [load]);

  const set = (k: string, v: string) => setForm((f: any) => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (isNew) {
        await api.createClient(form);
      } else {
        await api.updateClient(id, form);
      }
      router.back();
    } catch (e) {
      console.warn(e);
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (isNew) return;
    setSaving(true);
    try {
      await api.deleteClient(id);
      router.back();
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
    <SafeAreaView edges={["top"]} style={styles.root} testID="client-form">
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
        <View style={styles.headerBar}>
          <TouchableOpacity testID="back-btn" onPress={() => router.back()} style={styles.backBtn}>
            <Feather name="arrow-left" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{isNew ? "Klien Baru" : "Edit Klien"}</Text>
          <View style={{ width: 36 }} />
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
          <FieldRow label="Nama" testID="client-name" value={form.name} onChange={(v) => set("name", v)} placeholder="Nama klien / perusahaan" />
          <FieldRow label="Alamat" testID="client-address" value={form.address} onChange={(v) => set("address", v)} placeholder="Alamat" multiline />
          <FieldRow label="Telepon (WhatsApp)" testID="client-phone" value={form.phone} onChange={(v) => set("phone", v)} placeholder="08xxxxxxxxxx" keyboardType="phone-pad" />
          <FieldRow label="Email" testID="client-email" value={form.email} onChange={(v) => set("email", v)} placeholder="klien@email.com" keyboardType="email-address" />

          {!isNew && (
            <View style={{ paddingHorizontal: 24, marginTop: 24 }}>
              <TouchableOpacity testID="client-delete-btn" onPress={del} style={styles.delBtn} activeOpacity={0.7}>
                <Feather name="trash-2" size={16} color={colors.accent} />
                <Text style={styles.delText}>Hapus Klien</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>

        <View style={styles.stickyFooter}>
          <TouchableOpacity
            testID="client-save-btn"
            style={[styles.saveBtn, !form.name.trim() && { opacity: 0.5 }]}
            onPress={save}
            disabled={saving || !form.name.trim()}
            activeOpacity={0.85}
          >
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveText}>Simpan</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function FieldRow(props: any) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{props.label}</Text>
      <TextInput
        testID={props.testID}
        value={props.value || ""}
        onChangeText={props.onChange}
        placeholder={props.placeholder}
        placeholderTextColor={colors.textMute}
        keyboardType={props.keyboardType}
        multiline={props.multiline}
        style={[styles.input, props.multiline && { minHeight: 80, textAlignVertical: "top" }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  headerBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 8 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  headerTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700", color: colors.text },
  fieldWrap: { paddingHorizontal: 24, marginTop: 14 },
  fieldLabel: { fontSize: 12, fontWeight: "700", color: colors.textMid, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 },
  input: { backgroundColor: colors.borderLight, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text },
  delBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12 },
  delText: { color: colors.accent, fontWeight: "600", fontSize: 14 },
  stickyFooter: { position: "absolute", left: 0, right: 0, bottom: 0, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 20, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.bg },
  saveBtn: { height: 54, borderRadius: 14, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  saveText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
});
