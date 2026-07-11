import { sampleBezier } from '../bezier/curve.js';
import { evaluatePointsProject } from '../pointsbuilder/evaluator.js';
import { createCompositionExpressionRuntime } from './expression-runtime.js';
import { normalizeCompositionProject } from './normalizer.js';

function clamp01(value) {
  return Math.max(0, Math.min(1, Number(value || 0)));
}

function toVector(value = { x: 0, y: 0, z: 0 }) {
  return {
    x: Number(value.x || 0),
    y: Number(value.y || 0),
    z: Number(value.z || 0)
  };
}

function addVector(left = { x: 0, y: 0, z: 0 }, right = { x: 0, y: 0, z: 0 }) {
  return {
    x: Number(left.x || 0) + Number(right.x || 0),
    y: Number(left.y || 0) + Number(right.y || 0),
    z: Number(left.z || 0) + Number(right.z || 0)
  };
}

function subtractVector(left = { x: 0, y: 0, z: 0 }, right = { x: 0, y: 0, z: 0 }) {
  return {
    x: Number(left.x || 0) - Number(right.x || 0),
    y: Number(left.y || 0) - Number(right.y || 0),
    z: Number(left.z || 0) - Number(right.z || 0)
  };
}

function scaleVector(vector = { x: 0, y: 0, z: 0 }, scalar = 1) {
  return {
    x: Number(vector.x || 0) * scalar,
    y: Number(vector.y || 0) * scalar,
    z: Number(vector.z || 0) * scalar
  };
}

function dotVector(left, right) {
  return Number(left.x || 0) * Number(right.x || 0)
    + Number(left.y || 0) * Number(right.y || 0)
    + Number(left.z || 0) * Number(right.z || 0);
}

function crossVector(left, right) {
  return {
    x: Number(left.y || 0) * Number(right.z || 0) - Number(left.z || 0) * Number(right.y || 0),
    y: Number(left.z || 0) * Number(right.x || 0) - Number(left.x || 0) * Number(right.z || 0),
    z: Number(left.x || 0) * Number(right.y || 0) - Number(left.y || 0) * Number(right.x || 0)
  };
}

function vectorLength(vector) {
  return Math.sqrt(dotVector(vector, vector));
}

function normalizeVector(vector, fallback = { x: 0, y: 1, z: 0 }) {
  const length = vectorLength(vector);
  if (length <= 1e-6) return { ...fallback };
  return {
    x: vector.x / length,
    y: vector.y / length,
    z: vector.z / length
  };
}

function rotateAroundAxis(point, axis, angle) {
  const unitAxis = normalizeVector(axis);
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const term1 = scaleVector(point, cos);
  const term2 = scaleVector(crossVector(unitAxis, point), sin);
  const term3 = scaleVector(unitAxis, dotVector(unitAxis, point) * (1 - cos));
  return addVector(addVector(term1, term2), term3);
}

function angleToRad(value, unit = 'rad') {
  const numeric = Number(value || 0);
  if (unit === 'deg') return numeric * Math.PI / 180;
  return numeric;
}

function scaleAtProgress(scaleHelper, progress) {
  const helper = scaleHelper || {};
  const t = clamp01(progress);
  if (helper.type === 'bezier') {
    const curve = sampleBezier(helper.p1 || { x: 0.2, y: 0.8 }, helper.p2 || { x: 0.35, y: 1 }, 48);
    const hit = curve.reduce((best, point) => {
      const score = Math.abs(point.x - t);
      if (!best || score < best.score) return { score, point };
      return best;
    }, null);
    return Number(hit?.point?.y ?? t);
  }
  const from = Number.isFinite(Number(helper.from)) ? Number(helper.from) : 0.2;
  const to = Number.isFinite(Number(helper.to)) ? Number(helper.to) : 1;
  return from + (to - from) * t;
}

function getSourcePoints(owner) {
  if (owner?.bindMode === 'point') {
    return [{ ...(owner?.point || { x: 0, y: 0, z: 0 }) }];
  }
  return evaluatePointsProject(owner?.builderState || {});
}

function transformPoints(points, scale, offset, meta) {
  return points.map((point, index) => ({
    x: Number(point.x || 0) * scale + offset.x,
    y: Number(point.y || 0) * scale + offset.y,
    z: Number(point.z || 0) * scale + offset.z,
    __index: index,
    __cardId: meta.id,
    __cardName: meta.name,
    __particleEffect: meta.particleEffect
  }));
}

function resolveAngleOffsetTotalAngle(runtime, cfg, scope) {
  if (!cfg || cfg.enabled !== true || Math.max(1, Number(cfg.count || 1)) <= 1) return 0;
  if (cfg.angleMode === 'expr') {
    return angleToRad(runtime.evaluateNumeric(cfg.angleExpr || '0', scope, 0), 'rad');
  }
  return angleToRad(cfg.angleValue || 0, cfg.angleUnit || 'deg');
}

function applyAngleOffset(points, cfg, runtime, scope, axis) {
  if (!cfg || cfg.enabled !== true) return points;
  const count = Math.max(1, Math.round(Number(cfg.count || 1)));
  if (count <= 1) return points;
  const totalAngle = resolveAngleOffsetTotalAngle(runtime, cfg, scope);
  const progress = clamp01(Number(scope?.age || 0) / Math.max(1, Number(cfg.glowTick || 20)));
  const currentTotalAngle = totalAngle * progress;
  const out = [];
  points.forEach((point) => {
    for (let repeatIndex = 0; repeatIndex < count; repeatIndex += 1) {
      const angle = currentTotalAngle * repeatIndex / count;
      const rotated = rotateAroundAxis(point, axis, angle);
      out.push({
        ...point,
        ...rotated,
        __repeatIndex: repeatIndex
      });
    }
  });
  return out;
}

function resolveGrowthVisibleLimit(animates, runtime, scope, totalCount, defaultAll = true) {
  const safeTotal = Math.max(0, Math.round(Number(totalCount || 0)));
  if (!Array.isArray(animates) || !animates.length) {
    return defaultAll ? safeTotal : 0;
  }
  let visible = 0;
  animates.forEach((item, index) => {
    const enabled = runtime.evaluateBoolean(item.condition || 'true', { ...scope, index }, true);
    if (enabled) {
      visible += Math.max(1, Math.round(Number(item.count || 1)));
    }
  });
  return Math.max(0, Math.min(safeTotal, visible));
}

function collectShapeNodePoints({ card, node, parentPoints, runtime, time, age, parentAxis, cardIndex, path = [] }) {
  if (!node) return [];
  const localPoints = getSourcePoints(node);
  const scaleProgress = age / Math.max(1, Number(node.scale?.duration || card.duration || 1));
  const localScale = scaleAtProgress(node.scale, scaleProgress);
  const nodeAxis = normalizeVector(
    runtime.resolveRelativeTarget(node.axisExpr || node.axisPreset || 'RelativeLocation.yAxis()', {
      age,
      tick: time,
      tickCount: time,
      index: cardIndex,
      count: parentPoints.length || 1,
      duration: Math.max(1, Number(card.duration || 1)),
      axis: parentAxis
    }, {
      x: Number(node.axisManualX || 0),
      y: Number(node.axisManualY || 1),
      z: Number(node.axisManualZ || 0)
    }),
    parentAxis
  );
  const meta = {
    id: card.id,
    name: `${card.name}/${node.name || `子节点 ${path[path.length - 1] ?? 0}`}`,
    particleEffect: node.effectClass || card.particleEffect
  };
  const emitted = [];

  const parentLimit = node.type === 'sequenced_shape'
    ? resolveGrowthVisibleLimit(node.growthAnimates || [], runtime, {
      age,
      tick: time,
      tickCount: time,
      index: cardIndex,
      count: parentPoints.length,
      duration: Math.max(1, Number(card.duration || 1)),
      axis: nodeAxis
    }, parentPoints.length, true)
    : parentPoints.length;

  parentPoints.slice(0, parentLimit).forEach((parentPoint, parentIndex) => {
    const scope = {
      age,
      tick: time,
      tickCount: time,
      index: parentIndex,
      count: parentPoints.length,
      duration: Math.max(1, Number(card.duration || 1)),
      axis: nodeAxis,
      point: parentPoint
    };
    const transformed = transformPoints(localPoints, localScale, toVector(parentPoint), meta);
    const actioned = applyDisplayActions(transformed, node.displayActions || [], runtime, time, nodeAxis);
    const angled = applyAngleOffset(actioned, node.angleOffset, runtime, scope, nodeAxis);

    if (node.type === 'single' || !(node.children || []).length) {
      emitted.push(...angled);
    }

    (node.children || []).forEach((child, childIndex) => {
      emitted.push(...collectShapeNodePoints({
        card,
        node: child,
        parentPoints: angled,
        runtime,
        time,
        age,
        parentAxis: nodeAxis,
        cardIndex,
        path: [...path, childIndex]
      }));
    });
  });

  return emitted;
}

function computeVisibleCardCount(project, runtime, tick) {
  if (project.compositionType !== 'sequenced') return project.cards.length;
  const animates = Array.isArray(project.compositionAnimates) ? project.compositionAnimates : [];
  if (!animates.length) return project.cards.length;
  const total = animates.reduce((sum, item, index) => {
    const visible = runtime.evaluateBoolean(item.condition || 'true', {
      age: tick,
      tick,
      tickCount: tick,
      index
    }, true);
    return visible ? sum + Math.max(1, Number(item.count || 1)) : sum;
  }, 0);
  return Math.max(1, Math.min(project.cards.length, total || project.cards.length));
}

function resolveCompositionAxis(project, runtime, tick = 0) {
  return normalizeVector(
    runtime.resolveRelativeTarget(project.compositionAxisExpr || project.compositionAxisPreset || 'RelativeLocation.yAxis()', {
      age: tick,
      tick,
      tickCount: tick,
      index: 0
    }, {
      x: Number(project.compositionAxisManualX || 0),
      y: Number(project.compositionAxisManualY || 1),
      z: Number(project.compositionAxisManualZ || 0)
    }),
    {
      x: Number(project.compositionAxisManualX || 0),
      y: Number(project.compositionAxisManualY || 1),
      z: Number(project.compositionAxisManualZ || 0)
    }
  );
}

function resolveActionAngle(runtime, action, scope) {
  if (action.angleMode === 'expr') {
    return angleToRad(runtime.evaluateNumeric(action.angleExpr || '0', scope, 0), 'rad');
  }
  return angleToRad(action.angleValue || 0, action.angleUnit || 'rad');
}

function applyDisplayAction(point, action, runtime, scope, fallbackAxis) {
  let next = toVector(point);
  if (action.type === 'rotateAsAxis') {
    const angle = resolveActionAngle(runtime, action, scope);
    return rotateAroundAxis(next, fallbackAxis, angle);
  }

  const target = runtime.resolveRelativeTarget(
    action.toExpr || action.toPreset || 'RelativeLocation.yAxis()',
    scope,
    {
      x: Number(action.toManualX || 0),
      y: Number(action.toManualY || 1),
      z: Number(action.toManualZ || 0)
    }
  );

  if (action.type === 'rotateToPoint') {
    next = addVector(next, target);
  } else if (action.type === 'rotateToWithAngle') {
    const angle = resolveActionAngle(runtime, action, scope);
    next = rotateAroundAxis(next, normalizeVector(target, fallbackAxis), angle);
  }

  const extra = String(action.expression || '').trim();
  if (extra) {
    const result = runtime.evaluate(extra, scope, null);
    if (result && typeof result === 'object') {
      next = addVector(next, toVector(result));
    }
  }
  return next;
}

function applyDisplayActions(points, actions, runtime, tick, compositionAxis) {
  if (!Array.isArray(actions) || !actions.length) return points;
  return points.map((point, index) => {
    const scope = {
      age: tick,
      tick,
      tickCount: tick,
      index,
      axis: compositionAxis,
      point,
      count: points.length
    };
    const transformed = actions.reduce((current, action) => applyDisplayAction(current, action, runtime, scope, compositionAxis), point);
    return {
      ...point,
      ...transformed
    };
  });
}

function compileAngleOffsetExpression(runtime, angleOffset, scope, label, state) {
  state.total += 1;
  try {
    if ((angleOffset?.angleMode || 'numeric') === 'expr') {
      runtime.evaluateNumeric(angleOffset?.angleExpr || '0', scope, 0);
    }
  } catch (error) {
    state.errors.push(`${label}: ${error?.message || '表达式错误'}`);
  }
}

function compileDisplayActionExpressions(runtime, actions, scopeFactory, labelPrefix, state) {
  (actions || []).forEach((item, actionIndex) => {
    state.total += 1;
    try {
      const scope = scopeFactory(actionIndex);
      runtime.resolveRelativeTarget(item.toExpr || item.toPreset || 'RelativeLocation.yAxis()', scope, { x: 0, y: 1, z: 0 });
      if (item.angleMode === 'expr') {
        runtime.evaluateNumeric(item.angleExpr || '0', scope, 0);
      }
      if (item.expression) {
        runtime.evaluate(item.expression, scope, 0);
      }
    } catch (error) {
      state.errors.push(`${labelPrefix} #${actionIndex + 1}: ${error?.message || '表达式错误'}`);
    }
  });
}

function compileShapeNodeExpressions(runtime, node, scopeBase, label, state) {
  state.total += 1;
  try {
    runtime.resolveRelativeTarget(node.axisExpr || node.axisPreset || 'RelativeLocation.yAxis()', scopeBase, {
      x: Number(node.axisManualX || 0),
      y: Number(node.axisManualY || 1),
      z: Number(node.axisManualZ || 0)
    });
  } catch (error) {
    state.errors.push(`${label} Axis: ${error?.message || '表达式错误'}`);
  }

  compileDisplayActionExpressions(
    runtime,
    node.displayActions,
    (index) => ({ ...scopeBase, index }),
    `${label} 显示动作`,
    state
  );
  compileAngleOffsetExpression(runtime, node.angleOffset, scopeBase, `${label} 相对角度偏移`, state);

  (node.particleInit || []).forEach((item, itemIndex) => {
    state.total += 1;
    try {
      runtime.evaluate(item.expr || '0', { ...scopeBase, index: itemIndex }, 0);
    } catch (error) {
      state.errors.push(`${label} Particle Init #${itemIndex + 1}: ${error?.message || '表达式错误'}`);
    }
  });

  (node.controllerVars || []).forEach((item, itemIndex) => {
    state.total += 1;
    try {
      runtime.evaluate(item.expr || '0', { ...scopeBase, index: itemIndex }, 0);
    } catch (error) {
      state.errors.push(`${label} 局部变量 #${itemIndex + 1}: ${error?.message || '表达式错误'}`);
    }
  });

  (node.controllerActions || []).forEach((item, itemIndex) => {
    state.total += 1;
    try {
      if (item.script) {
        runtime.evaluate(item.script, { ...scopeBase, index: itemIndex }, 0);
      }
    } catch (error) {
      state.errors.push(`${label} tick action #${itemIndex + 1}: ${error?.message || '表达式错误'}`);
    }
  });

  (node.growthAnimates || []).forEach((item, itemIndex) => {
    state.total += 1;
    try {
      runtime.evaluateBoolean(item.condition || 'true', { ...scopeBase, index: itemIndex }, true);
    } catch (error) {
      state.errors.push(`${label} 生长动画 #${itemIndex + 1}: ${error?.message || '表达式错误'}`);
    }
  });

  (node.children || []).forEach((child, childIndex) => {
    compileShapeNodeExpressions(
      runtime,
      child,
      { ...scopeBase, index: childIndex },
      `${label} / 子节点 ${child.name || childIndex + 1}`,
      state
    );
  });
}

export function compileCompositionExpressions(rawProject = {}) {
  const project = normalizeCompositionProject(rawProject);
  const runtime = createCompositionExpressionRuntime(project);
  const state = { errors: [], total: 0 };

  try {
    runtime.resolveRelativeTarget(project.compositionAxisExpr || project.compositionAxisPreset || 'RelativeLocation.yAxis()', {
      age: 0,
      tick: 0,
      tickCount: 0,
      index: 0
    }, {
      x: Number(project.compositionAxisManualX || 0),
      y: Number(project.compositionAxisManualY || 1),
      z: Number(project.compositionAxisManualZ || 0)
    });
    state.total += 1;
  } catch (error) {
    state.total += 1;
    state.errors.push(`Composition Axis: ${error?.message || '表达式错误'}`);
  }

  project.compositionAnimates.forEach((item, index) => {
    state.total += 1;
    try {
      runtime.evaluateBoolean(item.condition || 'true', { age: 0, tick: 0, tickCount: 0, index }, true);
    } catch (error) {
      state.errors.push(`根动画 #${index + 1}: ${error?.message || '表达式错误'}`);
    }
  });

  compileDisplayActionExpressions(
    runtime,
    project.displayActions,
    (index) => ({ age: 0, tick: 0, tickCount: 0, index }),
    '根显示动作',
    state
  );

  project.cards.forEach((card, cardIndex) => {
    const scopeBase = {
      age: 0,
      tick: 0,
      tickCount: 0,
      index: cardIndex,
      duration: Math.max(1, Number(card.duration || 1)),
      count: 1
    };
    state.total += 1;
    try {
      runtime.resolveRelativeTarget(card.targetPreset || 'root', scopeBase, { x: 0, y: 0, z: 0 });
      runtime.resolveRelativeTarget(card.shapeAxisExpr || card.shapeAxisPreset || 'RelativeLocation.yAxis()', scopeBase, {
        x: Number(card.shapeAxisManualX || 0),
        y: Number(card.shapeAxisManualY || 1),
        z: Number(card.shapeAxisManualZ || 0)
      });
      runtime.evaluateVector(card.script || 'RelativeLocation(0.0, 0.0, 0.0)', scopeBase, { x: 0, y: 0, z: 0 });
    } catch (error) {
      state.errors.push(`卡片 ${card.name || cardIndex + 1}: ${error?.message || '表达式错误'}`);
    }

    (card.particleInit || []).forEach((item, itemIndex) => {
      state.total += 1;
      try {
        runtime.evaluate(item.expr || '0', { ...scopeBase, index: itemIndex }, 0);
      } catch (error) {
        state.errors.push(`卡片 ${card.name || cardIndex + 1} Particle Init #${itemIndex + 1}: ${error?.message || '表达式错误'}`);
      }
    });

    (card.controllerVars || []).forEach((item, itemIndex) => {
      state.total += 1;
      try {
        runtime.evaluate(item.expr || '0', { ...scopeBase, index: itemIndex }, 0);
      } catch (error) {
        state.errors.push(`卡片 ${card.name || cardIndex + 1} 局部变量 #${itemIndex + 1}: ${error?.message || '表达式错误'}`);
      }
    });

    (card.controllerActions || []).forEach((item, itemIndex) => {
      state.total += 1;
      try {
        if (item.script) {
          runtime.evaluate(item.script, { ...scopeBase, index: itemIndex }, 0);
        }
      } catch (error) {
        state.errors.push(`卡片 ${card.name || cardIndex + 1} tick action #${itemIndex + 1}: ${error?.message || '表达式错误'}`);
      }
    });

    (card.growthAnimates || []).forEach((item, itemIndex) => {
      state.total += 1;
      try {
        runtime.evaluateBoolean(item.condition || 'true', { ...scopeBase, index: itemIndex }, true);
      } catch (error) {
        state.errors.push(`卡片 ${card.name || cardIndex + 1} 生长动画 #${itemIndex + 1}: ${error?.message || '表达式错误'}`);
      }
    });

    compileDisplayActionExpressions(
      runtime,
      card.shapeDisplayActions,
      (index) => ({ ...scopeBase, index }),
      `卡片 ${card.name || cardIndex + 1} 形状显示动作`,
      state
    );
    compileAngleOffsetExpression(runtime, card.shapeAngleOffset, scopeBase, `卡片 ${card.name || cardIndex + 1} 相对角度偏移`, state);

    (card.shapeChildren || []).forEach((child, childIndex) => {
      compileShapeNodeExpressions(
        runtime,
        child,
        { ...scopeBase, index: childIndex },
        `卡片 ${card.name || cardIndex + 1} / 子节点 ${child.name || childIndex + 1}`,
        state
      );
    });
  });

  return {
    total: state.total,
    failed: state.errors.length,
    success: Math.max(0, state.total - state.errors.length),
    errors: state.errors
  };
}

export function createCompositionPreviewRuntime(rawProject = {}) {
  const project = normalizeCompositionProject(rawProject);
  const runtime = createCompositionExpressionRuntime(project);
  const duration = Math.max(
    Number(project.previewPlayTicks || 70) + Number(project.disabledInterval || 0),
    ...project.cards.map((card) => Number(card.delay || 0) + Number(card.duration || 0))
  );

  function getFrame(tick = 0) {
    const time = Math.max(0, Number(tick || 0));
    const activeCards = [];
    const visibleCardCount = computeVisibleCardCount(project, runtime, time);
    const compositionAxis = resolveCompositionAxis(project, runtime, time);
    let points = [];

    project.cards.forEach((card, cardIndex) => {
      if (card.visible === false) return;
      if (cardIndex >= visibleCardCount) return;
      const start = Number(card.delay || 0);
      const end = start + Math.max(1, Number(card.duration || 1));
      if (time < start || time > end) return;
      const age = time - start;
      const basePoints = getSourcePoints(card);
      const scaleProgress = age / Math.max(1, Number(card.scaleHelper?.duration || card.duration || 1));
      const scale = scaleAtProgress(card.scaleHelper, scaleProgress);
      const axisScope = {
        age,
        tick: time,
        tickCount: time,
        index: cardIndex,
        count: basePoints.length,
        duration: Math.max(1, Number(card.duration || 1)),
        axis: compositionAxis
      };
      const cardAxis = normalizeVector(
        runtime.resolveRelativeTarget(card.shapeAxisExpr || card.shapeAxisPreset || 'RelativeLocation.yAxis()', axisScope, {
          x: Number(card.shapeAxisManualX || 0),
          y: Number(card.shapeAxisManualY || 1),
          z: Number(card.shapeAxisManualZ || 0)
        }),
        compositionAxis
      );
      const scope = {
        ...axisScope,
        axis: cardAxis
      };
      const presetOffset = runtime.resolveRelativeTarget(card.targetPreset || 'root', scope, { x: 0, y: 0, z: 0 });
      const scriptOffset = runtime.evaluateVector(card.script || 'RelativeLocation(0.0, 0.0, 0.0)', scope, { x: 0, y: 0, z: 0 });
      const offset = addVector(presetOffset, scriptOffset);
      const transformed = transformPoints(basePoints, scale, offset, {
        id: card.id,
        name: card.name,
        particleEffect: card.particleEffect
      });
      let cardPoints = applyDisplayActions(transformed, card.shapeDisplayActions || [], runtime, time, cardAxis);
      cardPoints = applyAngleOffset(cardPoints, card.shapeAngleOffset, runtime, scope, cardAxis);
      if (card.dataType === 'sequenced_shape') {
        const visibleLimit = resolveGrowthVisibleLimit(
          card.growthAnimates || [],
          runtime,
          scope,
          cardPoints.length,
          true
        );
        cardPoints = cardPoints.slice(0, visibleLimit);
      }
      if (card.dataType !== 'single' && (card.shapeChildren || []).length) {
        const treePoints = [];
        (card.shapeChildren || []).forEach((child, childIndex) => {
          treePoints.push(...collectShapeNodePoints({
            card,
            node: child,
            parentPoints: cardPoints,
            runtime,
            time,
            age,
            parentAxis: cardAxis,
            cardIndex,
            path: [childIndex]
          }));
        });
        cardPoints = treePoints.length ? treePoints : cardPoints;
      }
      points.push(...cardPoints);
      activeCards.push({
        id: card.id,
        name: card.name,
        bindMode: card.bindMode,
        pointCount: cardPoints.length,
        particleEffect: card.particleEffect,
        targetPreset: card.targetPreset,
        start,
        end
      });
    });

    points = applyDisplayActions(points, project.displayActions, runtime, time, compositionAxis);

    return {
      tick: time,
      totalTicks: duration,
      previewPlayTicks: Number(project.previewPlayTicks || 70),
      disabledInterval: Number(project.disabledInterval || 0),
      compositionAxis,
      points,
      activeCards,
      pointCount: points.length,
      ended: time >= duration
    };
  }

  return {
    duration,
    getFrame
  };
}
