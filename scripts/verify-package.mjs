/** Smoke-test the standalone page; --file additionally checks file:// on unmanaged browsers. */
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = resolve(
  process.argv.find((arg) => arg.endsWith(".html")) ??
    join(root, "release/JOGAR.html"),
);
const html = await readFile(file);
const server = createServer((_, response) => {
  response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  response.end(html);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address(),
  url = process.argv.includes("--file")
    ? pathToFileURL(file).href
    : `http://127.0.0.1:${address.port}/`;
let browser;
try {
  browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
    headless: true,
    args: [
      "--no-sandbox",
      "--use-gl=angle",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  });
  const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    }),
    page = await context.newPage(),
    errors = [],
    network = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.url() !== url) network.push(request.url());
  });
  await page.goto(url);
  await page.waitForFunction(() => window.ultimaZona);
  await context.setOffline(true);
  assert(await page.locator("#menu").isVisible());
  await page.click("#play");
  await page.waitForFunction(() => window.ultimaZona.status.running);
  const state = await page.evaluate(() => ({
    status: window.ultimaZona.status,
    locked: !!document.pointerLockElement,
  }));
  assert.equal(state.status.alive, 25);
  assert.equal(state.status.health, 100);
  assert(state.locked, "standalone page must support mouse capture");
  assert.deepEqual(errors, []);
  assert.deepEqual(network, []);
  console.log(
    `Standalone ${process.argv.includes("--file") ? "file://" : "HTTP (same inline HTML)"} passed: menu, 25 players, pointer lock, network disabled during play, no external requests or page errors.`,
  );
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
