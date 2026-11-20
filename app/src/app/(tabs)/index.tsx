import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import { Avatar, Button, Empty, Loading, RoleBadge } from '../../components/ui';
import { api } from '../../lib/api';
import { useRealtimeEvent } from '../../lib/realtime';
import { useMe } from '../../lib/session';
import { colors, timeLabel } from '../../lib/theme';
import type { Conversation } from '../../lib/types';

export default function Chats() {
  const me = useMe();
  const router = useRouter();
  const [items, setItems] = useState<Conversation[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await api.conversations());
    } catch {
      setItems((cur) => cur ?? []);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useRealtimeEvent('message', load);
  useRealtimeEvent('read', load);

  if (!items) return <Loading />;

  return (
    <FlatList
      data={items}
      keyExtractor={(c) => String(c.id)}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load();
            setRefreshing(false);
          }}
        />
      }
      contentContainerStyle={items.length ? undefined : { flex: 1 }}
      ListEmptyComponent={
        <Empty icon="chatbubbles-outline" title="No chats yet" hint="Open a listing in Community and tap Chat to message the owner.">
          <Button title="Browse land" icon="map" onPress={() => router.navigate('/community')} style={{ marginTop: 12 }} />
        </Empty>
      }
      renderItem={({ item }) => {
        const last = item.last_message;
        const mine = last?.sender_id === me.id;
        return (
          <Pressable
            onPress={() => router.push({ pathname: '/chat/[id]', params: { id: String(item.id) } })}
            style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.card }]}
          >
            <Avatar name={item.other.name} size={52} />
            <View style={styles.middle}>
              <View style={styles.line}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.other.name}
                </Text>
                <Text style={[styles.time, item.unread > 0 && { color: colors.accent, fontWeight: '700' }]}>
                  {timeLabel(item.last_message_at)}
                </Text>
              </View>
              {item.listing ? (
                <Text style={styles.listing} numberOfLines={1}>
                  <Ionicons name="pricetag-outline" size={12} /> {item.listing.title}
                </Text>
              ) : (
                <RoleBadge role={item.other.role} />
              )}
              <View style={styles.line}>
                <Text style={styles.preview} numberOfLines={1}>
                  {last ? (
                    <>
                      {mine && last.kind === 'text' ? (
                        <Ionicons name="checkmark-done" size={15} color={last.read_at ? colors.tick : colors.textMuted} />
                      ) : null}
                      {last.kind === 'call' ? <Ionicons name="call-outline" size={13} /> : null} {last.body}
                    </>
                  ) : (
                    'Say hello 👋'
                  )}
                </Text>
                {item.unread > 0 ? (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{item.unread}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 12, gap: 14, alignItems: 'center' },
  middle: { flex: 1, gap: 2, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, paddingBottom: 12 },
  line: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  name: { fontSize: 16, fontWeight: '600', color: colors.text, flex: 1 },
  time: { fontSize: 12, color: colors.textMuted },
  listing: { fontSize: 12, color: colors.primary },
  preview: { fontSize: 14, color: colors.textMuted, flex: 1 },
  badge: { minWidth: 20, height: 20, borderRadius: 10, backgroundColor: colors.badge, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  badgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
