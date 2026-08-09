import assert from "node:assert/strict";
import test from "node:test";

import {
  colorConfig,
  defaultParams,
  selectConfig,
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

function selectedEye(rig) {
  return rig.features.eyes.find(eye => eye.scar);
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
  const abC = orientation(a, b, c);
  const abD = orientation(a, b, d);
  const cdA = orientation(c, d, a);
  const cdB = orientation(c, d, b);
  return abC * abD < -EPSILON && cdA * cdB < -EPSILON;
}

function assertSimple(points) {
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
        `edges ${first} and ${second} should not cross`
      );
    }
  }
}

test("eye scar controls are save-compatible and opt in", () => {
  assert.equal(defaultParams.showEyeScar, false);
  assert.equal(defaultParams.eyeScarSide, "left");
  assert.equal(defaultParams.eyeScarIrisColor, "#4f718c");
  assert.deepEqual(selectConfig.eyeScarSide, [
    ["left", "Screen Left"],
    ["right", "Screen Right"]
  ]);
  assert.equal(toggleConfig.showEyeScar, true);
  assert.equal(colorConfig.eyeScarIrisColor, true);

  const rig = solve({ eyeScarIrisColor: "#abcdef" });
  assert.ok(rig.features.eyes.every(eye => eye.scar === null));
  assert.ok(rig.features.eyes.every(eye => eye.irisColor === defaultParams.eyeIrisColor));
  assert.doesNotMatch(renderFaceSvg(rig), /class="eye-scar"/);
});

test("the scar and iris override target projected screen side", () => {
  for (const side of ["left", "right"]) {
    const rig = solve({
      showEyeScar: true,
      eyeScarSide: side,
      eyeScarIrisColor: "#2468ac"
    });
    const target = selectedEye(rig);
    const other = rig.features.eyes.find(eye => eye !== target);
    const xs = rig.features.eyes.map(eye => eye.center.x);

    assert.ok(target);
    assert.equal(target.center.x, side === "left" ? Math.min(...xs) : Math.max(...xs));
    assert.equal(target.irisColor, "#2468ac");
    assert.equal(other.irisColor, defaultParams.eyeIrisColor);
    assert.equal(target.scar.screenSide, side);
    assert.equal(other.scar, null);
  }
});

test("screen-side selection can change anatomical eye with yaw and resolves exact ties deterministically", () => {
  const frontLeft = selectedEye(solve({ showEyeScar: true, eyeScarSide: "left", yaw: 0 }));
  const turnedLeft = selectedEye(solve({ showEyeScar: true, eyeScarSide: "left", yaw: -0.8 }));

  assert.equal(frontLeft.side, -1);
  assert.equal(turnedLeft.side, 1);

  const tiedLeft = solve({ showEyeScar: true, eyeScarSide: "left", yaw: -1 });
  const tiedRight = solve({ showEyeScar: true, eyeScarSide: "right", yaw: -1 });
  assert.equal(tiedLeft.features.eyes[0].center.x, tiedLeft.features.eyes[1].center.x);
  assert.strictEqual(selectedEye(tiedLeft), tiedLeft.features.eyes[0]);
  assert.strictEqual(selectedEye(tiedRight), tiedRight.features.eyes[1]);
});

test("scar geometry is a finite simple tapered vertical polygon", () => {
  for (const eyeRotation of [-0.3, 0, 0.3]) {
    const eye = selectedEye(solve({
      showEyeScar: true,
      eyeRotation,
      eyeIrisSize: 14
    }));
    const { points, width } = eye.scar;
    const topCenterX = (points[0].x + points[7].x) / 2;
    const bottomCenterX = (points[3].x + points[4].x) / 2;
    const topWidth = points[7].x - points[0].x;
    const upperWidth = points[6].x - points[1].x;
    const bottomWidth = points[4].x - points[3].x;

    assert.equal(points.length, 8);
    assert.ok(points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
    assert.ok(Math.abs(signedArea(points)) > EPSILON);
    assertSimple(points);
    assert.ok(Math.abs(topCenterX - eye.center.x) <= EPSILON);
    assert.ok(Math.abs(bottomCenterX - eye.center.x) <= EPSILON);
    assert.ok(Math.abs(upperWidth - width) <= EPSILON);
    assert.ok(Math.abs(topWidth - width * 0.4) <= EPSILON);
    assert.ok(Math.abs(bottomWidth - width * 0.4) <= EPSILON);
    assert.equal(eye.scar.fill, "#777777");
  }
});

test("scar width follows iris radius and clamps to two through four pixels", () => {
  const narrow = selectedEye(solve({ showEyeScar: true, eyeIrisSize: 4 }));
  const middle = selectedEye(solve({ showEyeScar: true, eyeIrisSize: 6 }));
  const wide = selectedEye(solve({ showEyeScar: true, eyeIrisSize: 20 }));

  assert.equal(narrow.scar.width, 2);
  assert.ok(middle.scar.width > 2 && middle.scar.width < 4);
  assert.equal(wide.scar.width, 4);
});

test("invalid override colors fall back and iris gradients derive from the selected color", () => {
  const invalid = solve({
    showEyeScar: true,
    eyeScarSide: "right",
    eyeScarIrisColor: "invalid"
  });
  assert.equal(selectedEye(invalid).irisColor, "#4f718c");

  const colored = solve({
    showEyeScar: true,
    eyeScarSide: "right",
    eyeScarIrisColor: "#123456",
    eyeIrisGradient: true
  });
  const selectedIndex = colored.features.eyes.indexOf(selectedEye(colored));
  const svg = renderFaceSvg(colored);

  assert.match(svg, new RegExp(`id="iris-grad-${selectedIndex}"[\\s\\S]*?<stop offset="1" stop-color="#123456"`));
});

test("the filled scar is face-clipped beneath hair, eye details, and stroke removal", () => {
  const rig = solve({
    showEyeScar: true,
    showEyeCorner: true,
    removeStrokes: true
  });
  const target = selectedEye(rig);
  const svg = renderFaceSvg(rig);
  const scarIndex = svg.indexOf('class="eye-scar"');
  const eyeFillIndex = svg.indexOf('fill="white"', scarIndex);
  const noseIndex = svg.indexOf('class="nose-near-nostril-segment"');
  const cornerPath = `M ${target.cornerMakeup.baseTopLeft.x} ${target.cornerMakeup.baseTopLeft.y}`;
  const headPath = svg.match(/class="head-shape"\s+d="([^"]+)"/)[1].trim();
  const scarClipPath = svg.match(/id="eye-scar-head-clip">\s*<path d="([^"]+)"/)[1].trim();

  assert.equal(scarClipPath, headPath);
  assert.ok(scarIndex < noseIndex, "skin scar should render before facial features and front hair");
  assert.ok(scarIndex < svg.indexOf(cornerPath));
  assert.ok(scarIndex < eyeFillIndex);
  assert.match(svg, /class="eye-scar-layer" clip-path="url\(#eye-scar-head-clip\)"/);
  assert.match(svg, /class="eye-scar"[\s\S]*?fill="#777777"[\s\S]*?stroke="none"/);
  assert.doesNotMatch(svg, /<line[^>]*class="eye-scar"/);
  assert.match(svg, /\*:not\(\.preserve-material-stroke\)/);
});

test("scar geometry remains finite across pose and eye-control extremes", () => {
  for (const yaw of [-1, -0.8, 0, 0.8, 1]) {
    for (const pitch of [-0.5, 0.5]) {
      for (const side of ["left", "right"]) {
        const rig = solve({
          showEyeScar: true,
          eyeScarSide: side,
          yaw,
          pitch,
          eyeSpacing: yaw < 0 ? 20 : 80,
          eyeSize: pitch < 0 ? 8 : 30,
          eyeUpperOpen: pitch < 0 ? 0 : 3,
          eyeLowerOpen: pitch < 0 ? 0 : 3,
          eyeRotation: yaw < 0 ? -0.3 : 0.3,
          eyeIrisSize: yaw === 0 ? 4 : 20
        });
        const eye = selectedEye(rig);

        assert.ok(eye);
        assert.ok(eye.scar.points.every(point => Number.isFinite(point.x) && Number.isFinite(point.y)));
        assertSimple(eye.scar.points);
      }
    }
  }
});
