import { defaultParams, sliderConfig, toggleConfig } from "./params.js";
import { defaultOutlineLandmarks, solveFaceRig } from "./rig.js";
import { renderFaceSvg } from "./svgRenderer.js";

const params = {
  ...defaultParams,
  outlineLandmarks: structuredClone(defaultOutlineLandmarks)
};
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

function formatControlName(key) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, char => char.toUpperCase());
}

function createControls() {
  for (const key in sliderConfig) {
    const [min, max, step] = sliderConfig[key];
    const label = document.createElement("label");

    label.innerHTML = `
      <span class="control-label">
        <span>${formatControlName(key)}</span>
        <span id="${key}-value">${params[key]}</span>
      </span>
      <input type="range" min="${min}" max="${max}" step="${step}" value="${params[key]}" id="${key}">
    `;

    controls.appendChild(label);

    label.querySelector("input").addEventListener("input", event => {
      params[key] = Number(event.target.value);
      document.getElementById(`${key}-value`).textContent = params[key];
      render();
    });
  }

  for (const key in toggleConfig) {
    const label = document.createElement("label");

    label.innerHTML = `
      <span class="toggle-control">
        <input type="checkbox" id="${key}" ${params[key] ? "checked" : ""}>
        <span>${formatControlName(key)}</span>
      </span>
    `;

    controls.appendChild(label);

    label.querySelector("input").addEventListener("change", event => {
      params[key] = event.target.checked;
      render();
    });
  }

  createLandmarkEditor();
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

function render() {
  stage.innerHTML = renderFaceSvg(solveFaceRig(params));
}

createControls();
render();
