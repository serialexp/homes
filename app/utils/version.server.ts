import { execSync } from "node:child_process";

/**
 * Resolves the running version (git sha + build time).
 *
 * In production the values are baked into the Docker image as the GIT_SHA /
 * BUILD_TIME env vars (see Dockerfile + .github/workflows/docker.yml). In local
 * dev there is no GIT_SHA, so we fall back to asking the local git checkout.
 * Resolved once at module load — the sha of a running process never changes.
 */
function resolveSha(): string {
  const fromEnv = process.env.GIT_SHA?.trim();
  if (fromEnv && fromEnv !== "unknown") {
    return fromEnv.slice(0, 7);
  }
  try {
    return execSync("git rev-parse --short HEAD", {
      stdio: ["ignore", "pipe", "ignore"],
    })
      .toString()
      .trim();
  } catch {
    return "dev";
  }
}

const sha = resolveSha();
const buildTime = process.env.BUILD_TIME?.trim() || null;

export const VERSION = {
  /** Short git sha, or "dev" when running from an unknown/local source. */
  sha,
  /** ISO build timestamp baked at image build time, or null in dev. */
  buildTime,
  /** Link to the commit on GitHub, or null when the sha is unknown. */
  commitUrl:
    sha && sha !== "dev"
      ? `https://github.com/serialexp/homes/commit/${sha}`
      : null,
};
