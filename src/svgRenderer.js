export function renderFaceSvg(rig) {
  return `
    <svg viewBox="0 0 500 500" role="img" aria-label="2.5D anime face preview">
      ${renderHelmetLayers(rig.helmet?.back)}
      ${renderHead(rig.head)}
      ${rig.showGuides ? renderGuides(rig.head.guides) : ""}
      ${rig.features.brows.map(renderBrow).join("")}
      ${rig.features.eyes.map(renderEye).join("")}
      ${renderNose(rig.features.nose)}
      ${renderMouth(rig.features.mouth)}
      ${renderHelmetLayers(rig.helmet?.front)}
      ${renderHair(rig.hair)}
    </svg>
  `;
}

function renderHelmetLayers(layers = []) {
  return layers.map(renderHelmetLayer).join("");
}

function renderHelmetLayer(layer) {
  if (!layer.points.length || layer.opacity <= 0.01) {
    return "";
  }

  return `
    <path
      d="${renderPointPath(layer.points)} Z"
      fill="${layer.fill}"
      stroke="${layer.stroke}"
      stroke-width="3"
      stroke-linejoin="round"
      opacity="${layer.opacity}"
    />
  `;
}

function renderHead(head) {
  return `
    <path
      d="${renderPointPath(head.outline)} Z"
      fill="#fff"
      stroke="black"
      stroke-width="4"
      stroke-linejoin="round"
    />
  `;
}

function renderGuides(guides) {
  return `
    ${renderGuidePath(guides.skull)}
    ${renderGuidePath(guides.lowerFace)}
  `;
}

function renderGuidePath(points) {
  return `
    <path
      d="${renderPointPath(points)} Z"
      fill="none"
      stroke="#8a8a8a"
      stroke-width="2"
      stroke-dasharray="7 5"
      stroke-linejoin="round"
    />
  `;
}

function renderPointPath(points) {
  return points
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
}

function renderHair(hair) {
  if (!hair) {
    return "";
  }

  return `
    ${hair.strands?.map(renderHairStrand).join("") ?? ""}
    ${renderHairGuides(hair.guides)}
  `;
}

function renderHairStrand(strand) {
  return `
    <path
      d="M ${strand.baseLeft.x} ${strand.baseLeft.y} C ${strand.controlLeft.x} ${strand.controlLeft.y} ${strand.controlLeft.x} ${strand.controlLeft.y} ${strand.tip.x} ${strand.tip.y} C ${strand.controlRight.x} ${strand.controlRight.y} ${strand.controlRight.x} ${strand.controlRight.y} ${strand.baseRight.x} ${strand.baseRight.y} Z"
      fill="${strand.fill}"
      stroke="${strand.stroke}"
      stroke-width="1"
      stroke-linejoin="round"
      opacity="${strand.opacity}"
    />
  `;
}

function renderHairGuides(guides = []) {
  if (!guides.length) {
    return "";
  }

  return guides.map(guide => `
      <path
        d="${renderPointPath(guide)}"
        fill="none"
        stroke="#2f6f73"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-dasharray="5 5"
      />
    `).join("");
}

function renderBrow(brow) {
  if (!brow.visible) {
    return "";
  }

  return `
    <path
      d="M ${brow.start.x} ${brow.start.y} L ${brow.end.x} ${brow.end.y}"
      fill="none"
      stroke="black"
      stroke-width="4"
      stroke-linecap="round"
    />
  `;
}

function renderEye(eye, index) {
  if (!eye.visible) {
    return "";
  }

  const path = renderEyePath(eye);
  const clipId = `eye-clip-${index}`;

  return `
    <defs>
      <clipPath id="${clipId}">
        <path d="${path}" />
      </clipPath>
    </defs>
    <path
      d="${path}"
      fill="white"
      stroke="black"
      stroke-width="3"
      stroke-linejoin="round"
    />
    <g clip-path="url(#${clipId})">
      <ellipse
        cx="${eye.center.x}"
        cy="${eye.center.y}"
        rx="${eye.irisRadius * eye.center.scale}"
        ry="${eye.irisRadius * eye.center.scale}"
        fill="#8a8f8f"
        stroke="black"
        stroke-width="1.5"
      />
      <ellipse
        cx="${eye.center.x}"
        cy="${eye.center.y}"
        rx="${eye.pupilRadius * eye.center.scale}"
        ry="${eye.pupilRadius * eye.center.scale}"
        fill="black"
      />
    </g>
  `;
}

function renderEyePath(eye) {
  const rx = eye.rx * eye.center.scale;
  const upperOpen = eye.upperOpen * eye.center.scale;
  const lowerOpen = eye.lowerOpen * eye.center.scale;
  const leftX = eye.center.x - rx;
  const rightX = eye.center.x + rx;
  const centerY = eye.center.y;

  return [
    `M ${leftX} ${centerY}`,
    `Q ${eye.center.x} ${centerY - upperOpen} ${rightX} ${centerY}`,
    `Q ${eye.center.x} ${centerY + lowerOpen} ${leftX} ${centerY}`,
    "Z"
  ].join(" ");
}

function renderNose(nose) {
  return `
    <path
      d="M ${nose.bridge.x} ${nose.bridge.y} L ${nose.tip.x} ${nose.tip.y} L ${nose.leftNostril.x} ${nose.leftNostril.y}"
      fill="none"
      stroke="black"
      stroke-width="3"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      d="M ${nose.tip.x} ${nose.tip.y} L ${nose.rightNostril.x} ${nose.rightNostril.y}"
      fill="none"
      stroke="black"
      stroke-width="3"
      stroke-linecap="round"
    />
  `;
}

function renderMouth(mouth) {
  return `
    <path
      d="M ${mouth.left.x} ${mouth.left.y} Q ${mouth.mid.x} ${mouth.mid.y} ${mouth.right.x} ${mouth.right.y}"
      fill="none"
      stroke="black"
      stroke-width="3"
      stroke-linecap="round"
    />
  `;
}
