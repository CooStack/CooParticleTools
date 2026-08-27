import * as THREE from "three";

const TARGET_PIXEL_SPACING = 48;
const MIN_STEP_EXPONENT = -7;
const MAX_STEP_EXPONENT = 17;
const MIN_STEP = 2 ** MIN_STEP_EXPONENT;
const PLANE_SIZE = 1000000;

const vertexShader = `
varying vec2 vScreenUv;

void main() {
  vScreenUv = position.xy * 0.5 + 0.5;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const fragmentShader = `
uniform float uFineStep;
uniform float uLodBlend;
uniform vec3 uCenter;
uniform mat4 uInvProjection;
uniform mat4 uInvView;
uniform vec3 uPlaneOrigin;
uniform vec3 uPlaneNormal;
uniform int uPlaneMode;
uniform float uFadeStart;
uniform float uFadeEnd;
uniform vec3 uGridColor;
uniform float uOpacity;
varying vec2 vScreenUv;

vec3 unproject(vec2 uv, float depth) {
  vec4 clipPosition = vec4(uv * 2.0 - 1.0, depth, 1.0);
  vec4 viewPosition = uInvProjection * clipPosition;
  viewPosition /= max(abs(viewPosition.w), 0.000001);
  return (uInvView * vec4(viewPosition.xyz, 1.0)).xyz;
}

vec2 planeCoordinate(vec3 worldPosition) {
  if (uPlaneMode == 1) return worldPosition.xy;
  if (uPlaneMode == 2) return worldPosition.zy;
  return worldPosition.xz;
}

float gridLine(vec2 coordinate, vec2 derivative) {
  vec2 distanceToLine = abs(fract(coordinate - 0.5) - 0.5);
  vec2 antiAlias = clamp(derivative * 1.5, vec2(0.0001), vec2(0.22));
  vec2 line = 1.0 - smoothstep(vec2(0.0), antiAlias, distanceToLine);
  float pixelCoverage = min(1.0, 0.5 / max(max(derivative.x, derivative.y), 0.0001));
  return max(line.x, line.y) * pixelCoverage;
}

void main() {
  vec3 rayStart = unproject(vScreenUv, -1.0);
  vec3 rayEnd = unproject(vScreenUv, 1.0);
  vec3 rayDirection = normalize(rayEnd - rayStart);
  float denominator = dot(rayDirection, uPlaneNormal);
  if (abs(denominator) < 0.00001) discard;
  float rayDistance = dot(uPlaneOrigin - rayStart, uPlaneNormal) / denominator;
  if (rayDistance < 0.0) discard;
  vec3 vWorldPosition = rayStart + rayDirection * rayDistance;
  vec2 coordinate = planeCoordinate(vWorldPosition);
  vec2 coordinateDerivative = fwidth(coordinate);
  float baseDensity = max(coordinateDerivative.x, coordinateDerivative.y) / max(uFineStep, 0.0001);
  float densityLevel = clamp(floor(log2(max(baseDensity / 0.45, 1.0))), 0.0, 20.0);
  float densityScale = exp2(densityLevel);
  float localFineStep = uFineStep * densityScale;
  float localCoarseStep = localFineStep * 2.0;
  float localDensity = baseDensity / densityScale;
  float cameraBlend = densityLevel < 0.5 ? uLodBlend : 0.0;
  float fineToCoarse = max(smoothstep(0.45, 0.9, localDensity), cameraBlend);
  float fineLine = gridLine(
    coordinate / max(localFineStep, 0.0001),
    coordinateDerivative / max(localFineStep, 0.0001)
  );
  float coarseLine = gridLine(
    coordinate / max(localCoarseStep, 0.0001),
    coordinateDerivative / max(localCoarseStep, 0.0001)
  );
  float planeDistance = distance(vWorldPosition, uCenter);
  float distanceFade = 1.0 - smoothstep(uFadeStart, uFadeEnd, planeDistance);
  float fineAlpha = fineLine * (1.0 - fineToCoarse) * 0.98;
  float coarseAlpha = coarseLine * 0.98;
  float alpha = max(fineAlpha, coarseAlpha) * distanceFade * uOpacity;
  if (alpha <= 0.01) discard;
  gl_FragColor = vec4(uGridColor, alpha);
}
`;

function clampStepExponent(value, maximum = MAX_STEP_EXPONENT) {
  return Math.max(MIN_STEP_EXPONENT, Math.min(maximum, value));
}

function rawStep(distance, fov, viewportHeight) {
  const safeDistance = Number(distance);
  const safeFov = Number(fov);
  const safeHeight = Number(viewportHeight);
  if (![safeDistance, safeFov, safeHeight].every(Number.isFinite)) return 1;
  const visibleHeight = 2 * Math.max(0.001, safeDistance) * Math.tan(Math.max(1, safeFov) * Math.PI / 360);
  return visibleHeight * TARGET_PIXEL_SPACING / Math.max(1, safeHeight);
}

function resolveLod(distance, fov, viewportHeight) {
  const raw = Math.max(MIN_STEP, rawStep(distance, fov, viewportHeight));
  const exponent = clampStepExponent(Math.floor(Math.log2(raw)), MAX_STEP_EXPONENT - 1);
  const fineStep = 2 ** exponent;
  const coarseStep = fineStep * 2;
  const normalizedFine = raw / fineStep;
  const blendStart = 1.05;
  const blendEnd = Math.max(blendStart + 0.1, (coarseStep / fineStep) * 0.85);
  const t = Math.max(0, Math.min(1, (normalizedFine - blendStart) / (blendEnd - blendStart)));
  return {
    fineStep,
    coarseStep,
    blend: t * t * (3 - 2 * t),
  };
}

function colorFrom(value, fallback = "#617d9b") {
  const color = new THREE.Color();
  try {
    color.set(value || fallback);
  } catch {
    color.set(fallback);
  }
  return color;
}

export function createAdaptiveGrid({
  scene,
  camera,
  controls,
  renderer,
  color = "#617d9b",
  visible = true,
  plane = "XZ",
  offset = -0.01,
} = {}) {
  if (!scene || !camera || !controls || !renderer) return null;

  const gridColor = colorFrom(color);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    side: THREE.DoubleSide,
    extensions: { derivatives: true },
    uniforms: {
      uFineStep: { value: 1 },
      uLodBlend: { value: 0 },
      uCenter: { value: new THREE.Vector3() },
      uInvProjection: { value: new THREE.Matrix4() },
      uInvView: { value: new THREE.Matrix4() },
      uPlaneOrigin: { value: new THREE.Vector3() },
      uPlaneNormal: { value: new THREE.Vector3(0, 1, 0) },
      uPlaneMode: { value: 0 },
      uFadeStart: { value: 12 },
      uFadeEnd: { value: 64 },
      uGridColor: { value: gridColor },
      uOpacity: { value: 1 },
    },
    vertexShader,
    fragmentShader,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  material.depthTest = false;
  scene.add(mesh);

  let planeKey = "XZ";
  let planeOffset = Number.isFinite(Number(offset)) ? Number(offset) : -0.01;
  let lastFineStep = 1;
  let lastMetrics = {
    fineStep: 1,
    coarseStep: 2,
    nextStep: 4,
    farStep: 8,
    blend: 0,
    fadeStart: 12,
    fadeEnd: 64,
    plane: planeKey,
  };

  function applyPlane(nextPlane = "XZ", nextOffset = planeOffset) {
    planeKey = ["XZ", "XY", "ZY"].includes(String(nextPlane).toUpperCase())
      ? String(nextPlane).toUpperCase()
      : "XZ";
    planeOffset = Number.isFinite(Number(nextOffset)) ? Number(nextOffset) : planeOffset;
    material.uniforms.uPlaneMode.value = planeKey === "XY" ? 1 : planeKey === "ZY" ? 2 : 0;
    if (planeKey === "XY") material.uniforms.uPlaneNormal.value.set(0, 0, 1);
    else if (planeKey === "ZY") material.uniforms.uPlaneNormal.value.set(1, 0, 0);
    else material.uniforms.uPlaneNormal.value.set(0, 1, 0);
    material.uniforms.uPlaneOrigin.value.set(0, 0, 0);
    if (planeKey === "XY") material.uniforms.uPlaneOrigin.value.z = planeOffset;
    else if (planeKey === "ZY") material.uniforms.uPlaneOrigin.value.x = planeOffset;
    else material.uniforms.uPlaneOrigin.value.y = planeOffset;
    update();
  }

  function update() {
    const target = controls.target;
    camera.updateMatrixWorld();
    material.uniforms.uInvProjection.value.copy(camera.projectionMatrix).invert();
    material.uniforms.uInvView.value.copy(camera.matrixWorld);
    const cameraDistance = camera.position.distanceTo(target);
    const viewportHeight = renderer.domElement.height || renderer.domElement.clientHeight || 1;
    const lod = resolveLod(cameraDistance, camera.fov, viewportHeight);
    if (Math.abs(lod.fineStep - lastFineStep) > Math.max(1e-6, lod.fineStep * 1e-6)) {
      material.uniforms.uFineStep.value = lod.fineStep;
      lastFineStep = lod.fineStep;
    }
    material.uniforms.uLodBlend.value = lod.blend;
    material.uniforms.uCenter.value.copy(target);
    const fadeEnd = Math.min(
      camera.far * 0.8,
      PLANE_SIZE * 0.35,
      Math.max(lod.coarseStep * 96, cameraDistance * 16)
    );
    material.uniforms.uFadeStart.value = fadeEnd * 0.42;
    material.uniforms.uFadeEnd.value = fadeEnd;
    lastMetrics = {
      fineStep: lod.fineStep,
      coarseStep: lod.coarseStep,
      nextStep: lod.coarseStep * 2,
      farStep: lod.coarseStep * 4,
      blend: lod.blend,
      fadeStart: material.uniforms.uFadeStart.value,
      fadeEnd,
      plane: planeKey,
    };
  }

  function setVisible(nextVisible) {
    mesh.visible = Boolean(nextVisible);
  }

  function setColor(nextColor) {
    material.uniforms.uGridColor.value.copy(colorFrom(nextColor));
  }

  function setOpacity(nextOpacity) {
    material.uniforms.uOpacity.value = Math.max(0, Math.min(1, Number(nextOpacity) || 0));
  }

  function dispose() {
    scene.remove(mesh);
    mesh.geometry.dispose();
    material.dispose();
  }

  mesh.userData.adaptiveGrid = { setPlane: applyPlane };
  applyPlane(plane, planeOffset);
  setColor(color);
  setVisible(visible);
  return {
    mesh,
    material,
    update,
    setVisible,
    setColor,
    setOpacity,
    setPlane: applyPlane,
    getMetrics: () => ({ ...lastMetrics }),
    dispose,
  };
}
