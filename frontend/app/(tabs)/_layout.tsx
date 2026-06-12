import { Tabs } from "expo-router";
import { Feather } from "@expo/vector-icons";
import { colors } from "@/src/theme";

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMute,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: 84,
          paddingTop: 8,
          paddingBottom: 28,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: "600", marginTop: 2 },
      }}
    >
      <Tabs.Screen
        name="invoices"
        options={{
          title: "Invoice",
          tabBarIcon: ({ color, size }) => <Feather name="file-text" size={size - 2} color={color} />,
          tabBarTestID: "nav-invoices-tab",
        }}
      />
      <Tabs.Screen
        name="clients"
        options={{
          title: "Klien",
          tabBarIcon: ({ color, size }) => <Feather name="users" size={size - 2} color={color} />,
          tabBarTestID: "nav-clients-tab",
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profil",
          tabBarIcon: ({ color, size }) => <Feather name="briefcase" size={size - 2} color={color} />,
          tabBarTestID: "nav-profile-tab",
        }}
      />
    </Tabs>
  );
}
