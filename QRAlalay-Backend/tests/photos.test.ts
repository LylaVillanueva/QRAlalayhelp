import test from 'node:test';
import assert from 'node:assert/strict';

process.env.SUPABASE_URL = 'https://test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-key';
process.env.DATABASE_URL = 'postgres://test:test@localhost/test';
process.env.JWT_ACCESS_SECRET = 'test-access';
process.env.JWT_REFRESH_SECRET = 'test-refresh';

const jpeg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200)]).toString('base64');

function memoryStorage() {
  const files = new Set<string>();
  let signCalls = 0;
  return {
    files,
    get signCalls() { return signCalls; },
    async upload(path: string) { files.add(path); },
    async remove(paths: string[]) { for (const p of paths) files.delete(p); },
    async signedUrls(paths: string[]) {
      signCalls++;
      return Object.fromEntries(paths.map((p) => [p, `https://signed.example/${p}?n=${signCalls}`]));
    },
  };
}

test('only real, small JPEG/PNG/WebP images are accepted', async () => {
  const { decodePhoto } = await import('../src/services/photo.service');
  assert.equal(decodePhoto(jpeg).contentType, 'image/jpeg');
  assert.equal(decodePhoto(`data:image/jpeg;base64,${jpeg}`).extension, 'jpg');
  assert.throws(() => decodePhoto(Buffer.from('<script>alert(1)</script>'.repeat(10)).toString('base64')), /JPEG, PNG or WebP/);
  assert.throws(() => decodePhoto(Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(800 * 1024)]).toString('base64')), /too large/);
});

test('resident photos: only an official of that barangay or the guardian can change them', async (t) => {
  const { pool } = await import('../src/db/pool');
  const photos = await import('../src/services/photo.service');
  const storage = memoryStorage();
  storage.files.add('residents/r1/old.jpg');
  photos.setPhotoStorage(storage);
  const updates: any[][] = [];
  t.mock.method(pool, 'query', async (sql: string, params: any[] = []) => {
    if (sql.includes('from residents where id')) return { rows: [{ id: 'r1', barangay_id: 'b1', guardian_id: 'g1', photo_path: 'residents/r1/old.jpg' }] };
    if (sql.startsWith('update residents set photo_path')) updates.push(params);
    return { rows: [] };
  });

  await assert.rejects(photos.setResidentPhoto('r1', jpeg, { id: 'o2', role: 'barangay_official', barangayId: 'other' } as any), /Only a barangay official/);
  await assert.rejects(photos.setResidentPhoto('r1', jpeg, { id: 'g2', role: 'guardian' } as any), /Only a barangay official/);
  await assert.rejects(photos.setResidentPhoto('r1', jpeg, { id: 'resp', role: 'barangay_responder', barangayId: 'b1' } as any), /Only a barangay official/);
  assert.equal(updates.length, 0);

  const result: any = await photos.setResidentPhoto('r1', jpeg, { id: 'g1', role: 'guardian' } as any);
  assert.match(updates[0][1], /^residents\/r1\/[0-9a-f-]+\.jpg$/);
  assert.ok(storage.files.has(updates[0][1]), 'new photo stored');
  assert.ok(!storage.files.has('residents/r1/old.jpg'), 'old photo removed');
  assert.match(result.photo_url, /^https:\/\/signed\.example\/residents\/r1\//);
  assert.ok(!('photo_path' in result), 'storage path not exposed');
});

test('account photos: yourself, or an official of the same barangay', async (t) => {
  const { pool } = await import('../src/db/pool');
  const photos = await import('../src/services/photo.service');
  photos.setPhotoStorage(memoryStorage());
  t.mock.method(pool, 'query', async (sql: string) =>
    sql.includes('from users where id') ? { rows: [{ id: 'u1', barangay_id: 'b1', photo_path: null }] } : { rows: [] });
  await assert.rejects(photos.setUserPhoto('u1', jpeg, { id: 'u2', role: 'guardian' } as any), /your own photo/);
  await assert.rejects(photos.setUserPhoto('u1', jpeg, { id: 'o9', role: 'barangay_official', barangayId: 'b2' } as any), /your own photo/);
  assert.ok((await photos.setUserPhoto('u1', jpeg, { id: 'u1', role: 'guardian' } as any) as any).photo_url);
  assert.ok((await photos.setUserPhoto('u1', jpeg, { id: 'o1', role: 'barangay_official', barangayId: 'b1' } as any) as any).photo_url);
  assert.equal((await photos.setUserPhoto('u1', null, { id: 'u1', role: 'guardian' } as any) as any).photo_url, null);
});

test('signed links are reused across refreshes and paths are never sent', async () => {
  const photos = await import('../src/services/photo.service');
  const storage = memoryStorage();
  photos.setPhotoStorage(storage);
  const first = await photos.attachPhotoUrls([{ id: 1, photo_path: 'residents/a.jpg' }, { id: 2, photo_path: null }]);
  const second = await photos.attachPhotoUrls([{ id: 1, photo_path: 'residents/a.jpg' }]);
  assert.equal(first[0].photo_url, second[0].photo_url);
  assert.equal(first[1].photo_url, null);
  assert.equal(storage.signCalls, 1);
  assert.ok(!('photo_path' in first[0]));
});
