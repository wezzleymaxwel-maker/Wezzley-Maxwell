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
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  await context.addInitScript(() =>
    localStorage.setItem(
      "ultima-settings",
      JSON.stringify({ sensitivity: "broken", volume: null, quality: "baixo" }),
    ),
  );
  const page = await context.newPage(),
    errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("http://127.0.0.1:5173/?test");
  await page.waitForFunction(() => window.ultimaZona);
  const state = () => page.evaluate(() => window.ultimaZona.status);
  assert.equal((await state()).sensitivity, 0.002);
  assert.equal((await state()).quality, "baixo");
  // Privacy/portable browser storage may be unavailable: save should still close settings.
  await page.evaluate(() =>
    Object.defineProperty(Storage.prototype, "setItem", {
      configurable: true,
      value() {
        throw new DOMException("blocked", "SecurityError");
      },
    }),
  );
  await page.click("#settings");
  await page.click("#back");
  assert(!(await page.locator("#overlay").isVisible()));
  await page.click("#play");
  await page.waitForFunction(
    () => window.ultimaZona.status.running && !window.ultimaZona.status.paused,
  );
  await page.evaluate(() => window.ultimaZona.scenario("mechanics"));
  async function fire() {
    const before = (await state()).ammo;
    await page.mouse.down();
    await page.mouse.up();
    await page.waitForFunction(
      (n) => window.ultimaZona.status.ammo < n,
      before,
    );
  }
  await fire();
  await page.keyboard.press("KeyR");
  await page.evaluate(() => window.ultimaZona.advance(1.37));
  assert.equal((await state()).reloading, 0);
  assert.equal((await state()).ammo, 15);
  await fire();
  await page.evaluate(() => window.ultimaZona.scenario("hurt"));
  await page.keyboard.press("KeyF");
  await page.evaluate(() => window.ultimaZona.advance(3.17));
  assert.equal((await state()).healing, 0);
  assert.equal((await state()).health, 100);
  await fire();
  console.log("Reload and healing allow subsequent real shots.");
  await page.keyboard.down("KeyW");
  await page.keyboard.press("Tab");
  await page.click("#return");
  await page.keyboard.up("KeyW");
  const pos = await page.evaluate(() => window.ultimaZona.inspect().pos);
  await page.waitForTimeout(300);
  const next = await page.evaluate(() => window.ultimaZona.inspect().pos);
  assert(
    Math.hypot(next[0] - pos[0], next[2] - pos[2]) < 0.01,
    "closing inventory clears held movement",
  );
  await page.keyboard.press("Escape");
  await page.waitForFunction(() => window.ultimaZona.status.paused);
  await page.waitForTimeout(1100);
  await page.click("#resume");
  await page.waitForFunction(() => !window.ultimaZona.status.paused);
  const ammoBefore = await page.evaluate(() => {
    const i = window.ultimaZona.inspect();
    return { mag: i.mag[0], reserve: i.reserve[0] };
  });
  for (let i = 0; i < 3; i++) {
    await page.keyboard.press("Tab");
    await page.click('[data-drop="0"]');
    await page.click("#return");
    assert.equal((await state()).equipped, false);
    await page.keyboard.press("KeyE");
    await page.waitForFunction(() => window.ultimaZona.status.equipped);
  }
  const ammoAfter = await page.evaluate(() => {
    const i = window.ultimaZona.inspect();
    return { mag: i.mag[0], reserve: i.reserve[0] };
  });
  assert.deepEqual(
    ammoAfter,
    ammoBefore,
    "drop/pickup must conserve ammunition",
  );
  console.log("Repeated drop/pickup conserves ammo.");
  // Repeated matches must release old geometries and textures.
  const memories = [];
  for (let i = 0; i < 8; i++) {
    await page.evaluate(() => document.exitPointerLock());
    await page.waitForSelector("#restart");
    await page.click("#restart");
    await page.waitForTimeout(220);
    const s = await state();
    assert.equal(s.alive, 25);
    assert.equal(s.paused, false);
    assert.equal(s.reloading, 0);
    assert.equal(s.healing, 0);
    memories.push(s.graphics.geometries);
  }
  assert(
    Math.max(...memories) - Math.min(...memories) < 120,
    `GPU allocations grew across restarts: ${memories}`,
  );
  console.log("Restart GPU geometry counts:", memories.join(", "));
  // Controlled final duel tests the real shot -> elimination -> victory -> restart path.
  await page.evaluate(() => window.ultimaZona.scenario("duel"));
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForSelector("#again");
  assert.match(
    await page.locator("#overlay").innerText(),
    /ÚLTIMO SOBREVIVENTE/,
  );
  assert.equal((await state()).alive, 1);
  await page.click("#again");
  assert.equal((await state()).alive, 25);
  console.log(
    "Final-duel victory and restart passed (controlled regression fixture).",
  );
  // Final gas damages even the exact final centre, preventing immortal centre campers.
  await page.evaluate(() => window.ultimaZona.scenario("gas"));
  await page.evaluate(() => window.ultimaZona.advance(4));
  assert.equal((await state()).running, false);
  assert(await page.locator("#again").isVisible());
  assert.match(await page.locator("#overlay").innerText(), /FIM DA OPERAÇÃO/);
  assert.deepEqual(errors, []);
  console.log("Stability regressions passed; no uncaught browser errors.");
} finally {
  await browser.close();
}
