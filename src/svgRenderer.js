export function renderFaceSvg(rig) {
  return `
    <svg viewBox="0 0 500 500" role="img" aria-label="2.5D anime face preview">
      ${renderHead(rig.head)}
      ${rig.features.brows.map(renderBrow).join("")}
      ${rig.features.eyes.map(renderEye).join("")}
      ${renderNose(rig.features.nose)}
      ${renderMouth(rig.features.mouth)}
    </svg>
  `;
}

function renderHead(head) {
  const d = [
    ...head.dome.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`),
    ...renderLowerHeadCommands(head)
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

function renderLowerHeadCommands(head) {
  const lower = head.lower;

  return [
    `C ${lower.faceCheekControl.x} ${lower.faceCheekControl.y} ${lower.faceJawControl.x} ${lower.faceJawControl.y} ${lower.faceJaw.x} ${lower.faceJaw.y}`,
    `L ${lower.faceChin.x} ${lower.faceChin.y}`,
    `L ${lower.backChin.x} ${lower.backChin.y}`,
    `L ${lower.backJaw.x} ${lower.backJaw.y}`,
    `C ${lower.backJawControl.x} ${lower.backJawControl.y} ${lower.backCheekControl.x} ${lower.backCheekControl.y} ${head.backSide.x} ${head.backSide.y}`,
    "Z"
  ];
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
