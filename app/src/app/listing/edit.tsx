import { Ionicons } from '@expo/vector-icons';
import { SaveFormat, ImageManipulator } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';

import LandMap from '../../components/LandMap';
import { Button, Chip, ErrorText, Field, Loading } from '../../components/ui';
import { api, ApiError, imageUrl } from '../../lib/api';
import { colors, landTypeLabel } from '../../lib/theme';
import type { LandType, Listing } from '../../lib/types';

const TYPES: LandType[] = ['agricultural', 'residential', 'commercial', 'industrial'];
const SQFT_PER_ACRE = 43560;
const MAX_PHOTOS = 6;

interface PendingPhoto {
  uri: string;
  base64: string;
}

async function compress(uri: string): Promise<PendingPhoto> {
  const ref = await ImageManipulator.manipulate(uri).resize({ width: 1280, height: null }).renderAsync();
  const out = await ref.saveAsync({ compress: 0.7, format: SaveFormat.JPEG, base64: true });
  return { uri: out.uri, base64: out.base64! };
}

export default function EditListing() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const editing = !!id;
  const router = useRouter();

  const [loaded, setLoaded] = useState(!editing);
  const [existing, setExisting] = useState<Listing | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [area, setArea] = useState('');
  const [unit, setUnit] = useState<'acres' | 'sqft'>('acres');
  const [type, setType] = useState<LandType>('agricultural');
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [point, setPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [exact, setExact] = useState(true);
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [locating, setLocating] = useState(false);

  useEffect(() => {
    if (!editing) return;
    api.listing(Number(id)).then((l) => {
      setExisting(l);
      setTitle(l.title);
      setDescription(l.description);
      setPrice(String(l.price));
      const acres = l.area_sqft / SQFT_PER_ACRE;
      if (acres >= 0.5) setArea(String(+acres.toFixed(3)));
      else {
        setUnit('sqft');
        setArea(String(l.area_sqft));
      }
      setType(l.land_type);
      setCity(l.city);
      setAddress(l.address);
      setPoint({ lat: l.lat, lng: l.lng });
      setExact(l.show_exact_location);
      setLoaded(true);
    });
  }, [editing, id]);

  const useMyLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return setError('Location permission was denied. Tap the map to place the pin instead.');
      const pos = await Location.getCurrentPositionAsync({});
      setPoint({ lat: pos.coords.latitude, lng: pos.coords.longitude });
    } catch {
      setError("Couldn't get your location. Tap the map to place the pin instead.");
    } finally {
      setLocating(false);
    }
  };

  const photoCount = (existing?.image_ids.length ?? 0) + pending.length;

  const pickPhotos = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      selectionLimit: MAX_PHOTOS - photoCount,
      quality: 1,
    });
    if (res.canceled) return;
    const photos = await Promise.all(res.assets.slice(0, MAX_PHOTOS - photoCount).map((a) => compress(a.uri)));
    setPending((cur) => [...cur, ...photos]);
  };

  const removeExisting = async (imageId: number) => {
    if (existing) setExisting(await api.removeImage(existing.id, imageId));
  };

  const save = async () => {
    setError(null);
    const priceNum = Number(price.replace(/[,\s]/g, ''));
    const areaNum = Number(area);
    if (title.trim().length < 3) return setError('Add a title (at least 3 characters)');
    if (!priceNum || priceNum <= 0) return setError('Enter the price in rupees');
    if (!areaNum || areaNum <= 0) return setError('Enter the land area');
    if (city.trim().length < 2) return setError('Enter the city or town');
    if (!point) return setError('Place the land on the map (tap the map or use your location)');

    const body = {
      title: title.trim(),
      description: description.trim(),
      price: Math.round(priceNum),
      area_sqft: unit === 'acres' ? areaNum * SQFT_PER_ACRE : areaNum,
      land_type: type,
      city: city.trim(),
      address: address.trim(),
      lat: point.lat,
      lng: point.lng,
      show_exact_location: exact,
    };
    setSaving(true);
    try {
      let listing = editing ? await api.updateListing(Number(id), body) : await api.createListing(body);
      for (const p of pending) {
        listing = await api.addImage(listing.id, { content_type: 'image/jpeg', data_base64: p.base64 });
      }
      router.replace({ pathname: '/listing/[id]', params: { id: String(listing.id) } });
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Could not save the listing');
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return <Loading />;

  return (
    <>
      <Stack.Screen options={{ title: editing ? 'Edit listing' : 'New listing' }} />
      <ScrollView contentContainerStyle={styles.wrap} keyboardShouldPersistTaps="handled">
        <Text style={styles.section}>Photos ({photoCount}/{MAX_PHOTOS})</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
          {existing?.image_ids.map((img) => (
            <Thumb key={img} uri={imageUrl(img)} onRemove={() => removeExisting(img)} />
          ))}
          {pending.map((p, i) => (
            <Thumb key={p.uri} uri={p.uri} onRemove={() => setPending((cur) => cur.filter((_, j) => j !== i))} />
          ))}
          {photoCount < MAX_PHOTOS ? (
            <Pressable onPress={pickPhotos} style={styles.addPhoto}>
              <Ionicons name="camera" size={26} color={colors.primary} />
              <Text style={{ color: colors.primary, fontSize: 12 }}>Add</Text>
            </Pressable>
          ) : null}
        </ScrollView>

        <Text style={styles.section}>Details</Text>
        <Field label="Title" value={title} onChangeText={setTitle} placeholder="e.g. 2-acre mango orchard" />
        <Field label="Description" value={description} onChangeText={setDescription} multiline placeholder="Access road, water, title status…" />
        <Field label="Price (₹)" value={price} onChangeText={setPrice} keyboardType="numeric" placeholder="e.g. 18500000" />
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-end' }}>
          <View style={{ flex: 1 }}>
            <Field label={`Area (${unit === 'acres' ? 'acres' : 'sq ft'})`} value={area} onChangeText={setArea} keyboardType="decimal-pad" />
          </View>
          <View style={{ flexDirection: 'row', marginBottom: 18 }}>
            <Chip label="Acres" selected={unit === 'acres'} onPress={() => setUnit('acres')} />
            <Chip label="Sq ft" selected={unit === 'sqft'} onPress={() => setUnit('sqft')} />
          </View>
        </View>
        <Text style={styles.label}>Land type</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16 }}>
          {TYPES.map((t) => (
            <Chip key={t} label={landTypeLabel[t]} selected={type === t} onPress={() => setType(t)} />
          ))}
        </View>

        <Text style={styles.section}>Location</Text>
        <Field label="City / town" value={city} onChangeText={setCity} />
        <Field label="Address or survey number" value={address} onChangeText={setAddress} />
        <Text style={styles.hint}>Tap the map or drag the pin to the land's position.</Text>
        <LandMap markers={[]} center={point ?? undefined} zoom={point ? 15 : 6} pickable onPick={setPoint} height={260} />
        <View style={styles.locRow}>
          <Text style={styles.coords}>{point ? `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}` : 'No position yet'}</Text>
          <Button title="Use my location" icon="locate" variant="ghost" loading={locating} onPress={useMyLocation} style={{ height: 36 }} />
        </View>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchTitle}>Show exact location</Text>
            <Text style={styles.hint}>Off: others see an approximate 1 km area and no street address.</Text>
          </View>
          <Switch value={exact} onValueChange={setExact} trackColor={{ true: colors.accent }} />
        </View>

        <ErrorText message={error} />
        <Button title={editing ? 'Save changes' : 'Publish listing'} icon="checkmark" loading={saving} onPress={save} />
      </ScrollView>
    </>
  );
}

function Thumb({ uri, onRemove }: { uri: string; onRemove: () => void }) {
  return (
    <View>
      <Image source={{ uri }} style={styles.thumb} />
      <Pressable accessibilityLabel="Remove photo" onPress={onRemove} style={styles.remove} hitSlop={8}>
        <Ionicons name="close" size={14} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { padding: 16, paddingBottom: 48, maxWidth: 640, width: '100%', alignSelf: 'center' },
  section: { fontSize: 14, fontWeight: '700', color: colors.primary, marginTop: 16, marginBottom: 10 },
  label: { fontSize: 13, color: colors.primary, fontWeight: '600', marginBottom: 8 },
  hint: { fontSize: 12, color: colors.textMuted, marginBottom: 8 },
  thumb: { width: 88, height: 88, borderRadius: 10 },
  remove: { position: 'absolute', top: 4, right: 4, backgroundColor: '#000a', borderRadius: 10, width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  addPhoto: { width: 88, height: 88, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  locRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6 },
  coords: { color: colors.textMuted, fontSize: 13 },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 16 },
  switchTitle: { fontSize: 15, fontWeight: '600', color: colors.text },
});
