import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import IncomingCall from '../components/IncomingCall';
import { Loading } from '../components/ui';
import { CallsProvider } from '../lib/calls';
import { RealtimeProvider } from '../lib/realtime';
import { SessionProvider, useSession } from '../lib/session';
import { colors } from '../lib/theme';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <SessionProvider>
        <App />
      </SessionProvider>
    </SafeAreaProvider>
  );
}

function App() {
  const { user, token, loading } = useSession();
  if (loading) return <Loading />;
  const signedIn = !!user;

  return (
    <RealtimeProvider token={signedIn ? token : null}>
      <CallsProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.primary },
            headerTintColor: '#fff',
            headerTitleStyle: { fontWeight: '600' },
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Protected guard={signedIn}>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="listing/[id]" options={{ title: '' }} />
            <Stack.Screen name="listing/edit" options={{ title: 'Listing' }} />
            <Stack.Screen name="chat/[id]" options={{ title: '' }} />
            <Stack.Screen name="room/new" options={{ title: 'New meeting room' }} />
            <Stack.Screen name="room/[id]" options={{ title: 'Meeting room' }} />
            <Stack.Screen name="call" options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false }} />
            <Stack.Screen name="meeting/[id]" options={{ headerShown: false, presentation: 'fullScreenModal', gestureEnabled: false }} />
          </Stack.Protected>
          <Stack.Protected guard={!signedIn}>
            <Stack.Screen name="sign-in" options={{ headerShown: false }} />
            <Stack.Screen name="sign-up" options={{ title: 'Create account' }} />
          </Stack.Protected>
        </Stack>
        {signedIn ? <IncomingCall /> : null}
      </CallsProvider>
    </RealtimeProvider>
  );
}
