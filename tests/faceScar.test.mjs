import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { defaultParams, sliderConfig, toggleConfig } from "../src/params.js";
import {
  defaultFeatureLandmarks,
  defaultOutlineLandmarks,
  solveFaceRig
} from "../src/rig.js";
import { renderFaceSvg } from "../src/svgRenderer.js";
import { isPointInPolygon } from "../src/geometry.js";

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

function pointsFor(rig) {
  return rig.features.faceScar.cycles.flat();
}

function centroid(points) {
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length
  };
}

function bounds(points) {
  return {
    minX: Math.min(...points.map(point => point.x)),
    maxX: Math.max(...points.map(point => point.x)),
    minY: Math.min(...points.map(point => point.y)),
    maxY: Math.max(...points.map(point => point.y))
  };
}

function distance(first, second) {
  return Math.hypot(second.x - first.x, second.y - first.y);
}

function midpoint(first, second) {
  return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
}

function cycleAxis(points) {
  const half = Math.floor(points.length / 2);
  return {
    start: midpoint(points[0], points.at(-1)),
    end: midpoint(points[half - 1], points[half])
  };
}

function cycleCenterline(points) {
  const half = Math.floor(points.length / 2);

  return Array.from({ length: half }, (_, index) => (
    midpoint(points[index], points[points.length - 1 - index])
  ));
}

function axisAngleDegrees(points) {
  const axis = cycleAxis(points);
  const angle = Math.atan2(axis.end.y - axis.start.y, axis.end.x - axis.start.x) * 180 / Math.PI;

  return (angle % 180 + 180) % 180;
}

function signedArea(points) {
  return points.reduce((area, point, index) => {
    const next = points[(index + 1) % points.length];
    return area + point.x * next.y - next.x * point.y;
  }, 0) / 2;
}

function orientation(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segmentsCross(a, b, c, d) {
  return orientation(a, b, c) * orientation(a, b, d) < -EPSILON
    && orientation(c, d, a) * orientation(c, d, b) < -EPSILON;
}

function assertValidCycle(points, label = "face scar") {
  assert.ok(points.length >= 4, `${label} should have at least four points`);
  assert.ok(points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
  assert.ok(Math.abs(signedArea(points)) > EPSILON, `${label} should have area`);

  for (let first = 0; first < points.length; first += 1) {
    for (let second = first + 1; second < points.length; second += 1) {
      if (
        first === second
        || (first + 1) % points.length === second
        || (second + 1) % points.length === first
      ) {
        continue;
      }

      assert.equal(
        segmentsCross(
          points[first],
          points[(first + 1) % points.length],
          points[second],
          points[(second + 1) % points.length]
        ),
        false,
        `${label} edges ${first} and ${second} should not cross`
      );
    }
  }
}

test("face scar controls are opt-in, save-compatible, and grouped under Details", () => {
  assert.equal(defaultParams.showFaceScar, false);
  assert.equal(defaultParams.faceScarCenterX, 0);
  assert.equal(defaultParams.faceScarCenterY, 55);
  assert.equal(defaultParams.faceScarAngle, 45);
  assert.equal(defaultParams.faceScarLength, 150);
  assert.equal(defaultParams.faceScarWidth, 4);
  assert.deepEqual(sliderConfig.faceScarCenterX, [-100, 100, 1]);
  assert.deepEqual(sliderConfig.faceScarCenterY, [-80, 150, 1]);
  assert.deepEqual(sliderConfig.faceScarAngle, [-90, 90, 1]);
  assert.deepEqual(sliderConfig.faceScarLength, [20, 260, 1]);
  assert.deepEqual(sliderConfig.faceScarWidth, [1, 16, 1]);
  assert.equal(toggleConfig.showFaceScar, true);

  const mainSource = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  const eyesGroup = mainSource.match(/title: "Eyes",[\s\S]*?open: true/)[0];
  const detailsGroup = mainSource.match(/title: "Details",[\s\S]*?open: false/)[0];

  assert.doesNotMatch(eyesGroup, /showEyeScar|showFaceScar/);
  for (const key of [
    "showEyeScar",
    "eyeScarSide",
    "eyeScarIrisColor",
    "showFaceScar",
    "faceScarCenterX",
    "faceScarCenterY",
    "faceScarAngle",
    "faceScarLength",
    "faceScarWidth"
  ]) {
    assert.match(detailsGroup, new RegExp(`"${key}"`));
  }

  const disabled = solve();
  assert.equal(disabled.features.faceScar, null);
  assert.doesNotMatch(renderFaceSvg(disabled), /face-scar/);
});

test("front-view scar is a deterministic irregular tapered ribbon", () => {
  const first = solve({ showFaceScar: true }).features.faceScar;
  const second = solve({ showFaceScar: true }).features.faceScar;

  assert.deepEqual(first, second);
  assert.equal(first.fill, "#777777");
  assert.equal(first.sampleCount, 24);
  assert.equal(first.requestedWidth, 4);
  assert.equal(first.resolvedWidth, 4);
  assert.equal(first.cycles.length, 1);
  assertValidCycle(first.cycles[0]);

  const cycle = first.cycles[0];
  const half = Math.floor(cycle.length / 2);
  const middleWidth = distance(cycle[Math.floor(half / 2)], cycle[cycle.length - 1 - Math.floor(half / 2)]);
  const firstWidth = distance(cycle[0], cycle.at(-1));
  const lastWidth = distance(cycle[half - 1], cycle[half]);
  const axis = cycleAxis(cycle);

  assert.ok(firstWidth < middleWidth, "upper endpoint should taper");
  assert.ok(lastWidth < middleWidth, "surface-bound lower endpoint should taper");
  assert.ok((axis.end.x - axis.start.x) * (axis.end.y - axis.start.y) > 0, "positive angle should descend right");
});

test("center, angle, length, and width controls act independently at front view", () => {
  const left = centroid(pointsFor(solve({ showFaceScar: true, faceScarCenterX: -20 })));
  const right = centroid(pointsFor(solve({ showFaceScar: true, faceScarCenterX: 20 })));
  const high = centroid(pointsFor(solve({ showFaceScar: true, faceScarCenterY: 35 })));
  const low = centroid(pointsFor(solve({ showFaceScar: true, faceScarCenterY: 75 })));
  assert.ok(left.x < right.x);
  assert.ok(high.y < low.y);

  const positiveAxis = cycleAxis(solve({ showFaceScar: true, faceScarAngle: 45 }).features.faceScar.cycles[0]);
  const negativeAxis = cycleAxis(solve({ showFaceScar: true, faceScarAngle: -45 }).features.faceScar.cycles[0]);
  assert.ok((positiveAxis.end.x - positiveAxis.start.x) * (positiveAxis.end.y - positiveAxis.start.y) > 0);
  assert.ok((negativeAxis.end.x - negativeAxis.start.x) * (negativeAxis.end.y - negativeAxis.start.y) < 0);

  const shortBounds = bounds(pointsFor(solve({ showFaceScar: true, faceScarLength: 60 })));
  const longBounds = bounds(pointsFor(solve({ showFaceScar: true, faceScarLength: 180 })));
  assert.ok(longBounds.maxX - longBounds.minX > shortBounds.maxX - shortBounds.minX);
  assert.ok(longBounds.maxY - longBounds.minY > shortBounds.maxY - shortBounds.minY);

  const thin = solve({ showFaceScar: true, faceScarWidth: 1 }).features.faceScar;
  const thick = solve({ showFaceScar: true, faceScarWidth: 16 }).features.faceScar;
  assert.equal(thin.requestedWidth, 1);
  assert.equal(thick.requestedWidth, 16);
  assert.ok(Math.abs(signedArea(thick.cycles[0])) > Math.abs(signedArea(thin.cycles[0])));
});

test("yaw moves the nose anchor without rotating the authored scar", () => {
  const negative = solve({ showFaceScar: true, yaw: -0.8 });
  const front = solve({ showFaceScar: true, yaw: 0 });
  const positive = solve({ showFaceScar: true, yaw: 0.8 });
  const negativeCenter = centroid(pointsFor(negative));
  const frontCenter = centroid(pointsFor(front));
  const positiveCenter = centroid(pointsFor(positive));

  assert.ok(negativeCenter.x > frontCenter.x);
  assert.ok(positiveCenter.x < frontCenter.x);
  assert.ok(Math.abs(axisAngleDegrees(negative.features.faceScar.cycles[0]) - 45) < EPSILON);
  assert.ok(Math.abs(axisAngleDegrees(front.features.faceScar.cycles[0]) - 45) < EPSILON);
  assert.ok(Math.abs(axisAngleDegrees(positive.features.faceScar.cycles[0]) - 45) < EPSILON);

  let previousCenter = null;
  for (let step = -10; step <= 10; step += 1) {
    const rig = solve({ showFaceScar: true, yaw: step / 10 });
    assert.ok(rig.features.faceScar.cycles.length > 0, `yaw ${step / 10} should retain a visible surface run`);
    rig.features.faceScar.cycles.forEach((cycle, index) => assertValidCycle(cycle, `yaw ${step / 10} cycle ${index}`));
    const currentCenter = centroid(pointsFor(rig));
    if (previousCenter) {
      assert.ok(distance(previousCenter, currentCenter) < 15, "yaw sampling should not pop between adjacent steps");
    }
    previousCenter = currentCenter;
  }
});

test("pitch projects the scar through its surface depth", () => {
  const upward = centroid(pointsFor(solve({ showFaceScar: true, pitch: 0.5 })));
  const neutral = centroid(pointsFor(solve({ showFaceScar: true, pitch: 0 })));
  const downward = centroid(pointsFor(solve({ showFaceScar: true, pitch: -0.5 })));

  assert.ok(upward.y < neutral.y);
  assert.ok(neutral.y < downward.y);
});

test("profile keeps the authored vertical span anchored above the nose", () => {
  const front = solve({ showFaceScar: true, yaw: 0 }).features.faceScar;
  const leftRig = solve({ showFaceScar: true, yaw: -1 });
  const rightRig = solve({ showFaceScar: true, yaw: 1 });
  const leftProfile = leftRig.features.faceScar;
  const rightProfile = rightRig.features.faceScar;

  assert.equal(leftProfile.cycles[0].length, front.cycles[0].length);
  assert.equal(rightProfile.cycles[0].length, front.cycles[0].length);
  leftProfile.cycles.forEach(cycle => assertValidCycle(cycle, "left profile"));
  rightProfile.cycles.forEach(cycle => assertValidCycle(cycle, "right profile"));

  const frontBounds = bounds(front.cycles.flat());
  const leftBounds = bounds(leftProfile.cycles.flat());
  const rightBounds = bounds(rightProfile.cycles.flat());
  const frontHeight = frontBounds.maxY - frontBounds.minY;
  const leftHeight = leftBounds.maxY - leftBounds.minY;
  const rightHeight = rightBounds.maxY - rightBounds.minY;

  assert.ok(Math.abs(leftHeight - frontHeight) < 5);
  assert.ok(Math.abs(rightHeight - frontHeight) < 5);
  assert.ok(Math.abs(leftProfile.anchor.y - (leftRig.features.nose.bridge.y - 15)) < EPSILON);
  assert.ok(Math.abs(rightProfile.anchor.y - (rightRig.features.nose.bridge.y - 15)) < EPSILON);
  assert.ok(Math.abs(leftProfile.anchor.x - leftRig.features.nose.bridge.x) < EPSILON);
  assert.ok(Math.abs(rightProfile.anchor.x - rightRig.features.nose.bridge.x) < EPSILON);

  for (const rig of [leftRig, rightRig]) {
    const centerline = cycleCenterline(rig.features.faceScar.cycles[0]);
    const visibleCount = centerline.filter(point => isPointInPolygon(point, rig.head.outline)).length;
    const visibleFraction = visibleCount / centerline.length;

    assert.ok(visibleFraction >= 0.35 && visibleFraction <= 0.6, "the profile mask should retain about half the scar");
  }
});

test("SVG clips the fill to the exact head path and preserves facial layer ordering", () => {
  const rig = solve({
    showFaceScar: true,
    showEyeScar: true,
    showEyeShading: true,
    removeStrokes: true
  });
  const svg = renderFaceSvg(rig);
  const headPath = svg.match(/class="head-shape"\s+d="([^"]+)"/)[1].trim();
  const clipPath = svg.match(/id="face-scar-head-clip">\s*<path d="([^"]+)"/)[1].trim();
  const headIndex = svg.indexOf('class="head-shape"');
  const shadingIndex = svg.indexOf('class="eye-shading-eye"');
  const faceScarIndex = svg.indexOf('class="face-scar-layer"');
  const noseIndex = svg.indexOf('class="nose-near-nostril-segment"');
  const eyeIndex = svg.indexOf('id="eye-clip-0"');
  const eyeScarIndex = svg.indexOf('class="eye-scar"');

  assert.equal(clipPath, headPath);
  assert.ok(headIndex < shadingIndex);
  assert.ok(shadingIndex < faceScarIndex);
  assert.ok(faceScarIndex < eyeScarIndex);
  assert.ok(eyeScarIndex < noseIndex);
  assert.ok(faceScarIndex < noseIndex);
  assert.ok(noseIndex < eyeIndex);
  assert.match(svg, /class="face-scar"[\s\S]*?fill="#777777"[\s\S]*?stroke="none"/);
  assert.match(svg, /\*:not\(\.preserve-material-stroke\)/);
});

test("the eye scar and diagonal scar remain geometrically independent", () => {
  const faceOnly = solve({ showFaceScar: true });
  const combined = solve({ showFaceScar: true, showEyeScar: true });

  assert.deepEqual(combined.features.faceScar, faceOnly.features.faceScar);
  assert.equal(faceOnly.features.eyes.some(eye => eye.scar), false);
  assert.equal(combined.features.eyes.filter(eye => eye.scar).length, 1);
  const svg = renderFaceSvg(combined);
  assert.match(svg, /class="face-scar"/);
  assert.match(svg, /class="eye-scar"/);
});

test("face scar geometry remains finite and simple across control extremes", () => {
  for (const yaw of [-1, -0.5, 0, 0.5, 1]) {
    for (const pitch of [-0.5, 0, 0.5]) {
      for (const angle of [-90, 45, 90]) {
        const rig = solve({
          showFaceScar: true,
          yaw,
          pitch,
          faceScarCenterX: yaw < 0 ? -100 : 100,
          faceScarCenterY: pitch < 0 ? -80 : 150,
          faceScarAngle: angle,
          faceScarLength: angle === 45 ? 260 : 20,
          faceScarWidth: yaw === 0 ? 16 : 1
        });

        assert.ok(rig.features.faceScar);
        assert.ok(Number.isFinite(rig.features.faceScar.resolvedWidth));
        rig.features.faceScar.cycles.forEach((cycle, index) => (
          assertValidCycle(cycle, `yaw ${yaw}, pitch ${pitch}, angle ${angle}, cycle ${index}`)
        ));
      }
    }
  }
});
