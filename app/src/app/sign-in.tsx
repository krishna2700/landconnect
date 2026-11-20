import { Ionicons } from '@expo/vector-icons';
import { Link } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button, ErrorText, Field } from '../components/ui';
import { ApiError } from '../lib/api';
import { useSession } from '../lib/session';
import { colors } from '../lib/theme';

const DEMO = [
  { label: 'Buyer', email: 'buyer@landconnect.demo' },
  { label: 'Seller', email: 'seller@landconnect.demo' },
  { label: 'Broker', email: 'broker@landconnect.demo' },
];

export default function SignIn() {
  const { signIn } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e = email, p = password) => {
    setBusy(true);
    setError(null);
    try {
      await signIn(e.trim(), p);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
          <View style={styles.logo}>
            <Ionicons name="map" size={44} color="#fff" />
          </View>
          <Text style={styles.brand}>LandConnect</Text>
          <Text style={styles.tag}>Buy, sell and broker land. Chat and call without sharing your number.</Text>

          <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" onSubmitEditing={() => submit()} />
          <ErrorText message={error} />
          <Button title="Sign in" onPress={() => submit()} loading={busy} disabled={!email || !password} />

          <Link href="/sign-up" asChild>
            <Pressable style={{ marginTop: 18, alignItems: 'center' }}>
              <Text style={{ color: colors.primary, fontWeight: '600' }}>New here? Create an account</Text>
            </Pressable>
          </Link>

          <View style={styles.demo}>
            <Text style={styles.demoTitle}>Try a demo account</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {DEMO.map((d) => (
                <Button key={d.email} title={d.label} variant="outline" style={{ flex: 1, height: 40 }} onPress={() => submit(d.email, 'Demo@1234')} />
              ))}
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 24, paddingTop: 48, maxWidth: 480, width: '100%', alignSelf: 'center' },
  logo: { width: 84, height: 84, borderRadius: 42, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', alignSelf: 'center' },
  brand: { fontSize: 28, fontWeight: '800', color: colors.primaryDark, textAlign: 'center', marginTop: 12 },
  tag: { textAlign: 'center', color: colors.textMuted, marginTop: 6, marginBottom: 32 },
  demo: { marginTop: 36, padding: 16, borderRadius: 12, backgroundColor: colors.card, gap: 10 },
  demoTitle: { fontWeight: '700', color: colors.text },
});
