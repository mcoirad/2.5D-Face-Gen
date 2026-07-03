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

function renderEye(eye) {
  if (!eye.visible) {
    return "";
  }

  return `
    <ellipse
      cx="${eye.center.x}"
      cy="${eye.center.y}"
      rx="${eye.rx * eye.center.scale}"
      ry="${eye.ry * eye.center.scale}"
      fill="white"
      stroke="black"
      stroke-width="3"
    />
    <ellipse
      cx="${eye.center.x}"
      cy="${eye.center.y}"
      rx="${eye.pupilRadius * eye.center.scale}"
      ry="${eye.pupilRadius * eye.center.scale}"
      fill="black"
    />
  `;
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
