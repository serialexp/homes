/**
 * Backfill / reconcile existing `train_line` rows against the canonical rail
 * dataset, from the command line. The same logic is also exposed in the admin
 * UI (/admin/reconcile) via app/services/reconcileLinesService.server.ts — this
 * script just drives the shared core functions against the standalone Prisma
 * client and prints progress.
 *
 * Usage (run with tsx; requires MOONSHOT_API_KEY/MOONSHOT_ENDPOINT for the LLM):
 *
 *   # Dry-run reconcile (default) — classify + match, write nothing:
 *   npx tsx src/scripts/reconcileTrainLines.ts
 *   npx tsx src/scripts/reconcileTrainLines.ts --limit 30      # sample first N
 *
 *   # Apply the reconcile updates (also clears stale bus translated_name):
 *   npx tsx src/scripts/reconcileTrainLines.ts --apply
 *
 *   # Merge duplicate rail rows that share a canonical_id (dry-run first!):
 *   npx tsx src/scripts/reconcileTrainLines.ts --merge
 *   npx tsx src/scripts/reconcileTrainLines.ts --merge --apply   # destructive
 *
 * Dry-run is the default for BOTH phases (Rule #6). Nothing is written without
 * --apply.
 */
import prisma from "../prisma.js";
import {
  reconcileAllLines,
  mergeCanonicalDuplicates,
} from "../../app/services/reconcileLinesService.server.js";

interface Args {
  apply: boolean;
  merge: boolean;
  limit: number | null;
}

function parseArgs(argv: string[]): Args {
  const apply = argv.includes("--apply");
  const merge = argv.includes("--merge");
  const limitIdx = argv.indexOf("--limit");
  const limit =
    limitIdx >= 0 && argv[limitIdx + 1] ? parseInt(argv[limitIdx + 1], 10) : null;
  return { apply, merge, limit };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.merge) {
    console.log(
      `\n=== MERGE phase ${args.apply ? "(APPLY — DESTRUCTIVE)" : "(dry-run)"} ===\n`
    );
    const summary = await mergeCanonicalDuplicates(prisma, {
      apply: args.apply,
      onProgress: (p, total, message) => {
        console.error(`  …${p}/${total} ${message}`);
      },
    });
    for (const line of summary.plan) console.log(line);
    console.log("\n--- summary ---");
    console.log(
      `merge groups: ${summary.groups}, rows to delete: ${summary.rowsDeleted}`
    );
    if (!args.apply)
      console.log("\n(dry-run — re-run with --merge --apply to perform the merge)");
  } else {
    console.log(
      `\n=== RECONCILE phase ${args.apply ? "(APPLY)" : "(dry-run)"} ===\n`
    );
    const summary = await reconcileAllLines(prisma, {
      apply: args.apply,
      limit: args.limit,
      onProgress: (p, total, message) => {
        console.log(`  ${p}/${total} ${message}`);
      },
    });
    console.log("\n--- summary ---");
    console.log("by kind:", summary.countsByKind);
    console.log(`canonical matches: ${summary.matched}/${summary.total}`);
    if (args.apply) {
      console.log(
        `rows updated: ${summary.changed}, bus names cleared: ${summary.busCleared}`
      );
    } else {
      console.log("\n(dry-run — re-run with --apply to write)");
    }
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
