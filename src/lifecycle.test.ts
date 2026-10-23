import test from "node:test";
import assert from "node:assert/strict";
import { tickTimer, FixedStep } from "./lifecycle";
test("reload/healing timers end at exactly zero when steps overshoot", () => {
  let t = 1.3;
  while (t > 0) t = tickTimer(t, 1 / 60);
  assert.equal(t, 0);
  assert.equal(Boolean(t), false);
  assert.equal(tickTimer(3, 3.01), 0);
});
test("simulation uses bounded fixed steps and clears paused time", () => {
  const clock = new FixedStep();
  let frames = 0,
    time = 0;
  clock.advance(50, (dt) => {
    frames++;
    time += dt;
    assert.equal(dt, 1 / 60);
  });
  assert.equal(frames, 6);
  assert(Math.abs(time - 0.1) < 1e-8);
  clock.advance(0.005, () => frames++);
  clock.reset();
  clock.advance(0.012, () => frames++);
  assert.equal(frames, 6);
});
