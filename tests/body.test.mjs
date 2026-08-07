import assert from "node:assert/strict";
import test from "node:test";

import { isPointInPolygon, lerp } from "../src/geometry.js";
import {
  colorConfig,
  defaultParams,
  sliderConfig,
  toggleConfig
} from "../src/params.js";
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
  assert.equal(defaultParams.clothingVTipDepth, 0);
  assert.equal(defaultParams.showClothingGildedEdge, false);
  assert.equal(defaultParams.clothingGildedEdgeColor, "#d4af37");
  assert.equal(defaultParams.clothingGildedEdgeWidth, 4);
  assert.deepEqual(sliderConfig.clothingGildedEdgeWidth, [1, 16, 1]);
  assert.equal(colorConfig.clothingGildedEdgeColor, true);
  assert.equal(toggleConfig.showClothingGildedEdge, true);
  assert.equal(defaultParams.showArmor, true);
  assert.equal(defaultParams.showPauldrons, true);
  assert.equal(defaultParams.showBreastplate, false);
  assert.equal(defaultParams.breastplateOffset, 8);
  assert.equal(defaultParams.breastplateNeckClearance, 8);
  assert.equal(defaultParams.breastplateNeckDepth, 24);
  assert.equal(defaultParams.breastplateNeckWrapDepth, 0);
  assert.deepEqual(sliderConfig.breastplateNeckWrapDepth, [0, 100, 1]);

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
  const shallowBottomY = Math.max(...shallowU.neckline.map(point => point.y));
  const deepBottomY = Math.max(...deepU.neckline.map(point => point.y));

  assert.ok(deepU.neckline[0].x < shallowU.neckline[0].x);
  assert.ok(deepU.neckline.at(-1).x > shallowU.neckline.at(-1).x);
  assert.ok(deepBottomY > shallowBottomY);
  assert.ok(Math.abs(deepBottomY - deep.body.neckBottomLeft.y - 40) <= EPSILON);

  for (const point of deepU.neckline) {
    const lateralAmount = (point.x - 250) / deepU.apertureRadii.x;
    const expectedY = deep.body.neckBottomLeft.y
      + 40 * (1 - lateralAmount * lateralAmount);

    assert.ok(Math.abs(point.y - expectedY) <= EPSILON, "front aperture should retain the parabolic U");
  }

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
    const ringMinX = Math.min(...breastplate.apertureRing.map(point => point.x));
    const ringMaxX = Math.max(...breastplate.apertureRing.map(point => point.x));

    assert.ok(Math.abs(vWidth - frontVWidth * expectedScale) <= EPSILON);
    assert.ok(Math.abs(vCenterX - expectedCenterX) <= EPSILON);
    assert.ok(Math.abs(uWidth - (ringMaxX - ringMinX)) <= EPSILON);
    assert.ok(Math.abs(uCenterX - 250) <= EPSILON);
    assert.ok(vWidth < previousVWidth && vWidth > 0);
    assert.ok(uWidth > 0 && frontUWidth > 0);
    assert.equal(clothing.neckline.length, 5, "V should remain authored through near-profile yaw");
    assert.ok(breastplate.neckline.length >= 2, "aperture should retain a visible lower envelope");
    previousVWidth = vWidth;
  }
});

test("garment opening depth is projected from model Y and mirrors with yaw", () => {
  const overrides = {
    yaw: 0.6,
    pitch: 0.3,
    sternalNotchZ: 20,
    xiphoidZ: 20,
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

  assert.ok(Math.abs(clothing.neckline[2].y - collarBaselineY - 20 * Math.cos(overrides.pitch)) <= EPSILON);
  assert.ok(Math.max(...breastplate.neckline.map(point => point.y)) > Math.min(...breastplate.neckline.map(point => point.y)));

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

test("V tip depth rotates the bottom farther than the fixed collar lips", () => {
  const overrides = {
    yaw: 0.8,
    pitch: 0,
    sternalNotchZ: 20,
    xiphoidZ: 20,
    showClothing: true,
    clothingCollarHeight: 30,
    clothingCollarOpeningWidth: 0.8,
    clothingCollarOpeningDepth: 60
  };
  const flat = solve({ ...overrides, clothingVTipDepth: 0 }).body.clothing;
  const medium = solve({ ...overrides, clothingVTipDepth: 40 }).body.clothing;
  const deep = solve({ ...overrides, clothingVTipDepth: 100 }).body.clothing;
  const expectedExtraShift = 100 * Math.sin(overrides.yaw * Math.PI / 2);

  assertPointNear(medium.neckline[1], flat.neckline[1], "left lip should remain fixed");
  assertPointNear(medium.neckline[3], flat.neckline[3], "right lip should remain fixed");
  assert.ok(medium.openingTip.x < flat.openingTip.x);
  assert.ok(deep.openingTip.x < medium.openingTip.x);
  assert.ok(Math.abs(flat.openingTip.x - deep.openingTip.x - expectedExtraShift) <= EPSILON);
  assert.equal(deep.necklinePath.length, 2 * 8 + 3);

  for (const cutout of deep.cutouts) {
    assertValidPolygon(cutout, "depth-graded V cutout");
  }
});

test("V follows the sternal-to-xiphoid chest surface before applying tip depth", () => {
  const overrides = {
    yaw: 0.7,
    pitch: 0,
    sternalNotchZ: 10,
    showClothing: true,
    clothingCollarHeight: 0,
    clothingCollarOpeningWidth: 0.7,
    clothingCollarOpeningDepth: 80,
    clothingVTipDepth: 0
  };
  const flatChest = solve({ ...overrides, xiphoidZ: 10 }).body.clothing;
  const projectedChest = solve({ ...overrides, xiphoidZ: 50 }).body.clothing;

  assertPointNear(projectedChest.neckline[1], flatChest.neckline[1], "surface depth should not move left lip");
  assertPointNear(projectedChest.neckline[3], flatChest.neckline[3], "surface depth should not move right lip");
  assert.ok(projectedChest.openingTip.x < flatChest.openingTip.x);
});

test("deep V can break through the garment edge and remains mirrored", () => {
  const overrides = {
    yaw: 0.9,
    pitch: 0,
    sternalNotchZ: 20,
    xiphoidZ: 26,
    showClothing: true,
    clothingOffset: 3,
    clothingCollarHeight: 30,
    clothingCollarOpeningWidth: 0.8,
    clothingCollarOpeningDepth: 60,
    clothingVTipDepth: 100
  };
  const positive = solve(overrides);
  const negative = solve({ ...overrides, yaw: -overrides.yaw });
  const positiveClothing = positive.body.clothing;
  const negativeClothing = negative.body.clothing;
  const positiveBounds = boundsForShapes(positiveClothing.shapes);
  const negativeBounds = boundsForShapes(negativeClothing.shapes);

  assert.ok(positiveClothing.openingTip.x < positiveBounds.minX, "positive yaw should carry the tip through the left edge");
  assert.ok(negativeClothing.openingTip.x > negativeBounds.maxX, "negative yaw should carry the tip through the right edge");
  assert.ok(Math.abs(negativeClothing.openingTip.x - (500 - positiveClothing.openingTip.x)) <= EPSILON);
  assert.ok(Math.abs(negativeClothing.openingTip.y - positiveClothing.openingTip.y) <= EPSILON);

  for (const clothing of [positiveClothing, negativeClothing]) {
    clothing.cutouts.forEach((cutout, index) => assertValidPolygon(cutout, `edge-breaking cutout ${index}`));
  }
});

test("breastplate aperture separates lateral and front-back clearance", () => {
  const overrides = {
    pitch: 0,
    showBreastplate: true,
    breastplateNeckClearance: 20,
    breastplateNeckDepth: 40
  };
  const frontFlat = solve({ ...overrides, yaw: 0, breastplateNeckWrapDepth: 0 }).armor.breastplate;
  const frontWrapped = solve({ ...overrides, yaw: 0, breastplateNeckWrapDepth: 100 }).armor.breastplate;
  const zeroClearance = solve({
    ...overrides,
    yaw: 0,
    breastplateNeckClearance: 0,
    breastplateNeckWrapDepth: 0
  }).armor.breastplate;
  const profileFlat = solve({ ...overrides, yaw: 1, breastplateNeckWrapDepth: 0 }).armor.breastplate;
  const profileWrapped = solve({ ...overrides, yaw: 1, breastplateNeckWrapDepth: 100 }).armor.breastplate;
  const frontFlatWidth = frontFlat.neckline.at(-1).x - frontFlat.neckline[0].x;
  const frontWrappedWidth = frontWrapped.neckline.at(-1).x - frontWrapped.neckline[0].x;
  const profileFlatWidth = profileFlat.neckline.at(-1).x - profileFlat.neckline[0].x;
  const profileWrappedWidth = profileWrapped.neckline.at(-1).x - profileWrapped.neckline[0].x;

  assert.ok(Math.abs(frontWrappedWidth - frontFlatWidth) <= EPSILON);
  assert.ok(Math.abs(profileWrappedWidth - profileFlatWidth - 200) <= EPSILON);
  assert.equal(frontWrapped.apertureRadii.x, frontFlat.apertureRadii.x);
  assert.equal(frontWrapped.apertureRadii.z - frontFlat.apertureRadii.z, 100);
  assert.equal(frontFlat.apertureRadii.x - zeroClearance.apertureRadii.x, 20);
  assert.equal(frontFlat.apertureRadii.z - zeroClearance.apertureRadii.z, 20);
  assert.equal(frontWrapped.neckWrapDepth, 100);
  profileWrapped.cutouts.forEach((cutout, index) => assertValidPolygon(cutout, `wrapped aperture cutout ${index}`));
});

test("clothing enlarges the invisible aperture envelope without changing the shirt", () => {
  const overrides = {
    yaw: 0.6,
    pitch: 0,
    showClothing: true,
    clothingOffset: 12,
    clothingCollarHeight: 30,
    clothingCollarOpeningDepth: 24
  };
  const shirtOnly = solve({ ...overrides, showBreastplate: false });
  const layered = solve({ ...overrides, showBreastplate: true });
  const barePlate = solve({
    ...overrides,
    showClothing: false,
    showBreastplate: true
  }).armor.breastplate;
  const layeredPlate = layered.armor.breastplate;

  assert.deepEqual(layered.body.clothing, shirtOnly.body.clothing);
  assert.equal(layeredPlate.apertureRadii.shirtX - barePlate.apertureRadii.shirtX, 12);
  assert.equal(layeredPlate.apertureRadii.shirtZ - barePlate.apertureRadii.shirtZ, 12);
  assert.equal(layeredPlate.apertureRadii.x - barePlate.apertureRadii.x, 12);
  assert.equal(layeredPlate.apertureRadii.z - barePlate.apertureRadii.z, 12);
});

test("closed aperture produces a curved profile envelope without a detail path", () => {
  for (const yaw of [-1, 1]) {
    const rig = solve({
      yaw,
      pitch: 0,
      showBreastplate: true,
      breastplateNeckClearance: 20,
      breastplateNeckDepth: 40,
      breastplateNeckWrapDepth: 60
    });
    const breastplate = rig.armor.breastplate;
    const svg = renderFaceSvg(rig);
    const baselineY = rig.body.neckBottomLeft.y;
    const curvedBranch = breastplate.neckline.filter(point => point.y > baselineY + EPSILON);
    const branchStart = curvedBranch[0];
    const branchMidpoint = curvedBranch[Math.floor(curvedBranch.length / 2)];
    const branchEnd = curvedBranch.at(-1);
    const sideCurvature = Math.abs(
      (branchEnd.x - branchStart.x) * (branchMidpoint.y - branchStart.y)
      - (branchEnd.y - branchStart.y) * (branchMidpoint.x - branchStart.x)
    );

    assert.equal(breastplate.apertureRing.length, 48);
    assert.ok(curvedBranch.length >= 3);
    assert.ok(sideCurvature > EPSILON, "profile aperture boundary should remain curved");
    assert.equal("detailLines" in breastplate, false);
    assert.equal(svg.includes("breastplate-neckline-detail"), false);
    assert.deepEqual(
      solve({
        yaw,
        pitch: 0,
        showBreastplate: true,
        breastplateNeckClearance: 20,
        breastplateNeckDepth: 40,
        breastplateNeckWrapDepth: 60
      }).armor.breastplate.neckline,
      breastplate.neckline,
      "profile envelope ordering should be deterministic"
    );
  }
});

test("deep breastplate aperture breaks through on the facing side and mirrors cleanly", () => {
  const overrides = {
    yaw: 0.8,
    pitch: 0,
    sternalNotchZ: 20,
    xiphoidZ: 20,
    showBreastplate: true,
    breastplateNeckClearance: 20,
    breastplateNeckDepth: 40,
    breastplateNeckWrapDepth: 100
  };
  const positive = solve(overrides).armor.breastplate;
  const negative = solve({ ...overrides, yaw: -overrides.yaw }).armor.breastplate;
  const positiveBounds = boundsForShapes(positive.shapes);
  const negativeBounds = boundsForShapes(negative.shapes);
  const positiveBottom = positive.neckline.reduce((lowest, point) => point.y > lowest.y ? point : lowest);
  const negativeBottom = negative.neckline.reduce((lowest, point) => point.y > lowest.y ? point : lowest);

  assert.ok(positiveBottom.x < positiveBounds.minX);
  assert.ok(negativeBottom.x > negativeBounds.maxX);

  for (const point of positive.neckline) {
    assert.ok(
      negative.neckline.some(candidate => pointsEqual(candidate, { x: 500 - point.x, y: point.y })),
      `mirrored aperture should contain ${500 - point.x},${point.y}`
    );
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

test("closed aperture protects the neck at zero clearance across pose extremes", () => {
  for (const yaw of [-1, -0.5, 0, 0.5, 1]) {
    for (const pitch of [-0.5, 0, 0.5]) {
      const rig = solve({
        yaw,
        pitch,
        showClothing: true,
        clothingOffset: 12,
        showBreastplate: true,
        breastplateNeckClearance: 0,
        breastplateNeckDepth: 100,
        breastplateNeckWrapDepth: 0
      });
      const breastplate = rig.armor.breastplate;
      const neckPoint = {
        x: (rig.body.neckBottomLeft.x + rig.body.neckBottomRight.x) / 2,
        y: (rig.body.neckBottomLeft.y + rig.body.neckBottomRight.y) / 2 - 1
      };

      assert.ok(
        breastplate.cutouts.some(points => isPointInPolygon(neckPoint, points)),
        `neck should remain clear at yaw ${yaw}, pitch ${pitch}`
      );
      assert.ok(breastplate.neckline.every((point, index, points) => (
        index === 0 || point.x >= points[index - 1].x - EPSILON
      )), "resolved lower envelope should be ordered left to right");
    }
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

test("gilded clothing edge replaces the black neckline with a one-sided material band", () => {
  const rig = solve({
    yaw: 0.65,
    pitch: -0.2,
    showClothing: true,
    clothingCollarHeight: 30,
    clothingCollarOpeningWidth: 0.8,
    clothingCollarOpeningDepth: 45,
    clothingVTipDepth: 60,
    showClothingGildedEdge: true,
    clothingGildedEdgeColor: "#f0c040",
    clothingGildedEdgeWidth: 7,
    showBreastplate: true
  });
  const clothing = rig.body.clothing;
  const svg = renderFaceSvg(rig);
  const gildedPath = svg.match(/class="clothing-gilded-edge preserve-material-stroke"[\s\S]*?\/>/)?.[0] ?? "";

  assert.deepEqual(clothing.gildedEdge, { color: "#f0c040", width: 7 });
  assert.ok(svg.includes('class="clothing-gilded-edge-layer"'));
  assert.match(svg.match(/class="clothing-gilded-edge-layer"[\s\S]*?>/)?.[0] ?? "", /mask="url\(#clothing-cutout-mask\)"/);
  assert.match(svg.match(/class="clothing-gilded-edge-layer"[\s\S]*?>/)?.[0] ?? "", /clip-path="url\(#clothing-shell-clip\)"/);
  assert.match(gildedPath, /stroke="#f0c040"/);
  assert.match(gildedPath, /stroke-width="14"/);
  assert.equal(svg.includes('class="clothing-neckline"'), false);
  assert.ok(svg.indexOf('class="clothing-shell clothing-0"') < svg.indexOf('class="clothing-gilded-edge-layer"'));
  assert.ok(svg.indexOf('class="clothing-gilded-edge-layer"') < svg.indexOf('class="breastplate-layer"'));
  assert.match(svg.match(/class="clothing-shell clothing-0"[\s\S]*?\/>/)?.[0] ?? "", /stroke="black"/);
  assert.ok(svg.includes('class="breastplate-neckline"'), "breastplate should retain its black neckline");

  for (const cutout of clothing.cutouts) {
    const path = `d="${renderPointPathForTest(cutout)} Z"`;
    assert.ok(svg.split(path).length - 1 >= 2, "resolved cutout should drive both mask and gilded band");
  }
});

test("gilded edge styling does not alter clothing geometry", () => {
  const overrides = {
    yaw: 0.72,
    pitch: 0.18,
    showClothing: true,
    clothingCollarHeight: 26,
    clothingCollarOpeningWidth: 0.7,
    clothingCollarOpeningDepth: 52,
    clothingVTipDepth: 75
  };
  const plain = solve(overrides).body.clothing;
  const gilded = solve({
    ...overrides,
    showClothingGildedEdge: true,
    clothingGildedEdgeColor: "#ffffff",
    clothingGildedEdgeWidth: 16
  }).body.clothing;

  assert.deepEqual(gilded.shapes, plain.shapes);
  assert.deepEqual(gilded.cutout, plain.cutout);
  assert.deepEqual(gilded.cutouts, plain.cutouts);
  assert.deepEqual(gilded.neckline, plain.neckline);
  assert.deepEqual(gilded.necklinePath, plain.necklinePath);
  assert.equal(plain.gildedEdge, null);
  assert.deepEqual(gilded.gildedEdge, { color: "#ffffff", width: 16 });
});

test("gilded edge follows collar-only, profile, and side-breakthrough cutouts", () => {
  const scenarios = [
    {
      yaw: 0,
      clothingCollarHeight: 30,
      clothingCollarOpeningDepth: 0,
      clothingVTipDepth: 0
    },
    {
      yaw: 1,
      pitch: 0.4,
      clothingCollarHeight: 80,
      clothingCollarOpeningDepth: 100,
      clothingVTipDepth: 100
    },
    {
      yaw: 0.9,
      clothingCollarHeight: 30,
      clothingCollarOpeningWidth: 0.8,
      clothingCollarOpeningDepth: 60,
      clothingVTipDepth: 100
    },
    {
      yaw: 0.4,
      torsoLength: 20,
      ribCageY: 100,
      ribCageHeight: 30,
      clothingCollarHeight: 20,
      clothingCollarOpeningDepth: 25,
      clothingVTipDepth: 40
    }
  ];

  for (const scenario of scenarios) {
    const rig = solve({
      showClothing: true,
      showClothingGildedEdge: true,
      ...scenario
    });
    const clothing = rig.body.clothing;
    const svg = renderFaceSvg(rig);
    const pathCount = svg.match(/class="clothing-gilded-edge preserve-material-stroke"/g)?.length ?? 0;

    assert.equal(pathCount, clothing.cutouts.length);
    if (scenario.ribCageY === 100) {
      assert.equal(clothing.shapes.length, 2, "disjoint garment cycles should share the resolved neckline trim");
    }
    clothing.cutouts.forEach((cutout, index) => assertValidPolygon(cutout, `gilded scenario cutout ${index}`));
  }
});

test("remove-strokes mode preserves gilding while suppressing ordinary strokes", () => {
  const rig = solve({
    removeStrokes: true,
    showClothing: true,
    showClothingGildedEdge: true,
    clothingCollarOpeningDepth: 30
  });
  const svg = renderFaceSvg(rig);

  assert.ok(svg.includes('*:not(.preserve-material-stroke)'));
  assert.ok(svg.includes('class="clothing-gilded-edge preserve-material-stroke"'));
  assert.ok(svg.includes('stroke="#d4af37"'));
  assert.ok(svg.includes('class="clothing-shell clothing-0"'));
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
          for (const clothingVTipDepth of [0, 100]) {
            for (const breastplateNeckWrapDepth of [0, 100]) {
              const rig = solve({
                yaw,
                pitch,
                showClothing: true,
                clothingOffset,
                clothingCollarHeight: 80,
                clothingCollarOpeningWidth: 1,
                clothingCollarOpeningDepth: 100,
                clothingVTipDepth,
                showBreastplate: true,
                breastplateOffset,
                breastplateNeckClearance: 40,
                breastplateNeckDepth: 100,
                breastplateNeckWrapDepth
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
