import { ImageBackground, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { useState } from "react";
import { useAuth } from "@/src/contexts/AuthContext";
import { colors } from "@/src/theme";

const HERO =
  "https://images.unsplash.com/photo-1664575196851-5318f32c3f43?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjY2NzN8MHwxfHNlYXJjaHwxfHxpbmRvbmVzaWFuJTIwZnJlZWxhbmNlciUyMHdvcmtpbmd8ZW58MHx8fHwxNzgxMjM2NzA2fDA&ixlib=rb-4.1.0&q=85";

export default function Login() {
  const { loginWithGoogle } = useAuth();
  const [busy, setBusy] = useState(false);

  const onLogin = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await loginWithGoogle();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root} testID="login-screen">
      <ImageBackground source={{ uri: HERO }} style={styles.bg} resizeMode="cover">
        <LinearGradient
          colors={["rgba(20,32,28,0.25)", "rgba(20,32,28,0.85)", "#14201C"]}
          style={StyleSheet.absoluteFill}
        />
        <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
          <View style={styles.top}>
            <Text style={styles.brand}>Faktur</Text>
            <Text style={styles.brandAccent}>Indo</Text>
          </View>

          <View style={styles.bottom}>
            <Text style={styles.headline}>Invoice profesional untuk UMKM Indonesia.</Text>
            <Text style={styles.sub}>
              Simpan profil bisnis, kelola klien, kirim invoice ber-PPN, dan bagikan ke WhatsApp dalam hitungan detik.
            </Text>

            <TouchableOpacity
              testID="login-google-btn"
              style={styles.btn}
              activeOpacity={0.85}
              onPress={onLogin}
              disabled={busy}
            >
              {busy ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <>
                  <View style={styles.gIcon}>
                    <Text style={styles.gText}>G</Text>
                  </View>
                  <Text style={styles.btnLabel}>Lanjut dengan Google</Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={styles.terms}>
              Dengan masuk, Anda menyetujui ketentuan layanan & kebijakan privasi.
            </Text>
          </View>
        </SafeAreaView>
      </ImageBackground>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#14201C" },
  bg: { flex: 1 },
  safe: { flex: 1, justifyContent: "space-between", paddingHorizontal: 24 },
  top: { flexDirection: "row", alignItems: "baseline", paddingTop: 16 },
  brand: { color: "#FFFFFF", fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  brandAccent: { color: "#86EFAC", fontSize: 28, fontWeight: "800", letterSpacing: -0.5 },
  bottom: { paddingBottom: 12, gap: 16 },
  headline: { color: "#FFFFFF", fontSize: 32, lineHeight: 38, fontWeight: "700", letterSpacing: -0.5 },
  sub: { color: "rgba(255,255,255,0.75)", fontSize: 15, lineHeight: 22 },
  btn: {
    marginTop: 12,
    height: 56,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  gIcon: {
    width: 22,
    height: 22,
    borderRadius: 4,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E7E5E4",
    alignItems: "center",
    justifyContent: "center",
  },
  gText: { color: "#4285F4", fontWeight: "800", fontSize: 14 },
  btnLabel: { color: "#1C1917", fontSize: 16, fontWeight: "600" },
  terms: { color: "rgba(255,255,255,0.55)", fontSize: 12, textAlign: "center", marginTop: 4 },
});
