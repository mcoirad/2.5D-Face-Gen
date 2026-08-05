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
    showHairV2: true,
    outlineLandmarks: structuredClone(defaultOutlineLandmarks),
    featureLandmarks: structuredClone(defaultFeatureLandmarks),
    ...overrides
  });
}

function bounds(points) {
  return points.reduce((result, point) => ({
    minX: Math.min(result.minX, point.x),
    maxX: Math.max(result.maxX, point.x),
    minY: Math.min(result.minY, point.y),
    maxY: Math.max(result.maxY, point.y)
  }), { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
}

function assertFinite(value, path = "geometry") {
  if (typeof value === "number") {
    assert.ok(Number.isFinite(value), `${path} should be finite`);
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => assertFinite(item, `${path}[${index}]`));
  } else if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, item]) => assertFinite(item, `${path}.${key}`));
  }
}

test("ferronniere is opt-in and independent of hair and helmet visibility", () => {
  const disabled = solve();
  assert.equal(disabled.ferronniere, null);

  const bare = solve({
    showFerronniere: true,
    showHairV2: false,
    showHairStrands: false,
    showHelmet: false
  });
  const helmet = solve({
    showFerronniere: true,
    showHairV2: false,
    showHairStrands: false,
    showHelmet: true
  });
  assert.ok(bare.ferronniere);
  assert.deepEqual(helmet.ferronniere, bare.ferronniere);
});

test("position moves the band and pendant monotonically down the forehead", () => {
  const high = solve({ showFerronniere: true, ferronnierePosition: 0 }).ferronniere;
  const middle = solve({ showFerronniere: true, ferronnierePosition: 0.5 }).ferronniere;
  const low = solve({ showFerronniere: true, ferronnierePosition: 1 }).ferronniere;

  assert.ok(high.anchorPoint.y < middle.anchorPoint.y);
  assert.ok(middle.anchorPoint.y < low.anchorPoint.y);
  assert.ok(high.holder.center.y < middle.holder.center.y);
  assert.ok(middle.holder.center.y < low.holder.center.y);
});

test("the complete band-position range stays on the skull ellipse's lower half", () => {
  for (const position of [0, defaultParams.ferronnierePosition, 1]) {
    const rig = solve({
      showFerronniere: true,
      ferronnierePosition: position,
      yaw: 0,
      pitch: 0
    });
    const skullBounds = bounds(rig.head.guides.skull);
    const skullCenterY = (skullBounds.minY + skullBounds.maxY) / 2;

    assert.ok(rig.ferronniere.anchorPoint.y > skullCenterY);
    assert.ok(rig.ferronniere.anchorPoint.y < skullBounds.maxY);
  }
});

test("pendant holder tracks the authored nose bridge across yaw", () => {
  for (const yaw of [-0.75, -0.5, 0, 0.5, 0.75]) {
    const rig = solve({
      showFerronniere: true,
      yaw,
      pitch: 0
    });

    assert.ok(Math.abs(rig.ferronniere.holder.center.x - rig.features.nose.bridge.x) < EPSILON);
  }
});

test("pendant tracking remains head-fixed and mirrored at profile clamps", () => {
  const leftTurn = solve({ showFerronniere: true, yaw: -0.5, pitch: 0 });
  const rightTurn = solve({ showFerronniere: true, yaw: 0.5, pitch: 0 });
  const left = solve({ showFerronniere: true, yaw: -1, pitch: 0 });
  const right = solve({ showFerronniere: true, yaw: 1, pitch: 0 });

  assert.ok(leftTurn.ferronniere.anchorU < 0);
  assert.ok(rightTurn.ferronniere.anchorU > 0);
  assert.ok(Math.abs(left.ferronniere.anchorU) < EPSILON);
  assert.ok(Math.abs(right.ferronniere.anchorU) < EPSILON);
  assert.ok(left.ferronniere.holder.center.x > 250);
  assert.ok(right.ferronniere.holder.center.x < 250);
  assert.ok(Math.abs(
    left.ferronniere.holder.center.x + right.ferronniere.holder.center.x - 500
  ) < EPSILON);
});

test("single and double styles generate one and two complete surface rings", () => {
  const single = solve({
    showFerronniere: true,
    ferronniereBandStyle: "single"
  }).ferronniere;
  const double = solve({
    showFerronniere: true,
    ferronniereBandStyle: "double"
  }).ferronniere;

  assert.deepEqual([...new Set(single.bandRuns.map(run => run.lineIndex))], [0]);
  assert.deepEqual([...new Set(double.bandRuns.map(run => run.lineIndex))], [0, 1]);
  const lineCenters = [0, 1].map(lineIndex => {
    const points = double.bandRuns
      .filter(run => run.lineIndex === lineIndex)
      .flatMap(run => run.points);
    return points.reduce((sum, point) => sum + point.y, 0) / points.length;
  });
  assert.ok(lineCenters[0] < lineCenters[1]);
});

test("front view produces concentric circular holder and gem geometry", () => {
  const ferronniere = solve({
    showFerronniere: true,
    yaw: 0,
    pitch: 0
  }).ferronniere;
  const [holderX, holderY] = ferronniere.holder.screenRadii;
  const [gemMajor, gemMinor] = ferronniere.gem.screenRadii;

  assert.ok(Math.abs(holderX - holderY) < EPSILON);
  assert.ok(Math.abs(gemMajor - gemMinor) < EPSILON);
  assert.ok(Math.abs(ferronniere.holder.center.x - ferronniere.gem.center.x) < EPSILON);
  assert.ok(Math.abs(ferronniere.holder.center.y - ferronniere.gem.center.y) < EPSILON);
});

test("profile view flattens the holder while retaining mirrored gem depth", () => {
  const leftProfile = solve({
    showFerronniere: true,
    yaw: -1,
    pitch: 0,
    ferronniereGemProtrusion: 0.75
  }).ferronniere;
  const rightProfile = solve({
    showFerronniere: true,
    yaw: 1,
    pitch: 0,
    ferronniereGemProtrusion: 0.75
  }).ferronniere;
  const leftHolder = bounds(leftProfile.holder.points);
  const leftGem = bounds(leftProfile.gem.points);
  const rightHolder = bounds(rightProfile.holder.points);
  const rightGem = bounds(rightProfile.gem.points);

  assert.ok(leftHolder.maxX - leftHolder.minX < EPSILON);
  assert.ok(rightHolder.maxX - rightHolder.minX < EPSILON);
  assert.ok(leftGem.maxX - leftGem.minX > 0);
  assert.ok(rightGem.maxX - rightGem.minX > 0);
  const leftOffset = leftProfile.gem.center.x - leftProfile.holder.center.x;
  const rightOffset = rightProfile.gem.center.x - rightProfile.holder.center.x;
  assert.ok(leftOffset > 0);
  assert.ok(rightOffset < 0);
  assert.ok(Math.abs(leftOffset + rightOffset) < EPSILON);
  assert.ok(leftProfile.gemSide.points.length >= 3);
  assert.ok(rightProfile.gemSide.points.length >= 3);
});

test("gem protrusion grows continuously from a flat profile setting", () => {
  const widths = [0, 0.5, 1].map(protrusion => {
    const ferronniere = solve({
      showFerronniere: true,
      yaw: 1,
      ferronniereGemProtrusion: protrusion
    }).ferronniere;
    const gemBounds = bounds(ferronniere.gem.points);
    return {
      width: gemBounds.maxX - gemBounds.minX,
      offset: Math.abs(ferronniere.gem.center.x - ferronniere.holder.center.x)
    };
  });

  assert.ok(widths[0].width < EPSILON);
  assert.ok(widths[0].offset < EPSILON);
  assert.ok(widths[0].width < widths[1].width && widths[1].width < widths[2].width);
  assert.ok(widths[0].offset < widths[1].offset && widths[1].offset < widths[2].offset);
});

test("band and setting layers stay finite and pitch-aware across extreme poses", () => {
  for (const yaw of [-1, -0.5, 0, 0.5, 1]) {
    for (const pitch of [-0.5, 0, 0.5]) {
      const ferronniere = solve({
        showFerronniere: true,
        ferronniereBandStyle: "double",
        ferronnierePosition: 0,
        ferronniereGemSize: 36,
        ferronniereGemProtrusion: 1,
        yaw,
        pitch
      }).ferronniere;
      assertFinite(ferronniere, `ferronniere at ${yaw}/${pitch}`);
      assert.ok(["front", "back"].includes(ferronniere.layer));
      assert.ok(ferronniere.bandRuns.every(run => ["front", "back"].includes(run.layer)));
    }
  }

  const positivePitchProfile = solve({
    showFerronniere: true,
    ferronnierePosition: 1,
    yaw: 1,
    pitch: 0.5
  }).ferronniere;
  const negativePitchProfile = solve({
    showFerronniere: true,
    ferronnierePosition: 1,
    yaw: 1,
    pitch: -0.5
  }).ferronniere;
  assert.equal(positivePitchProfile.layer, "front");
  assert.equal(negativePitchProfile.layer, "back");
});

test("SVG ordering keeps the ferronniere above skin and under hair and helmets", () => {
  const rig = solve({
    showFerronniere: true,
    showHelmet: true,
    showHairV2: true,
    ferronniereMetalColor: "#123456",
    ferronniereGemColor: "#654321",
    hairColor: "#aa0001",
    hairV2Color: "#00aa02",
    skinColor: "#fedcba"
  });
  const svg = renderFaceSvg(rig);
  const firstBand = svg.indexOf('data-ferronniere-part="band"');
  const gem = svg.indexOf('data-ferronniere-part="gem"');
  const frontHair = Math.max(svg.lastIndexOf("#aa0001"), svg.lastIndexOf("#00aa02"));
  const helmetFront = svg.lastIndexOf(rig.helmet.front[0].fill);
  const skinOccurrences = [...svg.matchAll(/#fedcba/g)].map(match => match.index);
  const head = skinOccurrences[1];

  assert.ok(firstBand >= 0 && firstBand < head);
  assert.ok(gem > head);
  assert.ok(gem < frontHair);
  assert.ok(gem < helmetFront);
});

test("ferronniere controls have save-compatible defaults", () => {
  assert.equal(defaultParams.showFerronniere, false);
  assert.equal(defaultParams.ferronniereBandStyle, "single");
  assert.equal(defaultParams.ferronnierePosition, 0.5);
  assert.equal(defaultParams.ferronniereBandThickness, 2);
  assert.equal(defaultParams.ferronniereGemSize, 16);
  assert.equal(defaultParams.ferronniereGemProtrusion, 0.55);
});
