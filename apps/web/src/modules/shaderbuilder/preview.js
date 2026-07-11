import { normalizeShaderProject } from './normalizer.js';

function ringPoints(radius, count, y = 0) {
  return Array.from({ length: count }, (_, index) => {
    const angle = (index / count) * Math.PI * 2;
    return {
      x: Math.cos(angle) * radius,
      y,
      z: Math.sin(angle) * radius
    };
  });
}

function boxPoints(size = 2) {
  const half = size / 2;
  const coords = [-half, half];
  const points = [];
  coords.forEach((x) => {
    coords.forEach((y) => {
      coords.forEach((z) => {
        points.push({ x, y, z });
      });
    });
  });
  return points;
}

function spherePoints(radius = 2, lat = 10, lon = 16) {
  const points = [];
  for (let i = 0; i <= lat; i += 1) {
    const v = i / Math.max(1, lat);
    const phi = v * Math.PI;
    for (let j = 0; j < lon; j += 1) {
      const u = j / Math.max(1, lon);
      const theta = u * Math.PI * 2;
      points.push({
        x: radius * Math.sin(phi) * Math.cos(theta),
        y: radius * Math.cos(phi),
        z: radius * Math.sin(phi) * Math.sin(theta)
      });
    }
  }
  return points;
}

function torusPoints(radius = 2.6, tube = 0.75, radial = 12, tubular = 24) {
  const points = [];
  for (let i = 0; i < radial; i += 1) {
    const u = (i / radial) * Math.PI * 2;
    for (let j = 0; j < tubular; j += 1) {
      const v = (j / tubular) * Math.PI * 2;
      points.push({
        x: (radius + tube * Math.cos(v)) * Math.cos(u),
        y: tube * Math.sin(v),
        z: (radius + tube * Math.cos(v)) * Math.sin(u)
      });
    }
  }
  return points;
}

export function collectShaderPreviewPoints(rawProject) {
  const project = normalizeShaderProject(rawProject);
  const primitive = project.model?.primitive || 'sphere';
  const passCount = Math.max(1, project.post?.nodes?.length || 1);
  const radiusOffset = Math.min(passCount * 0.08, 0.6);
  if (primitive === 'box') return boxPoints(2 + radiusOffset);
  if (primitive === 'torus') return torusPoints(2.2 + radiusOffset, 0.7);
  if (primitive === 'plane') return ringPoints(3 + radiusOffset, 32, 0);
  return spherePoints(2.1 + radiusOffset, 10, 18);
}
