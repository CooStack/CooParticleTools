// utils.js（无 export，兼容普通 script / module script）
// 会挂到 globalThis.Utils

(function () {
    function mulberry32(seed) {
        let a = seed >>> 0;
        return function () {
            a |= 0; a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    const Utils = {
        // ---------- 基础 ----------
        v(x = 0, y = 0, z = 0) {
            const nx = Number(x); const ny = Number(y); const nz = Number(z);
            return {
                x: Number.isFinite(nx) ? nx : 0,
                y: Number.isFinite(ny) ? ny : 0,
                z: Number.isFinite(nz) ? nz : 0,
            };
        },
        clone(a) { return { x: a.x, y: a.y, z: a.z }; },
        add(a, b) { return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }; },
        sub(a, b) { return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z }; },
        mul(a, s) { return { x: a.x * s, y: a.y * s, z: a.z * s }; },
        dot(a, b) { return a.x * b.x + a.y * b.y + a.z * b.z; },
        cross(a, b) {
            return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
        },
        len(a) { return Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z); },
        norm(a) {
            const l = Utils.len(a);
            if (l <= 1e-12) return { x: 0, y: 0, z: 0 };
            return { x: a.x / l, y: a.y / l, z: a.z / l };
        },

        fmt(n) {
            const x = Number(n);
            if (!Number.isFinite(x)) return "0.0";

            // 避免 -0
            const v = (Math.abs(x) < 1e-9) ? 0 : x;

            // 保留最多 6 位小数，然后去掉多余 0
            let s = v.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");

            // ✅ 如果是整数，强制保留一位小数
            if (!s.includes(".")) s += ".0";

            return s;
        },

        degToRad(deg) { return (Number(deg) || 0) * Math.PI / 180; },
        radToDeg(rad) { return (Number(rad) || 0) * 180 / Math.PI; },

        normalizeAngleUnit(unit) {
            return unit === "rad" ? "rad" : "deg";
        },

        angleToRad(value, unit) {
            const u = Utils.normalizeAngleUnit(unit);
            if (u === "rad") return Number(value) || 0;
            return Utils.degToRad(value);
        },

        angleToDeg(value, unit) {
            const u = Utils.normalizeAngleUnit(unit);
            if (u === "deg") return Number(value) || 0;
            return Utils.radToDeg(value);
        },

        // Kotlin：角度(度) -> 系数*PI（系数数值先算好）
        degToKotlinRadExpr(deg) {
            const d = Number(deg) || 0;
            const coef = d / 180;
            if (Math.abs(coef) < 1e-12) return "0.0";
            return `${Utils.fmt(coef)}*PI`;
        },

        angleToKotlinRadExpr(value, unit) {
            const u = Utils.normalizeAngleUnit(unit);
            if (u === "rad") {
                const v = Number(value) || 0;
                const coef = v / Math.PI;
                if (Math.abs(coef) < 1e-12) return "0.0";
                return `${Utils.fmt(coef)}*PI`;
            }
            return Utils.degToKotlinRadExpr(value);
        },

        // ---------- 旋转 ----------
        rotateAroundAxis(p, axis, angleRad) {
            // Rodrigues
            const a = Utils.norm(axis);
            const x = p.x, y = p.y, z = p.z;
            const u = a.x, v = a.y, w = a.z;
            const cosA = Math.cos(angleRad);
            const sinA = Math.sin(angleRad);
            const dot = u * x + v * y + w * z;

            return {
                x: u * dot * (1 - cosA) + x * cosA + (-w * y + v * z) * sinA,
                y: v * dot * (1 - cosA) + y * cosA + (w * x - u * z) * sinA,
                z: w * dot * (1 - cosA) + z * cosA + (-v * x + u * y) * sinA,
            };
        },

        rotateY(p, yaw) {
            const c = Math.cos(yaw), s = Math.sin(yaw);
            return { x: p.x * c + p.z * s, y: p.y, z: -p.x * s + p.z * c };
        },
        rotateX(p, pitch) {
            const c = Math.cos(pitch), s = Math.sin(pitch);
            return { x: p.x, y: p.y * c - p.z * s, z: p.y * s + p.z * c };
        },

        // Kotlin Math3DUtil.getYawFromLocation: atan2(-x, z)
        getYawFromLocation(loc) { return Math.atan2(-loc.x, loc.z); },

        // Kotlin Math3DUtil.getPitchFromLocation: atan2(y, sqrt(x^2 + z^2))
        getPitchFromLocation(loc) { return Math.atan2(loc.y, Math.sqrt(loc.x * loc.x + loc.z * loc.z)); },

        // 让 axis 指向 toPoint（参考 Kotlin Math3DUtil.rotatePointsToPoint 的 yaw/pitch 方案）
        rotatePointsToPoint(points, toPoint, axis) {
            const a = Utils.norm(axis);
            const t = Utils.norm(toPoint);
            const cr = Utils.cross(a, t);
            if (Utils.len(cr) <= 1e-5 && Utils.dot(a, t) > 0) return points;

            const axisYaw = Utils.getYawFromLocation(a);
            const axisPitch = Utils.getPitchFromLocation(a);

            const toYaw = Utils.getYawFromLocation(t);
            const toPitch = Utils.getPitchFromLocation(t);

            for (let i = 0; i < points.length; i++) {
                let p = points[i];
                // 先面向 Z 轴
                p = Utils.rotateY(p, axisYaw);
                p = Utils.rotateX(p, axisPitch);
                // 再转到目标
                p = Utils.rotateY(p, -toYaw);
                p = Utils.rotateX(p, -toPitch);
                points[i] = p;
            }
            return points;
        },

        // ---------- 生成点集 ----------
        getLineLocations(start, end, count) {
            const c = Math.max(1, Math.trunc(Number(count) || 1));
            const s = Utils.v(start.x, start.y, start.z);
            const e = Utils.v(end.x, end.y, end.z);
            const res = [];
            for (let i = 0; i <= c; i++) {
                const t = (c === 0) ? 0 : i / c;
                res.push({ x: s.x + (e.x - s.x) * t, y: s.y + (e.y - s.y) * t, z: s.z + (e.z - s.z) * t });
            }
            return res;
        },

        getDottedLineLocations(target, totalCount, dottedCount, emptyStep) {
            const total = Math.max(1, Math.trunc(Number(totalCount) || 1));
            const dotted = Math.max(1, Math.trunc(Number(dottedCount) || 1));
            const gap = Math.max(0, Number(emptyStep) || 0);
            const end = Utils.v(target.x, target.y, target.z);
            const length = Utils.len(end);
            if (length <= 1e-12) return [Utils.v(0, 0, 0)];

            const direction = Utils.mul(end, 1 / length);
            const gapCount = Math.max(0, dotted - 1);
            const usableLength = Math.max(0, length - gap * gapCount);
            if (usableLength <= 1e-12) return [Utils.v(0, 0, 0)];

            const segmentLength = usableLength / dotted;
            const segments = [];
            let cursor = 0;
            for (let i = 0; i < dotted; i++) {
                const start = cursor;
                const endPos = Math.min(length, start + segmentLength);
                if (endPos > start + 1e-12) segments.push({ start, end: endPos });
                cursor = endPos + gap;
            }
            if (!segments.length) return [Utils.v(0, 0, 0)];

            const solidLength = segments.reduce((sum, seg) => sum + Math.max(0, seg.end - seg.start), 0);
            if (solidLength <= 1e-12) return [Utils.v(0, 0, 0)];

            const res = [];
            for (let i = 0; i < total; i++) {
                const distOnSolid = total <= 1 ? 0 : (solidLength * i) / (total - 1);
                let remain = distOnSolid;
                let dist = segments[segments.length - 1].end;
                for (const seg of segments) {
                    const segLen = Math.max(0, seg.end - seg.start);
                    if (remain <= segLen || seg === segments[segments.length - 1]) {
                        dist = seg.start + Math.min(segLen, Math.max(0, remain));
                        break;
                    }
                    remain -= segLen;
                }
                res.push(Utils.mul(direction, dist));
            }
            return res;
        },

        fillTriangle(p1, p2, p3, sampler) {
            const a = Utils.v(p1.x, p1.y, p1.z);
            const b = Utils.v(p2.x, p2.y, p2.z);
            const c = Utils.v(p3.x, p3.y, p3.z);
            const smp = Number(sampler);
            const out = [];
            if (!Number.isFinite(smp) || smp <= 0) return out;

            const d12 = Utils.len(Utils.sub(a, b));
            const d13 = Utils.len(Utils.sub(a, c));
            const d23 = Utils.len(Utils.sub(b, c));
            if (d12 <= 1e-6 || d13 <= 1e-6 || d23 <= 1e-6) return out;

            const r1 = Utils.sub(b, a);
            const r2 = Utils.sub(c, b);
            const cr = Utils.cross(r1, r2);
            const sameLine = (cr.x * cr.x + cr.y * cr.y + cr.z * cr.z) < 1e-6;
            if (sameLine) {
                const pairs = [
                    { s: a, e: b, d: d12 },
                    { s: a, e: c, d: d13 },
                    { s: b, e: c, d: d23 }
                ];
                pairs.sort((p, q) => q.d - p.d);
                const best = pairs[0];
                const lineCount = Math.round(best.d * smp);
                return Utils.getLineLocations(best.s, best.e, lineCount);
            }

            const maxEdge = Math.max(d12, d13, d23);
            const edgeSamples = Math.max(1, Math.round(maxEdge * smp));
            for (let i = 0; i <= edgeSamples; i++) {
                const u = i / edgeSamples;
                for (let j = 0; j <= edgeSamples - i; j++) {
                    const v = j / edgeSamples;
                    const w = 1.0 - u - v;
                    out.push({
                        x: a.x * w + b.x * u + c.x * v,
                        y: a.y * w + b.y * u + c.y * v,
                        z: a.z * w + b.z * u + c.z * v
                    });
                }
            }
            return out;
        },

        getCircleXZ(r, count) {
            const c = Math.max(1, Math.trunc(Number(count) || 1));
            const rr = Number(r) || 0;
            const step = (2 * Math.PI) / c;
            let a = 0;
            const res = [];
            for (let i = 0; i < c; i++) {
                res.push({ x: rr * Math.cos(a), y: 0, z: rr * Math.sin(a) });
                a += step;
            }
            return res;
        },

        getDottedCircleXZ(r, totalCount, dottedCount, emptyStep) {
            const total = Math.max(1, Math.trunc(Number(totalCount) || 1));
            const dotted = Math.max(1, Math.trunc(Number(dottedCount) || 1));
            const rr = Number(r) || 0;
            const gap = Math.max(0, Number(emptyStep) || 0);
            const full = 2 * Math.PI;
            const usableArc = Math.max(0, full - gap * dotted);
            if (usableArc <= 1e-12 || Math.abs(rr) <= 1e-12) return [];

            const dashArc = usableArc / dotted;
            const segments = [];
            let angle = 0;
            for (let i = 0; i < dotted; i++) {
                const start = angle;
                const end = start + dashArc;
                if (end > start + 1e-12) segments.push({ start, end });
                angle = end + gap;
            }
            if (!segments.length) return [];

            const solidArc = segments.reduce((sum, seg) => sum + Math.max(0, seg.end - seg.start), 0);
            if (solidArc <= 1e-12) return [];

            const res = [];
            for (let i = 0; i < total; i++) {
                const arcOnSolid = solidArc * (i / total);
                let remain = arcOnSolid;
                let rad = segments[segments.length - 1].start;
                for (const seg of segments) {
                    const segLen = Math.max(0, seg.end - seg.start);
                    if (remain <= segLen || seg === segments[segments.length - 1]) {
                        rad = seg.start + Math.min(segLen, Math.max(0, remain));
                        break;
                    }
                    remain -= segLen;
                }
                res.push({ x: rr * Math.cos(rad), y: 0, z: rr * Math.sin(rad) });
            }
            return res;
        },

        getHalfCircleXZ(r, count, rotateRad = 0) {
            const c = Math.max(1, Math.trunc(Number(count) || 1));
            const rr = Number(r) || 0;
            const step = Math.PI / c;
            let a = 0;
            let res = [];
            for (let i = 0; i < c; i++) {
                res.push({ x: rr * Math.cos(a), y: 0, z: rr * Math.sin(a) });
                a += step;
            }
            if (Math.abs(rotateRad) > 1e-12) {
                const axis = { x: 0, y: 1, z: 0 };
                res = res.map(p => Utils.rotateAroundAxis(p, axis, rotateRad));
            }
            return res;
        },

        // Kotlin Math3DUtil.getRadianXZCenter / getRadianXZ
        // 获取弧线：从 -radian/2 .. radian/2（以 Z 轴为对称轴），可选初始旋转(绕 Y 轴)
        getRadianXZCenter(r, count, radian, rotateRad = 0) {
            const rr = Number(r) || 0;
            const c = Math.max(1, Math.trunc(Number(count) || 1));
            const rad = Number(radian) || 0;
            return Utils.getRadianXZ(rr, c, -rad / 2, rad / 2, rotateRad);
        },

        // 获取弧线：从 startRadian .. endRadian（弧度），可选初始旋转(绕 Y 轴)
        getRadianXZ(r, count, startRadian, endRadian, rotateRad = 0) {
            const rr = Number(r) || 0;
            const c = Math.max(1, Math.trunc(Number(count) || 1));
            const sr = Number(startRadian) || 0;
            const er = Number(endRadian) || 0;

            const step = (er - sr) / c;
            let rad = sr;
            let res = [];
            for (let i = 0; i < c; i++) {
                res.push({ x: rr * Math.cos(rad), y: 0, z: rr * Math.sin(rad) });
                rad += step;
            }

            if (Math.abs(rotateRad) > 1e-12) {
                const axis = { x: 0, y: 1, z: 0 };
                res = res.map(p => Utils.rotateAroundAxis(p, axis, rotateRad));
            }
            return res;
        },

        getBallLocations(r, countPow) {
            const rr = Number(r) || 0;
            const n = Math.max(1, Math.trunc(Number(countPow) || 1));
            const res = [];
            const step = Math.PI / n;
            let ry = -Math.PI / 2;
            for (let i = 1; i <= n; i++) {
                let rx = 0;
                for (let j = 1; j <= n; j++) {
                    res.push({
                        x: rr * Math.cos(ry) * Math.cos(rx),
                        y: rr * Math.sin(ry),
                        z: rr * Math.cos(ry) * Math.sin(rx),
                    });
                    rx += (2 * Math.PI) / n;
                }
                ry += step;
            }
            return res;
        },

        getSingleDiscreteOnCircleXZ(r, discrete, angleRad, rnd = Math.random) {
            const rr = Number(r) || 0;
            const x = Math.cos(angleRad) * rr;
            const z = Math.sin(angleRad) * rr;
            const d = Math.max(0, Number(discrete) || 0);
            if (d <= 0) return { x, y: 0, z };

            const randomR = rnd() * d;
            const rx = (rnd() * 2 - 1) * Math.PI;
            const ry = (rnd() * 2 - 1) * Math.PI;
            const add = {
                x: randomR * Math.cos(rx) * Math.cos(ry),
                y: randomR * Math.sin(rx),
                z: randomR * Math.sin(ry) * Math.cos(rx),
            };
            return { x: x + add.x, y: add.y, z: z + add.z };
        },

        getDiscreteCircleXZ(r, count, discrete, seed = null) {
            const c = Math.max(1, Math.trunc(Number(count) || 1));
            const step = (2 * Math.PI) / c;
            const rnd = (seed === null || seed === undefined) ? Math.random : mulberry32((Number(seed) >>> 0));
            const res = [];
            for (let i = 0; i < c; i++) {
                res.push(Utils.getSingleDiscreteOnCircleXZ(r, discrete, i * step, rnd));
            }
            return res;
        },

        getPolygonInCircleVertices(n, r) {
            const nn = Math.max(3, Math.trunc(Number(n) || 3));
            const rr = Number(r) || 0;
            const res = [];
            for (let i = 0; i < nn; i++) {
                const theta = (2 * Math.PI * i) / nn;
                res.push({ x: rr * Math.cos(theta), y: 0, z: rr * Math.sin(theta) });
            }
            return res;
        },

        getPolygonInCircleLocations(n, edgeCount, r) {
            const nn = Math.max(3, Math.trunc(Number(n) || 3));
            const ec = Math.max(1, Math.trunc(Number(edgeCount) || 1));
            const verts = Utils.getPolygonInCircleVertices(nn, r);
            const res = [];
            for (let i = 0; i < nn; i++) {
                const j = (i + 1) % nn;
                const vi = verts[i];
                const vj = verts[j];
                const line = Utils.getLineLocations(vi, vj, Math.max(1, ec - 1));
                res.push(...line);
            }
            return res;
        },

        getRoundScapeLocations(r, step, preCircleCount) {
            const rr = Number(r) || 0;
            const st = Number(step) || 0;
            const pc = Math.max(1, Math.trunc(Number(preCircleCount) || 1));
            const res = [];
            if (st <= 0 || rr < st) return res;
            let varR = st;
            while (varR < rr) {
                const stepCircle = (2 * Math.PI) / pc;
                for (let i = 1; i <= pc; i++) {
                    res.push({ x: varR * Math.cos(stepCircle * i), y: 0, z: varR * Math.sin(stepCircle * i) });
                }
                varR += st;
            }
            return res;
        },

        getRoundScapeLocationsRange(r, step, minCircleCount, maxCircleCount) {
            const rr = Number(r) || 0;
            const st = Number(step) || 0;
            const minC = Math.max(1, Math.trunc(Number(minCircleCount) || 1));
            const maxC = Math.max(minC, Math.trunc(Number(maxCircleCount) || minC));
            const res = [];
            if (st <= 0 || rr < st) return res;

            const circleTotal = Math.max(1, Math.trunc(rr / st));
            const countStep = (maxC - minC) / circleTotal;

            let varR = st;
            let currentCircle = 1;
            while (varR < rr) {
                const currentCount = Math.max(1, Math.trunc(minC + currentCircle * countStep));
                const stepCircle = (2 * Math.PI) / currentCount;
                for (let i = 1; i <= currentCount; i++) {
                    res.push({ x: varR * Math.cos(stepCircle * i), y: 0, z: varR * Math.sin(stepCircle * i) });
                }
                varR += st;
                currentCircle++;
            }
            return res;
        },

        // Kotlin Math3DUtil.generateBezierCurve(target, startHandle, endHandle, count)
        generateBezierCurve(target, startHandle, endHandle, count) {
            const c = Math.max(1, Math.trunc(Number(count) || 1));
            const t = Utils.v(target.x, target.y, target.z);
            const sh = Utils.v(startHandle.x, startHandle.y, startHandle.z);
            const eh = Utils.v(endHandle.x, endHandle.y, endHandle.z);
            const end = Utils.add(t, eh);

            const res = [];
            for (let i = 0; i < c; i++) {
                const tt = (c === 1) ? 1.0 : (i / (c - 1));
                const u = 1 - tt;
                const u2 = u * u;
                const t2 = tt * tt;

                const x =
                    (3 * u2 * tt * sh.x) +
                    (3 * u * t2 * end.x) +
                    (t2 * tt * t.x);

                const y =
                    (3 * u2 * tt * sh.y) +
                    (3 * u * t2 * end.y) +
                    (t2 * tt * t.y);

                res.push({ x, y, z: 0 });
            }
            return res;
        },

        // ---------- 闪电 ----------
        getLightningEffectNodes(start, end, counts, offsetRange = null, seed = null) {
            const s = Utils.v(start.x, start.y, start.z);
            const e = Utils.v(end.x, end.y, end.z);
            const len = Utils.len(Utils.sub(e, s));
            const defaultOffset = len / 4;
            const off = (offsetRange === null || offsetRange === undefined) ? defaultOffset : Math.max(0.01, Number(offsetRange) || 0.01);

            const rnd = (seed === null || seed === undefined) ? Math.random : mulberry32((Number(seed) >>> 0));

            function randomVec3() {
                const rx = (rnd() * 2 - 1) * Math.PI;
                const ry = (rnd() * 2 - 1) * Math.PI;
                return { x: Math.cos(rx) * Math.cos(ry), y: Math.sin(rx), z: Math.sin(ry) * Math.cos(rx) };
            }

            function recurse(a, b, c, currentOffset) {
                const mid = Utils.mul(Utils.add(a, b), 0.5);
                const r = (rnd() * 2 - 1) * Math.max(0.01, currentOffset);
                const dir = randomVec3();
                const m2 = Utils.add(mid, Utils.mul(dir, r));

                const res = [m2];
                if (c <= 1) return res;

                const left = recurse(a, m2, c - 1, currentOffset);
                const right = recurse(m2, b, c - 1, currentOffset);
                return [...left, ...res, ...right];
            }

            return [s, ...recurse(s, e, Math.max(1, Math.trunc(Number(counts) || 1)), off), e];
        },

        connectLineWithNodes(nodes, preLineCount) {
            const plc = Math.max(1, Math.trunc(Number(preLineCount) || 1));
            const res = [];
            for (let i = 0; i < nodes.length - 1; i++) {
                res.push(...Utils.getLineLocations(nodes[i], nodes[i + 1], plc));
            }
            return res;
        },

        getLightningEffectPoints(end, counts, preLineCount, offsetRange = null, seed = null) {
            const nodes = Utils.getLightningEffectNodes({ x: 0, y: 0, z: 0 }, end, counts, offsetRange, seed);
            return Utils.connectLineWithNodes(nodes, preLineCount);
        },
        getLightningNodesEffectAttenuation(start, end, counts, maxOffsetRange, attenuation, seed = null) {
            const s = Utils.v(start.x, start.y, start.z);
            const e = Utils.v(end.x, end.y, end.z);

            let att = Number(attenuation);
            if (!Number.isFinite(att)) att = 1.0;
            att = Math.min(1.0, Math.max(0.01, att));

            const maxOff = Math.max(0.01, Number(maxOffsetRange) || 0.01);

            const rnd = (seed === null || seed === undefined)
                ? Math.random
                : (function () {
                    // 复用你 utils.js 里的 mulberry32
                    return mulberry32((Number(seed) >>> 0));
                })();

            function randomVec3() {
                const rx = (rnd() * 2 - 1) * Math.PI;
                const ry = (rnd() * 2 - 1) * Math.PI;
                return { x: Math.cos(rx) * Math.cos(ry), y: Math.sin(rx), z: Math.sin(ry) * Math.cos(rx) };
            }

            function recurse(a, b, c, currentOffset) {
                const fixed = Math.max(0.01, currentOffset);

                const mid = Utils.mul(Utils.add(a, b), 0.5);

                const r = (rnd() * 2 - 1) * fixed;
                const dir = randomVec3();
                const m2 = Utils.add(mid, Utils.mul(dir, r));

                const res = [m2];
                if (c <= 1) return res;

                const nextOffset = Math.max(0.01, fixed * att);
                const left = recurse(a, m2, c - 1, nextOffset);
                const right = recurse(m2, b, c - 1, nextOffset);
                return [...left, ...res, ...right];
            }

            const inner = recurse(s, e, Math.max(1, Math.trunc(Number(counts) || 1)), maxOff);
            return [s, ...inner, e];
        },

        // ---------- 噪声偏移（对齐 Kotlin Math3DUtil.applyNoiseOffset 逻辑） ----------
        applyNoiseOffset(points, noiseX, noiseY, noiseZ, opts = {}) {
            if (!points || points.length === 0) return points;

            const nx = Number(noiseX) || 0;
            const ny = (noiseY === undefined || noiseY === null) ? nx : (Number(noiseY) || 0);
            const nz = (noiseZ === undefined || noiseZ === null) ? nx : (Number(noiseZ) || 0);
            if (nx === 0 && ny === 0 && nz === 0) return points;

            const mode = opts.mode || "AXIS_UNIFORM";
            const seed = (opts.seed === undefined || opts.seed === null) ? null : Number(opts.seed);
            const offsetLenMin = (opts.offsetLenMin === undefined || opts.offsetLenMin === null) ? null : Number(opts.offsetLenMin);
            const offsetLenMax = (opts.offsetLenMax === undefined || opts.offsetLenMax === null) ? null : Number(opts.offsetLenMax);

            const baseRand = (seed != null) ? mulberry32((seed >>> 0)) : Math.random;

            for (let i = 0; i < points.length; i++) {
                const rnd = (seed != null)
                    ? mulberry32(((seed >>> 0) + (i * 2654435761 >>> 0)) >>> 0)
                    : baseRand;

                let ox = 0, oy = 0, oz = 0;

                if (mode === "AXIS_UNIFORM") {
                    ox = (rnd() * 2 - 1) * nx;
                    oy = (rnd() * 2 - 1) * ny;
                    oz = (rnd() * 2 - 1) * nz;
                } else if (mode === "SPHERE_UNIFORM") {
                    let x, y, z, r2;
                    do {
                        x = rnd() * 2 - 1;
                        y = rnd() * 2 - 1;
                        z = rnd() * 2 - 1;
                        r2 = x * x + y * y + z * z;
                    } while (!(r2 > 1e-12 && r2 <= 1.0));
                    ox = x * nx; oy = y * ny; oz = z * nz;
                } else if (mode === "SHELL_UNIFORM") {
                    const u = rnd();
                    const v = rnd();
                    const theta = 2 * Math.PI * u;
                    const n = 2 * v - 1;
                    const t = Math.sqrt(1 - n * n);
                    const xDir = t * Math.cos(theta);
                    const yDir = t * Math.sin(theta);
                    const w = rnd();
                    const r = Math.cbrt(w);
                    const x = xDir * r, y = yDir * r, z = n * r;
                    ox = x * nx; oy = y * ny; oz = z * nz;
                }

                if (offsetLenMin !== null || offsetLenMax !== null) {
                    const len = Math.sqrt(ox * ox + oy * oy + oz * oz);
                    if (len > 1e-12) {
                        let sc = 1.0;
                        if (offsetLenMin !== null && len < offsetLenMin) sc = offsetLenMin / len;
                        if (offsetLenMax !== null && len > offsetLenMax) sc = offsetLenMax / len;
                        ox *= sc; oy *= sc; oz *= sc;
                    } else {
                        ox = 0; oy = 0; oz = 0;
                    }
                }

                points[i] = { x: points[i].x + ox, y: points[i].y + oy, z: points[i].z + oz };
            }
            return points;
        },

        // ---------- 傅里叶（对齐 FourierSeriesBuilder.build） ----------
        buildFourierSeries(terms, count, scale) {
            const c = Math.max(1, Math.trunc(Number(count) || 360));
            const sc = Number(scale);
            const s = Number.isFinite(sc) ? sc : 1.0;
            if (!terms || terms.length === 0) return [];

            const precision = (2 * Math.PI) / c;
            const res = [];
            for (let i = 0; i < c; i++) {
                const t = i * precision;
                let x = 0, z = 0;
                for (const term of terms) {
                    const w = Number(term.w) || 0;
                    const r = Number(term.r) || 0;
                    const startAngleVal = Number(term.startAngle) || 0;
                    const angle = Utils.angleToRad(startAngleVal, term.startAngleUnit) + w * t;
                    const px = r * Math.cos(angle) * s;
                    const pz = r * Math.sin(angle) * s;
                    x += px; z += pz;
                }
                res.push({ x, y: 0, z });
            }
            return res;
        },

        computeBounds(points) {
            if (!points || points.length === 0) return { center: { x: 0, y: 0, z: 0 }, radius: 1 };
            let minX = Infinity, minY = Infinity, minZ = Infinity;
            let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
            for (const p of points) {
                if (p.x < minX) minX = p.x;
                if (p.y < minY) minY = p.y;
                if (p.z < minZ) minZ = p.z;
                if (p.x > maxX) maxX = p.x;
                if (p.y > maxY) maxY = p.y;
                if (p.z > maxZ) maxZ = p.z;
            }
            const center = { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z: (minZ + maxZ) / 2 };
            let radius = 0;
            for (const p of points) {
                const dx = p.x - center.x, dy = p.y - center.y, dz = p.z - center.z;
                radius = Math.max(radius, Math.sqrt(dx * dx + dy * dy + dz * dz));
            }
            return { center, radius: Math.max(1e-6, radius) };
        },
    };

    globalThis.Utils = Utils;
})();
