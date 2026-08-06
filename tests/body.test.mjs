import assert from "node:assert/strict";
import test from "node:test";

import { isPointInPolygon, lerp } from "../src/geometry.js";
import { defaultParams } from "../src/params.js";
import {
  defaultFeatureLandmarks,
  defaultOutlineLandmarks,
  solveFaceRig
} from "../src/rig.js";

const EPSILON = 1e-6;
const ATTACHED_BODY_PARAMS = {
  yaw: 0.64,
  pitch: -0.07,
  neckTopWidth: 47,
  neckBottomWidth: 57,
  neckLength: 73,
  neckOverlap: 8,
  torsoWidth: 200,
  shoulderRadius: 30,
  shoulderGap: 22,
  torsoLength: 90,
  torsoNarrowing: 0.25,
  ribCageWidth: 124,
  ribCageHeight: 190,
  ribCageY: 26,
  ribCageTilt: 9,
  ribCageSeparate: false
};

function solve(overrides = {}) {
  return solveFaceRig({
    ...defaultParams,
    showHelmet: false,
    showHairStrands: false,
    outlineLandmarks: structuredClone(defaultOutlineLandmarks),
    featureLandmarks: structuredClone(defaultFeatureLandmarks),
    ...overrides
  });
}

function pointsEqual(a, b, epsilon = EPSILON) {
  return Math.abs(a.x - b.x) <= epsilon && Math.abs(a.y - b.y) <= epsilon;
}

function pointOnSegment(point, a, b, epsilon = EPSILON) {
  const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x);
  const dot = (point.x - a.x) * (point.x - b.x) + (point.y - a.y) * (point.y - b.y);

  return Math.abs(cross) <= epsilon && dot <= epsilon;
}

function pointOnPolygonBoundary(point, polygon) {
  return polygon.some((start, index) => pointOnSegment(
    point,
    start,
    polygon[(index + 1) % polygon.length]
  ));
}

function orientation(a, b, c) {
  return Math.sign((b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x));
}

function segmentsCross(a, b, c, d) {
  return orientation(a, b, c) * orientation(a, b, d) < 0
    && orientation(c, d, a) * orientation(c, d, b) < 0;
}

function polygonSelfIntersects(points) {
  for (let firstIndex = 0; firstIndex < points.length; firstIndex += 1) {
    const firstStart = points[firstIndex];
    const firstEnd = points[(firstIndex + 1) % points.length];

    for (let secondIndex = firstIndex + 1; secondIndex < points.length; secondIndex += 1) {
      const adjacent = firstIndex === secondIndex
        || (firstIndex + 1) % points.length === secondIndex
        || (secondIndex + 1) % points.length === firstIndex;

      if (!adjacent && segmentsCross(
        firstStart,
        firstEnd,
        points[secondIndex],
        points[(secondIndex + 1) % points.length]
      )) {
        return true;
      }
    }
  }

  return false;
}

function assertValidPolygon(points, label) {
  assert.ok(points.length >= 3, `${label} should have at least three points`);

  for (const [index, point] of points.entries()) {
    assert.ok(Number.isFinite(point.x), `${label}[${index}].x should be finite`);
    assert.ok(Number.isFinite(point.y), `${label}[${index}].y should be finite`);
  }

  assert.equal(polygonSelfIntersects(points), false, `${label} should not self-intersect`);
}

function torsoCorners(params, body) {
  const leftTop = {
    x: body.shoulders[0].cx,
    y: body.shoulders[0].cy - body.shoulders[0].r
  };
  const rightTop = {
    x: body.shoulders[1].cx,
    y: body.shoulders[1].cy - body.shoulders[1].r
  };
  const centerX = (leftTop.x + rightTop.x) / 2;

  return {
    leftTop,
    rightTop,
    leftBottom: {
      x: lerp(leftTop.x, centerX, params.torsoNarrowing),
      y: leftTop.y + params.torsoLength
    },
    rightBottom: {
      x: lerp(rightTop.x, centerX, params.torsoNarrowing),
      y: rightTop.y + params.torsoLength
    }
  };
}

test("interior torso corners splice onto the ribcage instead of overriding it", () => {
  const params = { ...defaultParams, ...ATTACHED_BODY_PARAMS };
  const body = solve(ATTACHED_BODY_PARAMS).body;
  const { leftBottom, rightBottom } = torsoCorners(params, body);

  assert.equal(isPointInPolygon(leftBottom, body.ribCageGuide), true, "left corner starts inside ribcage");
  assert.equal(isPointInPolygon(rightBottom, body.ribCageGuide), true, "right corner starts inside ribcage");
  assert.equal(body.torsoOutline.points.some(point => pointsEqual(point, leftBottom)), false);
  assert.equal(body.torsoOutline.points.some(point => pointsEqual(point, rightBottom)), false);
  assert.equal(body.ribCageShape, null, "overlapping shapes should produce one merged outline");

  const expectedIntersections = [
    { x: 221.60664364305885, y: 415.8651719831262 },
    { x: 277.86832079720244, y: 407.38042606899455 }
  ];

  for (const expected of expectedIntersections) {
    assert.ok(
      body.torsoOutline.points.some(point => pointsEqual(point, expected)),
      `outline should contain ribcage splice ${expected.x},${expected.y}`
    );
  }

  for (let index = 0; index < body.torsoOutline.points.length; index += 1) {
    const from = body.torsoOutline.points[index];
    const to = body.torsoOutline.points[(index + 1) % body.torsoOutline.points.length];
    const midpoint = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    const strictlyInsideRibCage = isPointInPolygon(midpoint, body.ribCageGuide)
      && !pointOnPolygonBoundary(midpoint, body.ribCageGuide);

    assert.equal(strictlyInsideRibCage, false, `outline edge ${index} should not chord through ribcage`);
  }

  assertValidPolygon(body.torsoOutline.points, "attached torso outline");
});

test("merged body geometry mirrors with yaw", () => {
  const positive = solve(ATTACHED_BODY_PARAMS).body.torsoOutline.points;
  const negative = solve({ ...ATTACHED_BODY_PARAMS, yaw: -ATTACHED_BODY_PARAMS.yaw }).body.torsoOutline.points;

  assert.equal(positive.length, negative.length);

  for (const point of positive) {
    assert.ok(
      negative.some(candidate => pointsEqual(candidate, { x: 500 - point.x, y: point.y })),
      `mirrored outline should contain ${500 - point.x},${point.y}`
    );
  }
});

test("exterior shoulder and lower torso corners remain on the merged silhouette", () => {
  const body = solve().body;
  const corners = torsoCorners(defaultParams, body);

  for (const [label, point] of Object.entries(corners)) {
    assert.equal(isPointInPolygon(point, body.ribCageGuide), false, `${label} should be outside ribcage`);
    assert.ok(body.torsoOutline.points.some(candidate => pointsEqual(candidate, point)), `${label} should remain`);
  }
});

test("deprecated connector angle remains save-compatible but has no geometric effect", () => {
  assert.equal(defaultParams.ribCageTopConnectorAngle, 40);

  const low = solve({ ...ATTACHED_BODY_PARAMS, ribCageTopConnectorAngle: 30 }).body.torsoOutline.points;
  const high = solve({ ...ATTACHED_BODY_PARAMS, ribCageTopConnectorAngle: 80 }).body.torsoOutline.points;
  const coordinates = points => points.map(point => [point.x, point.y]);

  assert.deepEqual(coordinates(low), coordinates(high));
});

test("separate ribcage mode preserves the original two-shape output", () => {
  const body = solve({ ...ATTACHED_BODY_PARAMS, ribCageSeparate: true }).body;

  assert.equal(body.torsoOutline.points.length, 8);
  assert.equal(body.ribCageShape.points.length, 49);
  assert.deepEqual(body.ribCageShape.points, body.ribCageGuide);
});

test("merged body remains finite and simple across body control extremes", () => {
  for (const yaw of [-1, -0.64, 0, 0.64, 1]) {
    for (const pitch of [-0.5, -0.07, 0.5]) {
      for (const ribCageTilt of [0, 9, 45]) {
        for (const ribCageWidth of [60, 124, 170]) {
          for (const ribCageHeight of [120, 190, 300]) {
            for (const torsoLength of [20, 90, 200]) {
              const label = JSON.stringify({
                yaw,
                pitch,
                ribCageTilt,
                ribCageWidth,
                ribCageHeight,
                torsoLength
              });
              const body = solve({
                yaw,
                pitch,
                ribCageTilt,
                ribCageWidth,
                ribCageHeight,
                torsoLength
              }).body;

              assertValidPolygon(body.torsoOutline.points, `torso ${label}`);

              if (body.ribCageShape) {
                assertValidPolygon(body.ribCageShape.points, `extra ribcage ${label}`);
              }
            }
          }
        }
      }
    }
  }
});
