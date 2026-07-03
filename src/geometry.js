export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function lerp(start, end, t) {
  return start + (end - start) * t;
}

export function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function poseSign(yaw) {
  return yaw < 0 ? -1 : 1;
}

export function createProjector(params, pose) {
  const yawAngle = pose.yaw * Math.PI * 0.42;
  const cy = Math.cos(yawAngle);
  const sy = Math.sin(yawAngle);
  const cp = Math.cos(params.pitch);
  const sp = Math.sin(params.pitch);

  return function project(x, y, z = 0) {
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
  };
}

export function createHeadProjector(params, pose) {
  const project = createProjector(params, pose);
  const widthRetention = 1 / (1 - pose.amount * 0.35);

  return function projectHead(x, y, z = 0) {
    return project(x * widthRetention, y, z);
  };
}
