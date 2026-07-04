import { colorConfig, defaultParams, selectConfig, sliderConfig, toggleConfig } from "./params.js";
import { defaultOutlineLandmarks, solveFaceRig } from "./rig.js";
import { renderFaceSvg } from "./svgRenderer.js";
import {
  deleteFace,
  listSavedFaceNames,
  loadFace,
  loadLastSession,
  saveFace,
  saveLastSession
} from "./storage.js";

const params = {
  ...defaultParams,
  outlineLandmarks: structuredClone(defaultOutlineLandmarks)
};
const faceIo = document.getElementById("face-io");
const controls = document.getElementById("controls");
const landmarkControls = document.getElementById("landmark-controls");
const stage = document.getElementById("stage");
const landmarkLabels = {
  front: "Front",
  threeQuarter: "3/4",
  side: "Side",
  startTemple: "Arc start",
  endTemple: "Arc end"
};
const controlGroups = [
  {
    title: "View",
    keys: ["yaw", "pitch"],
    open: true
  },
  {
    title: "Face",
    keys: [
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
    keys: ["outlineArcGap", "outlineOuterGap", "outlineInnerGap"],
    open: false
  },
  {
    title: "Eyes",
    keys: ["eyeSpacing", "eyeY", "eyeSize", "eyeUpperOpen", "eyeLowerOpen", "eyeTilt"],
    open: true
  },
  {
    title: "Nose",
    keys: ["noseLength"],
    open: false
  },
  {
    title: "Mouth",
    keys: ["mouthWidth", "smile"],
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
    title: "Display",
    keys: ["showGuides"],
    open: false
  }
];

function formatControlName(key) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, char => char.toUpperCase());
}

function createControls() {
  controls.innerHTML = "";
  landmarkControls.innerHTML = "";
  controls.appendChild(createRandomizerControl());

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
    <button type="button">Randomize sliders</button>
  `;

  wrapper.querySelector("button").addEventListener("click", () => {
    randomizeSliderParams();
    rebuildControls();
  });

  return wrapper;
}

function randomizeSliderParams() {
  for (const [key, [min, max, step]] of Object.entries(sliderConfig)) {
    params[key] = randomSliderValue(min, max, step);
  }
}

function randomSliderValue(min, max, step) {
  const steps = Math.round((max - min) / step);
  const value = min + Math.floor(Math.random() * (steps + 1)) * step;
  const precision = decimalPrecision(step);

  return Number(Math.min(max, Math.max(min, value)).toFixed(precision));
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

  const details = document.createElement("details");
  details.className = "control-group";
  details.open = group.open;
  details.innerHTML = `
    <summary>${group.title}</summary>
    <div class="control-group-content"></div>
  `;

  const content = details.querySelector(".control-group-content");
  fields.forEach(field => content.appendChild(field));

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
    params[key] = event.target.value;
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
    <summary>Outline landmarks</summary>
    <div class="landmark-editor-content"></div>
  `;

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

  fields.appendChild(createPointEditor(poseKey, "startTemple", landmarkLabels.startTemple));
  fields.appendChild(createPointEditor(poseKey, "endTemple", landmarkLabels.endTemple));

  params.outlineLandmarks[poseKey].lower.forEach((_, index) => {
    fields.appendChild(createPointEditor(poseKey, "lower", `Lower ${index + 1}`, index));
  });

  poseEditor.appendChild(fields);

  return poseEditor;
}

function createPointEditor(poseKey, pointKey, label, index = null) {
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
          value="${getLandmarkValue(poseKey, pointKey, index, field)}"
        >
      </label>
    `).join("")}
  `;

  const inputs = row.querySelectorAll("input");

  inputs.forEach(input => {
    input.addEventListener("input", event => {
      setLandmarkValue(
        poseKey,
        pointKey,
        index,
        event.target.dataset.field,
        Number(event.target.value)
      );

      render();
    });
  });

  return row;
}

function getLandmarkPoint(poseKey, pointKey, index) {
  if (pointKey === "lower") {
    return params.outlineLandmarks[poseKey].lower[index];
  }

  return params.outlineLandmarks[poseKey][pointKey];
}

function getLandmarkValue(poseKey, pointKey, index, field) {
  const point = getLandmarkPoint(poseKey, pointKey, index);

  return pointKey === "lower" ? point[field] : point[field];
}

function setLandmarkValue(poseKey, pointKey, index, field, value) {
  const point = getLandmarkPoint(poseKey, pointKey, index);

  if (pointKey === "lower") {
    point[field] = value;
    return;
  }

  point[Number(field)] = value;
}

function applyParams(snapshot) {
  const restored = {
    ...defaultParams,
    ...snapshot,
    outlineLandmarks: snapshot.outlineLandmarks
      ? structuredClone(snapshot.outlineLandmarks)
      : structuredClone(defaultOutlineLandmarks)
  };

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
    </div>
  `;

  faceIo.appendChild(panel);

  const nameInput = panel.querySelector("#face-save-name");
  const list = panel.querySelector("#face-list");

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

  renderFaceList(list);
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

const lastSession = loadLastSession();

if (lastSession) {
  applyParams(lastSession);
}

createFaceIo();
createControls();
render();
