export type Role = 'buyer' | 'seller' | 'broker';
export type CallPolicy = 'everyone' | 'contacts' | 'nobody';
export type LandType = 'agricultural' | 'residential' | 'commercial' | 'industrial';
export type CallKind = 'audio' | 'video';
export type CallStatus = 'ringing' | 'accepted' | 'rejected' | 'missed' | 'cancelled' | 'ended';

export interface PublicUser {
  id: number;
  name: string;
  role: Role;
  about: string;
}

export interface Me extends PublicUser {
  email: string;
  phone: string | null;
  call_policy: CallPolicy;
  created_at: string;
}

export interface AuthResult {
  token: string;
  user: Me;
}

export interface Listing {
  id: number;
  title: string;
  description: string;
  price: number;
  area_sqft: number;
  land_type: LandType;
  address: string;
  city: string;
  lat: number;
  lng: number;
  location_is_approximate: boolean;
  show_exact_location: boolean;
  status: 'active' | 'sold' | 'hidden';
  owner: PublicUser;
  image_ids: number[];
  created_at: string;
  updated_at: string;
  is_mine: boolean;
}

export type ListingInput = Pick<
  Listing,
  'title' | 'description' | 'price' | 'area_sqft' | 'land_type' | 'address' | 'city' | 'lat' | 'lng' | 'show_exact_location'
>;

export interface ListingBrief {
  id: number;
  title: string;
  price: number;
  city: string;
}

export interface Message {
  id: number;
  conversation_id: number;
  sender_id: number;
  kind: 'text' | 'call';
  body: string;
  created_at: string;
  read_at: string | null;
}

export interface Conversation {
  id: number;
  other: PublicUser;
  listing: ListingBrief | null;
  last_message: Message | null;
  unread: number;
  last_message_at: string;
}

export interface Call {
  id: number;
  conversation_id: number;
  kind: CallKind;
  status: CallStatus;
  caller: PublicUser;
  callee: PublicUser;
  created_at: string;
  answered_at: string | null;
  ended_at: string | null;
}

export interface MediaToken {
  livekit_url: string;
  token: string;
  room: string;
}

export interface CallJoin {
  call: Call;
  media: MediaToken;
}

export interface Room {
  id: number;
  title: string;
  host: PublicUser;
  listing: ListingBrief | null;
  scheduled_at: string | null;
  participants: PublicUser[];
  created_at: string;
}
