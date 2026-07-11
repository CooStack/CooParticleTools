import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import test from 'node:test';

import { createGeneratorProject } from '../src/modules/generator/defaults.js';
import { createGeneratorPreviewRuntime } from '../src/modules/generator/preview-simulation.js';

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
  card.particle.colorOverLifeEnabled = true;
  card.render.alpha = 100;
  card.render.light = 15;
  card.curves.size.x.mode = 'linear';
  card.curves.size.y.mode = 'linear';
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
