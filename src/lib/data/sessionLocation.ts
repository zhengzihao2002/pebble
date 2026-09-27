import 'server-only';
import { eq } from 'drizzle-orm';
import { db, neonSql } from '@/db';
import { sessionLocation } from '@/db/schema';

export interface SessionLocation {
  sessionId: string;
  city: string | null;
  region: string | null;
  country: string | null;
}

// Vercel URL-encodes the city (e.g. S%C3%A3o%20Paulo); region and country
// are plain codes. Length-capped: header values are not ours to trust.
function headerValue(raw: string | null, decode: boolean): string | null {
  if (!raw) return null;
  let value = raw;
  if (decode) {
    try { value = decodeURIComponent(raw); } catch { /* keep raw */ }
  }
  value = value.trim().slice(0, 120);
  return value === '' ? null : value;
}

/**
 * Records the approximate location of the session a sign-in or sign-up just
 * created. Called from the /api/auth route AFTER Neon reports success.
 *
 * One HTTP round trip, two statements in one transaction:
 *  1. attach the location to this user's NEWEST session from the last 30
 *     seconds that has none yet (the one this request created);
 *  2. delete this user's rows whose session no longer exists, so the table
 *     never accumulates stale rows.
 * The user is found by email because the session token is deliberately never
 * read or stored. Without any location (local development, or a request
 * Vercel could not place) nothing is written.
 */
export async function recordSessionLocation(email: string, headers: Headers): Promise<void> {
  const city = headerValue(headers.get('x-vercel-ip-city'), true);
  const region = headerValue(headers.get('x-vercel-ip-country-region'), false);
  const country = headerValue(headers.get('x-vercel-ip-country'), false);
  if (!city && !region && !country) return;
  const normalized = email.trim().toLowerCase();

  await neonSql.transaction([
    neonSql`
      INSERT INTO session_location (session_id, user_id, city, region, country)
      SELECT s.id::text, s."userId"::uuid, ${city}, ${region}, ${country}
      FROM neon_auth.session s
      JOIN neon_auth."user" u ON u.id::text = s."userId"::text
      WHERE lower(u.email) = ${normalized}
        AND s."createdAt" > now() - interval '30 seconds'
        AND NOT EXISTS (SELECT 1 FROM session_location l WHERE l.session_id = s.id::text)
      ORDER BY s."createdAt" DESC
      LIMIT 1
      ON CONFLICT (session_id) DO NOTHING
    `,
    neonSql`
      DELETE FROM session_location l
      USING neon_auth."user" u
      WHERE u.id = l.user_id
        AND lower(u.email) = ${normalized}
        AND NOT EXISTS (SELECT 1 FROM neon_auth.session s WHERE s.id::text = l.session_id)
    `,
  ]);
}

/** This user's recorded locations only. */
export async function getSessionLocations(userId: string): Promise<SessionLocation[]> {
  return db
    .select({
      sessionId: sessionLocation.sessionId,
      city: sessionLocation.city,
      region: sessionLocation.region,
      country: sessionLocation.country,
    })
    .from(sessionLocation)
    .where(eq(sessionLocation.userId, userId));
}
