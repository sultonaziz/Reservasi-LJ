import { useState } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import { colors } from "@/src/theme";
import { formatDateID } from "@/src/utils/format";

type Props = {
  label: string;
  value: string; // YYYY-MM-DD
  onChange: (iso: string) => void;
  testID?: string;
};

function isoToDate(iso: string): Date {
  if (!iso) return new Date();
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}
function dateToISO(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function DateField({ label, value, onChange, testID }: Props) {
  const [open, setOpen] = useState(false);

  // Web fallback: native <input type="date"> via createElement
  if (Platform.OS === "web") {
    return (
      <View style={styles.wrap}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.inputWeb}>
          {/* @ts-ignore */}
          <input
            data-testid={testID}
            type="date"
            value={value}
            onChange={(e: any) => onChange(e.target.value)}
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              backgroundColor: "transparent",
              fontSize: 15,
              color: colors.text,
              fontFamily: "inherit",
              padding: 0,
            }}
          />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TouchableOpacity
        testID={testID}
        style={styles.input}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
      >
        <Text style={styles.value}>{formatDateID(value)}</Text>
        <Feather name="calendar" size={18} color={colors.textMute} />
      </TouchableOpacity>
      {open && (
        <DateTimePicker
          value={isoToDate(value)}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          onChange={(_, d) => {
            setOpen(false);
            if (d) onChange(dateToISO(d));
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1 },
  label: { fontSize: 12, fontWeight: "700", color: colors.textMid, marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.8 },
  input: {
    backgroundColor: colors.borderLight,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 46,
  },
  inputWeb: {
    backgroundColor: colors.borderLight,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    minHeight: 46,
  },
  value: { fontSize: 15, color: colors.text, fontWeight: "600" },
});
