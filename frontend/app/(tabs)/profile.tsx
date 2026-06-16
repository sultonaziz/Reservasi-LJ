import { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  KeyboardAvoidingView,
  Platform,
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
import * as ImagePicker from "expo-image-picker";
import { api } from "@/src/api/client";
import { useAuth } from "@/src/contexts/AuthContext";
import { colors } from "@/src/theme";
import { generateQRCodeBase64, buildSignatureQRData } from "@/src/utils/qrcode";

export default function ProfileScreen() {
  const { user, logout } = useAuth();
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [activeSection, setActiveSection] = useState<"business" | "notification">("business");
  const [generatingQR, setGeneratingQR] = useState(false);

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

  const pickImage = async (key: "logo_base64" | "signature_base64" | "signature_qr_base64") => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true,
      quality: 0.6,
      allowsEditing: true,
      aspect: key === "logo_base64" ? [1, 1] : key === "signature_qr_base64" ? [1, 1] : [3, 1],
    });
    if (!res.canceled && res.assets[0]?.base64) {
      const mime = res.assets[0].mimeType || "image/jpeg";
      set(key, `data:${mime};base64,${res.assets[0].base64}`);
    }
  };

  const generateQRCode = async () => {
    if (!profile?.name) {
      Alert.alert("Error", "Silakan isi nama bisnis terlebih dahulu");
      return;
    }
    setGeneratingQR(true);
    try {
      const qrData = buildSignatureQRData(profile);
      const base64 = await generateQRCodeBase64(qrData, 200);
      set("signature_qr_base64", base64);
      Alert.alert("Sukses", "QR Code tanda tangan digital berhasil dibuat");
    } catch (e) {
      Alert.alert("Error", "Gagal membuat QR Code. Silakan coba lagi.");
    } finally {
      setGeneratingQR(false);
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
        signature_qr_base64: profile.signature_qr_base64 || "",
        bank_info: profile.bank_info || "",
        admin_whatsapp: profile.admin_whatsapp || "",
        admin_email: profile.admin_email || "",
        reminder_enabled: profile.reminder_enabled ?? true,
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
            <Text style={styles.overline}>LUAR JENDELA CREATRIP</Text>
            <Text style={styles.title}>Profil Bisnis</Text>
            <Text style={styles.sub}>{user?.email}</Text>
          </View>

          {/* Tab Switcher */}
          <View style={styles.tabRow}>
            <TouchableOpacity
              style={[styles.tabBtn, activeSection === "business" && styles.tabBtnActive]}
              onPress={() => setActiveSection("business")}
              activeOpacity={0.7}
            >
              <Feather name="briefcase" size={16} color={activeSection === "business" ? colors.primary : colors.textMute} />
              <Text style={[styles.tabText, activeSection === "business" && styles.tabTextActive]}>Bisnis</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.tabBtn, activeSection === "notification" && styles.tabBtnActive]}
              onPress={() => setActiveSection("notification")}
              activeOpacity={0.7}
            >
              <Feather name="bell" size={16} color={activeSection === "notification" ? colors.primary : colors.textMute} />
              <Text style={[styles.tabText, activeSection === "notification" && styles.tabTextActive]}>Notifikasi</Text>
            </TouchableOpacity>
          </View>

          {activeSection === "business" ? (
            <>
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

              <Field testID="profile-name" label="Nama Bisnis" value={profile.name} onChange={(v: string) => set("name", v)} placeholder="PT / CV / Nama Anda" />
              <Field testID="profile-address" label="Alamat" value={profile.address} onChange={(v: string) => set("address", v)} placeholder="Alamat lengkap" multiline />
              <Field testID="profile-npwp" label="NPWP" value={profile.npwp} onChange={(v: string) => set("npwp", v)} placeholder="00.000.000.0-000.000" />
              <Field testID="profile-phone" label="Telepon" value={profile.phone} onChange={(v: string) => set("phone", v)} placeholder="08xxxxxxxxxx" keyboardType="phone-pad" />
              <Field testID="profile-email" label="Email" value={profile.email} onChange={(v: string) => set("email", v)} placeholder="bisnis@email.com" keyboardType="email-address" />
              <Field testID="profile-bank" label="Info Rekening" value={profile.bank_info} onChange={(v: string) => set("bank_info", v)} placeholder="BCA 1234567890 a/n Nama" multiline />

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

              <View style={styles.section}>
                <Text style={styles.sectionLabel}>QR Code Tanda Tangan Digital</Text>
                <Text style={styles.sectionHint}>QR code ini akan muncul di invoice PDF sebagai verifikasi digital</Text>
                <View style={styles.qrRow}>
                  <TouchableOpacity
                    testID="profile-qr-picker"
                    style={styles.qrBox}
                    onPress={() => pickImage("signature_qr_base64")}
                    activeOpacity={0.8}
                  >
                    {profile.signature_qr_base64 ? (
                      <Image source={{ uri: profile.signature_qr_base64 }} style={styles.qrImg} resizeMode="contain" />
                    ) : (
                      <View style={styles.logoPlaceholder}>
                        <Feather name="grid" size={32} color={colors.textMute} />
                        <Text style={styles.logoHint}>Upload QR</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  <View style={styles.qrActions}>
                    <TouchableOpacity
                      testID="generate-qr-btn"
                      style={styles.generateQRBtn}
                      onPress={generateQRCode}
                      activeOpacity={0.8}
                      disabled={generatingQR}
                    >
                      {generatingQR ? (
                        <ActivityIndicator size="small" color={colors.primary} />
                      ) : (
                        <>
                          <Feather name="zap" size={18} color={colors.primary} />
                          <Text style={styles.generateQRText}>Generate Otomatis</Text>
                        </>
                      )}
                    </TouchableOpacity>
                    <Text style={styles.qrActionHint}>
                      Buat QR code berdasarkan data bisnis Anda
                    </Text>
                  </View>
                </View>
              </View>
            </>
          ) : (
            <>
              <View style={styles.notifSection}>
                <View style={styles.notifHeader}>
                  <Feather name="bell" size={24} color={colors.primary} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.notifTitle}>Reminder H-2</Text>
                    <Text style={styles.notifDesc}>
                      Dapatkan reminder otomatis 2 hari sebelum keberangkatan untuk reservasi yang belum lunas.
                    </Text>
                  </View>
                </View>

                <View style={styles.switchRow}>
                  <Text style={styles.switchLabel}>Aktifkan Reminder</Text>
                  <Switch
                    value={profile.reminder_enabled ?? true}
                    onValueChange={(v) => set("reminder_enabled", v)}
                    trackColor={{ false: colors.border, true: colors.primary }}
                    thumbColor="#FFFFFF"
                  />
                </View>
              </View>

              <Field
                testID="profile-admin-wa"
                label="WhatsApp Admin"
                value={profile.admin_whatsapp}
                onChange={(v: string) => set("admin_whatsapp", v)}
                placeholder="628xxxxxxxxxx (format internasional)"
                keyboardType="phone-pad"
                icon="message-circle"
              />
              <Text style={styles.fieldHint}>
                Nomor WhatsApp untuk menerima reminder reservasi
              </Text>

              <Field
                testID="profile-admin-email"
                label="Email Admin"
                value={profile.admin_email}
                onChange={(v: string) => set("admin_email", v)}
                placeholder="admin@email.com"
                keyboardType="email-address"
                icon="mail"
              />
              <Text style={styles.fieldHint}>
                Email untuk menerima notifikasi & reminder
              </Text>

              <View style={styles.reminderInfo}>
                <Feather name="info" size={18} color={colors.primary} />
                <Text style={styles.reminderInfoText}>
                  Reminder akan dikirim otomatis ke WhatsApp dan Email admin 2 hari sebelum tanggal keberangkatan untuk reservasi dengan status Booking atau DP.
                </Text>
              </View>
            </>
          )}

          <View style={{ paddingHorizontal: 24, marginTop: 24 }}>
            <TouchableOpacity
              testID="logout-btn"
              style={styles.logoutBtn}
              onPress={logout}
              activeOpacity={0.7}
            >
              <Feather name="log-out" size={16} color={colors.status.overdue.text} />
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
      <View style={[styles.inputRow, props.icon && styles.inputWithIcon]}>
        {props.icon && (
          <Feather name={props.icon} size={18} color={colors.textMute} style={{ marginRight: 10 }} />
        )}
        <TextInput
          testID={props.testID}
          value={props.value || ""}
          onChangeText={props.onChange}
          placeholder={props.placeholder}
          placeholderTextColor={colors.textMute}
          keyboardType={props.keyboardType}
          multiline={props.multiline}
          style={[styles.input, props.multiline && { minHeight: 80, textAlignVertical: "top" }, props.icon && { flex: 1 }]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { paddingHorizontal: 24, paddingTop: 8, paddingBottom: 12 },
  overline: { fontSize: 11, fontWeight: "800", letterSpacing: 1.5, color: colors.primary, marginBottom: 6 },
  title: { fontSize: 28, fontWeight: "800", color: colors.text, letterSpacing: -0.6 },
  sub: { fontSize: 13, color: colors.textMute, marginTop: 4 },
  tabRow: { flexDirection: "row", paddingHorizontal: 24, gap: 12, marginBottom: 16 },
  tabBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabBtnActive: {
    backgroundColor: colors.status.booked.bg,
    borderColor: colors.primary,
  },
  tabText: { fontSize: 14, fontWeight: "600", color: colors.textMute },
  tabTextActive: { color: colors.primary },
  section: { paddingHorizontal: 24, marginTop: 8, marginBottom: 8 },
  sectionLabel: { fontSize: 12, fontWeight: "700", color: colors.textMute, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 },
  sectionHint: { fontSize: 12, color: colors.textMute, marginBottom: 12, lineHeight: 18 },
  logoBox: { width: 96, height: 96, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  logoImg: { width: "100%", height: "100%" },
  logoPlaceholder: { alignItems: "center", justifyContent: "center", padding: 8, gap: 4 },
  logoHint: { fontSize: 11, color: colors.textMute, textAlign: "center" },
  sigBox: { height: 90, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", overflow: "hidden", paddingHorizontal: 12 },
  sigImg: { width: "100%", height: "100%" },
  qrRow: { flexDirection: "row", alignItems: "flex-start", gap: 16 },
  qrBox: { width: 100, height: 100, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  qrImg: { width: "100%", height: "100%" },
  qrActions: { flex: 1, gap: 8 },
  generateQRBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.status.booked.bg },
  generateQRText: { fontSize: 14, fontWeight: "600", color: colors.primary },
  qrActionHint: { fontSize: 11, color: colors.textMute, lineHeight: 16 },
  fieldWrap: { paddingHorizontal: 24, marginTop: 14 },
  fieldLabel: { fontSize: 12, fontWeight: "700", color: colors.textMid, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 },
  fieldHint: { fontSize: 11, color: colors.textMute, paddingHorizontal: 24, marginTop: 4 },
  inputRow: { flexDirection: "row", alignItems: "center" },
  inputWithIcon: { backgroundColor: colors.borderLight, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 4 },
  input: { backgroundColor: colors.borderLight, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text },
  notifSection: { marginHorizontal: 24, padding: 16, backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 16 },
  notifHeader: { flexDirection: "row", alignItems: "flex-start" },
  notifTitle: { fontSize: 16, fontWeight: "700", color: colors.text },
  notifDesc: { fontSize: 13, color: colors.textMid, marginTop: 4, lineHeight: 18 },
  switchRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 16, paddingTop: 16, borderTopWidth: 1, borderTopColor: colors.border },
  switchLabel: { fontSize: 14, fontWeight: "600", color: colors.text },
  reminderInfo: { flexDirection: "row", marginHorizontal: 24, marginTop: 20, padding: 14, backgroundColor: colors.status.booked.bg, borderRadius: 12, gap: 10 },
  reminderInfoText: { flex: 1, fontSize: 12, color: colors.primary, lineHeight: 18 },
  logoutBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 12 },
  logoutText: { color: colors.status.overdue.text, fontWeight: "600", fontSize: 14 },
  stickyFooter: { position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: colors.bg, paddingHorizontal: 24, paddingTop: 12, paddingBottom: 20, borderTopWidth: 1, borderTopColor: colors.border },
  savedMsg: { fontSize: 12, color: colors.primary, textAlign: "center", marginBottom: 8, fontWeight: "600" },
  saveBtn: { height: 54, borderRadius: 14, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  saveText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
});
