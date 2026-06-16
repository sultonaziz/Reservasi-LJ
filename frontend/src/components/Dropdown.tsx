import React, { useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { colors } from "@/src/theme";

type DropdownItem = {
  id: string;
  label: string;
  sublabel?: string;
};

type Props = {
  label: string;
  placeholder?: string;
  items: DropdownItem[];
  value: string;
  onChange: (value: string) => void;
  onAdd?: () => void;
  addLabel?: string;
  testID?: string;
  allowEmpty?: boolean;
  emptyLabel?: string;
};

export function Dropdown({
  label,
  placeholder = "Pilih",
  items,
  value,
  onChange,
  onAdd,
  addLabel = "Tambah Baru",
  testID,
  allowEmpty = true,
  emptyLabel = "Tidak ada",
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedItem = items.find((i) => i.id === value);
  
  const filteredItems = items.filter((i) =>
    i.label.toLowerCase().includes(search.toLowerCase())
  );

  const handleSelect = (id: string) => {
    onChange(id);
    setOpen(false);
    setSearch("");
  };

  return (
    <>
      <TouchableOpacity
        testID={testID}
        style={styles.trigger}
        onPress={() => setOpen(true)}
        activeOpacity={0.7}
      >
        <View style={styles.triggerContent}>
          <Text style={styles.triggerLabel}>{label}</Text>
          <Text
            style={[
              styles.triggerValue,
              !selectedItem && styles.triggerPlaceholder,
            ]}
            numberOfLines={1}
          >
            {selectedItem?.label || placeholder}
          </Text>
        </View>
        <Feather name="chevron-down" size={20} color={colors.textMute} />
      </TouchableOpacity>

      <Modal
        visible={open}
        transparent
        animationType="slide"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>{label}</Text>

          {/* Search */}
          <View style={styles.searchBox}>
            <Feather name="search" size={18} color={colors.textMute} />
            <TextInput
              style={styles.searchInput}
              placeholder="Cari..."
              placeholderTextColor={colors.textMute}
              value={search}
              onChangeText={setSearch}
              autoCapitalize="none"
            />
            {search.length > 0 && (
              <TouchableOpacity onPress={() => setSearch("")}>
                <Feather name="x" size={18} color={colors.textMute} />
              </TouchableOpacity>
            )}
          </View>

          <ScrollView style={styles.list} showsVerticalScrollIndicator={false}>
            {/* Empty option */}
            {allowEmpty && (
              <TouchableOpacity
                style={[styles.item, !value && styles.itemActive]}
                onPress={() => handleSelect("")}
                activeOpacity={0.7}
              >
                <View style={styles.itemContent}>
                  <Text style={[styles.itemLabel, !value && styles.itemLabelActive]}>
                    {emptyLabel}
                  </Text>
                </View>
                {!value && <Feather name="check" size={18} color={colors.primary} />}
              </TouchableOpacity>
            )}

            {/* Items */}
            {filteredItems.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={[styles.item, value === item.id && styles.itemActive]}
                onPress={() => handleSelect(item.id)}
                activeOpacity={0.7}
              >
                <View style={styles.itemContent}>
                  <Text
                    style={[
                      styles.itemLabel,
                      value === item.id && styles.itemLabelActive,
                    ]}
                    numberOfLines={1}
                  >
                    {item.label}
                  </Text>
                  {item.sublabel && (
                    <Text style={styles.itemSublabel}>{item.sublabel}</Text>
                  )}
                </View>
                {value === item.id && (
                  <Feather name="check" size={18} color={colors.primary} />
                )}
              </TouchableOpacity>
            ))}

            {filteredItems.length === 0 && search && (
              <View style={styles.empty}>
                <Text style={styles.emptyText}>Tidak ditemukan "{search}"</Text>
              </View>
            )}
          </ScrollView>

          {/* Add button */}
          {onAdd && (
            <TouchableOpacity
              style={styles.addBtn}
              onPress={() => {
                setOpen(false);
                setSearch("");
                onAdd();
              }}
              activeOpacity={0.8}
            >
              <Feather name="plus" size={18} color="#FFFFFF" />
              <Text style={styles.addBtnText}>{addLabel}</Text>
            </TouchableOpacity>
          )}
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
  },
  triggerContent: { flex: 1 },
  triggerLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: colors.textMute,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  triggerValue: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
  },
  triggerPlaceholder: {
    color: colors.textMute,
  },
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.surface,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingBottom: 32,
    paddingTop: 8,
    maxHeight: "70%",
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    alignSelf: "center",
    marginBottom: 16,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: colors.text,
    marginBottom: 16,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.bg,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: colors.text,
  },
  list: {
    maxHeight: 300,
  },
  item: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 4,
    gap: 12,
  },
  itemActive: {
    backgroundColor: colors.status.booked.bg,
  },
  itemContent: { flex: 1 },
  itemLabel: {
    fontSize: 15,
    fontWeight: "600",
    color: colors.text,
  },
  itemLabelActive: {
    color: colors.primary,
  },
  itemSublabel: {
    fontSize: 12,
    color: colors.textMute,
    marginTop: 2,
  },
  empty: {
    paddingVertical: 24,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 14,
    color: colors.textMute,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.primary,
    height: 50,
    borderRadius: 12,
    marginTop: 12,
  },
  addBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#FFFFFF",
  },
});
