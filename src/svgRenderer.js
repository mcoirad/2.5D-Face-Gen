import { addPoints, OUTLINE_UPPER_ARC_POINT_COUNT, scalePoint, subtractPoints } from "./rig.js";

export function renderFaceSvg(rig) {
  const headPathD = getHeadOutlinePathD(rig.head, rig.faceRoundness);

  return `
    <svg viewBox="0 0 500 500" role="img" aria-label="2.5D anime face preview">
      ${rig.removeStrokes ? renderRemoveStrokesStyle() : ""}
      ${renderCloak(rig.cloak, "back")}
      ${renderAppendageLayer(rig.body?.arms, "back", "arm")}
      ${renderAppendageLayer(rig.body?.clothing?.sleeves, "back", "clothing-sleeve")}
      ${renderArmor(rig.armor, true)}
      ${renderBodyBase(rig.body)}
      ${renderGarmentLayer(rig.body?.clothing, "clothing")}
      ${renderAppendageLayer(rig.body?.arms, "front", "arm")}
      ${renderAppendageLayer(rig.body?.clothing?.sleeves, "front", "clothing-sleeve")}
      ${renderGarmentLayer(rig.armor?.breastplate, "breastplate")}
      ${renderArmor(rig.armor, false)}
      ${renderCloak(rig.cloak, "front")}
      ${renderBodyGuides(rig.body, rig.showGuides)}
      ${renderFerronniere(rig.ferronniere, "back")}
      ${renderHelmetLayers(rig.helmet?.back)}
      ${renderEars(rig.ears, "back")}
      ${renderDoublePonytailExtensions(rig.doublePonytail, "back")}
      ${renderPonytailExtension(rig.ponytail, "back")}
      ${renderHair(rig.hair, "back")}
      ${renderHairV2ScalpBase(rig.hairV2, "back")}
      ${renderHeadband(rig.headband, "back")}
      ${renderHairV2(rig.hairV2, "back")}
      ${renderDoublePonytailTies(rig.doublePonytail, "back")}
      ${renderPonytailTie(rig.ponytail, "back")}
      ${renderSideTiedLocks(rig.sideTiedLocks, "back")}
      ${renderFacialHair(rig.facialHair, "back")}
      ${renderHead(headPathD, rig.skinColor)}
      ${renderEyeShading(rig.features.eyeShading, headPathD)}
      ${renderFaceScar(rig.features.faceScar, headPathD)}
      ${renderEyeScars(rig.features.eyes, headPathD)}
      ${renderFerronniere(rig.ferronniere, "front")}
      ${renderEars(rig.ears, "front")}
      ${rig.showGuides ? renderGuides(rig.head.guides) : ""}
      ${renderNose(rig.features.nose, rig.pose.amount)}
      ${renderMouth(rig.features.mouth, headPathD, rig.clipMouthToFace)}
      ${renderFacialHair(rig.facialHair, "front")}
      ${renderHair(rig.hair, "front")}
      ${renderHairV2ScalpBase(rig.hairV2, "front")}
      ${renderHeadband(rig.headband, "front")}
      ${renderHairV2(rig.hairV2, "front")}
      ${renderDoublePonytailExtensions(rig.doublePonytail, "front")}
      ${renderDoublePonytailTies(rig.doublePonytail, "front")}
      ${renderHelmetLayers(rig.helmet?.front)}
      ${renderSideTiedLocks(rig.sideTiedLocks, "front")}
      ${rig.features.eyes.map(renderEye).join("")}
      ${rig.features.brows.map(renderBrow).join("")}
    </svg>
  `;
}

function renderRemoveStrokesStyle() {
  return `
    <style>
      *:not(.preserve-material-stroke) {
        stroke: none !important;
      }
    </style>
  `;
}

function renderAppendageLayer(shapes, layer, className) {
  const behindTorso = layer === "back";
  const selected = (shapes ?? []).filter(shape => shape.behindTorso === behindTorso);

  if (!selected.length) {
    return "";
  }

  return `
    <g class="${className}-${layer}-layer">
      ${selected.map(shape => `
        <path
          class="${className}-fill ${className}-${shape.side}"
          d="${renderPointPath(shape.points)} Z"
          fill="${shape.fill}"
          stroke="none"
        />
        ${renderOutlineFragments(
          shape.outlineFragments,
          `${className}-outline ${className}-${shape.side}-outline`,
          shape.stroke,
          4
        )}
      `).join("")}
    </g>
  `;
}

function renderOutlineFragments(fragments, className, stroke, strokeWidth) {
  return (fragments ?? []).filter(fragment => fragment.points.length >= 2).map(fragment => `
    <path
      class="${className}"
      d="${renderPointPath(fragment.points)}${fragment.closed ? " Z" : ""}"
      fill="none"
      stroke="${stroke}"
      stroke-width="${strokeWidth}"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  `).join("");
}

function renderBodyBase(body) {
  if (!body || !body.torsoOutline) {
    return "";
  }

  return `
    ${body.ribCageShape ? renderBodyShape(body.ribCageShape) : ""}
    ${renderBodyShape(body.torsoOutline)}
    ${body.clavicleLines?.map(renderClavicleLine).join("") ?? ""}
  `;
}

function renderBodyGuides(body, showGuides) {
  if (!body || !body.torsoOutline) {
    return "";
  }

  return `
    ${body.shoulders.map(renderShoulderGuide).join("")}
    ${showGuides && body.ribCageGuide ? renderGuidePath(body.ribCageGuide) : ""}
    ${showGuides ? renderBodyLandmarks(body.landmarks) : ""}
  `;
}

function renderGarmentLayer(garment, className) {
  if (!garment?.shapes?.length) {
    return "";
  }

  const maskId = `${className}-cutout-mask`;
  const clipId = `${className}-shell-clip`;
  const cutouts = garment.cutouts?.filter(points => points.length >= 3)
    ?? (garment.cutout?.length >= 3 ? [garment.cutout] : []);
  const hasCutout = cutouts.length > 0;
  const cutoutPaths = cutouts.map(points => (
    `<path d="${renderPointPath(points)} Z" />`
  )).join("");
  const clipPaths = garment.shapes.map(shape => (
    `<path d="${renderPointPath(shape.points)} Z" />`
  )).join("");
  const mask = hasCutout
    ? `
      <defs>
        <mask id="${maskId}" maskUnits="userSpaceOnUse" x="-1000" y="-1000" width="2500" height="2500">
          <rect x="-1000" y="-1000" width="2500" height="2500" fill="white" />
          <g fill="black">${cutoutPaths}</g>
        </mask>
        <clipPath id="${clipId}">${clipPaths}</clipPath>
      </defs>
    `
    : "";
  const maskAttribute = hasCutout ? ` mask="url(#${maskId})"` : "";
  const shapes = garment.shapes.map(shape => shape.outlineFragments ? `
    <path
      class="${className}-shell ${shape.id}"
      d="${renderPointPath(shape.points)} Z"
      fill="${shape.fill}"
      stroke="none"
    />
    ${renderOutlineFragments(
      shape.outlineFragments,
      `${className}-shell-outline ${shape.id}-outline`,
      shape.stroke,
      4
    )}
  ` : `
    <path
      class="${className}-shell ${shape.id}"
      d="${renderPointPath(shape.points)} Z"
      fill="${shape.fill}"
      stroke="${shape.stroke}"
      stroke-width="4"
      stroke-linejoin="round"
    />
  `).join("");
  const gildedEdge = hasCutout && garment.gildedEdge
    ? `
      <g
        class="${className}-gilded-edge-layer"
        mask="url(#${maskId})"
        clip-path="url(#${clipId})"
      >
        ${cutouts.map(points => `
          <path
            class="${className}-gilded-edge preserve-material-stroke"
            d="${renderPointPath(points)} Z"
            fill="none"
            stroke="${garment.gildedEdge.color}"
            stroke-width="${garment.gildedEdge.width * 2}"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        `).join("")}
      </g>
    `
    : "";
  const neckline = hasCutout && !garment.gildedEdge
    ? `
      <g clip-path="url(#${clipId})">
        ${cutouts.map(points => `
          <path
            class="${className}-neckline"
            d="${renderPointPath(points)} Z"
            fill="none"
            stroke="black"
            stroke-width="4"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        `).join("")}
      </g>
    `
    : "";
  return `
    ${mask}
    <g class="${className}-layer"${maskAttribute}>
      ${shapes}
    </g>
    ${gildedEdge || neckline}
  `;
}

function renderCloak(cloak, layer) {
  if (!cloak) {
    return "";
  }

  const sections = [...(cloak[layer] ?? [])].sort(compareCloakSections);
  if (!sections.length) {
    return "";
  }

  const outlines = [...(cloak.outlines?.[layer] ?? [])]
    .sort(compareCloakSections)
    .map(outline => `
    <path
      class="cloak-envelope-outline cloak-${outline.kind} ${outline.id}"
      d="${renderPointPath(outline.points)}"
      fill="none"
      stroke="${outline.stroke}"
      stroke-width="${outline.width}"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  `).join("");
  const fills = sections.map(section => `
    <g class="cloak-section ${section.id}">
      <path
        class="cloak-envelope-fill ${section.envelope.id}"
        d="${renderPointPath(section.envelope.points)} Z"
        fill="${section.envelope.fill}"
        stroke="none"
      />
      ${section.silhouettePatches.map(patch => patch.base ? `
        <path
          class="cloak-silhouette-fill"
          d="${renderPointPath(patch.base.points)} Z"
          fill="${patch.base.fill}"
          stroke="none"
        />
      ` : "").join("")}
      ${section.crest ? `
        <path
          class="cloak-crest"
          d="${renderPointPath(section.crest.points)} Z"
          fill="${section.crest.fill}"
          stroke="none"
        />
      ` : ""}
      ${section.silhouettePatches.flatMap(patch => patch.crests).map(crest => `
        <path
          class="cloak-silhouette-crest"
          d="${renderPointPath(crest.points)} Z"
          fill="${crest.fill}"
          stroke="none"
        />
      `).join("")}
      ${section.underside ? `
        <path
          class="cloak-underside"
          d="${renderPointPath(section.underside.points)} Z"
          fill="${section.underside.fill}"
          stroke="none"
        />
      ` : ""}
      ${section.silhouettePatches.flatMap(patch => patch.undersides).map(underside => `
        <path
          class="cloak-silhouette-underside"
          d="${renderPointPath(underside.points)} Z"
          fill="${underside.fill}"
          stroke="none"
        />
      `).join("")}
    </g>
  `).join("");
  const creases = [...(cloak.creases?.[layer] ?? [])]
    .sort(compareCloakSections)
    .map(crease => `
      <path
        class="cloak-crease"
        data-cloak-id="${crease.id}"
        d="${renderPointPath(crease.points)}"
        fill="none"
        stroke="${crease.stroke}"
        stroke-width="${crease.width}"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    `).join("");

  return `
    <g class="cloak-${layer}-layer">
      ${outlines}
      ${fills}
      ${creases}
    </g>
  `;
}

function compareCloakSections(first, second) {
  if (first.topFlap !== second.topFlap) {
    return first.topFlap ? 1 : -1;
  }
  if (first.frontFlap !== second.frontFlap) {
    return first.frontFlap ? 1 : -1;
  }
  const depthDifference = first.depth - second.depth;
  if (Math.abs(depthDifference) > 1e-6) {
    return depthDifference;
  }
  if (first.bandIndex !== second.bandIndex) {
    return second.bandIndex - first.bandIndex;
  }
  return first.id.localeCompare(second.id);
}

function renderClavicleLine(line) {
  return `
    <path
      class="clavicle-${line.side}"
      d="M ${line.start.x} ${line.start.y} Q ${line.control.x} ${line.control.y} ${line.end.x} ${line.end.y}"
      fill="none"
      stroke="black"
      stroke-width="3"
      stroke-linecap="round"
    />
  `;
}

// Split into two passes (called once with behind=true before renderBody,
// once with behind=false after) so a pauldron whose shoulder has rotated
// behind the torso draws under it instead of floating on top.
function renderArmor(armor, behind) {
  if (!armor) {
    return "";
  }

  return [armor.pauldronLeft, armor.pauldronRight]
    .filter(pauldron => pauldron && !!pauldron.behindTorso === behind)
    .map(renderCurvedShape)
    .join("");
}

// Same shape as renderBodyShape, but every edge bulges by shape.curve px via
// a quadratic control point pushed away from the shape's own centroid (the
// technique renderJawBendPath below uses for just two jaw segments) - curve
// 0 falls back to plain straight-line segments.
function renderCurvedShape(shape) {
  return `
    <path
      d="${renderCurvedPointPath(shape.points, shape.curve ?? 0)} Z"
      fill="${shape.fill}"
      stroke="${shape.stroke}"
      stroke-width="4"
      stroke-linejoin="round"
    />
  `;
}

function renderCurvedPointPath(points, curveAmount) {
  if (curveAmount === 0) {
    return renderPointPath(points);
  }

  const n = points.length;
  const centroid = scalePoint(
    points.reduce((sum, point) => addPoints(sum, point), { x: 0, y: 0 }),
    1 / n
  );

  let d = `M ${points[0].x} ${points[0].y}`;

  for (let i = 0; i < n; i += 1) {
    const from = points[i];
    const to = points[(i + 1) % n];
    const mid = scalePoint(addPoints(from, to), 0.5);
    const edge = subtractPoints(to, from);
    const edgeLength = Math.hypot(edge.x, edge.y) || 1;
    let perpendicular = { x: -edge.y / edgeLength, y: edge.x / edgeLength };
    const towardMid = subtractPoints(mid, centroid);

    if (perpendicular.x * towardMid.x + perpendicular.y * towardMid.y < 0) {
      perpendicular = scalePoint(perpendicular, -1);
    }

    const control = addPoints(mid, scalePoint(perpendicular, curveAmount));

    d += ` Q ${control.x} ${control.y} ${to.x} ${to.y}`;
  }

  return d;
}

function renderBodyLandmarks(landmarks) {
  if (!landmarks) {
    return "";
  }

  const points = [
    landmarks.clavicleLeft,
    landmarks.clavicleRight,
    landmarks.clavicleMedialLeft,
    landmarks.clavicleMedialRight,
    landmarks.axillaLeft,
    landmarks.axillaRight,
    landmarks.costalLeft,
    landmarks.costalRight,
    landmarks.sternalNotch,
    landmarks.xiphoid,
    landmarks.pecsLeft,
    landmarks.pecsRight
  ].filter(Boolean);

  return points.map(point => `
    <circle
      cx="${point.x}"
      cy="${point.y}"
      r="4"
      fill="#a1466b"
      opacity="0.85"
    />
  `).join("");
}

function renderBodyShape(shape) {
  if (shape.outlineFragments) {
    return `
      <path
        class="body-shape-fill"
        d="${renderPointPath(shape.points)} Z"
        fill="${shape.fill}"
        stroke="none"
      />
      ${renderOutlineFragments(shape.outlineFragments, "body-shape-outline", shape.stroke, 4)}
    `;
  }

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

function renderHead(headPathD, skinColor = "#f6f1e8") {
  return `
    <path
      class="head-shape"
      d="${headPathD}"
      fill="${skinColor}"
      stroke="black"
      stroke-width="4"
      stroke-linejoin="round"
    />
  `;
}

function renderEars(ears, layer) {
  if (!ears) {
    return "";
  }

  return [ears.left, ears.right]
    .filter(ear => ear.layer === layer)
    .map(renderEar)
    .join("");
}

// Two curved edges (apex -> top attach, apex -> bottom attach) plus a straight,
// unstroked attach edge closing the fill. The stroke path covers only the two
// curved edges so the face-attached edge stays strokeless.
function renderEar(ear) {
  const { topAttach, bottomAttach, attachControl, apex, curve, fill } = ear;
  const centroid = scalePoint(addPoints(addPoints(topAttach, bottomAttach), apex), 1 / 3);
  const cTop = earEdgeControl(topAttach, apex, centroid, curve);
  const cBot = earEdgeControl(apex, bottomAttach, centroid, curve);

  const fillD =
    `M ${topAttach.x} ${topAttach.y} Q ${cTop.x} ${cTop.y} ${apex.x} ${apex.y}` +
    ` Q ${cBot.x} ${cBot.y} ${bottomAttach.x} ${bottomAttach.y}` +
    ` Q ${attachControl.x} ${attachControl.y} ${topAttach.x} ${topAttach.y} Z`;
  const strokeD =
    `M ${topAttach.x} ${topAttach.y} Q ${cTop.x} ${cTop.y} ${apex.x} ${apex.y}` +
    ` Q ${cBot.x} ${cBot.y} ${bottomAttach.x} ${bottomAttach.y}`;

  return `
    <path d="${fillD}" fill="${fill}" stroke="none" />
    <path
      d="${strokeD}"
      fill="none"
      stroke="black"
      stroke-width="4"
      stroke-linejoin="round"
      stroke-linecap="round"
    />
  `;
}

// Outward-bulge control point for one edge, same technique as
// renderCurvedPointPath - a quadratic control pushed perpendicular, away from
// the shape centroid. Negative curve pulls the edge inward (concave inner ear).
function earEdgeControl(from, to, centroid, curve) {
  const mid = scalePoint(addPoints(from, to), 0.5);

  if (!curve) {
    return mid;
  }

  const edge = subtractPoints(to, from);
  const len = Math.hypot(edge.x, edge.y) || 1;
  let perp = { x: -edge.y / len, y: edge.x / len };
  const towardMid = subtractPoints(mid, centroid);

  if (perp.x * towardMid.x + perp.y * towardMid.y < 0) {
    perp = scalePoint(perp, -1);
  }

  return addPoints(mid, scalePoint(perp, curve));
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

// Standalone accessory belt, rendered with the same back/front split and
// shared-outline treatment the belt had when it lived inside renderHairV2 -
// only its sort position changed: the front run now sits below the hair/shine
// (drawn before them) and above the face polygon, while the back run still
// renders behind the face.
function renderHeadband(headband, layer) {
  if (!headband) {
    return "";
  }

  const shapes = headband.belt
    .filter(item => matchesHairLayer(item, layer))
    .map(strip => ({
      d: `${renderPointPath(strip.points)} Z`,
      fill: strip.fill,
      stroke: strip.stroke,
      strokeWidth: 2.5,
      opacity: 1
    }));

  if (!shapes.length) {
    return "";
  }

  return renderSharedOutlineShapes(shapes);
}

function renderFerronniere(ferronniere, layer) {
  if (!ferronniere) {
    return "";
  }

  const bands = ferronniere.bandRuns
    .filter(run => matchesHairLayer(run, layer))
    .map(run => renderFerronniereLine(run, "band"))
    .join("");
  const setting = ferronniere.layer === layer
    ? [
        renderFerronniereLine(ferronniere.connector, "connector"),
        renderFerronniereShape(ferronniere.gemSide, "gem-side"),
        renderFerronniereShape(ferronniere.holder, "holder"),
        renderFerronniereShape(ferronniere.gem, "gem")
      ].join("")
    : "";

  return bands + setting;
}

function renderFerronniereLine(line, role) {
  if (!line?.points?.length) {
    return "";
  }

  const path = renderPointPath(line.points);
  return `
    <path
      data-ferronniere-part="${role}-outline"
      d="${path}"
      fill="none"
      stroke="${line.outline}"
      stroke-width="${line.strokeWidth + 2}"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
    <path
      data-ferronniere-part="${role}"
      d="${path}"
      fill="none"
      stroke="${line.stroke}"
      stroke-width="${line.strokeWidth}"
      stroke-linecap="round"
      stroke-linejoin="round"
    />
  `;
}

function renderFerronniereShape(shape, role) {
  if (!shape?.points?.length) {
    return "";
  }

  return `
    <path
      data-ferronniere-part="${role}"
      d="${renderPointPath(shape.points)} Z"
      fill="${shape.fill}"
      stroke="${shape.stroke}"
      stroke-width="2"
      stroke-linejoin="round"
      opacity="${shape.opacity ?? 1}"
    />
  `;
}

// The scalp-base coverage rings render in their own pass, below the headband,
// so the accessory sits on top of the base fill but still under the locks and
// shine (which renderHairV2 draws afterwards). Kept as its own shared-outline
// group; the rings still hide their mutual seams the same way.
function renderHairV2ScalpBase(hairV2, layer) {
  if (!hairV2) {
    return "";
  }

  const shapes = (hairV2.scalpBase ?? [])
    .filter(item => matchesHairLayer(item, layer))
    .map(strip => ({
      d: `${renderPointPath(strip.points)} Z`,
      fill: strip.fill,
      stroke: strip.stroke,
      strokeWidth: 2.5,
      opacity: 1
    }));

  if (!shapes.length) {
    return "";
  }

  return hairV2.sharedOutline
    ? renderSharedOutlineShapes(shapes)
    : shapes.map(renderHairShape).join("");
}

function hairV2LockShape(lock, strokeWidth = 2) {
  return {
    d: renderHairLockPath(lock),
    fill: lock.fill,
    stroke: lock.stroke,
    strokeWidth,
    opacity: lock.opacity
  };
}

function renderPonytailExtension(ponytail, layer) {
  if (!ponytail) {
    return "";
  }

  const shapes = [ponytail.tailMass, ...(ponytail.detailLocks ?? [])]
    .filter(Boolean)
    .filter(lock => matchesHairLayer(lock, layer))
    .map(lock => hairV2LockShape(lock));
  const shapesMarkup = ponytail.sharedOutline
    ? renderSharedOutlineShapes(shapes)
    : shapes.map(renderHairShape).join("");
  const shines = [ponytail.tailShine, ...(ponytail.detailShines ?? [])]
    .filter(Boolean)
    .filter(shine => matchesHairLayer(shine, layer))
    .map(renderHairShine)
    .join("");

  return shapesMarkup + shines;
}

function renderDoublePonytailExtensions(doublePonytail, layer) {
  if (!doublePonytail) {
    return "";
  }

  return doublePonytail.tails
    .map(tail => renderPonytailExtension({
      ...tail,
      sharedOutline: doublePonytail.sharedOutline
    }, layer))
    .join("");
}

function renderPonytailTie(ponytail, layer) {
  const tie = ponytail?.tie;

  if (!tie || !matchesHairLayer(tie, layer)) {
    return "";
  }

  return renderHairShape({
    d: `${renderPointPath(tie.points)} Z`,
    fill: tie.fill,
    stroke: tie.stroke,
    strokeWidth: 2.5,
    opacity: tie.opacity
  });
}

function renderDoublePonytailTies(doublePonytail, layer) {
  if (!doublePonytail) {
    return "";
  }
  return doublePonytail.tails.map(tail => renderPonytailTie(tail, layer)).join("");
}

function renderSideTiedLocks(sideTiedLocks, layer) {
  if (!sideTiedLocks) {
    return "";
  }

  return sideTiedLocks.sections
    .filter(section => section.layer === layer)
    .map(section => {
      const locks = [...section.upperLocks, ...section.lowerLocks];
      const shapes = locks.map(lock => hairV2LockShape(lock));
      const shapesMarkup = sideTiedLocks.sharedOutline
        ? renderSharedOutlineShapes(shapes)
        : shapes.map(renderHairShape).join("");
      const shines = [...section.upperShines, ...section.lowerShines]
        .map(renderHairShine)
        .join("");
      return shapesMarkup + shines + renderPonytailTie({ tie: section.tie }, layer);
    })
    .join("");
}

function renderHairV2(hairV2, layer) {
  if (!hairV2) {
    return "";
  }

  const shapes = hairV2.locks
    .filter(item => matchesHairLayer(item, layer))
    .map(lock => hairV2LockShape(lock));

  const shapesMarkup = hairV2.sharedOutline
    ? renderSharedOutlineShapes(shapes)
    : shapes.map(renderHairShape).join("");

  const detailLines = hairV2.locks
    .filter(item => matchesHairLayer(item, layer))
    .flatMap(lock => lock.detailLines ?? [])
    .map(renderHairLockDetailLine)
    .join("");
  const shines = (hairV2.shines ?? [])
    .filter(item => matchesHairLayer(item, layer))
    .map(renderHairShine)
    .join("");
  const partGuide = layer === "front" && hairV2.showPartGuide
    ? renderHairV2PartGuide(hairV2.partGuide)
    : "";

  return `
    ${shapesMarkup}
    ${detailLines}
    ${shines}
    ${partGuide}
  `;
}

function renderFacialHair(facialHair, layer) {
  if (!facialHair) {
    return "";
  }

  const shapes = facialHair.locks
    .filter(item => matchesHairLayer(item, layer))
    .map(lock => ({
      d: renderHairLockPath(lock),
      fill: lock.fill,
      stroke: lock.stroke,
      strokeWidth: 2,
      opacity: lock.opacity
    }));
  const shapesMarkup = facialHair.sharedOutline
    ? renderSharedOutlineShapes(shapes)
    : shapes.map(renderHairShape).join("");
  const shines = (facialHair.shines ?? [])
    .filter(item => matchesHairLayer(item, layer))
    .map(renderHairShine)
    .join("");

  return shapesMarkup + shines;
}

// Borderless fill on top of everything else in this layer, so it reads as a
// glossy highlight sitting on the hair's surface rather than another
// outlined lock.
function renderHairShine(shine) {
  return `
    <path
      d="${renderHairLockPath(shine)}"
      fill="${shine.fill}"
      stroke="none"
      opacity="${shine.opacity}"
    />
  `;
}

function renderHairShape(shape) {
  return `
    <path
      d="${shape.d}"
      fill="${shape.fill}"
      stroke="${shape.stroke}"
      stroke-width="${shape.strokeWidth}"
      stroke-linejoin="round"
      opacity="${shape.opacity}"
    />
  `;
}

// Every shape's stroke is drawn first, then every shape's fill on top - a
// fill from any shape covers the strokes of shapes beneath it wherever they
// overlap, so only the outer silhouette (where nothing else's fill covers
// it) keeps a visible stroke, instead of every lock/belt piece outlining
// itself and showing seams where they overlap.
function renderSharedOutlineShapes(shapes) {
  // Stroke is centered on the path, so once fills paint over the inner half,
  // only strokeWidth/2 stays visible at the true outer silhouette. Doubling
  // it here means that visible outer half ends up the same width as the
  // original stroke looked before this shape ever had a fill drawn over it.
  const strokes = shapes.map(shape => `
    <path
      d="${shape.d}"
      fill="none"
      stroke="${shape.stroke}"
      stroke-width="${shape.strokeWidth * 2}"
      stroke-linejoin="round"
      opacity="${shape.opacity}"
    />
  `).join("");
  const fills = shapes.map(shape => `
    <path
      d="${shape.d}"
      fill="${shape.fill}"
      stroke="none"
      opacity="${shape.opacity}"
    />
  `).join("");

  return strokes + fills;
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

// Used by v1 hair (src/rig.js's makeHairLock), which doesn't have the
// shared-outline treatment - hairV2 builds its own shape descriptors and
// renders through renderHairShape/renderSharedOutlineShapes instead.
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

    const tipBridge = lock.tipRight
      ? `L ${lock.tipRight.x} ${lock.tipRight.y}`
      : "";

    return [
      `M ${lock.rootLeft.x} ${lock.rootLeft.y}`,
      leftPath,
      tipBridge,
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

  const stroke = brow.strokeVisible ? "black" : "none";
  const strokeWidth = brow.strokeVisible ? 2.5 : 0;

  return `
    <path
      d="
        M ${brow.topInner.x} ${brow.topInner.y}
        Q ${brow.topControl.x} ${brow.topControl.y} ${brow.topOuter.x} ${brow.topOuter.y}
        L ${brow.bottomOuter.x} ${brow.bottomOuter.y}
        Q ${brow.bottomControl.x} ${brow.bottomControl.y} ${brow.bottomInner.x} ${brow.bottomInner.y}
        Z
      "
      fill="${brow.fillColor}"
      stroke="${stroke}"
      stroke-width="${strokeWidth}"
      stroke-linejoin="round"
    />
  `;
}

function renderEyeShading(shading, headPathD) {
  const visibleShading = (shading ?? []).filter(item => item.visible || item.bagVisible);

  if (!visibleShading.length) {
    return "";
  }

  return `
    <defs>
      <clipPath id="eye-shading-head-clip">
        <path d="${headPathD}" />
      </clipPath>
    </defs>
    <g clip-path="url(#eye-shading-head-clip)">
      ${visibleShading.map(item => `
        ${item.bagVisible ? `
        <path
          class="eye-shading-bag"
          d="${renderEyeShadingBagPath(item.bagShape)}"
          fill="${item.fillColor}"
          stroke="none"
        />` : ""}
        ${item.visible ? `
        <path
          class="eye-shading-eye"
          d="${renderEyePath({ quad: item.eyeShape })}"
          fill="${item.fillColor}"
          stroke="none"
        />
        <path
          class="eye-shading-bridge"
          d="${renderEyeShadingBridgePath(item.bridgeShape)}"
          fill="${item.fillColor}"
          stroke="none"
        />` : ""}
      `).join("")}
    </g>
  `;
}

function renderEyeShadingBagPath(shape) {
  return [
    `M ${shape.innerAnchor.x} ${shape.innerAnchor.y}`,
    `C ${shape.firstControl.x} ${shape.firstControl.y} ${shape.lowerOuter.x} ${shape.lowerOuter.y} ${shape.lowerOuter.x} ${shape.lowerOuter.y}`,
    `L ${shape.outerAnchor.x} ${shape.outerAnchor.y}`,
    `C ${shape.secondControl.x} ${shape.secondControl.y} ${shape.innerOuter.x} ${shape.innerOuter.y} ${shape.innerOuter.x} ${shape.innerOuter.y}`,
    "Z"
  ].join(" ");
}

function renderEyeShadingBridgePath(shape) {
  return [
    `M ${shape.bottomInner.x} ${shape.bottomInner.y}`,
    `Q ${shape.bottomControl.x} ${shape.bottomControl.y} ${shape.bottomOuter.x} ${shape.bottomOuter.y}`,
    `L ${shape.topOuter.x} ${shape.topOuter.y}`,
    `Q ${shape.topControl.x} ${shape.topControl.y} ${shape.topInner.x} ${shape.topInner.y}`,
    "Z"
  ].join(" ");
}

function renderFaceScar(scar, headPathD) {
  if (!scar?.cycles?.length) {
    return "";
  }

  return `
    <defs>
      <clipPath id="face-scar-head-clip">
        <path d="${headPathD}" />
      </clipPath>
    </defs>
    <g class="face-scar-layer" clip-path="url(#face-scar-head-clip)">
      ${scar.cycles.map((points, index) => `
        <path
          class="face-scar"
          data-face-scar-cycle="${index}"
          d="${renderPointPath(points)} Z"
          fill="${scar.fill}"
          stroke="none"
        />
      `).join("")}
    </g>
  `;
}

function renderEyeScars(eyes, headPathD) {
  const scars = (eyes ?? [])
    .filter(eye => eye.visible && eye.scar)
    .map(eye => eye.scar);

  if (!scars.length) {
    return "";
  }

  return `
    <defs>
      <clipPath id="eye-scar-head-clip">
        <path d="${headPathD}" />
      </clipPath>
    </defs>
    <g class="eye-scar-layer" clip-path="url(#eye-scar-head-clip)">
      ${scars.map(renderEyeScar).join("")}
    </g>
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

function renderEyeScar(scar) {
  if (!scar?.points?.length) {
    return "";
  }

  return `
    <path
      class="eye-scar"
      data-screen-side="${scar.screenSide}"
      d="${renderPointPath(scar.points)} Z"
      fill="${scar.fill}"
      stroke="none"
    />
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

function renderNose(nose, yawAmount) {
  const nostrils = [
    { point: nose.leftNostril, curve: nose.leftNostrilCurve },
    { point: nose.rightNostril, curve: nose.rightNostrilCurve }
  ];
  const farNostrilIndex = Math.abs(nostrils[0].point.x - 250) > Math.abs(nostrils[1].point.x - 250) ? 0 : 1;
  const farNostril = nostrils[farNostrilIndex];
  const nearNostril = nostrils[1 - farNostrilIndex];
  const showBridgeSegment = nose.bridge.y >= nose.tip.y || yawAmount >= 0.5;

  return `
      ${showBridgeSegment ? `
    <path
      class="nose-bridge-segment"
      d="M ${nose.bridge.x} ${nose.bridge.y} L ${nose.tip.x} ${nose.tip.y}"
      fill="none"
      stroke="black"
      stroke-width="3"
      stroke-linecap="round"
    />` : ""}
    <path
      class="nose-near-nostril-segment"
      d="M ${nose.tip.x} ${nose.tip.y} L ${nearNostril.point.x} ${nearNostril.point.y}"
      fill="none"
      stroke="black"
      stroke-width="3"
      stroke-linecap="round"
    />
    ${renderNostrilCurve(nearNostril.curve, "nose-near-nostril-curve")}
    ${yawAmount <= 0.5 ? `
    <path
      class="nose-far-nostril-segment"
      d="M ${nose.tip.x} ${nose.tip.y} L ${farNostril.point.x} ${farNostril.point.y}"
      fill="none"
      stroke="black"
      stroke-width="3"
      stroke-linecap="round"
    />
    ${renderNostrilCurve(farNostril.curve, "nose-far-nostril-curve")}` : ""}
  `;
}

function renderNostrilCurve(curve, className) {
  if (!curve) {
    return "";
  }

  return `
    <path
      class="${className}"
      d="M ${curve.start.x} ${curve.start.y} C ${curve.control1.x} ${curve.control1.y} ${curve.control2.x} ${curve.control2.y} ${curve.end.x} ${curve.end.y}"
      fill="none"
      stroke="black"
      stroke-width="3"
      stroke-linecap="round"
    />`;
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
