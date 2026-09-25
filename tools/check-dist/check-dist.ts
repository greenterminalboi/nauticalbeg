// Checks a production build before it's deployed to Cloudflare Pages
// (016 contracts/pipeline.md, check job step 7):
// - no file over Pages' 25 MiB per-file limit (a too-big file would
//   otherwise fail the upload, or worse, deploy a site missing a piece);
// - no image/texture files, so no Paradox art can ship by accident
//   (constitution Technical Constraints, 016 research R10);
// - `_headers` is present with both cross-origin isolation headers.
//
// Usage: tsx tools/check-dist/check-dist.ts dist
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

export const MAX_FILE_BYTES = 25 * 1024 * 1024; // 26,214,400
const FORBIDDEN_EXTENSIONS = [".png", ".jpg", ".jpeg", ".webp", ".dds", ".tga"];
const REQUIRED_HEADERS = ["Cross-Origin-Opener-Policy", "Cross-Origin-Embedder-Policy"];

function listFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

/** Every problem found in `dir`, as a human-readable line; empty if none. */
export function checkDist(dir: string): string[] {
  if (!existsSync(dir)) return [`${dir} does not exist — run the build first.`];
  const problems: string[] = [];

  for (const file of listFiles(dir)) {
    const rel = path.relative(dir, file);
    const size = statSync(file).size;
    if (size > MAX_FILE_BYTES) {
      problems.push(
        `${rel} is ${(size / 1024 / 1024).toFixed(1)} MiB, over the host's 25 MiB per-file limit.`,
      );
    }
    if (FORBIDDEN_EXTENSIONS.includes(path.extname(file).toLowerCase())) {
      problems.push(`${rel} is an image/texture file; game art must not be shipped.`);
    }
  }

  const headersFile = path.join(dir, "_headers");
  if (!existsSync(headersFile)) {
    problems.push("_headers is missing (it should be copied from public/_headers).");
  } else {
    const headers = readFileSync(headersFile, "utf8");
    for (const name of REQUIRED_HEADERS) {
      if (!headers.includes(`${name}:`)) problems.push(`_headers does not set ${name}.`);
    }
  }

  return problems;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const dir = process.argv[2] ?? "dist";
  const problems = checkDist(dir);
  if (problems.length > 0) {
    console.error(`check-dist: ${problems.length} problem(s) in ${dir}:`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(`check-dist: ${dir} is ready to deploy.`);
}
