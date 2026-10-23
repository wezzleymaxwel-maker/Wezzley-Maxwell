import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULTS,
  validatePreferences,
  readPreferences,
  writePreferences,
} from "./settings";
test("corrupt/missing preferences cannot make camera sensitivity or audio nonfinite", () => {
  for (const input of [
    null,
    {},
    "bad",
    { sensitivity: NaN, volume: Infinity, quality: "ultra", skin: "x" },
  ])
    assert.deepEqual(validatePreferences(input), DEFAULTS);
});
test("settings clamp input and retain valid graphical quality and colors", () => {
  assert.deepEqual(
    validatePreferences({
      sensitivity: 20,
      volume: -2,
      quality: "baixo",
      outfit: "#123456",
      skin: "#abcdef",
    }),
    {
      sensitivity: 0.006,
      volume: 0,
      quality: "baixo",
      outfit: "#123456",
      skin: "#abcdef",
    },
  );
});
test("unavailable browser storage is optional", () => {
  assert.deepEqual(readPreferences(), DEFAULTS);
  assert.equal(writePreferences(DEFAULTS), false);
});
