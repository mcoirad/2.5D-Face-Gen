import assert from "node:assert/strict";
import test from "node:test";

import { defaultParams } from "../src/params.js";
import {
  defaultFeatureLandmarks,
  defaultOutlineLandmarks,
  solveFaceRig
} from "../src/rig.js";
import { renderFaceSvg } from "../src/svgRenderer.js";

const EPSILON = 1e-6;

function solve(overrides = {}) {
  return solveFaceRig({
    ...defaultParams,
    showHelmet: false,
    outlineLandmarks: structuredClone(defaultOutlineLandmarks),
    featureLandmarks: structuredClone(defaultFeatureLandmarks),
    ...overrides
  });
}

function almostEqual(actual, expected, message) {
  assert.ok(
    Math.abs(actual - expected) <= EPSILON,
    `${message}: expected ${expected}, received ${actual}`
  );
}

function almostEqualPoint(actual, expected, message) {
  almostEqual(actual.x, expected.x, `${message} x`);
  almostEqual(actual.y, expected.y, `${message} y`);
}

function interpolatePoint(from, to, amount) {
  return {
    x: from.x + (to.x - from.x) * amount,
    y: from.y + (to.y - from.y) * amount
  };
}

function pointDistance(a, b) {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

function assertFiniteGeometry(value, path = "eyeShading") {
  if (typeof value === "number") {
    assert.ok(Number.isFinite(value), `${path} should be finite`);
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => assertFiniteGeometry(item, `${path}[${index}]`));
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => assertFiniteGeometry(item, `${path}.${key}`));
  }
}

test("eye shading is opt-in and aligned with eye visibility", () => {
  assert.equal(defaultParams.showEyeShading, false);

  const disabled = solve();
  assert.equal(disabled.features.eyeShading.length, disabled.features.eyes.length);
  assert.ok(disabled.features.eyeShading.every(shading => !shading.visible));
  assert.doesNotMatch(renderFaceSvg(disabled), /eye-shading-(eye|bridge)/);

  const front = solve({ showEyeShading: true });
  assert.deepEqual(front.features.eyeShading.map(shading => shading.visible), [true, true]);
  assert.equal((renderFaceSvg(front).match(/class="eye-shading-eye"/g) ?? []).length, 2);
  assert.equal((renderFaceSvg(front).match(/class="eye-shading-bridge"/g) ?? []).length, 2);

  const profile = solve({ showEyeShading: true, yaw: 1 });
  assert.deepEqual(
    profile.features.eyeShading.map(shading => shading.visible),
    profile.features.eyes.map(eye => eye.visible)
  );
  assert.equal((renderFaceSvg(profile).match(/class="eye-shading-eye"/g) ?? []).length, 1);
});

test("the first shading shape is the eye quad scaled uniformly by 1.3", () => {
  const rig = solve({ showEyeShading: true });

  rig.features.eyes.forEach((eye, index) => {
    const shading = rig.features.eyeShading[index];

    for (const [key, point] of Object.entries(eye.quad)) {
      almostEqualPoint(shading.eyeShape[key], {
        x: eye.center.x + (point.x - eye.center.x) * 1.3,
        y: eye.center.y + (point.y - eye.center.y) * 1.3
      }, `eye ${index} ${key}`);
    }
  });
});

test("the bridge shares the eye curve and follows the eyebrow with one clamped fraction", () => {
  const halfwayRig = solve({ showEyeShading: true, eyebrowY: -30 });

  halfwayRig.features.eyeShading.forEach((shading, index) => {
    const brow = halfwayRig.features.brows[index];
    const bridge = shading.bridgeShape;

    almostEqual(shading.interpolation, 0.5, `eye ${index} halfway fraction`);
    assert.strictEqual(bridge.bottomInner, shading.eyeShape.topInner);
    assert.strictEqual(bridge.bottomControl, shading.eyeShape.topControl);
    assert.strictEqual(bridge.bottomOuter, shading.eyeShape.topOuter);
    almostEqualPoint(bridge.topInner, interpolatePoint(bridge.bottomInner, brow.bottomInner, 0.5), `eye ${index} top inner`);
    almostEqualPoint(bridge.topControl, interpolatePoint(bridge.bottomControl, brow.bottomControl, 0.5), `eye ${index} top control`);
    almostEqualPoint(bridge.topOuter, interpolatePoint(bridge.bottomOuter, brow.bottomOuter, 0.5), `eye ${index} top outer`);
  });

  const minimumRig = solve({ showEyeShading: true, eyebrowY: -10 });
  minimumRig.features.eyeShading.forEach((shading, index) => {
    const brow = minimumRig.features.brows[index];
    const bridge = shading.bridgeShape;
    const targetDistance = Math.min(
      pointDistance(bridge.bottomInner, brow.bottomInner),
      pointDistance(bridge.bottomOuter, brow.bottomOuter)
    );

    assert.ok(shading.interpolation > 0.5 && shading.interpolation < 1);
    almostEqual(shading.interpolation * targetDistance, 10, `eye ${index} minimum rise`);
  });

  const touchingRig = solve({ showEyeShading: true, eyebrowY: 0 });
  touchingRig.features.eyeShading.forEach((shading, index) => {
    const brow = touchingRig.features.brows[index];

    almostEqual(shading.interpolation, 1, `eye ${index} touching fraction`);
    almostEqualPoint(shading.bridgeShape.topInner, brow.bottomInner, `eye ${index} touching inner`);
    almostEqualPoint(shading.bridgeShape.topControl, brow.bottomControl, `eye ${index} touching control`);
    almostEqualPoint(shading.bridgeShape.topOuter, brow.bottomOuter, `eye ${index} touching outer`);
  });
});

test("shading uses a darkened skin fill and renders clipped beneath front layers", () => {
  const rig = solve({
    showEyeShading: true,
    skinColor: "#fedcba",
    eyeIrisColor: "#123456"
  });
  const svg = renderFaceSvg(rig);
  const shadingIndex = svg.indexOf('class="eye-shading-eye"');

  assert.ok(rig.features.eyeShading.every(shading => shading.fillColor === "#cbb095"));
  assert.match(svg, /class="eye-shading-eye"[\s\S]*?fill="#cbb095"[\s\S]*?stroke="none"/);
  assert.match(svg, /class="eye-shading-bridge"[\s\S]*?fill="#cbb095"[\s\S]*?stroke="none"/);
  assert.match(svg, /<clipPath id="eye-shading-head-clip">/);
  assert.match(svg, /<g clip-path="url\(#eye-shading-head-clip\)">/);
  assert.ok(shadingIndex > svg.indexOf('fill="#fedcba"'));
  assert.ok(shadingIndex < svg.lastIndexOf(defaultParams.hairColor));
  assert.ok(shadingIndex < svg.indexOf('id="eye-clip-0"'));

  const invalid = solve({ showEyeShading: true, skinColor: "invalid" });
  assert.ok(invalid.features.eyeShading.every(shading => shading.fillColor === "#c5c1ba"));
});

test("eye shading remains finite across extreme pose and feature controls", () => {
  for (const yaw of [-1, -0.5, 0, 0.5, 1]) {
    for (const pitch of [-0.5, 0, 0.5]) {
      const rig = solve({
        showEyeShading: true,
        yaw,
        pitch,
        eyeSize: yaw < 0 ? 15 : 25,
        eyeRotation: pitch < 0 ? -0.3 : 0.3,
        eyeTopCurve: pitch < 0 ? 0 : 3,
        eyebrowY: yaw === 0 ? 45 : -30,
        eyebrowLength: yaw < 0 ? 10 : 80,
        eyebrowCurve: pitch < 0 ? -1 : 1
      });

      assertFiniteGeometry(rig.features.eyeShading);
    }
  }
});
