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

function quadPoint(p0, control, p1, t) {
  const mt = 1 - t;

  return {
    x: mt * mt * p0.x + 2 * mt * t * control.x + t * t * p1.x,
    y: mt * mt * p0.y + 2 * mt * t * control.y + t * t * p1.y
  };
}

function midpoint(a, b) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function subtract(a, b) {
  return { x: a.x - b.x, y: a.y - b.y };
}

function dot(a, b) {
  return a.x * b.x + a.y * b.y;
}

function normalize(point) {
  const length = Math.hypot(point.x, point.y);
  return { x: point.x / length, y: point.y / length };
}

function makeEyeFrame(eye) {
  const innerMid = midpoint(eye.quad.topInner, eye.quad.bottomInner);
  const outerMid = midpoint(eye.quad.topOuter, eye.quad.bottomOuter);
  const upperMid = midpoint(eye.quad.topInner, eye.quad.topOuter);
  const lowerMid = midpoint(eye.quad.bottomInner, eye.quad.bottomOuter);
  const outward = normalize(subtract(outerMid, innerMid));
  const rawDown = subtract(lowerMid, upperMid);
  const downRemainder = {
    x: rawDown.x - outward.x * dot(rawDown, outward),
    y: rawDown.y - outward.y * dot(rawDown, outward)
  };
  let down = normalize(downRemainder);

  if (dot(down, rawDown) < 0) {
    down = { x: -down.x, y: -down.y };
  }

  return { outward, down };
}

function projection(point, origin, axis) {
  return dot(subtract(point, origin), axis);
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

test("sunken and baggy eye shading are independent and aligned with eye visibility", () => {
  assert.equal(defaultParams.showEyeShading, false);
  assert.equal(defaultParams.showBaggyEyeShading, false);

  const disabled = solve();
  assert.equal(disabled.features.eyeShading.length, disabled.features.eyes.length);
  assert.ok(disabled.features.eyeShading.every(shading => !shading.visible));
  assert.ok(disabled.features.eyeShading.every(shading => !shading.bagVisible));
  assert.doesNotMatch(renderFaceSvg(disabled), /eye-shading-(eye|bridge|bag)/);

  const sunkenOnly = solve({ showEyeShading: true });
  const sunkenSvg = renderFaceSvg(sunkenOnly);
  assert.deepEqual(sunkenOnly.features.eyeShading.map(shading => shading.visible), [true, true]);
  assert.deepEqual(sunkenOnly.features.eyeShading.map(shading => shading.bagVisible), [false, false]);
  assert.equal((sunkenSvg.match(/class="eye-shading-eye"/g) ?? []).length, 2);
  assert.equal((sunkenSvg.match(/class="eye-shading-bridge"/g) ?? []).length, 2);
  assert.doesNotMatch(sunkenSvg, /class="eye-shading-bag"/);

  const baggyOnly = solve({ showBaggyEyeShading: true });
  const baggySvg = renderFaceSvg(baggyOnly);
  assert.deepEqual(baggyOnly.features.eyeShading.map(shading => shading.visible), [false, false]);
  assert.deepEqual(baggyOnly.features.eyeShading.map(shading => shading.bagVisible), [true, true]);
  assert.equal((baggySvg.match(/class="eye-shading-bag"/g) ?? []).length, 2);
  assert.doesNotMatch(baggySvg, /class="eye-shading-(eye|bridge)"/);

  const combined = renderFaceSvg(solve({ showEyeShading: true, showBaggyEyeShading: true }));
  assert.equal((combined.match(/class="eye-shading-(eye|bridge|bag)"/g) ?? []).length, 6);

  const profile = solve({ showEyeShading: true, showBaggyEyeShading: true, yaw: 1 });
  assert.deepEqual(
    profile.features.eyeShading.map(shading => shading.visible),
    profile.features.eyes.map(eye => eye.visible)
  );
  assert.deepEqual(
    profile.features.eyeShading.map(shading => shading.bagVisible),
    profile.features.eyes.map(eye => eye.visible)
  );
  assert.equal((renderFaceSvg(profile).match(/class="eye-shading-eye"/g) ?? []).length, 1);
  assert.equal((renderFaceSvg(profile).match(/class="eye-shading-bag"/g) ?? []).length, 1);
});

test("the first shading shape is the eye quad scaled uniformly by 1.4", () => {
  const rig = solve({ showEyeShading: true });

  rig.features.eyes.forEach((eye, index) => {
    const shading = rig.features.eyeShading[index];

    for (const [key, point] of Object.entries(eye.quad)) {
      almostEqualPoint(shading.eyeShape[key], {
        x: eye.center.x + (point.x - eye.center.x) * 1.4,
        y: eye.center.y + (point.y - eye.center.y) * 1.4
      }, `eye ${index} ${key}`);
    }
  });
});

test("baggy shading follows the lower eye curve and expands toward the original outer eye", () => {
  const rig = solve({ showBaggyEyeShading: true, eyeRotation: 0.23 });

  rig.features.eyeShading.forEach((shading, index) => {
    const eye = rig.features.eyes[index];
    const bag = shading.bagShape;
    const frame = makeEyeFrame(eye);
    const expectedInnerOuter = quadPoint(
      shading.eyeShape.bottomInner,
      shading.eyeShape.bottomControl,
      shading.eyeShape.bottomOuter,
      0.12
    );
    const outerExtent = Math.max(
      projection(eye.quad.topOuter, bag.innerAnchor, frame.outward),
      projection(eye.quad.bottomOuter, bag.innerAnchor, frame.outward)
    );
    const innerPairDistance = pointDistance(bag.innerAnchor, bag.innerOuter);
    const outerPairDistance = pointDistance(bag.lowerOuter, bag.outerAnchor);

    assert.strictEqual(bag.innerAnchor, shading.eyeShape.bottomInner);
    almostEqualPoint(bag.innerOuter, expectedInnerOuter, `eye ${index} inner curve sample`);
    almostEqual(
      projection(bag.outerAnchor, bag.innerAnchor, frame.outward),
      outerExtent,
      `eye ${index} original-eye outer extent`
    );
    assert.ok(
      projection(bag.lowerOuter, bag.innerAnchor, frame.outward)
        < projection(bag.outerAnchor, bag.innerAnchor, frame.outward),
      `eye ${index} lower point should be less outward`
    );
    assert.ok(
      projection(bag.lowerOuter, bag.innerAnchor, frame.down)
        > projection(bag.outerAnchor, bag.innerAnchor, frame.down),
      `eye ${index} lower point should be lower`
    );
    assert.ok(outerPairDistance > innerPairDistance, `eye ${index} outer pair should expand`);
    almostEqual(
      projection(bag.firstControl, bag.innerAnchor, frame.outward),
      outerExtent * 0.157,
      `eye ${index} first control outward`
    );
    almostEqual(
      projection(bag.firstControl, bag.innerAnchor, frame.down),
      outerExtent * 0.286,
      `eye ${index} first control down`
    );
    almostEqual(
      projection(bag.secondControl, bag.innerAnchor, frame.outward),
      outerExtent * 0.482,
      `eye ${index} second control outward`
    );
    almostEqual(
      projection(bag.secondControl, bag.innerAnchor, frame.down),
      outerExtent * 0.406,
      `eye ${index} second control down`
    );
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
    showBaggyEyeShading: true,
    skinColor: "#fedcba",
    eyeIrisColor: "#123456"
  });
  const svg = renderFaceSvg(rig);
  const shadingIndex = svg.indexOf('class="eye-shading-eye"');

  assert.ok(rig.features.eyeShading.every(shading => shading.fillColor === "#cbb095"));
  assert.match(svg, /class="eye-shading-bag"[\s\S]*?fill="#cbb095"[\s\S]*?stroke="none"/);
  assert.match(svg, /class="eye-shading-eye"[\s\S]*?fill="#cbb095"[\s\S]*?stroke="none"/);
  assert.match(svg, /class="eye-shading-bridge"[\s\S]*?fill="#cbb095"[\s\S]*?stroke="none"/);
  assert.match(svg, /<clipPath id="eye-shading-head-clip">/);
  assert.match(svg, /<g clip-path="url\(#eye-shading-head-clip\)">/);
  assert.ok(shadingIndex > svg.indexOf('fill="#fedcba"'));
  assert.ok(shadingIndex < svg.lastIndexOf(defaultParams.hairColor));
  assert.ok(shadingIndex < svg.indexOf('id="eye-clip-0"'));
  assert.ok(svg.indexOf('class="eye-shading-bag"') < shadingIndex);

  const invalid = solve({ showEyeShading: true, skinColor: "invalid" });
  assert.ok(invalid.features.eyeShading.every(shading => shading.fillColor === "#c5c1ba"));
});

test("eye shading remains finite across extreme pose and feature controls", () => {
  for (const yaw of [-1, -0.5, 0, 0.5, 1]) {
    for (const pitch of [-0.5, 0, 0.5]) {
      const rig = solve({
        showEyeShading: true,
        showBaggyEyeShading: true,
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
