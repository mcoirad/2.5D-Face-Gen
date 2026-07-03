const params = {
  yaw: 0,
  pitch: 0,
  faceWidth: 170,
  faceHeight: 230,
  sphereDivide: 0,
  chinWidth: 70,
  eyeSpacing: 46,
  eyeSize: 18,
  eyeTilt: 0,
  noseLength: 48,
  mouthWidth: 70,
  smile: 0
};

const sliders = {
  yaw: [-0.8, 0.8, 0.01],
  pitch: [-0.5, 0.5, 0.01],
  faceWidth: [120, 220, 1],
  faceHeight: [170, 290, 1],
  sphereDivide: [-45, 65, 1],
  chinWidth: [30, 130, 1],
  eyeSpacing: [25, 70, 1],
  eyeSize: [8, 30, 1],
  eyeTilt: [-0.6, 0.6, 0.01],
  noseLength: [20, 80, 1],
  mouthWidth: [30, 110, 1],
  smile: [-35, 35, 1]
};

const controls = document.getElementById("controls");
const stage = document.getElementById("stage");

function formatControlName(key) {
  return key.replace(/([A-Z])/g, " $1").replace(/^./, char => char.toUpperCase());
}

function createControls() {
  for (const key in sliders) {
    const [min, max, step] = sliders[key];

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
}

function rotateAndProject(point) {
  const [x, y, z] = point;

  const cy = Math.cos(params.yaw);
  const sy = Math.sin(params.yaw);
  const cp = Math.cos(params.pitch);
  const sp = Math.sin(params.pitch);

  const x1 = x * cy - z * sy;
  const z1 = x * sy + z * cy;

  const y1 = y * cp - z1 * sp;
  const z2 = y * sp + z1 * cp;

  const perspective = 500 / (500 + z2);

  return {
    x: 250 + x1 * perspective,
    y: 250 + y1 * perspective,
    scale: perspective,
    depth: z2
  };
}

function P(x, y, z = 0) {
  return rotateAndProject([x, y, z]);
}

function ellipse(p, rx, ry, extra = "") {
  return `
    <ellipse
      cx="${p.x}"
      cy="${p.y}"
      rx="${rx * p.scale}"
      ry="${ry * p.scale}"
      ${extra}
    />
  `;
}

function path(points, extra = "") {
  const d = points
    .map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`)
    .join(" ");

  return `<path d="${d}" ${extra}/>`;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function faceOutline() {
  const centerY = 10;
  const halfWidth = params.faceWidth / 2;
  const halfHeight = params.faceHeight / 2;
  const halfChin = params.chinWidth / 2;
  const jawWidth = Math.max(halfChin + 18, halfWidth * 0.45);
  const divideRatio = clamp(params.sphereDivide / halfHeight, -0.65, 0.65);
  const divideY = centerY + halfHeight * divideRatio;
  const lowerSpan = centerY + halfHeight - divideY;
  const rightTheta = Math.asin(divideRatio);
  const leftTheta = -Math.PI - rightTheta;
  const domeSegments = 18;
  const domePoints = [];

  for (let i = 0; i <= domeSegments; i += 1) {
    const t = i / domeSegments;
    const theta = leftTheta + (rightTheta - leftTheta) * t;
    const z = -5 * Math.max(0, -Math.sin(theta));

    domePoints.push(P(
      halfWidth * Math.cos(theta),
      centerY + halfHeight * Math.sin(theta),
      z
    ));
  }

  const leftSide = domePoints[0];
  const rightSide = domePoints[domePoints.length - 1];

  const rightCheekControl = P(halfWidth * 0.96, divideY + lowerSpan * 0.22, 12);
  const rightJawControl = P(jawWidth + 10, divideY + lowerSpan * 0.58, 22);
  const rightJaw = P(jawWidth, divideY + lowerSpan * 0.72, 24);
  const leftChin = P(-halfChin, centerY + halfHeight, 34);
  const rightChin = P(halfChin, centerY + halfHeight, 34);
  const leftJaw = P(-jawWidth, divideY + lowerSpan * 0.72, 24);
  const leftJawControl = P(-jawWidth - 10, divideY + lowerSpan * 0.58, 22);
  const leftCheekControl = P(-halfWidth * 0.96, divideY + lowerSpan * 0.22, 12);

  const d = [
    ...domePoints.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`),
    `C ${rightCheekControl.x} ${rightCheekControl.y} ${rightJawControl.x} ${rightJawControl.y} ${rightJaw.x} ${rightJaw.y}`,
    `L ${rightChin.x} ${rightChin.y}`,
    `L ${leftChin.x} ${leftChin.y}`,
    `L ${leftJaw.x} ${leftJaw.y}`,
    `C ${leftJawControl.x} ${leftJawControl.y} ${leftCheekControl.x} ${leftCheekControl.y} ${leftSide.x} ${leftSide.y}`,
    "Z"
  ].join(" ");

  return `
    <path
      d="${d}"
      fill="#fff"
      stroke="black"
      stroke-width="4"
      stroke-linejoin="round"
    />
  `;
}

function curvedMouth(left, mid, right) {
  return `
    <path
      d="M ${left.x} ${left.y} Q ${mid.x} ${mid.y} ${right.x} ${right.y}"
      fill="none"
      stroke="black"
      stroke-width="3"
      stroke-linecap="round"
    />
  `;
}

function render() {
  const leftEye = P(-params.eyeSpacing, -35, 35);
  const rightEye = P(params.eyeSpacing, -35, 35);

  const leftBrow1 = P(-params.eyeSpacing - 20, -65 - params.eyeTilt * 20, 35);
  const leftBrow2 = P(-params.eyeSpacing + 20, -65 + params.eyeTilt * 20, 35);

  const rightBrow1 = P(params.eyeSpacing - 20, -65 + params.eyeTilt * 20, 35);
  const rightBrow2 = P(params.eyeSpacing + 20, -65 - params.eyeTilt * 20, 35);

  const noseBridge = P(0, -10, 55);
  const noseTip = P(0, params.noseLength, 75);
  const leftNostril = P(-14, params.noseLength + 10, 58);
  const rightNostril = P(14, params.noseLength + 10, 58);

  const mouthLeft = P(-params.mouthWidth / 2, 85, 45);
  const mouthRight = P(params.mouthWidth / 2, 85, 45);
  const mouthMid = P(0, 85 + params.smile, 60);

  stage.innerHTML = `
    <svg viewBox="0 0 500 500" role="img" aria-label="Pseudo 3D face preview">
      ${faceOutline()}

      ${path([leftBrow1, leftBrow2], `
        fill="none"
        stroke="black"
        stroke-width="4"
        stroke-linecap="round"
      `)}

      ${path([rightBrow1, rightBrow2], `
        fill="none"
        stroke="black"
        stroke-width="4"
        stroke-linecap="round"
      `)}

      ${ellipse(leftEye, params.eyeSize, params.eyeSize / 2, `
        fill="white"
        stroke="black"
        stroke-width="3"
      `)}

      ${ellipse(rightEye, params.eyeSize, params.eyeSize / 2, `
        fill="white"
        stroke="black"
        stroke-width="3"
      `)}

      ${ellipse(leftEye, params.eyeSize / 4, params.eyeSize / 4, `
        fill="black"
      `)}

      ${ellipse(rightEye, params.eyeSize / 4, params.eyeSize / 4, `
        fill="black"
      `)}

      ${path([noseBridge, noseTip, leftNostril], `
        fill="none"
        stroke="black"
        stroke-width="3"
        stroke-linecap="round"
        stroke-linejoin="round"
      `)}

      ${path([noseTip, rightNostril], `
        fill="none"
        stroke="black"
        stroke-width="3"
        stroke-linecap="round"
      `)}

      ${curvedMouth(mouthLeft, mouthMid, mouthRight)}
    </svg>
  `;
}

createControls();
render();
