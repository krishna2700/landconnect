import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import ListingCard from '../../components/ListingCard';
import { Avatar, Button, ErrorText, Field, RoleBadge } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { useMe, useSession } from '../../lib/session';
import { colors } from '../../lib/theme';
import type { CallPolicy, Listing } from '../../lib/types';

const POLICIES: { value: CallPolicy; title: string; hint: string }[] = [
  { value: 'everyone', title: 'Everyone I chat with', hint: 'Anyone in a chat with you can call' },
  { value: 'contacts', title: 'Only after I reply', hint: 'People can call once you have replied in the chat' },
  { value: 'nobody', title: 'Nobody', hint: 'Chat only, calls are blocked' },
];

export default function Profile() {
  const me = useMe();
  const { setUser, signOut } = useSession();
  const router = useRouter();
  const [name, setName] = useState(me.name);
  const [about, setAbout] = useState(me.about);
  const [phone, setPhone] = useState(me.phone ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [mine, setMine] = useState<Listing[]>([]);

  useFocusEffect(
    useCallback(() => {
      if (me.role !== 'buyer') api.listings({ mine: true }).then(setMine).catch(() => {});
    }, [me.role]),
  );

  const save = async (patch: Parameters<typeof api.updateMe>[0]) => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      setUser(await api.updateMe(patch));
      setSaved(true);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap}>
      <View style={styles.head}>
        <Avatar name={me.name} size={88} />
        <Text style={styles.name}>{me.name}</Text>
        <RoleBadge role={me.role} />
        <Text style={styles.email}>{me.email}</Text>
      </View>

      <Text style={styles.section}>Profile</Text>
      <Field label="Name" value={name} onChangeText={setName} />
      <Field label="About" value={about} onChangeText={setAbout} placeholder="e.g. Looking for farmland near Mysuru" />
      <Field label="Phone (private, never shown)" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <ErrorText message={error} />
      <Button
        title={saved ? 'Saved' : 'Save profile'}
        icon={saved ? 'checkmark' : undefined}
        loading={saving}
        onPress={() => save({ name: name.trim(), about: about.trim(), phone: phone.trim() })}
      />

      <Text style={styles.section}>
        <Ionicons name="shield-checkmark" size={14} /> Privacy · Who can call me
      </Text>
      {POLICIES.map((p) => (
        <Pressable key={p.value} onPress={() => save({ call_policy: p.value })} style={styles.option}>
          <Ionicons name={me.call_policy === p.value ? 'radio-button-on' : 'radio-button-off'} size={22} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.optionTitle}>{p.title}</Text>
            <Text style={styles.optionHint}>{p.hint}</Text>
          </View>
        </Pressable>
      ))}
      <Text style={styles.note}>
        Your phone number and email are never shown to other users. Calls run inside the app, and you can hide a
        listing's exact location until you share it in chat.
      </Text>

      {me.role !== 'buyer' ? (
        <>
          <View style={styles.sectionRow}>
            <Text style={styles.section}>My listings ({mine.length})</Text>
            <Button title="Add" icon="add" variant="ghost" onPress={() => router.push('/listing/edit')} style={{ height: 36 }} />
          </View>
          {mine.map((l) => (
            <View key={l.id} style={{ marginHorizontal: -12 }}>
              <ListingCard listing={l} onPress={() => router.push({ pathname: '/listing/[id]', params: { id: String(l.id) } })} />
            </View>
          ))}
        </>
      ) : null}

      <Button title="Sign out" variant="outline" icon="log-out-outline" onPress={signOut} style={{ marginTop: 24 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 20, paddingBottom: 48, maxWidth: 640, width: '100%', alignSelf: 'center' },
  head: { alignItems: 'center', gap: 6, marginBottom: 8 },
  name: { fontSize: 22, fontWeight: '700', color: colors.text },
  email: { color: colors.textMuted },
  section: { fontSize: 14, fontWeight: '700', color: colors.primary, marginTop: 24, marginBottom: 12 },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  option: { flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 10 },
  optionTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
  optionHint: { fontSize: 13, color: colors.textMuted },
  note: { fontSize: 12, color: colors.textMuted, marginTop: 8, lineHeight: 18 },
});
