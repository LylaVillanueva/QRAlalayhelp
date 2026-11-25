import { env } from "@/config/env";
import { logger } from "@/utils/logger";

/**
 * Reverse geocoding (coordinates -> "1372 España Boulevard, Sampaloc,
 * Manila") via OpenStreetMap Nominatim. Its usage policy allows at most one
 * request per second with an identifying User-Agent, so lookups are queued
 * and spaced out. Failures resolve to null: an address is a convenience,
 * never something an alert should wait on or fail over.
 */
const MIN_GAP_MS = 1100;

interface GeocodeResult {
  name?: string;
  category?: string;
  display_name?: string;
  address?: Record<string, string>;
}
let queue: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

export function reverseGeocode(latitude: number, longitude: number): Promise<string | null> {
  const task = queue.then(async () => {
    const wait = lastRequestAt + MIN_GAP_MS - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    lastRequestAt = Date.now();
    return lookup(latitude, longitude);
  });
  queue = task.catch(() => null);
  return task;
}

async function lookup(latitude: number, longitude: number): Promise<string | null> {
  try {
    const url = `${env.geocoder.url}/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${latitude}&lon=${longitude}`;
    const res = await fetch(url, {
      headers: { "User-Agent": env.geocoder.userAgent, "Accept-Language": "en" },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Geocoder responded ${res.status}`);
    const json = (await res.json()) as GeocodeResult;
    // scan_address / live_address are CHARACTER VARYING(500).
    return (formatAddress(json) ?? shortenDisplayName(json?.display_name))?.slice(0, 500) ?? null;
  } catch (err) {
    logger.warn({ err }, "geocode.reverse_failed");
    return null;
  }
}

// "<number> <street>, <barangay>, <district>, <city>" — the parts a
// responder actually navigates by, without region/postcode/country noise.
// With no house number, a named place at the spot (a shop, school, church)
// is the next best pointer: "Near Colorpoint Classic, España Boulevard, …".
function formatAddress(result: GeocodeResult): string | null {
  const address = result.address;
  if (!address) return null;
  const street = [address.house_number, address.road].filter(Boolean).join(" ");
  const landmark = !address.house_number && result.name && result.category !== "highway" && result.name !== address.road
    ? `Near ${result.name}` : null;
  const barangay = [address.quarter, address.neighbourhood].find((part) => part && /^(barangay|brgy)\b/i.test(part));
  const area = address.suburb || address.village || (barangay ? null : address.quarter || address.neighbourhood);
  const city = address.city || address.town || address.municipality || address.county;
  const parts = [...new Set([landmark, street, barangay, area, city].filter(Boolean))];
  return parts.length ? parts.join(", ") : null;
}

function shortenDisplayName(displayName: string | undefined): string | null {
  return displayName ? displayName.split(", ").slice(0, 3).join(", ") : null;
}

/** Straight-line distance in metres, good enough for "has it moved". */
export function distanceMeters(aLat: number, aLng: number, bLat: number, bLng: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}
