import { generatePointsBuilderKotlin, generatePointsBuilderKotlinParts } from '../pointsbuilder/codegen.js';
import { createCompositionPreviewRuntime } from './preview-runtime.js';
import { normalizeCompositionProject } from './normalizer.js';

function indentBlock(text, spaces = 4) {
  const prefix = ' '.repeat(spaces);
  return String(text || '').split('\n').map((line) => `${prefix}${line}`).join('\n');
}

function escapeKotlinString(value = '') {
  return String(value).replaceAll('\\', '\\\\').replaceAll('"', '\\"');
}

function pushComment(lines, text, indent = 2) {
  lines.push(`${' '.repeat(indent)}// ${text}`);
}

function formatNumber(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function emitAngleOffsetComments(lines, angleOffset, indent = 2, label = 'angleOffset') {
  if (!angleOffset) return;
  pushComment(
    lines,
    `${label}: enabled=${angleOffset.enabled === true}, count=${Math.max(1, Number(angleOffset.count || 1))}, glowTick=${Math.max(1, Number(angleOffset.glowTick || 20))}, ease=${String(angleOffset.ease || 'outCubic')}`,
    indent
  );
  if ((angleOffset.angleMode || 'numeric') === 'expr') {
    pushComment(lines, `${label}.angleExpr = ${String(angleOffset.angleExpr || 'PI * 2')}`, indent);
  } else {
    pushComment(
      lines,
      `${label}.angle = ${formatNumber(angleOffset.angleValue, 360)} ${String(angleOffset.angleUnit || 'deg')}`,
      indent
    );
  }
  if (angleOffset.reverseOnDisable === true) {
    pushComment(lines, `${label}.reverseOnDisable = true`, indent);
  }
}

export function emitBuilderExprFromState(builderState) {
  return generatePointsBuilderKotlin(builderState);
}

function parseStaticCompositionVector(value) {
  const match = String(value || '').trim().match(/^[A-Za-z0-9_]+\s*\(([^)]+)\)$/);
  if (!match) return undefined;
  const parts = match[1].split(',').slice(0, 3).map((part) => Number(part.trim().replace(/[fFdDlL]$/g, '')));
  return parts.length === 3 && parts.every(Number.isFinite)
    ? { x: parts[0], y: parts[1], z: parts[2] }
    : undefined;
}

function createStaticCompositionReferenceResolver(project) {
  const values = new Map();
  for (const item of [...(project.globalVars || []), ...(project.globalConsts || [])]) {
    if (!values.has(item.name)) values.set(item.name, item);
  }
  return (type, name) => {
    const item = values.get(String(name || '').trim());
    if (!item) return undefined;
    if (type === 'vector') return parseStaticCompositionVector(item.value);
    const numeric = Number(String(item.value ?? '').replace(/[fFdDlL]$/g, ''));
    return Number.isFinite(numeric) ? numeric : undefined;
  };
}

function emitPointsBuilderExpressionParts(parts) {
  const expression = parts?.expression || 'PointsBuilder()';
  const localDeclarations = Array.isArray(parts?.localDeclarations) ? parts.localDeclarations : [];
  if (!localDeclarations.length) return expression;
  return [
    'run {',
    ...localDeclarations.map((line) => indentBlock(line, 2)),
    indentBlock(expression, 2),
    '}'
  ].join('\n');
}

function emitGlobalVar(item) {
  const prefix = item.mutable !== false ? 'var' : 'val';
  return `${prefix} ${item.name}: ${item.type} = ${item.value}`;
}

function emitGlobalConst(item) {
  return `val ${item.name}: ${item.type} = ${item.value}`;
}

function emitRootAnimate(item) {
  const condition = String(item.condition || '').trim() || 'true';
  return `animate(count = ${Math.max(1, Number(item.count || 1))}) { ${condition} }`;
}

function emitDisplayAction(item) {
  const targetExpr = String(item.toExpr || item.toPreset || 'RelativeLocation.yAxis()');
  const lines = [];
  lines.push(`displayAction(type = "${escapeKotlinString(item.type || 'rotateToWithAngle')}") {`);
  lines.push(`  target = ${targetExpr}`);
  if ((item.angleMode || 'numeric') === 'expr') {
    lines.push(`  angle = ${String(item.angleExpr || '0')}`);
  } else {
    lines.push(`  angle = ${formatNumber(item.angleValue, 0)} /* ${String(item.angleUnit || 'rad')} */`);
  }
  if (String(item.expression || '').trim()) {
    lines.push(`  // expression = ${JSON.stringify(String(item.expression || ''))}`);
  }
  lines.push('}');
  return lines.join('\n');
}

function emitScaleHelperComments(lines, scale, indent = 2, label = 'scaleHelper') {
  if (!scale) return;
  pushComment(
    lines,
    `${label}: type=${String(scale.type || 'linear')}, from=${formatNumber(scale.from, 0)}, to=${formatNumber(scale.to, 1)}, duration=${Math.max(1, Number(scale.duration || 1))}`,
    indent
  );
  if (String(scale.type || '') === 'bezier') {
    pushComment(
      lines,
      `${label}.p1 = (${formatNumber(scale.p1?.x, 0)}, ${formatNumber(scale.p1?.y, 0)})`,
      indent
    );
    pushComment(
      lines,
      `${label}.p2 = (${formatNumber(scale.p2?.x, 0)}, ${formatNumber(scale.p2?.y, 0)})`,
      indent
    );
  }
}

function emitShapeNode(node, indent = 4, path = []) {
  const lines = [];
  const label = `shapeNode[${path.join('.') || 'root'}]`;
  pushComment(lines, `${label}: type=${node.type}, name=${JSON.stringify(String(node.name || ''))}`, indent);
  if (node.bindMode === 'point') {
    pushComment(
      lines,
      `${label}.point = (${formatNumber(node.point?.x, 0)}, ${formatNumber(node.point?.y, 0)}, ${formatNumber(node.point?.z, 0)})`,
      indent
    );
  } else {
    pushComment(lines, `${label}.builder = PointsBuilderProject`, indent);
  }
  pushComment(lines, `${label}.axis = ${String(node.axisExpr || node.axisPreset || 'RelativeLocation.yAxis()')}`, indent);
  (node.displayActions || []).forEach((item, index) => {
    lines.push(indentBlock(emitDisplayAction(item), indent));
    pushComment(lines, `${label}.displayActions[${index}]`, indent);
  });
  emitAngleOffsetComments(lines, node.angleOffset, indent, `${label}.angleOffset`);
  emitScaleHelperComments(lines, node.scale, indent, `${label}.scale`);
  if (node.type === 'single') {
    pushComment(lines, `${label}.effectClass = ${String(node.effectClass || 'ControlableEndRodEffect')}`, indent);
    pushComment(lines, `${label}.useTexture = ${node.useTexture !== false}`, indent);
    (node.particleInit || []).forEach((item) => {
      pushComment(lines, `${label}.particleInit(${item.target}) = ${String(item.expr || '0')}`, indent);
    });
    (node.controllerVars || []).forEach((item) => {
      pushComment(lines, `${label}.controllerVar ${item.name}: ${item.type} = ${item.expr}`, indent);
    });
    (node.controllerActions || []).forEach((item) => {
      pushComment(lines, `${label}.controllerAction(${item.type}) = ${JSON.stringify(String(item.script || ''))}`, indent);
    });
  }
  if (node.type === 'sequenced_shape') {
    (node.growthAnimates || []).forEach((item) => {
      pushComment(lines, `${label}.growthAnimate(count=${Math.max(1, Number(item.count || 1))}) { ${item.condition || 'true'} }`, indent);
    });
  }
  (node.children || []).forEach((child, index) => {
    lines.push(...emitShapeNode(child, indent + 2, [...path, index]));
  });
  return lines;
}

function emitCard(card, builderParts = null) {
  const lines = [];
  lines.push(`card("${escapeKotlinString(card.name)}") {`);
  lines.push(`  particleEffect = "${escapeKotlinString(card.particleEffect)}"`);
  lines.push(`  bindMode = "${card.bindMode}"`);
  lines.push(`  dataType = "${card.dataType || 'single'}"`);
  lines.push(`  targetPreset = ${JSON.stringify(card.targetPreset || 'root')}`);
  lines.push(`  delay = ${Number(card.delay || 0)}`);
  lines.push(`  duration = ${Math.max(1, Number(card.duration || 1))}`);
  lines.push(`  visible = ${card.visible !== false}`);
  if (card.dataType === 'single') {
    lines.push(`  singleEffectClass = "${escapeKotlinString(card.singleEffectClass || card.particleEffect || 'ControlableEndRodEffect')}"`);
    lines.push(`  singleUseTexture = ${card.singleUseTexture !== false}`);
    (card.particleInit || []).forEach((item) => {
      pushComment(lines, `particleInit(${item.target}) = ${item.expr || '0'}`);
    });
    (card.controllerVars || []).forEach((item) => {
      pushComment(lines, `controllerVar ${item.name}: ${item.type} = ${item.expr}`);
    });
    (card.controllerActions || []).forEach((item) => {
      pushComment(lines, `controllerAction(${item.type}) = ${JSON.stringify(String(item.script || ''))}`);
    });
  }
  if (card.dataType === 'sequenced_shape') {
    (card.growthAnimates || []).forEach((item) => {
      pushComment(lines, `growthAnimate(count = ${Math.max(1, Number(item.count || 1))}) { ${item.condition || 'true'} }`);
    });
  }
  if (card.bindMode === 'point') {
    lines.push(`  point(${Number(card.point.x || 0)}, ${Number(card.point.y || 0)}, ${Number(card.point.z || 0)})`);
  } else {
    lines.push('  builder {');
    lines.push(indentBlock(
      builderParts ? emitPointsBuilderExpressionParts(builderParts) : generatePointsBuilderKotlin(card.builderState),
      4
    ));
    lines.push('  }');
  }
  pushComment(lines, `shapeAxis = ${String(card.shapeAxisExpr || card.shapeAxisPreset || 'RelativeLocation.yAxis()')}`);
  (card.shapeDisplayActions || []).forEach((item) => {
    lines.push(indentBlock(emitDisplayAction(item), 2));
  });
  emitAngleOffsetComments(lines, card.shapeAngleOffset, 2, 'shapeAngleOffset');
  emitScaleHelperComments(lines, card.scaleHelper, 2, 'scaleHelper');
  if (card.dataType !== 'single') {
    (card.shapeChildren || []).forEach((child, index) => {
      lines.push(...emitShapeNode(child, 2, [index]));
    });
  }
  lines.push(`  script = ${JSON.stringify(String(card.script || ''))}`);
  if (String(card.notes || '').trim()) {
    lines.push(`  notes = ${JSON.stringify(String(card.notes || ''))}`);
  }
  lines.push('}');
  return lines.join('\n');
}

export function collectCompositionPreviewPoints(project, tick = 0) {
  return createCompositionPreviewRuntime(project).getFrame(tick).points;
}

export function generateCompositionKotlin(rawProject) {
  const project = normalizeCompositionProject(rawProject);
  const resolveStaticReference = createStaticCompositionReferenceResolver(project);
  const builderPartsByCard = project.cards.map((card) => (
    card.bindMode === 'point' ? null : generatePointsBuilderKotlinParts(card.builderState, { resolveStaticReference })
  ));
  const builderConstants = Array.from(new Set(
    builderPartsByCard.flatMap((parts) => parts?.constants || [])
  ));
  const builderDeclarations = Array.from(new Map(
    builderPartsByCard
      .flatMap((parts) => parts?.declarations || [])
      .map((declaration) => {
        const match = declaration.match(/^private (val|fun)\s+([A-Za-z_][A-Za-z0-9_]*)/);
        return [match ? `${match[1]}:${match[2]}` : declaration, declaration];
      })
  ).values());
  const lines = [];
  lines.push(`class ${project.name || 'NewComposition'} {`);
  if (builderConstants.length) {
    lines.push('  private companion object {');
    builderConstants.forEach((constant) => lines.push(`    ${constant}`));
    lines.push('  }');
    lines.push('');
  }
  lines.push('  fun build() = composition {');
  lines.push(`    compositionType = "${project.compositionType}"`);
  lines.push(`    previewPlayTicks = ${Number(project.previewPlayTicks || 70)}`);
  lines.push(`    disabledInterval = ${Number(project.disabledInterval || 0)}`);
  lines.push(`    compositionAxis = ${project.compositionAxisExpr || project.compositionAxisPreset || 'RelativeLocation.yAxis()'}`);
  project.globalVars.forEach((item) => {
    lines.push(indentBlock(emitGlobalVar(item), 4));
  });
  project.globalConsts.forEach((item) => {
    lines.push(indentBlock(emitGlobalConst(item), 4));
  });
  builderDeclarations.forEach((declaration) => {
    lines.push(indentBlock(
      declaration
        .replace(/^private val /, 'val ')
        .replace(/^private fun /, 'fun '),
      4
    ));
  });
  project.compositionAnimates.forEach((item) => {
    lines.push(indentBlock(emitRootAnimate(item), 4));
  });
  project.displayActions.forEach((item) => {
    lines.push(indentBlock(emitDisplayAction(item), 4));
  });
  project.cards.forEach((card, index) => {
    lines.push(indentBlock(emitCard(card, builderPartsByCard[index]), 4));
  });
  lines.push('  }');
  lines.push('}');
  return lines.join('\n');
}
