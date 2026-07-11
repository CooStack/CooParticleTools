import { isNumericType, isVectorType } from './expression-runtime.js';

export const DISPLAY_ACTION_TYPES = [
  { id: 'rotateToPoint', label: 'rotateToPoint(dir)' },
  { id: 'rotateAsAxis', label: 'rotateAsAxis(angle)' },
  { id: 'rotateToWithAngle', label: 'rotateToWithAngle(to, angle)' }
];

export function getRelativeTargetPresets(project = {}) {
  const presets = [
    { label: 'root', expr: 'root' },
    { label: 'RelativeLocation.yAxis()', expr: 'RelativeLocation.yAxis()' },
    { label: 'RelativeLocation(0.0, 1.0, 0.0)', expr: 'RelativeLocation(0.0, 1.0, 0.0)' }
  ];

  (Array.isArray(project.globalVars) ? project.globalVars : []).forEach((item) => {
    const name = String(item?.name || '').trim();
    const type = String(item?.type || '').trim();
    if (!name || !isVectorType(type)) return;
    if (type === 'RelativeLocation') {
      presets.push({ label: name, expr: name });
      return;
    }
    presets.push({ label: `${name}.asRelative()`, expr: `${name}.asRelative()` });
  });

  const unique = [];
  const used = new Set();
  presets.forEach((item) => {
    if (used.has(item.expr)) return;
    used.add(item.expr);
    unique.push(item);
  });
  return unique;
}

export function getAngleExpressionPresets(project = {}) {
  const presets = ['speed / 180 * PI', 'PI / 180', '0.01', '0.05', 'PI * 0.1'];

  (Array.isArray(project.globalVars) ? project.globalVars : []).forEach((item) => {
    const name = String(item?.name || '').trim();
    const type = String(item?.type || '').trim();
    if (!name || !isNumericType(type)) return;
    presets.push(name);
    presets.push(`${name} / 180 * PI`);
  });

  (Array.isArray(project.globalConsts) ? project.globalConsts : []).forEach((item) => {
    const name = String(item?.name || '').trim();
    const type = String(item?.type || '').trim();
    if (!name || !isNumericType(type)) return;
    presets.push(name);
  });

  return Array.from(new Set(presets.filter(Boolean)));
}
