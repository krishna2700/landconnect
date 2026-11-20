// WhatsApp-inspired palette.
export const colors = {
  primary: '#008069', // header teal-green
  primaryDark: '#075E54',
  accent: '#25D366', // call / send green
  danger: '#EA0038',
  bg: '#FFFFFF',
  chatBg: '#EFEAE2',
  bubbleMine: '#D9FDD3',
  bubbleTheirs: '#FFFFFF',
  text: '#111B21',
  textMuted: '#667781',
  border: '#E9EDEF',
  chip: '#E7FCE3',
  badge: '#25D366',
  tick: '#53BDEB',
  card: '#F7F8FA',
};

export const roleLabel: Record<string, string> = { buyer: 'Buyer', seller: 'Seller', broker: 'Broker' };
export const roleColor: Record<string, string> = { buyer: '#1E88E5', seller: '#008069', broker: '#8E24AA' };

export const landTypeLabel: Record<string, string> = {
  agricultural: 'Agricultural',
  residential: 'Residential',
  commercial: 'Commercial',
  industrial: 'Industrial',
};

export function formatPrice(inr: number): string {
  if (inr >= 1_00_00_000) return `₹${(inr / 1_00_00_000).toFixed(2).replace(/\.00$/, '')} Cr`;
  if (inr >= 1_00_000) return `₹${(inr / 1_00_000).toFixed(1).replace(/\.0$/, '')} L`;
  return `₹${inr.toLocaleString('en-IN')}`;
}

export function formatArea(sqft: number): string {
  const acres = sqft / 43560;
  const n = acres.toFixed(acres >= 10 ? 0 : 2).replace(/\.00$/, '');
  return acres >= 0.5 ? `${n} ${n === '1' ? 'acre' : 'acres'}` :`${Math.round(sqft).toLocaleString('en-IN')} sq ft`;
}

export function timeLabel(iso: string): string {
  const d = new Date(iso.endsWith('Z') || iso.includes('+') ? iso : iso + 'Z');
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const yesterday = new Date(now.getTime() - 86400000);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { day: '2-digit', month: 'short' });
}
