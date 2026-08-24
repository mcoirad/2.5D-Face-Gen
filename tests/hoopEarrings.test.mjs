import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  colorConfig,
  defaultParams,
  selectConfig,
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
  assert.ok(Math.abs(actual - expected) < EPSILON, `${message}: expected ${expected}, got ${actual}`);
}

function allSectorPoints(earring) {
  return [
    ...earring.sectors.back.points,
    ...earring.sectors.front.points
  ];
}

function bounds(points) {
  return {
    minX: Math.min(...points.map(point => point.x)),
    maxX: Math.max(...points.map(point => point.x)),
    minY: Math.min(...points.map(point => point.y)),
    maxY: Math.max(...points.map(point => point.y))
  };
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
      ) {
        continue;
      }

      const c = points[second];
      const d = points[(second + 1) % points.length];

      if (
        orientation(a, b, c) * orientation(a, b, d) < 0
        && orientation(c, d, a) * orientation(c, d, b) < 0
      ) {
        return false;
      }
    }
  }

  return true;
}

function unorderedPairMatches(first, second) {
  return (
    Math.hypot(first[0].x - second[0].x, first[0].y - second[0].y) < EPSILON
    && Math.hypot(first[1].x - second[1].x, first[1].y - second[1].y) < EPSILON
  ) || (
    Math.hypot(first[0].x - second[1].x, first[0].y - second[1].y) < EPSILON
    && Math.hypot(first[1].x - second[0].x, first[1].y - second[0].y) < EPSILON
  );
}

test("hoop earring controls are opt-in and save-compatible", () => {
  assert.equal(defaultParams.showHoopEarrings, false);
  assert.equal(defaultParams.hoopEarringSide, "left");
  assert.equal(defaultParams.hoopEarringSize, 36);
  assert.equal(defaultParams.hoopEarringThickness, 4);
  assert.equal(defaultParams.hoopEarringColor, "#c9a34a");
  assert.deepEqual(sliderConfig.hoopEarringSize, [16, 80, 1]);
  assert.deepEqual(sliderConfig.hoopEarringThickness, [1, 12, 1]);
  assert.equal(sliderConfig.hoopEarringDrop, undefined);
  assert.deepEqual(selectConfig.hoopEarringSide, [
    ["left", "Screen Left"],
    ["right", "Screen Right"],
    ["both", "Both"]
  ]);
  assert.equal(toggleConfig.showHoopEarrings, true);
  assert.equal(colorConfig.hoopEarringColor, true);

  const mainSource = readFileSync(new URL("../src/main.js", import.meta.url), "utf8");
  const accessories = mainSource.match(/title: "Accessories",[\s\S]*?open: true/)?.[0] ?? "";

  for (const key of [
    "showHoopEarrings",
    "hoopEarringSide",
    "hoopEarringSize",
    "hoopEarringThickness",
    "hoopEarringColor"
  ]) {
    assert.match(accessories, new RegExp(`"${key}"`));
  }
  assert.doesNotMatch(accessories, /hoopEarringDrop/);

  const rig = solve();
  assert.equal(rig.hoopEarrings, null);
  assert.doesNotMatch(renderFaceSvg(rig), /hoop-earring/);
  assert.equal(solve({ showEars: false, showHoopEarrings: true }).hoopEarrings, null);
});

test("screen-side selection creates stable left, right, and paired hoops", () => {
  for (const [selection, expected] of [
    ["left", ["left"]],
    ["right", ["right"]],
    ["both", ["left", "right"]]
  ]) {
    const rig = solve({ showHoopEarrings: true, hoopEarringSide: selection, yaw: 0.75 });
    const present = Object.entries(rig.hoopEarrings)
      .filter(([, earring]) => earring)
      .map(([side]) => side);

    assert.deepEqual(present, expected);
    for (const side of expected) {
      const earring = rig.hoopEarrings[side];
      assert.equal(earring.side, side);
      assert.deepEqual(earring.attachment, rig.ears[side].bottomAttach);
      assert.equal(earring.layer, rig.ears[side].layer);
    }
  }
});

test("hoops track their exact ear attachments across ear and pose controls", () => {
  for (const overrides of [
    { yaw: -1, pitch: -0.5, earStickOut: 0, earFlatten: 0, earCurve: -15 },
    { yaw: -0.5, pitch: 0.5, earStickOut: 70, earFlatten: 1, earCurve: 25 },
    { yaw: 0, pitch: 0, earStickOut: 30, earFlatten: 0.5, earCurve: 6 },
    { yaw: 0.75, pitch: -0.3, earStickOut: 55, earFlatten: 0.2, earCurve: 18 },
    { yaw: 1, pitch: 0.5, earStickOut: 70, earFlatten: 1, earCurve: -15 }
  ]) {
    const rig = solve({
      ...overrides,
      showHoopEarrings: true,
      hoopEarringSide: "both"
    });

    for (const side of ["left", "right"]) {
      assert.deepEqual(rig.hoopEarrings[side].attachment, rig.ears[side].bottomAttach);
      assert.equal(rig.hoopEarrings[side].layer, rig.ears[side].layer);
    }
  }
});

test("size, thickness, and color affect only their intended properties", () => {
  const small = solve({
    showHoopEarrings: true,
    yaw: 1,
    hoopEarringSize: 20,
    hoopEarringThickness: 2
  }).hoopEarrings.left;
  const large = solve({
    showHoopEarrings: true,
    yaw: 1,
    hoopEarringSize: 60,
    hoopEarringThickness: 2
  }).hoopEarrings.left;
  const smallBounds = bounds(allSectorPoints(small));
  const largeBounds = bounds(allSectorPoints(large));

  assert.ok(largeBounds.maxX - largeBounds.minX > smallBounds.maxX - smallBounds.minX);
  assert.equal(small.drop, -10);
  assert.equal(small.outwardOffset, 5);
  assertClose(smallBounds.minY, small.attachment.y - 10, "fixed overlap reaches ten pixels into ear");
  assertClose((smallBounds.minX + smallBounds.maxX) / 2, small.attachment.x - 5, "left hoop shifts outward");

  const right = solve({
    showHoopEarrings: true,
    hoopEarringSide: "right",
    yaw: 1,
    hoopEarringSize: 20,
    hoopEarringThickness: 2
  }).hoopEarrings.right;
  const rightBounds = bounds(allSectorPoints(right));
  assertClose((rightBounds.minX + rightBounds.maxX) / 2, right.attachment.x + 5, "right hoop shifts outward");

  const clamped = solve({
    showHoopEarrings: true,
    hoopEarringSize: 16,
    hoopEarringThickness: 12
  }).hoopEarrings.left;
  assert.equal(clamped.requestedThickness, 12);
  assertClose(clamped.thickness, 6.4, "thickness is clamped to forty percent");
  assert.ok(clamped.outerDiameter - clamped.thickness * 2 > 0, "clamped hoop retains a hole");

  assert.equal(solve({ showHoopEarrings: true, hoopEarringColor: "#123456" }).hoopEarrings.left.color, "#123456");
  assert.equal(solve({ showHoopEarrings: true, hoopEarringColor: "invalid" }).hoopEarrings.left.color, "#c9a34a");
});

test("the side-plane hoop stays thin at front and opens continuously toward profile", () => {
  const yaws = [0, 0.25, 0.5, 0.75, 1];
  const widths = yaws.map(yaw => {
    const earring = solve({ showHoopEarrings: true, yaw }).hoopEarrings.left;
    const hoopBounds = bounds(allSectorPoints(earring));

    return hoopBounds.maxX - hoopBounds.minX;
  });

  assert.ok(widths[0] > 0, "front-view wire remains visible");
  for (let index = 1; index < widths.length; index += 1) {
    assert.ok(widths[index] > widths[index - 1], `width grows at yaw ${yaws[index]}`);
  }

  const negative = solve({
    showHoopEarrings: true,
    hoopEarringSide: "left",
    yaw: -0.75,
    pitch: 0.25
  }).hoopEarrings.left;
  const positive = solve({
    showHoopEarrings: true,
    hoopEarringSide: "right",
    yaw: 0.75,
    pitch: 0.25
  }).hoopEarrings.right;

  for (const sectorName of ["back", "front"]) {
    const negativePoints = negative.sectors[sectorName].points;
    const positivePoints = positive.sectors[sectorName].points;

    assert.equal(negativePoints.length, positivePoints.length);
    for (const point of negativePoints) {
      assert.ok(positivePoints.some(candidate => (
        Math.abs(point.x + candidate.x - 500) < EPSILON
        && Math.abs(point.y - candidate.y) < EPSILON
      )), `${sectorName} has mirrored point ${point.x}/${point.y}`);
    }
  }
});

test("the face-facing profile arc renders in front of the ear", () => {
  for (const [yaw, side] of [[-1, "left"], [1, "right"]]) {
    const earring = solve({
      showHoopEarrings: true,
      hoopEarringSide: side,
      yaw
    }).hoopEarrings[side];
    const meanX = sector => sector.centerline.reduce((sum, point) => sum + point.x, 0)
      / sector.centerline.length;
    const directionTowardFace = 250 - earring.center.x;

    assert.ok(
      (meanX(earring.sectors.front) - earring.center.x) * directionTowardFace > 0,
      `front arc faces inward at yaw ${yaw}`
    );
    assert.ok(
      (meanX(earring.sectors.back) - earring.center.x) * directionTowardFace < 0,
      `back arc faces outward at yaw ${yaw}`
    );
  }
});

test("front and back sectors share split endpoints without radial boundary seams", () => {
  for (const yaw of [0, 0.35, 1]) {
    const earring = solve({
      showHoopEarrings: true,
      yaw,
      pitch: 0.3,
      hoopEarringThickness: 10
    }).hoopEarrings.left;
    const front = earring.sectors.front;
    const back = earring.sectors.back;

    assertClose(front.centerline[0].x, back.centerline[0].x, "top split X");
    assertClose(front.centerline[0].y, back.centerline[0].y, "top split Y");
    assertClose(front.centerline.at(-1).x, back.centerline.at(-1).x, "bottom split X");
    assertClose(front.centerline.at(-1).y, back.centerline.at(-1).y, "bottom split Y");
    assert.ok(unorderedPairMatches(
      front.boundaryEdges.map(edge => edge[0]),
      back.boundaryEdges.map(edge => edge[0])
    ));
    assert.ok(unorderedPairMatches(
      front.boundaryEdges.map(edge => edge.at(-1)),
      back.boundaryEdges.map(edge => edge.at(-1))
    ));
    assert.equal(front.boundaryEdges.length, 2);
    assert.equal(back.boundaryEdges.length, 2);
    assert.ok(polygonIsSimple(front.points));
    assert.ok(polygonIsSimple(back.points));
  }
});

test("the visually edge-on front-view range is enclosed without adding turned-view seams", () => {
  const frontViewRig = solve({
    showHoopEarrings: true,
    hoopEarringSide: "left",
    yaw: 0,
    pitch: 0.04,
    faceWidth: 182,
    faceHeight: 161,
    hoopEarringSize: 36,
    hoopEarringThickness: 6
  });
  const earring = frontViewRig.hoopEarrings.left;
  const front = earring.sectors.front;

  assert.equal(earring.edgeOn, true);
  assert.equal(earring.endCapped, true);
  assert.equal(front.endCaps.length, 2);
  assert.equal(earring.sectors.back.endCaps.length, 0);
  assert.ok(unorderedPairMatches(
    front.endCaps[0],
    front.boundaryEdges.map(edge => edge[0])
  ));
  assert.ok(unorderedPairMatches(
    front.endCaps[1],
    front.boundaryEdges.map(edge => edge.at(-1))
  ));

  const frontViewSvg = renderFaceSvg(frontViewRig);
  const capPaths = [...frontViewSvg.matchAll(/class="hoop-earring-end-cap[^"]*"\s+d="([^"]+)"/g)];

  assert.equal(capPaths.length, 2);
  assert.ok(capPaths.every(match => !match[1].includes("Z")));
  assert.match(frontViewSvg, /class="hoop-earring-end-cap[^"]*"[\s\S]*?stroke="black"[\s\S]*?stroke-width="3"/);

  for (const yaw of [-0.04, -0.01, 0.01, 0.04]) {
    const nearFrontRig = solve({
      showHoopEarrings: true,
      hoopEarringSide: "left",
      yaw,
      pitch: 0.04,
      hoopEarringThickness: 6
    });

    assert.equal(nearFrontRig.hoopEarrings.left.edgeOn, false);
    assert.equal(nearFrontRig.hoopEarrings.left.endCapped, true);
    assert.equal(nearFrontRig.hoopEarrings.left.sectors.front.endCaps.length, 2);
    assert.equal(
      [...renderFaceSvg(nearFrontRig).matchAll(/class="hoop-earring-end-cap/g)].length,
      2
    );
  }

  for (const yaw of [-1, -0.041, 0.041, 1]) {
    const turnedRig = solve({
      showHoopEarrings: true,
      hoopEarringSide: "left",
      yaw,
      pitch: 0.04,
      hoopEarringThickness: 6
    });

    assert.equal(turnedRig.hoopEarrings.left.edgeOn, false);
    assert.equal(turnedRig.hoopEarrings.left.endCapped, false);
    assert.equal(turnedRig.hoopEarrings.left.sectors.front.endCaps.length, 0);
    assert.doesNotMatch(renderFaceSvg(turnedRig), /hoop-earring-end-cap/);
  }
});

test("SVG interleaves hoop sectors with their ear and preserves material fills", () => {
  const rig = solve({
    showHoopEarrings: true,
    hoopEarringSide: "both",
    hoopEarringColor: "#123456",
    yaw: 0.75
  });
  const svg = renderFaceSvg(rig);
  const leftBundle = svg.match(/<g class="ear-bundle ear-left-bundle">([\s\S]*?)<\/g>\s*<\/g>/)?.[1] ?? "";
  const rightBundle = svg.match(/<g class="ear-bundle ear-right-bundle">([\s\S]*?)<\/g>\s*<\/g>/)?.[1] ?? "";

  for (const [side, bundle] of [["left", leftBundle], ["right", rightBundle]]) {
    assert.ok(bundle.indexOf(`hoop-earring-${side}-back-layer`) < bundle.indexOf(`class="ear-fill ear-${side}"`));
    assert.ok(bundle.indexOf(`class="ear-fill ear-${side}"`) < bundle.indexOf(`hoop-earring-${side}-front-layer`));
  }
  assert.ok(svg.indexOf('class="ear-bundle ear-left-bundle"') < svg.indexOf('class="head-shape"'));
  assert.ok(svg.indexOf('class="head-shape"') < svg.indexOf('class="ear-bundle ear-right-bundle"'));
  assert.match(svg, /class="hoop-earring-sector hoop-earring-(?:left|right) hoop-earring-(?:back|front)"[\s\S]*?fill="#123456"[\s\S]*?stroke="none"/);
  assert.match(svg, /class="hoop-earring-boundary[^"]*"[\s\S]*?fill="none"[\s\S]*?stroke="black"[\s\S]*?stroke-width="3"/);

  const boundaryPaths = [...svg.matchAll(/class="hoop-earring-boundary[^"]*"\s+d="([^"]+)"/g)];
  assert.ok(boundaryPaths.length > 0);
  assert.ok(boundaryPaths.every(match => !match[1].includes("Z")));

  const strokeFree = renderFaceSvg(solve({
    showHoopEarrings: true,
    removeStrokes: true
  }));
  assert.match(strokeFree, /class="hoop-earring-sector/);
  assert.match(strokeFree, /fill="#c9a34a"/);
  assert.match(strokeFree, /\*:not\(\.preserve-material-stroke\)[\s\S]*stroke: none !important/);
});

test("hoop geometry remains finite and simple across pose and control extremes", () => {
  for (const yaw of [-1, -0.5, 0, 0.5, 1]) {
    for (const pitch of [-0.5, 0.5]) {
      for (const size of [16, 80]) {
        const rig = solve({
          showHoopEarrings: true,
          hoopEarringSide: "both",
          yaw,
          pitch,
          earStickOut: yaw < 0 ? 0 : 70,
          earFlatten: pitch < 0 ? 0 : 1,
          hoopEarringSize: size,
          hoopEarringThickness: size === 16 ? 12 : 1
        });

        for (const earring of Object.values(rig.hoopEarrings).filter(Boolean)) {
          assert.ok(earring.centerline.every(point => (
            Number.isFinite(point.x) && Number.isFinite(point.y) && Number.isFinite(point.depth)
          )));
          for (const sector of Object.values(earring.sectors)) {
            assert.ok(sector.points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
            assert.ok(polygonIsSimple(sector.points));
            assert.equal(sector.boundaryEdges.length, 2);
          }
        }
      }
    }
  }
});
