import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
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
import { DateField } from "@/src/components/DateField";
import { Dropdown } from "@/src/components/Dropdown";
import { todayISO } from "@/src/utils/format";

type PickupDetails = {
  pic_name: string;
  pic_phone: string;
  address: string;
  standby_time: string;
  seat_capacity: string;
};

type ReservationForm = {
  client_id: string;
  bus_id: string;
  driver_id: string;
  departure_date: string;
  return_date: string;
  pickup: PickupDetails;
  destination: string;
  notes: string;
  status: string;
  total_price: string;
  downpayment: string;
};

const STATUS_OPTIONS = [
  { key: "booked", label: "Booking" },
  { key: "downpayment", label: "DP" },
  { key: "paid", label: "Lunas" },
  { key: "cancel", label: "Batal" },
];

export default function ReservationEditor() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string; date?: string }>();
  const isEdit = Boolean(params.id);

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [clients, setClients] = useState<any[]>([]);
  const [buses, setBuses] = useState<any[]>([]);
  const [drivers, setDrivers] = useState<any[]>([]);

  // Quick add modals
  const [addClientModal, setAddClientModal] = useState(false);
  const [newClientName, setNewClientName] = useState("");
  const [newClientPhone, setNewClientPhone] = useState("");
  const [savingClient, setSavingClient] = useState(false);

  const initialDate = params.date || todayISO();

  const [form, setForm] = useState<ReservationForm>({
    client_id: "",
    bus_id: "",
    driver_id: "",
    departure_date: initialDate,
    return_date: "",
    pickup: {
      pic_name: "",
      pic_phone: "",
      address: "",
      standby_time: "",
      seat_capacity: "",
    },
    destination: "",
    notes: "",
    status: "booked",
    total_price: "",
    downpayment: "",
  });

  // Load dropdown data
  const loadData = useCallback(async () => {
    try {
      const [c, b, d] = await Promise.all([
        api.listClients(),
        api.listBuses(),
        api.listDrivers(),
      ]);
      setClients(c);
      setBuses(b);
      setDrivers(d);
    } catch (e) {
      console.warn(e);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Load existing reservation
  useEffect(() => {
    if (params.id) {
      api
        .getReservation(params.id)
        .then((r) => {
          setForm({
            client_id: r.client_id || "",
            bus_id: r.bus_id || "",
            driver_id: r.driver_id || "",
            departure_date: r.departure_date || todayISO(),
            return_date: r.return_date || "",
            pickup: {
              pic_name: r.pickup?.pic_name || "",
              pic_phone: r.pickup?.pic_phone || "",
              address: r.pickup?.address || "",
              standby_time: r.pickup?.standby_time || "",
              seat_capacity: String(r.pickup?.seat_capacity || ""),
            },
            destination: r.destination || "",
            notes: r.notes || "",
            status: r.status || "booked",
            total_price: String(r.total_price || ""),
            downpayment: String(r.downpayment || ""),
          });
        })
        .catch(console.warn)
        .finally(() => setLoading(false));
    }
  }, [params.id]);

  const updateField = <K extends keyof ReservationForm>(
    key: K,
    value: ReservationForm[K]
  ) => setForm((prev) => ({ ...prev, [key]: value }));

  const updatePickup = (key: keyof PickupDetails, value: string) =>
    setForm((prev) => ({
      ...prev,
      pickup: { ...prev.pickup, [key]: value },
    }));

  // Quick add client
  const handleAddClient = async () => {
    if (!newClientName.trim()) {
      Alert.alert("Error", "Nama klien wajib diisi");
      return;
    }
    setSavingClient(true);
    try {
      const newClient = await api.createClient({
        name: newClientName.trim(),
        phone: newClientPhone.trim(),
        email: "",
        address: "",
      });
      setClients((prev) => [...prev, newClient]);
      updateField("client_id", newClient.id);
      setAddClientModal(false);
      setNewClientName("");
      setNewClientPhone("");
    } catch (e: any) {
      Alert.alert("Error", e.message || "Gagal menambah klien");
    } finally {
      setSavingClient(false);
    }
  };

  const handleSave = async () => {
    if (!form.departure_date) {
      Alert.alert("Error", "Tanggal keberangkatan wajib diisi");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        client_id: form.client_id || null,
        bus_id: form.bus_id || null,
        driver_id: form.driver_id || null,
        departure_date: form.departure_date,
        return_date: form.return_date || "",
        pickup: {
          pic_name: form.pickup.pic_name,
          pic_phone: form.pickup.pic_phone,
          address: form.pickup.address,
          standby_time: form.pickup.standby_time,
          seat_capacity: parseInt(form.pickup.seat_capacity) || 0,
        },
        destination: form.destination,
        notes: form.notes,
        status: form.status,
        total_price: parseFloat(form.total_price) || 0,
        downpayment: parseFloat(form.downpayment) || 0,
      };

      if (isEdit && params.id) {
        await api.updateReservation(params.id, payload);
      } else {
        await api.createReservation(payload);
      }
      router.back();
    } catch (e: any) {
      Alert.alert("Error", e.message || "Gagal menyimpan reservasi");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // Prepare dropdown items
  const clientItems = clients.map((c) => ({
    id: c.id,
    label: c.name,
    sublabel: c.phone || c.email || undefined,
  }));

  const busItems = buses.map((b) => ({
    id: b.id,
    label: b.name,
    sublabel: `${b.capacity} kursi${b.plate_number ? ` • ${b.plate_number}` : ""}`,
  }));

  const driverItems = drivers.map((d) => ({
    id: d.id,
    label: d.name,
    sublabel: d.phone || undefined,
  }));

  return (
    <SafeAreaView style={styles.root} edges={["top"]}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={styles.backBtn}
            activeOpacity={0.7}
          >
            <Feather name="arrow-left" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>
            {isEdit ? "Edit Reservasi" : "Reservasi Baru"}
          </Text>
          <TouchableOpacity
            testID="save-btn"
            onPress={handleSave}
            style={styles.saveBtn}
            activeOpacity={0.8}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={styles.saveBtnText}>Simpan</Text>
            )}
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Client Dropdown */}
          <View style={styles.section}>
            <Dropdown
              testID="client-dropdown"
              label="Klien"
              placeholder="Pilih Klien"
              items={clientItems}
              value={form.client_id}
              onChange={(v) => updateField("client_id", v)}
              onAdd={() => setAddClientModal(true)}
              addLabel="Tambah Klien Baru"
              emptyLabel="Tanpa Klien"
            />
          </View>

          {/* Bus Dropdown */}
          <View style={styles.section}>
            <Dropdown
              testID="bus-dropdown"
              label="Armada / Bus"
              placeholder="Pilih Bus"
              items={busItems}
              value={form.bus_id}
              onChange={(v) => updateField("bus_id", v)}
              onAdd={() => router.push("/(tabs)/fleet")}
              addLabel="Tambah Armada"
              emptyLabel="Belum Pilih Bus"
            />
          </View>

          {/* Driver Dropdown */}
          <View style={styles.section}>
            <Dropdown
              testID="driver-dropdown"
              label="Driver"
              placeholder="Pilih Driver"
              items={driverItems}
              value={form.driver_id}
              onChange={(v) => updateField("driver_id", v)}
              onAdd={() => router.push("/(tabs)/drivers")}
              addLabel="Tambah Driver"
              emptyLabel="Belum Pilih Driver"
            />
          </View>

          {/* Dates */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tanggal</Text>
            <View style={styles.dateRow}>
              <DateField
                label="Keberangkatan"
                value={form.departure_date}
                onChange={(v) => updateField("departure_date", v)}
                testID="departure-date"
              />
              <DateField
                label="Kembali (Opsional)"
                value={form.return_date}
                onChange={(v) => updateField("return_date", v)}
                testID="return-date"
              />
            </View>
          </View>

          {/* Destination */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Tujuan</Text>
            <TextInput
              testID="destination-input"
              style={styles.input}
              placeholder="Contoh: Bali, Bandung, dll"
              placeholderTextColor={colors.textMute}
              value={form.destination}
              onChangeText={(v) => updateField("destination", v)}
            />
          </View>

          {/* Pickup Details */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Detail Penjemputan</Text>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Nama PIC</Text>
              <TextInput
                testID="pic-name-input"
                style={styles.input}
                placeholder="Nama penanggung jawab"
                placeholderTextColor={colors.textMute}
                value={form.pickup.pic_name}
                onChangeText={(v) => updatePickup("pic_name", v)}
              />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Telepon PIC</Text>
              <TextInput
                testID="pic-phone-input"
                style={styles.input}
                placeholder="08xxxxxxxxxx"
                placeholderTextColor={colors.textMute}
                keyboardType="phone-pad"
                value={form.pickup.pic_phone}
                onChangeText={(v) => updatePickup("pic_phone", v)}
              />
            </View>
            <View style={styles.fieldGroup}>
              <Text style={styles.fieldLabel}>Alamat Penjemputan</Text>
              <TextInput
                testID="address-input"
                style={[styles.input, styles.inputMultiline]}
                placeholder="Alamat lengkap"
                placeholderTextColor={colors.textMute}
                multiline
                numberOfLines={3}
                value={form.pickup.address}
                onChangeText={(v) => updatePickup("address", v)}
              />
            </View>
            <View style={styles.rowFields}>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={styles.fieldLabel}>Waktu Standby</Text>
                <TextInput
                  testID="standby-time-input"
                  style={styles.input}
                  placeholder="05:00"
                  placeholderTextColor={colors.textMute}
                  value={form.pickup.standby_time}
                  onChangeText={(v) => updatePickup("standby_time", v)}
                />
              </View>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={styles.fieldLabel}>Jumlah Kursi</Text>
                <TextInput
                  testID="seat-capacity-input"
                  style={styles.input}
                  placeholder="45"
                  placeholderTextColor={colors.textMute}
                  keyboardType="number-pad"
                  value={form.pickup.seat_capacity}
                  onChangeText={(v) => updatePickup("seat_capacity", v)}
                />
              </View>
            </View>
          </View>

          {/* Status */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Status</Text>
            <View style={styles.statusRow}>
              {STATUS_OPTIONS.map((s) => (
                <TouchableOpacity
                  key={s.key}
                  style={[
                    styles.statusChip,
                    form.status === s.key && styles.statusChipActive,
                  ]}
                  onPress={() => updateField("status", s.key)}
                >
                  <Text
                    style={[
                      styles.statusChipText,
                      form.status === s.key && styles.statusChipTextActive,
                    ]}
                  >
                    {s.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Pricing */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Harga</Text>
            <View style={styles.rowFields}>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={styles.fieldLabel}>Total Harga (Rp)</Text>
                <TextInput
                  testID="total-price-input"
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor={colors.textMute}
                  keyboardType="number-pad"
                  value={form.total_price}
                  onChangeText={(v) => updateField("total_price", v)}
                />
              </View>
              <View style={[styles.fieldGroup, { flex: 1 }]}>
                <Text style={styles.fieldLabel}>DP (Rp)</Text>
                <TextInput
                  testID="downpayment-input"
                  style={styles.input}
                  placeholder="0"
                  placeholderTextColor={colors.textMute}
                  keyboardType="number-pad"
                  value={form.downpayment}
                  onChangeText={(v) => updateField("downpayment", v)}
                />
              </View>
            </View>
          </View>

          {/* Notes */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Catatan</Text>
            <TextInput
              testID="notes-input"
              style={[styles.input, styles.inputMultiline]}
              placeholder="Catatan tambahan..."
              placeholderTextColor={colors.textMute}
              multiline
              numberOfLines={3}
              value={form.notes}
              onChangeText={(v) => updateField("notes", v)}
            />
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Quick Add Client Modal */}
      <Modal
        visible={addClientModal}
        transparent
        animationType="slide"
        onRequestClose={() => setAddClientModal(false)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setAddClientModal(false)}
        />
        <View style={styles.modalSheet}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Tambah Klien Baru</Text>

          <View style={styles.modalField}>
            <Text style={styles.modalFieldLabel}>Nama Klien *</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Nama lengkap"
              placeholderTextColor={colors.textMute}
              value={newClientName}
              onChangeText={setNewClientName}
            />
          </View>

          <View style={styles.modalField}>
            <Text style={styles.modalFieldLabel}>Nomor Telepon</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="08xxxxxxxxxx"
              placeholderTextColor={colors.textMute}
              keyboardType="phone-pad"
              value={newClientPhone}
              onChangeText={setNewClientPhone}
            />
          </View>

          <TouchableOpacity
            style={styles.modalSaveBtn}
            onPress={handleAddClient}
            disabled={savingClient}
            activeOpacity={0.85}
          >
            {savingClient ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.modalSaveBtnText}>Simpan Klien</Text>
            )}
          </TouchableOpacity>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    gap: 12,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
  },
  saveBtn: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
  },
  saveBtnText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 14,
  },
  scroll: { flex: 1 },
  scrollContent: { padding: 20 },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 12,
  },
  dateRow: {
    flexDirection: "row",
    gap: 12,
  },
  fieldGroup: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMid,
    marginBottom: 6,
  },
  rowFields: {
    flexDirection: "row",
    gap: 12,
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  },
  inputMultiline: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  statusRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  statusChip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusChipActive: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  statusChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: colors.textMid,
  },
  statusChipTextActive: {
    color: "#fff",
  },
  // Modal styles
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  modalSheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 24,
    paddingBottom: 40,
  },
  modalHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 20,
  },
  modalField: {
    marginBottom: 16,
  },
  modalFieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: colors.textMid,
    marginBottom: 8,
  },
  modalInput: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.text,
  },
  modalSaveBtn: {
    backgroundColor: colors.primary,
    height: 50,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 8,
  },
  modalSaveBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
});
