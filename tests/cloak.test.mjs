import assert from "node:assert/strict";
import test from "node:test";

import { colorConfig, defaultParams, sliderConfig, toggleConfig } from "../src/params.js";
import {
  defaultFeatureLandmarks,
  defaultOutlineLandmarks,
  solveFaceRig
} from "../src/rig.js";
import { renderFaceSvg } from "../src/svgRenderer.js";

const EPSILON = 1e-5;

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

function polygonArea(points) {
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length];
    return sum + point.x * next.y - next.x * point.y;
  }, 0) / 2);
}

function orientation(a, b, c) {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segmentsCross(a, b, c, d) {
  return orientation(a, b, c) * orientation(a, b, d) < -EPSILON
    && orientation(c, d, a) * orientation(c, d, b) < -EPSILON;
}

function polygonSelfIntersects(points) {
  for (let first = 0; first < points.length; first += 1) {
    for (let second = first + 1; second < points.length; second += 1) {
      const adjacent = first === second
        || (first + 1) % points.length === second
        || (second + 1) % points.length === first;
      if (!adjacent && segmentsCross(
        points[first],
        points[(first + 1) % points.length],
        points[second],
        points[(second + 1) % points.length]
      )) return true;
    }
  }
  return false;
}

function assertValidPolygon(points, label) {
  assert.ok(points.length >= 3, `${label} should have at least three points`);
  assert.ok(polygonArea(points) > EPSILON, `${label} should retain area`);
  assert.equal(polygonSelfIntersects(points), false, `${label} should be simple`);
  points.forEach((point, index) => {
    assert.ok(Number.isFinite(point.x), `${label}[${index}].x`);
    assert.ok(Number.isFinite(point.y), `${label}[${index}].y`);
    assert.ok(Number.isFinite(point.depth), `${label}[${index}].depth`);
  });
}

function bounds(points) {
  return {
    minX: Math.min(...points.map(point => point.x)),
    maxX: Math.max(...points.map(point => point.x)),
    minY: Math.min(...points.map(point => point.y)),
    maxY: Math.max(...points.map(point => point.y))
  };
}

function pointsNearlyEqual(first, second, epsilon = EPSILON) {
  return Math.abs(first.x - second.x) < epsilon
    && Math.abs(first.y - second.y) < epsilon
    && Math.abs(first.depth - second.depth) < epsilon;
}

function mirroredPoint(point) {
  return { x: 500 - point.x, y: point.y, depth: point.depth };
}

test("cowl controls are opt-in and save-compatible", () => {
  assert.equal(defaultParams.showCloak, false);
  assert.equal(defaultParams.cloakColor, "#4a304f");
  assert.equal(defaultParams.showCloakShine, false);
  assert.equal(defaultParams.cloakFoldCount, 4);
  assert.equal(defaultParams.cloakFoldScale, 1);
  assert.equal(defaultParams.cloakFoldWidth, 22);
  assert.equal(defaultParams.cloakFoldDepth, 14);
  assert.equal(defaultParams.cloakFoldSag, 10);
  assert.equal(defaultParams.cloakFoldOverhang, 0.45);
  assert.equal(defaultParams.cloakFoldSweep, 8);
  assert.equal(defaultParams.cloakFoldIrregularity, 0.18);
  assert.equal(defaultParams.cloakShoulderDrape, 24);
  assert.equal(defaultParams.cloakFrontOverlap, 0.35);
  assert.equal(defaultParams.cloakAsymmetry, 0);
  assert.deepEqual(sliderConfig.cloakFoldCount, [2, 8, 1]);
  assert.deepEqual(sliderConfig.cloakFoldScale, [0.5, 2, 0.01]);
  assert.deepEqual(sliderConfig.cloakFrontOverlap, [-1, 1, 0.01]);
  assert.equal(toggleConfig.showCloak, true);
  assert.equal(toggleConfig.showCloakShine, true);
  assert.equal(colorConfig.cloakColor, true);
  assert.equal(solve().cloak, null);
  assert.equal(solve({ showCloak: true, showBody: false }).cloak, null);
});

test("default cowl builds four deterministic paired fold bands", () => {
  const first = solve({ showCloak: true, yaw: 0.35 }).cloak;
  const repeated = solve({ showCloak: true, yaw: 0.35 }).cloak;

  assert.deepEqual(first, repeated);
  assert.deepEqual([...new Set(first.sections.map(section => section.bandIndex))], [0, 1, 2, 3]);
  for (let bandIndex = 0; bandIndex < 4; bandIndex += 1) {
    for (const side of [-1, 1]) {
      const sections = first.sections.filter(section => (
        section.bandIndex === bandIndex && section.side === side
      ));
      assert.ok(sections.length >= 18, `band ${bandIndex} side ${side} should remain complete`);
      assert.ok(sections.some(section => section.layer === "front"));
      assert.ok(sections.some(section => section.layer === "back"));
    }
  }
  assert.ok(first.sections.some(section => section.frontFlap && section.side === -1));
  assert.ok(first.sections.some(section => section.topFlap && section.side === 1));
  assert.equal(first.sections.some(section => section.topFlap && section.side === -1), false);
});

test("adjacent cowl cells retain exact shared seams", () => {
  const cloak = solve({ showCloak: true, yaw: 0.42, pitch: -0.2 }).cloak;

  for (let bandIndex = 0; bandIndex < cloak.settings.foldCount; bandIndex += 1) {
    for (const side of [-1, 1]) {
      const sections = cloak.sections
        .filter(section => section.bandIndex === bandIndex && section.side === side)
        .sort((first, second) => Number(first.id.split("-").at(-1)) - Number(second.id.split("-").at(-1)));

      for (let index = 1; index < sections.length; index += 1) {
        assert.ok(pointsNearlyEqual(sections[index - 1].seamEnd.upper, sections[index].seamStart.upper));
        assert.ok(pointsNearlyEqual(sections[index - 1].seamEnd.lower, sections[index].seamStart.lower));
      }
    }
  }
});

test("fold controls change width, depth, drape, and overlap independently", () => {
  const narrow = solve({ showCloak: true, cloakFoldWidth: 10, pitch: -0.3 }).cloak;
  const wide = solve({ showCloak: true, cloakFoldWidth: 36, pitch: -0.3 }).cloak;
  const flat = solve({ showCloak: true, cloakFoldDepth: 0, pitch: -0.3 }).cloak;
  const deep = solve({ showCloak: true, cloakFoldDepth: 28, pitch: -0.3 }).cloak;
  const high = solve({ showCloak: true, cloakShoulderDrape: 0 }).cloak;
  const draped = solve({ showCloak: true, cloakShoulderDrape: 60 }).cloak;
  const meeting = solve({ showCloak: true, cloakFrontOverlap: 0 }).cloak;
  const crossed = solve({ showCloak: true, cloakFrontOverlap: 1 }).cloak;
  const allPoints = cloak => cloak.sections.flatMap(section => section.envelope.points);
  const frontEndX = (cloak, side) => cloak.sections
    .filter(section => section.bandIndex === 0 && section.side === side)
    .sort((first, second) => Number(first.id.split("-").at(-1)) - Number(second.id.split("-").at(-1)))
    .at(-1).seamEnd.upper.x;

  assert.ok(bounds(allPoints(wide)).maxY - bounds(allPoints(wide)).minY
    > bounds(allPoints(narrow)).maxY - bounds(allPoints(narrow)).minY);
  assert.notDeepEqual(allPoints(deep), allPoints(flat));
  assert.ok(bounds(allPoints(draped)).maxY > bounds(allPoints(high)).maxY);
  assert.ok(frontEndX(crossed, -1) > frontEndX(meeting, -1));
  assert.ok(frontEndX(crossed, 1) < frontEndX(meeting, 1));
});

test("fold scale expands the complete cowl around its neck anchor", () => {
  const small = solve({ showCloak: true, cloakFoldScale: 0.5 }).cloak;
  const normal = solve({ showCloak: true, cloakFoldScale: 1 }).cloak;
  const large = solve({ showCloak: true, cloakFoldScale: 2 }).cloak;
  const allPoints = cloak => cloak.sections.flatMap(section => section.envelope.points);
  const smallBounds = bounds(allPoints(small));
  const normalBounds = bounds(allPoints(normal));
  const largeBounds = bounds(allPoints(large));

  assert.ok(smallBounds.maxX - smallBounds.minX < normalBounds.maxX - normalBounds.minX);
  assert.ok(normalBounds.maxX - normalBounds.minX < largeBounds.maxX - largeBounds.minX);
  assert.ok(smallBounds.maxY - smallBounds.minY < normalBounds.maxY - normalBounds.minY);
  assert.ok(normalBounds.maxY - normalBounds.minY < largeBounds.maxY - largeBounds.minY);
});

test("cloak shine is temporarily disabled by default and remains opt-in", () => {
  const matte = solve({ showCloak: true }).cloak;
  const shiny = solve({ showCloak: true, showCloakShine: true }).cloak;

  assert.ok(matte.sections.every(section => section.crest === null));
  assert.ok(shiny.sections.some(section => section.crest));
  assert.doesNotMatch(renderFaceSvg(solve({ showCloak: true })), /class="cloak-crest"/);
  assert.match(renderFaceSvg(solve({ showCloak: true, showCloakShine: true })), /class="cloak-crest"/);
});

test("symmetric and chiral cowl poses mirror as configured", () => {
  const symmetricSettings = {
    showCloak: true,
    cloakFrontOverlap: 0,
    cloakAsymmetry: 0,
    cloakFoldIrregularity: 0,
    yaw: 0.6,
    pitch: -0.2
  };
  const positive = solve(symmetricSettings).cloak;
  const negative = solve({ ...symmetricSettings, yaw: -0.6 }).cloak;
  const negativePoints = negative.sections.flatMap(section => section.envelope.points);

  for (const point of positive.sections.flatMap(section => section.envelope.points)) {
    assert.ok(negativePoints.some(candidate => pointsNearlyEqual(candidate, mirroredPoint(point))));
  }

  const chiralPositive = solve({
    ...symmetricSettings,
    cloakFrontOverlap: 0.6,
    cloakAsymmetry: 0.4
  }).cloak;
  const chiralNegative = solve({
    ...symmetricSettings,
    yaw: -0.6,
    cloakFrontOverlap: -0.6,
    cloakAsymmetry: -0.4
  }).cloak;
  const chiralNegativePoints = chiralNegative.sections.flatMap(section => section.envelope.points);

  for (const point of chiralPositive.sections.flatMap(section => section.envelope.points)) {
    assert.ok(chiralNegativePoints.some(candidate => pointsNearlyEqual(candidate, mirroredPoint(point))));
  }
});

test("cowl geometry remains finite and simple across pose and control extremes", () => {
  for (const yaw of [-1, -0.75, 0, 0.75, 1]) {
    for (const pitch of [-0.5, 0, 0.5]) {
      for (const sign of [-1, 1]) {
        const cloak = solve({
          showCloak: true,
          yaw,
          pitch,
          cloakFoldCount: 8,
          cloakFoldScale: sign < 0 ? 0.5 : 2,
          cloakFoldWidth: 36,
          cloakFoldDepth: 28,
          cloakFoldSag: 30,
          cloakFoldOverhang: 1,
          cloakFoldSweep: sign * 30,
          cloakFoldIrregularity: 1,
          cloakShoulderDrape: 60,
          cloakFrontOverlap: sign,
          cloakAsymmetry: sign
        }).cloak;
        const pairs = new Set(cloak.sections.map(section => `${section.bandIndex}:${section.side}`));

        assert.equal(pairs.size, 16, `all fold sides should persist at ${yaw},${pitch},${sign}`);
        cloak.sections.forEach((section, index) => {
          assertValidPolygon(section.envelope.points, `envelope ${index} at ${yaw},${pitch},${sign}`);
          if (section.crest) assertValidPolygon(section.crest.points, `crest ${index} at ${yaw},${pitch},${sign}`);
          if (section.underside) assertValidPolygon(section.underside.points, `underside ${index} at ${yaw},${pitch},${sign}`);
          section.crease?.points.forEach(point => {
            assert.ok(Number.isFinite(point.x));
            assert.ok(Number.isFinite(point.y));
          });
        });
      }
    }
  }
});

test("cowl projection changes continuously for small yaw increments", () => {
  const before = solve({ showCloak: true, yaw: 0.2, pitch: -0.15 }).cloak;
  const after = solve({ showCloak: true, yaw: 0.21, pitch: -0.15 }).cloak;
  const beforeBounds = bounds(before.sections.flatMap(section => section.envelope.points));
  const afterBounds = bounds(after.sections.flatMap(section => section.envelope.points));

  for (const key of ["minX", "maxX", "minY", "maxY"]) {
    assert.ok(Math.abs(beforeBounds[key] - afterBounds[key]) < 4, `${key} should move continuously`);
  }
});

test("SVG renders rear cowl, armor, front folds, shading, and creases in order", () => {
  const rig = solve({
    showCloak: true,
    showCloakShine: true,
    showClothing: true,
    showBreastplate: true,
    showArmor: true,
    showGuides: true,
    yaw: 0.35
  });
  const svg = renderFaceSvg(rig);
  const backIndex = svg.indexOf('class="cloak-back-layer"');
  const clothingIndex = svg.indexOf('class="clothing-layer"');
  const breastplateIndex = svg.indexOf('class="breastplate-layer"');
  const frontIndex = svg.indexOf('class="cloak-front-layer"');
  const headIndex = svg.indexOf('class="head-shape"');
  const firstFill = svg.indexOf('class="cloak-envelope-fill');
  const firstCrest = svg.indexOf('class="cloak-crest"');
  const firstUnderside = svg.indexOf('class="cloak-underside"');
  const firstCrease = svg.indexOf('class="cloak-crease"');
  const bottomFlap = svg.lastIndexOf("cloak-fold-3-left-front");
  const topFlap = svg.lastIndexOf("cloak-fold-3-right-front");

  assert.ok(backIndex >= 0 && backIndex < clothingIndex);
  assert.ok(clothingIndex < breastplateIndex && breastplateIndex < frontIndex);
  assert.ok(frontIndex < headIndex);
  assert.ok(firstFill >= 0 && firstFill < firstCrest);
  assert.ok(firstCrest < firstUnderside && firstUnderside < firstCrease);
  assert.ok(bottomFlap < topFlap, "the +X crossing flap should render last");
  assert.match(svg, /stroke-width="8"/);
  assert.match(svg, /stroke-width="2"/);
});

test("remove-strokes mode preserves cowl fills and derived shading", () => {
  const svg = renderFaceSvg(solve({ showCloak: true, showCloakShine: true, removeStrokes: true }));

  assert.match(svg, /\*:not\(\.preserve-material-stroke\)/);
  assert.match(svg, /class="cloak-envelope-fill/);
  assert.match(svg, /class="cloak-crest"/);
  assert.match(svg, /class="cloak-underside"/);
});
