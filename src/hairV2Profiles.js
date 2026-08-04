import { clamp, lerp, smoothstep } from "./geometry.js";

export const HAIR_V2_LENGTH_PROFILE_KEYS = Object.freeze([
  "hairV2CrownLengthScale",
  "hairV2FrontLengthScale",
  "hairV2SideLengthScale",
  "hairV2BackLengthScale",
  "hairV2FringeWidth",
  "hairV2FringeCenterLengthScale",
  "hairV2FringeEdgeLengthScale",
  "hairV2FringeBias",
  "hairV2FaceFrameLengthScale"
]);

const UNIFORM_VALUES = Object.freeze({
  hairV2CrownLengthScale: 1,
  hairV2FrontLengthScale: 1,
  hairV2SideLengthScale: 1,
  hairV2BackLengthScale: 1,
  hairV2FringeWidth: 0,
  hairV2FringeCenterLengthScale: 1,
  hairV2FringeEdgeLengthScale: 1,
  hairV2FringeBias: 0,
  hairV2FaceFrameLengthScale: 1
});

export const HAIR_V2_LENGTH_PRESETS = Object.freeze({
  uniform: Object.freeze({
    label: "Uniform",
    values: UNIFORM_VALUES
  }),
  fullBangs: Object.freeze({
    label: "Full Bangs",
    values: Object.freeze({
      ...UNIFORM_VALUES,
      hairV2FringeWidth: 0.8,
      hairV2FringeCenterLengthScale: 0.65,
      hairV2FringeEdgeLengthScale: 0.85
    })
  }),
  curtainBangs: Object.freeze({
    label: "Curtain Bangs",
    values: Object.freeze({
      ...UNIFORM_VALUES,
      hairV2FringeWidth: 0.85,
      hairV2FringeCenterLengthScale: 0.7,
      hairV2FringeEdgeLengthScale: 1.25,
      hairV2FaceFrameLengthScale: 1.1
    })
  }),
  sideBangs: Object.freeze({
    label: "Side Bangs",
    values: Object.freeze({
      ...UNIFORM_VALUES,
      hairV2FringeWidth: 0.9,
      hairV2FringeCenterLengthScale: 0.75,
      hairV2FringeEdgeLengthScale: 1.05,
      hairV2FringeBias: 0.55,
      hairV2FaceFrameLengthScale: 1.1
    })
  }),
  layeredHero: Object.freeze({
    label: "Layered Hero",
    values: Object.freeze({
      ...UNIFORM_VALUES,
      hairV2CrownLengthScale: 0.7,
      hairV2FrontLengthScale: 1.05,
      hairV2SideLengthScale: 0.9,
      hairV2BackLengthScale: 0.85,
      hairV2FaceFrameLengthScale: 1.45
    })
  }),
  shortSidesLongTop: Object.freeze({
    label: "Short Sides / Long Top",
    values: Object.freeze({
      ...UNIFORM_VALUES,
      hairV2CrownLengthScale: 1.25,
      hairV2SideLengthScale: 0.45,
      hairV2BackLengthScale: 0.65
    })
  }),
  faceFramingBob: Object.freeze({
    label: "Face-Framing Bob",
    values: Object.freeze({
      ...UNIFORM_VALUES,
      hairV2CrownLengthScale: 1.35,
      hairV2FrontLengthScale: 1.05,
      hairV2SideLengthScale: 0.95,
      hairV2BackLengthScale: 0.8,
      hairV2FaceFrameLengthScale: 1.3
    })
  })
});

export const HAIR_V2_LENGTH_PRESET_OPTIONS = Object.freeze([
  ...Object.entries(HAIR_V2_LENGTH_PRESETS).map(([value, preset]) => [value, preset.label]),
  ["custom", "Custom"]
]);

export function applyHairV2LengthPreset(target, presetName) {
  const preset = HAIR_V2_LENGTH_PRESETS[presetName];

  if (!preset) {
    return false;
  }

  Object.assign(target, preset.values, { hairV2LengthPreset: presetName });
  return true;
}

export function matchesHairV2LengthPreset(params, presetName) {
  const preset = HAIR_V2_LENGTH_PRESETS[presetName];

  return Boolean(preset) && HAIR_V2_LENGTH_PROFILE_KEYS.every(key => (
    params[key] === preset.values[key]
  ));
}

export function normalizeHairV2LengthPreset(params) {
  const presetName = params.hairV2LengthPreset ?? "uniform";

  if (presetName === "custom") {
    return "custom";
  }

  return matchesHairV2LengthPreset(params, presetName) ? presetName : "custom";
}

// Shared head-fixed style regions. Length profiling uses these masks to shape
// fringe and face-framing locks; gathered styles use the same masks to decide
// which deliberately loose locks should remain outside the gather.
export function resolveHairV2StyleMasks(params, u, v) {
  const absU = clamp(Math.abs(u), 0, 2);
  const fringeWidth = clamp(params.hairV2FringeWidth, 0, 1);
  let fringe = 0;

  if (fringeWidth > 0) {
    const halfWidth = lerp(0.2, 1, fringeWidth);
    const fringeLongitudeWeight = 1 - smoothstep(halfWidth * 0.75, halfWidth, absU);
    const fringeHairlineWeight = smoothstep(0.45, 0.9, clamp(v, 0, 1));
    fringe = fringeLongitudeWeight * fringeHairlineWeight;
  }

  const faceFrameLongitudeWeight = 1 - smoothstep(0.18, 0.42, Math.abs(absU - 0.55));
  const faceFrameHairlineWeight = smoothstep(0.5, 0.9, clamp(v, 0, 1));
  const faceFrame = faceFrameLongitudeWeight * faceFrameHairlineWeight;

  return { fringe, faceFrame };
}

export function resolveHairV2LengthScale(params, u, v) {
  const absU = clamp(Math.abs(u), 0, 2);
  const perimeterScale = absU <= 1
    ? lerp(
        params.hairV2FrontLengthScale,
        params.hairV2SideLengthScale,
        smoothstep(0, 1, absU)
      )
    : lerp(
        params.hairV2SideLengthScale,
        params.hairV2BackLengthScale,
        smoothstep(1, 2, absU)
      );
  const perimeterWeight = smoothstep(0.15, 0.85, clamp(v, 0, 1));
  let scale = lerp(params.hairV2CrownLengthScale, perimeterScale, perimeterWeight);
  const fringeWidth = clamp(params.hairV2FringeWidth, 0, 1);
  const masks = resolveHairV2StyleMasks(params, u, v);

  if (fringeWidth > 0) {
    const halfWidth = lerp(0.2, 1, fringeWidth);
    const normalizedU = clamp(u / halfWidth, -1, 1);
    const fringeEdgeWeight = smoothstep(0, 1, Math.abs(normalizedU));
    const fringeShapeScale = lerp(
      params.hairV2FringeCenterLengthScale,
      params.hairV2FringeEdgeLengthScale,
      fringeEdgeWeight
    );
    const biasedFringeScale = fringeShapeScale * (1 + params.hairV2FringeBias * normalizedU);

    scale *= lerp(1, biasedFringeScale, masks.fringe);
  }

  scale *= lerp(1, params.hairV2FaceFrameLengthScale, masks.faceFrame);

  return clamp(scale, 0.15, 2.5);
}
