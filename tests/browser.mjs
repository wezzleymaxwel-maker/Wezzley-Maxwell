import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: [
    "--no-sandbox",
    "--use-gl=angle",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
try {
  const page = await browser.newPage({
      viewport: { width: 1280, height: 800 },
    }),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.addInitScript(() =>
    localStorage.setItem(
      "ultima-settings",
      JSON.stringify({ quality: "baixo" }),
    ),
  );
  await page.goto("http://127.0.0.1:5173/?test");
  await page.waitForFunction(() => window.ultimaZona);
  assert(await page.locator("#menu").isVisible());
  await page.click("#play");
  await page.waitForFunction(
    () =>
      window.ultimaZona.status.running &&
      !window.ultimaZona.status.paused &&
      document.pointerLockElement,
  );
  assert.equal((await page.evaluate(() => window.ultimaZona.status)).alive, 25);
  const spawned = await page.evaluate(() => window.ultimaZona.inspect());
  for (let i = 0; i < spawned.bots.length; i++) {
    const p = spawned.bots[i].pos;
    assert(
      Math.hypot(p[0] - spawned.pos[0], p[2] - spawned.pos[2]) > 115,
      "spawn must leave an exploration buffer",
    );
    assert(Math.hypot(p[0], p[2]) <= 345, "no participant spawns in gas");
    for (let j = 0; j < i; j++) {
      const q = spawned.bots[j].pos;
      assert(
        Math.hypot(p[0] - q[0], p[2] - q[2]) > 30,
        "participants must not overlap at spawn",
      );
    }
  }
  // Real input: move, fire, reload, inventory, map, pause and resume.
  const before = await page.evaluate(() => window.ultimaZona.inspect());
  await page.keyboard.down("KeyW");
  await page.waitForTimeout(900);
  await page.keyboard.up("KeyW");
  const after = await page.evaluate(() => window.ultimaZona.inspect());
  assert.notDeepEqual(after.pos, before.pos);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForFunction(() => window.ultimaZona.status.ammo < 15);
  await page.keyboard.press("KeyR");
  await page.waitForFunction(() => window.ultimaZona.status.reloading > 0);
  await page.evaluate(() => window.ultimaZona.advance(2));
  assert.equal((await page.evaluate(() => window.ultimaZona.status)).ammo, 15);
  await page.keyboard.press("Tab");
  assert(await page.locator("#overlay").isVisible());
  await page.click("#return");
  await page.keyboard.press("KeyM");
  assert(await page.locator("#bigmap").isVisible());
  await page.click("#return");
  const mid = await page.evaluate(() => window.ultimaZona.advance(180));
  console.log("Simulation after 180s:", mid);
  // Continue the actual simulation through death/win; no invulnerability or forced eliminations.
  let result = mid;
  for (let i = 0; i < 14 && result.running; i++)
    result = await page.evaluate(() => window.ultimaZona.advance(60));
  assert.equal(result.running, false);
  assert(await page.locator("#again").isVisible());
  assert(result.kills > 0, "bots must cause real eliminations");
  console.log("Completed match:", result);
  await page.click("#again");
  assert.equal((await page.evaluate(() => window.ultimaZona.status)).alive, 25);
  assert.equal(
    (await page.evaluate(() => window.ultimaZona.status)).health,
    100,
  );
  assert.deepEqual(errors, []);
  console.log("Browser workflow passed; no uncaught page errors.");
} finally {
  await browser.close();
}
