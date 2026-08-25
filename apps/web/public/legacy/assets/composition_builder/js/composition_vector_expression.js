const VECTOR_TYPES = new Set(["Vec3", "RelativeLocation", "Vector3f"]);
const NUMBER_TYPE = "Number";

const BINARY_PRECEDENCE = new Map([
    ["||", 1],
    ["&&", 2],
    ["==", 3], ["!=", 3], ["===", 3], ["!==", 3],
    ["<", 4], ["<=", 4], [">", 4], [">=", 4],
    ["+", 5], ["-", 5],
    ["*", 6], ["/", 6], ["%", 6]
]);

const VECTOR_PARAMETER_TYPES = Object.freeze({
    rotateToPoint: ["RelativeLocation"],
    rotateToWithAngle: ["RelativeLocation", ""],
    teleportTo: ["Vec3"],
    moveToWithPhysics: ["Vec3"],
    setColor: ["Vector3f"]
});

function normalizeVectorType(rawType) {
    const type = String(rawType || "").trim();
    if (type === "Vec3d") return "Vec3";
    return VECTOR_TYPES.has(type) ? type : "";
}

function normalizeMapping(rawMapping) {
    return String(rawMapping || "").trim().toLowerCase() === "yarn" ? "yarn" : "mojmap";
}

function tokenize(source) {
    const tokens = [];
    let index = 0;
    while (index < source.length) {
        const ch = source[index];
        if (/\s/.test(ch)) {
            index += 1;
            continue;
        }
        const number = source.slice(index).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+\-]?\d+)?[fFdDlL]?/);
        if (number) {
            tokens.push({ kind: "number", value: number[0] });
            index += number[0].length;
            continue;
        }
        const identifier = source.slice(index).match(/^this@[A-Za-z_][A-Za-z0-9_]*/)
            || source.slice(index).match(/^[A-Za-z_$][A-Za-z0-9_$]*/);
        if (identifier) {
            tokens.push({ kind: "identifier", value: identifier[0] });
            index += identifier[0].length;
            continue;
        }
        if (ch === "\"" || ch === "'" || ch === "`") {
            const quote = ch;
            const start = index;
            index += 1;
            while (index < source.length) {
                if (source[index] === "\\") {
                    index += 2;
                    continue;
                }
                if (source[index] === quote) {
                    index += 1;
                    break;
                }
                index += 1;
            }
            tokens.push({ kind: "string", value: source.slice(start, index) });
            continue;
        }
        const operator = ["===", "!==", "==", "!=", "<=", ">=", "&&", "||"]
            .find((value) => source.startsWith(value, index));
        if (operator) {
            tokens.push({ kind: "operator", value: operator });
            index += operator.length;
            continue;
        }
        if ("()+-*/%?:,.<>!".includes(ch)) {
            tokens.push({ kind: "operator", value: ch });
            index += 1;
            continue;
        }
        throw new Error(`unsupported token: ${ch}`);
    }
    tokens.push({ kind: "eof", value: "" });
    return tokens;
}

class VectorExpressionParser {
    constructor(source) {
        this.tokens = tokenize(source);
        this.index = 0;
    }

    current() {
        return this.tokens[this.index];
    }

    consume(value = "") {
        const token = this.current();
        if (value && token.value !== value) throw new Error(`expected ${value}`);
        this.index += 1;
        return token;
    }

    parse() {
        const expression = this.parseExpression(0);
        if (this.current().kind !== "eof") throw new Error("unexpected trailing expression");
        return expression;
    }

    parseExpression(minPrecedence) {
        let left = this.parseUnary();
        while (BINARY_PRECEDENCE.has(this.current().value)
            && BINARY_PRECEDENCE.get(this.current().value) >= minPrecedence) {
            const operator = this.consume().value;
            const precedence = BINARY_PRECEDENCE.get(operator);
            const right = this.parseExpression(precedence + 1);
            left = { kind: "binary", operator, left, right };
        }
        if (minPrecedence === 0 && this.current().value === "?") {
            this.consume("?");
            const consequent = this.parseExpression(0);
            this.consume(":");
            const alternate = this.parseExpression(0);
            left = { kind: "conditional", condition: left, consequent, alternate };
        }
        return left;
    }

    parseUnary() {
        if (["+", "-", "!"].includes(this.current().value)) {
            return { kind: "unary", operator: this.consume().value, argument: this.parseUnary() };
        }
        return this.parsePostfix();
    }

    parsePostfix() {
        let node = this.parsePrimary();
        while (true) {
            if (this.current().value === ".") {
                this.consume(".");
                const property = this.consume();
                if (property.kind !== "identifier") throw new Error("expected member name");
                node = { kind: "member", object: node, property: property.value };
                continue;
            }
            if (this.current().value === "(") {
                this.consume("(");
                const args = [];
                if (this.current().value !== ")") {
                    while (true) {
                        args.push(this.parseExpression(0));
                        if (this.current().value !== ",") break;
                        this.consume(",");
                    }
                }
                this.consume(")");
                node = { kind: "call", callee: node, args };
                continue;
            }
            break;
        }
        return node;
    }

    parsePrimary() {
        const token = this.current();
        if (token.kind === "number") {
            this.consume();
            return { kind: "literal", type: NUMBER_TYPE, code: token.value };
        }
        if (token.kind === "string") {
            this.consume();
            return { kind: "literal", type: "", code: token.value };
        }
        if (token.kind === "identifier") {
            this.consume();
            return { kind: "identifier", name: token.value };
        }
        if (token.value === "(") {
            this.consume("(");
            const expression = this.parseExpression(0);
            this.consume(")");
            return { kind: "group", expression };
        }
        throw new Error("expected expression");
    }
}

function createSymbolMap(rawSymbols) {
    const symbols = new Map([
        ["rel", "RelativeLocation"],
        ["axis", "RelativeLocation"]
    ]);
    if (rawSymbols instanceof Map) {
        for (const [name, type] of rawSymbols.entries()) {
            const normalized = normalizeVectorType(type?.type || type);
            if (normalized) symbols.set(String(name), normalized);
        }
    } else if (Array.isArray(rawSymbols)) {
        for (const symbol of rawSymbols) {
            const name = String(symbol?.name || "").trim();
            const type = normalizeVectorType(symbol?.type);
            if (name && type) symbols.set(name, type);
        }
    } else if (rawSymbols && typeof rawSymbols === "object") {
        for (const [name, rawType] of Object.entries(rawSymbols)) {
            const type = normalizeVectorType(rawType?.type || rawType);
            if (type) symbols.set(name, type);
        }
    }
    return symbols;
}

function precedenceOf(result) {
    return Number.isFinite(Number(result?.precedence)) ? Number(result.precedence) : 10;
}

function wrap(result, minPrecedence = 9) {
    return precedenceOf(result) < minPrecedence ? `(${result.code})` : result.code;
}

function convertVector(result, targetType) {
    const target = normalizeVectorType(targetType);
    if (!target || !normalizeVectorType(result.type) || result.type === target) return result;
    const receiver = wrap(result);
    if (target === "RelativeLocation") {
        return { type: target, code: `${receiver}.asRelative()`, precedence: 9, changed: true };
    }
    if (target === "Vec3") {
        if (result.type === "RelativeLocation") {
            return { type: target, code: `${receiver}.toVector()`, precedence: 9, changed: true };
        }
        return {
            type: target,
            code: `Vec3(${receiver}.x.toDouble(), ${receiver}.y.toDouble(), ${receiver}.z.toDouble())`,
            precedence: 9,
            changed: true
        };
    }
    if (result.type === "RelativeLocation") {
        return { type: target, code: `${receiver}.toVector3f()`, precedence: 9, changed: true };
    }
    return {
        type: target,
        code: `Vector3f(${receiver}.x.toFloat(), ${receiver}.y.toFloat(), ${receiver}.z.toFloat())`,
        precedence: 9,
        changed: true
    };
}

function isNumericLiteralResult(result) {
    return result?.type === NUMBER_TYPE
        && /^[+\-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+\-]?\d+)?[fFdDlL]?$/.test(String(result.code || ""));
}

function convertVectorConstructorArgument(result, type) {
    if (isNumericLiteralResult(result)) return result;
    const conversion = type === "Vector3f" ? "toFloat" : "toDouble";
    if (new RegExp(`\\.${conversion}\\(\\)$`).test(String(result?.code || ""))) return result;
    return {
        type: NUMBER_TYPE,
        code: `${wrap(result)}.${conversion}()`,
        precedence: 9,
        changed: true
    };
}

function vectorConstructor(type, args) {
    const constructorArgs = args.length === 3
        ? args.map((arg) => convertVectorConstructorArgument(arg, type))
        : args;
    return {
        type,
        code: `${type}(${constructorArgs.map((arg) => arg.code).join(", ")})`,
        precedence: 9,
        changed: constructorArgs.some((arg) => arg.changed)
    };
}

function combineChanged(...results) {
    return results.some((result) => result?.changed === true);
}

function emitNode(node, context) {
    if (node.kind === "literal") {
        return { type: node.type, code: node.code, precedence: 10, changed: false };
    }
    if (node.kind === "identifier") {
        let type = context.symbols.get(node.name) || "";
        if (!type && /^shapeRel\d+$/.test(node.name)) type = "RelativeLocation";
        return { type, code: node.name, precedence: 10, changed: false };
    }
    if (node.kind === "group") {
        const expression = emitNode(node.expression, context);
        return { ...expression, code: `(${expression.code})`, precedence: 10 };
    }
    if (node.kind === "unary") {
        const argument = emitNode(node.argument, context);
        return {
            type: argument.type,
            code: `${node.operator}${wrap(argument, 8)}`,
            precedence: 8,
            changed: argument.changed
        };
    }
    if (node.kind === "member") {
        const object = emitNode(node.object, context);
        let type = "";
        if (VECTOR_TYPES.has(object.type) && ["x", "y", "z"].includes(node.property)) type = NUMBER_TYPE;
        if ((object.code === "thisAt"
            || object.code.startsWith("thisAt.")
            || object.code.startsWith("this@"))
            && context.symbols.has(node.property)) {
            type = context.symbols.get(node.property);
        }
        if ((object.code === "Vec3" || object.code === "Vec3d") && node.property === "ZERO") type = "Vec3";
        return {
            type,
            code: `${wrap(object)}.${node.property}`,
            precedence: 9,
            changed: object.changed
        };
    }
    if (node.kind === "binary") {
        let left = emitNode(node.left, context);
        let right = emitNode(node.right, context);
        const operator = node.operator === "===" ? "==" : node.operator === "!==" ? "!=" : node.operator;
        let type = "";
        if (VECTOR_TYPES.has(left.type) && VECTOR_TYPES.has(right.type)) {
            right = convertVector(right, left.type);
            type = left.type;
        } else if (VECTOR_TYPES.has(left.type) && right.type === NUMBER_TYPE && ["*", "/"].includes(node.operator)) {
            type = left.type;
        } else if (left.type === NUMBER_TYPE && VECTOR_TYPES.has(right.type) && node.operator === "*") {
            type = right.type;
        } else if (left.type === NUMBER_TYPE && right.type === NUMBER_TYPE) {
            type = NUMBER_TYPE;
        }
        const precedence = BINARY_PRECEDENCE.get(node.operator) || 1;
        return {
            type,
            code: `${wrap(left, precedence)} ${operator} ${wrap(right, precedence + 1)}`,
            precedence,
            changed: operator !== node.operator || combineChanged(left, right)
        };
    }
    if (node.kind === "conditional") {
        const condition = emitNode(node.condition, context);
        let consequent = emitNode(node.consequent, context);
        let alternate = emitNode(node.alternate, context);
        let type = consequent.type === alternate.type ? consequent.type : "";
        if (VECTOR_TYPES.has(consequent.type) && VECTOR_TYPES.has(alternate.type)) {
            alternate = convertVector(alternate, consequent.type);
            type = consequent.type;
        }
        return {
            type,
            code: `if (${condition.code}) ${consequent.code} else ${alternate.code}`,
            precedence: 0,
            changed: true
        };
    }
    if (node.kind === "call") return emitCall(node, context);
    throw new Error("unsupported expression node");
}

function emitCall(node, context) {
    const callee = emitNode(node.callee, context);
    let args = node.args.map((arg) => emitNode(arg, context));
    if (node.callee.kind === "identifier") {
        const constructorType = normalizeVectorType(node.callee.name);
        if (constructorType) {
            if (args.length === 1 && VECTOR_TYPES.has(args[0].type)) return convertVector(args[0], constructorType);
            return vectorConstructor(constructorType, args);
        }
    }
    if (node.callee.kind === "member") {
        const receiver = emitNode(node.callee.object, context);
        const method = node.callee.property;
        if (node.callee.object.kind === "identifier"
            && node.callee.object.name === "RelativeLocation"
            && ["of", "xAxis", "yAxis", "zAxis", "zero"].includes(method)) {
            if (method === "of") {
                if (args.length === 1 && VECTOR_TYPES.has(args[0].type)) {
                    return convertVector(args[0], "RelativeLocation");
                }
                if (args.length === 2) {
                    args = args.map((arg) => convertVector(arg, "Vec3"));
                }
            }
            return { type: "RelativeLocation", code: `${receiver.code}.${method}(${args.map((arg) => arg.code).join(", ")})`, precedence: 9, changed: combineChanged(receiver, ...args) };
        }
        if (VECTOR_TYPES.has(receiver.type)) {
            if (["clone", "copy"].includes(method) && args.length === 0) {
                if (receiver.type === "Vec3") return { ...receiver, changed: true };
                const code = receiver.type === "Vector3f"
                    ? `Vector3f(${wrap(receiver)})`
                    : `${wrap(receiver)}.${method}()`;
                return { type: receiver.type, code, precedence: 9, changed: true };
            }
            if (["asRelative", "toVector", "asVec3", "toVector3f"].includes(method) && args.length === 0) {
                const target = method === "asRelative" ? "RelativeLocation" : method === "toVector3f" ? "Vector3f" : "Vec3";
                return convertVector(receiver, target);
            }
            if (["add", "remove", "subtract"].includes(method) && (args.length === 1 || args.length === 3)) {
                let right = args.length === 3 ? vectorConstructor(receiver.type, args) : args[0];
                if (VECTOR_TYPES.has(right.type)) right = convertVector(right, receiver.type);
                const operator = method === "add" ? "+" : "-";
                return {
                    type: receiver.type,
                    code: `${wrap(receiver, 5)} ${operator} ${wrap(right, 6)}`,
                    precedence: 5,
                    changed: true
                };
            }
            if (["multiply", "multiple", "mul", "multiplyClone", "divide", "div"].includes(method) && args.length === 1) {
                let right = args[0];
                if (VECTOR_TYPES.has(right.type)) right = convertVector(right, receiver.type);
                const operator = ["divide", "div"].includes(method) ? "/" : "*";
                return {
                    type: receiver.type,
                    code: `${wrap(receiver, 6)} ${operator} ${wrap(right, 7)}`,
                    precedence: 6,
                    changed: true
                };
            }
            if (["dot", "cross"].includes(method) && args.length === 1) {
                if (VECTOR_TYPES.has(args[0].type)) args[0] = convertVector(args[0], receiver.type);
                const mappedMethod = receiver.type === "Vec3" && context.mapping === "yarn"
                    ? (method === "dot" ? "dotProduct" : "crossProduct")
                    : method;
                const receiverCode = receiver.type === "Vector3f" && method === "cross"
                    ? `Vector3f(${wrap(receiver)})`
                    : wrap(receiver);
                return {
                    type: method === "dot" ? NUMBER_TYPE : receiver.type,
                    code: `${receiverCode}.${mappedMethod}(${args[0].code})`,
                    precedence: 9,
                    changed: receiverCode !== wrap(receiver)
                        || mappedMethod !== method
                        || combineChanged(receiver, args[0])
                };
            }
            if (["normalize", "length", "lengthSquared", "distance"].includes(method)) {
                if (method === "distance" && args.length === 1 && VECTOR_TYPES.has(args[0].type)) {
                    args[0] = convertVector(args[0], receiver.type);
                }
                if (method === "lengthSquared" && receiver.type === "RelativeLocation" && args.length === 0) {
                    return {
                        type: NUMBER_TYPE,
                        code: `${wrap(receiver)}.let { value -> value.dot(value) }`,
                        precedence: 9,
                        changed: true
                    };
                }
                const mappedMethod = receiver.type === "Vec3"
                    ? (method === "lengthSquared"
                        ? (context.mapping === "yarn" ? "lengthSquared" : "lengthSqr")
                        : (method === "distance" ? "distanceTo" : method))
                    : method;
                const receiverCode = receiver.type === "Vector3f" && method === "normalize"
                    ? `Vector3f(${wrap(receiver)})`
                    : wrap(receiver);
                return {
                    type: method === "normalize" ? receiver.type : NUMBER_TYPE,
                    code: `${receiverCode}.${mappedMethod}(${args.map((arg) => arg.code).join(", ")})`,
                    precedence: 9,
                    changed: receiverCode !== wrap(receiver)
                        || mappedMethod !== method
                        || combineChanged(receiver, ...args)
                };
            }
        }
    }
    const callName = node.callee.kind === "identifier"
        ? node.callee.name
        : (node.callee.kind === "member" ? node.callee.property : "");
    const expectedTypes = VECTOR_PARAMETER_TYPES[callName] || [];
    args = args.map((arg, index) => expectedTypes[index] ? convertVector(arg, expectedTypes[index]) : arg);
    return {
        type: "",
        code: `${callee.code}(${args.map((arg) => arg.code).join(", ")})`,
        precedence: 9,
        changed: combineChanged(callee, ...args)
    };
}

function parseAndEmit(source, symbols, expectedType = "", mapping = "mojmap") {
    const ast = new VectorExpressionParser(source).parse();
    let result = emitNode(ast, { symbols, mapping: normalizeMapping(mapping) });
    if (expectedType) result = convertVector(result, expectedType);
    return result;
}

export function rewriteCompositionVectorExpressionToKotlin(sourceRaw, options = {}) {
    const source = String(sourceRaw || "").trim();
    if (!source) return source;
    try {
        const result = parseAndEmit(source, createSymbolMap(options.symbols), options.expectedType, options.mapping);
        return result.changed ? result.code : source;
    } catch {
        return source;
    }
}

export function rewriteCompositionVectorCodeToKotlin(sourceRaw, options = {}) {
    const source = String(sourceRaw || "");
    const symbols = createSymbolMap(options.symbols);
    const lines = source.replace(/\r\n/g, "\n").split("\n");
    return lines.map((line) => {
        const semicolon = /;\s*$/.test(line) ? ";" : "";
        const body = semicolon ? line.replace(/;\s*$/, "") : line;
        const declaration = body.match(/^(\s*(?:const|let|var|val)\s+([A-Za-z_$][A-Za-z0-9_$]*)\s*=\s*)([\s\S]+)$/);
        if (declaration) {
            try {
                const result = parseAndEmit(declaration[3], symbols, "", options.mapping);
                if (VECTOR_TYPES.has(result.type)) symbols.set(declaration[2], result.type);
                return result.changed ? `${declaration[1]}${result.code}${semicolon}` : line;
            } catch {
                return line;
            }
        }
        const assignment = body.match(/^(\s*([A-Za-z_$][A-Za-z0-9_$]*)\s*=(?!=)\s*)([\s\S]+)$/);
        if (assignment) {
            try {
                const expectedType = symbols.get(assignment[2]) || options.expectedType;
                const result = parseAndEmit(assignment[3], symbols, expectedType, options.mapping);
                return result.changed ? `${assignment[1]}${result.code}${semicolon}` : line;
            } catch {
                return line;
            }
        }
        try {
            const result = parseAndEmit(body.trim(), symbols, options.expectedType, options.mapping);
            if (!result.changed) return line;
            const indent = body.match(/^\s*/)?.[0] || "";
            return `${indent}${result.code}${semicolon}`;
        } catch {
            return line;
        }
    }).join("\n");
}

export function compositionVectorApiTypeDeclaration() {
    return `interface CompositionVector<TSelf> {
  x: number;
  y: number;
  z: number;
  clone(): TSelf;
  copy(): TSelf;
  add(other: CompositionVector<any>): TSelf;
  add(x: number, y: number, z: number): TSelf;
  remove(other: CompositionVector<any>): TSelf;
  remove(x: number, y: number, z: number): TSelf;
  subtract(other: CompositionVector<any>): TSelf;
  multiply(value: number | CompositionVector<any>): TSelf;
  multiple(value: number | CompositionVector<any>): TSelf;
  mul(value: number | CompositionVector<any>): TSelf;
  multiplyClone(value: number | CompositionVector<any>): TSelf;
  divide(value: number | CompositionVector<any>): TSelf;
  div(value: number | CompositionVector<any>): TSelf;
  normalize(): TSelf;
  dot(other: CompositionVector<any>): number;
  cross(other: CompositionVector<any>): TSelf;
  length(): number;
  lengthSquared(): number;
  distance(other: CompositionVector<any>): number;
  asRelative(): RelativeLocationValue;
  toVector(): Vec3Value;
  asVec3(): Vec3Value;
  toVector3f(): Vector3fValue;
}`;
}
