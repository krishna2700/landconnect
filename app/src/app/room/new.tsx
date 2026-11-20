import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { Avatar, Button, ErrorText, Field, RoleBadge } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { colors } from '../../lib/theme';
import type { Listing, PublicUser } from '../../lib/types';

export default function NewRoom() {
  const { listing: listingParam } = useLocalSearchParams<{ listing?: string }>();
  const router = useRouter();
  const [listing, setListing] = useState<Listing | null>(null);
  const [title, setTitle] = useState('');
  const [q, setQ] = useState('');
  const [results, setResults] = useState<PublicUser[]>([]);
  const [picked, setPicked] = useState<PublicUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!listingParam) return;
    api.listing(Number(listingParam)).then((l) => {
      setListing(l);
      setTitle(`Site discussion: ${l.title}`);
    });
  }, [listingParam]);

  // Small debounce so we don't search on every keystroke.
  useEffect(() => {
    const t = setTimeout(() => api.searchUsers(q).then(setResults).catch(() => {}), 250);
    return () => clearTimeout(t);
  }, [q]);

  const toggle = (u: PublicUser) =>
    setPicked((cur) => (cur.some((p) => p.id === u.id) ? cur.filter((p) => p.id !== u.id) : [...cur, u]));

  const create = async () => {
    if (title.trim().length < 3) return setError('Give the room a title');
    if (!picked.length) return setError('Invite at least one person');
    setBusy(true);
    setError(null);
    try {
      const room = await api.createRoom({ title: title.trim(), listing_id: listing?.id ?? null, participant_ids: picked.map((p) => p.id) });
      router.replace({ pathname: '/room/[id]', params: { id: String(room.id) } });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not create the room');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
      {listing ? (
        <View style={styles.listing}>
          <Ionicons name="pricetag" size={16} color={colors.primary} />
          <Text style={{ flex: 1, fontWeight: '600' }}>{listing.title}</Text>
        </View>
      ) : null}
      <Field label="Room title" value={title} onChangeText={setTitle} placeholder="e.g. Site walkthrough with buyers" />

      <Text style={styles.label}>Invite people ({picked.length})</Text>
      {picked.length ? (
        <View style={styles.pickedRow}>
          {picked.map((p) => (
            <Pressable key={p.id} onPress={() => toggle(p)} style={styles.pill}>
              <Text style={styles.pillText}>{p.name}</Text>
              <Ionicons name="close" size={14} color={colors.primaryDark} />
            </Pressable>
          ))}
        </View>
      ) : null}
      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.textMuted} />
        <TextInput value={q} onChangeText={setQ} placeholder="Search people by name" placeholderTextColor={colors.textMuted} style={{ flex: 1, fontSize: 15 }} />
      </View>
      {results.map((u) => {
        const on = picked.some((p) => p.id === u.id);
        return (
          <Pressable key={u.id} onPress={() => toggle(u)} style={styles.person}>
            <Avatar name={u.name} size={40} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontWeight: '600', color: colors.text }}>{u.name}</Text>
              <RoleBadge role={u.role} />
            </View>
            <Ionicons name={on ? 'checkmark-circle' : 'ellipse-outline'} size={24} color={on ? colors.accent : colors.textMuted} />
          </Pressable>
        );
      })}

      <ErrorText message={error} />
      <Button title="Create room" icon="people" loading={busy} onPress={create} style={{ marginTop: 16 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, paddingBottom: 48, maxWidth: 640, width: '100%', alignSelf: 'center' },
  listing: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: colors.chip, padding: 12, borderRadius: 10, marginBottom: 16 },
  label: { fontSize: 13, color: colors.primary, fontWeight: '600', marginBottom: 8 },
  pickedRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
  pill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.chip, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  pillText: { color: colors.primaryDark, fontWeight: '600', fontSize: 13 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 22, paddingHorizontal: 14, height: 44, marginBottom: 6 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
});
