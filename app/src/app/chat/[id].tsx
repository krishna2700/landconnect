import { Ionicons } from '@expo/vector-icons';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar, Loading } from '../../components/ui';
import { api } from '../../lib/api';
import { useCalls } from '../../lib/calls';
import { useRealtime, useRealtimeEvent } from '../../lib/realtime';
import { useMe } from '../../lib/session';
import { colors, formatPrice, roleLabel } from '../../lib/theme';
import type { Conversation, Message } from '../../lib/types';

const time = (iso: string) =>
  new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const convId = Number(id);
  const me = useMe();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { startCall } = useCalls();
  const { send: sendWs, connected } = useRealtime();
  const [conv, setConv] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [text, setText] = useState('');
  const [typing, setTyping] = useState(false);
  const lastTypingSent = useRef(0);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const load = useCallback(async () => {
    const [c, m] = await Promise.all([api.conversation(convId), api.messages(convId)]);
    setConv(c);
    setMessages(m);
    if (c.unread) api.markRead(convId).catch(() => {});
  }, [convId]);

  useEffect(() => {
    load();
  }, [load]);

  // Catch up on anything missed while the socket was down.
  useEffect(() => {
    if (connected) api.messages(convId).then(setMessages).catch(() => {});
  }, [connected, convId]);

  useRealtimeEvent('message', (m: Message) => {
    if (m.conversation_id !== convId) return;
    setMessages((cur) => (cur && !cur.some((x) => x.id === m.id) ? [...cur, m] : cur));
    if (m.sender_id !== me.id) {
      setTyping(false);
      api.markRead(convId).catch(() => {});
    }
  });

  useRealtimeEvent('call_updated', (d: { message?: Message }) => {
    const m = d.message;
    if (m && m.conversation_id === convId) setMessages((cur) => (cur && !cur.some((x) => x.id === m.id) ? [...cur, m] : cur));
  });

  useRealtimeEvent('read', (d: { conversation_id: number }) => {
    if (d.conversation_id !== convId) return;
    const now = new Date().toISOString();
    setMessages((cur) => cur?.map((m) => (m.sender_id === me.id && !m.read_at ? { ...m, read_at: now } : m)) ?? cur);
  });

  useRealtimeEvent('typing', (d: { conversation_id: number }) => {
    if (d.conversation_id !== convId) return;
    setTyping(true);
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => setTyping(false), 3000);
  });

  const onChangeText = (t: string) => {
    setText(t);
    const now = Date.now();
    if (t && now - lastTypingSent.current > 2000) {
      lastTypingSent.current = now;
      sendWs('typing', { conversation_id: convId });
    }
  };

  const send = async () => {
    const body = text.trim();
    if (!body) return;
    setText('');
    const msg = await api.send(convId, body).catch(() => {
      setText(body); // give the text back so nothing is lost
      return null;
    });
    if (msg) setMessages((cur) => (cur && !cur.some((x) => x.id === msg.id) ? [...cur, msg] : cur));
  };

  if (!conv || !messages) return <Loading />;
  const other = conv.other;

  return (
    <>
      <Stack.Screen
        options={{
          headerTitle: () => (
            <View style={styles.headerTitle}>
              <Avatar name={other.name} size={36} />
              <View>
                <Text style={styles.headerName} numberOfLines={1}>
                  {other.name}
                </Text>
                <Text style={styles.headerSub}>{typing ? 'typing…' : roleLabel[other.role]}</Text>
              </View>
            </View>
          ),
          headerRight: () => (
            <View style={styles.headerActions}>
              <Pressable accessibilityLabel="Video call" onPress={() => startCall(convId, 'video')} hitSlop={10}>
                <Ionicons name="videocam" size={24} color="#fff" />
              </Pressable>
              <Pressable accessibilityLabel="Voice call" onPress={() => startCall(convId, 'audio')} hitSlop={10}>
                <Ionicons name="call" size={22} color="#fff" />
              </Pressable>
            </View>
          ),
        }}
      />
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: colors.chatBg }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
      >
        {conv.listing ? (
          <Pressable
            onPress={() => router.push({ pathname: '/listing/[id]', params: { id: String(conv.listing!.id) } })}
            style={styles.listingBar}
          >
            <Ionicons name="pricetag" size={16} color={colors.primary} />
            <Text style={styles.listingText} numberOfLines={1}>
              {conv.listing.title} · {formatPrice(conv.listing.price)} · {conv.listing.city}
            </Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
          </Pressable>
        ) : null}

        <FlatList
          data={[...messages].reverse()}
          inverted
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={{ padding: 10 }}
          ListFooterComponent={
            <View style={styles.notice}>
              <Text style={styles.noticeText}>
                <Ionicons name="lock-closed" size={11} /> Messages and calls stay inside LandConnect. Phone numbers are never shared.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            if (item.kind === 'call') {
              const missed = item.body.startsWith('Missed') || item.body.includes('declined') || item.body.includes('cancelled');
              return (
                <View style={styles.callLog}>
                  <Ionicons name={item.body.includes('Video') || item.body.includes('video') ? 'videocam' : 'call'} size={14} color={missed ? colors.danger : colors.primary} />
                  <Text style={styles.callLogText}>
                    {item.body} · {time(item.created_at)}
                  </Text>
                </View>
              );
            }
            const mine = item.sender_id === me.id;
            return (
              <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                <Text style={styles.msg}>{item.body}</Text>
                <View style={styles.meta}>
                  <Text style={styles.time}>{time(item.created_at)}</Text>
                  {mine ? <Ionicons name="checkmark-done" size={16} color={item.read_at ? colors.tick : colors.textMuted} /> : null}
                </View>
              </View>
            );
          }}
        />

        <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          <View style={styles.inputWrap}>
            <TextInput
              value={text}
              onChangeText={onChangeText}
              placeholder="Message"
              placeholderTextColor={colors.textMuted}
              style={styles.input}
              multiline
              onSubmitEditing={Platform.OS === 'web' ? send : undefined}
              blurOnSubmit={Platform.OS === 'web'}
            />
          </View>
          <Pressable accessibilityLabel="Send" onPress={send} style={styles.sendBtn}>
            <Ionicons name="send" size={20} color="#fff" />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </>
  );
}

const styles = StyleSheet.create({
  headerTitle: { flexDirection: 'row', alignItems: 'center', gap: 10, maxWidth: 220 },
  headerName: { color: '#fff', fontSize: 17, fontWeight: '600' },
  headerSub: { color: '#E9EDEF', fontSize: 12 },
  headerActions: { flexDirection: 'row', gap: 22, paddingRight: 8 },
  listingBar: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
  listingText: { flex: 1, color: colors.text, fontWeight: '600', fontSize: 13 },
  notice: { alignSelf: 'center', backgroundColor: '#FFEECD', borderRadius: 8, padding: 8, marginVertical: 8, maxWidth: 320 },
  noticeText: { fontSize: 12, color: '#54656F', textAlign: 'center' },
  bubble: { maxWidth: '80%', borderRadius: 10, paddingHorizontal: 10, paddingTop: 6, paddingBottom: 4, marginVertical: 2, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 1, shadowOffset: { width: 0, height: 1 }, elevation: 1 },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.bubbleMine, borderTopRightRadius: 2 },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.bubbleTheirs, borderTopLeftRadius: 2 },
  msg: { fontSize: 15, color: colors.text, lineHeight: 20 },
  meta: { flexDirection: 'row', alignSelf: 'flex-end', alignItems: 'center', gap: 3, marginTop: 2 },
  time: { fontSize: 11, color: colors.textMuted },
  callLog: { alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, marginVertical: 6 },
  callLogText: { fontSize: 13, color: colors.text },
  inputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, paddingHorizontal: 6, paddingTop: 6 },
  inputWrap: { flex: 1, backgroundColor: '#fff', borderRadius: 24, paddingHorizontal: 16, minHeight: 48, justifyContent: 'center' },
  input: { fontSize: 16, maxHeight: 120, paddingVertical: 10, color: colors.text },
  sendBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
});
