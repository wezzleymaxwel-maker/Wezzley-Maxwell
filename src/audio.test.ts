import test from "node:test";
import assert from "node:assert/strict";
import { Sound } from "./audio";

function audio(state = "running") {
  const oscillators: { onended?: () => void; disconnected: number }[] = [];
  let disconnected = 0,
    resumed = 0;
  const param = { setValueAtTime() {}, exponentialRampToValueAtTime() {} };
  const node = () => ({
    connect(next: unknown) {
      return next;
    },
    disconnect() {
      disconnected++;
    },
  });
  const context = {
    state,
    currentTime: 0,
    destination: {},
    resume() {
      resumed++;
      return Promise.reject(new Error("autoplay blocked"));
    },
    createOscillator() {
      const o = {
        ...node(),
        frequency: param,
        start() {},
        stop() {},
        onended: undefined as (() => void) | undefined,
        disconnected: 0,
      };
      o.disconnect = () => {
        o.disconnected++;
        disconnected++;
      };
      oscillators.push(o);
      return o;
    },
    createGain() {
      return { ...node(), gain: param };
    },
    createStereoPanner() {
      return { ...node(), pan: { value: 0 } };
    },
  };
  return {
    context: context as unknown as AudioContext,
    oscillators,
    get disconnected() {
      return disconnected;
    },
    get resumed() {
      return resumed;
    },
  };
}

test("inaudible or muted events allocate no audio nodes", () => {
  const fake = audio(),
    sound = new Sound();
  sound.context = fake.context;
  sound.play(0, 200);
  sound.play(0, Infinity);
  sound.volume = 0;
  sound.play(0);
  assert.equal(fake.oscillators.length, 0);
});
test("audio voices are bounded and all nodes disconnect on completion", () => {
  const fake = audio(),
    sound = new Sound();
  sound.context = fake.context;
  for (let i = 0; i < 100; i++) sound.play(0);
  assert.equal(fake.oscillators.length, 24);
  fake.oscillators.forEach((o) => o.onended?.());
  assert.equal(fake.disconnected, 72);
  fake.oscillators.forEach((o) => o.onended?.());
  assert.equal(fake.disconnected, 72, "cleanup is idempotent");
  sound.play(4);
  assert.equal(fake.oscillators.length, 25);
});
test("rejected autoplay resume is handled and does not create silent pending voices", async () => {
  const fake = audio("suspended"),
    sound = new Sound();
  sound.context = fake.context;
  sound.play(0);
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(fake.resumed, 1);
  assert.equal(fake.oscillators.length, 0);
});
