import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  mkdir,
  copyFile,
  writeFile,
  readFile,
  rm,
  access,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const script = join(dirname(fileURLToPath(import.meta.url)), "package.mjs");
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "ultima-package-"));
  for (const folder of [
    "scripts",
    "src",
    "tests",
    "dist/assets",
    "node_modules/three",
    "node_modules/vite",
  ])
    await mkdir(join(root, folder), { recursive: true });
  await copyFile(script, join(root, "scripts/package.mjs"));
  for (const file of [
    "README.md",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "index.html",
    ".gitignore",
    ".npmrc",
  ])
    await writeFile(join(root, file), "fixture");
  await writeFile(
    join(root, "node_modules/three/LICENSE"),
    "The MIT License\nCopyright Three authors\nPermission example --> text",
  );
  await writeFile(
    join(root, "node_modules/vite/LICENSE.md"),
    "# Vite core license\nMIT License\nCopyright Vite contributors\n# Licenses of bundled dependencies\nNot a runtime dependency",
  );
  await writeFile(
    join(root, "dist/index.html"),
    '<!doctype html><html><head><script type="module" src="/assets/game.js"></script><link rel="stylesheet" href="/assets/game.css"></head><body></body></html>',
  );
  await writeFile(
    join(root, "dist/assets/game.js"),
    "globalThis.gameReady = true;",
  );
  await writeFile(join(root, "dist/assets/game.css"), "body { color: green; }");
  return root;
}
function run(root) {
  return spawnSync(process.execPath, [join(root, "scripts/package.mjs")], {
    encoding: "utf8",
  });
}
function readStoredZip(bytes) {
  let offset = 0;
  const result = new Map();
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    assert.equal(bytes.readUInt16LE(offset + 8), 0);
    const length = bytes.readUInt32LE(offset + 18),
      nameLength = bytes.readUInt16LE(offset + 26),
      extraLength = bytes.readUInt16LE(offset + 28);
    const name = bytes
        .subarray(offset + 30, offset + 30 + nameLength)
        .toString("utf8"),
      start = offset + 30 + nameLength + extraLength;
    result.set(name, bytes.subarray(start, start + length).toString("utf8"));
    offset = start + length;
  }
  assert.equal(bytes.readUInt32LE(offset), 0x02014b50);
  return result;
}

test("portable package embeds runtime notices in standalone and ZIP, includes sources and is reproducible", async () => {
  const root = await fixture();
  try {
    const first = run(root);
    assert.equal(first.status, 0, first.stderr);
    const zip = await readFile(join(root, "release/Ultima-Zona.zip")),
      html = await readFile(join(root, "release/JOGAR.html"), "utf8"),
      notices = await readFile(
        join(root, "release/THIRD-PARTY-NOTICES.txt"),
        "utf8",
      ),
      entries = readStoredZip(zip);
    assert(notices.includes("Copyright Three authors"));
    assert(notices.includes("Copyright Vite contributors"));
    assert(notices.includes("Permission example --> text"));
    assert(!notices.includes("Not a runtime dependency"));
    assert(html.includes("Permission example --&gt; text"));
    assert(html.includes("Copyright Three authors"));
    assert(html.includes("Copyright Vite contributors"));
    assert(html.includes("globalThis.gameReady = true"));
    assert(!html.includes('src="/assets/'));
    assert.equal(entries.get("Ultima-Zona/THIRD-PARTY-NOTICES.txt"), notices);
    assert.equal(entries.get("Ultima-Zona/JOGAR.html"), html);
    assert(entries.has("Ultima-Zona/codigo-fonte/README.md"));
    const second = run(root);
    assert.equal(second.status, 0, second.stderr);
    assert.deepEqual(
      await readFile(join(root, "release/Ultima-Zona.zip")),
      zip,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("missing required source aborts packaging instead of silently omitting it", async () => {
  const root = await fixture();
  try {
    await rm(join(root, "README.md"));
    const result = run(root);
    assert.notEqual(result.status, 0);
    assert(result.stderr.includes("README.md"));
    await assert.rejects(access(join(root, "release/Ultima-Zona.zip")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("missing runtime license aborts packaging", async () => {
  const root = await fixture();
  try {
    await rm(join(root, "node_modules/three/LICENSE"));
    const result = run(root);
    assert.notEqual(result.status, 0);
    assert(result.stderr.includes("LICENSE"));
    await assert.rejects(access(join(root, "release/Ultima-Zona.zip")));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
