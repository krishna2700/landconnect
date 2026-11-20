import { Ionicons } from '@expo/vector-icons';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { imageUrl } from '../lib/api';
import { colors, formatArea, formatPrice, landTypeLabel } from '../lib/theme';
import type { Listing } from '../lib/types';
import { RoleBadge } from './ui';

const TYPE_ICON = {
  agricultural: 'leaf',
  residential: 'home',
  commercial: 'storefront',
  industrial: 'business',
} as const;

export function ListingPhoto({ listing, height = 170 }: { listing: Listing; height?: number }) {
  if (listing.image_ids.length) {
    return <Image source={{ uri: imageUrl(listing.image_ids[0]) }} style={{ width: '100%', height }} resizeMode="cover" />;
  }
  return (
    <View style={[styles.placeholder, { height }]}>
      <Ionicons name={TYPE_ICON[listing.land_type]} size={48} color={colors.primary} />
    </View>
  );
}

export default function ListingCard({ listing, onPress }: { listing: Listing; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.card, pressed && { opacity: 0.9 }]}>
      <ListingPhoto listing={listing} />
      {listing.status !== 'active' ? (
        <View style={styles.status}>
          <Text style={styles.statusText}>{listing.status.toUpperCase()}</Text>
        </View>
      ) : null}
      <View style={styles.body}>
        <View style={styles.row}>
          <Text style={styles.price}>{formatPrice(listing.price)}</Text>
          <Text style={styles.area}>{formatArea(listing.area_sqft)}</Text>
        </View>
        <Text style={styles.title} numberOfLines={1}>
          {listing.title}
        </Text>
        <View style={styles.row}>
          <Text style={styles.meta} numberOfLines={1}>
            <Ionicons name="location-outline" size={13} /> {listing.city} · {landTypeLabel[listing.land_type]}
          </Text>
          <RoleBadge role={listing.owner.role} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    marginHorizontal: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  placeholder: { width: '100%', backgroundColor: colors.chip, alignItems: 'center', justifyContent: 'center' },
  status: { position: 'absolute', top: 10, left: 10, backgroundColor: '#000a', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusText: { color: '#fff', fontWeight: '700', fontSize: 11 },
  body: { padding: 12, gap: 4 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  price: { fontSize: 18, fontWeight: '800', color: colors.text },
  area: { fontSize: 13, color: colors.textMuted },
  title: { fontSize: 15, fontWeight: '600', color: colors.text },
  meta: { fontSize: 13, color: colors.textMuted, flex: 1 },
});
