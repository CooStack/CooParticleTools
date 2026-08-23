import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import test from 'node:test';

import { createGeneratorProject } from '../src/modules/generator/defaults.js';
import { sampleLifecycleCurve } from '../src/modules/generator/curves.js';
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

test('disabled color curve previews CPU random color while GPU keeps the left color', () => {
  const { project, card } = createFixture();
  card.emitter.type = 'point';
  card.particle.colorStart = '#000000';
  card.particle.colorEnd = '#ff0000';
  card.curves.color.enabled = false;
  const originalRandom = Math.random;
  Math.random = () => 0.5;
  try {
    const cpuRuntime = createGeneratorPreviewRuntime();
    cpuRuntime.step(project, 1);
    const cpuSnapshot = cpuRuntime.snapshotRenderData(project);
    assert.ok(Math.abs(cpuSnapshot.colors[0] - 0.5) < 1e-6);
    assert.equal(cpuSnapshot.colors[1], 0);
    assert.equal(cpuSnapshot.colors[2], 0);

    card.useGPU = true;
    const gpuRuntime = createGeneratorPreviewRuntime();
    gpuRuntime.step(project, 1);
    const gpuSnapshot = gpuRuntime.snapshotRenderData(project);
    assert.equal(gpuSnapshot.colors[0], 0);
    assert.equal(gpuSnapshot.colors[1], 0);
    assert.equal(gpuSnapshot.colors[2], 0);
  } finally {
    Math.random = originalRandom;
  }
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

test('generator preview separates CPU queues from shared GPU Commands', () => {
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
  project.gpuCommands = [{
    id: 'gpu-gravity', enabled: true, tick: 12, type: 'gravity', label: 'GPU gravity',
    params: { gravity: 0.5 }
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
