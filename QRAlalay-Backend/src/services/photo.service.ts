import { randomUUID } from "node:crypto";
import { pool, supabaseAdmin } from "@/db/pool";
import { AppError } from "@/utils/errors";
import { logger } from "@/utils/logger";
import { writeAuditLog } from "@/services/audit.service";
import type { AuthUser } from "@/types/domain";

/**
 * Profile photos for residents and user accounts.
 *
 * Photos are of vulnerable residents, so they live in a PRIVATE Supabase
 * Storage bucket. The database only stores each photo's path
 * (residents.photo_path / users.photo_path); clients get short-lived signed
 * URLs, and only in responses the caller is already allowed to see.
 */
export const PHOTO_BUCKET = "profile-photos";
const MAX_PHOTO_BYTES = 700 * 1024; // the app sends ~600px JPEGs, far below this
const SIGNED_URL_SECONDS = 60 * 60;
// Reuse a signed URL for most of its life so the app's 5–15 s refreshes see
// the same URL and don't re-download every photo each time.
const SIGNED_URL_REUSE_MS = 45 * 60 * 1000;

export interface PhotoStorage {
  upload(path: string, bytes: Buffer, contentType: string): Promise<void>;
  remove(paths: string[]): Promise<void>;
  signedUrls(paths: string[], expiresInSeconds: number): Promise<Record<string, string>>;
}

let bucketReady: Promise<void> | null = null;

function ensureBucket() {
  bucketReady ??= (async () => {
    const { data } = await supabaseAdmin.storage.getBucket(PHOTO_BUCKET);
    if (data) return;
    const { error } = await supabaseAdmin.storage.createBucket(PHOTO_BUCKET, {
      public: false,
      fileSizeLimit: MAX_PHOTO_BYTES,
      allowedMimeTypes: ["image/jpeg", "image/png", "image/webp"],
    });
    if (error && !/already exists/i.test(error.message)) throw error;
  })().catch((err) => {
    bucketReady = null; // retry on the next upload
    throw err;
  });
  return bucketReady;
}

const supabaseStorage: PhotoStorage = {
  async upload(path, bytes, contentType) {
    await ensureBucket();
    const { error } = await supabaseAdmin.storage.from(PHOTO_BUCKET).upload(path, bytes, { contentType, upsert: false });
    if (error) {
      logger.error({ err: error }, "photo.upload_failed");
      throw AppError.internal("Could not save the photo.", "PHOTO_UPLOAD_FAILED");
    }
  },
  async remove(paths) {
    if (!paths.length) return;
    const { error } = await supabaseAdmin.storage.from(PHOTO_BUCKET).remove(paths);
    if (error) logger.warn({ err: error, paths }, "photo.remove_failed"); // an orphaned file is harmless
  },
  async signedUrls(paths, expiresInSeconds) {
    const { data, error } = await supabaseAdmin.storage.from(PHOTO_BUCKET).createSignedUrls(paths, expiresInSeconds);
    if (error) {
      logger.warn({ err: error }, "photo.sign_failed");
      return {};
    }
    const urls: Record<string, string> = {};
    for (const item of data ?? []) if (item.path && item.signedUrl) urls[item.path] = item.signedUrl;
    return urls;
  },
};

let storage: PhotoStorage = supabaseStorage;
/** Tests swap in an in-memory store so nothing touches real storage. */
export function setPhotoStorage(next: PhotoStorage) {
  storage = next;
  signedUrlCache.clear();
}

/** Accepts a base64 image (optionally a data: URL) and checks it really is a small JPEG, PNG or WebP. */
export function decodePhoto(image: string): { bytes: Buffer; contentType: string; extension: string } {
  const base64 = image.replace(/^data:image\/[a-z+]+;base64,/i, "");
  const bytes = Buffer.from(base64, "base64");
  if (bytes.length < 100) throw AppError.badRequest("That doesn't look like a photo.", "INVALID_PHOTO");
  if (bytes.length > MAX_PHOTO_BYTES) throw AppError.badRequest("Photo is too large. Please choose a smaller one.", "PHOTO_TOO_LARGE");
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { bytes, contentType: "image/jpeg", extension: "jpg" };
  if (bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { bytes, contentType: "image/png", extension: "png" };
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") {
    return { bytes, contentType: "image/webp", extension: "webp" };
  }
  throw AppError.badRequest("Use a JPEG, PNG or WebP photo.", "INVALID_PHOTO");
}

const signedUrlCache = new Map<string, { url: string; reuseUntil: number }>();

/**
 * Replaces `pathKey` on each row with a signed URL under `urlKey` (null when
 * there is no photo). One storage call signs every uncached path at once.
 */
export async function attachPhotoUrls<T extends Record<string, any>>(
  rows: T[],
  keys: { pathKey: string; urlKey: string }[] = [{ pathKey: "photo_path", urlKey: "photo_url" }]
): Promise<T[]> {
  const now = Date.now();
  const missing = new Set<string>();
  for (const row of rows) for (const { pathKey } of keys) {
    const path = row?.[pathKey];
    if (path && !(signedUrlCache.get(path)?.reuseUntil! > now)) missing.add(path);
  }
  if (missing.size) {
    const urls = await storage.signedUrls([...missing], SIGNED_URL_SECONDS);
    for (const [path, url] of Object.entries(urls)) signedUrlCache.set(path, { url, reuseUntil: now + SIGNED_URL_REUSE_MS });
  }
  for (const row of rows) for (const { pathKey, urlKey } of keys) {
    if (!row || !(pathKey in row)) continue;
    const path = row[pathKey];
    (row as any)[urlKey] = path ? signedUrlCache.get(path)?.url ?? null : null;
    delete (row as any)[pathKey];
  }
  return rows;
}

export async function attachPhotoUrl<T extends Record<string, any>>(row: T, keys?: { pathKey: string; urlKey: string }[]) {
  return (await attachPhotoUrls([row], keys))[0];
}

// ---------------------------------------------------------------------------
// Who may change which photo

async function residentForPhoto(residentId: string, actor: AuthUser) {
  const { rows } = await pool.query(`select id, barangay_id, guardian_id, photo_path from residents where id = $1`, [residentId]);
  const resident = rows[0];
  if (!resident) throw AppError.notFound("Resident not found", "RESIDENT_NOT_FOUND");
  const isOfficial = actor.role === "barangay_official" && actor.barangayId === resident.barangay_id;
  const isGuardian = actor.role === "guardian" && actor.id === resident.guardian_id;
  if (!isOfficial && !isGuardian) {
    throw AppError.forbidden("Only a barangay official or the resident's guardian can change this photo", "PHOTO_ACCESS_DENIED");
  }
  return resident;
}

async function userForPhoto(userId: string, actor: AuthUser) {
  const { rows } = await pool.query(`select id, barangay_id, photo_path from users where id = $1`, [userId]);
  const user = rows[0];
  if (!user) throw AppError.notFound("Account not found", "ACCOUNT_NOT_FOUND");
  const isSelf = actor.id === user.id;
  const isOfficial = actor.role === "barangay_official" && !!actor.barangayId && actor.barangayId === user.barangay_id;
  if (!isSelf && !isOfficial) throw AppError.forbidden("You can only change your own photo", "PHOTO_ACCESS_DENIED");
  return user;
}

// ---------------------------------------------------------------------------
// Set / remove

async function replacePhoto(kind: "residents" | "users", id: string, oldPath: string | null, image: string | null, actor: AuthUser) {
  let newPath: string | null = null;
  if (image) {
    const photo = decodePhoto(image);
    // A new file name every time, so phones never show a cached old photo.
    newPath = `${kind}/${id}/${randomUUID()}.${photo.extension}`;
    await storage.upload(newPath, photo.bytes, photo.contentType);
  }
  try {
    await pool.query(`update ${kind} set photo_path = $2 where id = $1`, [id, newPath]);
  } catch (err) {
    if (newPath) await storage.remove([newPath]);
    throw err;
  }
  if (oldPath) await storage.remove([oldPath]);

  await writeAuditLog({
    actorId: actor.id,
    actorRole: actor.role,
    action: `${kind === "residents" ? "resident" : "user"}.photo_${image ? "updated" : "removed"}`,
    entityType: kind === "residents" ? "resident" : "user",
    entityId: id,
  });
  return attachPhotoUrl({ photo_path: newPath });
}

export async function setResidentPhoto(residentId: string, image: string | null, actor: AuthUser) {
  const resident = await residentForPhoto(residentId, actor);
  return replacePhoto("residents", resident.id, resident.photo_path, image, actor);
}

export async function setUserPhoto(userId: string, image: string | null, actor: AuthUser) {
  const user = await userForPhoto(userId, actor);
  return replacePhoto("users", user.id, user.photo_path, image, actor);
}

/** The signed-in account's own photo, for GET /api/users/profile. */
export async function ownPhotoUrl(userId: string) {
  const { rows } = await pool.query(`select photo_path from users where id = $1`, [userId]);
  const row: Record<string, any> = { photo_path: rows[0]?.photo_path ?? null };
  return (await attachPhotoUrl(row)).photo_url as string | null;
}
