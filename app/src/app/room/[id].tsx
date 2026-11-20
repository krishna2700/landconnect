import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, Empty, Loading, RoleBadge } from '../../components/ui';
import { api, ApiError } from '../../lib/api';
import { useMe } from '../../lib/session';
import { colors, formatPrice } from '../../lib/theme';
import type { Room } from '../../lib/types';

export default function RoomDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const me = useMe();
  const router = useRouter();
  const [room, setRoom] = useState<Room | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .room(Number(id))
      .then(setRoom)
      .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load room'));
  }, [id]);

  if (error) return <Empty icon="alert-circle-outline" title={error} />;
  if (!room) return <Loading />;
  const people = [room.host, ...room.participants];

  return (
    <>
      <Stack.Screen options={{ title: room.title }} />
      <ScrollView contentContainerStyle={styles.wrap}>
        <View style={styles.hero}>
          <View style={styles.icon}>
            <Ionicons name="videocam" size={36} color="#fff" />
          </View>
          <Text style={styles.title}>{room.title}</Text>
          <Text style={styles.sub}>Hosted by {room.host.id === me.id ? 'you' : room.host.name}</Text>
        </View>

        {room.listing ? (
          <Pressable
            onPress={() => router.push({ pathname: '/listing/[id]', params: { id: String(room.listing!.id) } })}
            style={styles.listing}
          >
            <Ionicons name="pricetag" size={16} color={colors.primary} />
            <Text style={{ flex: 1, fontWeight: '600' }} numberOfLines={1}>
              {room.listing.title} · {formatPrice(room.listing.price)}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Pressable>
        ) : null}

        <Button
          title="Join video meeting"
          icon="videocam"
          onPress={() => router.push({ pathname: '/meeting/[id]', params: { id: String(room.id) } })}
          style={{ marginVertical: 16 }}
        />

        <Text style={styles.section}>{people.length} people</Text>
        {people.map((p) => (
          <View key={p.id} style={styles.person}>
            <Avatar name={p.name} size={40} />
            <Text style={{ flex: 1, fontWeight: '600', color: colors.text }}>
              {p.name}
              {p.id === room.host.id ? ' (host)' : ''}
            </Text>
            <RoleBadge role={p.role} />
          </View>
        ))}

        {room.host.id === me.id ? (
          <Button
            title="Delete room"
            variant="ghost"
            icon="trash-outline"
            onPress={async () => {
              await api.deleteRoom(room.id);
              router.back();
            }}
            style={{ marginTop: 24 }}
          />
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, paddingBottom: 48, maxWidth: 640, width: '100%', alignSelf: 'center' },
  hero: { alignItems: 'center', gap: 6, marginVertical: 12 },
  icon: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 20, fontWeight: '700', color: colors.text, textAlign: 'center' },
  sub: { color: colors.textMuted },
  listing: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: colors.chip, padding: 12, borderRadius: 10 },
  section: { fontSize: 14, fontWeight: '700', color: colors.primary, marginBottom: 8 },
  person: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
});
