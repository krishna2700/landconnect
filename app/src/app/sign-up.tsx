import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Button, ErrorText, Field } from '../components/ui';
import { ApiError } from '../lib/api';
import { useSession } from '../lib/session';
import { colors } from '../lib/theme';
import type { Role } from '../lib/types';

const ROLES: { role: Role; icon: keyof typeof Ionicons.glyphMap; title: string; hint: string }[] = [
  { role: 'buyer', icon: 'search', title: 'Buyer', hint: 'Browse land, chat and call owners' },
  { role: 'seller', icon: 'home', title: 'Seller', hint: 'List and manage your own land' },
  { role: 'broker', icon: 'briefcase', title: 'Broker', hint: 'List land for clients, host meetings' },
];

export default function SignUp() {
  const { signUp } = useSession();
  const [role, setRole] = useState<Role>('buyer');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (password.length < 8) return setError('Password must be at least 8 characters');
    setBusy(true);
    setError(null);
    try {
      await signUp({ name: name.trim(), email: email.trim(), password, role, phone: phone.trim() || undefined });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Sign-up failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
      <Text style={styles.heading}>I am a…</Text>
      {ROLES.map((r) => (
        <Pressable key={r.role} onPress={() => setRole(r.role)} style={[styles.role, role === r.role && styles.roleOn]}>
          <Ionicons name={r.icon} size={22} color={role === r.role ? colors.primary : colors.textMuted} />
          <View style={{ flex: 1 }}>
            <Text style={styles.roleTitle}>{r.title}</Text>
            <Text style={styles.roleHint}>{r.hint}</Text>
          </View>
          <Ionicons name={role === r.role ? 'radio-button-on' : 'radio-button-off'} size={20} color={colors.primary} />
        </Pressable>
      ))}

      <View style={{ height: 16 }} />
      <Field label="Full name" value={name} onChangeText={setName} autoComplete="name" />
      <Field label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Field label="Phone (optional, never shown to others)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Field label="Password (8+ characters)" value={password} onChangeText={setPassword} secureTextEntry autoComplete="new-password" />
      <ErrorText message={error} />
      <Button title="Create account" onPress={submit} loading={busy} disabled={!name || !email || !password} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 20, maxWidth: 520, width: '100%', alignSelf: 'center' },
  heading: { fontSize: 18, fontWeight: '700', marginBottom: 12, color: colors.text },
  role: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: colors.border, marginBottom: 10 },
  roleOn: { borderColor: colors.primary, backgroundColor: colors.chip },
  roleTitle: { fontWeight: '700', fontSize: 15, color: colors.text },
  roleHint: { color: colors.textMuted, fontSize: 13 },
});
