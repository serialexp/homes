/**
 * Measures memory and time for one retrieval run against DATABASE_URL.
 *
 * Deliberate runs only, never in CI, and only against a disposable database: the
 * run writes listings and scrapes suumo.jp. For representative scale, load
 * src/scripts/retrieveMemoryBench.seed.sql first.
 *
 *   TYPE=030 pnpm bench:retrieve-memory   # purchase (030 = land)
 *   TYPE=040 pnpm bench:retrieve-memory   # rental
 *
 * Optional: PROVINCE (default 47, Okinawa), DURATION_MS (default 40000). The run
 * is cancelled after DURATION_MS so a large crawl stays bounded; the load phase
 * is what this measures.
 */
import RetrieveCommand from '../commands/RetrieveCommand.js';

// The project's global `process` type omits memoryUsage (bun-types shadows @types/node),
// so read it from the runtime object.
const { memoryUsage } = (globalThis as unknown as { process: { memoryUsage: () => NodeJS.MemoryUsage } }).process;

const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(0)} MB`;

const type = process.env.TYPE;
if (!type) {
  throw new Error('Set TYPE to 030 (purchase) or 040 (rental)');
}
function requireGc(): () => void {
  const gc = (globalThis as { gc?: () => void }).gc;
  if (!gc) {
    throw new Error('Run with NODE_OPTIONS=--expose-gc (npm run bench:retrieve-memory sets it)');
  }
  return gc;
}

const gc = requireGc();
const province = process.env.PROVINCE ?? '47';
const durationMs = Number(process.env.DURATION_MS ?? 40000);

function settledMemory() {
  gc();
  return memoryUsage();
}

async function main() {
  const command = new RetrieveCommand();
  const baseline = settledMemory();

  const peak = { rss: 0, heapUsed: 0 };
  const sampler = setInterval(() => {
    const usage = memoryUsage();
    peak.rss = Math.max(peak.rss, usage.rss);
    peak.heapUsed = Math.max(peak.heapUsed, usage.heapUsed);
  }, 100);

  // Emitted once the run has set up its work and before any page is fetched
  let afterSetup = null as NodeJS.MemoryUsage | null;
  command.on('sections-to-fetch', () => {
    afterSetup = settledMemory();
  });

  const cancelTimer = setTimeout(() => {
    command.cancelled = true;
  }, durationMs);
  const started = Date.now();
  try {
    await command.execute({ type, province });
  } finally {
    clearTimeout(cancelTimer);
    clearInterval(sampler);
  }
  const finished = settledMemory();

  console.log(`type ${type}, province ${province}`);
  console.log(`baseline:          heap ${mb(baseline.heapUsed)}, rss ${mb(baseline.rss)}`);
  console.log(`after setup:       heap ${mb(afterSetup?.heapUsed ?? 0)}, rss ${mb(afterSetup?.rss ?? 0)}`);
  console.log(`peak during run:   heap ${mb(peak.heapUsed)}, rss ${mb(peak.rss)}`);
  console.log(`after run (gc'd):  heap ${mb(finished.heapUsed)}, rss ${mb(finished.rss)}`);
  console.log(`elapsed: ${((Date.now() - started) / 1000).toFixed(1)}s`);
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
