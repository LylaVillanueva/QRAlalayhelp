/**
 * One-off: fill in readable addresses for incidents recorded before reverse
 * geocoding existed (or whose lookup failed). Safe to re-run — it only
 * touches incidents whose address is still empty, unless --all is passed
 * (e.g. after improving the address format) to redo every address.
 *
 *   npm run backfill:addresses
 *   npm run backfill:addresses -- --all
 */
import { pool } from "../src/db/pool";
import { reverseGeocode } from "../src/services/geocode.service";

const redoAll = process.argv.includes("--all");

async function main() {
  const { rows: scans } = await pool.query(
    `select id, scan_latitude, scan_longitude from incidents
     where scan_latitude is not null and scan_longitude is not null and (scan_address is null or $1)
     order by created_at desc`,
    [redoAll]
  );
  const { rows: lives } = await pool.query(
    `select token, incident_id as id, latitude as live_latitude, longitude as live_longitude from incident_location_shares
     where latitude is not null and longitude is not null and (address is null or $1)
     order by created_at desc`,
    [redoAll]
  );
  console.log(`Scan addresses to fill: ${scans.length}, live addresses to fill: ${lives.length}`);

  let filled = 0;
  for (const row of scans) {
    const address = await reverseGeocode(row.scan_latitude, row.scan_longitude);
    console.log(`scan ${row.id}: ${address ?? "(not found)"}`);
    if (!address) continue;
    await pool.query(`update incidents set scan_address = $2 where id = $1`, [row.id, address]);
    filled++;
  }
  for (const row of lives) {
    const address = await reverseGeocode(row.live_latitude, row.live_longitude);
    console.log(`live ${row.id}: ${address ?? "(not found)"}`);
    if (!address) continue;
    await pool.query(
      `update incident_location_shares set address = $2, address_latitude = $3, address_longitude = $4
       where token = $1`,
      [row.token, address, row.live_latitude, row.live_longitude]
    );
    filled++;
  }
  console.log(`Done: ${filled} of ${scans.length + lives.length} addresses filled.`);
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => pool.end());
