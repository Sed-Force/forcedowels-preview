import 'server-only';
import { sql } from '@/server/db';

export interface PublicDistributor {
  id: number;
  company: string;
  phone: string | null;
  website: string | null;
  territory: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  distanceMiles?: number;
}

interface Row {
  id: number;
  company_name: string;
  phone: string | null;
  territory: string | null;
  notes: string | null;
}

/** Application details are stored as JSON in `notes`; admin-created rows may hold free text. */
function parseDetails(notes: string | null): Record<string, string> {
  if (!notes) return {};
  try {
    const parsed = JSON.parse(notes);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Approved distributors only; contact e-mail and applicant details are never exposed. */
export async function listApprovedDistributors(): Promise<PublicDistributor[]> {
  if (!sql) throw new Error('Database not configured');
  const rows = (await sql`
    SELECT id, company_name, phone, territory, notes
    FROM distributors
    WHERE status = 'approved'
    ORDER BY company_name ASC
  `) as Row[];

  return rows.map((row) => {
    const d = parseDetails(row.notes);
    return {
      id: row.id,
      company: row.company_name,
      phone: row.phone,
      website: d.website || null,
      territory: row.territory,
      city: d.city || null,
      state: d.state || null,
      zip: d.zip || null,
      country: d.country || null,
    };
  });
}

export interface Coordinates { lat: number; lng: number }

const zipCache = new Map<string, Coordinates | null>();

/** Resolve a US ZIP code to coordinates (zippopotam.us, no API key). */
export async function geocodeZip(zip: string): Promise<Coordinates | null> {
  const key = zip.trim().slice(0, 5);
  if (!/^\d{5}$/.test(key)) return null;
  if (zipCache.has(key)) return zipCache.get(key) ?? null;

  try {
    const res = await fetch(`https://api.zippopotam.us/us/${key}`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`geocode ${res.status}`);
    const data = await res.json();
    const place = data?.places?.[0];
    const coords = place ? { lat: Number(place.latitude), lng: Number(place.longitude) } : null;
    zipCache.set(key, coords);
    return coords;
  } catch (err) {
    console.error('[distributors] ZIP geocode failed:', key, err);
    return null; // not cached, so a transient failure can recover
  }
}

export function distanceMiles(a: Coordinates, b: Coordinates): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}
