import { Ionicons } from '@expo/vector-icons';
import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';

import { colors, roleColor, roleLabel } from '../lib/theme';

const AVATAR_COLORS = ['#00A884', '#53BDEB', '#FF8A65', '#9575CD', '#F06292', '#4DB6AC', '#FFB300'];

export function Avatar({ name, size = 48 }: { name: string; size?: number }) {
  const initials = name
    .replace(/\(.*?\)/g, '')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
  const bg = AVATAR_COLORS[[...name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % AVATAR_COLORS.length];
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ color: '#fff', fontWeight: '700', fontSize: size * 0.38 }}>{initials || '?'}</Text>
    </View>
  );
}

export function RoleBadge({ role }: { role: string }) {
  return (
    <View style={[styles.badge, { backgroundColor: roleColor[role] + '1A' }]}>
      <Text style={[styles.badgeText, { color: roleColor[role] }]}>{roleLabel[role]}</Text>
    </View>
  );
}

export function Button({
  title,
  onPress,
  icon,
  variant = 'primary',
  loading,
  disabled,
  style,
}: {
  title: string;
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  variant?: 'primary' | 'outline' | 'danger' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const bg = { primary: colors.primary, outline: 'transparent', danger: colors.danger, ghost: 'transparent' }[variant];
  const fg = variant === 'outline' || variant === 'ghost' ? colors.primary : '#fff';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderWidth: variant === 'outline' ? 1.5 : 0, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={18} color={fg} />}
          <Text style={[styles.buttonText, { color: fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

export function Field({ label, error, ...props }: TextInputProps & { label: string; error?: string }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput placeholderTextColor={colors.textMuted} {...props} style={[styles.input, props.multiline && { minHeight: 90, textAlignVertical: 'top' }, props.style]} />
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

export function Chip({ label, selected, onPress }: { label: string; selected?: boolean; onPress?: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, selected && { backgroundColor: colors.chip, borderColor: colors.primary }]}>
      <Text style={[styles.chipText, selected && { color: colors.primaryDark, fontWeight: '700' }]}>{label}</Text>
    </Pressable>
  );
}

export function Empty({ icon, title, hint, children }: { icon: keyof typeof Ionicons.glyphMap; title: string; hint?: string; children?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <Ionicons name={icon} size={56} color={colors.border} />
      <Text style={styles.emptyTitle}>{title}</Text>
      {hint ? <Text style={styles.emptyHint}>{hint}</Text> : null}
      {children}
    </View>
  );
}

export function Loading() {
  return (
    <View style={styles.empty}>
      <ActivityIndicator color={colors.primary} size="large" />
    </View>
  );
}

export function ErrorText({ message }: { message?: string | null }) {
  return message ? <Text style={[styles.error, { marginBottom: 12 }]}>{message}</Text> : null;
}

const styles = StyleSheet.create({
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, alignSelf: 'flex-start' },
  badgeText: { fontSize: 11, fontWeight: '700' },
  button: {
    height: 48,
    borderRadius: 24,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 20,
  },
  buttonText: { fontSize: 15, fontWeight: '700' },
  label: { fontSize: 13, color: colors.primary, fontWeight: '600', marginBottom: 6 },
  input: {
    borderBottomWidth: 2,
    borderBottomColor: colors.primary,
    paddingVertical: 8,
    fontSize: 16,
    color: colors.text,
  },
  error: { color: colors.danger, fontSize: 13, marginTop: 4 },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    backgroundColor: '#fff',
  },
  chipText: { color: colors.textMuted, fontSize: 13 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  emptyTitle: { fontSize: 17, fontWeight: '700', color: colors.text, textAlign: 'center' },
  emptyHint: { fontSize: 14, color: colors.textMuted, textAlign: 'center' },
});
