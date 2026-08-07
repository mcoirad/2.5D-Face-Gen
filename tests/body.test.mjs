import assert from "node:assert/strict";
import test from "node:test";

import { isPointInPolygon, lerp } from "../src/geometry.js";
import { defaultParams } from "../src/params.js";
import {
  defaultFeatureLandmarks,
  defaultOutlineLandmarks,
  solveFaceRig
} from "../src/rig.js";
import { renderFaceSvg } from "../src/svgRenderer.js";

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

function assertPointNear(actual, expected, label) {
  assert.ok(pointsEqual(actual, expected), `${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
}

test("medial clavicle anchors straddle the sternal notch at front view", () => {
  const body = solve({ yaw: 0, pitch: 0, clavicleMedialWidth: 20 }).body;
  const { clavicleMedialLeft, clavicleMedialRight, sternalNotch } = body.landmarks;
  const midpoint = {
    x: (clavicleMedialLeft.x + clavicleMedialRight.x) / 2,
    y: (clavicleMedialLeft.y + clavicleMedialRight.y) / 2
  };

  assertPointNear(midpoint, sternalNotch, "medial midpoint");
  assert.ok(clavicleMedialLeft.x < sternalNotch.x);
  assert.ok(clavicleMedialRight.x > sternalNotch.x);
  assert.ok(Math.abs(clavicleMedialRight.x - clavicleMedialLeft.x - 20) <= EPSILON);
});

test("medial width changes anchor separation and collapses toward profile", () => {
  const narrow = solve({ yaw: 0, pitch: 0, clavicleMedialWidth: 0 }).body;
  const wide = solve({ yaw: 0, pitch: 0, clavicleMedialWidth: 40 }).body;

  assertPointNear(narrow.landmarks.clavicleMedialLeft, narrow.landmarks.sternalNotch, "zero-width left anchor");
  assertPointNear(narrow.landmarks.clavicleMedialRight, narrow.landmarks.sternalNotch, "zero-width right anchor");
  assert.ok(Math.abs(
    wide.landmarks.clavicleMedialRight.x - wide.landmarks.clavicleMedialLeft.x - 40
  ) <= EPSILON);
  assertPointNear(wide.landmarks.sternalNotch, narrow.landmarks.sternalNotch, "width-independent notch");
  assertPointNear(wide.landmarks.clavicleLeft, narrow.landmarks.clavicleLeft, "width-independent lateral left");
  assertPointNear(wide.landmarks.clavicleRight, narrow.landmarks.clavicleRight, "width-independent lateral right");

  const profile = solve({ yaw: 1, pitch: 0, clavicleMedialWidth: 40 }).body.landmarks;
  assert.ok(Math.abs(profile.clavicleMedialRight.x - profile.clavicleMedialLeft.x) <= EPSILON);
});

test("sternal notch and xiphoid Z rotate with yaw and pitch", () => {
  const yaw = 0.5;
  const positive = solve({
    yaw,
    pitch: 0,
    sternalNotchZ: 60,
    xiphoidZ: 60
  }).body.landmarks;
  const negative = solve({
    yaw: -yaw,
    pitch: 0,
    sternalNotchZ: 60,
    xiphoidZ: 60
  }).body.landmarks;
  const flat = solve({
    yaw,
    pitch: 0,
    sternalNotchZ: 0,
    xiphoidZ: 0
  }).body.landmarks;

  assert.ok(positive.sternalNotch.x < flat.sternalNotch.x, "positive yaw should move forward notch depth left");
  assert.ok(positive.xiphoid.x < flat.xiphoid.x, "positive yaw should move forward xiphoid depth left");
  assert.ok(Math.abs(positive.sternalNotch.x + negative.sternalNotch.x - 500) <= EPSILON);
  assert.ok(Math.abs(positive.xiphoid.x + negative.xiphoid.x - 500) <= EPSILON);

  const pitchedFlat = solve({ yaw: 0, pitch: 0.5, sternalNotchZ: 0, xiphoidZ: 0 }).body.landmarks;
  const pitchedForward = solve({ yaw: 0, pitch: 0.5, sternalNotchZ: 60, xiphoidZ: 60 }).body.landmarks;

  assert.ok(pitchedForward.sternalNotch.y < pitchedFlat.sternalNotch.y);
  assert.ok(pitchedForward.xiphoid.y < pitchedFlat.xiphoid.y);
});

test("clavicle lines connect corresponding anchors with adjustable vertical bow", () => {
  const arched = solve({ clavicleCurve: -12 }).body;
  const dipped = solve({ clavicleCurve: 12 }).body;

  assert.equal(arched.clavicleLines.length, 2);
  assert.deepEqual(arched.clavicleLines.map(line => line.side), ["left", "right"]);

  for (const [index, side] of ["left", "right"].entries()) {
    const archedLine = arched.clavicleLines[index];
    const dippedLine = dipped.clavicleLines[index];

    assert.equal(archedLine.start, arched.landmarks[`clavicle${side[0].toUpperCase()}${side.slice(1)}`]);
    assert.equal(archedLine.end, arched.landmarks[`clavicleMedial${side[0].toUpperCase()}${side.slice(1)}`]);
    assertPointNear(archedLine.start, dippedLine.start, `${side} curve-independent start`);
    assertPointNear(archedLine.end, dippedLine.end, `${side} curve-independent end`);
    assert.ok(Math.abs(archedLine.control.x - dippedLine.control.x) <= EPSILON);
    assert.ok(Math.abs(dippedLine.control.y - archedLine.control.y - 24) <= EPSILON);
  }
});

test("clavicle length shortens from the shoulder side while preserving medial attachment", () => {
  const full = solve({ clavicleLength: 1, clavicleCurve: 20 }).body;
  const half = solve({ clavicleLength: 0.5, clavicleCurve: 20 }).body;
  const zero = solve({ clavicleLength: 0, clavicleCurve: 20 }).body;

  for (const [index, side] of ["left", "right"].entries()) {
    const medialKey = `clavicleMedial${side[0].toUpperCase()}${side.slice(1)}`;
    const lateralKey = `clavicle${side[0].toUpperCase()}${side.slice(1)}`;
    const fullLine = full.clavicleLines[index];
    const halfLine = half.clavicleLines[index];
    const zeroLine = zero.clavicleLines[index];
    const expectedHalfStart = {
      x: (full.landmarks[lateralKey].x + full.landmarks[medialKey].x) / 2,
      y: (full.landmarks[lateralKey].y + full.landmarks[medialKey].y) / 2
    };

    assert.equal(fullLine.start, full.landmarks[lateralKey]);
    assert.equal(fullLine.end, full.landmarks[medialKey]);
    assertPointNear(halfLine.start, expectedHalfStart, `${side} half-length start`);
    assertPointNear(halfLine.end, half.landmarks[medialKey], `${side} fixed half-length medial end`);
    assertPointNear(zeroLine.start, zero.landmarks[medialKey], `${side} zero-length start`);
    assertPointNear(zeroLine.end, zero.landmarks[medialKey], `${side} zero-length end`);
    assert.ok(Math.abs(halfLine.control.y - (halfLine.start.y + halfLine.end.y) / 2 - 10) <= EPSILON);
    assertPointNear(zeroLine.control, zero.landmarks[medialKey], `${side} zero-length control`);
  }
});

test("clavicle visibility toggle hides paths without removing medial guide landmarks", () => {
  assert.equal(defaultParams.showClavicles, true);
  assert.equal(defaultParams.clavicleMedialWidth, 20);
  assert.equal(defaultParams.clavicleLength, 1);
  assert.equal(defaultParams.clavicleCurve, 0);

  const visible = solve({ showClavicles: true, showGuides: true });
  const hidden = solve({ showClavicles: false, showGuides: true });
  const visibleSvg = renderFaceSvg(visible);
  const hiddenSvg = renderFaceSvg(hidden);

  assert.equal(visible.body.clavicleLines.length, 2);
  assert.equal(hidden.body.clavicleLines.length, 0);
  assert.ok(hidden.body.landmarks.clavicleMedialLeft);
  assert.ok(hidden.body.landmarks.clavicleMedialRight);
  assert.ok(visibleSvg.includes('class="clavicle-left"'));
  assert.ok(visibleSvg.includes('class="clavicle-right"'));
  assert.equal(hiddenSvg.includes('class="clavicle-left"'), false);
  assert.equal(hiddenSvg.includes('class="clavicle-right"'), false);
  assert.ok(hiddenSvg.includes(`cx="${hidden.body.landmarks.clavicleMedialLeft.x}"`));
  assert.ok(hiddenSvg.includes(`cx="${hidden.body.landmarks.clavicleMedialRight.x}"`));
});

test("clavicle SVG paths use quadratic rounded strokes in body layer order", () => {
  const rig = solve({ showClavicles: true, showGuides: true, clavicleCurve: 8 });
  const svg = renderFaceSvg(rig);
  const leftPath = svg.match(/<path\s+class="clavicle-left"[\s\S]*?\/>/)?.[0];
  const rightPath = svg.match(/<path\s+class="clavicle-right"[\s\S]*?\/>/)?.[0];

  for (const [side, path] of [["left", leftPath], ["right", rightPath]]) {
    assert.ok(path, `${side} path should render`);
    assert.match(path, /d="M [^\"]+ Q [^\"]+"/);
    assert.match(path, /fill="none"/);
    assert.match(path, /stroke="black"/);
    assert.match(path, /stroke-width="3"/);
    assert.match(path, /stroke-linecap="round"/);
  }

  assert.ok(svg.indexOf('class="clavicle-left"') < svg.indexOf('stroke-dasharray="7 5"'));
});

test("clavicle and central chest geometry stays finite across control extremes", () => {
  for (const yaw of [-1, 0, 1]) {
    for (const pitch of [-0.5, 0, 0.5]) {
      for (const clavicleMedialWidth of [0, 50]) {
        for (const clavicleLength of [0, 1]) {
          for (const clavicleCurve of [-30, 30]) {
            for (const sternalNotchZ of [0, 60]) {
              for (const xiphoidZ of [0, 60]) {
                const body = solve({
                  yaw,
                  pitch,
                  clavicleMedialWidth,
                  clavicleLength,
                  clavicleCurve,
                  sternalNotchZ,
                  xiphoidZ
                }).body;
                const geometry = [
                  body.landmarks.clavicleMedialLeft,
                  body.landmarks.clavicleMedialRight,
                  body.landmarks.sternalNotch,
                  body.landmarks.xiphoid,
                  ...body.clavicleLines.flatMap(line => [line.start, line.control, line.end])
                ];

                for (const point of geometry) {
                  assert.ok(Number.isFinite(point.x));
                  assert.ok(Number.isFinite(point.y));
                }
              }
            }
          }
        }
      }
    }
  }
});

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
