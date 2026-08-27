import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import test from 'node:test';

import { createGeneratorProject } from '../src/modules/generator/defaults.js';
import { sampleLifecycleCurve } from '../src/modules/generator/curves.js';
import { setCParticleTexturePreview } from '../src/modules/generator/cparticle-forces.js';
import {
  createGeneratorPreviewRuntime,
  resolveRelativeParticleRotation
} from '../src/modules/generator/preview-simulation.js';

function createFixture(count = 1) {
  const project = createGeneratorProject();
  const card = project.emitters[0];
  project.playing = true;
  card.emitter.type = 'sphere';
  card.emitter.sphere.r = 2;
  card.particle.countMin = count;
  card.particle.countMax = count;
  card.particle.lifeMin = 4;
  card.particle.lifeMax = 4;
  card.particle.sizeMin = 0.1;
  card.particle.sizeMax = 0.1;
  card.particle.colorStart = '#000000';
  card.particle.colorEnd = '#ffffff';
  card.particle.colorGradientEnabled = true;
  card.curves.color.enabled = true;
  card.render.alpha = 100;
  card.render.light = 15;
  card.curves.size.x.mode = 'linear';
  card.curves.size.y.mode = 'linear';
  card.curves.size.x.enabled = true;
  card.curves.size.y.enabled = true;
  card.curves.size.x.keyframes[0].value = 1;
  card.curves.size.x.keyframes[1].value = 1;
  card.curves.size.y.keyframes[0].value = 1;
  card.curves.size.y.keyframes[1].value = 1;
  return { project, card };
}

function simulateCParticleForce(type, parameters, options = {}) {
  const { project, card } = createFixture();
  const position = options.position || { x: 0, y: 0, z: 0 };
  const velocity = options.velocity || { x: 0, y: 0, z: 0 };
  const speed = Math.hypot(velocity.x, velocity.y, velocity.z);
  card.useGPU = true;
  card.emitter.type = 'point';
  card.emitter.offset = { ...position };
  card.emission.mode = 'once';
  card.particle.lifeMin = 100;
  card.particle.lifeMax = 100;
  card.particle.velocity = { ...velocity };
  card.particle.velocityRandom = { x: 0, y: 0, z: 0 };
  card.particle.speedMin = speed;
  card.particle.speedMax = speed;
  if (Object.hasOwn(options, 'charge')) card.gpu.charge = options.charge;
  project.forceCommands = [{
    id: `${type}-preview`,
    enabled: true,
    label: `${type} preview`,
    force: { type, parameters },
    selector: { type: 'All' }
  }];
  const runtime = createGeneratorPreviewRuntime();
  runtime.step(project, 1);
  return runtime.snapshotRenderData(project);
}

function assertPreviewPosition(snapshot, expected, epsilon = 1e-6) {
  assert.equal(snapshot.count, 1);
  expected.forEach((value, index) => {
    assert.ok(
      Math.abs(snapshot.positions[index] - value) < epsilon,
      `expected axis ${index} to be ${value}, received ${snapshot.positions[index]}`
    );
  });
}

test('generator render cache preserves values and invalidates after curve edits', () => {
  const { project, card } = createFixture();
  const runtime = createGeneratorPreviewRuntime();
  runtime.step(project, 1);

  const first = runtime.snapshotRenderData(project);
  const firstSize = first.sizes[0];
  const firstRed = first.colors[0];
  const firstGreen = first.colors[1];
  const repeated = runtime.snapshotRenderData(project);

  assert.equal(first.count, 1);
  assert.equal(repeated.sizes[0], firstSize);
  assert.equal(repeated.colors[0], firstRed);

  card.curves.size.x.keyframes[1].value = 2;
  card.curves.size.y.keyframes[1].value = 2;
  card.particle.colorEnd = '#ff0000';
  const edited = runtime.snapshotRenderData(project);

  assert.ok(edited.sizes[0] > firstSize);
  assert.equal(edited.colors[0], firstRed);
  assert.ok(edited.colors[1] < firstGreen);
  assert.equal(edited.colors[1], 0);
  assert.equal(edited.colors[2], 0);
});

test('face-camera billboard render buffers preserve independent X/Y scale', () => {
  const { project, card } = createFixture();
  card.render.billboardMode = 'face_camera';
  card.render.baseScale = { x: 1, y: 3 };
  const runtime = createGeneratorPreviewRuntime();

  runtime.step(project, 1);
  const snapshot = runtime.snapshotRenderData(project);

  assert.equal(snapshot.count, 1);
  assert.ok(snapshot.scaleYs[0] > snapshot.scaleXs[0] * 2.9);
});

test('face-camera billboard render buffers preserve the texture sheet', () => {
  const { project, card } = createFixture();
  card.render.billboardMode = 'face_camera';
  card.render.textureSheet = 'ADDITION_BLEND_TRANSLUCENT';
  const runtime = createGeneratorPreviewRuntime();

  runtime.step(project, 1);
  const snapshot = runtime.snapshotRenderData(project);

  assert.equal(snapshot.kind, 'preview-buffers');
  assert.equal(snapshot.textureSheet, 'ADDITION_BLEND_TRANSLUCENT');
});

test('generator preview points do not retain a Z scale field', () => {
  const { project, card } = createFixture();
  card.render.billboardMode = 'none';
  card.render.baseScale.z = 8;
  card.curves.size.z = card.curves.size.x;
  const runtime = createGeneratorPreviewRuntime();

  runtime.step(project, 1);
  const [point] = runtime.snapshot(project);

  assert.equal(Object.hasOwn(point, 'scaleZ'), false);
  assert.ok(point.scaleX > 0);
  assert.ok(point.scaleY > 0);
});

test('spawn-inward preview moves particles toward the emitter origin', () => {
  const { project, card } = createFixture();
  card.emitter.type = 'sphere_surface';
  card.emitter.offset = { x: 3, y: 4, z: 5 };
  card.emitter.sphereSurface.r = 2;
  card.particle.velocityMode = 'spawn_inward';
  card.particle.velocityRandom = { x: 0, y: 0, z: 0 };
  card.particle.speedMin = 1;
  card.particle.speedMax = 1;
  const runtime = createGeneratorPreviewRuntime();

  runtime.step(project, 1);
  const [point] = runtime.snapshot(project);
  const distance = Math.hypot(point.x - 3, point.y - 4, point.z - 5);

  assert.ok(Math.abs(distance - 1) < 1e-9);
});

test('relative particle rotation maps local up to arbitrary spatial directions', () => {
  const directions = [
    { x: 0, y: 0, z: 1 },
    { x: 1, y: 0, z: 0 },
    { x: -2, y: 3, z: 4 },
    { x: 0, y: -1, z: 0 }
  ];

  directions.forEach((direction) => {
    const rotation = resolveRelativeParticleRotation(direction);
    const pitch = rotation.pitch * Math.PI / 180;
    const roll = rotation.roll * Math.PI / 180;
    const actual = {
      x: -Math.sin(roll),
      y: Math.cos(pitch) * Math.cos(roll),
      z: Math.sin(pitch) * Math.cos(roll)
    };
    const length = Math.hypot(direction.x, direction.y, direction.z);
    assert.ok(Math.abs(actual.x - direction.x / length) < 1e-9);
    assert.ok(Math.abs(actual.y - direction.y / length) < 1e-9);
    assert.ok(Math.abs(actual.z - direction.z / length) < 1e-9);
  });
});

test('relative rotation preview uses the particle birth position', () => {
  const { project, card } = createFixture();
  card.emitter.type = 'point';
  card.emitter.offset = { x: 0, y: 0, z: 1 };
  card.render.billboardMode = 'none';
  card.render.relativeRotation = true;
  card.particle.velocity = { x: 1, y: 0, z: 0 };
  card.particle.velocityRandom = { x: 0, y: 0, z: 0 };
  card.particle.speedMin = 1;
  card.particle.speedMax = 1;
  const runtime = createGeneratorPreviewRuntime();

  runtime.step(project, 2);
  const [point] = runtime.snapshot(project);

  assert.ok(Math.abs(point.pitch - 90) < 1e-9);
  assert.ok(Math.abs(point.roll) < 1e-9);
});

test('single-color preview ignores the configured final color', () => {
  const { project, card } = createFixture();
  card.particle.colorGradientEnabled = false;
  card.particle.colorStart = '#204060';
  card.particle.colorEnd = '#ffffff';
  card.curves.color.enabled = true;
  const runtime = createGeneratorPreviewRuntime();

  runtime.step(project, 1);
  const snapshot = runtime.snapshotRenderData(project);

  assert.ok(Math.abs(snapshot.colors[0] - 0.12549) < 1e-5);
  assert.ok(Math.abs(snapshot.colors[1] - 0.25098) < 1e-5);
  assert.ok(Math.abs(snapshot.colors[2] - 0.376471) < 1e-5);
});

test('GPU preview switches between shared and independent X/Y scale curves', () => {
  const { project, card } = createFixture();
  card.useGPU = true;
  card.curves.size.syncAxes = false;
  card.curves.size.y.keyframes[0].value = 2;
  card.curves.size.y.keyframes[1].value = 2;
  const independentRuntime = createGeneratorPreviewRuntime();

  independentRuntime.step(project, 1);
  const [independentPoint] = independentRuntime.snapshot(project);
  assert.ok(independentPoint.scaleY > independentPoint.scaleX * 1.9);

  card.curves.size.syncAxes = true;
  const sharedRuntime = createGeneratorPreviewRuntime();
  sharedRuntime.step(project, 1);
  const [sharedPoint] = sharedRuntime.snapshot(project);
  assert.ok(Math.abs(sharedPoint.scaleY - sharedPoint.scaleX) < 1e-9);
});

test('GPU preview samples Bezier opacity, color, and size from the shared lifecycle curve', () => {
  const { project, card } = createFixture();
  card.useGPU = true;
  card.emitter.type = 'point';
  card.emission.mode = 'once';
  card.particle.lifeMin = 100;
  card.particle.lifeMax = 100;
  card.particle.sizeMin = 1;
  card.particle.sizeMax = 1;
  card.particle.colorStart = '#000000';
  card.particle.colorEnd = '#ffffff';
  card.render.alpha = 100;
  const configureBezier = (curve, start, end) => {
    curve.enabled = true;
    curve.mode = 'bezier';
    curve.keyframes = [
      { id: `${curve.id}-start`, time: 0, value: start, out: { x: 88, y: end - start } },
      { id: `${curve.id}-end`, time: 100, value: end, in: { x: -88, y: 0 } }
    ];
  };
  configureBezier(card.curves.opacity, 100, 20);
  configureBezier(card.curves.color, 0, 1);
  configureBezier(card.curves.size.x, 1, 3);
  configureBezier(card.curves.size.y, 1, 3);
  const runtime = createGeneratorPreviewRuntime();

  runtime.step(project, 50);
  const [point] = runtime.snapshot(project);
  const opacity = sampleLifecycleCurve(card.curves.opacity, 50) / 100;
  const colorProgress = sampleLifecycleCurve(card.curves.color, 50);
  const size = sampleLifecycleCurve(card.curves.size.x, 50);

  assert.ok(Math.abs(point.alpha - opacity) < 1e-9);
  assert.ok(Math.abs(point.r - colorProgress) < 1e-9);
  assert.ok(Math.abs(point.g - colorProgress) < 1e-9);
  assert.ok(Math.abs(point.b - colorProgress) < 1e-9);
  assert.ok(Math.abs(point.scaleX - size) < 1e-9);
  assert.ok(Math.abs(point.scaleY - size) < 1e-9);
});

test('disabled custom color curve keeps the default lifetime gradient for CPU and GPU', () => {
  const { project, card } = createFixture();
  card.emitter.type = 'point';
  card.particle.colorStart = '#000000';
  card.particle.colorEnd = '#ff0000';
  card.curves.color.enabled = false;

  const cpuRuntime = createGeneratorPreviewRuntime();
  cpuRuntime.step(project, 1);
  const cpuSnapshot = cpuRuntime.snapshotRenderData(project);
  assert.ok(Math.abs(cpuSnapshot.colors[0] - 0.25) < 1e-6);
  assert.equal(cpuSnapshot.colors[1], 0);
  assert.equal(cpuSnapshot.colors[2], 0);

  card.useGPU = true;
  const gpuRuntime = createGeneratorPreviewRuntime();
  gpuRuntime.step(project, 1);
  const gpuSnapshot = gpuRuntime.snapshotRenderData(project);
  assert.ok(Math.abs(gpuSnapshot.colors[0] - 0.25) < 1e-6);
  assert.equal(gpuSnapshot.colors[1], 0);
  assert.equal(gpuSnapshot.colors[2], 0);
});

test('generator preview applies emitter gravity before movement', () => {
  const { project, card } = createFixture();
  card.emitter.type = 'point';
  card.emitter.offset = { x: 0, y: 0, z: 0 };
  card.particle.velocity = { x: 0, y: 1, z: 0 };
  card.particle.velocityRandom = { x: 0, y: 0, z: 0 };
  card.particle.speedMin = 1;
  card.particle.speedMax = 1;
  card.physics.gravity = 0.25;

  const runtime = createGeneratorPreviewRuntime();
  runtime.step(project, 1);
  const snapshot = runtime.snapshotRenderData(project);

  assert.equal(snapshot.count, 1);
  assert.ok(Math.abs(snapshot.positions[1] - 0.75) < 1e-6);
});

test('generator preview separates CPU queues from CParticle Force Commands', () => {
  const { project, card } = createFixture();
  card.emitter.type = 'point';
  card.emitter.offset = { x: 0, y: 0, z: 0 };
  card.particle.velocity = { x: 0, y: 1, z: 0 };
  card.particle.velocityRandom = { x: 0, y: 0, z: 0 };
  card.particle.speedMin = 1;
  card.particle.speedMax = 1;
  card.physics.gravity = 0.25;
  const gpuCard = JSON.parse(JSON.stringify(card));
  gpuCard.id = 'gpu-preview-emitter';
  gpuCard.useGPU = true;
  gpuCard.emitter.offset = { x: 0, y: 10, z: 0 };
  project.emitters.push(gpuCard);
  project.commandQueues = [{
    id: 'cpu-preview-queue',
    name: 'CPU',
    signs: [],
    commands: [{
      id: 'cpu-add-x', enabled: true, tick: 0, type: 'velocity_add', label: 'CPU X',
      params: { deltaX: 1, deltaY: 0, deltaZ: 0 }
    }]
  }];
  project.forceCommands = [{
    id: 'gpu-gravity', enabled: true, label: 'GPU gravity',
    force: { type: 'Gravity', parameters: { accelX: 0, accelY: -0.5, accelZ: 0 } },
    selector: { type: 'All' }
  }];

  const runtime = createGeneratorPreviewRuntime();
  runtime.step(project, 1);
  const snapshot = runtime.snapshotRenderData(project);

  assert.equal(snapshot.count, 2);
  assert.ok(Math.abs(snapshot.positions[0] - 1) < 1e-6);
  assert.ok(Math.abs(snapshot.positions[1] - 0.75) < 1e-6);
  assert.ok(Math.abs(snapshot.positions[3]) < 1e-6);
  assert.ok(Math.abs(snapshot.positions[4] - 10.5) < 1e-6);
});

test('generator preview simulates every legacy analytical CParticle Force', () => {
  const envDrag = simulateCParticleForce('EnvDrag', { airDensity: 400000 }, {
    velocity: { x: 1, y: 0, z: 0 }
  });
  assertPreviewPosition(envDrag, [0, 0, 0]);

  const expDrag = simulateCParticleForce('ExpDrag', {
    damping: Math.log(2),
    minSpeed: 0,
    linear: 0
  }, { velocity: { x: 1, y: 0, z: 0 } });
  assertPreviewPosition(expDrag, [0.5, 0, 0]);

  const wind = simulateCParticleForce('Wind', {
    windX: 2,
    windY: 0,
    windZ: 0,
    airDensity: 400000,
    rangeMode: 0
  });
  assertPreviewPosition(wind, [4, 0, 0]);

  const vortex = simulateCParticleForce('Vortex', {
    centerX: 0,
    centerY: 0,
    centerZ: 0,
    axisX: 0,
    axisY: 1,
    axisZ: 0,
    swirlStrength: 1,
    radialPull: 0,
    axialLift: 0,
    range: 1,
    falloffPower: 1,
    minDistance: 0
  }, { position: { x: 1, y: 0, z: 0 } });
  assertPreviewPosition(vortex, [1, 0, -0.5]);

  const attraction = simulateCParticleForce('Attraction', {
    targetX: 0,
    targetY: 0,
    targetZ: 0,
    strength: 1,
    range: 1,
    falloffPower: 1,
    minDistance: 0
  }, { position: { x: 1, y: 0, z: 0 } });
  assertPreviewPosition(attraction, [0.5, 0, 0]);

  const rotation = simulateCParticleForce('RotationForce', {
    centerX: 0,
    centerY: 0,
    centerZ: 0,
    axisX: 0,
    axisY: 1,
    axisZ: 0,
    strength: 1,
    range: 1,
    falloffPower: 1
  }, { position: { x: 1, y: 0, z: 0 } });
  assertPreviewPosition(rotation, [1, 0, -0.5]);

  const noise = simulateCParticleForce('Noise', {
    strength: 1,
    frequency: 0.35,
    speed: 0.02,
    clampSpeed: 2,
    affectY: 1,
    useLifeCurve: false,
    seedOffset: 0
  }, { position: { x: 1, y: 2, z: 3 } });
  assert.equal(noise.count, 1);
  assert.ok(
    Math.abs(noise.positions[0] - 1) > 1e-6
      || Math.abs(noise.positions[1] - 2) > 1e-6
      || Math.abs(noise.positions[2] - 3) > 1e-6
  );

  const flowField = simulateCParticleForce('FlowField', {
    amplitude: 2,
    frequency: 0,
    timeScale: 0,
    phaseOffset: 0,
    worldOffsetX: 0,
    worldOffsetY: 0,
    worldOffsetZ: 0
  });
  assertPreviewPosition(flowField, [1, 1, 1]);
});

test('generator preview applies Sign, CommandMask, and runtime Source selectors', () => {
  const { project, card } = createFixture();
  card.emitter.type = 'point';
  card.emitter.offset = { x: 0, y: 0, z: 0 };
  card.particle.velocity = { x: 0, y: 1, z: 0 };
  card.particle.velocityRandom = { x: 0, y: 0, z: 0 };
  card.particle.speedMin = 1;
  card.particle.speedMax = 1;
  card.useGPU = true;
  card.gpu.signRef = 'sign-smoke';
  card.gpu.commandMaskRefs = ['mask-wind'];

  const second = JSON.parse(JSON.stringify(card));
  second.id = 'gpu-selector-second';
  second.emitter.offset = { x: 0, y: 10, z: 0 };
  second.gpu.signRef = 'sign-spark';
  second.gpu.commandMaskRefs = ['mask-heat'];
  project.emitters.push(second);
  project.signs = [
    { id: 'sign-smoke', name: 'smoke', value: 2 },
    { id: 'sign-spark', name: 'spark', value: 4 }
  ];
  project.commandMasks = [
    { id: 'mask-wind', name: 'wind', value: 1 },
    { id: 'mask-heat', name: 'heat', value: 2 }
  ];
  project.forceCommands = [
    {
      id: 'sign-force', enabled: true, label: 'sign force',
      force: { type: 'Gravity', parameters: { accelX: 1, accelY: 0, accelZ: 0 } },
      selector: { type: 'SignEquals', signRef: 'sign-smoke' }
    },
    {
      id: 'mask-force', enabled: true, label: 'mask force',
      force: { type: 'Gravity', parameters: { accelX: 0, accelY: 0, accelZ: 2 } },
      selector: { type: 'CommandMask', commandMaskRefs: ['mask-heat'] }
    },
    {
      id: 'source-force', enabled: true, label: 'source force',
      force: { type: 'Gravity', parameters: { accelX: 0, accelY: -0.5, accelZ: 0 } },
      selector: { type: 'SourceEquals', sourceId: 1 }
    }
  ];

  const runtime = createGeneratorPreviewRuntime();
  runtime.step(project, 1);
  const snapshot = runtime.snapshotRenderData(project);

  assert.equal(snapshot.count, 2);
  assert.ok(Math.abs(snapshot.positions[0] - 1) < 1e-6);
  assert.ok(Math.abs(snapshot.positions[1] - 1) < 1e-6);
  assert.ok(Math.abs(snapshot.positions[2]) < 1e-6);
  assert.ok(Math.abs(snapshot.positions[3]) < 1e-6);
  assert.ok(Math.abs(snapshot.positions[4] - 10.5) < 1e-6);
  assert.ok(Math.abs(snapshot.positions[5] - 2) < 1e-6);
});

test('generator preview simulates Radial, DirectionalWind, and BlenderVortex forces', () => {
  const fullStrengthFalloff = {
    minDistance: 0,
    maxDistance: null,
    power: 0,
    shape: 'SPHERE',
    zDirection: 'BOTH',
    falloffAxisX: 0,
    falloffAxisY: 0,
    falloffAxisZ: 1
  };
  const radial = simulateCParticleForce('Radial', {
    centerX: 0,
    centerY: 0,
    centerZ: 0,
    strength: 2,
    inverseSquare: false,
    ...fullStrengthFalloff
  }, { position: { x: 1, y: 0, z: 0 } });
  assertPreviewPosition(radial, [3, 0, 0]);

  const wind = simulateCParticleForce('DirectionalWind', {
    centerX: 0,
    centerY: 0,
    centerZ: 0,
    axisX: 0,
    axisY: 1,
    axisZ: 0,
    strength: 2,
    ...fullStrengthFalloff
  });
  assertPreviewPosition(wind, [0, 2, 0]);

  const vortex = simulateCParticleForce('BlenderVortex', {
    centerX: 0,
    centerY: 0,
    centerZ: 0,
    axisX: 0,
    axisY: 1,
    axisZ: 0,
    tangentialStrength: 1,
    radialStrength: 0,
    velocityCompensation: 0,
    ...fullStrengthFalloff
  }, { position: { x: 1, y: 0, z: 0 } });
  assertPreviewPosition(vortex, [1, 0, -1]);
});

test('generator preview simulates Magnetic, Harmonic, and VelocityDrag forces', () => {
  const fullStrengthFalloff = {
    minDistance: 0,
    maxDistance: null,
    power: 0,
    shape: 'SPHERE',
    zDirection: 'BOTH'
  };
  const magnetic = simulateCParticleForce('Magnetic', {
    centerX: 0,
    centerY: 0,
    centerZ: 0,
    axisX: 0,
    axisY: 1,
    axisZ: 0,
    strength: 1,
    fieldMode: 'LINE',
    ...fullStrengthFalloff
  }, {
    position: { x: 1, y: 0, z: 0 },
    velocity: { x: 0, y: 1, z: 0 }
  });
  assertPreviewPosition(magnetic, [0, 1, 0]);

  const harmonic = simulateCParticleForce('Harmonic', {
    centerX: 0,
    centerY: 0,
    centerZ: 0,
    stiffness: 1,
    damping: 0,
    restLength: 1,
    ...fullStrengthFalloff,
    falloffAxisX: 0,
    falloffAxisY: 0,
    falloffAxisZ: 1
  }, { position: { x: 2, y: 0, z: 0 } });
  assertPreviewPosition(harmonic, [1, 0, 0]);

  const drag = simulateCParticleForce('VelocityDrag', {
    strength: 0,
    damping: 0.25,
    exact: true,
    ...fullStrengthFalloff,
    falloffAxisX: 0,
    falloffAxisY: 0,
    falloffAxisZ: 1
  }, { velocity: { x: 1, y: 0, z: 0 } });
  assertPreviewPosition(drag, [0.75, 0, 0]);
});

test('generator preview simulates Charge, LennardJones, and Turbulence forces', () => {
  const fullStrengthFalloff = {
    minDistance: 0,
    maxDistance: null,
    power: 0,
    shape: 'SPHERE',
    zDirection: 'BOTH',
    falloffAxisX: 0,
    falloffAxisY: 0,
    falloffAxisZ: 1
  };
  const charge = simulateCParticleForce('Charge', {
    centerX: 0,
    centerY: 0,
    centerZ: 0,
    strength: 1,
    defaultCharge: 0,
    ...fullStrengthFalloff
  }, {
    position: { x: 1, y: 0, z: 0 },
    charge: 2
  });
  assertPreviewPosition(charge, [3, 0, 0]);

  const defaultCharge = simulateCParticleForce('Charge', {
    centerX: 0,
    centerY: 0,
    centerZ: 0,
    strength: 1,
    defaultCharge: 3,
    ...fullStrengthFalloff
  }, {
    position: { x: 1, y: 0, z: 0 },
    charge: null
  });
  assertPreviewPosition(defaultCharge, [4, 0, 0]);

  const lennardJones = simulateCParticleForce('LennardJones', {
    centerX: 0,
    centerY: 0,
    centerZ: 0,
    strength: 1,
    sourceRadius: 1,
    ...fullStrengthFalloff
  }, { position: { x: 2, y: 0, z: 0 } });
  assert.equal(lennardJones.count, 1);
  assert.ok(lennardJones.positions[0] < 2);

  const turbulence = simulateCParticleForce('Turbulence', {
    strength: 1,
    size: 1,
    seed: 7,
    timeScale: 0,
    ...fullStrengthFalloff
  }, { position: { x: 1, y: 2, z: 3 } });
  assert.equal(turbulence.count, 1);
  assert.ok(
    Math.abs(turbulence.positions[0] - 1) > 1e-6
      || Math.abs(turbulence.positions[1] - 2) > 1e-6
      || Math.abs(turbulence.positions[2] - 3) > 1e-6
  );
});

test('generator preview warns when resource Force data is unavailable', () => {
  const { project, card } = createFixture();
  card.useGPU = true;
  project.forceCommands = [
    {
      id: 'texture-preview',
      enabled: true,
      label: 'texture preview',
      force: { type: 'Texture', parameters: {} },
      selector: { type: 'All' }
    },
    {
      id: 'fluid-preview',
      enabled: true,
      label: 'fluid preview',
      force: { type: 'FluidFlow', parameters: {} },
      selector: { type: 'All' }
    }
  ];

  const runtime = createGeneratorPreviewRuntime();
  runtime.step(project, 1);
  const snapshot = runtime.snapshotRenderData(project);

  assert.deepEqual(snapshot.errors, []);
  assert.deepEqual(
    new Set(snapshot.warnings.map((warning) => warning.message)),
    new Set([
      'Texture 需要上传可采样纹理才能在 Web 预览中模拟；Kotlin 仍按声明的 ResourceLocation 生成。',
      'FluidFlow 需要客户端注册三维资源绑定；Web 预览不会用二维纹理伪造流场。'
    ])
  );
});

test('generator preview samples an uploaded Texture resource', () => {
  const { project, card } = createFixture();
  card.useGPU = true;
  card.emitter.type = 'point';
  card.emitter.offset = { x: 0, y: 0, z: 0 };
  card.emission.mode = 'once';
  card.particle.lifeMin = 100;
  card.particle.lifeMax = 100;
  card.particle.velocity = { x: 0, y: 0, z: 0 };
  card.particle.velocityRandom = { x: 0, y: 0, z: 0 };
  card.particle.speedMin = 0;
  card.particle.speedMax = 0;
  const resource = {
    id: 'uploaded-texture',
    name: 'uploaded texture',
    kind: 'texture',
    location: 'examplemod:textures/force/uploaded.png',
    dataUrl: 'data:image/png;base64,preview'
  };
  project.forceResources = [resource];
  project.forceCommands = [{
    id: 'texture-preview',
    enabled: true,
    label: 'texture preview',
    force: {
      type: 'Texture',
      parameters: {
        resourceRef: resource.id,
        strength: 1,
        mode: 'VECTOR',
        minDistance: 0,
        maxDistance: null,
        power: 0,
        shape: 'SPHERE',
        zDirection: 'BOTH'
      }
    },
    selector: { type: 'All' }
  }];
  setCParticleTexturePreview(resource, {
    width: 1,
    height: 1,
    pixels: new Uint8ClampedArray([255, 0, 0, 255])
  });

  const runtime = createGeneratorPreviewRuntime();
  runtime.step(project, 1);
  const snapshot = runtime.snapshotRenderData(project);

  assert.deepEqual(snapshot.warnings, []);
  assertPreviewPosition(snapshot, [1, -1, -1]);
});

test('generator preview uses the first gravity setting for duplicate data signs', () => {
  const { project, card } = createFixture();
  card.emitter.type = 'point';
  card.emitter.offset = { x: 0, y: 0, z: 0 };
  card.particle.velocity = { x: 0, y: 1, z: 0 };
  card.particle.velocityRandom = { x: 0, y: 0, z: 0 };
  card.particle.speedMin = 1;
  card.particle.speedMax = 1;
  card.render.sign = 3;
  card.physics.gravity = 0.25;
  project.emitters.push({
    ...card,
    id: 'duplicate-sign-preview',
    emitter: { ...card.emitter, offset: { x: 0, y: 10, z: 0 } },
    physics: { ...card.physics, gravity: 0.5 }
  });

  const runtime = createGeneratorPreviewRuntime();
  runtime.step(project, 1);
  const snapshot = runtime.snapshotRenderData(project);

  assert.equal(snapshot.count, 2);
  assert.ok(Math.abs(snapshot.positions[1] - 0.75) < 1e-6);
  assert.ok(Math.abs(snapshot.positions[4] - 10.75) < 1e-6);
});

test('generator render cache keeps repeated 30K snapshots bounded', () => {
  const { project, card } = createFixture(30000);
  card.particle.lifeMin = 40;
  card.particle.lifeMax = 120;
  const runtime = createGeneratorPreviewRuntime();
  runtime.step(project, 1);

  runtime.snapshotRenderData(project);
  const startedAt = performance.now();
  const repeated = runtime.snapshotRenderData(project);
  const elapsed = performance.now() - startedAt;

  assert.equal(repeated.count, 30000);
  assert.ok(elapsed < 250, `expected cached snapshot under 250ms, received ${elapsed.toFixed(1)}ms`);
});

test('generator render cache uses a bounded sparse path for very long lifetimes', () => {
  const { project, card } = createFixture();
  card.particle.lifeMin = 100000;
  card.particle.lifeMax = 100000;
  const runtime = createGeneratorPreviewRuntime();

  runtime.step(project, 1);
  const data = runtime.snapshotRenderData(project);

  assert.equal(data.count, 1);
  assert.ok(Number.isFinite(data.sizes[0]));
  assert.ok(Number.isFinite(data.alphas[0]));
});

test('generator PointsBuilder shape cache invalidates when parameter defaults change', () => {
  const { project, card } = createFixture();
  card.emitter.type = 'points_builder';
  card.particle.velocity = { x: 0, y: 0, z: 0 };
  card.particle.velocityRandom = { x: 0, y: 0, z: 0 };
  project.parameters = {
    variables: [{ name: 'radius', type: 'Double', value: 2 }],
    constants: [{ name: 'segments', type: 'Int', value: 8 }]
  };
  card.emitter.builderState.state.root.children = [{
    id: 'parameterized-circle',
    kind: 'add_circle',
    params: { r: 'radius', count: 'segments' },
    children: [],
    terms: []
  }];

  const runtime = createGeneratorPreviewRuntime();
  runtime.step(project, 1);
  const first = runtime.snapshotRenderData(project);
  assert.ok(Math.abs(Math.hypot(first.positions[0], first.positions[2]) - 2) < 1e-5);

  project.parameters.variables[0].value = 4;
  runtime.step(project, 1);
  const second = runtime.snapshotRenderData(project);
  const last = (second.count - 1) * 3;
  assert.ok(Math.abs(Math.hypot(second.positions[last], second.positions[last + 2]) - 4) < 1e-5);
});

test('generator resolves a PointsBuilder shape once per emitter tick', () => {
  const { project, card } = createFixture(250);
  card.emitter.type = 'points_builder';
  card.particle.lifeMin = 20;
  card.particle.lifeMax = 20;
  let signatureReads = 0;
  Object.defineProperty(project.parameters, 'signatureProbe', {
    configurable: true,
    enumerable: true,
    get() {
      signatureReads += 1;
      return 'probe';
    }
  });

  const runtime = createGeneratorPreviewRuntime();
  runtime.step(project, 1);

  assert.equal(runtime.getParticleCount(), 250);
  assert.equal(signatureReads, 1);
});

test('generator re-arms once emission after switching modes', () => {
  const { project, card } = createFixture();
  card.emission.mode = 'once';
  card.particle.lifeMin = 100;
  card.particle.lifeMax = 100;
  const runtime = createGeneratorPreviewRuntime();

  runtime.step(project, 1);
  assert.equal(runtime.getParticleCount(), 1);

  runtime.clearParticles();
  runtime.step(project, 1);
  assert.equal(runtime.getParticleCount(), 0);

  card.emission.mode = 'continuous';
  runtime.step(project, 1);
  runtime.clearParticles();
  card.emission.mode = 'once';
  runtime.step(project, 1);

  assert.equal(runtime.getParticleCount(), 1);
});

test('generator reset replays once emission from the beginning', () => {
  const { project, card } = createFixture();
  card.emission.mode = 'once';
  card.particle.lifeMin = 100;
  card.particle.lifeMax = 100;
  const runtime = createGeneratorPreviewRuntime();

  runtime.step(project, 1);
  assert.equal(runtime.getParticleCount(), 1);

  runtime.clearParticles();
  runtime.step(project, 1);
  assert.equal(runtime.getParticleCount(), 0);

  runtime.reset();
  runtime.step(project, 1);
  assert.equal(runtime.getParticleCount(), 1);
  assert.equal(runtime.getTick(), 1);
});

test('generator emission window includes both configured Tick boundaries', () => {
  const { project, card } = createFixture();
  card.emission.mode = 'continuous';
  card.emission.startTick = 2;
  card.emission.endTick = 3;
  card.particle.lifeMin = 100;
  card.particle.lifeMax = 100;
  const runtime = createGeneratorPreviewRuntime();

  runtime.step(project, 2);
  assert.equal(runtime.getParticleCount(), 0);

  runtime.step(project, 1);
  assert.equal(runtime.getParticleCount(), 1);

  runtime.step(project, 1);
  assert.equal(runtime.getParticleCount(), 2);

  runtime.step(project, 1);
  assert.equal(runtime.getParticleCount(), 2);
});

test('generator restarts the burst cycle after switching modes', () => {
  const { project, card } = createFixture();
  card.emission.mode = 'burst';
  card.emission.burstInterval = 4;
  card.particle.lifeMin = 100;
  card.particle.lifeMax = 100;
  const runtime = createGeneratorPreviewRuntime();

  runtime.step(project, 1);
  assert.equal(runtime.getParticleCount(), 1);

  runtime.clearParticles();
  runtime.step(project, 2);
  assert.equal(runtime.getParticleCount(), 0);

  card.emission.mode = 'continuous';
  runtime.step(project, 1);
  runtime.clearParticles();
  card.emission.mode = 'burst';
  runtime.step(project, 1);

  assert.equal(runtime.getParticleCount(), 1);
});

test('generator preview resolves exact vector bindings and preserves fallback errors', () => {
  const { project, card } = createFixture();
  card.emitter.type = 'point';
  card.particle.velocity = { x: 1, y: 0, z: 0 };
  card.particle.velocityRandom = { x: 0, y: 0, z: 0 };
  card.particle.speedMin = 1;
  card.particle.speedMax = 1;
  project.parameters = {
    variables: [
      { name: 'velocityValue', type: 'Vec3', value: [0, 3, 4] },
      { name: 'velocityValue', type: 'RelativeLocation', value: [1, 2, 3] }
    ],
    constants: [{ name: 'velocityValue', type: 'Double', value: 9 }]
  };
  card.bindings['particle.velocity'] = 'velocityValue';

  const runtime = createGeneratorPreviewRuntime();
  runtime.step(project, 1);
  let preview = runtime.snapshotRenderData(project);
  assert.deepEqual(Array.from(preview.positions.slice(0, 3)), [0, 0.6000000238418579, 0.800000011920929]);
  assert.deepEqual(preview.errors, []);

  project.parameters.variables[0].type = 'RelativeLocation';
  runtime.reset();
  runtime.step(project, 1);
  preview = runtime.snapshotRenderData(project);
  assert.deepEqual(Array.from(preview.positions.slice(0, 3)), [1, 0, 0]);
  assert.match(preview.errors[0]?.message || '', /velocityValue 类型是 RelativeLocation，不适用于这里，已使用默认值/);

  card.bindings['particle.velocity'] = 'missingVelocity';
  runtime.reset();
  runtime.step(project, 1);
  preview = runtime.snapshotRenderData(project);
  assert.deepEqual(Array.from(preview.positions.slice(0, 3)), [1, 0, 0]);
  assert.match(preview.errors[0]?.message || '', /未找到变量 missingVelocity，已使用默认值/);
});
