import { colorConfig, defaultParams, selectConfig, sliderConfig, toggleConfig } from "./params.js";
import {
  applyHairV2LengthPreset,
  HAIR_V2_LENGTH_PROFILE_KEYS,
  normalizeHairV2LengthPreset
} from "./hairV2Profiles.js";
import { defaultFeatureLandmarks, defaultOutlineLandmarks, solveFaceRig, withFeatureLandmarkFallbacks } from "./rig.js";
import { renderFaceSvg } from "./svgRenderer.js";
import {
  createFaceArchive,
  deleteFace,
  importFaceArchive,
  listSavedFaceNames,
  loadDefaultFaceArchive,
  loadFace,
  loadLastSession,
  saveFace,
  saveLastSession,
  seedDefaultFaceArchive
} from "./storage.js";

const params = {
  ...defaultParams,
  outlineLandmarks: structuredClone(defaultOutlineLandmarks),
  featureLandmarks: structuredClone(defaultFeatureLandmarks)
};
const faceIo = document.getElementById("face-io");
const controls = document.getElementById("controls");
const landmarkControls = document.getElementById("landmark-controls");
const stage = document.getElementById("stage");
const viewControls = document.getElementById("view-controls");
const landmarkLabels = {
  front: "Front",
  threeQuarter: "3/4",
  side: "Side",
  startTemple: "Arc start",
  endTemple: "Arc end",
  bridge: "Bridge",
  tip: "Tip",
  base: "Base",
  left: "Left",
  mid: "Mid",
  right: "Right",
  moustacheLeft: "Moustache left root",
  moustacheRight: "Moustache right root",
  soulPatchRoot: "Soul patch root",
  earTopX: "Ear top X",
  earBottomX: "Ear bottom X"
};
const viewControlGroup = {
  title: "View",
  keys: ["yaw", "pitch"],
  open: true
};
const controlGroups = [
  {
    title: "Face",
    keys: [
      "skinColor",
      "faceWidth",
      "faceHeight",
      "lowerFaceWidth",
      "lowerFaceHeight",
      "lowerFaceY",
      "lowerFaceSideShift"
    ],
    open: true
  },
  {
    title: "Outline",
    keys: ["outlineArcGap", "outlineOuterGap", "outlineInnerGap", "faceRoundness", "showProfileOutlineExtension", "outlineIgnoreMouthProtrusion"],
    open: false
  },
  {
    title: "Body",
    keys: [
      "showBody",
      "showArms",
      "armLength",
      "leftArmRotation",
      "rightArmRotation",
      "bodyColor",
      "neckLength",
      "neckTopWidth",
      "neckBottomWidth",
      "neckOverlap",
      "torsoWidth",
      "torsoLength",
      "torsoNarrowing",
      "shoulderRadius",
      "shoulderGap",
      "ribCageWidth",
      "ribCageHeight",
      "ribCageY",
      "ribCageTilt",
      "ribCageSeparate"
    ],
    open: false
  },
  {
    title: "Clothing",
    keys: [
      "showClothing",
      "clothingColor",
      "clothingOffset",
      "clothingSleeveLength",
      "clothingCollarHeight",
      "clothingCollarOpeningWidth",
      "clothingCollarOpeningDepth",
      "clothingVTipDepth",
      "showClothingGildedEdge",
      "clothingGildedEdgeColor",
      "clothingGildedEdgeWidth"
    ],
    open: false
  },
  {
    title: "Cloak — Cowl V1",
    keys: [
      "showCloak",
      "cloakColor",
      "showCloakShine",
      "cloakFoldCount",
      "cloakFoldScale",
      "cloakFoldWidth",
      "cloakFoldDepth",
      "cloakFoldSag",
      "cloakFoldOverhang",
      "cloakFoldSweep",
      "cloakFoldIrregularity",
      "cloakShoulderDrape",
      "cloakFrontOverlap",
      "cloakAsymmetry"
    ],
    open: false
  },
  {
    title: "Chest Landmarks",
    keys: [
      "showClavicles",
      "clavicleAngleOffset",
      "clavicleYDrop",
      "clavicleRadiusOffset",
      "clavicleMedialWidth",
      "clavicleLength",
      "clavicleCurve",
      "axillaAngleOffset",
      "axillaYDrop",
      "axillaRadiusInset",
      "costalAngleOffset",
      "costalYDrop",
      "costalRadiusInset",
      "sternalNotchYDrop",
      "sternalNotchZ",
      "xiphoidYDrop",
      "xiphoidZ",
      "pecZ",
      "pecY"
    ],
    open: false
  },
  {
    title: "Armor",
    keys: [
      "showArmor",
      "armorColor",
      "showPauldrons",
      "showBreastplate",
      "breastplateOffset",
      "breastplateNeckClearance",
      "breastplateNeckDepth",
      "breastplateNeckWrapDepth",
      "pauldronPosition",
      "pauldronYOffset",
      "pauldronCurve"
    ],
    open: false
  },
  {
    title: "Ears",
    keys: ["showEars", "earStickOut", "earFlatten", "earCurve"],
    open: false
  },
  {
    title: "Eyes",
    keys: [
      "eyeSpacing",
      "eyeY",
      "eyeSize",
      "eyeUpperOpen",
      "eyeLowerOpen",
      "eyeTopCurve",
      "eyeBottomCurve",
      "eyeTrapezoid",
      "eyeOuterCornerOut",
      "eyeOuterCornerUp",
      "eyeRotation",
      "eyeIrisSize",
      "eyePupilSize",
      "eyeIrisColor",
      "eyeIrisGradient",
      "eyeShine",
      "eyeShineSize",
      "eyeUpperLidWidth",
      "eyeOuterCornerWidth",
      "eyeLowerLidWidth",
      "eyeInnerCornerWidth",
      "showUpperLashes",
      "showLowerLashes",
      "eyeLashLength",
      "eyeLashCount",
      "showEyeCorner",
      "eyeCornerExtend",
      "eyeCornerTopCurve",
      "eyeCornerBottomCurve"
    ],
    open: true
  },
  {
    title: "Eyebrows",
    keys: [
      "eyebrowTilt",
      "eyebrowY",
      "eyebrowLength",
      "eyebrowHeight",
      "eyebrowCurve",
      "eyebrowSharpen",
      "showEyebrowStroke"
    ],
    open: true
  },
  {
    title: "Shading",
    keys: ["showEyeShading", "showBaggyEyeShading"],
    open: true
  },
  {
    title: "Details",
    keys: [
      "showEyeScar",
      "eyeScarSide",
      "eyeScarIrisColor",
      "showFaceScar",
      "faceScarCenterX",
      "faceScarCenterY",
      "faceScarAngle",
      "faceScarLength",
      "faceScarWidth"
    ],
    open: false
  },
  {
    title: "Nose",
    keys: [
      "noseLength",
      "noseY",
      "noseWidth",
      "noseProtrusion",
      "showNostrilCurves",
      "nostrilCurveScale"
    ],
    open: false
  },
  {
    title: "Mouth",
    keys: [
      "mouthWidth",
      "mouthPosition",
      "mouthHeight",
      "upperLipCurve",
      "lowerLipCurve",
      "teethGap",
      "showUpperTeeth",
      "showLowerTeeth",
      "mouthCavityColor",
      "clipMouthToFace"
    ],
    open: false
  },
  {
    title: "Helmet",
    keys: [
      "showHelmet",
      "showHelmetShell",
      "showHelmetFacePlate",
      "showHelmetFarCheekGuard",
      "showHelmetNearCheekGuard",
      "showHelmetNoseGuard"
    ],
    open: false
  },
  {
    title: "Hair",
    keys: [
      "hairRenderMode",
      "hairColor",
      "showHairStrands",
      "showHairPartGuide",
      "hairMirror",
      "hairPartPosition",
      "hairPartDepth",
      "hairline",
      "hairlineShape",
      "hairSideCoverage",
      "hairCrownCoverage",
      "hairMalePatternBaldnessBias",
      "hairBangsBias",
      "hairBangsLength",
      "hairHaircutType",
      "hairHaircutLength",
      "hairUndercutBias",
      "hairLockCount",
      "hairLockWidth",
      "hairLockLength",
      "hairLockTaper",
      "hairLockCurve",
      "hairCurveType",
      "hairCurveRhythm",
      "hairCurveTension",
      "hairTipHook",
      "hairLockGravity",
      "hairLockAsymmetry",
      "hairLockDetailLines",
      "hairStrandCount",
      "hairStrandLength",
      "hairStrandThickness",
      "hairStrandCurve",
      "hairStrandSplitCurve",
      "hairDownBias"
    ],
    open: true
  },
  {
    title: "Hair v2",
    keys: [
      "showHairV2",
      "showHairV2PartGuide",
      "hairV2Mirror",
      "hairV2Color",
      "hairV2LockCount",
      "hairV2LockWidth",
      "hairV2LockLength",
      "hairV2LengthPreset",
      "hairV2CrownLengthScale",
      "hairV2FrontLengthScale",
      "hairV2SideLengthScale",
      "hairV2BackLengthScale",
      "hairV2FringeWidth",
      "hairV2FringeCenterLengthScale",
      "hairV2FringeEdgeLengthScale",
      "hairV2FringeBias",
      "hairV2FaceFrameLengthScale",
      "hairV2LockRootRound",
      "hairV2PartOffset",
      "hairV2PartLength",
      "hairV2PerpBias",
      "hairV2RadialBias",
      "hairV2Gravity",
      "hairV2CurlInterval",
      "hairV2CurlAngle",
      "hairV2CurlPeriod",
      "hairV2CurlDelay",
      "showHairV2ScalpBase",
      "hairV2ScalpBaseCoverage",
      "hairV2SharedOutline",
      "showHairV2Shine",
      "hairV2ShineWidth",
      "hairV2ShineLength",
      "hairV2LightX"
    ],
    open: true
  },
  {
    title: "Facial Hair",
    keys: ["showMoustache", "moustacheLength", "showSoulPatch", "showBeard", "beardCoverage", "beardLockCount", "beardLength"],
    open: true
  },
  {
    title: "Ponytail",
    keys: [
      "showHairV2Ponytail",
      "hairV2PonytailHeight",
      "hairV2PonytailLength",
      "hairV2PonytailWidth",
      "hairV2PonytailLift",
      "hairV2PonytailSwing",
      "hairV2PonytailAttractionArea",
      "hairV2PonytailTieColor"
    ],
    open: true
  },
  {
    title: "Double Ponytail",
    keys: [
      "showHairV2DoublePonytail",
      "hairV2DoublePonytailLayout",
      "hairV2DoublePonytailHeight",
      "hairV2DoublePonytailSeparation",
      "hairV2DoublePonytailLength",
      "hairV2DoublePonytailWidth",
      "hairV2DoublePonytailLift",
      "hairV2DoublePonytailSplay",
      "hairV2DoublePonytailAttractionArea",
      "hairV2DoublePonytailTieColor"
    ],
    open: true
  },
  {
    title: "Side Tied Locks",
    keys: [
      "showHairV2SideTiedLocks",
      "hairV2SideTiedLocksSide",
      "hairV2SideTiedLocksRootPosition",
      "hairV2SideTiedLocksLength",
      "hairV2SideTiedLocksWidth",
      "hairV2SideTiedLocksCount",
      "hairV2SideTiedLocksTiePosition",
      "hairV2SideTiedLocksTieColor"
    ],
    open: true
  },
  {
    title: "Accessories",
    keys: [
      "showHairV2Headband",
      "hairV2HeadbandColor",
      "showFerronniere",
      "ferronniereBandStyle",
      "ferronnierePosition",
      "ferronniereBandThickness",
      "ferronniereMetalColor",
      "ferronniereGemSize",
      "ferronniereGemColor",
      "ferronniereGemProtrusion",
      "showHoopEarrings",
      "hoopEarringSide",
      "hoopEarringSize",
      "hoopEarringThickness",
      "hoopEarringColor"
    ],
    open: true
  },
  {
    title: "Display",
    keys: ["showGuides", "removeStrokes"],
    open: false
  }
];

function formatControlName(key) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, char => char.toUpperCase());
}

function createControls() {
  controls.innerHTML = "";
  viewControls.innerHTML = "";
  landmarkControls.innerHTML = "";
  controls.appendChild(createRandomizerControl());

  const viewGroupElement = createControlGroup(viewControlGroup);
  if (viewGroupElement) {
    viewControls.appendChild(viewGroupElement);
  }

  for (const group of controlGroups) {
    const groupElement = createControlGroup(group);

    if (groupElement) {
      controls.appendChild(groupElement);
    }
  }

  createLandmarkEditor();
}

function createRandomizerControl() {
  const wrapper = document.createElement("div");
  wrapper.className = "randomizer-control";
  wrapper.innerHTML = `
    <button type="button" data-randomizer-mode="uniform">Randomize sliders</button>
    <button type="button" data-randomizer-mode="normal">Randomize normal</button>
  `;

  wrapper.querySelectorAll("button").forEach(button => {
    button.addEventListener("click", () => {
      randomizeSliders(Object.keys(sliderConfig), button.dataset.randomizerMode);
    });
  });

  return wrapper;
}

function randomizeSliders(keys, distribution = "uniform") {
  for (const key of keys) {
    const [min, max, step] = sliderConfig[key];
    params[key] = distribution === "normal"
      ? randomNormalSliderValue(key, min, max, step)
      : randomSliderValue(min, max, step);
    updateSliderControl(key);
  }

  if (keys.some(key => HAIR_V2_LENGTH_PROFILE_KEYS.includes(key))) {
    params.hairV2LengthPreset = "custom";
    updateSelectControl("hairV2LengthPreset");
  }

  render();
}

function updateSliderControl(key) {
  const input = document.getElementById(key);
  const valueLabel = document.getElementById(`${key}-value`);

  if (input) {
    input.value = params[key];
  }

  if (valueLabel) {
    valueLabel.textContent = params[key];
  }
}

function updateSelectControl(key) {
  const input = document.getElementById(key);

  if (input) {
    input.value = params[key];
  }
}

function randomSliderValue(min, max, step) {
  const steps = Math.round((max - min) / step);
  const value = min + Math.floor(Math.random() * (steps + 1)) * step;
  const precision = decimalPrecision(step);

  return Number(Math.min(max, Math.max(min, value)).toFixed(precision));
}

function randomNormalSliderValue(key, min, max, step) {
  const mean = Number.isFinite(defaultParams[key])
    ? Math.min(max, Math.max(min, defaultParams[key]))
    : (min + max) / 2;
  const standardDeviation = (max - min) / 6;
  const precision = decimalPrecision(step);
  let value = mean;

  for (let attempt = 0; attempt < 12; attempt += 1) {
    value = mean + randomStandardNormal() * standardDeviation;

    if (value >= min && value <= max) {
      break;
    }
  }

  const steppedValue = min + Math.round((value - min) / step) * step;

  return Number(Math.min(max, Math.max(min, steppedValue)).toFixed(precision));
}

function randomStandardNormal() {
  const u1 = 1 - Math.random();
  const u2 = Math.random();

  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function decimalPrecision(value) {
  const text = String(value);

  return text.includes(".") ? text.split(".")[1].length : 0;
}

function createControlGroup(group) {
  const fields = group.keys
    .map(createControlForKey)
    .filter(Boolean);

  if (!fields.length) {
    return null;
  }

  const groupSliderKeys = group.keys.filter(key => sliderConfig[key]);

  const details = document.createElement("details");
  details.className = "control-group";
  details.open = group.open;
  details.innerHTML = `
    <summary>
      <span>${group.title}</span>
    </summary>
    <div class="control-group-content"></div>
  `;

  const content = details.querySelector(".control-group-content");
  fields.forEach(field => content.appendChild(field));

  if (groupSliderKeys.length) {
    const randomizeButton = document.createElement("button");
    randomizeButton.type = "button";
    randomizeButton.className = "group-randomize";
    randomizeButton.textContent = "Randomize";

    randomizeButton.addEventListener("click", event => {
      event.preventDefault();
      event.stopPropagation();
      randomizeSliders(groupSliderKeys);
    });

    details.querySelector("summary").appendChild(randomizeButton);
  }

  return details;
}

function createControlForKey(key) {
  if (sliderConfig[key]) {
    return createSliderControl(key);
  }

  if (selectConfig[key]) {
    return createSelectControl(key);
  }

  if (colorConfig[key]) {
    return createColorControl(key);
  }

  if (toggleConfig[key]) {
    return createToggleControl(key);
  }

  return null;
}

function createSliderControl(key) {
  const [min, max, step] = sliderConfig[key];
  const label = document.createElement("label");

  label.innerHTML = `
    <span class="control-label">
      <span>${formatControlName(key)}</span>
      <span id="${key}-value">${params[key]}</span>
    </span>
    <input type="range" min="${min}" max="${max}" step="${step}" value="${params[key]}" id="${key}">
  `;

  label.querySelector("input").addEventListener("input", event => {
    params[key] = Number(event.target.value);
    document.getElementById(`${key}-value`).textContent = params[key];

    if (HAIR_V2_LENGTH_PROFILE_KEYS.includes(key)) {
      params.hairV2LengthPreset = "custom";
      updateSelectControl("hairV2LengthPreset");
    }

    render();
  });

  return label;
}

function createSelectControl(key) {
  const label = document.createElement("label");

  label.innerHTML = `
    <span class="control-label">
      <span>${formatControlName(key)}</span>
    </span>
    <select id="${key}">
      ${selectConfig[key].map(([value, labelText]) => `
        <option value="${value}" ${params[key] === value ? "selected" : ""}>${labelText}</option>
      `).join("")}
    </select>
  `;

  label.querySelector("select").addEventListener("change", event => {
    const value = event.target.value;

    if (key === "hairV2LengthPreset" && value !== "custom") {
      applyHairV2LengthPreset(params, value);
      HAIR_V2_LENGTH_PROFILE_KEYS.forEach(updateSliderControl);
    } else {
      params[key] = value;
    }

    render();
  });

  return label;
}

function createColorControl(key) {
  const label = document.createElement("label");

  label.innerHTML = `
    <span class="control-label">
      <span>${formatControlName(key)}</span>
      <span id="${key}-value">${params[key]}</span>
    </span>
    <input type="color" value="${params[key]}" id="${key}">
  `;

  label.querySelector("input").addEventListener("input", event => {
    params[key] = event.target.value;
    document.getElementById(`${key}-value`).textContent = params[key];
    render();
  });

  return label;
}

function createToggleControl(key) {
  const label = document.createElement("label");

  label.innerHTML = `
    <span class="toggle-control">
      <input type="checkbox" id="${key}" ${params[key] ? "checked" : ""}>
      <span>${formatControlName(key)}</span>
    </span>
  `;

  label.querySelector("input").addEventListener("change", event => {
    params[key] = event.target.checked;
    render();
  });

  return label;
}

function createLandmarkEditor() {
  const editor = document.createElement("details");
  editor.className = "landmark-editor";

  editor.innerHTML = `
    <summary>
      <span>Landmarks</span>
      <button type="button" class="landmark-reset">Reset landmarks</button>
    </summary>
    <div class="landmark-editor-content"></div>
  `;

  editor.querySelector(".landmark-reset").addEventListener("click", event => {
    event.preventDefault();
    event.stopPropagation();
    resetLandmarks();
  });

  const content = editor.querySelector(".landmark-editor-content");

  for (const poseKey of Object.keys(params.outlineLandmarks)) {
    content.appendChild(createPoseEditor(poseKey));
  }

  landmarkControls.appendChild(editor);
}

function createPoseEditor(poseKey) {
  const poseEditor = document.createElement("details");
  poseEditor.className = "pose-editor";
  poseEditor.open = poseKey === "front";
  poseEditor.innerHTML = `<summary>${landmarkLabels[poseKey]}</summary>`;

  const fields = document.createElement("div");
  fields.className = "landmark-grid";

  fields.appendChild(createPointEditor("outline", poseKey, "startTemple", landmarkLabels.startTemple));
  fields.appendChild(createPointEditor("outline", poseKey, "endTemple", landmarkLabels.endTemple));

  params.outlineLandmarks[poseKey].lower.forEach((_, index) => {
    fields.appendChild(createPointEditor("outline", poseKey, "lower", `Lower ${index + 1}`, index));
  });

  ["bridge", "tip", "base"].forEach(pointKey => {
    fields.appendChild(createPointEditor("feature", poseKey, pointKey, landmarkLabels[pointKey], null, "nose"));
  });

  fields.appendChild(createPointEditor("feature", poseKey, "left", landmarkLabels.moustacheLeft, null, "moustache"));
  fields.appendChild(createPointEditor("feature", poseKey, "right", landmarkLabels.moustacheRight, null, "moustache"));
  fields.appendChild(createPointEditor("feature", poseKey, "root", landmarkLabels.soulPatchRoot, null, "soulPatch"));

  ["left", "mid", "right"].forEach(pointKey => {
    fields.appendChild(createPointEditor("feature", poseKey, pointKey, landmarkLabels[pointKey], null, "mouth"));
  });

  if (poseKey === "side") {
    fields.appendChild(createScalarLandmarkEditor(poseKey, "topX", landmarkLabels.earTopX, "ears"));
    fields.appendChild(createScalarLandmarkEditor(poseKey, "bottomX", landmarkLabels.earBottomX, "ears"));
  }

  poseEditor.appendChild(fields);

  return poseEditor;
}

function createPointEditor(groupKey, poseKey, pointKey, label, index = null, family = null) {
  const row = document.createElement("div");
  const fields = pointKey === "lower"
    ? [
      ["angle", "angle", 1, -360, 360],
      ["offsetX", "x offset", 0.01, -2, 2],
      ["offsetY", "y offset", 0.01, -2, 2]
    ]
    : [
      [0, "x", 0.01, -2, 2],
      [1, "y", 0.01, -2, 2]
    ];

  row.className = `landmark-row ${pointKey === "lower" ? "landmark-row-wide" : ""}`;
  row.innerHTML = `
    <span class="landmark-name">${label}</span>
    ${fields.map(([field, fieldLabel, step, min, max]) => `
      <label>
        <span>${fieldLabel}</span>
        <input
          type="number"
          step="${step}"
          min="${min}"
          max="${max}"
          data-field="${field}"
          value="${getLandmarkValue(groupKey, poseKey, pointKey, index, field, family)}"
        >
      </label>
    `).join("")}
  `;

  const inputs = row.querySelectorAll("input");

  inputs.forEach(input => {
    input.addEventListener("input", event => {
      setLandmarkValue(
        groupKey,
        poseKey,
        pointKey,
        index,
        event.target.dataset.field,
        Number(event.target.value),
        family
      );

      render();
    });
  });

  return row;
}

function createScalarLandmarkEditor(poseKey, pointKey, label, family) {
  const row = document.createElement("div");
  row.className = "landmark-row";
  row.innerHTML = `
    <span class="landmark-name">${label}</span>
    <label>
      <span>x</span>
      <input
        type="number"
        step="0.01"
        min="-2"
        max="2"
        value="${params.featureLandmarks[poseKey][family][pointKey]}"
      >
    </label>
  `;

  row.querySelector("input").addEventListener("input", event => {
    params.featureLandmarks[poseKey][family][pointKey] = Number(event.target.value);
    render();
  });

  return row;
}

function getLandmarkPoint(groupKey, poseKey, pointKey, index, family) {
  if (groupKey === "outline") {
    return pointKey === "lower"
      ? params.outlineLandmarks[poseKey].lower[index]
      : params.outlineLandmarks[poseKey][pointKey];
  }

  return params.featureLandmarks[poseKey][family][pointKey];
}

function getLandmarkValue(groupKey, poseKey, pointKey, index, field, family) {
  const point = getLandmarkPoint(groupKey, poseKey, pointKey, index, family);

  return point[field];
}

function setLandmarkValue(groupKey, poseKey, pointKey, index, field, value, family) {
  const point = getLandmarkPoint(groupKey, poseKey, pointKey, index, family);

  if (pointKey === "lower") {
    point[field] = value;
    return;
  }

  point[Number(field)] = value;
}

function resetLandmarks() {
  params.outlineLandmarks = structuredClone(defaultOutlineLandmarks);
  params.featureLandmarks = structuredClone(defaultFeatureLandmarks);
  rebuildLandmarkControls();
  render();
}

function rebuildLandmarkControls() {
  landmarkControls.innerHTML = "";
  createLandmarkEditor();
}

function applyParams(snapshot) {
  const migratedSnapshot = {
    ...snapshot
  };

  if (snapshot.eyebrowTilt !== undefined || snapshot.eyeTilt !== undefined) {
    migratedSnapshot.eyebrowTilt = snapshot.eyebrowTilt ?? snapshot.eyeTilt;
  }

  const restored = {
    ...defaultParams,
    ...migratedSnapshot,
    outlineLandmarks: migratedSnapshot.outlineLandmarks
      ? structuredClone(migratedSnapshot.outlineLandmarks)
      : structuredClone(defaultOutlineLandmarks),
    featureLandmarks: structuredClone(withFeatureLandmarkFallbacks(migratedSnapshot.featureLandmarks))
  };

  restored.hairV2LengthPreset = normalizeHairV2LengthPreset(restored);

  Object.assign(params, restored);
}

function rebuildControls() {
  createControls();
  render();
}

function createFaceIo() {
  const panel = document.createElement("details");
  panel.className = "face-io";
  panel.open = true;
  panel.innerHTML = `
    <summary>Faces</summary>
    <div class="face-io-content">
      <div class="face-io-row">
        <input type="text" id="face-save-name" placeholder="Face name" autocomplete="off">
        <button type="button" id="face-save">Save</button>
      </div>
      <div class="face-io-row">
        <select id="face-list"></select>
        <button type="button" id="face-load">Load</button>
        <button type="button" id="face-delete">Delete</button>
      </div>
      <div class="face-io-row">
        <button type="button" id="face-export">Export JSON</button>
        <button type="button" id="face-import">Import JSON</button>
        <input type="file" id="face-import-file" accept="application/json,.json">
      </div>
      <div class="face-io-row">
        <button type="button" id="face-copy">Copy current face JSON</button>
      </div>
      <div class="face-io-row">
        <button type="button" id="face-download-svg">Download SVG</button>
      </div>
      <div class="face-io-status" id="face-io-status" aria-live="polite"></div>
    </div>
  `;

  faceIo.appendChild(panel);

  const nameInput = panel.querySelector("#face-save-name");
  const list = panel.querySelector("#face-list");
  const importFile = panel.querySelector("#face-import-file");
  const status = panel.querySelector("#face-io-status");

  panel.querySelector("#face-save").addEventListener("click", () => {
    const name = nameInput.value.trim();

    if (!name) {
      return;
    }

    saveFace(name, params);
    nameInput.value = "";
    renderFaceList(list, name);
  });

  panel.querySelector("#face-load").addEventListener("click", () => {
    const name = list.value;
    const snapshot = name ? loadFace(name) : null;

    if (!snapshot) {
      return;
    }

    applyParams(snapshot);
    rebuildControls();
  });

  panel.querySelector("#face-delete").addEventListener("click", () => {
    const name = list.value;

    if (!name) {
      return;
    }

    deleteFace(name);
    renderFaceList(list);
  });

  panel.querySelector("#face-export").addEventListener("click", () => {
    exportFacesJson();
    status.textContent = "Exported saved faces.";
  });

  panel.querySelector("#face-copy").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(params, null, 2));
      status.textContent = "Copied current face JSON to clipboard.";
    } catch (error) {
      status.textContent = "Copy failed.";
    }
  });

  panel.querySelector("#face-download-svg").addEventListener("click", () => {
    downloadSvg();
    status.textContent = "Downloaded SVG.";
  });

  panel.querySelector("#face-import").addEventListener("click", () => {
    importFile.click();
  });

  importFile.addEventListener("change", async () => {
    const [file] = importFile.files;

    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const result = importFaceArchive(JSON.parse(text));

      if (!result.ok) {
        status.textContent = "Import failed.";
        return;
      }

      renderFaceList(list);
      status.textContent = `Imported ${result.count} saved face${result.count === 1 ? "" : "s"}.`;
    } catch (error) {
      status.textContent = "Import failed.";
    } finally {
      importFile.value = "";
    }
  });

  renderFaceList(list);
}

function downloadSvg() {
  const svgEl = stage.querySelector("svg");

  if (!svgEl) {
    return;
  }

  const clone = svgEl.cloneNode(true);

  if (!clone.getAttribute("xmlns")) {
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  }

  const blob = new Blob([clone.outerHTML], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `test-face-${new Date().toISOString().slice(0, 10)}.svg`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function exportFacesJson() {
  const archive = createFaceArchive(params);
  const blob = new Blob([JSON.stringify(archive, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `test-face-saves-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function renderFaceList(list, selectedName = null) {
  const names = listSavedFaceNames();

  list.innerHTML = "";

  if (!names.length) {
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.disabled = true;
    placeholder.selected = true;
    placeholder.textContent = "No saved faces";
    list.appendChild(placeholder);
    return;
  }

  for (const name of names) {
    const option = document.createElement("option");
    option.value = name;
    option.textContent = name;
    list.appendChild(option);
  }

  if (selectedName && names.includes(selectedName)) {
    list.value = selectedName;
  }
}

function render() {
  stage.innerHTML = renderFaceSvg(solveFaceRig(params));
  saveLastSession(params);
}

let initialFace = loadLastSession();

if (!initialFace) {
  const defaultArchive = await loadDefaultFaceArchive();
  initialFace = seedDefaultFaceArchive(defaultArchive);
}

if (initialFace) {
  applyParams(initialFace);
}

createFaceIo();
createControls();
render();
