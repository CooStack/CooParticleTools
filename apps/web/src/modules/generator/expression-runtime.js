import { executeGeneratorTypedDoTick } from './typed-expression.js';

const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

const KEYWORDS = new Set([
  'if', 'else', 'for', 'while', 'do', 'switch', 'case', 'default', 'break', 'continue',
  'return', 'const', 'let', 'var', 'val', 'fun', 'function', 'true', 'false', 'null',
  'undefined', 'new', 'this', 'typeof', 'instanceof', 'in', 'of', 'globalThis', 'window',
  'document', 'Function', 'eval', 'constructor', 'prototype', '__proto__', 'Object', 'Reflect'
]);

const BUILTIN_NAMES = new Set([
  'tick', 'PI', 'E', 'min', 'max', 'abs', 'floor', 'ceil', 'round', 'trunc',
  'pow', 'sqrt', 'sin', 'cos', 'tan', 'log', 'exp', 'sign', 'clamp', 'lerp', 'random', 'Math'
]);

const COMPLETION_NUMERIC_TYPES = new Set(['Int', 'Long', 'Float', 'Double']);
const COMPLETION_VECTOR_TYPES = new Set(['Vec3', 'RelativeLocation', 'Vector3f']);
const COMPLETION_FUNCTIONS = Object.freeze([
  { name: 'min', parameters: ['a', 'b'], detail: '较小值', sameType: true },
  { name: 'max', parameters: ['a', 'b'], detail: '较大值', sameType: true },
  { name: 'abs', parameters: ['value'], detail: '绝对值', sameType: true },
  { name: 'floor', parameters: ['value'], detail: '向下取整' },
  { name: 'ceil', parameters: ['value'], detail: '向上取整' },
  { name: 'round', parameters: ['value'], detail: '四舍五入' },
  { name: 'trunc', parameters: ['value'], detail: '截断小数' },
  { name: 'pow', parameters: ['base', 'exponent'], detail: '幂运算' },
  { name: 'sqrt', parameters: ['value'], detail: '平方根' },
  { name: 'sin', parameters: ['value'], detail: '正弦' },
  { name: 'cos', parameters: ['value'], detail: '余弦' },
  { name: 'tan', parameters: ['value'], detail: '正切' },
  { name: 'log', parameters: ['value'], detail: '自然对数' },
  { name: 'exp', parameters: ['value'], detail: '自然指数' },
  { name: 'sign', parameters: ['value'], detail: '符号' },
  { name: 'clamp', parameters: ['value', 'min', 'max'], detail: '限制范围' },
  { name: 'lerp', parameters: ['a', 'b', 'progress'], detail: '线性插值' },
  { name: 'random', parameters: [], detail: '随机 Double' }
]);
const COMPLETION_CONSTRUCTORS = Object.freeze([
  { type: 'Vec3', component: '0.0', detail: '构造 Vec3' },
  { type: 'RelativeLocation', component: '0.0', detail: '构造 RelativeLocation' },
  { type: 'Vector3f', component: '0.0f', detail: '构造 Vector3f' }
]);

const FORBIDDEN_IDENTIFIERS = new Set([
  'this', 'globalThis', 'window', 'document', 'Function', 'eval', 'constructor', 'prototype',
  '__proto__', 'Object', 'Reflect'
]);

const compiledExpressions = new Map();
const compiledScripts = new Map();

export {
  analyzeGeneratorExpression,
  analyzeGeneratorDoTick,
  createGeneratorExpressionSymbols,
  executeGeneratorTypedDoTick,
  evaluateGeneratorExpressionDetailed,
  evaluateTypedGeneratorExpression,
  GENERATOR_EXPRESSION_TYPES,
  isGeneratorExpressionAssignable,
  isGeneratorExpressionNumericType,
  isGeneratorExpressionVectorType,
  normalizeGeneratorExpressionType
} from './typed-expression.js';

export function normalizeGeneratorExpression(raw) {
  return String(raw || '').replace(/\r\n/g, '\n').trim();
}

export function isLikelyIncompleteGeneratorExpression(raw) {
  const source = normalizeGeneratorExpression(raw);
  if (!source) return true;
  const stripped = stripSource(source).trim();
  if (/\b(?:var|let|const|val|fun|if|else|return)\s*$/.test(stripped)) return true;
  if (/[=+\-*/%&|!<>,.(]\s*$/.test(stripped)) return true;
  let depth = 0;
  for (const char of stripped) {
    if ('([{'.includes(char)) depth += 1;
    if (')]}'.includes(char)) depth -= 1;
  }
  return depth > 0;
}

export function generatorExpressionToJs(raw) {
  let source = normalizeGeneratorExpression(raw);
  source = source
    .replace(/\bval\s+([A-Za-z_][A-Za-z0-9_]*)/g, 'const $1')
    .replace(/\bvar\s+([A-Za-z_][A-Za-z0-9_]*)/g, 'let $1')
    .replace(/\.to(?:Double|Float)\(\)/g, '')
    .replace(/\.to(?:Int|Long)\(\)/g, '')
    .replace(/([A-Za-z0-9_.)\]]+)\.coerceAtLeast\(([^()]*)\)/g, 'max($1, $2)')
    .replace(/([A-Za-z0-9_.)\]]+)\.coerceAtMost\(([^()]*)\)/g, 'min($1, $2)')
    .replace(/([A-Za-z0-9_.)\]]+)\.coerceIn\(([^,()]+),\s*([^()]*)\)/g, 'clamp($1, $2, $3)');
  return source.split('\n').map(translateKotlinIfExpressionLine).join('\n');
}

export function generatorExpressionToKotlin(raw) {
  const source = normalizeGeneratorExpression(raw)
    .replace(/\bMath\.random\s*\(\s*\)/g, 'Random.nextDouble()')
    .replace(/\bMath\.(min|max|abs|floor|ceil|round|trunc|pow|sqrt|sin|cos|tan|log|exp|sign)\b/g, '$1')
    .replace(/\btrunc\s*(?=\()/g, 'truncate')
    .replace(/\blog\s*(?=\()/g, 'ln')
    .replace(/===/g, '==')
    .replace(/!==/g, '!=')
    .replace(/\bconst\s+([A-Za-z_][A-Za-z0-9_]*)/g, 'val $1')
    .replace(/\blet\s+([A-Za-z_][A-Za-z0-9_]*)/g, 'var $1')
    .replace(/\brandom\(\)/g, 'Random.nextDouble()')
    .replace(/;+(?=\s*(?:\n|$))/g, '');
  return source.split('\n').map(translateTernaryLine).join('\n');
}

export function validateGeneratorExpression(raw, names = [], options = {}) {
  const source = normalizeGeneratorExpression(raw);
  if (!source) return { valid: options.allowEmpty !== false, message: '' };
  const jsSource = generatorExpressionToJs(source);
  const allowedNames = new Set([...BUILTIN_NAMES, ...normalizeNames(names)]);
  const localNames = collectLocalNames(jsSource);
  const unknown = findUnknownIdentifier(jsSource, new Set([...allowedNames, ...localNames]));
  if (unknown) return { valid: false, message: `未定义标识符：${unknown}` };
  if (!options.statements && /(?:\+\+|--|(?:^|[^=!<>])=(?!=)|[+\-*/%]=)/m.test(jsSource)) {
    return { valid: false, message: '数值表达式不能包含赋值' };
  }
  if (options.statements && options.mutableNames) {
    const mutable = new Set(normalizeNames(options.mutableNames));
    for (const name of collectAssignedNames(jsSource)) {
      if (!mutable.has(name) && !localNames.has(name)) {
        return { valid: false, message: `不可修改只读值：${name}` };
      }
    }
  }

  try {
    if (options.statements) {
      new Function('scope', `with (scope) {\n${jsSource}\n}`);
    } else {
      new Function('scope', `with (scope) { return (${jsSource}); }`);
    }
  } catch (error) {
    return { valid: false, message: `语法错误：${String(error?.message || error)}` };
  }
  return { valid: true, message: '' };
}

export function evaluateGeneratorExpression(raw, scope = {}, fallback = 0) {
  const source = normalizeGeneratorExpression(raw);
  if (!source) return fallback;
  const names = Object.keys(scope);
  const check = validateGeneratorExpression(source, names, { allowEmpty: false });
  if (!check.valid) return fallback;
  const jsSource = generatorExpressionToJs(source);
  let fn = compiledExpressions.get(jsSource);
  if (!fn) {
    fn = new Function('scope', `with (scope) { return (${jsSource}); }`);
    compiledExpressions.set(jsSource, fn);
  }
  try {
    const result = fn(createExpressionScope(scope));
    return result === undefined ? fallback : result;
  } catch {
    return fallback;
  }
}

export function executeGeneratorDoTick(raw, variables, constants = {}, context = {}, parameters = {}) {
  const source = normalizeGeneratorExpression(raw);
  if (!source) return { ok: true, message: '' };
  const typedResult = executeGeneratorTypedDoTick(source, variables, constants, context, parameters);
  if (typedResult.handled) return { ok: typedResult.ok, message: typedResult.message || '' };
  if (typedResult.message) return { ok: false, message: typedResult.message };
  if (typedResult.fallbackSafe !== true) {
    return { ok: false, message: '复杂 doTick 无法可靠转换为 Kotlin' };
  }
  const variableStore = variables && typeof variables === 'object' ? variables : {};
  const variableTypes = new Map((Array.isArray(parameters?.variables) ? parameters.variables : [])
    .map((item) => [String(item?.name || ''), String(item?.type || '')]));
  const names = [...Object.keys(variableStore), ...Object.keys(constants), ...Object.keys(context)];
  const check = validateGeneratorExpression(source, names, {
    statements: true,
    allowEmpty: true,
    mutableNames: Object.keys(variableStore)
  });
  if (!check.valid) return { ok: false, message: check.message };
  const jsSource = generatorExpressionToJs(source);
  let fn = compiledScripts.get(jsSource);
  if (!fn) {
    fn = new Function('scope', `with (scope) {\n${jsSource}\n}`);
    compiledScripts.set(jsSource, fn);
  }

  const scope = createExpressionScope({ ...constants, ...context });
  for (const name of Object.keys(variableStore)) {
    Object.defineProperty(scope, name, {
      enumerable: true,
      configurable: true,
      get: () => variableStore[name],
      set: (value) => { variableStore[name] = normalizeFallbackRuntimeValue(variableTypes.get(name), value); }
    });
  }
  try {
    fn(scope);
    return { ok: true, message: '' };
  } catch (error) {
    return { ok: false, message: String(error?.message || error) };
  }
}

function normalizeFallbackRuntimeValue(type, value) {
  if (type === 'Int') {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) throw new RangeError('整数取余除数不能为 0');
    const integer = BigInt(Math.trunc(numeric));
    return Number(BigInt.asIntN(32, integer));
  }
  if (type === 'Float') return Math.fround(Number(value));
  return value;
}

export function buildGeneratorExpressionCompletions(parameters = {}, options = {}) {
  const variables = Array.isArray(parameters?.variables) ? parameters.variables : [];
  const constants = Array.isArray(parameters?.constants) ? parameters.constants : [];
  const expectedType = normalizeCompletionType(options.expectedType || options.expectedTypes);
  const values = [
    ...variables.map((item) => ({ item, kind: 'variable' })),
    ...constants.map((item) => ({ item, kind: 'constant' }))
  ].filter(({ item }) => !expectedType || completionValueAllowed(item?.type, expectedType));
  const completions = values
    .filter(({ item }) => IDENTIFIER_PATTERN.test(String(item?.name || '')))
    .map(({ item, kind }) => {
      const name = String(item.name);
      const type = normalizeCompletionType(item.type) || 'Unknown';
      const constantSuffix = item.codec === false ? ' const' : '';
      return createGeneratorCompletion({
        id: `${kind}:${completionItemIdentity(item, name)}`,
        kind,
        type,
        label: name,
        insertText: name,
        detail: `${type}${constantSuffix}`,
        signature: `${name}: ${type}${constantSuffix}`
      });
    });
  const valueCompletionCount = completions.length;
  const unrestricted = !expectedType || options.statements;
  if (unrestricted || expectedType === 'Int' || expectedType === 'Double') {
    completions.push(createGeneratorCompletion({
      id: 'builtin:tick',
      kind: 'context',
      type: 'Int',
      label: 'tick',
      insertText: 'tick',
      detail: '当前 Emitter tick',
      signature: 'tick: Int'
    }));
  }
  if (unrestricted || expectedType === 'Double') {
    completions.push(
      createGeneratorCompletion({
        id: 'builtin:progress',
        kind: 'context',
        type: 'Double',
        label: 'progress',
        insertText: 'progress',
        detail: 'Emitter 生命周期进度',
        signature: 'progress: Double'
      }),
      createGeneratorCompletion({
        id: 'builtin:PI',
        kind: 'constant',
        type: 'Double',
        label: 'PI',
        insertText: 'PI',
        detail: '圆周率',
        signature: 'PI: Double'
      }),
      createGeneratorCompletion({
        id: 'builtin:E',
        kind: 'constant',
        type: 'Double',
        label: 'E',
        insertText: 'E',
        detail: '自然常数',
        signature: 'E: Double'
      })
    );
  }

  for (const definition of COMPLETION_FUNCTIONS) {
    const sameType = definition.sameType === true;
    if (!unrestricted && (sameType ? !COMPLETION_NUMERIC_TYPES.has(expectedType) : expectedType !== 'Double')) {
      continue;
    }
    const type = sameType && COMPLETION_NUMERIC_TYPES.has(expectedType) ? expectedType : 'Double';
    const argumentValues = completionFunctionArguments(definition.name, type);
    const label = `${definition.name}(${definition.parameters.join(', ')})`;
    const insertText = `${definition.name}(${argumentValues.join(', ')})`;
    const parameterType = sameType ? type : 'Number';
    completions.push(createGeneratorCompletion({
      id: `function:${definition.name}`,
      kind: 'function',
      type,
      label,
      insertText,
      cursorOffset: definition.parameters.length ? definition.name.length + 1 : insertText.length,
      selectionLength: argumentValues[0]?.length || 0,
      detail: definition.detail,
      signature: `${definition.name}(${definition.parameters.map((name) => `${name}: ${parameterType}`).join(', ')}): ${type}`
    }));
  }

  const constructors = options.statements
    ? COMPLETION_CONSTRUCTORS
    : COMPLETION_VECTOR_TYPES.has(expectedType)
      ? COMPLETION_CONSTRUCTORS.filter((item) => item.type === expectedType)
      : [];
  if (COMPLETION_VECTOR_TYPES.has(expectedType) || options.statements) {
    values
      .filter(({ item }) => COMPLETION_VECTOR_TYPES.has(String(item?.type || ''))
        && (!expectedType || String(item?.type || '') === expectedType)
        && IDENTIFIER_PATTERN.test(String(item?.name || '')))
      .forEach(({ item, kind }) => {
        const name = String(item.name);
        const type = String(item.type);
        completions.push(createGeneratorCompletion({
          id: `method:normal:${kind}:${completionItemIdentity(item, name)}`,
          kind: 'method',
          type,
          label: `${name}.normal()`,
          insertText: `${name}.normal()`,
          memberInsertText: 'normal()',
          detail: '转换为单位向量',
          signature: `${name}.normal(): ${type}`
        }));
      });
  }
  for (const definition of constructors) {
    const label = `${definition.type}(x, y, z)`;
    const insertText = `${definition.type}(${definition.component}, ${definition.component}, ${definition.component})`;
    completions.push(createGeneratorCompletion({
      id: `constructor:${definition.type}`,
      kind: 'constructor',
      type: definition.type,
      label,
      insertText,
      cursorOffset: definition.type.length + 1,
      selectionLength: definition.component.length,
      detail: definition.detail,
      signature: `${definition.type}(x: Number, y: Number, z: Number): ${definition.type}`
    }));
  }
  if (expectedType === 'Vec3') {
    completions.push(createGeneratorCompletion({
      id: 'constructor:RelativeLocation+Vec3',
      kind: 'constructor',
      type: 'Vec3',
      label: 'RelativeLocation(x, y, z) + Vec3(x, y, z)',
      insertText: 'RelativeLocation(0.0, 0.0, 0.0) + Vec3(0.0, 0.0, 0.0)',
      cursorOffset: 17,
      selectionLength: 3,
      detail: 'RelativeLocation 自动转换为 Vec3',
      signature: 'RelativeLocation(x, y, z) + Vec3(x, y, z): Vec3'
    }));
  }
  if (options.statements) {
    const mutableSnippets = variables
      .filter((item) => IDENTIFIER_PATTERN.test(String(item?.name || '')))
      .flatMap((item) => {
        const name = String(item.name);
        const type = normalizeCompletionType(item.type) || 'Unknown';
        const identity = completionItemIdentity(item, name);
        const snippets = [createGeneratorCompletion({
          id: `statement:assign:${identity}`,
          kind: 'statement',
          type,
          label: `${name} = expression`,
          insertText: `${name} = ${name}`,
          cursorOffset: name.length + 3,
          selectionLength: name.length,
          detail: `${type} 变量赋值`,
          signature: `${name} = expression: ${type}`
        })];
        if (['Int', 'Long', 'Float', 'Double'].includes(item?.type)) {
          const increment = item.type === 'Long' ? '1L' : item.type === 'Float' ? '1.0f' : '1';
          snippets.push(createGeneratorCompletion({
            id: `statement:increment:${identity}`,
            kind: 'statement',
            type,
            label: `${name} += ${increment}`,
            insertText: `${name} += ${increment}`,
            cursorOffset: name.length + 4,
            selectionLength: increment.length,
            detail: `${type} 变量自增`,
            signature: `${name} += value: ${type}`
          }));
        }
        return snippets;
      });
    const statementSnippets = [
      createGeneratorCompletion({
        id: 'snippet:if',
        kind: 'snippet',
        type: 'Statement',
        label: 'if (...) { ... }',
        insertText: 'if (true) {\n    \n}',
        cursorOffset: 4,
        selectionLength: 4,
        detail: '条件分支',
        signature: 'if (condition: Boolean) { ... }'
      }),
      createGeneratorCompletion({
        id: 'snippet:var',
        kind: 'snippet',
        type: 'Statement',
        label: 'var local = value',
        insertText: 'var local = 0',
        cursorOffset: 4,
        selectionLength: 5,
        detail: '局部变量',
        signature: 'var name = value'
      })
    ];
    completions.unshift(...statementSnippets);
    completions.splice(statementSnippets.length + valueCompletionCount, 0, ...mutableSnippets);
  }
  return completions;
}

function normalizeCompletionType(rawType) {
  const raw = String(rawType || '').trim().toLowerCase();
  if (raw === 'number' || raw === 'double') return 'Double';
  if (raw === 'int') return 'Int';
  if (raw === 'long') return 'Long';
  if (raw === 'float') return 'Float';
  if (raw === 'vec3' || raw === 'vector') return 'Vec3';
  if (raw === 'relative' || raw === 'relativelocation') return 'RelativeLocation';
  if (raw === 'color' || raw === 'vector3f') return 'Vector3f';
  if (raw === 'boolean' || raw === 'bool') return 'Boolean';
  if (raw === 'string') return 'String';
  return String(rawType || '');
}

function completionValueAllowed(rawType, expectedType) {
  return String(rawType || '') === expectedType;
}

function createGeneratorCompletion(definition = {}) {
  const label = String(definition.label || definition.insertText || '');
  const insertText = String(definition.insertText || label);
  const completion = {
    id: String(definition.id || `${definition.kind || 'completion'}:${label}`),
    kind: String(definition.kind || 'value'),
    type: String(definition.type || 'Unknown'),
    label,
    insertText,
    detail: String(definition.detail || definition.type || 'value'),
    signature: String(definition.signature || label)
  };
  if (definition.cursorOffset !== undefined) completion.cursorOffset = Number(definition.cursorOffset);
  if (definition.selectionLength !== undefined) completion.selectionLength = Number(definition.selectionLength);
  if (definition.memberInsertText !== undefined) completion.memberInsertText = String(definition.memberInsertText);
  return completion;
}

function completionItemIdentity(item, fallback) {
  const persistentId = String(item?.id || '').trim();
  return persistentId || fallback;
}

function completionFunctionArguments(name, type) {
  const zero = completionNumericZero(type);
  if (name === 'min' || name === 'max') return [zero, zero];
  if (name === 'abs') return [zero];
  if (name === 'pow') return ['0', '0'];
  if (name === 'clamp') return ['0', '0', '1'];
  if (name === 'lerp') return ['0', '1', 'progress'];
  if (name === 'random') return [];
  return ['0'];
}

function completionNumericZero(type) {
  if (type === 'Long') return '0L';
  if (type === 'Float') return '0.0f';
  if (type === 'Double') return '0.0';
  return '0';
}

export function filterGeneratorExpressionCompletions(completions = [], query = '', limit = 6) {
  const needle = String(query || '').trim().toLowerCase();
  const maxItems = Math.max(0, Math.floor(Number(limit) || 0));
  if (!maxItems) return [];

  return Array.from(completions || [])
    .map((item, index) => ({ item, index, score: completionMatchScore(item, needle) }))
    .filter((entry) => entry.score >= 0)
    .sort((a, b) => a.score - b.score || a.index - b.index)
    .slice(0, maxItems)
    .map((entry) => entry.item);
}

export function applyGeneratorExpressionCompletion(raw, selectionStart, selectionEnd, completion = {}) {
  const value = String(raw || '');
  const start = clampInteger(selectionStart, 0, value.length, value.length);
  const end = clampInteger(selectionEnd, start, value.length, start);
  const { from, to } = completionIdentifierRange(value, start, end);
  const memberInsertText = String(completion?.memberInsertText || '');
  const insertText = memberInsertText && value[from - 1] === '.'
    ? memberInsertText
    : String(completion?.insertText || completion?.label || '');
  const nextValue = `${value.slice(0, from)}${insertText}${value.slice(to)}`;
  const rawOffset = Number(completion?.cursorOffset);
  const relativeStart = Number.isFinite(rawOffset)
    ? (rawOffset < 0 ? insertText.length + rawOffset : rawOffset)
    : insertText.length;
  const cursorOffset = clampInteger(relativeStart, 0, insertText.length, insertText.length);
  const selectionLength = clampInteger(completion?.selectionLength, 0, insertText.length - cursorOffset, 0);
  const nextStart = from + cursorOffset;

  return {
    value: nextValue,
    selectionStart: nextStart,
    selectionEnd: nextStart + selectionLength
  };
}

function completionIdentifierRange(value, start, end) {
  let from = start;
  let to = end;
  while (from > 0 && /[A-Za-z0-9_]/.test(value[from - 1])) from -= 1;
  while (to < value.length && /[A-Za-z0-9_]/.test(value[to])) to += 1;
  return IDENTIFIER_PATTERN.test(value.slice(from, to)) ? { from, to } : { from: start, to: end };
}

export function createGeneratorExpressionScope(parameters = {}, variableOverrides = {}, context = {}) {
  const scope = { ...context };
  for (const item of Array.isArray(parameters?.variables) ? parameters.variables : []) {
    if (!IDENTIFIER_PATTERN.test(String(item?.name || ''))
      || Object.prototype.hasOwnProperty.call(scope, item.name)) continue;
    scope[item.name] = Object.prototype.hasOwnProperty.call(variableOverrides, item.name)
      ? variableOverrides[item.name]
      : item.value;
  }
  for (const item of Array.isArray(parameters?.constants) ? parameters.constants : []) {
    if (IDENTIFIER_PATTERN.test(String(item?.name || ''))
      && !Object.prototype.hasOwnProperty.call(scope, item.name)) scope[item.name] = item.value;
  }
  return createExpressionScope(scope);
}

function createExpressionScope(values = {}) {
  return {
    ...values,
    Math,
    PI: Math.PI,
    E: Math.E,
    min: Math.min,
    max: Math.max,
    abs: Math.abs,
    floor: Math.floor,
    ceil: Math.ceil,
    round: Math.round,
    trunc: Math.trunc,
    pow: Math.pow,
    sqrt: Math.sqrt,
    sin: Math.sin,
    cos: Math.cos,
    tan: Math.tan,
    log: Math.log,
    exp: Math.exp,
    sign: Math.sign,
    clamp: (value, min, max) => Math.min(Math.max(Number(value), Number(min)), Number(max)),
    lerp: (a, b, progress) => Number(a) + (Number(b) - Number(a)) * Number(progress),
    random: Math.random
  };
}

function normalizeNames(names) {
  return Array.from(names || []).map(String).filter((name) => IDENTIFIER_PATTERN.test(name));
}

function completionMatchScore(item, needle) {
  if (!needle) return 0;
  const texts = [item?.label, item?.insertText]
    .map((value) => String(value || '').toLowerCase())
    .filter(Boolean);
  if (texts.some((value) => value === needle)) return 0;
  if (texts.some((value) => value.startsWith(needle))) return 1;
  if (texts.some((value) => value.split(/[^a-z0-9_]+/).some((word) => word.startsWith(needle)))) return 2;
  if (texts.some((value) => value.includes(needle))) return 3;
  return -1;
}

function clampInteger(raw, min, max, fallback) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

function translateTernaryLine(line) {
  const match = String(line).match(/^(\s*(?:(?:val|var)\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*)?(.+?)\s*\?\s*([^:\n]+)\s*:\s*(.+)$/);
  if (!match) return line;
  const prefix = match[1] || '';
  return `${prefix}if (${match[2].trim()}) ${match[3].trim()} else ${match[4].trim()}`;
}

function translateKotlinIfExpressionLine(line) {
  const match = String(line).match(/^(\s*(?:(?:const|let)\s+)?[A-Za-z_][A-Za-z0-9_]*\s*=\s*)?if\s*\(([^()]*)\)\s*([^{};]+?)\s+else\s+([^{};]+)$/);
  if (!match) return line;
  const prefix = match[1] || '';
  return `${prefix}((${match[2].trim()}) ? (${match[3].trim()}) : (${match[4].trim()}))`;
}

function stripSource(raw) {
  return String(raw || '').replace(
    /\/\*[\s\S]*?\*\/|\/\/[^\n]*|`(?:\\.|[^`\\])*`|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g,
    (match) => ' '.repeat(match.length)
  );
}

function collectLocalNames(raw) {
  const source = stripSource(raw);
  const names = new Set();
  for (const match of source.matchAll(/\b(?:let|const|var|function)\s+([A-Za-z_][A-Za-z0-9_]*)/g)) {
    names.add(match[1]);
  }
  return names;
}

function collectAssignedNames(raw) {
  const source = stripSource(raw);
  const names = new Set();
  for (const match of source.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*)\s*(?:\+\+|--|[+\-*/%]?=(?!=))/g)) {
    names.add(match[1]);
  }
  return names;
}

function findUnknownIdentifier(raw, allowed) {
  const source = stripSource(raw);
  for (const match of source.matchAll(/\b[A-Za-z_][A-Za-z0-9_]*\b/g)) {
    const name = match[0];
    if (FORBIDDEN_IDENTIFIERS.has(name)) return name;
    if (KEYWORDS.has(name) || allowed.has(name)) continue;
    const index = Number(match.index) || 0;
    if (source[index - 1] === '.') continue;
    return name;
  }
  return '';
}
