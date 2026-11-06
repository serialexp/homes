/**
 * Re-derives region and province for stored properties from their prefecture (`state`),
 * which comes from the listing's address. Listings scraped through a search section used
 * to take that section's region and province, so a Tokyo listing found by a Kanagawa
 * search was stored as Kanagawa.
 *
 * Dry run by default; nothing is written without --write.
 *   node --import tsx src/scripts/backfillPropertyLocation.ts           # report only
 *   node --import tsx src/scripts/backfillPropertyLocation.ts --write   # apply
 */
import prisma from "../../app/utils/db.server.js";
import { locationFromAddress, prefectureCode } from "../../app/utils/parseUtils.js";

const BATCH_SIZE = 1000;
const write = process.argv.includes("--write");

async function main() {
  let lastId = 0;
  let scanned = 0;
  let unresolved = 0;
  let changed = 0;
  let applied = 0;
  const transitions = new Map<string, number>();

  for (;;) {
    const rows = await prisma.property.findMany({
      where: { id: { gt: lastId } },
      select: { id: true, state: true, region: true, province: true },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
    });
    if (rows.length === 0) break;
    lastId = rows[rows.length - 1].id;
    scanned += rows.length;

    const updates: { id: number; region: string; province: string }[] = [];
    for (const row of rows) {
      if (prefectureCode(row.state) === null) {
        unresolved++;
        continue;
      }
      const derived = locationFromAddress(row.state, { region: row.region, province: row.province });
      if (derived.region === row.region && derived.province === row.province) continue;

      changed++;
      updates.push({ id: row.id, region: derived.region, province: derived.province });
      const label = `${row.region}/${row.province} -> ${derived.region}/${derived.province} (${row.state})`;
      transitions.set(label, (transitions.get(label) ?? 0) + 1);
    }

    if (write && updates.length > 0) {
      await prisma.$transaction(
        updates.map(u => prisma.property.update({
          where: { id: u.id },
          data: { region: u.region, province: u.province },
        }))
      );
      applied += updates.length;
    }
    console.log(`scanned ${scanned}, changed ${changed}${write ? `, applied ${applied}` : ""}`);
  }

  console.log(`\nScanned ${scanned} properties; ${changed} need a new region/province; ${unresolved} have no known prefecture and are left alone.`);
  console.log("Changes (old region/province -> new, prefecture):");
  for (const [label, count] of [...transitions].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(count).padStart(8)}  ${label}`);
  }
  console.log(write ? `Applied ${applied} updates.` : "Dry run: nothing written. Re-run with --write to apply.");
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
