import { Ionicons } from '@expo/vector-icons';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Image, Platform, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import LandMap from '../../components/LandMap';
import { ListingPhoto } from '../../components/ListingCard';
import { Avatar, Button, Empty, Loading, RoleBadge } from '../../components/ui';
import { api, ApiError, imageUrl } from '../../lib/api';
import { useCalls } from '../../lib/calls';
import { colors, formatArea, formatPrice, landTypeLabel } from '../../lib/theme';
import type { CallKind, Listing } from '../../lib/types';

function confirm(title: string, message: string, onYes: () => void) {
  if (Platform.OS === 'web') {
    if (window.confirm(`${title}\n\n${message}`)) onYes();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Yes', style: 'destructive', onPress: onYes },
  ]);
}

export default function ListingDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { startCall } = useCalls();
  const { width } = useWindowDimensions();
  const [listing, setListing] = useState<Listing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      api
        .listing(Number(id))
        .then(setListing)
        .catch((e) => setError(e instanceof ApiError ? e.message : 'Could not load listing'));
    }, [id]),
  );

  if (error) return <Empty icon="alert-circle-outline" title={error} />;
  if (!listing) return <Loading />;

  const contact = async (kind: 'chat' | CallKind) => {
    setBusy(kind);
    try {
      const conv = await api.openConversation(listing.owner.id, listing.id);
      if (kind === 'chat') router.push({ pathname: '/chat/[id]', params: { id: String(conv.id) } });
      else await startCall(conv.id, kind);
    } finally {
      setBusy(null);
    }
  };

  const setStatus = async (status: Listing['status']) => setListing(await api.updateListing(listing.id, { status }));

  const photoWidth = Math.min(width, 720);

  return (
    <>
      <Stack.Screen options={{ title: listing.title }} />
      <ScrollView contentContainerStyle={{ paddingBottom: 48, maxWidth: 720, width: '100%', alignSelf: 'center' }}>
        {listing.image_ids.length ? (
          <ScrollView horizontal pagingEnabled showsHorizontalScrollIndicator={false}>
            {listing.image_ids.map((img) => (
              <Image key={img} source={{ uri: imageUrl(img) }} style={{ width: photoWidth, height: 260 }} resizeMode="cover" />
            ))}
          </ScrollView>
        ) : (
          <ListingPhoto listing={listing} height={200} />
        )}

        <View style={styles.body}>
          <Text style={styles.price}>{formatPrice(listing.price)}</Text>
          <Text style={styles.title}>{listing.title}</Text>
          <View style={styles.facts}>
            <Fact icon="resize" text={formatArea(listing.area_sqft)} />
            <Fact icon="leaf-outline" text={landTypeLabel[listing.land_type]} />
            <Fact icon="location-outline" text={listing.city} />
            {listing.status !== 'active' ? <Fact icon="flag-outline" text={listing.status} /> : null}
          </View>

          {listing.description ? <Text style={styles.desc}>{listing.description}</Text> : null}

          <Text style={styles.section}>Location</Text>
          {listing.address ? <Text style={styles.address}>{listing.address}</Text> : null}
          {listing.location_is_approximate ? (
            <Text style={styles.approx}>
              <Ionicons name="eye-off-outline" size={13} /> The owner shows an approximate area. Ask in chat for the exact spot.
            </Text>
          ) : null}
          <LandMap
            markers={[{ id: listing.id, lat: listing.lat, lng: listing.lng, label: listing.title, approximate: listing.location_is_approximate }]}
            center={{ lat: listing.lat, lng: listing.lng }}
            zoom={listing.location_is_approximate ? 13 : 15}
          />

          <Text style={styles.section}>{listing.is_mine ? 'Your listing' : 'Listed by'}</Text>
          <View style={styles.owner}>
            <Avatar name={listing.owner.name} size={52} />
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={styles.ownerName}>{listing.owner.name}</Text>
              <RoleBadge role={listing.owner.role} />
              {listing.owner.about ? <Text style={styles.about}>{listing.owner.about}</Text> : null}
            </View>
          </View>

          {listing.is_mine ? (
            <View style={styles.actions}>
              <Button
                title="Edit listing"
                icon="create-outline"
                onPress={() => router.push({ pathname: '/listing/edit', params: { id: String(listing.id) } })}
              />
              <Button
                title="Host a meeting room"
                icon="people-outline"
                variant="outline"
                onPress={() => router.push({ pathname: '/room/new', params: { listing: String(listing.id) } })}
              />
              <Button
                title={listing.status === 'sold' ? 'Mark as available' : 'Mark as sold'}
                icon="pricetag-outline"
                variant="outline"
                onPress={() => setStatus(listing.status === 'sold' ? 'active' : 'sold')}
              />
              <Button
                title="Delete listing"
                icon="trash-outline"
                variant="ghost"
                onPress={() =>
                  confirm('Delete listing?', 'This removes the listing and its photos.', async () => {
                    await api.deleteListing(listing.id);
                    router.back();
                  })
                }
              />
            </View>
          ) : (
            <>
              <View style={styles.contactRow}>
                <Button title="Chat" icon="chatbubble-ellipses" style={{ flex: 1 }} loading={busy === 'chat'} onPress={() => contact('chat')} />
                <Button title="Voice" icon="call" variant="outline" style={{ flex: 1 }} loading={busy === 'audio'} onPress={() => contact('audio')} />
                <Button title="Video" icon="videocam" variant="outline" style={{ flex: 1 }} loading={busy === 'video'} onPress={() => contact('video')} />
              </View>
              <Text style={styles.privacy}>
                <Ionicons name="lock-closed" size={12} /> Calls and chats stay in LandConnect. Neither side sees the other's phone number.
              </Text>
            </>
          )}
        </View>
      </ScrollView>
    </>
  );
}

function Fact({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
  return (
    <View style={styles.fact}>
      <Ionicons name={icon} size={14} color={colors.primary} />
      <Text style={styles.factText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { padding: 16, gap: 6 },
  price: { fontSize: 26, fontWeight: '800', color: colors.text },
  title: { fontSize: 18, fontWeight: '600', color: colors.text },
  facts: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  fact: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.chip, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 5 },
  factText: { fontSize: 13, color: colors.primaryDark, fontWeight: '600', textTransform: 'capitalize' },
  desc: { fontSize: 15, lineHeight: 22, color: colors.text, marginTop: 12 },
  section: { fontSize: 14, fontWeight: '700', color: colors.primary, marginTop: 20, marginBottom: 6 },
  address: { color: colors.text, marginBottom: 6 },
  approx: { color: colors.textMuted, fontSize: 13, marginBottom: 6 },
  owner: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  ownerName: { fontSize: 16, fontWeight: '700', color: colors.text },
  about: { color: colors.textMuted, fontSize: 13 },
  actions: { gap: 10, marginTop: 20 },
  contactRow: { flexDirection: 'row', gap: 8, marginTop: 20 },
  privacy: { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: 10 },
});
