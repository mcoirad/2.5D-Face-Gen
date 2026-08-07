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
const OFFSET_INTERSECTION_BODY_PARAMS = {
  yaw: -0.04,
  pitch: -0.02,
  faceWidth: 180,
  faceHeight: 165,
  neckTopWidth: 50,
  neckBottomWidth: 58,
  neckLength: 65,
  neckOverlap: 10,
  torsoWidth: 161,
  shoulderRadius: 29,
  shoulderGap: 21,
  torsoLength: 90,
  torsoNarrowing: 0.25,
  ribCageWidth: 107,
  ribCageHeight: 196,
  ribCageY: 30,
  ribCageTilt: 15,
  ribCageSeparate: false,
  showClothing: true,
  clothingCollarHeight: 9,
  clothingCollarOpeningWidth: 1,
  clothingCollarOpeningDepth: 64
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

function boundsForShapes(shapes) {
  const points = shapes.flatMap(shape => shape.points);

  return {
    minX: Math.min(...points.map(point => point.x)),
    maxX: Math.max(...points.map(point => point.x)),
    minY: Math.min(...points.map(point => point.y)),
    maxY: Math.max(...points.map(point => point.y))
  };
}

function renderPointPathForTest(points) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
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

test("clothing and breastplate defaults preserve existing faces", () => {
  assert.equal(defaultParams.showClothing, false);
  assert.equal(defaultParams.clothingColor, "#3f4a5a");
  assert.equal(defaultParams.clothingOffset, 3);
  assert.equal(defaultParams.clothingCollarHeight, 0);
  assert.equal(defaultParams.clothingCollarOpeningWidth, 0.4);
  assert.equal(defaultParams.clothingCollarOpeningDepth, 0);
  assert.equal(defaultParams.showArmor, true);
  assert.equal(defaultParams.showPauldrons, true);
  assert.equal(defaultParams.showBreastplate, false);
  assert.equal(defaultParams.breastplateOffset, 8);
  assert.equal(defaultParams.breastplateNeckClearance, 8);
  assert.equal(defaultParams.breastplateNeckDepth, 24);

  const rig = solve();

  assert.equal(rig.body.clothing, null);
  assert.equal(rig.armor.breastplate, null);
  assert.ok(rig.armor.pauldronLeft);
  assert.ok(rig.armor.pauldronRight);
});

test("clothing collar follows the neck and the centered V responds to width and depth", () => {
  const low = solve({
    yaw: 0,
    pitch: 0,
    showClothing: true,
    clothingOffset: 0,
    clothingCollarHeight: 0,
    clothingCollarOpeningDepth: 0
  }).body;
  const narrow = solve({
    yaw: 0,
    pitch: 0,
    showClothing: true,
    clothingOffset: 0,
    clothingCollarHeight: 30,
    clothingCollarOpeningWidth: 0.25,
    clothingCollarOpeningDepth: 20
  }).body;
  const wide = solve({
    yaw: 0,
    pitch: 0,
    showClothing: true,
    clothingOffset: 0,
    clothingCollarHeight: 30,
    clothingCollarOpeningWidth: 0.75,
    clothingCollarOpeningDepth: 40
  }).body;

  assertPointNear(low.clothing.collarTopLeft, low.neckBottomLeft, "zero-height left collar");
  assertPointNear(low.clothing.collarTopRight, low.neckBottomRight, "zero-height right collar");
  assert.equal(low.clothing.neckline.length, 2, "zero-depth opening should remain closed");
  assert.ok(narrow.clothing.collarTopLeft.y < low.clothing.collarTopLeft.y);
  assert.equal(narrow.clothing.collarHeight, 30);
  assert.ok(wide.clothing.neckline[2].y > narrow.clothing.neckline[2].y, "deeper V should move its tip down");

  const narrowWidth = narrow.clothing.neckline[3].x - narrow.clothing.neckline[1].x;
  const wideWidth = wide.clothing.neckline[3].x - wide.clothing.neckline[1].x;
  assert.ok(wideWidth > narrowWidth, "opening width should expand symmetrically");
  assert.ok(Math.abs(wide.clothing.neckline[2].x - 250) <= EPSILON, "V should remain centered");

  const exposedNeckPoint = {
    x: (low.neckBottomLeft.x + low.neckBottomRight.x) / 2,
    y: low.neckBottomLeft.y - 1
  };
  assert.equal(isPointInPolygon(exposedNeckPoint, low.clothing.cutout), true);
});

test("polygon offsets keep clothing closer than the default breastplate and use distinct joins", () => {
  const rig = solve({
    yaw: 0,
    pitch: 0,
    showClothing: true,
    showBreastplate: true,
    clothingCollarOpeningDepth: 0
  });
  const source = solve({
    yaw: 0,
    pitch: 0,
    showClothing: true,
    clothingOffset: 0,
    clothingCollarOpeningDepth: 0
  });
  const sourceBounds = boundsForShapes(source.body.clothing.shapes);
  const clothingBounds = boundsForShapes(rig.body.clothing.shapes);
  const breastplateBounds = boundsForShapes(rig.armor.breastplate.shapes);

  assert.ok(clothingBounds.minX < sourceBounds.minX);
  assert.ok(clothingBounds.maxX > sourceBounds.maxX);
  assert.ok(breastplateBounds.minX < clothingBounds.minX);
  assert.ok(breastplateBounds.maxX > clothingBounds.maxX);
  assert.ok(rig.body.clothing.shapes[0].points.length > rig.armor.breastplate.shapes[0].points.length);
});

test("clothing offset trims collapsed concavity loops instead of reverting to zero", () => {
  const zero = solve({ ...OFFSET_INTERSECTION_BODY_PARAMS, clothingOffset: 0 }).body.clothing;
  const zeroPoints = zero.shapes[0].points;
  let previousBounds = boundsForShapes(zero.shapes);

  for (let clothingOffset = 1; clothingOffset <= 12; clothingOffset += 1) {
    const clothing = solve({ ...OFFSET_INTERSECTION_BODY_PARAMS, clothingOffset }).body.clothing;
    const bounds = boundsForShapes(clothing.shapes);

    assert.equal(clothing.shapes.length, 1, `offset ${clothingOffset} should discard local loop cycles`);
    assertValidPolygon(clothing.shapes[0].points, `resolved clothing offset ${clothingOffset}`);
    assert.notDeepEqual(clothing.shapes[0].points, zeroPoints, `offset ${clothingOffset} should not fall back to zero`);
    assert.ok(bounds.minX < previousBounds.minX + EPSILON, `offset ${clothingOffset} minX should expand`);
    assert.ok(bounds.maxX > previousBounds.maxX - EPSILON, `offset ${clothingOffset} maxX should expand`);
    assert.ok(bounds.minY < previousBounds.minY + EPSILON, `offset ${clothingOffset} minY should expand`);
    assert.ok(bounds.maxY > previousBounds.maxY - EPSILON, `offset ${clothingOffset} maxY should expand`);
    previousBounds = bounds;
  }

  const resolved = solve({ ...OFFSET_INTERSECTION_BODY_PARAMS, clothingOffset: 9 }).body.clothing;
  const repeated = solve({ ...OFFSET_INTERSECTION_BODY_PARAMS, clothingOffset: 9 }).body.clothing;
  const mirrored = solve({
    ...OFFSET_INTERSECTION_BODY_PARAMS,
    yaw: -OFFSET_INTERSECTION_BODY_PARAMS.yaw,
    clothingOffset: 9
  }).body.clothing;

  assert.deepEqual(resolved.shapes, repeated.shapes, "cleaned point ordering should be deterministic");
  assert.equal(resolved.shapes[0].points.length, mirrored.shapes[0].points.length);
  for (const point of resolved.shapes[0].points) {
    assert.ok(
      mirrored.shapes[0].points.some(candidate => pointsEqual(candidate, { x: 500 - point.x, y: point.y })),
      `mirrored cleaned clothing should contain ${500 - point.x},${point.y}`
    );
  }
});

test("mitered breastplate offsets use the same intersection cleanup", () => {
  const overrides = {
    yaw: -1,
    pitch: -0.5,
    torsoWidth: 100,
    torsoLength: 90,
    ribCageWidth: 60,
    ribCageHeight: 120,
    ribCageY: 30,
    shoulderRadius: 29,
    shoulderGap: 21,
    neckBottomWidth: 58,
    showArmor: true,
    showBreastplate: true,
    showPauldrons: false
  };
  const zero = solve({ ...overrides, breastplateOffset: 0 }).armor.breastplate;
  const expanded = solve({ ...overrides, breastplateOffset: 24 }).armor.breastplate;
  const zeroBounds = boundsForShapes(zero.shapes);
  const expandedBounds = boundsForShapes(expanded.shapes);

  assert.notDeepEqual(expanded.shapes, zero.shapes);
  expanded.shapes.forEach((shape, index) => assertValidPolygon(shape.points, `resolved breastplate ${index}`));
  assert.ok(expandedBounds.minX < zeroBounds.minX);
  assert.ok(expandedBounds.maxX > zeroBounds.maxX);
  assert.ok(expandedBounds.minY < zeroBounds.minY);
  assert.ok(expandedBounds.maxY > zeroBounds.maxY);
});

test("pathological offset geometry retains the final source fallback", () => {
  const overrides = {
    yaw: -0.64,
    pitch: -0.5,
    torsoWidth: 100,
    torsoLength: 90,
    ribCageWidth: 60,
    ribCageHeight: 196,
    ribCageY: 40,
    shoulderRadius: 29,
    shoulderGap: 21,
    neckBottomWidth: 58,
    showClothing: true
  };
  const zero = solve({ ...overrides, clothingOffset: 0 }).body.clothing;
  const pathological = solve({ ...overrides, clothingOffset: 12 }).body.clothing;

  assert.deepEqual(pathological.shapes, zero.shapes);
  pathological.shapes.forEach((shape, index) => assertValidPolygon(shape.points, `fallback clothing ${index}`));
});

test("breastplate U opening clears the neck and responds monotonically", () => {
  const shallow = solve({
    yaw: 0,
    pitch: 0,
    showBreastplate: true,
    breastplateNeckClearance: 0,
    breastplateNeckDepth: 10
  });
  const deep = solve({
    yaw: 0,
    pitch: 0,
    showBreastplate: true,
    breastplateNeckClearance: 20,
    breastplateNeckDepth: 40
  });
  const shallowU = shallow.armor.breastplate;
  const deepU = deep.armor.breastplate;
  const shallowMid = shallowU.neckline[8];
  const deepMid = deepU.neckline[8];

  assert.ok(deepU.neckline[0].x < shallowU.neckline[0].x);
  assert.ok(deepU.neckline.at(-1).x > shallowU.neckline.at(-1).x);
  assert.ok(deepMid.y > shallowMid.y);
  assert.ok(Math.abs(deepMid.y - deep.body.neckBottomLeft.y - 40) <= EPSILON);

  const neckPoint = {
    x: (deep.body.neckBottomLeft.x + deep.body.neckBottomRight.x) / 2,
    y: deep.body.neckBottomLeft.y - 1
  };
  assert.equal(isPointInPolygon(neckPoint, deepU.cutout), true, "neck should lie inside the armor cutout");
});

test("clothing and breastplate geometry mirrors across yaw", () => {
  const overrides = {
    yaw: 0.64,
    pitch: -0.07,
    showClothing: true,
    clothingCollarHeight: 24,
    clothingCollarOpeningWidth: 0.6,
    clothingCollarOpeningDepth: 30,
    showBreastplate: true,
    breastplateNeckClearance: 16,
    breastplateNeckDepth: 36
  };
  const positive = solve(overrides);
  const negative = solve({ ...overrides, yaw: -overrides.yaw });

  for (const [positiveGarment, negativeGarment] of [
    [positive.body.clothing, negative.body.clothing],
    [positive.armor.breastplate, negative.armor.breastplate]
  ]) {
    const positivePoints = positiveGarment.shapes.flatMap(shape => shape.points);
    const negativePoints = negativeGarment.shapes.flatMap(shape => shape.points);

    assert.equal(positivePoints.length, negativePoints.length);

    for (const point of positivePoints) {
      assert.ok(
        negativePoints.some(candidate => pointsEqual(candidate, { x: 500 - point.x, y: point.y })),
        `mirrored garment should contain ${500 - point.x},${point.y}`
      );
    }

    assert.equal(positiveGarment.neckline.length, negativeGarment.neckline.length);
    for (const point of positiveGarment.neckline) {
      assert.ok(
        negativeGarment.neckline.some(candidate => pointsEqual(candidate, { x: 500 - point.x, y: point.y })),
        `mirrored neckline should contain ${500 - point.x},${point.y}`
      );
    }
  }
});

test("garment openings rotate through the torso projector without visibility thresholds", () => {
  const overrides = {
    pitch: 0,
    sternalNotchZ: 20,
    showClothing: true,
    clothingCollarHeight: 30,
    clothingCollarOpeningWidth: 0.75,
    clothingCollarOpeningDepth: 40,
    showBreastplate: true,
    breastplateNeckClearance: 20,
    breastplateNeckDepth: 40
  };
  const front = solve({ ...overrides, yaw: 0 });
  const frontVWidth = front.body.clothing.neckline[3].x - front.body.clothing.neckline[1].x;
  const frontUWidth = front.armor.breastplate.neckline.at(-1).x
    - front.armor.breastplate.neckline[0].x;
  let previousVWidth = frontVWidth;
  let previousUWidth = frontUWidth;

  for (const yaw of [0.25, 0.5, 0.75, 0.9, 0.99]) {
    const rig = solve({ ...overrides, yaw });
    const clothing = rig.body.clothing;
    const breastplate = rig.armor.breastplate;
    const expectedScale = Math.cos(yaw * Math.PI / 2);
    const expectedCenterX = 250 - overrides.sternalNotchZ * Math.sin(yaw * Math.PI / 2);
    const vWidth = clothing.neckline[3].x - clothing.neckline[1].x;
    const uWidth = breastplate.neckline.at(-1).x - breastplate.neckline[0].x;
    const vCenterX = (clothing.neckline[3].x + clothing.neckline[1].x) / 2;
    const uCenterX = (breastplate.neckline.at(-1).x + breastplate.neckline[0].x) / 2;

    assert.ok(Math.abs(vWidth - frontVWidth * expectedScale) <= EPSILON);
    assert.ok(Math.abs(uWidth - frontUWidth * expectedScale) <= EPSILON);
    assert.ok(Math.abs(vCenterX - expectedCenterX) <= EPSILON);
    assert.ok(Math.abs(uCenterX - expectedCenterX) <= EPSILON);
    assert.ok(vWidth < previousVWidth && vWidth > 0);
    assert.ok(uWidth < previousUWidth && uWidth > 0);
    assert.equal(clothing.neckline.length, 5, "V should remain authored through near-profile yaw");
    assert.equal(breastplate.neckline.length, 17, "U should remain authored through near-profile yaw");
    previousVWidth = vWidth;
    previousUWidth = uWidth;
  }
});

test("garment opening depth is projected from model Y and mirrors with yaw", () => {
  const overrides = {
    yaw: 0.6,
    pitch: 0.3,
    showClothing: true,
    clothingCollarHeight: 24,
    clothingCollarOpeningWidth: 0.6,
    clothingCollarOpeningDepth: 20,
    showBreastplate: true,
    breastplateNeckClearance: 12,
    breastplateNeckDepth: 30
  };
  const positive = solve(overrides);
  const negative = solve({ ...overrides, yaw: -overrides.yaw });
  const clothing = positive.body.clothing;
  const breastplate = positive.armor.breastplate;
  const collarBaselineY = (clothing.neckline[0].y + clothing.neckline.at(-1).y) / 2;
  const uBaselineY = (breastplate.neckline[0].y + breastplate.neckline.at(-1).y) / 2;

  assert.ok(Math.abs(clothing.neckline[2].y - collarBaselineY - 20 * Math.cos(overrides.pitch)) <= EPSILON);
  assert.ok(Math.abs(breastplate.neckline[8].y - uBaselineY - 30 * Math.cos(overrides.pitch)) <= EPSILON);

  for (const [positiveOpening, negativeOpening] of [
    [positive.body.clothing.neckline, negative.body.clothing.neckline],
    [positive.armor.breastplate.neckline, negative.armor.breastplate.neckline]
  ]) {
    assert.equal(positiveOpening.length, negativeOpening.length);

    for (let index = 0; index < positiveOpening.length; index += 1) {
      const mirrored = negativeOpening[negativeOpening.length - 1 - index];
      assert.ok(Math.abs(mirrored.x - (500 - positiveOpening[index].x)) <= EPSILON);
      assert.ok(Math.abs(mirrored.y - positiveOpening[index].y) <= EPSILON);
    }
  }
});

test("profile garment openings collapse safely while preserving neck clearance", () => {
  for (const yaw of [-1, 1]) {
    const rig = solve({
      yaw,
      pitch: 0.4,
      sternalNotchZ: 60,
      showClothing: true,
      clothingCollarHeight: 80,
      clothingCollarOpeningWidth: 1,
      clothingCollarOpeningDepth: 100,
      showBreastplate: true,
      breastplateNeckClearance: 40,
      breastplateNeckDepth: 100
    });
    const garments = [rig.body.clothing, rig.armor.breastplate];

    for (const garment of garments) {
      assert.ok(garment.cutouts.length >= 1);
      garment.cutouts.forEach((points, index) => assertValidPolygon(points, `profile cutout ${yaw}:${index}`));

      for (const point of garment.neckline) {
        assert.ok(Number.isFinite(point.x));
        assert.ok(Number.isFinite(point.y));
      }
    }

    const neckPoint = {
      x: (rig.body.neckBottomLeft.x + rig.body.neckBottomRight.x) / 2,
      y: rig.body.neckBottomLeft.y - 1
    };
    assert.ok(
      rig.armor.breastplate.cutouts.some(points => isPointInPolygon(neckPoint, points)),
      "persistent profile cutout should continue exposing the neck"
    );
  }
});

test("SVG subtracts and strokes the same resolved garment cutout cycles", () => {
  const rig = solve({
    yaw: 0.7,
    pitch: -0.2,
    sternalNotchZ: 45,
    showClothing: true,
    clothingCollarHeight: 30,
    clothingCollarOpeningWidth: 0.8,
    clothingCollarOpeningDepth: 36,
    showBreastplate: true,
    breastplateNeckClearance: 18,
    breastplateNeckDepth: 42
  });
  const svg = renderFaceSvg(rig);

  assert.ok(svg.includes('id="clothing-shell-clip"'));
  assert.ok(svg.includes('id="breastplate-shell-clip"'));

  for (const [className, garment] of [
    ["clothing", rig.body.clothing],
    ["breastplate", rig.armor.breastplate]
  ]) {
    for (const cutout of garment.cutouts) {
      const path = `d="${renderPointPathForTest(cutout)} Z"`;
      assert.ok(svg.split(path).length - 1 >= 2, `${className} cutout should be used by its mask and stroke`);
    }
  }
});

test("garment toggles and SVG ordering preserve armor part independence", () => {
  const masterOff = solve({ showArmor: false, showBreastplate: true, showPauldrons: true });
  const plateOnly = solve({ showArmor: true, showBreastplate: true, showPauldrons: false });
  const layered = solve({
    showClothing: true,
    clothingCollarOpeningDepth: 24,
    showArmor: true,
    showBreastplate: true,
    showPauldrons: true,
    showGuides: true
  });
  const svg = renderFaceSvg(layered);

  assert.equal(masterOff.armor.breastplate, null);
  assert.equal(masterOff.armor.pauldronLeft, null);
  assert.ok(plateOnly.armor.breastplate);
  assert.equal(plateOnly.armor.pauldronLeft, null);
  assert.equal(plateOnly.armor.pauldronRight, null);
  assert.ok(svg.includes('id="clothing-cutout-mask"'));
  assert.ok(svg.includes('id="breastplate-cutout-mask"'));
  assert.ok(svg.includes('class="clothing-shell clothing-0"'));
  assert.ok(svg.includes('class="breastplate-shell breastplate-0"'));
  assert.match(svg.match(/class="clothing-shell clothing-0"[\s\S]*?\/>/)?.[0] ?? "", /stroke-width="4"/);
  assert.match(svg.match(/class="breastplate-shell breastplate-0"[\s\S]*?\/>/)?.[0] ?? "", /stroke-width="4"/);
  assert.ok(svg.indexOf('class="clavicle-left"') < svg.indexOf('class="clothing-layer"'));
  assert.ok(svg.indexOf('class="clothing-layer"') < svg.indexOf('class="breastplate-layer"'));
  assert.ok(svg.indexOf('class="breastplate-layer"') < svg.indexOf('stroke-dasharray="7 5"'));
});

test("garment source ignores separate-ribcage display mode", () => {
  const mergedRig = solve({ ...ATTACHED_BODY_PARAMS, showClothing: true, showBreastplate: true });
  const merged = mergedRig.body;
  const separateRig = solve({
    ...ATTACHED_BODY_PARAMS,
    ribCageSeparate: true,
    showClothing: true,
    showBreastplate: true
  });
  const separate = separateRig.body;

  assert.deepEqual(merged.clothing.shapes, separate.clothing.shapes);
  assert.deepEqual(mergedRig.armor.breastplate.shapes, separateRig.armor.breastplate.shapes);
  assertValidPolygon(separateRig.armor.breastplate.shapes[0].points, "separate-mode breastplate");
});

test("offset cycles merge only when expansion makes them overlap", () => {
  const detached = solve({
    showClothing: true,
    clothingOffset: 0,
    torsoLength: 20,
    ribCageY: 0,
    ribCageHeight: 30
  }).body.clothing;
  const touching = solve({
    showClothing: true,
    clothingOffset: 12,
    torsoLength: 20,
    ribCageY: 0,
    ribCageHeight: 30
  }).body.clothing;
  const farApart = solve({
    showClothing: true,
    clothingOffset: 12,
    torsoLength: 20,
    ribCageY: 100,
    ribCageHeight: 30
  }).body.clothing;

  assert.equal(detached.shapes.length, 2);
  assert.equal(touching.shapes.length, 1, "overlapping offsets should reunify automatically");
  assert.equal(farApart.shapes.length, 2, "disjoint cycles should not gain connector geometry");
  farApart.shapes.forEach((shape, index) => assertValidPolygon(shape.points, `disjoint garment ${index}`));
});

test("garment geometry remains finite and simple across pose and control extremes", () => {
  for (const yaw of [-1, 0, 1]) {
    for (const pitch of [-0.5, 0.5]) {
      for (const clothingOffset of [0, 12]) {
        for (const breastplateOffset of [0, 24]) {
          const rig = solve({
            yaw,
            pitch,
            showClothing: true,
            clothingOffset,
            clothingCollarHeight: 80,
            clothingCollarOpeningWidth: 1,
            clothingCollarOpeningDepth: 100,
            showBreastplate: true,
            breastplateOffset,
            breastplateNeckClearance: 40,
            breastplateNeckDepth: 100
          });
          const garments = [rig.body.clothing, rig.armor.breastplate];

          for (const [garmentIndex, garment] of garments.entries()) {
            for (const [shapeIndex, shape] of garment.shapes.entries()) {
              assertValidPolygon(shape.points, `garment ${garmentIndex}:${shapeIndex} at ${yaw},${pitch}`);
            }

            for (const [cutoutIndex, cutout] of garment.cutouts.entries()) {
              assertValidPolygon(cutout, `garment cutout ${garmentIndex}:${cutoutIndex} at ${yaw},${pitch}`);
            }

            for (const point of [...garment.cutout, ...garment.neckline]) {
              assert.ok(Number.isFinite(point.x));
              assert.ok(Number.isFinite(point.y));
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
