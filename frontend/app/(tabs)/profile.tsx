import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
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
import * as ImagePicker from "expo-image-picker";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/contexts/AuthContext";
import { colors } from "@/src/theme";

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");

  const load = useCallback(async () => {
    try {
      const data = await api.getProfile();
      setProfile(data);
    } catch (e) {
      console.warn(e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const set = (k: string, v: any) => setProfile((p: any) => ({ ...p, [k]: v }));

  const pickImage = async (key: "logo_base64" | "signature_base64") => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.6,
      allowsEditing: true,
      aspect: key === "logo_base64" ? [1, 1] : [3, 1],
    });
    if (!res.canceled && res.assets[0]?.base64) {
      const mime = res.assets[0].mimeType || "image/jpeg";
      set(key, `data:${mime};base64,${res.assets[0].base64}`);
    }
  };

  const save = async () => {
    setSaving(true);
    setSavedMsg("");
    try {
      const updated = await api.updateProfile({
        name: profile.name || "",
        address: profile.address || "",
        npwp: profile.npwp || "",
        phone: profile.phone || "",
        email: profile.email || "",
        logo_base64: profile.logo_base64 || "",
        signature_base64: profile.signature_base64 || "",
        bank_info: profile.bank_info || "",
      });
      setProfile(updated);
      setSavedMsg("Tersimpan");
      setTimeout(() => setSavedMsg(""), 2000);
    } catch {
      setSavedMsg("Gagal menyimpan");
    } finally {
      setSaving(false);
    }
  };

  if (loading || !profile) {
    return (
      <SafeAreaView edges={["top"]} style={styles.root}>
        <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={["top"]} style={styles.root} testID="profile-screen">
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={{ paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.overline}>AKUN</Text>
            <Text style={styles.title}>Profil Bisnis</Text>
            <Text style={styles.sub}>{user?.email}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Logo</Text>
            <TouchableOpacity
              testID="profile-logo-picker"
              style={styles.logoBox}
              onPress={() => pickImage("logo_base64")}
              activeOpacity={0.8}
            >
              {profile.logo_base64 ? (
                <Image source={{ uri: profile.logo_base64 }} style={styles.logoImg} />
              ) : (
                <View style={styles.logoPlaceholder}>
                  <Feather name="image" size={28} color={colors.textMute} />
                  <Text style={styles.logoHint}>Pilih logo</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          <Field testID="profile-name" label="Nama Bisnis" value={profile.name} onChange={(v) => set("name", v)} placeholder="PT / CV / Nama Anda" />
          <Field testID="profile-address" label="Alamat" value={profile.address} onChange={(v) => set("address", v)} placeholder="Alamat lengkap" multiline />
          <Field testID="profile-npwp" label="NPWP" value={profile.npwp} onChange={(v) => set("npwp", v)} placeholder="00.000.000.0-000.000" />
          <Field testID="profile-phone" label="Telepon" value={profile.phone} onChange={(v) => set("phone", v)} placeholder="08xxxxxxxxxx" keyboardType="phone-pad" />
          <Field testID="profile-email" label="Email" value={profile.email} onChange={(v) => set("email", v)} placeholder="bisnis@email.com" keyboardType="email-address" />
          <Field testID="profile-bank" label="Info Rekening" value={profile.bank_info} onChange={(v) => set("bank_info", v)} placeholder="BCA 1234567890 a/n Nama" multiline />

          <View style={styles.section}>
            <Text style={styles.sectionLabel}>Tanda Tangan</Text>
            <TouchableOpacity
              testID="profile-signature-picker"
              style={styles.sigBox}
              onPress={() => pickImage("signature_base64")}
              activeOpacity={0.8}
            >
              {profile.signature_base64 ? (
                <Image source={{ uri: profile.signature_base64 }} style={styles.sigImg} resizeMode="contain" />
              ) : (
                <View style={styles.logoPlaceholder}>
                  <Feather name="edit-3" size={24} color={colors.textMute} />
                  <Text style={styles.logoHint}>Pilih gambar tanda tangan</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>

          <View style={{ paddingHorizontal: 24, marginTop: 24 }}>
            <TouchableOpacity
              testID="logout-btn"
              style={styles.logoutBtn}
              onPress={logout}
              activeOpacity={0.7}
            >
              <Feather name="log-out" size={16} color={colors.accent} />
              <Text style={styles.logoutText}>Keluar</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

        <View style={styles.stickyFooter}>
          {savedMsg ? <Text style={styles.savedMsg}>{savedMsg}</Text> : null}
          <TouchableOpacity
            testID="profile-save-btn"
            style={styles.saveBtn}
            onPress={save}
            disabled={saving}
            activeOpacity={0.85}
          >
            {saving ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveText}>Simpan Profil</Text>}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field(props: any) {
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
  header: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 20 },
  overline: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5, color: colors.textMute, marginBottom: 6 },
  title: { fontSize: 28, fontWeight: "800", color: colors.text, letterSpacing: -0.6 },
  sub: { fontSize: 13, color: colors.textMute, marginTop: 4 },
  section: { paddingHorizontal: 24, marginTop: 8, marginBottom: 8 },
  sectionLabel: { fontSize: 12, fontWeight: "700", color: colors.textMute, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 },
  logoBox: { width: 96, height: 96, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  logoImg: { width: "100%", height: "100%" },
  logoPlaceholder: { alignItems: "center", justifyContent: "center", padding: 8, gap: 4 },
  logoHint: { fontSize: 11, color: colors.textMute, textAlign: "center" },
  sigBox: { height: 90, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", overflow: "hidden", paddingHorizontal: 12 },
  sigImg: { width: "100%", height: "100%" },
  fieldWrap: { paddingHorizontal: 24, marginTop: 14 },
  fieldLabel: { fontSize: 12, fontWeight: "700", color: colors.textMid, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 },
  input: { backgroundColor: colors.borderLight, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text },
  logoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12 },
  logoutText: { color: colors.accent, fontWeight: "600", fontSize: 14 },
  stickyFooter: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: colors.bg, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 20, borderTopWidth: 1, borderTopColor: colors.border },
  savedMsg: { fontSize: 12, color: colors.primary, textAlign: "center", marginBottom: 8, fontWeight: "600" },
  saveBtn: { height: 54, borderRadius: 14, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  saveText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
});
