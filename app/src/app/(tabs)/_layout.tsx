import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { colors } from '../../lib/theme';

type IconName = keyof typeof Ionicons.glyphMap;
const icon =
  (on: IconName, off: IconName) =>
  ({ focused, color }: { focused: boolean; color: unknown }) => <Ionicons name={focused ? on : off} size={24} color={String(color)} />;

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700', fontSize: 20 },
        tabBarActiveTintColor: colors.primaryDark,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: { height: 64, paddingBottom: 8, paddingTop: 6 },
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Chats', headerTitle: 'LandConnect', tabBarIcon: icon('chatbubbles', 'chatbubbles-outline') }} />
      <Tabs.Screen name="community" options={{ title: 'Community', headerTitle: 'Land listings', tabBarIcon: icon('map', 'map-outline') }} />
      <Tabs.Screen name="calls" options={{ title: 'Calls', tabBarIcon: icon('call', 'call-outline') }} />
      <Tabs.Screen name="me" options={{ title: 'Profile', tabBarIcon: icon('person-circle', 'person-circle-outline') }} />
    </Tabs>
  );
}
