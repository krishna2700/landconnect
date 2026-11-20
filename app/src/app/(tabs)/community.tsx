import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import LandMap from '../../components/LandMap';
import ListingCard from '../../components/ListingCard';
import { Chip, Empty, Loading } from '../../components/ui';
import { api } from '../../lib/api';
import { useMe } from '../../lib/session';
import { colors, formatPrice, landTypeLabel } from '../../lib/theme';
import type { LandType, Listing } from '../../lib/types';

const TYPES: (LandType | '')[] = ['', 'agricultural', 'residential', 'commercial', 'industrial'];
const BUDGETS: { label: string; max?: number }[] = [
  { label: 'Any budget' },
  { label: 'Under ₹1 Cr', max: 1_00_00_000 },
  { label: 'Under ₹2.5 Cr', max: 2_50_00_000 },
  { label: 'Under ₹5 Cr', max: 5_00_00_000 },
];

export default function Community() {
  const me = useMe();
  const router = useRouter();
  const [items, setItems] = useState<Listing[] | null>(null);
  const [q, setQ] = useState('');
  const [type, setType] = useState<LandType | ''>('');
  const [budget, setBudget] = useState(0);
  const [view, setView] = useState<'list' | 'map'>('list');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setItems(await api.listings({ q, land_type: type, max_price: BUDGETS[budget].max }));
    } catch {
      setItems((cur) => cur ?? []);
    }
  }, [q, type, budget]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const open = (id: number) => router.push({ pathname: '/listing/[id]', params: { id: String(id) } });
  const canList = me.role !== 'buyer';

  return (
    <View style={{ flex: 1, backgroundColor: colors.card }}>
      <View style={styles.searchRow}>
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            placeholder="Search title, city, description"
            placeholderTextColor={colors.textMuted}
            value={q}
            onChangeText={setQ}
            onSubmitEditing={load}
            returnKeyType="search"
            style={styles.searchInput}
          />
        </View>
        <Pressable
          accessibilityLabel={view === 'list' ? 'Show map' : 'Show list'}
          onPress={() => setView(view === 'list' ? 'map' : 'list')}
          style={styles.toggle}
        >
          <Ionicons name={view === 'list' ? 'map-outline' : 'list'} size={22} color={colors.primary} />
        </Pressable>
      </View>
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {TYPES.map((t) => (
            <Chip key={t || 'all'} label={t ? landTypeLabel[t] : 'All land'} selected={type === t} onPress={() => setType(t)} />
          ))}
          {BUDGETS.map((b, i) => (
            <Chip key={b.label} label={b.label} selected={budget === i} onPress={() => setBudget(i)} />
          ))}
        </ScrollView>
      </View>

      {!items ? (
        <Loading />
      ) : view === 'map' ? (
        <View style={{ flex: 1, padding: 12 }}>
          <LandMap
            height={600}
            markers={items.map((l) => ({
              id: l.id,
              lat: l.lat,
              lng: l.lng,
              label: `${l.title}<br>${formatPrice(l.price)}`,
              approximate: l.location_is_approximate,
            }))}
            onMarkerPress={open}
          />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(l) => String(l.id)}
          renderItem={({ item }) => <ListingCard listing={item} onPress={() => open(item.id)} />}
          contentContainerStyle={items.length ? { paddingTop: 4, paddingBottom: 96 } : { flex: 1 }}
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
          ListEmptyComponent={<Empty icon="map-outline" title="No land matches" hint="Try another filter or search term." />}
        />
      )}

      {canList ? (
        <Pressable accessibilityLabel="Add a listing" onPress={() => router.push('/listing/edit')} style={styles.fab}>
          <Ionicons name="add" size={30} color="#fff" />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', gap: 8, padding: 12, paddingBottom: 4, alignItems: 'center' },
  search: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 24, paddingHorizontal: 14, height: 44, borderWidth: 1, borderColor: colors.border },
  searchInput: { flex: 1, fontSize: 15, color: colors.text },
  toggle: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  chips: { paddingHorizontal: 12, paddingVertical: 8 },
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 18,
    width: 58,
    height: 58,
    borderRadius: 16,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
});
