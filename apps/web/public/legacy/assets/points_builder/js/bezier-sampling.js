const EPSILON = 1e-9;
const DEFAULT_FLATNESS = 1e-3;
const DEFAULT_MAX_DEPTH = 12;
const DEFAULT_MAX_SAMPLES = 4096;
const segmentCache = new Map();

function num(value, fallback = 0) {
    const next = Number(value);
    return Number.isFinite(next) ? next : fallback;
}

function point(x = 0, y = 0, z = 0) {
    return { x: num(x), y: num(y), z: num(z) };
}

function add(a, b) {
    return point(a.x + b.x, a.y + b.y, a.z + b.z);
}

function sub(a, b) {
    return point(a.x - b.x, a.y - b.y, a.z - b.z);
}

function scale(a, value) {
    return point(a.x * value, a.y * value, a.z * value);
}

function length(a) {
    return Math.hypot(a.x, a.y, a.z);
}

function cross(a, b) {
    return point(
        a.y * b.z - a.z * b.y,
        a.z * b.x - a.x * b.z,
        a.x * b.y - a.y * b.x
    );
}

function clone(a) {
    return point(a?.x, a?.y, a?.z);
}

function toArray(a) {
    return [num(a?.x), num(a?.y), num(a?.z)];
}

function fromArray(a) {
    return point(a?.[0], a?.[1], a?.[2]);
}

function arrayDistance(a, b) {
    return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function midpoint(a, b) {
    return scale(add(a, b), 0.5);
}

function cubicFlatness(p0, p1, p2, p3) {
    const polygonLength = length(sub(p1, p0)) + length(sub(p2, p1)) + length(sub(p3, p2));
    const chord = sub(p3, p0);
    const chordLength = length(chord);
    const distance = (control) => chordLength <= EPSILON
        ? length(sub(control, p0))
        : length(cross(chord, sub(control, p0))) / chordLength;
    return Math.max(Math.max(0, polygonLength - chordLength), distance(p1), distance(p2));
}

function splitCubic(p0, p1, p2, p3) {
    const q0 = midpoint(p0, p1);
    const q1 = midpoint(p1, p2);
    const q2 = midpoint(p2, p3);
    const r0 = midpoint(q0, q1);
    const r1 = midpoint(q1, q2);
    const center = midpoint(r0, r1);
    return {
        left: [p0, q0, r0, center],
        right: [center, r1, q2, p3]
    };
}

function segmentSignature(segment, flatness, maxDepth, budget) {
    return [segment, flatness, maxDepth, budget]
        .flatMap((item) => Array.isArray(item) ? item : [item])
        .join(',');
}

function normalizeNode(node) {
    return {
        point: point(node?.point?.x ?? node?.x, node?.point?.y ?? node?.y, node?.point?.z ?? node?.z),
        startHandle: point(node?.startHandle?.x ?? node?.shx, node?.startHandle?.y ?? node?.shy, node?.startHandle?.z ?? node?.shz),
        endHandle: point(node?.endHandle?.x ?? node?.ehx, node?.endHandle?.y ?? node?.ehy, node?.endHandle?.z ?? node?.ehz)
    };
}

function makeSegment(start, end) {
    const p0 = start.point;
    const p1 = add(start.point, start.startHandle);
    const p2 = add(end.point, end.endHandle);
    const p3 = end.point;
    return { p0, p1, p2, p3 };
}

function buildSegment(segment, options = {}) {
    const flatness = Math.max(0, num(options.flatness, DEFAULT_FLATNESS));
    const maxDepth = Math.max(0, Math.trunc(num(options.maxDepth, DEFAULT_MAX_DEPTH)));
    const maxSamples = Math.max(2, Math.trunc(num(options.maxSamples, DEFAULT_MAX_SAMPLES)));
    const signature = segmentSignature([
        segment.p0.x, segment.p0.y, segment.p0.z,
        segment.p1.x, segment.p1.y, segment.p1.z,
        segment.p2.x, segment.p2.y, segment.p2.z,
        segment.p3.x, segment.p3.y, segment.p3.z
    ], flatness, maxDepth, maxSamples);
    const cache = options.cache instanceof Map ? options.cache : segmentCache;
    const cached = cache.get(signature);
    if (cached) return cached;

    const samples = [toArray(segment.p0)];
    const finalPoint = toArray(segment.p3);
    const append = (sample) => {
        const last = samples[samples.length - 1];
        if (!last || last[0] !== sample[0] || last[1] !== sample[1] || last[2] !== sample[2]) samples.push(sample);
    };
    const visit = (control, depth) => {
        const end = control[3];
        if (samples.length >= maxSamples - 1) {
            append(finalPoint);
            return;
        }
        if (depth >= maxDepth || cubicFlatness(...control) < flatness) {
            append(toArray(end));
            return;
        }
        const split = splitCubic(...control);
        visit(split.left, depth + 1);
        if (samples[samples.length - 1] !== finalPoint) visit(split.right, depth + 1);
    };
    visit([segment.p0, segment.p1, segment.p2, segment.p3], 0);

    const cumulative = [0];
    for (let index = 1; index < samples.length; index += 1) {
        cumulative.push(cumulative[index - 1] + arrayDistance(samples[index], samples[index - 1]));
    }
    const result = { samples, cumulative, length: cumulative[cumulative.length - 1] || 0 };
    cache.set(signature, result);
    return result;
}

export function cubicBezierPoint(t, p0, p1, p2, p3) {
    const u = 1 - t;
    return point(
        (u ** 3) * p0.x + 3 * (u ** 2) * t * p1.x + 3 * u * (t ** 2) * p2.x + (t ** 3) * p3.x,
        (u ** 3) * p0.y + 3 * (u ** 2) * t * p1.y + 3 * u * (t ** 2) * p2.y + (t ** 3) * p3.y,
        (u ** 3) * p0.z + 3 * (u ** 2) * t * p1.z + 3 * u * (t ** 2) * p2.z + (t ** 3) * p3.z
    );
}

export function sampleAdaptiveCubic(p0, p1, p2, p3, count, options = {}) {
    const total = Math.max(1, Math.trunc(num(count, 1)));
    if (total === 1) return [clone(p0)];
    if (total === 2) return [clone(p0), clone(p3)];
    return sampleByDistance(buildSegment({ p0: clone(p0), p1: clone(p1), p2: clone(p2), p3: clone(p3) }, options), total);
}

export function sampleAdaptiveBezierNodes(controlNodes, count, options = {}) {
    const total = Math.max(1, Math.trunc(num(count, 1)));
    const nodes = (Array.isArray(controlNodes) ? controlNodes : []).map(normalizeNode);
    if (!nodes.length) return Array.from({ length: total }, () => point());
    if (nodes.length === 1) return Array.from({ length: total }, () => clone(nodes[0].point));
    if (total === 1) return [clone(nodes[0].point)];
    if (total === 2) return [clone(nodes[0].point), clone(nodes[nodes.length - 1].point)];

    const maxSamples = Math.max(2, Math.trunc(num(options.maxSamples, DEFAULT_MAX_SAMPLES)));
    const perSegmentBudget = Math.max(2, Math.floor((maxSamples - 1) / (nodes.length - 1)) + 1);
    const entries = [];
    for (let index = 0; index < nodes.length - 1; index += 1) {
        entries.push(buildSegment(makeSegment(nodes[index], nodes[index + 1]), { ...options, maxSamples: perSegmentBudget }));
    }

    const samples = [];
    const cumulative = [];
    let fullLength = 0;
    entries.forEach((entry, segmentIndex) => {
        entry.samples.forEach((sample, sampleIndex) => {
            if (segmentIndex > 0 && sampleIndex === 0) return;
            const previous = samples[samples.length - 1];
            if (previous) fullLength += arrayDistance(sample, previous);
            samples.push(sample);
            cumulative.push(fullLength);
        });
    });
    return sampleByDistance({ samples, cumulative, length: fullLength }, total);
}

function sampleByDistance(path, count) {
    const total = Math.max(1, Math.trunc(num(count, 1)));
    const samples = path.samples || [];
    if (!samples.length) return [];
    if (total === 1) return [fromArray(samples[0])];
    if (total === 2) return [fromArray(samples[0]), fromArray(samples[samples.length - 1])];
    if (!(path.length > EPSILON)) return Array.from({ length: total }, () => fromArray(samples[0]));

    const result = [];
    let cursor = 1;
    for (let index = 0; index < total; index += 1) {
        const target = path.length * index / (total - 1);
        while (cursor < path.cumulative.length - 1 && path.cumulative[cursor] < target) cursor += 1;
        const high = cursor;
        const low = Math.max(0, high - 1);
        const span = path.cumulative[high] - path.cumulative[low];
        if (!(span > EPSILON)) {
            result.push(fromArray(samples[high] || samples[samples.length - 1]));
            continue;
        }
        const ratio = (target - path.cumulative[low]) / span;
        const a = samples[low];
        const b = samples[high];
        result.push(point(
            a[0] + (b[0] - a[0]) * ratio,
            a[1] + (b[1] - a[1]) * ratio,
            a[2] + (b[2] - a[2]) * ratio
        ));
    }
    result[0] = fromArray(samples[0]);
    result[result.length - 1] = fromArray(samples[samples.length - 1]);
    return result;
}
