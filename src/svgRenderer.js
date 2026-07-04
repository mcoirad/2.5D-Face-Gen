export function renderFaceSvg(rig) {
  return `
    <svg viewBox="0 0 500 500" role="img" aria-label="2.5D anime face preview">
      ${renderHelmetLayers(rig.helmet?.back)}
      ${renderHair(rig.hair, "back")}
      ${renderHairV2(rig.hairV2, "back")}
      ${renderHead(rig.head)}
      ${rig.showGuides ? renderGuides(rig.head.guides) : ""}
      ${rig.features.brows.map(renderBrow).join("")}
      ${rig.features.eyes.map(renderEye).join("")}
      ${renderNose(rig.features.nose)}
      ${renderMouth(rig.features.mouth)}
      ${renderHelmetLayers(rig.helmet?.front)}
      ${renderHair(rig.hair, "front")}
      ${renderHairV2(rig.hairV2, "front")}
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

function renderHair(hair, layer) {
  if (!hair) {
    return "";
  }

  const mode = hair.renderMode ?? "strands";
  const locks = mode === "strands"
    ? ""
    : hair.locks?.filter(item => matchesHairLayer(item, layer)).map(renderHairLock).join("") ?? "";
  const strands = mode === "locks"
    ? ""
    : hair.strands?.filter(item => matchesHairLayer(item, layer)).map(renderHairStrand).join("") ?? "";
  const guides = layer === "front" ? renderHairGuides(hair.guides) : "";
  const anchors = layer === "front" && hair.guides?.length ? renderHairAnchors(hair.anchors) : "";

  return `
    ${locks}
    ${strands}
    ${guides}
    ${anchors}
  `;
}

function renderHairV2(hairV2, layer) {
  if (!hairV2) {
    return "";
  }

  const locks = hairV2.locks
    .filter(item => matchesHairLayer(item, layer))
    .map(renderHairLock)
    .join("");
  const partGuide = layer === "front" && hairV2.showPartGuide
    ? renderHairV2PartGuide(hairV2.partGuide)
    : "";

  return `
    ${locks}
    ${partGuide}
  `;
}

function renderHairV2PartGuide(points) {
  if (!points?.length || !points.frontFacing) {
    return "";
  }

  return `
    <path
      d="${renderPointPath(points)}"
      fill="none"
      stroke="#c2456b"
      stroke-width="2.5"
      stroke-linecap="round"
      stroke-dasharray="6 4"
      opacity="0.85"
    />
  `;
}

function matchesHairLayer(item, layer) {
  return layer === "back"
    ? item.layer === "back"
    : item.layer !== "back";
}

function renderHairLock(lock) {
  return `
    <path
      d="${renderHairLockPath(lock)}"
      fill="${lock.fill}"
      stroke="${lock.stroke}"
      stroke-width="2"
      stroke-linejoin="round"
      opacity="${lock.opacity}"
    />
    ${lock.detailLines?.map(renderHairLockDetailLine).join("") ?? ""}
  `;
}

function renderHairLockPath(lock) {
  if (lock.notch) {
    return [
      `M ${lock.rootLeft.x} ${lock.rootLeft.y}`,
      `C ${lock.controlLeft1.x} ${lock.controlLeft1.y} ${lock.controlLeft2.x} ${lock.controlLeft2.y} ${lock.tipLeft.x} ${lock.tipLeft.y}`,
      `L ${lock.notch.x} ${lock.notch.y}`,
      `L ${lock.tipRight.x} ${lock.tipRight.y}`,
      `C ${lock.controlRight2.x} ${lock.controlRight2.y} ${lock.controlRight1.x} ${lock.controlRight1.y} ${lock.rootRight.x} ${lock.rootRight.y}`,
      "Z"
    ].join(" ");
  }

  return [
    `M ${lock.rootLeft.x} ${lock.rootLeft.y}`,
    `C ${lock.controlLeft1.x} ${lock.controlLeft1.y} ${lock.controlLeft2.x} ${lock.controlLeft2.y} ${lock.tip.x} ${lock.tip.y}`,
    `C ${lock.controlRight2.x} ${lock.controlRight2.y} ${lock.controlRight1.x} ${lock.controlRight1.y} ${lock.rootRight.x} ${lock.rootRight.y}`,
    "Z"
  ].join(" ");
}

function renderHairLockDetailLine(line) {
  return `
    <path
      d="M ${line.start.x} ${line.start.y} Q ${line.control.x} ${line.control.y} ${line.end.x} ${line.end.y}"
      fill="none"
      stroke="${line.stroke}"
      stroke-width="1.25"
      stroke-linecap="round"
      opacity="0.55"
    />
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

  return guides
    .filter(guide => (guide.angularVisibility ?? 1) > 0.001)
    .map(guide => `
      <path
        d="${renderPointPath(guide)}"
        fill="none"
        stroke="#2f6f73"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        stroke-dasharray="5 5"
        opacity="${0.25 + (guide.angularVisibility ?? 1) * 0.75}"
      />
    `).join("");
}

function renderHairAnchors(anchors = []) {
  return anchors.filter(anchor => anchor.coverage > 0.001).map(anchor => `
    <circle
      cx="${anchor.point.x}"
      cy="${anchor.point.y}"
      r="1.75"
      fill="#2f6f73"
      opacity="${0.18 + anchor.coverage * 0.42}"
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
