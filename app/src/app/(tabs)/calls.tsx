import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, RefreshControl, SectionList, StyleSheet, Text, View } from 'react-native';

import { Avatar, Empty, Loading } from '../../components/ui';
import { api } from '../../lib/api';
import { useCalls } from '../../lib/calls';
import { useRealtimeEvent } from '../../lib/realtime';
import { useMe } from '../../lib/session';
import { colors, timeLabel } from '../../lib/theme';
import type { Call, Room } from '../../lib/types';

type Row = { type: 'room'; room: Room } | { type: 'call'; call: Call };

export default function Calls() {
  const me = useMe();
  const router = useRouter();
  const { startCall } = useCalls();
  const [calls, setCalls] = useState<Call[] | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const [c, r] = await Promise.all([api.calls().catch(() => []), api.rooms().catch(() => [])]);
    setCalls(c);
    setRooms(r);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );
  useRealtimeEvent('call_updated', load);
  useRealtimeEvent('room_invite', load);

  if (!calls) return <Loading />;

  const sections = [
    { title: 'Meeting rooms', data: rooms.map((room): Row => ({ type: 'room', room })) },
    { title: 'Recent calls', data: calls.map((call): Row => ({ type: 'call', call })) },
  ];

  return (
    <SectionList
      sections={sections}
      keyExtractor={(r) => (r.type === 'room' ? `r${r.room.id}` : `c${r.call.id}`)}
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
      ListHeaderComponent={
        <Pressable onPress={() => router.push('/room/new')} style={styles.newRoom}>
          <View style={styles.newIcon}>
            <Ionicons name="people" size={24} color="#fff" />
          </View>
          <View>
            <Text style={styles.name}>New meeting room</Text>
            <Text style={styles.sub}>Group video call for a site visit or negotiation</Text>
          </View>
        </Pressable>
      }
      renderSectionHeader={({ section }) =>
        section.data.length ? <Text style={styles.section}>{section.title}</Text> : null
      }
      ListFooterComponent={
        calls.length === 0 && rooms.length === 0 ? (
          <Empty icon="call-outline" title="No calls yet" hint="Call a seller or broker from a chat. Your number is never shared." />
        ) : undefined
      }
      renderItem={({ item }) => {
        if (item.type === 'room') {
          const r = item.room;
          return (
            <Pressable onPress={() => router.push({ pathname: '/room/[id]', params: { id: String(r.id) } })} style={styles.row}>
              <View style={[styles.newIcon, { backgroundColor: colors.primaryDark }]}>
                <Ionicons name="videocam" size={22} color="#fff" />
              </View>
              <View style={styles.middle}>
                <Text style={styles.name} numberOfLines={1}>
                  {r.title}
                </Text>
                <Text style={styles.sub} numberOfLines={1}>
                  {r.host.id === me.id ? 'You host' : `Hosted by ${r.host.name}`} · {r.participants.length + 1} people
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
            </Pressable>
          );
        }
        const c = item.call;
        const outgoing = c.caller.id === me.id;
        const other = outgoing ? c.callee : c.caller;
        const missed = !outgoing && (c.status === 'missed' || c.status === 'cancelled');
        const failed = c.status !== 'ended' && c.status !== 'accepted';
        return (
          <View style={styles.row}>
            <Avatar name={other.name} size={48} />
            <View style={styles.middle}>
              <Text style={[styles.name, missed && { color: colors.danger }]} numberOfLines={1}>
                {other.name}
              </Text>
              <Text style={styles.sub}>
                <Ionicons
                  name={outgoing ? 'arrow-up' : 'arrow-down'}
                  size={14}
                  color={failed ? colors.danger : colors.accent}
                  style={{ transform: [{ rotate: '45deg' }] }}
                />{' '}
                {timeLabel(c.created_at)} · {c.status === 'ended' ? (c.kind === 'video' ? 'Video' : 'Voice') : c.status}
              </Text>
            </View>
            <Pressable accessibilityLabel={`Call ${other.name} back`} onPress={() => startCall(c.conversation_id, c.kind)} hitSlop={12}>
              <Ionicons name={c.kind === 'video' ? 'videocam' : 'call'} size={22} color={colors.primary} />
            </Pressable>
          </View>
        );
      }}
      stickySectionHeadersEnabled={false}
    />
  );
}

const styles = StyleSheet.create({
  newRoom: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16 },
  newIcon: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.accent, alignItems: 'center', justifyContent: 'center' },
  section: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4, fontWeight: '700', color: colors.textMuted, fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 10 },
  middle: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '600', color: colors.text },
  sub: { fontSize: 13, color: colors.textMuted },
});
