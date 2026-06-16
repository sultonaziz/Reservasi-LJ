import { ImageBackground, StyleSheet, Text, TouchableOpacity, View, ActivityIndicator, Image } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useAuth } from "@/src/contexts/AuthContext";
import { colors } from "@/src/theme";

export default function Login() {
  const { loginWithGoogle, loading } = useAuth();

  return (
    <View style={styles.root} testID="login-screen">
      <Image
        source={require("@/assets/images/bus-laks.jpg")}
        style={StyleSheet.absoluteFill}
        resizeMode="cover"
      />
      <LinearGradient
        colors={["rgba(30,64,175,0.2)", "rgba(30,64,175,0.75)", "#1E40AF"]}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView edges={["top", "bottom"]} style={styles.safe}>
        <View style={styles.top}>
          <View style={styles.logoWrap}>
            <Feather name="truck" size={28} color="#FFFFFF" />
          </View>
          <View>
            <Text style={styles.brand}>Luar Jendela</Text>
            <Text style={styles.brandAccent}>Creatrip</Text>
          </View>
        </View>

        <View style={styles.bottom}>
          <Text style={styles.headline}>Reservasi Bus Pariwisata</Text>
          <Text style={styles.sub}>
            Kelola pemesanan bus, jadwal keberangkatan, data klien, dan kirim invoice langsung via WhatsApp.
          </Text>

          <TouchableOpacity
            testID="login-google-btn"
            style={styles.btn}
            activeOpacity={0.85}
            onPress={loginWithGoogle}
            disabled={loading}
          >
            {loading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <View style={styles.gIcon}>
                  <Text style={styles.gText}>G</Text>
                </View>
                <Text style={styles.btnLabel}>Masuk dengan Google</Text>
              </>
            )}
          </TouchableOpacity>

          <Text style={styles.terms}>
            Dengan masuk, Anda menyetujui ketentuan layanan & kebijakan privasi.
          </Text>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.primary },
  safe: { flex: 1, justifyContent: "space-between", paddingHorizontal: 24 },
  top: { flexDirection: "row", alignItems: "center", paddingTop: 24, gap: 12 },
  logoWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
  },
  brand: { color: "#FFFFFF", fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  brandAccent: { color: "#93C5FD", fontSize: 22, fontWeight: "800", letterSpacing: -0.5 },
  bottom: { paddingBottom: 24, gap: 16 },
  headline: { color: "#FFFFFF", fontSize: 34, lineHeight: 40, fontWeight: "800", letterSpacing: -0.5 },
  sub: { color: "rgba(255,255,255,0.85)", fontSize: 16, lineHeight: 24 },
  btn: {
    marginTop: 16,
    height: 56,
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
  },
  gIcon: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E7E5E4",
    alignItems: "center",
    justifyContent: "center",
  },
  gText: { color: "#4285F4", fontWeight: "800", fontSize: 15 },
  btnLabel: { color: "#1C1917", fontSize: 16, fontWeight: "700" },
  terms: { color: "rgba(255,255,255,0.65)", fontSize: 12, textAlign: "center", marginTop: 4 },
});
