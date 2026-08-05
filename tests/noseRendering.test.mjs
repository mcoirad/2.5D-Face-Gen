import assert from "node:assert/strict";
import test from "node:test";

import { defaultParams } from "../src/params.js";
import {
  defaultFeatureLandmarks,
  defaultOutlineLandmarks,
  solveFaceRig
} from "../src/rig.js";
import { renderFaceSvg } from "../src/svgRenderer.js";

function solve(overrides = {}) {
  return solveFaceRig({
    ...defaultParams,
    showHelmet: false,
    outlineLandmarks: structuredClone(defaultOutlineLandmarks),
    featureLandmarks: structuredClone(defaultFeatureLandmarks),
    ...overrides
  });
}

function segmentPath(svg, className) {
  const match = svg.match(new RegExp(`class="${className}"\\s+d="([^"]+)"`));
  return match?.[1] ?? null;
}

test("the bridge-to-tip segment hides only when the projected bridge is above", () => {
  const above = solve();
  above.features.nose.bridge.y = above.features.nose.tip.y - 1;
  assert.equal(segmentPath(renderFaceSvg(above), "nose-bridge-segment"), null);
  assert.ok(segmentPath(renderFaceSvg(above), "nose-near-nostril-segment"));
  assert.ok(segmentPath(renderFaceSvg(above), "nose-far-nostril-segment"));

  const level = solve();
  level.features.nose.bridge.y = level.features.nose.tip.y;
  assert.ok(segmentPath(renderFaceSvg(level), "nose-bridge-segment"));

  const below = solve();
  below.features.nose.bridge.y = below.features.nose.tip.y + 1;
  assert.ok(segmentPath(renderFaceSvg(below), "nose-bridge-segment"));
});

test("absolute yaw 0.5 restores the bridge-to-tip segment regardless of height", () => {
  for (const yaw of [-1, -0.5, 0.5, 1]) {
    const rig = solve({ yaw });
    rig.features.nose.bridge.y = rig.features.nose.tip.y - 1;
    assert.ok(
      segmentPath(renderFaceSvg(rig), "nose-bridge-segment"),
      `bridge segment at yaw ${yaw}`
    );
  }

  for (const yaw of [-0.4999, 0, 0.4999]) {
    const rig = solve({ yaw });
    rig.features.nose.bridge.y = rig.features.nose.tip.y - 1;
    assert.equal(
      segmentPath(renderFaceSvg(rig), "nose-bridge-segment"),
      null,
      `hidden bridge segment at yaw ${yaw}`
    );
  }
});

test("the far nostril segment hides only past absolute yaw 0.5", () => {
  for (const yaw of [-0.5, 0, 0.5]) {
    const svg = renderFaceSvg(solve({ yaw }));
    assert.ok(segmentPath(svg, "nose-near-nostril-segment"), `near segment at yaw ${yaw}`);
    assert.ok(segmentPath(svg, "nose-far-nostril-segment"), `far segment at yaw ${yaw}`);
  }

  for (const yaw of [-1, -0.5001, 0.5001, 1]) {
    const svg = renderFaceSvg(solve({ yaw }));
    assert.ok(segmentPath(svg, "nose-near-nostril-segment"), `near segment at yaw ${yaw}`);
    assert.equal(segmentPath(svg, "nose-far-nostril-segment"), null, `far segment at yaw ${yaw}`);
  }
});

test("the far segment targets the nostril furthest outward on either side", () => {
  for (const yaw of [-0.5, 0.5]) {
    const rig = solve({ yaw });
    const { leftNostril, rightNostril } = rig.features.nose;
    const expectedFar = Math.abs(leftNostril.x - 250) > Math.abs(rightNostril.x - 250)
      ? leftNostril
      : rightNostril;
    const expectedNear = expectedFar === leftNostril ? rightNostril : leftNostril;
    const svg = renderFaceSvg(rig);
    const farPath = segmentPath(svg, "nose-far-nostril-segment");
    const nearPath = segmentPath(svg, "nose-near-nostril-segment");

    assert.ok(farPath.endsWith(`L ${expectedFar.x} ${expectedFar.y}`), `far endpoint at yaw ${yaw}`);
    assert.ok(nearPath.endsWith(`L ${expectedNear.x} ${expectedNear.y}`), `near endpoint at yaw ${yaw}`);
  }
});
