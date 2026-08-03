import assert from "node:assert/strict";
import test from "node:test";

import { makeHairV2Lock } from "../src/hairV2.js";
import {
  applyHairV2LengthPreset,
  HAIR_V2_LENGTH_PRESETS,
  HAIR_V2_LENGTH_PROFILE_KEYS,
  matchesHairV2LengthPreset,
  normalizeHairV2LengthPreset,
  resolveHairV2LengthScale
} from "../src/hairV2Profiles.js";
import { defaultParams } from "../src/params.js";

const EPSILON = 1e-6;

function paramsForPreset(name) {
  return {
    ...defaultParams,
    ...HAIR_V2_LENGTH_PRESETS[name].values,
    hairV2LengthPreset: name
  };
}

function almostEqual(actual, expected, message) {
  assert.ok(
    Math.abs(actual - expected) <= EPSILON,
    `${message}: expected ${expected}, received ${actual}`
  );
}

test("uniform profile resolves to exactly one across the scalp", () => {
  const params = paramsForPreset("uniform");

  for (const u of [-2, -1, -0.5, 0, 0.5, 1, 2]) {
    for (const v of [0, 0.15, 0.5, 0.85, 1]) {
      assert.equal(resolveHairV2LengthScale(params, u, v), 1);
    }
  }
});

test("regional anchors resolve to crown, front, side, and back scales", () => {
  const params = {
    ...defaultParams,
    hairV2CrownLengthScale: 0.5,
    hairV2FrontLengthScale: 0.75,
    hairV2SideLengthScale: 1.25,
    hairV2BackLengthScale: 1.5
  };

  almostEqual(resolveHairV2LengthScale(params, 0, 0), 0.5, "crown");
  almostEqual(resolveHairV2LengthScale(params, 0, 1), 0.75, "front");
  almostEqual(resolveHairV2LengthScale(params, 1, 1), 1.25, "side");
  almostEqual(resolveHairV2LengthScale(params, 2, 1), 1.5, "back");
});

test("regional interpolation stays continuous at longitude and latitude boundaries", () => {
  const params = {
    ...defaultParams,
    hairV2CrownLengthScale: 0.6,
    hairV2FrontLengthScale: 0.8,
    hairV2SideLengthScale: 1.4,
    hairV2BackLengthScale: 1.8
  };
  const delta = 1e-5;

  assert.ok(
    Math.abs(
      resolveHairV2LengthScale(params, 1 - delta, 1)
      - resolveHairV2LengthScale(params, 1 + delta, 1)
    ) < 1e-4,
    "side boundary should be continuous"
  );
  assert.ok(
    Math.abs(
      resolveHairV2LengthScale(params, 0.4, 0.15 - delta)
      - resolveHairV2LengthScale(params, 0.4, 0.15 + delta)
    ) < 1e-4,
    "crown blend onset should be continuous"
  );
  assert.ok(
    Math.abs(
      resolveHairV2LengthScale(params, 0.4, 0.85 - delta)
      - resolveHairV2LengthScale(params, 0.4, 0.85 + delta)
    ) < 1e-4,
    "perimeter blend end should be continuous"
  );
});

test("zero fringe width is a no-op", () => {
  const params = {
    ...defaultParams,
    hairV2FringeWidth: 0,
    hairV2FringeCenterLengthScale: 0.25,
    hairV2FringeEdgeLengthScale: 2,
    hairV2FringeBias: 0.75
  };

  assert.equal(resolveHairV2LengthScale(params, 0, 1), 1);
  assert.equal(resolveHairV2LengthScale(params, 0.5, 1), 1);
});

test("full and curtain bangs are symmetric, with curtain edges longer than their center", () => {
  for (const name of ["fullBangs", "curtainBangs"]) {
    const params = paramsForPreset(name);
    almostEqual(
      resolveHairV2LengthScale(params, -0.45, 1),
      resolveHairV2LengthScale(params, 0.45, 1),
      `${name} symmetry`
    );
  }

  const curtain = paramsForPreset("curtainBangs");
  assert.ok(
    resolveHairV2LengthScale(curtain, 0.65, 1)
      > resolveHairV2LengthScale(curtain, 0, 1),
    "curtain edge should exceed curtain center"
  );
});

test("side bangs use signed head longitude", () => {
  const params = paramsForPreset("sideBangs");
  const negativeSide = resolveHairV2LengthScale(params, -0.45, 1);
  const positiveSide = resolveHairV2LengthScale(params, 0.45, 1);

  assert.ok(positiveSide > negativeSide);
});

test("face framing stays localized to the front-temple hairline", () => {
  const params = {
    ...defaultParams,
    hairV2FaceFrameLengthScale: 1.5
  };

  assert.equal(resolveHairV2LengthScale(params, 0.55, 0), 1);
  assert.equal(resolveHairV2LengthScale(params, 0, 1), 1);
  assert.ok(resolveHairV2LengthScale(params, 0.55, 1) > 1.45);
});

test("all presets remain finite and clamped across the scalp", () => {
  for (const name of Object.keys(HAIR_V2_LENGTH_PRESETS)) {
    const params = paramsForPreset(name);

    for (let u = -2; u <= 2; u += 0.1) {
      for (let v = 0; v <= 1; v += 0.05) {
        const scale = resolveHairV2LengthScale(params, u, v);
        assert.ok(Number.isFinite(scale), `${name} should be finite at ${u}, ${v}`);
        assert.ok(scale >= 0.15 && scale <= 2.5, `${name} should be clamped at ${u}, ${v}`);
      }
    }
  }
});

test("preset application changes only profile state", () => {
  const target = {
    ...defaultParams,
    sentinel: "unchanged"
  };
  const before = { ...target };

  assert.equal(applyHairV2LengthPreset(target, "layeredHero"), true);
  assert.equal(target.hairV2LengthPreset, "layeredHero");
  assert.equal(target.sentinel, "unchanged");

  for (const [key, value] of Object.entries(before)) {
    if (key !== "hairV2LengthPreset" && !HAIR_V2_LENGTH_PROFILE_KEYS.includes(key)) {
      assert.deepEqual(target[key], value, `${key} should not change`);
    }
  }
});

test("preset matching normalizes mismatched saved state to custom", () => {
  const matching = paramsForPreset("fullBangs");
  assert.equal(matchesHairV2LengthPreset(matching, "fullBangs"), true);
  assert.equal(normalizeHairV2LengthPreset(matching), "fullBangs");

  matching.hairV2FringeWidth = 0.79;
  assert.equal(matchesHairV2LengthPreset(matching, "fullBangs"), false);
  assert.equal(normalizeHairV2LengthPreset(matching), "custom");
});

test("uniform length override preserves the original lock geometry", () => {
  const params = paramsForPreset("uniform");
  const input = {
    index: 7,
    base: { x: 180, y: 120, sidePosition: -0.25, depthPosition: 0.8 },
    direction: { x: 0.3, y: 1 },
    params
  };
  const original = makeHairV2Lock(input);
  const profiled = makeHairV2Lock({
    ...input,
    lengthOverride: params.hairV2LockLength * resolveHairV2LengthScale(params, 0.4, 0.8)
  });

  assert.deepEqual(profiled, original);
});
