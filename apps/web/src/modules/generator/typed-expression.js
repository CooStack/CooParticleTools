/*
 * The generator editor accepts a deliberately small Kotlin/JavaScript-like
 * expression language.  Keeping the parser here gives the editor, preview and
 * Kotlin generator one set of type rules instead of three subtly different
 * implementations.
 */

export const GENERATOR_EXPRESSION_TYPES = Object.freeze({
  Unknown: 'Unknown',
  Int: 'Int',
  Long: 'Long',
  Float: 'Float',
  Double: 'Double',
  Boolean: 'Boolean',
  String: 'String',
  Vec3: 'Vec3',
  RelativeLocation: 'RelativeLocation',
  Vector3f: 'Vector3f',
  Namespace: 'Namespace'
});

const TYPES = GENERATOR_EXPRESSION_TYPES;
const NUMERIC_TYPES = new Set([TYPES.Int, TYPES.Long, TYPES.Float, TYPES.Double]);
const VECTOR_TYPES = new Set([TYPES.Vec3, TYPES.RelativeLocation, TYPES.Vector3f]);
const JVM_INT_MIN = -2147483648n;
const JVM_INT_MAX = 2147483647n;
const JVM_LONG_MIN = -9223372036854775808n;
const JVM_LONG_MAX = 9223372036854775807n;
const CONSTRUCTORS = new Map([
  ['Vec3', TYPES.Vec3],
  ['RelativeLocation', TYPES.RelativeLocation],
  ['Vector3f', TYPES.Vector3f]
]);
const BUILTIN_SYMBOLS = new Map([
  ['tick', { type: TYPES.Int }],
  ['progress', { type: TYPES.Double }],
  ['PI', { type: TYPES.Double, value: Math.PI }],
  ['E', { type: TYPES.Double, value: Math.E }],
  ['Math', { type: TYPES.Namespace }]
]);
const BUILTIN_FUNCTIONS = new Set([
  'min', 'max', 'abs', 'floor', 'ceil', 'round', 'trunc', 'pow', 'sqrt',
  'sin', 'cos', 'tan', 'log', 'exp', 'sign', 'clamp', 'lerp', 'random'
]);
const PRECEDENCE = new Map([
  ['||', 1],
  ['&&', 2],
  ['==', 3], ['!=', 3], ['===', 3], ['!==', 3],
  ['<', 4], ['<=', 4], ['>', 4], ['>=', 4],
  ['+', 5], ['-', 5],
  ['*', 6], ['/ ', 6], ['/', 6], ['%', 6]
]);
const VECTOR_TEXT_PATTERN = /^(Vec3|RelativeLocation|Vector3f)\s*\((.*)\)$/s;

export function normalizeGeneratorExpressionType(rawType) {
  const raw = String(rawType || '').trim();
  if (Object.values(TYPES).includes(raw)) return raw;
  const lower = raw.toLowerCase();
  if (lower === 'int') return TYPES.Int;
  if (lower === 'long') return TYPES.Long;
  if (lower === 'float') return TYPES.Float;
  if (lower === 'double' || lower === 'number') return TYPES.Double;
  if (lower === 'boolean' || lower === 'bool') return TYPES.Boolean;
  if (lower === 'string') return TYPES.String;
  if (lower === 'vec3' || lower === 'vector') return TYPES.Vec3;
  if (lower === 'relative' || lower === 'relativelocation') return TYPES.RelativeLocation;
  if (lower === 'vector3f' || lower === 'color') return TYPES.Vector3f;
  return TYPES.Unknown;
}

export function isGeneratorExpressionNumericType(type) {
  return NUMERIC_TYPES.has(normalizeGeneratorExpressionType(type));
}

export function isGeneratorExpressionVectorType(type) {
  return VECTOR_TYPES.has(normalizeGeneratorExpressionType(type));
}

export function createGeneratorExpressionSymbols(symbols = {}) {
  const result = new Map(BUILTIN_SYMBOLS);
  if (symbols && typeof symbols === 'object' && !Array.isArray(symbols)
    && (Array.isArray(symbols.variables) || Array.isArray(symbols.constants))) {
    return createGeneratorExpressionSymbols([
      ...(Array.isArray(symbols.variables) ? symbols.variables : []),
      ...(Array.isArray(symbols.constants) ? symbols.constants : [])
    ]);
  }
  if (Array.isArray(symbols)) {
    symbols.forEach((item) => {
      if (typeof item === 'string') {
        result.set(item, { type: TYPES.Unknown });
        return;
      }
      const name = String(item?.name || '').trim();
      if (!name || result.has(name)) return;
      result.set(name, {
        ...item,
        type: normalizeGeneratorExpressionType(item?.type),
        value: item?.value
      });
    });
    return result;
  }
  if (symbols && typeof symbols === 'object') {
    Object.entries(symbols).forEach(([name, raw]) => {
      if (result.has(name)) return;
      if (raw && typeof raw === 'object' && !Array.isArray(raw) && ('type' in raw || 'value' in raw)) {
        result.set(name, {
          ...raw,
          type: normalizeGeneratorExpressionType(raw.type || inferGeneratorExpressionValueType(raw.value)),
          value: raw.value
        });
      } else {
        result.set(name, {
          type: inferGeneratorExpressionValueType(raw),
          value: raw
        });
      }
    });
  }
  return result;
}

export function isGeneratorExpressionAssignable(actualType, expectedTypes) {
  const actual = normalizeGeneratorExpressionType(actualType);
  const expected = normalizeExpectedTypes(expectedTypes);
  if (!expected.length || actual === TYPES.Unknown) return false;
  return expected.some((target) => {
    if (actual === target) return true;
    // The editor only exposes the one implicit widening required by emitter
    // number fields. All other numeric conversions must be explicit.
    if (target === TYPES.Double && actual === TYPES.Int) return true;
    return false;
  });
}

export function analyzeGeneratorExpression(raw, symbols = {}, options = {}) {
  const source = String(raw ?? '').trim();
  if (!source) {
    return {
      valid: options.allowEmpty !== false,
      type: TYPES.Unknown,
      kotlin: '',
      ast: null,
      value: undefined,
      message: ''
    };
  }

  let ast;
  try {
    ast = new ExpressionParser(source).parse();
  } catch (error) {
    return invalidExpression(error?.message || '语法错误');
  }

  const symbolTable = createGeneratorExpressionSymbols(symbols);
  const checked = checkExpressionNode(ast, symbolTable);
  if (!checked.valid) return invalidExpression(checked.message);

  const expected = normalizeExpectedTypes(options.expectedType ?? options.expectedTypes);
  if (expected.length && !isGeneratorExpressionAssignable(checked.type, expected)) {
    return {
      valid: false,
      type: checked.type,
      kotlin: '',
      ast,
      value: checked.value,
      message: `表达式类型 ${checked.type} 不适用于 ${expected.join(' / ')}`,
      reason: 'type_mismatch'
    };
  }

  const kotlin = emitKotlinExpression(ast);
  let value;
  try {
    value = evaluateExpressionNode(ast, createRuntimeScope(symbolTable, options.scope || {}), symbolTable);
  } catch (error) {
    if (options.reportEvaluationErrors === true) {
      return {
        valid: false,
        type: checked.type,
        kotlin,
        ast,
        value: undefined,
        message: formatGeneratorEvaluationError(error),
        reason: 'evaluation_error',
        symbols: symbolTable
      };
    }
    value = checked.value;
  }
  return {
    valid: true,
    type: checked.type,
    kotlin,
    ast,
    value,
    message: '',
    symbols: symbolTable
  };
}

export function evaluateTypedGeneratorExpression(raw, scope = {}, symbols = {}, options = {}) {
  const result = analyzeGeneratorExpression(raw, symbols, { ...options, scope });
  if (!result.valid) return options.fallback;
  return result.value === undefined ? options.fallback : result.value;
}

export function evaluateGeneratorExpressionDetailed(raw, scope = {}, symbols = {}, options = {}) {
  const result = analyzeGeneratorExpression(raw, symbols, {
    ...options,
    scope,
    reportEvaluationErrors: true
  });
  if (!result.valid) return result;
  return result;
}

export function analyzeGeneratorDoTick(raw, parameters = {}, options = {}) {
  const source = String(raw ?? '').trim();
  if (!source) return { handled: true, valid: true, statements: [], message: '' };
  const variables = Array.isArray(parameters?.variables) ? parameters.variables : [];
  const constants = Array.isArray(parameters?.constants) ? parameters.constants : [];
  const context = options.context && typeof options.context === 'object' ? options.context : {};
  const symbols = [
    ...variables,
    ...constants,
    ...Object.entries(context).map(([name, value]) => ({ name, type: inferContextType(name, value), value }))
  ];
  const statements = splitSimpleStatements(source);
  if (!statements) {
    const safetyMessage = complexDoTickSafetyMessage(source, symbols);
    if (safetyMessage) {
      return { handled: false, fallbackSafe: false, valid: false, statements: [], message: safetyMessage };
    }
    const extracted = extractNestedAssignments(source);
    if (!extracted.length) {
      return {
        handled: false,
        fallbackSafe: false,
        valid: false,
        statements: [],
        message: '复杂 doTick 仅支持 if/else 与变量赋值'
      };
    }
    const guarded = analyzeGeneratorDoTick(extracted.join('\n'), parameters, options);
    if (!guarded.valid) return { ...guarded, handled: false };
    if (guarded.statements.some((statement) => isGeneratorExpressionVectorType(statement.type))) {
      return {
        handled: false,
        valid: false,
        statements: [],
        message: '复杂控制流中的向量赋值暂不支持，请拆分到 doTick 顶层赋值'
      };
    }
    if (guarded.statements.some((statement) => statement.type === TYPES.Long)) {
      return {
        handled: false,
        fallbackSafe: false,
        valid: false,
        statements: [],
        message: '复杂控制流中的 Long 赋值暂不支持，请拆分到 doTick 顶层赋值'
      };
    }
    if (guarded.statements.some((statement) => (
      statement.declaration && [TYPES.Int, TYPES.Float].includes(statement.type)
    ))) {
      return {
        handled: false,
        fallbackSafe: false,
        valid: false,
        statements: [],
        message: '复杂控制流中的 Int / Float 局部变量暂不支持，请改用 Emitter 变量'
      };
    }
    if (guarded.statements.some((statement) => (
      statement.type === TYPES.Int && !isSafeComplexIntegerAssignment(statement.ast)
    ))) {
      return {
        handled: false,
        fallbackSafe: false,
        valid: false,
        statements: [],
        message: '复杂控制流中的 Int 中间运算无法保证 JVM 溢出语义，请拆分到 doTick 顶层赋值'
      };
    }
    if (guarded.statements.some(nestedStatementNeedsKotlinRewrite)) {
      return {
        handled: false,
        valid: false,
        statements: [],
        message: '复杂控制流中的自动转型或函数转换暂不支持，请拆分到 doTick 顶层赋值'
      };
    }
    const locals = guarded.statements
      .filter((statement) => statement.declaration)
      .map((statement) => ({ name: statement.name, type: statement.type }));
    const conditionMessage = complexDoTickConditionMessage(source, [...symbols, ...locals]);
    if (conditionMessage) {
      return { handled: false, fallbackSafe: false, valid: false, statements: [], message: conditionMessage };
    }
    return {
      handled: false,
      fallbackSafe: true,
      valid: true,
      statements: guarded.statements,
      message: ''
    };
  }
  const mutable = new Set(variables.map((item) => String(item?.name || '')).filter(Boolean));
  const locals = [];
  const checked = [];
  for (const statement of statements) {
    const match = statement.match(/^(?:(?:var|let|val)\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*(\+=|-=|\*=|\/=|=)\s*(.+)$/s);
    if (!match) {
      return {
        handled: false,
        fallbackSafe: false,
        valid: false,
        statements: [],
        message: 'doTick 仅支持变量赋值，复杂逻辑仅支持 if/else 与赋值'
      };
    }
    const [, name, operator, rhs] = match;
    const localDeclaration = /^(?:var|let|val)\s+/.test(statement);
    const known = [...symbols, ...locals].find((item) => item?.name === name);
    if (localDeclaration && known) return { handled: true, valid: false, statements: [], message: `局部变量已存在：${name}` };
    const local = locals.find((item) => item.name === name);
    if (!localDeclaration && local?.mutable === false) {
      return { handled: true, valid: false, statements: [], message: `不可修改只读值：${name}` };
    }
    if (!localDeclaration && !mutable.has(name) && !locals.some((item) => item.name === name)) {
      return { handled: true, valid: false, statements: [], message: `不可修改只读值：${name}` };
    }
    const targetType = known?.type || '';
    const expression = operator === '=' ? rhs.trim() : `${name} ${operator[0]} (${rhs.trim()})`;
    const analysis = analyzeGeneratorExpression(
      expression,
      [...symbols, ...locals],
      targetType ? { expectedType: targetType } : {}
    );
    if (!analysis.valid) {
      return { handled: true, valid: false, statements: [], message: `${name}：${analysis.message}` };
    }
    const rhsAnalysis = analyzeGeneratorExpression(rhs.trim(), [...symbols, ...locals]);
    if (!rhsAnalysis.valid) {
      return { handled: true, valid: false, statements: [], message: `${name}：${rhsAnalysis.message}` };
    }
    const type = targetType || analysis.type;
    checked.push({
      name,
      operator,
      rhs: rhs.trim(),
      rhsKotlin: rhsAnalysis.kotlin,
      expression,
      expressionType: analysis.type,
      type,
      kotlin: coerceKotlinNumber(analysis.kotlin, analysis.type, type),
      ast: analysis.ast,
      declaration: localDeclaration,
      declarationKeyword: statement.match(/^(var|let|val)\b/)?.[1] || ''
    });
    if (localDeclaration) {
      locals.push({
        name,
        type,
        mutable: statement.match(/^(var|let)\b/) !== null
      });
    }
  }
  return { handled: true, valid: true, statements: checked, message: '' };
}

export function executeGeneratorTypedDoTick(raw, variableStore = {}, constants = {}, context = {}, parameters = {}) {
  const inferredVariables = Object.keys(variableStore || {}).map((name) => ({
    name,
    // A bare JS runtime store predates typed parameter declarations; numeric
    // values there represent the old floating-point doTick semantics.
    type: inferUntypedRuntimeType(variableStore[name]),
    value: variableStore[name]
  }));
  const suppliedVariables = Array.isArray(parameters?.variables) ? parameters.variables : [];
  const suppliedConstants = Array.isArray(parameters?.constants) ? parameters.constants : [];
  const definitions = {
    variables: suppliedVariables.length ? suppliedVariables : inferredVariables,
    constants: suppliedConstants.length ? suppliedConstants : Object.entries(constants || {}).map(([name, value]) => ({
      name,
      type: inferUntypedRuntimeType(value),
      value
    }))
  };
  const checked = analyzeGeneratorDoTick(raw, definitions, { context });
  if (!checked.handled) return checked;
  if (!checked.valid) return { handled: true, ok: false, message: checked.message };

  const scope = { ...(constants || {}), ...(context || {}), ...(variableStore || {}) };
  const symbols = [
    ...(Array.isArray(definitions.variables) ? definitions.variables : []),
    ...(Array.isArray(definitions.constants) ? definitions.constants : []),
    ...Object.entries(context || {}).map(([name, value]) => ({ name, type: inferContextType(name, value), value }))
  ];
  for (const statement of checked.statements) {
    const analysis = evaluateGeneratorExpressionDetailed(
      statement.expression,
      scope,
      symbols,
      { expectedType: statement.type }
    );
    if (!analysis.valid) return { handled: true, ok: false, message: `${statement.name}：${analysis.message}` };
    const value = normalizeStoredRuntimeValue(statement.type, analysis.value);
    if (Object.prototype.hasOwnProperty.call(variableStore, statement.name)) variableStore[statement.name] = value;
    scope[statement.name] = value;
    if (!symbols.some((item) => item?.name === statement.name)) symbols.push({ name: statement.name, type: statement.type, value });
  }
  return { handled: true, ok: true, message: '' };
}

function inferUntypedRuntimeType(value) {
  if (typeof value === 'bigint') return TYPES.Long;
  if (typeof value === 'number') return TYPES.Double;
  return inferGeneratorExpressionValueType(value);
}

function normalizeStoredRuntimeValue(type, value) {
  if (type === TYPES.Long) return wrapJvmLong(value).toString();
  if (type === TYPES.Int) return wrapJvmInt(value);
  return normalizeRuntimeValue(type, value);
}

function inferContextType(name, value) {
  if (name === 'tick') return TYPES.Int;
  if (name === 'progress') return TYPES.Double;
  return inferUntypedRuntimeType(value);
}

function splitSimpleStatements(source) {
  const statements = [];
  let start = 0;
  let depth = 0;
  let hasBlock = false;
  let quote = '';
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = '';
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if (char === '{' || char === '}') hasBlock = true;
    if ('([{'.includes(char)) depth += 1;
    else if (')]}'.includes(char)) depth -= 1;
    else if ((char === '\n' || char === ';') && depth === 0) {
      const statement = source.slice(start, index).trim();
      if (statement && !statement.startsWith('//')) statements.push(statement);
      start = index + 1;
    }
  }
  if (quote || depth !== 0 || hasBlock) return null;
  const tail = source.slice(start).trim();
  if (tail && !tail.startsWith('//')) statements.push(tail);
  return statements;
}

function extractNestedAssignments(source) {
  const assignments = [];
  const pattern = /(?:^|[;{}\n])\s*(?:(?:var|let|val)\s+)?[A-Za-z_][A-Za-z0-9_]*\s*(?:\+=|-=|\*=|\/=|=(?!=))\s*[^;{}\n]+/g;
  for (const match of String(source || '').matchAll(pattern)) {
    const statement = String(match[0] || '').replace(/^[;{}\s]+/, '').trim();
    if (statement) assignments.push(statement);
  }
  return assignments;
}

function complexDoTickSafetyMessage(source, symbols = []) {
  const code = stripDoTickLiteralsAndComments(source);
  const unsupported = code.match(/\b(for|while|do|switch|when|try|catch|finally|function|fun|return|break|continue)\b/);
  if (unsupported) return `复杂 doTick 暂不支持 ${unsupported[1]}`;
  if (/(?:\+\+|--)/.test(code)) return '复杂 doTick 暂不支持 ++ 或 --，请改为显式赋值';
  if (/\b\d+[lL]\b/.test(code)) return '复杂控制流中的 Long 字面量暂不支持，请拆分到 doTick 顶层赋值';
  if (/\.to(?:Int|Long|Float|Double)\s*\(/.test(code)) {
    return '复杂控制流中的显式数值转换暂不支持，请拆分到 doTick 顶层赋值';
  }
  const longReference = symbols.find((item) => (
    normalizeGeneratorExpressionType(item?.type) === TYPES.Long
      && new RegExp(`\\b${escapeRegularExpression(item?.name)}\\b`).test(code)
  ));
  if (longReference) return '复杂控制流中的 Long 运算暂不支持，请拆分到 doTick 顶层赋值';

  const body = blankIfHeaders(code)
    .replace(/\belse\b/g, ' ')
    .replace(/[{};]/g, '\n');
  const invalid = body.split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .find((line) => !/^(?:(?:var|let|val)\s+)?[A-Za-z_][A-Za-z0-9_]*\s*(?:\+=|-=|\*=|\/=|=(?!=))\s*.+$/.test(line));
  return invalid ? '复杂 doTick 仅支持 if/else 与变量赋值' : '';
}

function complexDoTickConditionMessage(source, symbols) {
  const conditions = extractIfConditions(source);
  for (const condition of conditions) {
    const analysis = analyzeGeneratorExpression(condition, symbols, { expectedType: TYPES.Boolean });
    if (!analysis.valid) return `if 条件：${analysis.message}`;
    if (expressionAstHasUnsafeComplexIntegerCondition(analysis.ast)) {
      return '复杂控制流条件中的 Int 算术无法保证 JVM 溢出语义，请先赋值给 Emitter 变量';
    }
    if (compactExpression(analysis.kotlin) !== compactExpression(condition)) {
      return '复杂控制流中的条件需要自动转型或函数转换，请改为类型完全一致的条件';
    }
  }
  return '';
}

function expressionAstHasUnsafeComplexIntegerCondition(node) {
  if (!node || typeof node !== 'object') return false;
  if (node.type === TYPES.Int) {
    if (node.kind === 'binary' && ['+', '-', '*'].includes(node.op)) return true;
    if (node.kind === 'binary' && node.op === '%' && !isStaticNonZeroInteger(node.right)) return true;
    if (node.kind === 'unary' && ['+', '-'].includes(node.op)) return true;
    if (node.kind === 'call') return true;
  }
  return Object.values(node).some((value) => (
    Array.isArray(value)
      ? value.some(expressionAstHasUnsafeComplexIntegerCondition)
      : value && typeof value === 'object'
        && expressionAstHasUnsafeComplexIntegerCondition(value)
  ));
}

function isSafeComplexIntegerAssignment(node) {
  if (!node) return false;
  if (node.kind === 'literal' || node.kind === 'identifier') return true;
  if (node.kind === 'group') return isSafeComplexIntegerAssignment(node.expression);
  if (node.kind === 'unary' && ['+', '-'].includes(node.op)) {
    return isSafeComplexIntegerAssignment(node.argument);
  }
  if (node.kind === 'binary' && ['+', '-'].includes(node.op)) {
    return isSafeComplexIntegerAssignment(node.left) && isSafeComplexIntegerAssignment(node.right);
  }
  if (node.kind === 'binary' && node.op === '%') {
    return isSafeComplexIntegerModuloOperand(node.left) && isSafeComplexIntegerModuloOperand(node.right);
  }
  return false;
}

function isSafeComplexIntegerModuloOperand(node) {
  if (!node) return false;
  if (node.kind === 'literal' || node.kind === 'identifier') return true;
  if (node.kind === 'group') return isSafeComplexIntegerModuloOperand(node.expression);
  if (node.kind === 'unary' && ['+', '-'].includes(node.op)) return node.argument?.kind === 'literal';
  if (node.kind === 'binary' && node.op === '%') {
    return isSafeComplexIntegerModuloOperand(node.left) && isSafeComplexIntegerModuloOperand(node.right);
  }
  return false;
}

function extractIfConditions(source) {
  const code = stripDoTickLiteralsAndComments(source);
  const conditions = [];
  const pattern = /\bif\b/g;
  for (let match = pattern.exec(code); match; match = pattern.exec(code)) {
    let open = match.index + match[0].length;
    while (/\s/.test(code[open] || '')) open += 1;
    if (code[open] !== '(') continue;
    const close = findClosingParenthesis(code, open);
    if (close < 0) continue;
    conditions.push(source.slice(open + 1, close));
    pattern.lastIndex = close + 1;
  }
  return conditions;
}

function blankIfHeaders(code) {
  const chars = Array.from(code);
  const pattern = /\bif\b/g;
  for (let match = pattern.exec(code); match; match = pattern.exec(code)) {
    let open = match.index + match[0].length;
    while (/\s/.test(code[open] || '')) open += 1;
    if (code[open] !== '(') continue;
    const close = findClosingParenthesis(code, open);
    if (close < 0) continue;
    for (let index = match.index; index <= close; index += 1) chars[index] = ' ';
    pattern.lastIndex = close + 1;
  }
  return chars.join('');
}

function findClosingParenthesis(source, open) {
  let depth = 0;
  for (let index = open; index < source.length; index += 1) {
    if (source[index] === '(') depth += 1;
    else if (source[index] === ')') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

function stripDoTickLiteralsAndComments(source) {
  const text = String(source || '');
  const chars = Array.from(text);
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < chars.length; index += 1) {
    const char = chars[index];
    const next = chars[index + 1];
    if (lineComment) {
      if (char === '\n') lineComment = false;
      else chars[index] = ' ';
      continue;
    }
    if (blockComment) {
      chars[index] = char === '\n' ? '\n' : ' ';
      if (char === '*' && next === '/') {
        chars[index + 1] = ' ';
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        chars[index] = ' ';
        escaped = false;
      } else if (char === '\\') {
        chars[index] = ' ';
        escaped = true;
      } else if (char === quote) {
        quote = '';
      } else {
        chars[index] = char === '\n' ? '\n' : ' ';
      }
      continue;
    }
    if (char === '/' && next === '/') {
      chars[index] = ' ';
      chars[index + 1] = ' ';
      lineComment = true;
      index += 1;
    } else if (char === '/' && next === '*') {
      chars[index] = ' ';
      chars[index + 1] = ' ';
      blockComment = true;
      index += 1;
    } else if (char === '"' || char === "'") {
      quote = char;
    }
  }
  return chars.join('');
}

function compactExpression(value) {
  return String(value || '').replace(/\s+/g, '');
}

function escapeRegularExpression(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function nestedStatementNeedsKotlinRewrite(statement = {}) {
  const compact = (value) => String(value || '').replace(/\s+/g, '');
  return compact(statement.rhsKotlin) !== compact(statement.rhs)
    || compact(statement.kotlin) !== compact(statement.rhs);
}

function invalidExpression(message) {
  return {
    valid: false,
    type: TYPES.Unknown,
    kotlin: '',
    ast: null,
    value: undefined,
    message: String(message || '表达式无效')
  };
}

function formatGeneratorEvaluationError(error) {
  const message = String(error?.message || error || '表达式求值失败');
  if (/division by zero/i.test(message)) return '整数取余除数不能为 0';
  return `表达式求值失败：${message}`;
}

class ExpressionParseError extends Error {}

class ExpressionParser {
  constructor(source) {
    this.source = source;
    this.tokens = tokenizeExpression(source);
    this.index = 0;
  }

  parse() {
    const node = this.parseExpression(0);
    while (this.match(';')) this.consume();
    if (!this.isEnd()) this.fail(`无法解析 ${this.current().value}`);
    return node;
  }

  parseExpression(minPrecedence = 0) {
    let left = this.parseUnary();
    while (!this.isEnd()) {
      const token = this.current();
      if (token.value === '?' && minPrecedence <= 0) {
        this.consume();
        const consequent = this.parseExpression(0);
        if (this.match(':')) this.consume();
        else this.expectIdentifier('else');
        const alternate = this.parseExpression(0);
        left = { kind: 'conditional', condition: left, consequent, alternate };
        continue;
      }
      const precedence = PRECEDENCE.get(token.value);
      if (precedence === undefined || precedence < minPrecedence) break;
      this.consume();
      const right = this.parseExpression(precedence + 1);
      left = { kind: 'binary', op: token.value, left, right };
    }
    return left;
  }

  parseUnary() {
    if (this.match('+') || this.match('-') || this.match('!')) {
      const op = this.consume().value;
      return { kind: 'unary', op, argument: this.parseUnary() };
    }
    return this.parsePostfix();
  }

  parsePostfix() {
    let node = this.parsePrimary();
    while (this.match('.')) {
      this.consume();
      const property = this.expectKind('identifier').value;
      if (this.match('(')) {
        node = { kind: 'call', callee: { kind: 'member', object: node, property }, args: this.parseArguments() };
      } else {
        node = { kind: 'member', object: node, property };
      }
    }
    return node;
  }

  parsePrimary() {
    const token = this.current();
    if (!token) this.fail('缺少表达式');
    if (token.kind === 'number') {
      this.consume();
      return {
        kind: 'literal',
        value: token.numericValue,
        type: token.numericType,
        raw: token.value,
        integerMagnitude: token.integerMagnitude
      };
    }
    if (token.kind === 'string') {
      this.consume();
      return { kind: 'literal', value: token.stringValue, type: TYPES.String, raw: token.value };
    }
    if (token.kind === 'identifier') {
      this.consume();
      if (token.value === 'if') return this.parseIfExpression();
      if (token.value === 'true' || token.value === 'false') {
        return { kind: 'literal', value: token.value === 'true', type: TYPES.Boolean, raw: token.value };
      }
      if (token.value === 'null') return { kind: 'literal', value: null, type: TYPES.Unknown, raw: token.value };
      if (this.match('(')) {
        return { kind: 'call', callee: { kind: 'identifier', name: token.value }, args: this.parseArguments() };
      }
      return { kind: 'identifier', name: token.value };
    }
    if (this.match('(')) {
      this.consume();
      const expression = this.parseExpression(0);
      this.expect(')');
      return { kind: 'group', expression };
    }
    this.fail(`无法解析 ${token.value}`);
  }

  parseIfExpression() {
    this.expect('(');
    const condition = this.parseExpression(0);
    this.expect(')');
    const consequent = this.parseExpression(0);
    this.expectIdentifier('else');
    const alternate = this.parseExpression(0);
    return { kind: 'conditional', condition, consequent, alternate };
  }

  parseArguments() {
    this.expect('(');
    const args = [];
    if (!this.match(')')) {
      do {
        args.push(this.parseExpression(0));
        if (!this.match(',')) break;
        this.consume();
      } while (!this.match(')'));
    }
    this.expect(')');
    return args;
  }

  current() {
    return this.tokens[this.index];
  }

  isEnd() {
    return this.index >= this.tokens.length;
  }

  match(value) {
    return this.current()?.value === value;
  }

  consume() {
    return this.tokens[this.index++];
  }

  expect(value) {
    if (!this.match(value)) this.fail(`需要 ${value}`);
    return this.consume();
  }

  expectIdentifier(value) {
    const token = this.current();
    if (token?.kind !== 'identifier' || token.value !== value) this.fail(`需要 ${value}`);
    return this.consume();
  }

  expectKind(kind) {
    const token = this.current();
    if (token?.kind !== kind) this.fail(`需要 ${kind}`);
    return this.consume();
  }

  fail(message) {
    const token = this.current();
    throw new ExpressionParseError(`${message}${token ? `（位置 ${token.position + 1}）` : ''}`);
  }
}

function tokenizeExpression(source) {
  const tokens = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (source.startsWith('//', index)) {
      const end = source.indexOf('\n', index + 2);
      index = end < 0 ? source.length : end + 1;
      continue;
    }
    if (source.startsWith('/*', index)) {
      const end = source.indexOf('*/', index + 2);
      if (end < 0) throw new ExpressionParseError('未闭合注释');
      index = end + 2;
      continue;
    }
    const number = source.slice(index).match(/^(?:(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?)(?:[fFdDlL])?/);
    if (number) {
      const raw = number[0];
      const suffix = raw.slice(-1).toLowerCase();
      const body = suffix && 'fdl'.includes(suffix) ? raw.slice(0, -1) : raw;
      let numericType = TYPES.Double;
      if (suffix === 'f') numericType = TYPES.Float;
      else if (suffix === 'l') numericType = TYPES.Long;
      else if (!/[.eE]/.test(body)) numericType = TYPES.Int;
      if (numericType === TYPES.Long && /[.eE]/.test(body)) {
        throw new ExpressionParseError(`Long 必须是整数：${raw}`);
      }
      let integerMagnitude;
      if (numericType === TYPES.Int || numericType === TYPES.Long) {
        integerMagnitude = BigInt(body);
        const maxMagnitude = numericType === TYPES.Int ? JVM_INT_MAX + 1n : JVM_LONG_MAX + 1n;
        if (integerMagnitude > maxMagnitude) {
          throw new ExpressionParseError(`${numericType} 字面量超出范围：${raw}`);
        }
      }
      const numericValue = numericType === TYPES.Long ? integerMagnitude : Number(body);
      if (typeof numericValue === 'number' && !Number.isFinite(numericValue)) {
        throw new ExpressionParseError(`数字无效：${raw}`);
      }
      tokens.push({ kind: 'number', value: raw, numericValue, numericType, integerMagnitude, position: index });
      index += raw.length;
      continue;
    }
    if (char === '"' || char === "'") {
      const quote = char;
      const start = index;
      index += 1;
      let value = '';
      let closed = false;
      while (index < source.length) {
        const next = source[index++];
        if (next === '\\') {
          const escaped = source[index++];
          value += escaped === 'n' ? '\n' : escaped === 'r' ? '\r' : escaped === 't' ? '\t' : escaped;
        } else if (next === quote) {
          closed = true;
          break;
        } else value += next;
      }
      if (!closed) throw new ExpressionParseError('字符串未闭合');
      tokens.push({ kind: 'string', value: source.slice(start, index), stringValue: value, position: start });
      continue;
    }
    const identifier = source.slice(index).match(/^[A-Za-z_][A-Za-z0-9_]*/);
    if (identifier) {
      const value = identifier[0];
      tokens.push({ kind: 'identifier', value, position: index });
      index += value.length;
      continue;
    }
    const operator = ['===', '!==', '==', '!=', '<=', '>=', '&&', '||', '+=', '-=', '*=', '/=', '++', '--']
      .find((item) => source.startsWith(item, index));
    if (operator) {
      tokens.push({ kind: 'operator', value: operator, position: index });
      index += operator.length;
      continue;
    }
    if ('()+-*/%?:,.<>!;'.includes(char)) {
      tokens.push({ kind: 'operator', value: char, position: index });
      index += 1;
      continue;
    }
    throw new ExpressionParseError(`不支持的字符：${char}`);
  }
  return tokens;
}

function checkExpressionNode(node, symbols) {
  if (!node) return invalidNode('缺少表达式');
  if (node.kind === 'literal') {
    const rangeError = integerLiteralRangeError(node);
    return rangeError || annotate(node, node.type, node.value);
  }
  if (node.kind === 'group') {
    const result = checkExpressionNode(node.expression, symbols);
    return result.valid ? annotate(node, result.type, result.value) : result;
  }
  if (node.kind === 'identifier') {
    const symbol = symbols.get(node.name);
    if (!symbol) return invalidNode(`未定义标识符：${node.name}`);
    if (symbol.type === TYPES.Namespace) return annotate(node, TYPES.Namespace);
    return annotate(node, symbol.type || TYPES.Unknown, normalizeRuntimeValue(symbol.type, symbol.value));
  }
  if (node.kind === 'member') return checkMemberNode(node, symbols);
  if (node.kind === 'call') return checkCallNode(node, symbols);
  if (node.kind === 'unary') {
    if (node.op === '-' && isMinimumIntegerLiteral(node.argument)) {
      annotate(node.argument, node.argument.type, node.argument.value);
      return annotate(
        node,
        node.argument.type,
        node.argument.type === TYPES.Long ? JVM_LONG_MIN : Number(JVM_INT_MIN)
      );
    }
    const argument = checkExpressionNode(node.argument, symbols);
    if (!argument.valid) return argument;
    if (node.op === '!') {
      if (argument.type !== TYPES.Boolean) return invalidNode('! 只能用于 Boolean');
      return annotate(node, TYPES.Boolean);
    }
    if (!isGeneratorExpressionNumericType(argument.type) && !isGeneratorExpressionVectorType(argument.type)) {
      return invalidNode(`${node.op} 不支持 ${argument.type}`);
    }
    return annotate(node, argument.type);
  }
  if (node.kind === 'conditional') {
    const condition = checkExpressionNode(node.condition, symbols);
    if (!condition.valid) return condition;
    if (condition.type !== TYPES.Boolean) return invalidNode('条件必须是 Boolean');
    const consequent = checkExpressionNode(node.consequent, symbols);
    if (!consequent.valid) return consequent;
    const alternate = checkExpressionNode(node.alternate, symbols);
    if (!alternate.valid) return alternate;
    const common = commonExpressionType(consequent.type, alternate.type);
    if (!common) return invalidNode(`分支类型不一致：${consequent.type} 与 ${alternate.type}`);
    return annotate(node, common);
  }
  if (node.kind === 'binary') return checkBinaryNode(node, symbols);
  return invalidNode('不支持的表达式');
}

function checkMemberNode(node, symbols) {
  const object = checkExpressionNode(node.object, symbols);
  if (!object.valid) return object;
  if (object.type === TYPES.Namespace) {
    if (node.property === 'PI' || node.property === 'E') return annotate(node, TYPES.Double);
    if (BUILTIN_FUNCTIONS.has(node.property)) return annotate(node, TYPES.Namespace);
  }
  if (object.type === TYPES.Vector3f || object.type === TYPES.Vec3 || object.type === TYPES.RelativeLocation) {
    if (['x', 'y', 'z'].includes(node.property)) {
      return annotate(node, object.type === TYPES.Vector3f ? TYPES.Float : TYPES.Double);
    }
  }
  return invalidNode(`不支持访问 ${object.type}.${node.property}`);
}

function checkCallNode(node, symbols) {
  const callee = node.callee;
  if (callee.kind === 'identifier') {
    const name = callee.name;
    const constructorType = CONSTRUCTORS.get(name);
    if (constructorType) {
      if (node.args.length !== 3) return invalidNode(`${name} 需要 3 个数字参数`);
      const args = node.args.map((arg) => checkExpressionNode(arg, symbols));
      const bad = args.find((item) => !item.valid);
      if (bad) return bad;
      if (args.some((item) => !isGeneratorExpressionNumericType(item.type))) {
        return invalidNode(`${name} 的参数必须是数字`);
      }
      return annotate(node, constructorType, makeVector(constructorType, args.map((item) => Number(item.value))));
    }
    if (!BUILTIN_FUNCTIONS.has(name)) return invalidNode(`未知函数：${name}`);
    return checkBuiltinCall(node, name, symbols);
  }
  if (callee.kind === 'member') {
    const object = checkExpressionNode(callee.object, symbols);
    if (!object.valid) return object;
    const args = node.args.map((arg) => checkExpressionNode(arg, symbols));
    const bad = args.find((item) => !item.valid);
    if (bad) return bad;
    const name = callee.property;
    if (object.type === TYPES.Namespace && BUILTIN_FUNCTIONS.has(name)) {
      return checkBuiltinCall(node, name, symbols);
    }
    if (['toDouble', 'toFloat', 'toInt', 'toLong'].includes(name)) {
      if (args.length) return invalidNode(`${name} 不接受参数`);
      if (!isGeneratorExpressionNumericType(object.type)) return invalidNode(`${name} 只能用于数字`);
      return annotate(node, {
        toDouble: TYPES.Double,
        toFloat: TYPES.Float,
        toInt: TYPES.Int,
        toLong: TYPES.Long
      }[name]);
    }
    if (name === 'normal') {
      if (args.length) return invalidNode('normal 不接受参数');
      if (!VECTOR_TYPES.has(object.type)) return invalidNode('normal 只能用于向量');
      return annotate(node, object.type);
    }
    if (name === 'toVector' && object.type === TYPES.RelativeLocation && !args.length) return annotate(node, TYPES.Vec3);
    if (name === 'toVector3f' && VECTOR_TYPES.has(object.type) && !args.length) return annotate(node, TYPES.Vector3f);
    if (['coerceAtLeast', 'coerceAtMost'].includes(name) && args.length === 1) {
      if (!isGeneratorExpressionNumericType(object.type) || !isGeneratorExpressionNumericType(args[0].type)) {
        return invalidNode(`${name} 需要数字参数`);
      }
      const common = commonNumericType(object.type, args[0].type);
      return common ? annotate(node, common) : invalidNode('数字类型不兼容');
    }
    if (name === 'coerceIn' && args.length === 2 && args.every((arg) => isGeneratorExpressionNumericType(arg.type))) {
      const common = commonNumericType(object.type, commonNumericType(args[0].type, args[1].type));
      return common ? annotate(node, common) : invalidNode('数字类型不兼容');
    }
    return invalidNode(`不支持调用 ${object.type}.${name}`);
  }
  return invalidNode('函数目标无效');
}

function checkBuiltinCall(node, name, symbols) {
  const args = node.args.map((arg) => checkExpressionNode(arg, symbols));
  const bad = args.find((item) => !item.valid);
  if (bad) return bad;
  if (name === 'random') return args.length ? invalidNode('random 不接受参数') : annotate(node, TYPES.Double);
  if (name === 'abs') {
    if (args.length !== 1 || !isGeneratorExpressionNumericType(args[0].type)) return invalidNode('abs 需要一个数字参数');
    return annotate(node, args[0].type);
  }
  if (['sin', 'cos', 'tan', 'log', 'exp', 'sqrt', 'floor', 'ceil', 'round', 'trunc', 'sign'].includes(name)) {
    if (args.length !== 1 || !isGeneratorExpressionNumericType(args[0].type)) return invalidNode(`${name} 需要一个数字参数`);
    return annotate(node, TYPES.Double);
  }
  if (name === 'pow') {
    if (args.length !== 2 || args.some((arg) => !isGeneratorExpressionNumericType(arg.type))) return invalidNode('pow 需要两个数字参数');
    return annotate(node, TYPES.Double);
  }
  if (name === 'min' || name === 'max') {
    if (args.length !== 2 || args.some((arg) => !isGeneratorExpressionNumericType(arg.type))) return invalidNode(`${name} 需要两个数字参数`);
    const common = commonNumericType(args[0].type, args[1].type);
    return common ? annotate(node, common) : invalidNode('数字类型不兼容');
  }
  if (name === 'clamp') {
    if (args.length !== 3 || args.some((arg) => !isGeneratorExpressionNumericType(arg.type))) return invalidNode('clamp 需要三个数字参数');
    const common = commonNumericType(args[0].type, commonNumericType(args[1].type, args[2].type));
    return common ? annotate(node, TYPES.Double) : invalidNode('数字类型不兼容');
  }
  if (name === 'lerp') {
    if (args.length !== 3 || args.some((arg) => !isGeneratorExpressionNumericType(arg.type))) return invalidNode('lerp 需要三个数字参数');
    return annotate(node, TYPES.Double);
  }
  return invalidNode(`未知函数：${name}`);
}

function checkBinaryNode(node, symbols) {
  const left = checkExpressionNode(node.left, symbols);
  if (!left.valid) return left;
  const right = checkExpressionNode(node.right, symbols);
  if (!right.valid) return right;
  const op = node.op;
  if (['&&', '||'].includes(op)) {
    if (left.type !== TYPES.Boolean || right.type !== TYPES.Boolean) return invalidNode(`${op} 需要 Boolean`);
    return annotate(node, TYPES.Boolean);
  }
  if (['==', '!=', '===', '!=='].includes(op)) {
    if (!commonExpressionType(left.type, right.type)) return invalidNode(`不能比较 ${left.type} 与 ${right.type}`);
    return annotate(node, TYPES.Boolean);
  }
  if (['<', '<=', '>', '>='].includes(op)) {
    if (!commonNumericType(left.type, right.type)) return invalidNode(`不能比较 ${left.type} 与 ${right.type}`);
    return annotate(node, TYPES.Boolean);
  }
  if (['+', '-', '*', '/', '%'].includes(op)) {
    if (isGeneratorExpressionNumericType(left.type) && isGeneratorExpressionNumericType(right.type)) {
      const common = commonNumericType(left.type, right.type);
      if (!common) return invalidNode(`数字类型不兼容：${left.type} ${op} ${right.type}`);
      if (op === '%' && [TYPES.Int, TYPES.Long].includes(common) && isStaticNumericZero(node.right)) {
        return invalidNode(`${common} 取余除数不能为 0`);
      }
      // Preview arithmetic uses JavaScript's real-number division.  Make the
      // Kotlin side explicit too, otherwise Int / Int would truncate before a
      // surrounding Double conversion.
      return annotate(node, op === '/' ? TYPES.Double : common);
    }
    if (['+', '-'].includes(op) && isGeneratorExpressionVectorType(left.type) && isGeneratorExpressionVectorType(right.type)) {
      if (left.type === right.type) return annotate(node, left.type);
      if (op === '+' && left.type === TYPES.RelativeLocation && right.type === TYPES.Vec3) {
        return annotate(node, TYPES.Vec3);
      }
      return invalidNode(`向量类型必须相同：${left.type} ${op} ${right.type}`);
    }
    if (['*', '/'].includes(op)) {
      if (isGeneratorExpressionVectorType(left.type) && isGeneratorExpressionNumericType(right.type)) return annotate(node, left.type);
      if (op === '*' && isGeneratorExpressionNumericType(left.type) && isGeneratorExpressionVectorType(right.type)) return annotate(node, right.type);
    }
    return invalidNode(`不支持 ${left.type} ${op} ${right.type}`);
  }
  return invalidNode(`不支持运算符 ${op}`);
}

function isStaticNumericZero(node) {
  if (!node) return false;
  if (node.kind === 'group') return isStaticNumericZero(node.expression);
  if (node.kind === 'unary' && ['+', '-'].includes(node.op)) return isStaticNumericZero(node.argument);
  return node.kind === 'literal'
    && isGeneratorExpressionNumericType(node.type)
    && (typeof node.value === 'bigint' ? node.value === 0n : Object.is(Number(node.value), 0));
}

function isStaticNonZeroInteger(node) {
  if (!node) return false;
  if (node.kind === 'group') return isStaticNonZeroInteger(node.expression);
  if (node.kind === 'unary' && ['+', '-'].includes(node.op)) return isStaticNonZeroInteger(node.argument);
  return node.kind === 'literal'
    && [TYPES.Int, TYPES.Long].includes(node.type)
    && (typeof node.value === 'bigint' ? node.value !== 0n : Number(node.value) !== 0);
}

function annotate(node, type, value) {
  const result = { valid: true, type, value };
  node.type = type;
  return result;
}

function invalidNode(message) {
  return { valid: false, type: TYPES.Unknown, value: undefined, message };
}

function integerLiteralRangeError(node) {
  if (node?.type !== TYPES.Int && node?.type !== TYPES.Long) return null;
  const magnitude = node.integerMagnitude ?? toRuntimeBigInt(node.value);
  const max = node.type === TYPES.Int ? JVM_INT_MAX : JVM_LONG_MAX;
  return magnitude > max
    ? invalidNode(`${node.type} 字面量超出范围：${node.raw}`)
    : null;
}

function isMinimumIntegerLiteral(node) {
  if (node?.kind !== 'literal' || (node.type !== TYPES.Int && node.type !== TYPES.Long)) return false;
  const magnitude = node.integerMagnitude ?? toRuntimeBigInt(node.value);
  const max = node.type === TYPES.Int ? JVM_INT_MAX : JVM_LONG_MAX;
  return magnitude === max + 1n;
}

function normalizeExpectedTypes(expected) {
  if (!expected) return [];
  if (expected instanceof Set) return Array.from(expected).map(normalizeGeneratorExpressionType);
  if (Array.isArray(expected)) return expected.map(normalizeGeneratorExpressionType);
  return [normalizeGeneratorExpressionType(expected)];
}

function commonExpressionType(left, right) {
  if (left === right) return left;
  return commonNumericType(left, right);
}

function commonNumericType(left, right) {
  const a = normalizeGeneratorExpressionType(left);
  const b = normalizeGeneratorExpressionType(right);
  if (!NUMERIC_TYPES.has(a) || !NUMERIC_TYPES.has(b)) return '';
  if (a === b) return a;
  if ((a === TYPES.Int && b === TYPES.Double) || (a === TYPES.Double && b === TYPES.Int)) return TYPES.Double;
  return '';
}

function emitKotlinExpression(node) {
  if (!node) return '';
  if (node.kind === 'literal') return emitLiteral(node);
  if (node.kind === 'identifier') return node.name;
  if (node.kind === 'group') return `(${emitKotlinExpression(node.expression)})`;
  if (node.kind === 'member') {
    const object = emitKotlinExpression(node.object);
    if (object === 'Math' && ['PI', 'E'].includes(node.property)) return node.property;
    return `${object}.${node.property}`;
  }
  if (node.kind === 'unary') return `${node.op}${wrapKotlinChild(node.argument)}`;
  if (node.kind === 'conditional') {
    const consequent = coerceKotlinNumber(emitKotlinExpression(node.consequent), node.consequent.type, node.type);
    const alternate = coerceKotlinNumber(emitKotlinExpression(node.alternate), node.alternate.type, node.type);
    return `if (${emitKotlinExpression(node.condition)}) ${consequent} else ${alternate}`;
  }
  if (node.kind === 'call') return emitKotlinCall(node);
  if (node.kind === 'binary') return emitKotlinBinary(node);
  return '';
}

function emitLiteral(node) {
  if (node.type === TYPES.String) return JSON.stringify(node.value);
  if (node.type === TYPES.Boolean) return node.value ? 'true' : 'false';
  if (node.value === null) return 'null';
  if (node.type === TYPES.Int) return String(Math.trunc(node.value));
  if (node.type === TYPES.Long) return `${String(node.raw || node.value).replace(/[lL]$/, '')}L`;
  if (node.type === TYPES.Float) return `${formatKotlinNumber(node.value)}f`;
  return formatKotlinNumber(node.value);
}

function emitKotlinCall(node) {
  const callee = node.callee;
  if (callee.kind === 'identifier') {
    const name = callee.name;
    const constructorType = CONSTRUCTORS.get(name);
    if (constructorType) {
      const componentType = constructorType === TYPES.Vector3f ? TYPES.Float : TYPES.Double;
      return `${name}(${node.args.map((arg) => coerceKotlinNumber(emitKotlinExpression(arg), arg.type, componentType)).join(', ')})`;
    }
    const args = node.args.map((arg) => emitKotlinExpression(arg));
    if (name === 'random') return 'Random.nextDouble()';
    if (['sin', 'cos', 'tan', 'log', 'exp', 'sqrt', 'floor', 'ceil', 'round', 'trunc', 'sign'].includes(name)) {
      const kotlinName = name === 'trunc' ? 'truncate' : name === 'log' ? 'ln' : name;
      return `${kotlinName}(${coerceKotlinNumber(args[0], node.args[0].type, TYPES.Double)})`;
    }
    if (name === 'pow') {
      return `${coerceKotlinNumber(args[0], node.args[0].type, TYPES.Double)}.pow(${coerceKotlinNumber(args[1], node.args[1].type, TYPES.Double)})`;
    }
    if (name === 'min' || name === 'max') {
      return `${name}(${node.args.map((arg, index) => coerceKotlinNumber(args[index], arg.type, node.type)).join(', ')})`;
    }
    if (name === 'lerp') return `lerp(${args.join(', ')})`;
    if (name === 'clamp') return `clamp(${args.join(', ')})`;
    return `${name}(${args.join(', ')})`;
  }
  if (callee.kind === 'member') {
    const object = emitKotlinExpression(callee.object);
    const args = node.args.map((arg) => emitKotlinExpression(arg));
    if (callee.property === 'normal' && VECTOR_TYPES.has(callee.object.type)) {
      const receiver = ['identifier', 'member', 'call'].includes(callee.object.kind) ? object : `(${object})`;
      return callee.object.type === TYPES.Vector3f
        ? `Vector3f(${receiver}).apply { if (lengthSquared() <= 1.0e-12f) zero() else normalize() }`
        : `${receiver}.normalize()`;
    }
    if (callee.property === 'toVector3f' && callee.object.type === TYPES.Vector3f) return object;
    if (object === 'Math' && BUILTIN_FUNCTIONS.has(callee.property)) {
      return emitKotlinCall({ ...node, callee: { kind: 'identifier', name: callee.property } });
    }
    if (['coerceAtLeast', 'coerceAtMost', 'coerceIn'].includes(callee.property)) {
      const coercedObject = coerceKotlinNumber(object, callee.object.type, node.type);
      const coercedArgs = node.args.map((arg, index) => coerceKotlinNumber(args[index], arg.type, node.type));
      return `${coercedObject}.${callee.property}(${coercedArgs.join(', ')})`;
    }
    return `${object}.${callee.property}(${args.join(', ')})`;
  }
  return '';
}

function emitKotlinBinary(node) {
  const left = emitKotlinExpression(node.left);
  const right = emitKotlinExpression(node.right);
  const leftType = node.left.type;
  const rightType = node.right.type;
  if (isGeneratorExpressionVectorType(node.type)) {
    if (['+', '-'].includes(node.op)) {
      const l = vectorKotlinOperand(node.left, left, node.type);
      const r = vectorKotlinOperand(node.right, right, node.type);
      return `${l} ${node.op} ${r}`;
    }
    if (node.op === '*') {
      if (isGeneratorExpressionVectorType(leftType)) return `${left} * ${coerceKotlinScalar(right, rightType)}`;
      return `${right} * ${coerceKotlinScalar(left, leftType)}`;
    }
    if (node.op === '/') return `${left} / ${coerceKotlinScalar(right, rightType)}`;
  }
  if (NUMERIC_TYPES.has(node.type) && NUMERIC_TYPES.has(leftType) && NUMERIC_TYPES.has(rightType)) {
    return `${coerceKotlinNumber(left, leftType, node.type)} ${node.op} ${coerceKotlinNumber(right, rightType, node.type)}`;
  }
  if (node.type === TYPES.Boolean && NUMERIC_TYPES.has(leftType) && NUMERIC_TYPES.has(rightType)) {
    const common = commonNumericType(leftType, rightType);
    if (common) {
      return `${coerceKotlinNumber(left, leftType, common)} ${node.op.replace('===', '==').replace('!==', '!=')} ${coerceKotlinNumber(right, rightType, common)}`;
    }
  }
  return `${left} ${node.op} ${right}`;
}

function vectorKotlinOperand(node, expression, targetType) {
  if (node.type === targetType) return expression;
  if (targetType === TYPES.Vec3 && node.type === TYPES.RelativeLocation) {
    return `${isSimpleKotlinReference(expression) ? expression : `(${expression})`}.toVector()`;
  }
  if (targetType === TYPES.Vector3f && node.type === TYPES.RelativeLocation) {
    return `${isSimpleKotlinReference(expression) ? expression : `(${expression})`}.toVector3f()`;
  }
  return expression;
}

function coerceKotlinScalar(expression, type) {
  if (type === TYPES.Double) return expression;
  return `(${expression}).toDouble()`;
}

function coerceKotlinNumber(expression, fromType, targetType) {
  if (!fromType || fromType === targetType) return expression;
  if (targetType === TYPES.Double) return `(${expression}).toDouble()`;
  if (targetType === TYPES.Float) return `(${expression}).toFloat()`;
  if (targetType === TYPES.Long) return `(${expression}).toLong()`;
  if (targetType === TYPES.Int) return `(${expression}).toInt()`;
  return expression;
}

function wrapKotlinChild(node) {
  const expression = emitKotlinExpression(node);
  return node?.kind === 'literal' || node?.kind === 'identifier' || node?.kind === 'member' ? expression : `(${expression})`;
}

function isSimpleKotlinReference(expression) {
  return /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)*$/.test(expression);
}

function formatKotlinNumber(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '0.0';
  if (Object.is(numeric, -0)) return '0.0';
  if (Number.isInteger(numeric)) return `${numeric}.0`;
  return String(numeric);
}

function createRuntimeScope(symbols, overrides = {}) {
  const scope = {};
  symbols.forEach((symbol, name) => {
    if (Object.prototype.hasOwnProperty.call(overrides, name)) scope[name] = normalizeRuntimeValue(symbol.type, overrides[name]);
    else if (Object.prototype.hasOwnProperty.call(symbol, 'value')) scope[name] = normalizeRuntimeValue(symbol.type, symbol.value);
  });
  Object.entries(overrides || {}).forEach(([name, value]) => {
    if (!Object.prototype.hasOwnProperty.call(scope, name)) scope[name] = value;
  });
  scope.PI = Math.PI;
  scope.E = Math.E;
  scope.Math = Math;
  scope.tick = scope.tick ?? 0;
  scope.progress = scope.progress ?? 0;
  return scope;
}

function evaluateExpressionNode(node, scope, symbols) {
  if (node.kind === 'literal') return node.value;
  if (node.kind === 'identifier') return scope[node.name];
  if (node.kind === 'group') return evaluateExpressionNode(node.expression, scope, symbols);
  if (node.kind === 'member') {
    const object = evaluateExpressionNode(node.object, scope, symbols);
    if (node.property === 'x' || node.property === 'y' || node.property === 'z') return object?.[node.property];
    if (node.property === 'PI' && object === Math) return Math.PI;
    if (node.property === 'E' && object === Math) return Math.E;
    return object;
  }
  if (node.kind === 'unary') {
    const value = evaluateExpressionNode(node.argument, scope, symbols);
    if (node.op === '-') {
      if (isVectorRuntimeValue(value)) return mapVector(value, (item) => -item);
      if (node.type === TYPES.Long) return wrapJvmLong(-toRuntimeBigInt(value));
      if (node.type === TYPES.Int) return wrapJvmInt(-toRuntimeBigInt(value));
      return -Number(value);
    }
    if (node.op === '+') {
      if (isVectorRuntimeValue(value)) return value;
      if (node.type === TYPES.Long) return wrapJvmLong(value);
      if (node.type === TYPES.Int) return wrapJvmInt(value);
      return Number(value);
    }
    return !value;
  }
  if (node.kind === 'conditional') {
    return evaluateExpressionNode(node.condition, scope, symbols)
      ? evaluateExpressionNode(node.consequent, scope, symbols)
      : evaluateExpressionNode(node.alternate, scope, symbols);
  }
  if (node.kind === 'call') {
    return normalizeJvmIntegerResult(node.type, evaluateCallNode(node, scope, symbols));
  }
  if (node.kind === 'binary') {
    const left = evaluateExpressionNode(node.left, scope, symbols);
    const right = evaluateExpressionNode(node.right, scope, symbols);
    return evaluateBinaryNode(node.op, left, right, node.type);
  }
  return undefined;
}

function evaluateCallNode(node, scope, symbols) {
  const args = node.args.map((arg) => evaluateExpressionNode(arg, scope, symbols));
  if (node.callee.kind === 'identifier') {
    const name = node.callee.name;
    const constructorType = CONSTRUCTORS.get(name);
    if (constructorType) return makeVector(constructorType, args);
    if (name === 'abs' && node.type === TYPES.Long) {
      const value = toRuntimeBigInt(args[0]);
      return value < 0n ? -value : value;
    }
    if ((name === 'min' || name === 'max') && node.type === TYPES.Long) {
      const left = toRuntimeBigInt(args[0]);
      const right = toRuntimeBigInt(args[1]);
      return name === 'min'
        ? (left < right ? left : right)
        : (left > right ? left : right);
    }
    const fn = {
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
    }[name];
    if (fn) return fn(...args.map((value) => typeof value === 'bigint' ? Number(value) : value));
  }
  if (node.callee.kind === 'member') {
    const object = evaluateExpressionNode(node.callee.object, scope, symbols);
    const name = node.callee.property;
    if (object === Math && typeof Math[name] === 'function') {
      if (name === 'abs' && node.type === TYPES.Long) {
        const value = toRuntimeBigInt(args[0]);
        return value < 0n ? -value : value;
      }
      if ((name === 'min' || name === 'max') && node.type === TYPES.Long) {
        const left = toRuntimeBigInt(args[0]);
        const right = toRuntimeBigInt(args[1]);
        return name === 'min'
          ? (left < right ? left : right)
          : (left > right ? left : right);
      }
      return Math[name](...args.map((value) => typeof value === 'bigint' ? Number(value) : value));
    }
    if (name === 'toDouble') return Number(object);
    if (name === 'toFloat') return Number(object);
    if (name === 'toInt') return toJvmInt(object);
    if (name === 'toLong') return toJvmLong(object);
    if (name === 'toVector' && isVectorRuntimeValue(object)) return makeVector(TYPES.Vec3, [object.x, object.y, object.z]);
    if (name === 'toVector3f' && isVectorRuntimeValue(object)) return makeVector(TYPES.Vector3f, [object.x, object.y, object.z]);
    if (name === 'normal' && isVectorRuntimeValue(object)) {
      const length = Math.hypot(object.x, object.y, object.z);
      if (object.__generatorVectorType === TYPES.RelativeLocation && length <= 1e-6) {
        return makeVector(TYPES.RelativeLocation, [1, 0, 0]);
      }
      if (object.__generatorVectorType === TYPES.Vec3 && length < 1e-4) {
        return makeVector(TYPES.Vec3, [0, 0, 0]);
      }
      if (object.__generatorVectorType === TYPES.Vector3f && length <= 1e-6) {
        return makeVector(TYPES.Vector3f, [0, 0, 0]);
      }
      return mapVector(object, (value) => value / length);
    }
    if (node.type === TYPES.Long && ['coerceAtLeast', 'coerceAtMost', 'coerceIn'].includes(name)) {
      const value = toRuntimeBigInt(object);
      const min = toRuntimeBigInt(args[0]);
      if (name === 'coerceAtLeast') return value > min ? value : min;
      if (name === 'coerceAtMost') return value < min ? value : min;
      const max = toRuntimeBigInt(args[1]);
      return value < min ? min : value > max ? max : value;
    }
    if (name === 'coerceAtLeast') return Math.max(Number(object), Number(args[0]));
    if (name === 'coerceAtMost') return Math.min(Number(object), Number(args[0]));
    if (name === 'coerceIn') return Math.min(Math.max(Number(object), Number(args[0])), Number(args[1]));
  }
  return undefined;
}

function evaluateBinaryNode(op, left, right, type) {
  if (isVectorRuntimeValue(left) || isVectorRuntimeValue(right)) {
    if (op === '+') return vectorBinary(left, right, (a, b) => a + b, type);
    if (op === '-') return vectorBinary(left, right, (a, b) => a - b, type);
    if (op === '*') {
      if (isVectorRuntimeValue(left)) return mapVector(left, (value) => value * Number(right));
      return mapVector(right, (value) => value * Number(left));
    }
    if (op === '/') return mapVector(left, (value) => value / Number(right));
  }
  if (type === TYPES.Long && ['+', '-', '*', '%'].includes(op)) {
    const a = toRuntimeBigInt(left);
    const b = toRuntimeBigInt(right);
    if (op === '+') return wrapJvmLong(a + b);
    if (op === '-') return wrapJvmLong(a - b);
    if (op === '*') return wrapJvmLong(a * b);
    return wrapJvmLong(a % b);
  }
  if (type === TYPES.Int && ['+', '-', '*', '%'].includes(op)) {
    const a = BigInt(wrapJvmInt(left));
    const b = BigInt(wrapJvmInt(right));
    if (op === '+') return wrapJvmInt(a + b);
    if (op === '-') return wrapJvmInt(a - b);
    if (op === '*') return wrapJvmInt(a * b);
    return wrapJvmInt(a % b);
  }
  if (NUMERIC_TYPES.has(type) && (typeof left === 'bigint' || typeof right === 'bigint')) {
    const a = Number(left);
    const b = Number(right);
    if (op === '+') return a + b;
    if (op === '-') return a - b;
    if (op === '*') return a * b;
    if (op === '/') return a / b;
    if (op === '%') return a % b;
  }
  if (op === '+') return left + right;
  if (op === '-') return Number(left) - Number(right);
  if (op === '*') return Number(left) * Number(right);
  if (op === '/') return Number(left) / Number(right);
  if (op === '%') return Number(left) % Number(right);
  if (op === '&&') return Boolean(left && right);
  if (op === '||') return Boolean(left || right);
  if (op === '== ' || op === '===' || op === '==') return numericRuntimeEquals(left, right);
  if (op === '!=' || op === '!==') return !numericRuntimeEquals(left, right);
  if (op === '<') return left < right;
  if (op === '<=') return left <= right;
  if (op === '>') return left > right;
  if (op === '>=') return left >= right;
  return undefined;
}

function vectorBinary(left, right, operation, type) {
  const a = isVectorRuntimeValue(left) ? left : makeVector(type, [Number(left), Number(left), Number(left)]);
  const b = isVectorRuntimeValue(right) ? right : makeVector(type, [Number(right), Number(right), Number(right)]);
  return makeVector(type, [operation(a.x, b.x), operation(a.y, b.y), operation(a.z, b.z)]);
}

function makeVector(type, components = []) {
  return {
    __generatorVectorType: type,
    x: Number(components[0] ?? 0),
    y: Number(components[1] ?? 0),
    z: Number(components[2] ?? 0)
  };
}

function mapVector(vector, mapper) {
  return makeVector(vector.__generatorVectorType || TYPES.Vec3, [mapper(vector.x), mapper(vector.y), mapper(vector.z)]);
}

function isVectorRuntimeValue(value) {
  return Boolean(value && typeof value === 'object' && Number.isFinite(Number(value.x))
    && Number.isFinite(Number(value.y)) && Number.isFinite(Number(value.z)));
}

function normalizeRuntimeValue(type, value) {
  const normalized = normalizeGeneratorExpressionType(type);
  if (VECTOR_TYPES.has(normalized)) {
    if (isVectorRuntimeValue(value)) return makeVector(normalized, [value.x, value.y, value.z]);
    const match = String(value ?? '').trim().match(VECTOR_TEXT_PATTERN);
    if (match) {
      const parts = splitVectorArguments(match[2]).map((part) => Number(part.replace(/[fFdDlL]$/, '')));
      return makeVector(normalized, parts);
    }
    if (Array.isArray(value)) return makeVector(normalized, value);
    return makeVector(normalized, [0, 0, 0]);
  }
  if (normalized === TYPES.Boolean) return value === true || value === 'true' || value === 1;
  if (normalized === TYPES.Long) return wrapJvmLong(value);
  if (normalized === TYPES.Int) return wrapJvmInt(value);
  if (NUMERIC_TYPES.has(normalized)) return Number(value ?? 0);
  return value;
}

function inferGeneratorExpressionValueType(value) {
  if (isVectorRuntimeValue(value)) return value.__generatorVectorType || TYPES.Vec3;
  if (typeof value === 'bigint') return TYPES.Long;
  if (typeof value === 'boolean') return TYPES.Boolean;
  if (typeof value === 'number') return Number.isInteger(value) ? TYPES.Int : TYPES.Double;
  const text = String(value ?? '').trim();
  if (VECTOR_TEXT_PATTERN.test(text)) return text.match(VECTOR_TEXT_PATTERN)[1];
  if (/^-?\d+$/.test(text)) return TYPES.Int;
  if (/^-?(?:\d+\.\d*|\.\d+)(?:[eE][+-]?\d+)?[fF]?$/.test(text)) return TYPES.Double;
  return TYPES.String;
}

function toRuntimeBigInt(value) {
  if (typeof value === 'bigint') return value;
  if (typeof value === 'number') return BigInt(Math.trunc(Number.isFinite(value) ? value : 0));
  const text = String(value ?? '0').trim().replace(/[lL]$/, '');
  if (/^[+-]?\d+$/.test(text)) return BigInt(text);
  const numeric = Number(text);
  return BigInt(Math.trunc(Number.isFinite(numeric) ? numeric : 0));
}

function wrapJvmInt(value) {
  return Number(BigInt.asIntN(32, toRuntimeBigInt(value)));
}

function wrapJvmLong(value) {
  return BigInt.asIntN(64, toRuntimeBigInt(value));
}

function normalizeJvmIntegerResult(type, value) {
  if (type === TYPES.Int) return wrapJvmInt(value);
  if (type === TYPES.Long) return wrapJvmLong(value);
  return value;
}

function toJvmInt(value) {
  if (typeof value === 'bigint') return wrapJvmInt(value);
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return 0;
  if (numeric >= Number(JVM_INT_MAX)) return Number(JVM_INT_MAX);
  if (numeric <= Number(JVM_INT_MIN)) return Number(JVM_INT_MIN);
  return Math.trunc(numeric);
}

function toJvmLong(value) {
  if (typeof value === 'bigint') return wrapJvmLong(value);
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return 0n;
  if (numeric >= Number(JVM_LONG_MAX)) return JVM_LONG_MAX;
  if (numeric <= Number(JVM_LONG_MIN)) return JVM_LONG_MIN;
  return BigInt(Math.trunc(numeric));
}

function numericRuntimeEquals(left, right) {
  if (typeof left === 'bigint' || typeof right === 'bigint') {
    try {
      return toRuntimeBigInt(left) === toRuntimeBigInt(right);
    } catch {
      return false;
    }
  }
  return left === right;
}

function splitVectorArguments(raw) {
  const result = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < raw.length; index += 1) {
    if (raw[index] === '(') depth += 1;
    else if (raw[index] === ')') depth -= 1;
    else if (raw[index] === ',' && depth === 0) {
      result.push(raw.slice(start, index).trim());
      start = index + 1;
    }
  }
  result.push(raw.slice(start).trim());
  return result;
}
