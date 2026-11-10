import { distanceMiles, geocodeZip, listApprovedDistributors, type Coordinates } from '@/server/distributors';
import { errorMessage, jsonError } from '@/server/http';

const MAX_RADIUS_MILES = 500;

/**
 * Public distributor finder.
 *   ?all=1                    every approved distributor
 *   ?zip=85296&radius=50      distributors within `radius` miles of a US ZIP
 *   ?lat=33.3&lng=-111.7&radius=50   same, from browser geolocation
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const radius = Math.min(Math.max(Number(params.get('radius')) || 50, 1), MAX_RADIUS_MILES);

  try {
    const distributors = await listApprovedDistributors();
    if (params.get('all') === '1') return Response.json({ distributors });

    let origin: Coordinates | null = null;
    const zip = params.get('zip');
    const lat = Number(params.get('lat'));
    const lng = Number(params.get('lng'));

    if (zip) {
      origin = await geocodeZip(zip);
      if (!origin) return jsonError(400, 'We could not find that ZIP code. Please check it and try again.');
    } else if (Number.isFinite(lat) && Number.isFinite(lng) && params.has('lat') && params.has('lng')) {
      origin = { lat, lng };
    } else {
      return jsonError(400, 'Provide a zip, lat/lng, or all=1.');
    }

    const located = await Promise.all(
      distributors.map(async (d) => {
        const coords = d.zip ? await geocodeZip(d.zip) : null;
        return coords && origin ? { ...d, distanceMiles: Math.round(distanceMiles(origin, coords)) } : null;
      }),
    );

    const nearby = located
      .filter((d): d is NonNullable<typeof d> => d !== null && (d.distanceMiles ?? Infinity) <= radius)
      .sort((a, b) => (a.distanceMiles ?? 0) - (b.distanceMiles ?? 0));

    return Response.json({ distributors: nearby });
  } catch (err) {
    console.error('[distributors] lookup failed:', err);
    return jsonError(500, 'Could not load distributors', { message: errorMessage(err) });
  }
}
