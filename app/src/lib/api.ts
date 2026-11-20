import Constants from 'expo-constants';

import type {
  AuthResult,
  Call,
  CallJoin,
  CallKind,
  CallPolicy,
  Conversation,
  LandType,
  Listing,
  ListingInput,
  MediaToken,
  Me,
  Message,
  PublicUser,
  Role,
  Room,
} from './types';

// EXPO_PUBLIC_API_URL wins (handy for pointing a dev build at a laptop), then app.json extra.apiUrl.
export const API_URL: string = (
  process.env.EXPO_PUBLIC_API_URL ||
  (Constants.expoConfig?.extra as { apiUrl?: string } | undefined)?.apiUrl ||
  'http://localhost:8000'
).replace(/\/$/, '');

export const WS_URL = API_URL.replace(/^http/, 'ws') + '/ws';

export const imageUrl = (id: number) => `${API_URL}/images/${id}`;

let authToken: string | null = null;
export const setAuthToken = (token: string | null) => {
  authToken = token;
};
export const getAuthToken = () => authToken;

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const detail = data?.detail;
    const message = typeof detail === 'string' ? detail : Array.isArray(detail) ? detail[0]?.msg : res.statusText;
    throw new ApiError(res.status, message || 'Something went wrong');
  }
  return data as T;
}

const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
};

export const api = {
  // auth & profile
  register: (b: { name: string; email: string; password: string; role: Role; phone?: string }) =>
    request<AuthResult>('POST', '/auth/register', b),
  login: (b: { email: string; password: string }) => request<AuthResult>('POST', '/auth/login', b),
  me: () => request<Me>('GET', '/me'),
  updateMe: (b: Partial<{ name: string; about: string; phone: string; call_policy: CallPolicy }>) =>
    request<Me>('PATCH', '/me', b),
  searchUsers: (q: string) => request<PublicUser[]>('GET', `/users${qs({ q })}`),

  // listings
  listings: (f: { q?: string; city?: string; land_type?: LandType | ''; min_price?: number; max_price?: number; mine?: boolean } = {}) =>
    request<Listing[]>('GET', `/listings${qs(f)}`),
  listing: (id: number) => request<Listing>('GET', `/listings/${id}`),
  createListing: (b: ListingInput) => request<Listing>('POST', '/listings', b),
  updateListing: (id: number, b: Partial<ListingInput & { status: Listing['status'] }>) =>
    request<Listing>('PATCH', `/listings/${id}`, b),
  deleteListing: (id: number) => request<void>('DELETE', `/listings/${id}`),
  addImage: (id: number, b: { content_type: string; data_base64: string }) =>
    request<Listing>('POST', `/listings/${id}/images`, b),
  removeImage: (id: number, imageId: number) => request<Listing>('DELETE', `/listings/${id}/images/${imageId}`),

  // chat
  openConversation: (user_id: number, listing_id?: number | null) =>
    request<Conversation>('POST', '/conversations', { user_id, listing_id: listing_id ?? null }),
  conversations: () => request<Conversation[]>('GET', '/conversations'),
  conversation: (id: number) => request<Conversation>('GET', `/conversations/${id}`),
  messages: (id: number) => request<Message[]>('GET', `/conversations/${id}/messages`),
  send: (id: number, body: string) => request<Message>('POST', `/conversations/${id}/messages`, { body }),
  markRead: (id: number) => request<void>('POST', `/conversations/${id}/read`),

  // calls
  startCall: (conversation_id: number, kind: CallKind) => request<CallJoin>('POST', '/calls', { conversation_id, kind }),
  acceptCall: (id: number) => request<CallJoin>('POST', `/calls/${id}/accept`),
  rejectCall: (id: number) => request<Call>('POST', `/calls/${id}/reject`),
  endCall: (id: number) => request<Call>('POST', `/calls/${id}/end`),
  calls: () => request<Call[]>('GET', '/calls'),
  ringingCall: () => request<Call | null>('GET', '/calls/incoming/active'),

  // meeting rooms
  rooms: () => request<Room[]>('GET', '/rooms'),
  room: (id: number) => request<Room>('GET', `/rooms/${id}`),
  createRoom: (b: { title: string; listing_id?: number | null; participant_ids: number[]; scheduled_at?: string | null }) =>
    request<Room>('POST', '/rooms', b),
  joinRoom: (id: number) => request<MediaToken>('POST', `/rooms/${id}/join`),
  deleteRoom: (id: number) => request<void>('DELETE', `/rooms/${id}`),
};
