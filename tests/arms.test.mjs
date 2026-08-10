import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { isPointInPolygon } from "../src/geometry.js";
import { defaultParams, sliderConfig, toggleConfig } from "../src/params.js";
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

function assertClose(actual, expected, message) {
  assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: expected ${expected}, got ${actual}`);
}

function distance(first, second) {
  const secondX = second.x ?? second.cx;
  const secondY = second.y ?? second.cy;

  return Math.hypot(first.x - secondX, first.y - secondY);
}

function pointOnSegment(point, start, end) {
  const cross = (end.x - start.x) * (point.y - start.y)
    - (end.y - start.y) * (point.x - start.x);
  if (Math.abs(cross) > EPSILON) return false;
  const dot = (point.x - start.x) * (point.x - end.x)
    + (point.y - start.y) * (point.y - end.y);
  return dot <= EPSILON;
}

function pointOnBoundary(point, polygon) {
  return polygon.some((start, index) => pointOnSegment(
    point,
    start,
    polygon[(index + 1) % polygon.length]
  ));
}

function fragmentMidpoints(fragments) {
  return fragments.flatMap(fragment => fragment.points.slice(0, -1).map((point, index) => ({
    x: (point.x + fragment.points[index + 1].x) / 2,
    y: (point.y + fragment.points[index + 1].y) / 2
  })));
}

function orientation(a, b, c) {
  return Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
}

function polygonIsSimple(points) {
  for (let first = 0; first < points.length; first += 1) {
    const a = points[first];
    const b = points[(first + 1) % points.length];
    for (let second = first + 1; second < points.length; second += 1) {
      if (
        first === second
        || (first + 1) % points.length === second
        || (second + 1) % points.length === first
      ) continue;
      const c = points[second];
      const d = points[(second + 1) % points.length];
      if (orientation(a, b, c) * orientation(a, b, d) < 0
        && orientation(c, d, a) * orientation(c, d, b) < 0) return false;
    }
  }
  return true;
}

test("arm and sleeve controls are opt-in and save-compatible", () => {
  assert.equal(defaultParams.showArms, false);
  assert.equal(defaultParams.armLength, 120);
  assert.equal(defaultParams.leftArmRotation, 0);
  assert.equal(defaultParams.rightArmRotation, 0);
  assert.equal(defaultParams.clothingSleeveLength, 0);
  assert.equal(toggleConfig.showArms, true);
  assert.deepEqual(sliderConfig.armLength, [40, 240, 1]);
  assert.deepEqual(sliderConfig.leftArmRotation, [-120, 120, 1]);
  assert.deepEqual(sliderConfig.rightArmRotation, [-120, 120, 1]);
  assert.deepEqual(sliderConfig.clothingSleeveLength, [0, 1, 0.01]);

  const mainSource = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  const bodyGroup = mainSource.match(/title: "Body",[\s\S]*?open: false/)?.[0] ?? "";
  const clothingGroup = mainSource.match(/title: "Clothing",[\s\S]*?open: false/)?.[0] ?? "";
  assert.match(bodyGroup, /"showArms"/);
  assert.match(bodyGroup, /"armLength"/);
  assert.match(bodyGroup, /"leftArmRotation"/);
  assert.match(bodyGroup, /"rightArmRotation"/);
  assert.match(clothingGroup, /"clothingSleeveLength"/);

  const rig = solve();
  assert.deepEqual(rig.body.arms, []);
  assert.doesNotMatch(renderFaceSvg(rig), /class="arm-(?:back|front)-layer"/);
});

test("zero arm rotations preserve the existing arm and sleeve geometry exactly", () => {
  const implicit = solve({
    showArms: true,
    showClothing: true,
    clothingSleeveLength: 0.65
  }).body;
  const explicit = solve({
    showArms: true,
    showClothing: true,
    clothingSleeveLength: 0.65,
    leftArmRotation: 0,
    rightArmRotation: 0
  }).body;

  assert.deepEqual(explicit.arms, implicit.arms);
  assert.deepEqual(explicit.clothing.sleeves, implicit.clothing.sleeves);
});

test("arms use the upper shoulder semicircle and a shoulder-width rectangle", () => {
  const short = solve({ showArms: true, armLength: 80 });
  const long = solve({ showArms: true, armLength: 160 });

  for (let index = 0; index < 2; index += 1) {
    const shoulder = short.body.shoulders[index];
    const arm = short.body.arms[index];
    const longerArm = long.body.arms[index];
    const innerX = arm.side === "left" ? shoulder.cx + shoulder.r : shoulder.cx - shoulder.r;
    const outerX = arm.side === "left" ? shoulder.cx - shoulder.r : shoulder.cx + shoulder.r;

    assert.equal(arm.points.length, 19);
    assertClose(arm.points[0].x, innerX, `${arm.side} inner equator X`);
    assertClose(arm.points[0].y, shoulder.cy, `${arm.side} inner equator Y`);
    assertClose(arm.points[8].x, shoulder.cx, `${arm.side} cap top X`);
    assertClose(arm.points[8].y, shoulder.cy - shoulder.r, `${arm.side} cap top Y`);
    assertClose(arm.points[16].x, outerX, `${arm.side} outer equator X`);
    assertClose(arm.points[17].y, shoulder.cy + 80, `${arm.side} outer cuff Y`);
    assertClose(arm.points[18].y, shoulder.cy + 80, `${arm.side} inner cuff Y`);
    assertClose(Math.max(...arm.points.map(point => point.x)) - Math.min(...arm.points.map(point => point.x)), shoulder.r * 2, `${arm.side} width`);
    assert.deepEqual(longerArm.points.slice(0, 17), arm.points.slice(0, 17));
    assertClose(longerArm.points[17].y, shoulder.cy + 160, `${arm.side} longer cuff`);
  }

  const narrow = solve({ showArms: true, shoulderRadius: 20 }).body.arms[0];
  const wide = solve({ showArms: true, shoulderRadius: 40 }).body.arms[0];
  assertClose(Math.max(...narrow.points.map(point => point.x)) - Math.min(...narrow.points.map(point => point.x)), 40, "narrow width");
  assertClose(Math.max(...wide.points.map(point => point.x)) - Math.min(...wide.points.map(point => point.x)), 80, "wide width");
});

test("yaw reverses arm depth order while zero keeps both behind", () => {
  const negative = solve({ yaw: -0.5, showArms: true }).body.arms;
  const zero = solve({ yaw: 0, showArms: true }).body.arms;
  const positive = solve({ yaw: 0.5, showArms: true }).body.arms;

  assert.equal(negative.find(arm => arm.side === "right").behindTorso, true);
  assert.equal(negative.find(arm => arm.side === "left").behindTorso, false);
  assert.ok(zero.every(arm => arm.behindTorso));
  assert.equal(positive.find(arm => arm.side === "left").behindTorso, true);
  assert.equal(positive.find(arm => arm.side === "right").behindTorso, false);

  const negativeLeft = negative.find(arm => arm.side === "left");
  const positiveRight = positive.find(arm => arm.side === "right");
  for (let index = 0; index < negativeLeft.points.length; index += 1) {
    assertClose(negativeLeft.points[index].x + positiveRight.points[index].x, 500, `mirrored X ${index}`);
    assertClose(negativeLeft.points[index].y, positiveRight.points[index].y, `mirrored Y ${index}`);
  }

  for (const yaw of [-1, 1]) {
    const arms = solve({ yaw, showArms: true }).body.arms;
    assert.equal(arms.length, 2);
    assert.ok(arms.flatMap(arm => arm.points).every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
  }
});

test("arm rotation controls act independently with outward-positive direction", () => {
  const base = solve({
    showArms: true,
    showClothing: true,
    clothingSleeveLength: 0.75
  }).body;
  const leftOnly = solve({
    showArms: true,
    showClothing: true,
    clothingSleeveLength: 0.75,
    leftArmRotation: 60
  }).body;
  const rightOnly = solve({
    showArms: true,
    showClothing: true,
    clothingSleeveLength: 0.75,
    rightArmRotation: 60
  }).body;

  assert.notDeepEqual(leftOnly.arms[0].points, base.arms[0].points);
  assert.deepEqual(leftOnly.arms[1].points, base.arms[1].points);
  assert.notDeepEqual(leftOnly.clothing.sleeves[0].points, base.clothing.sleeves[0].points);
  assert.deepEqual(leftOnly.clothing.sleeves[1].points, base.clothing.sleeves[1].points);
  assert.deepEqual(rightOnly.arms[0].points, base.arms[0].points);
  assert.notDeepEqual(rightOnly.arms[1].points, base.arms[1].points);
  assert.deepEqual(rightOnly.clothing.sleeves[0].points, base.clothing.sleeves[0].points);
  assert.notDeepEqual(rightOnly.clothing.sleeves[1].points, base.clothing.sleeves[1].points);

  for (const arm of leftOnly.arms) {
    const cuffCenterX = (arm.points[17].x + arm.points[18].x) / 2;
    if (arm.side === "left") {
      assert.ok(cuffCenterX < arm.shoulder.cx, "positive left rotation moves outward");
    }
  }
  for (const arm of rightOnly.arms) {
    const cuffCenterX = (arm.points[17].x + arm.points[18].x) / 2;
    if (arm.side === "right") {
      assert.ok(cuffCenterX > arm.shoulder.cx, "positive right rotation moves outward");
    }
  }

  const inward = solve({
    showArms: true,
    leftArmRotation: -60,
    rightArmRotation: -60
  }).body.arms;
  assert.ok((inward[0].points[17].x + inward[0].points[18].x) / 2 > inward[0].shoulder.cx);
  assert.ok((inward[1].points[17].x + inward[1].points[18].x) / 2 < inward[1].shoulder.cx);
});

test("equal rotations mirror rigid arms and preserve every shoulder distance", () => {
  const base = solve({ showArms: true }).body.arms;
  const rotated = solve({
    showArms: true,
    leftArmRotation: 73,
    rightArmRotation: 73
  }).body.arms;

  for (let sideIndex = 0; sideIndex < rotated.length; sideIndex += 1) {
    const arm = rotated[sideIndex];
    for (let pointIndex = 0; pointIndex < arm.points.length; pointIndex += 1) {
      assertClose(
        distance(arm.points[pointIndex], arm.shoulder),
        distance(base[sideIndex].points[pointIndex], base[sideIndex].shoulder),
        `${arm.side} shoulder distance ${pointIndex}`
      );
    }
    assertClose(
      distance(arm.points[17], arm.points[18]),
      distance(base[sideIndex].points[17], base[sideIndex].points[18]),
      `${arm.side} cuff width`
    );
  }

  for (let pointIndex = 0; pointIndex < rotated[0].points.length; pointIndex += 1) {
    assertClose(rotated[0].points[pointIndex].x + rotated[1].points[pointIndex].x, 500, `mirror X ${pointIndex}`);
    assertClose(rotated[0].points[pointIndex].y, rotated[1].points[pointIndex].y, `mirror Y ${pointIndex}`);
  }
});

test("sleeves use the exact arm pivot and rotation", () => {
  const base = solve({
    showArms: true,
    showClothing: true,
    clothingSleeveLength: 0.6
  }).body;
  const rotated = solve({
    showArms: true,
    showClothing: true,
    clothingSleeveLength: 0.6,
    leftArmRotation: 48,
    rightArmRotation: -37
  }).body;

  for (let sideIndex = 0; sideIndex < rotated.arms.length; sideIndex += 1) {
    const arm = rotated.arms[sideIndex];
    const sleeve = rotated.clothing.sleeves[sideIndex];
    const baseArm = base.arms[sideIndex];
    const baseSleeve = base.clothing.sleeves[sideIndex];
    const baseArmVector = {
      x: (baseArm.points[17].x + baseArm.points[18].x) / 2 - baseArm.shoulder.cx,
      y: (baseArm.points[17].y + baseArm.points[18].y) / 2 - baseArm.shoulder.cy
    };
    const armVector = {
      x: (arm.points[17].x + arm.points[18].x) / 2 - arm.shoulder.cx,
      y: (arm.points[17].y + arm.points[18].y) / 2 - arm.shoulder.cy
    };
    const baseSleeveVector = {
      x: (baseSleeve.points[17].x + baseSleeve.points[18].x) / 2 - baseSleeve.shoulder.cx,
      y: (baseSleeve.points[17].y + baseSleeve.points[18].y) / 2 - baseSleeve.shoulder.cy
    };
    const sleeveVector = {
      x: (sleeve.points[17].x + sleeve.points[18].x) / 2 - sleeve.shoulder.cx,
      y: (sleeve.points[17].y + sleeve.points[18].y) / 2 - sleeve.shoulder.cy
    };
    const armAngle = Math.atan2(armVector.y, armVector.x) - Math.atan2(baseArmVector.y, baseArmVector.x);
    const sleeveAngle = Math.atan2(sleeveVector.y, sleeveVector.x) - Math.atan2(baseSleeveVector.y, baseSleeveVector.x);

    assertClose(arm.shoulder.cx, sleeve.shoulder.cx, `${arm.side} shared pivot X`);
    assertClose(arm.shoulder.cy, sleeve.shoulder.cy, `${arm.side} shared pivot Y`);
    assertClose(armAngle, sleeveAngle, `${arm.side} shared rotation`);
  }
});

test("the yaw-near arm renders over torso clothing on the matching screen side", () => {
  for (const [yaw, nearSide, farSide] of [
    [-0.5, "left", "right"],
    [0.5, "right", "left"]
  ]) {
    const svg = renderFaceSvg(solve({
      yaw,
      showArms: true,
      leftArmRotation: -95,
      rightArmRotation: 110,
      showClothing: true,
      clothingSleeveLength: 0.75
    }));
    const frontArmLayer = svg.match(/<g class="arm-front-layer">([\s\S]*?)<\/g>/)?.[1] ?? "";
    const backArmLayer = svg.match(/<g class="arm-back-layer">([\s\S]*?)<\/g>/)?.[1] ?? "";

    assert.match(frontArmLayer, new RegExp(`class="arm-fill arm-${nearSide}"`));
    assert.doesNotMatch(frontArmLayer, new RegExp(`class="arm-fill arm-${farSide}"`));
    assert.match(backArmLayer, new RegExp(`class="arm-fill arm-${farSide}"`));
    assert.ok(svg.indexOf('class="clothing-layer"') < svg.indexOf('class="arm-front-layer"'));
    assert.ok(svg.indexOf('class="arm-front-layer"') < svg.indexOf('class="clothing-sleeve-front-layer"'));
  }
});

test("skin outlines are reciprocally trimmed at every arm overlap", () => {
  for (const ribCageSeparate of [false, true]) {
    const body = solve({ showArms: true, ribCageSeparate }).body;
    const skinShapes = [body.torsoOutline, body.ribCageShape].filter(Boolean);
    const skinPolygons = skinShapes.map(shape => shape.points);
    const armPolygons = body.arms.map(arm => arm.points);

    for (const arm of body.arms) {
      assert.ok(arm.outlineFragments.length > 0);
      for (const midpoint of fragmentMidpoints(arm.outlineFragments)) {
        assert.ok(!skinPolygons.some(polygon => isPointInPolygon(midpoint, polygon) || pointOnBoundary(midpoint, polygon)));
      }
      assert.ok(arm.outlineFragments.some(fragment => fragment.points.some(point => (
        Math.abs(point.y - (arm.shoulder.cy + arm.length)) < EPSILON
      ))));
    }

    for (const shape of skinShapes) {
      assert.ok(Array.isArray(shape.outlineFragments));
      for (const midpoint of fragmentMidpoints(shape.outlineFragments)) {
        assert.ok(!armPolygons.some(polygon => isPointInPolygon(midpoint, polygon) || pointOnBoundary(midpoint, polygon)));
      }
    }
  }
});

test("reciprocal trimming follows raised and crossed arm geometry", () => {
  for (const rotations of [
    { leftArmRotation: 120, rightArmRotation: 120 },
    { leftArmRotation: -120, rightArmRotation: -120 },
    { leftArmRotation: 95, rightArmRotation: -80 }
  ]) {
    const body = solve({
      showArms: true,
      showClothing: true,
      clothingSleeveLength: 0.8,
      ribCageSeparate: rotations.leftArmRotation < 0,
      ...rotations
    }).body;
    const skinShapes = [body.torsoOutline, body.ribCageShape].filter(Boolean);
    const skinPolygons = skinShapes.map(shape => shape.points);
    const armPolygons = body.arms.map(arm => arm.points);
    const shirtPolygons = body.clothing.shapes.map(shape => shape.points);
    const sleevePolygons = body.clothing.sleeves.map(sleeve => sleeve.points);

    for (const arm of body.arms) {
      for (const midpoint of fragmentMidpoints(arm.outlineFragments)) {
        assert.ok(!skinPolygons.some(polygon => isPointInPolygon(midpoint, polygon) || pointOnBoundary(midpoint, polygon)));
      }
    }
    for (const shape of skinShapes) {
      for (const midpoint of fragmentMidpoints(shape.outlineFragments)) {
        assert.ok(!armPolygons.some(polygon => isPointInPolygon(midpoint, polygon) || pointOnBoundary(midpoint, polygon)));
      }
    }
    for (const sleeve of body.clothing.sleeves) {
      for (const midpoint of fragmentMidpoints(sleeve.outlineFragments)) {
        assert.ok(!shirtPolygons.some(polygon => isPointInPolygon(midpoint, polygon) || pointOnBoundary(midpoint, polygon)));
      }
    }
    for (const shape of body.clothing.shapes) {
      for (const midpoint of fragmentMidpoints(shape.outlineFragments)) {
        assert.ok(!sleevePolygons.some(polygon => isPointInPolygon(midpoint, polygon) || pointOnBoundary(midpoint, polygon)));
      }
    }
  }
});

test("sleeves require arms and clothing and follow arm-relative length", () => {
  assert.equal(solve({ showClothing: true, clothingSleeveLength: 1 }).body.clothing.sleeves.length, 0);
  assert.equal(solve({ showArms: true, clothingSleeveLength: 1 }).body.clothing, null);
  assert.equal(solve({ showArms: true, showClothing: true, clothingSleeveLength: 0 }).body.clothing.sleeves.length, 0);

  const half = solve({
    showArms: true,
    armLength: 160,
    showClothing: true,
    clothingOffset: 6,
    clothingSleeveLength: 0.5,
    clothingColor: "#123456"
  }).body;
  const full = solve({
    showArms: true,
    armLength: 160,
    showClothing: true,
    clothingOffset: 6,
    clothingSleeveLength: 1
  }).body;

  assert.equal(half.clothing.sleeves.length, 2);
  for (let index = 0; index < 2; index += 1) {
    const arm = half.arms[index];
    const sleeve = half.clothing.sleeves[index];
    const fullSleeve = full.clothing.sleeves[index];
    const width = Math.max(...sleeve.points.map(point => point.x)) - Math.min(...sleeve.points.map(point => point.x));

    assert.equal(sleeve.fill, "#123456");
    assertClose(width, (arm.shoulder.r + 6) * 2, `${arm.side} expanded sleeve width`);
    assertClose(Math.max(...sleeve.points.map(point => point.y)), arm.shoulder.cy + 80, `${arm.side} half cuff`);
    assertClose(Math.max(...fullSleeve.points.map(point => point.y)), arm.shoulder.cy + 160, `${arm.side} full cuff`);
  }
});

test("shirt and sleeve outlines are reciprocally trimmed while cuffs remain", () => {
  const clothing = solve({
    showArms: true,
    armLength: 220,
    showClothing: true,
    clothingSleeveLength: 1,
    clothingOffset: 4
  }).body.clothing;
  const shirtPolygons = clothing.shapes.map(shape => shape.points);
  const sleevePolygons = clothing.sleeves.map(sleeve => sleeve.points);

  for (const sleeve of clothing.sleeves) {
    for (const midpoint of fragmentMidpoints(sleeve.outlineFragments)) {
      assert.ok(!shirtPolygons.some(polygon => isPointInPolygon(midpoint, polygon) || pointOnBoundary(midpoint, polygon)));
    }
    assert.ok(sleeve.outlineFragments.some(fragment => fragment.points.some(point => (
      Math.abs(point.y - (sleeve.shoulder.cy + sleeve.length)) < EPSILON
    ))));
  }

  for (const shape of clothing.shapes) {
    for (const midpoint of fragmentMidpoints(shape.outlineFragments)) {
      assert.ok(!sleevePolygons.some(polygon => isPointInPolygon(midpoint, polygon) || pointOnBoundary(midpoint, polygon)));
    }
  }
});

test("SVG layers arms and sleeves around torso, garments, armor, cloak, and guides", () => {
  const rig = solve({
    yaw: -0.5,
    showArms: true,
    showClothing: true,
    clothingSleeveLength: 0.8,
    showBreastplate: true,
    showCloak: true,
    showGuides: true
  });
  const svg = renderFaceSvg(rig);
  const index = value => svg.indexOf(value);

  assert.ok(index('class="cloak-back-layer"') < index('class="arm-back-layer"'));
  assert.ok(index('class="arm-back-layer"') < index('class="clothing-sleeve-back-layer"'));
  assert.ok(index('class="clothing-sleeve-back-layer"') < index('class="body-shape-fill"'));
  assert.ok(index('class="body-shape-fill"') < index('class="clothing-layer"'));
  assert.ok(index('class="clothing-layer"') < index('class="arm-front-layer"'));
  assert.ok(index('class="arm-front-layer"') < index('class="clothing-sleeve-front-layer"'));
  assert.ok(index('class="clothing-sleeve-front-layer"') < index('class="breastplate-layer"'));
  assert.ok(index('class="breastplate-layer"') < index('class="cloak-front-layer"'));
  assert.ok(index('class="cloak-front-layer"') < index("stroke-dasharray=\"7 5\""));

  const strokeFreeSvg = renderFaceSvg(solve({ showArms: true, removeStrokes: true }));
  assert.match(strokeFreeSvg, /class="arm-fill arm-(?:left|right)"/);
  assert.match(strokeFreeSvg, /\*:not\(\.preserve-material-stroke\)[\s\S]*stroke: none !important/);
});

test("arm and sleeve geometry stays finite and simple across control extremes", () => {
  for (const yaw of [-1, -0.5, 0, 0.5, 1]) {
    for (const pitch of [-0.5, 0.5]) {
      for (const shoulderRadius of [15, 40]) {
        for (const armLength of [40, 240]) {
          for (const [leftArmRotation, rightArmRotation] of [
            [-120, 120],
            [0, 0],
            [120, -120]
          ]) {
            const body = solve({
              yaw,
              pitch,
              showArms: true,
              shoulderRadius,
              shoulderGap: yaw < 0 ? -20 : 40,
              armLength,
              leftArmRotation,
              rightArmRotation,
              ribCageSeparate: pitch > 0,
              showClothing: true,
              clothingOffset: shoulderRadius === 15 ? 0 : 12,
              clothingSleeveLength: armLength === 40 ? 0.01 : 1
            }).body;

            for (const shape of [...body.arms, ...body.clothing.sleeves]) {
              assert.ok(shape.points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
              assert.ok(polygonIsSimple(shape.points));
              assert.ok(shape.outlineFragments.every(fragment => fragment.points.every(point => (
                Number.isFinite(point.x) && Number.isFinite(point.y)
              ))));
            }
          }
        }
      }
    }
  }

  const hidden = solve({ showBody: false, showArms: true, showClothing: true, clothingSleeveLength: 1 });
  assert.deepEqual(hidden.body.arms, []);
  assert.equal(hidden.body.clothing, null);
});
