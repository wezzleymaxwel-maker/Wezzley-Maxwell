import test from "node:test";
import assert from "node:assert/strict";
import { AdaptiveResolution } from "./performance";
test("resolution adapts only after sustained slow frames and never below its budget", () => {
  const governor = new AdaptiveResolution("medio", 2);
  const initial = governor.scale;
  for (let i = 0; i < 20; i++) assert.equal(governor.update(50), null);
  assert.equal(governor.scale, initial);
  for (let i = 0; i < 1000; i++) governor.update(50);
  assert.equal(governor.scale, 0.6);
  assert(governor.fps < 25);
});
test("inactive tabs and invalid frame samples cannot lower resolution", () => {
  const governor = new AdaptiveResolution("alto", 1.5),
    initial = governor.scale;
  for (let i = 0; i < 1000; i++) {
    governor.update(100, false);
    governor.update(Infinity);
    governor.update(60000);
  }
  assert.equal(governor.scale, initial);
});
test("recovery raises resolution slowly and respects explicit quality cap", () => {
  const governor = new AdaptiveResolution("baixo", 2);
  for (let i = 0; i < 500; i++) governor.update(50);
  const low = governor.scale;
  for (let i = 0; i < 900; i++) governor.update(16);
  assert(governor.scale > low);
  assert(governor.scale <= 1);
  assert.equal(governor.setQuality("medio", 1), 1);
});

test("visible second-long frames report real stalls and trigger bounded downscaling", () => {
  const governor = new AdaptiveResolution("medio", 2),
    initial = governor.scale;
  governor.update(1000);
  assert(
    governor.fps < 3,
    "one-second visible frames must not leave a fake 60FPS reading",
  );
  for (let i = 0; i < 30; i++) governor.update(1000);
  assert(governor.scale < initial);
  assert(governor.scale >= 0.6);
  assert(governor.fps < 1.1);
});
