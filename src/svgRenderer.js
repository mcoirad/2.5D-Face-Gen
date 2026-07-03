export function renderFaceSvg(rig) {
  return `
    <svg viewBox="0 0 500 500" role="img" aria-label="2.5D anime face preview">
      ${renderHelmetLayers(rig.helmet?.back, "back")}
      ${renderHead(rig.head)}
      ${rig.showGuides ? renderGuides(rig.head.guides) : ""}
      ${rig.features.brows.map(renderBrow).join("")}
      ${rig.features.eyes.map(renderEye).join("")}
      ${renderNose(rig.features.nose)}
      ${renderMouth(rig.features.mouth)}
      ${renderHelmetLayers(rig.helmet?.front, "front")}
    </svg>
  `;
}

function renderHelmetLayers(layers = [], groupName) {
  return layers.map((layer, index) => renderHelmetLayer(layer, `${groupName}-${index}`)).join("");
}

function renderHelmetLayer(layer, layerId) {
  if (!layer.points.length || layer.opacity <= 0.01) {
    return "";
  }

  if (layer.cutouts?.length) {
    const maskId = `helmet-mask-${layerId}`;

    return `
      <g opacity="${layer.opacity}">
        <defs>
          <mask id="${maskId}" maskUnits="userSpaceOnUse">
            <rect x="0" y="0" width="500" height="500" fill="black" />
            <path d="${renderPointPath(layer.points)} Z" fill="white" />
            ${layer.cutouts.map(cutout => `
              <path d="${renderPointPath(cutout)} Z" fill="black" />
            `).join("")}
          </mask>
        </defs>
        <path
          d="${renderPointPath(layer.points)} Z"
          fill="${layer.fill}"
          stroke="none"
          mask="url(#${maskId})"
        />
        <path
          d="${renderPointPath(layer.points)} Z"
          fill="none"
          stroke="${layer.stroke}"
          stroke-width="3"
          stroke-linejoin="round"
        />
        ${layer.cutouts.map(cutout => renderHelmetOpeningStroke(cutout, layer.stroke)).join("")}
      </g>
    `;
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

function renderHelmetOpeningStroke(hole, stroke) {
  return `
    <path
      d="M ${hole[5].x} ${hole[5].y} L ${hole[0].x} ${hole[0].y} L ${hole[1].x} ${hole[1].y} L ${hole[2].x} ${hole[2].y} L ${hole[3].x} ${hole[3].y} L ${hole[4].x} ${hole[4].y}"
      fill="none"
      stroke="${stroke}"
      stroke-width="3"
      stroke-linecap="round"
      stroke-linejoin="round"
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
