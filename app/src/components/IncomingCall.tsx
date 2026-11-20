import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useCalls } from '../lib/calls';
import { roleLabel } from '../lib/theme';
import { Avatar } from './ui';

/** Full-screen ringing UI shown over any screen while a call is incoming. */
export default function IncomingCall() {
  const { incoming, accept, reject } = useCalls();
  if (!incoming) return null;
  const video = incoming.kind === 'video';
  return (
    <Modal visible animationType="slide" transparent={false} onRequestClose={reject}>
      <View style={styles.root}>
        <View style={styles.top}>
          <Text style={styles.kind}>
            <Ionicons name="lock-closed" size={12} /> LandConnect {video ? 'video' : 'voice'} call
          </Text>
          <Text style={styles.name}>{incoming.caller.name}</Text>
          <Text style={styles.role}>{roleLabel[incoming.caller.role]} · Ringing…</Text>
        </View>
        <Avatar name={incoming.caller.name} size={140} />
        <View style={styles.actions}>
          <View style={styles.action}>
            <Pressable accessibilityLabel="Decline call" onPress={reject} style={[styles.btn, { backgroundColor: '#EA0038' }]}>
              <Ionicons name="call" size={30} color="#fff" style={{ transform: [{ rotate: '135deg' }] }} />
            </Pressable>
            <Text style={styles.label}>Decline</Text>
          </View>
          <View style={styles.action}>
            <Pressable accessibilityLabel="Accept call" onPress={accept} style={[styles.btn, { backgroundColor: '#25D366' }]}>
              <Ionicons name={video ? 'videocam' : 'call'} size={30} color="#fff" />
            </Pressable>
            <Text style={styles.label}>Accept</Text>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0B141A', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 80 },
  top: { alignItems: 'center', gap: 8 },
  kind: { color: '#8696A0', fontSize: 13 },
  name: { color: '#fff', fontSize: 30, fontWeight: '600' },
  role: { color: '#E9EDEF', fontSize: 16 },
  actions: { flexDirection: 'row', gap: 90 },
  action: { alignItems: 'center', gap: 10 },
  btn: { width: 72, height: 72, borderRadius: 36, alignItems: 'center', justifyContent: 'center' },
  label: { color: '#E9EDEF', fontSize: 14 },
});
