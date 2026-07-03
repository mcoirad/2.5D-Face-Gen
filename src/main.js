import { defaultParams, sliderConfig, toggleConfig } from "./params.js";
import { solveFaceRig } from "./rig.js";
import { renderFaceSvg } from "./svgRenderer.js";

const params = { ...defaultParams };
const controls = document.getElementById("controls");
const stage = document.getElementById("stage");

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
}

function render() {
  stage.innerHTML = renderFaceSvg(solveFaceRig(params));
}

createControls();
render();
