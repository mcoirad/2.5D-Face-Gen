import { addPoints, OUTLINE_UPPER_ARC_POINT_COUNT, scalePoint, subtractPoints } from "./rig.js";

export function renderFaceSvg(rig) {
  const headPathD = getHeadOutlinePathD(rig.head, rig.faceRoundness);

  return `
    <svg viewBox="0 0 500 500" role="img" aria-label="2.5D anime face preview">
      ${rig.removeStrokes ? renderRemoveStrokesStyle() : ""}
      ${renderBody(rig.body)}
      ${renderHelmetLayers(rig.helmet?.back)}
      ${renderHair(rig.hair, "back")}
      ${renderHairV2(rig.hairV2, "back")}
      ${renderHead(headPathD)}
      ${rig.showGuides ? renderGuides(rig.head.guides) : ""}
      ${renderNose(rig.features.nose)}
      ${renderMouth(rig.features.mouth, headPathD, rig.clipMouthToFace)}
      ${renderHair(rig.hair, "front")}
      ${renderHairV2(rig.hairV2, "front")}
      ${renderHelmetLayers(rig.helmet?.front)}
      ${rig.features.brows.map(renderBrow).join("")}
      ${rig.features.eyes.map(renderEye).join("")}
    </svg>
  `;
}

function renderRemoveStrokesStyle() {
  return `
    <style>
      * {
        stroke: none !important;
      }
    </style>
  `;
}

function renderBody(body) {
  if (!body || !body.neck) {
    return "";
  }

  return `
    ${renderBodyShape(body.neck)}
    ${renderBodyShape(body.torso)}
    ${body.shoulders.map(renderShoulderGuide).join("")}
    ${body.connectors.map(renderConnector).join("")}
  `;
}

function renderBodyShape(shape) {
  return `
    <path
      d="${renderPointPath(shape.points)} Z"
      fill="${shape.fill}"
      stroke="${shape.stroke}"
      stroke-width="4"
      stroke-linejoin="round"
    />
  `;
}

function renderShoulderGuide(shoulder) {
  return `
    <circle
      cx="${shoulder.cx}"
      cy="${shoulder.cy}"
      r="${shoulder.r}"
      fill="none"
      stroke="#8a8a8a"
      stroke-width="2"
      stroke-dasharray="7 5"
    />
  `;
}

function renderConnector([from, to]) {
  return `
    <path
      d="M ${from.x} ${from.y} L ${to.x} ${to.y}"
      fill="none"
      stroke="#8a8a8a"
      stroke-width="2"
      stroke-dasharray="7 5"
    />
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

function getHeadOutlinePathD(head, jawBend) {
  return jawBend > 0
    ? renderJawBendPath(head.outline, jawBend)
    : `${renderPointPath(head.outline)} Z`;
}

function renderHead(headPathD) {
  return `
    <path
      d="${headPathD}"
      fill="#f6f1e8"
      stroke="black"
      stroke-width="4"
      stroke-linejoin="round"
    />
  `;
}

// Bulges just the two segments on each side where the skull arc meets the
// jaw (arc-end -> jaw1, jaw1 -> jaw2, and the mirrored pair at the other
// end of the point list) outward by jawBend px, via a quadratic control
// point pushed away from the outline's centroid. Every other segment stays
// a straight line - deliberately not a whole-outline smoothing pass, since
// that produced artifacts elsewhere on the outline.
function renderJawBendPath(points, jawBend) {
  const n = points.length;
  const arcEndIndex = OUTLINE_UPPER_ARC_POINT_COUNT - 1;
  const jaw1Index = OUTLINE_UPPER_ARC_POINT_COUNT;
  const jaw2Index = OUTLINE_UPPER_ARC_POINT_COUNT + 1;
  const jawLastIndex = n - 1;
  const jawSecondLastIndex = n - 2;
  const bentEdges = new Set([
    `${arcEndIndex}-${jaw1Index}`,
    `${jaw1Index}-${jaw2Index}`,
    `${jawSecondLastIndex}-${jawLastIndex}`,
    `${jawLastIndex}-0`
  ]);
  const centroid = scalePoint(
    points.reduce((sum, point) => addPoints(sum, point), { x: 0, y: 0 }),
    1 / n
  );

  let d = `M ${points[0].x} ${points[0].y}`;

  for (let i = 0; i < n; i += 1) {
    const from = points[i];
    const to = points[(i + 1) % n];

    if (!bentEdges.has(`${i}-${(i + 1) % n}`)) {
      d += ` L ${to.x} ${to.y}`;
      continue;
    }

    const mid = scalePoint(addPoints(from, to), 0.5);
    const edge = subtractPoints(to, from);
    const edgeLength = Math.hypot(edge.x, edge.y) || 1;
    let perpendicular = { x: -edge.y / edgeLength, y: edge.x / edgeLength };
    const towardMid = subtractPoints(mid, centroid);

    if (perpendicular.x * towardMid.x + perpendicular.y * towardMid.y < 0) {
      perpendicular = scalePoint(perpendicular, -1);
    }

    const control = addPoints(mid, scalePoint(perpendicular, jawBend));

    d += ` Q ${control.x} ${control.y} ${to.x} ${to.y}`;
  }

  return d;
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

  const scalpBase = (hairV2.scalpBase ?? [])
    .filter(item => matchesHairLayer(item, layer))
    .map(renderHeadbandBelt)
    .join("");
  const locks = hairV2.locks
    .filter(item => matchesHairLayer(item, layer))
    .map(renderHairLock)
    .join("");
  const headband = (hairV2.headbandBelt ?? [])
    .filter(item => matchesHairLayer(item, layer))
    .map(renderHeadbandBelt)
    .join("");
  const partGuide = layer === "front" && hairV2.showPartGuide
    ? renderHairV2PartGuide(hairV2.partGuide)
    : "";

  return `
    ${scalpBase}
    ${locks}
    ${headband}
    ${partGuide}
  `;
}

function renderHeadbandBelt(strip) {
  if (!strip.points?.length) {
    return "";
  }

  return `
    <path
      d="${renderPointPath(strip.points)} Z"
      fill="${strip.fill}"
      stroke="${strip.stroke}"
      stroke-width="2.5"
      stroke-linejoin="round"
      opacity="0.95"
    />
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
  // Locks that carry a rootControl (v2's back-bulge) close with a curve instead
  // of the flat line "Z" would draw, rounding the base instead of leaving it as
  // a straight-cut triangle. Locks without one (v1) render exactly as before.
  const rootClose = lock.rootControl
    ? `Q ${lock.rootControl.x} ${lock.rootControl.y} ${lock.rootLeft.x} ${lock.rootLeft.y} Z`
    : "Z";

  if (lock.spineLeft) {
    const leftPath = lock.spineLeft
      .map(seg => `C ${seg.c1.x} ${seg.c1.y} ${seg.c2.x} ${seg.c2.y} ${seg.to.x} ${seg.to.y}`)
      .join(" ");
    const rightPath = lock.spineRight
      .map(seg => `C ${seg.c1.x} ${seg.c1.y} ${seg.c2.x} ${seg.c2.y} ${seg.to.x} ${seg.to.y}`)
      .join(" ");

    return [
      `M ${lock.rootLeft.x} ${lock.rootLeft.y}`,
      leftPath,
      rightPath,
      rootClose
    ].join(" ");
  }

  if (lock.notch) {
    return [
      `M ${lock.rootLeft.x} ${lock.rootLeft.y}`,
      `C ${lock.controlLeft1.x} ${lock.controlLeft1.y} ${lock.controlLeft2.x} ${lock.controlLeft2.y} ${lock.tipLeft.x} ${lock.tipLeft.y}`,
      `L ${lock.notch.x} ${lock.notch.y}`,
      `L ${lock.tipRight.x} ${lock.tipRight.y}`,
      `C ${lock.controlRight2.x} ${lock.controlRight2.y} ${lock.controlRight1.x} ${lock.controlRight1.y} ${lock.rootRight.x} ${lock.rootRight.y}`,
      rootClose
    ].join(" ");
  }

  return [
    `M ${lock.rootLeft.x} ${lock.rootLeft.y}`,
    `C ${lock.controlLeft1.x} ${lock.controlLeft1.y} ${lock.controlLeft2.x} ${lock.controlLeft2.y} ${lock.tip.x} ${lock.tip.y}`,
    `C ${lock.controlRight2.x} ${lock.controlRight2.y} ${lock.controlRight1.x} ${lock.controlRight1.y} ${lock.rootRight.x} ${lock.rootRight.y}`,
    rootClose
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
  const irisClipId = `iris-clip-${index}`;
  const gradId = `iris-grad-${index}`;
  const { iris, pupil, shine } = eye;
  const irisFill = eye.irisGradient ? `url(#${gradId})` : eye.irisColor;

  return `
    <defs>
      <clipPath id="${clipId}">
        <path d="${path}" />
      </clipPath>
      <clipPath id="${irisClipId}">
        <circle cx="${iris.cx}" cy="${iris.cy}" r="${iris.r}" />
      </clipPath>
      ${eye.irisGradient ? `
      <radialGradient id="${gradId}" cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" stop-color="${lightenHex(eye.irisColor, 0.5)}" />
        <stop offset="1" stop-color="${eye.irisColor}" />
      </radialGradient>` : ""}
    </defs>
    ${renderEyeCornerMakeup(eye.cornerMakeup)}
    <path
      d="${path}"
      fill="white"
      stroke="none"
    />
    <g clip-path="url(#${clipId})">
      <circle cx="${iris.cx}" cy="${iris.cy}" r="${iris.r}" fill="${irisFill}" stroke="black" stroke-width="1.5" />
      <circle cx="${pupil.cx}" cy="${pupil.cy}" r="${pupil.r}" fill="black" />
      ${shine ? `<g clip-path="url(#${irisClipId})"><circle cx="${shine.cx}" cy="${shine.cy}" r="${shine.r}" fill="white" /></g>` : ""}
    </g>
    ${renderEyeLidStrokes(eye)}
    ${renderEyeLashes(eye)}
  `;
}

function renderEyePath(eye) {
  const { topInner, topOuter, bottomOuter, bottomInner, topControl, bottomControl } = eye.quad;

  return [
    `M ${topInner.x} ${topInner.y}`,
    `Q ${topControl.x} ${topControl.y} ${topOuter.x} ${topOuter.y}`,
    `L ${bottomOuter.x} ${bottomOuter.y}`,
    `Q ${bottomControl.x} ${bottomControl.y} ${bottomInner.x} ${bottomInner.y}`,
    "Z"
  ].join(" ");
}

function renderEyeLidStrokes(eye) {
  const { topInner, topOuter, bottomOuter, bottomInner, topControl, bottomControl } = eye.quad;
  const w = eye.lidWidths ?? { upper: 3, outer: 3, lower: 3, inner: 3 };
  const edges = [
    { width: w.upper, d: `M ${topInner.x} ${topInner.y} Q ${topControl.x} ${topControl.y} ${topOuter.x} ${topOuter.y}` },
    { width: w.outer, d: `M ${topOuter.x} ${topOuter.y} L ${bottomOuter.x} ${bottomOuter.y}` },
    { width: w.lower, d: `M ${bottomOuter.x} ${bottomOuter.y} Q ${bottomControl.x} ${bottomControl.y} ${bottomInner.x} ${bottomInner.y}` },
    { width: w.inner, d: `M ${bottomInner.x} ${bottomInner.y} L ${topInner.x} ${topInner.y}` }
  ];

  return edges
    .filter(edge => edge.width > 0)
    .map(edge => `
      <path
        d="${edge.d}"
        fill="none"
        stroke="black"
        stroke-width="${edge.width}"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    `)
    .join("");
}

function renderEyeLashes(eye) {
  const segments = [...(eye.lashes?.upper ?? []), ...(eye.lashes?.lower ?? [])];

  return segments
    .map(seg => `
      <path
        d="M ${seg.start.x} ${seg.start.y} L ${seg.end.x} ${seg.end.y}"
        fill="none"
        stroke="black"
        stroke-width="2"
        stroke-linecap="round"
      />
    `)
    .join("");
}

function renderEyeCornerMakeup(corner) {
  if (!corner) {
    return "";
  }

  return `
    <path
      d="M ${corner.baseTopLeft.x} ${corner.baseTopLeft.y} Q ${corner.ctrlTop.x} ${corner.ctrlTop.y} ${corner.tip.x} ${corner.tip.y} Q ${corner.ctrlBottom.x} ${corner.ctrlBottom.y} ${corner.baseBottomRight.x} ${corner.baseBottomRight.y} Z"
      fill="black"
      stroke="none"
    />
  `;
}

function lightenHex(value, amount) {
  const numeric = Number.parseInt(value.slice(1), 16);
  const channels = [(numeric >> 16) & 255, (numeric >> 8) & 255, numeric & 255];

  return `#${channels
    .map(channel => Math.round(channel + (255 - channel) * amount).toString(16).padStart(2, "0"))
    .join("")}`;
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

function renderMouth(mouth, headPathD, clipToFace) {
  const path = renderMouthPath(mouth.quad);
  const clipId = "mouth-clip";
  const headClipId = "head-clip";

  const body = `
    <path
      d="${path}"
      fill="${mouth.cavityColor}"
      stroke="black"
      stroke-width="3"
      stroke-linejoin="round"
    />
    <g clip-path="url(#${clipId})">
      ${mouth.upperTeeth.visible ? renderTeethRect(mouth.upperTeeth.corners) : ""}
      ${mouth.lowerTeeth.visible ? renderTeethRect(mouth.lowerTeeth.corners) : ""}
    </g>
  `;

  return `
    <defs>
      <clipPath id="${clipId}">
        <path d="${path}" />
      </clipPath>
      ${clipToFace ? `
      <clipPath id="${headClipId}">
        <path d="${headPathD}" />
      </clipPath>` : ""}
    </defs>
    ${clipToFace ? `<g clip-path="url(#${headClipId})">${body}</g>` : body}
  `;
}

function renderMouthPath(quad) {
  const { topLeft, topRight, bottomRight, bottomLeft, topControl, bottomControl } = quad;

  return [
    `M ${topLeft.x} ${topLeft.y}`,
    `Q ${topControl.x} ${topControl.y} ${topRight.x} ${topRight.y}`,
    `L ${bottomRight.x} ${bottomRight.y}`,
    `Q ${bottomControl.x} ${bottomControl.y} ${bottomLeft.x} ${bottomLeft.y}`,
    "Z"
  ].join(" ");
}

function renderTeethRect(corners) {
  return `
    <path
      d="${renderPointPath(corners)} Z"
      fill="white"
    />
  `;
}
