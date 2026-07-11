import * as THREE from "three";

export function createKindDefs(ctx) {
    const { U, num, int, relExpr, rotatePointsToPointUpright } = ctx || {};

    function cubicBezierPoint(t, p0, p1, p2, p3) {
        const u = 1 - t;
        const u2 = u * u;
        const t2 = t * t;
        const u3 = u2 * u;
        const t3 = t2 * t;
        return {
            x: u3 * p0.x + 3 * u2 * t * p1.x + 3 * u * t2 * p2.x + t3 * p3.x,
            y: u3 * p0.y + 3 * u2 * t * p1.y + 3 * u * t2 * p2.y + t3 * p3.y,
            z: u3 * p0.z + 3 * u2 * t * p1.z + 3 * u * t2 * p2.z + t3 * p3.z,
        };
    }

    function buildCubicBezier(p0, p1, p2, p3, count) {
        const c = Math.max(1, int(count));
        const res = [];
        for (let i = 0; i < c; i++) {
            const t = (c === 1) ? 1.0 : i / (c - 1);
            res.push(cubicBezierPoint(t, p0, p1, p2, p3));
        }
        return res;
    }

    function quadToCubic(p0, p1, p2) {
        const c1 = U.add(p0, U.mul(U.sub(p1, p0), 2 / 3));
        const c2 = U.add(p2, U.mul(U.sub(p1, p2), 2 / 3));
        return { c1, c2 };
    }

    function distortionSafeNormalize(v) {
        const len = U.len(v);
        if (len < 1e-9) return { x: 0, y: 1, z: 0 };
        return { x: v.x / len, y: v.y / len, z: v.z / len };
    }

    function distortionAnyPerp(axis) {
        const ref = (Math.abs(axis.y) < 0.9)
            ? { x: 0, y: 1, z: 0 }
            : { x: 1, y: 0, z: 0 };
        const perp = U.cross(axis, ref);
        const len = U.len(perp);
        if (len < 1e-9) return { x: 0, y: 0, z: 1 };
        return { x: perp.x / len, y: perp.y / len, z: perp.z / len };
    }

    function distortionFade(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    function distortionLerp(a, b, t) {
        return a + (b - a) * t;
    }

    function distortionHash3(ix, iy, iz, seed) {
        let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(iz, 2147483647) + Math.imul(seed, 374761);
        n = (n ^ (n >>> 13)) | 0;
        n = Math.imul(n, 1274126177);
        n = (n ^ (n >>> 16)) | 0;
        return ((n & 0x7fffffff) >>> 0) / 2147483647.0;
    }

    function distortionValueNoise3(p, seed) {
        const x0 = Math.floor(p.x);
        const y0 = Math.floor(p.y);
        const z0 = Math.floor(p.z);
        const fx = p.x - x0;
        const fy = p.y - y0;
        const fz = p.z - z0;

        const u = distortionFade(fx);
        const v = distortionFade(fy);
        const w = distortionFade(fz);

        const h = (dx, dy, dz) => distortionHash3(x0 + dx, y0 + dy, z0 + dz, seed);

        const n000 = h(0, 0, 0);
        const n100 = h(1, 0, 0);
        const n010 = h(0, 1, 0);
        const n110 = h(1, 1, 0);
        const n001 = h(0, 0, 1);
        const n101 = h(1, 0, 1);
        const n011 = h(0, 1, 1);
        const n111 = h(1, 1, 1);

        const nx00 = distortionLerp(n000, n100, u);
        const nx10 = distortionLerp(n010, n110, u);
        const nx01 = distortionLerp(n001, n101, u);
        const nx11 = distortionLerp(n011, n111, u);

        const nxy0 = distortionLerp(nx00, nx10, v);
        const nxy1 = distortionLerp(nx01, nx11, v);

        return distortionLerp(nxy0, nxy1, w);
    }

    function distortionNoise(p, seed) {
        return distortionValueNoise3(p, seed) * 2.0 - 1.0;
    }

    function pointWithOffset(point, ox = 0, oy = 0, oz = 0) {
        return {
            x: num(point?.x) + ox,
            y: num(point?.y) + oy,
            z: num(point?.z) + oz,
        };
    }

    function getOffset(params, prefix = "o") {
        return {
            x: num(params?.[`${prefix}x`]),
            y: num(params?.[`${prefix}y`]),
            z: num(params?.[`${prefix}z`]),
        };
    }

    function hasOffset(offset) {
        return Math.abs(num(offset?.x)) > 1e-9
            || Math.abs(num(offset?.y)) > 1e-9
            || Math.abs(num(offset?.z)) > 1e-9;
    }

    function pushPoints(ctx, points, offset = null) {
        const off = offset || { x: 0, y: 0, z: 0 };
        for (const point of (points || [])) {
            ctx.points.push(pointWithOffset(point, off.x, off.y, off.z));
        }
    }

    function pushPreviewPoints(ctx, points, offset = null) {
        const list = points || [];
        if (!list.length) return;
        if (!Array.isArray(ctx.previewPoints)) ctx.previewPoints = [];
        const off = offset || { x: 0, y: 0, z: 0 };
        for (const point of list) {
            ctx.previewPoints.push(pointWithOffset(point, off.x, off.y, off.z));
        }
    }

    function pushMaskPreviewPoints(ctx, points, options = {}) {
        const list = points || [];
        if (!list.length) return;
        if (!Array.isArray(ctx.maskPreviewPoints)) ctx.maskPreviewPoints = [];
        const off = options.offset || { x: 0, y: 0, z: 0 };
        for (const point of list) {
            ctx.maskPreviewPoints.push({
                ...point,
                x: num(point?.x) + num(off.x),
                y: num(point?.y) + num(off.y),
                z: num(point?.z) + num(off.z),
                radius: options.radius === undefined ? num(point?.radius) : num(options.radius),
                maskKind: options.maskKind || point?.maskKind || "point",
                nodeId: options.nodeId || point?.nodeId || null,
                previewType: options.previewType || point?.previewType || "mask_line"
            });
        }
    }

    function pushMaskPreviewLineSegment(ctx, a, b, options = {}) {
        pushMaskPreviewPoints(ctx, [a, b], {
            ...options,
            previewType: "mask_line"
        });
    }

    function getCirclePoint(origin, radius, angle, plane) {
        const c = Math.cos(angle) * radius;
        const s = Math.sin(angle) * radius;
        if (plane === "XY") return { x: origin.x + c, y: origin.y + s, z: origin.z };
        if (plane === "ZY") return { x: origin.x, y: origin.y + c, z: origin.z + s };
        return { x: origin.x + c, y: origin.y, z: origin.z + s };
    }

    function pushMaskPreviewCircleSegments(ctx, origin, radius, options = {}) {
        const r = num(radius);
        if (!(r > 0) || Number.isNaN(r)) return;
        const center = U.v(num(origin?.x), num(origin?.y), num(origin?.z));
        const segments = Math.max(12, int(options.segments || 72));
        const plane = options.plane || "XZ";
        for (let i = 0; i < segments; i += 2) {
            const a = getCirclePoint(center, r, (i / segments) * Math.PI * 2, plane);
            const b = getCirclePoint(center, r, ((i + 1) / segments) * Math.PI * 2, plane);
            pushMaskPreviewLineSegment(ctx, a, b, {
                radius: r,
                maskKind: options.maskKind || "round_xz",
                nodeId: options.nodeId || null
            });
        }
    }

    function pushMaskPreviewSphereSegments(ctx, origin, radius, options = {}) {
        const r = num(radius);
        if (!(r > 0) || Number.isNaN(r)) return;
        const opts = {
            radius: r,
            nodeId: options.nodeId || null,
            maskKind: options.maskKind || "ball",
            segments: options.segments || 48
        };
        pushMaskPreviewCircleSegments(ctx, origin, r, { ...opts, plane: "XZ" });
        pushMaskPreviewCircleSegments(ctx, origin, r, { ...opts, plane: "XY" });
        pushMaskPreviewCircleSegments(ctx, origin, r, { ...opts, plane: "ZY" });
    }

    function mapAllPointSets(ctx, mapper) {
        if (Array.isArray(ctx.points)) ctx.points = ctx.points.map(mapper);
        if (Array.isArray(ctx.previewPoints) && ctx.previewPoints.length) {
            ctx.previewPoints = ctx.previewPoints.map(mapper);
        }
        if (Array.isArray(ctx.maskPreviewPoints) && ctx.maskPreviewPoints.length) {
            ctx.maskPreviewPoints = ctx.maskPreviewPoints.map((point) => ({ ...point, ...mapper(point) }));
        }
    }

    function mutateAllPointSets(ctx, mutator) {
        for (const list of [ctx.points, ctx.previewPoints, ctx.maskPreviewPoints]) {
            if (!Array.isArray(list) || !list.length) continue;
            mutator(list);
        }
    }

    function clearAllPointSets(ctx) {
        ctx.points = [];
        if (Array.isArray(ctx.previewPoints)) ctx.previewPoints = [];
        if (Array.isArray(ctx.maskPreviewPoints)) ctx.maskPreviewPoints = [];
    }

    function maskGridKey(point, inverseCellSize) {
        const x = Math.floor((Number(point?.x) || 0) * inverseCellSize);
        const y = Math.floor((Number(point?.y) || 0) * inverseCellSize);
        const z = Math.floor((Number(point?.z) || 0) * inverseCellSize);
        return `${x}:${y}:${z}`;
    }

    function applyMaskInPlace(points, maskRange) {
        if (!Array.isArray(points) || !points.length || !(maskRange > 0) || Number.isNaN(maskRange)) return;
        const originalSize = points.length;
        const alive = new Array(originalSize).fill(true);
        const buckets = new Map();
        const inverseCellSize = 1.0 / maskRange;
        const rangeSq = maskRange * maskRange;

        for (let i = 0; i < originalSize; i++) {
            const point = points[i];
            if (!point) continue;
            const px = Number(point.x) || 0;
            const py = Number(point.y) || 0;
            const pz = Number(point.z) || 0;
            const cellX = Math.floor(px * inverseCellSize);
            const cellY = Math.floor(py * inverseCellSize);
            const cellZ = Math.floor(pz * inverseCellSize);

            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dz = -1; dz <= 1; dz++) {
                        const bucket = buckets.get(`${cellX + dx}:${cellY + dy}:${cellZ + dz}`);
                        if (!bucket || !bucket.length) continue;
                        for (const index of bucket) {
                            if (!alive[index]) continue;
                            const other = points[index];
                            if (!other) continue;
                            const ox = Number(other.x) || 0;
                            const oy = Number(other.y) || 0;
                            const oz = Number(other.z) || 0;
                            const ddx = px - ox;
                            const ddy = py - oy;
                            const ddz = pz - oz;
                            if (ddx * ddx + ddy * ddy + ddz * ddz < rangeSq) {
                                alive[index] = false;
                            }
                        }
                    }
                }
            }

            alive[i] = true;
            const key = maskGridKey(point, inverseCellSize);
            const bucket = buckets.get(key);
            if (bucket) {
                bucket.push(i);
            } else {
                buckets.set(key, [i]);
            }
        }

        let write = 0;
        for (let read = 0; read < originalSize; read++) {
            if (alive[read]) {
                points[write++] = points[read];
            }
        }
        if (write < originalSize) {
            points.length = write;
        }
    }

    function applyMaskFromSourceInPlace(targetPoints, sourcePoints, maskRange) {
        if (!Array.isArray(targetPoints) || !targetPoints.length) return;
        if (!Array.isArray(sourcePoints) || !sourcePoints.length) return;
        if (!(maskRange > 0) || Number.isNaN(maskRange)) return;
        const originalSize = targetPoints.length;
        const alive = new Array(originalSize).fill(true);
        const buckets = new Map();
        const inverseCellSize = 1.0 / maskRange;
        const rangeSq = maskRange * maskRange;

        for (let i = 0; i < originalSize; i++) {
            const point = targetPoints[i];
            if (!point) continue;
            const key = maskGridKey(point, inverseCellSize);
            const bucket = buckets.get(key);
            if (bucket) bucket.push(i);
            else buckets.set(key, [i]);
        }

        for (const maskPoint of sourcePoints) {
            if (!maskPoint) continue;
            const px = Number(maskPoint.x) || 0;
            const py = Number(maskPoint.y) || 0;
            const pz = Number(maskPoint.z) || 0;
            const cellX = Math.floor(px * inverseCellSize);
            const cellY = Math.floor(py * inverseCellSize);
            const cellZ = Math.floor(pz * inverseCellSize);
            for (let dx = -1; dx <= 1; dx++) {
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dz = -1; dz <= 1; dz++) {
                        const bucket = buckets.get(`${cellX + dx}:${cellY + dy}:${cellZ + dz}`);
                        if (!bucket || !bucket.length) continue;
                        for (const index of bucket) {
                            if (!alive[index]) continue;
                            const other = targetPoints[index];
                            if (!other) continue;
                            const ox = Number(other.x) || 0;
                            const oy = Number(other.y) || 0;
                            const oz = Number(other.z) || 0;
                            const ddx = px - ox;
                            const ddy = py - oy;
                            const ddz = pz - oz;
                            if (ddx * ddx + ddy * ddy + ddz * ddz < rangeSq) {
                                alive[index] = false;
                            }
                        }
                    }
                }
            }
        }

        let write = 0;
        for (let read = 0; read < originalSize; read++) {
            if (alive[read]) {
                targetPoints[write++] = targetPoints[read];
            }
        }
        if (write < originalSize) {
            targetPoints.length = write;
        }
    }

    function clearMaskPointSets(ctx, maskRange) {
        applyMaskInPlace(ctx.points, maskRange);
        if (Array.isArray(ctx.previewPoints) && ctx.previewPoints.length) {
            applyMaskInPlace(ctx.previewPoints, maskRange);
        }
    }

    function clearMaskPointSetsFromSource(ctx, sourcePoints, maskRange) {
        applyMaskFromSourceInPlace(ctx.points, sourcePoints, maskRange);
        if (Array.isArray(ctx.previewPoints) && ctx.previewPoints.length) {
            applyMaskFromSourceInPlace(ctx.previewPoints, sourcePoints, maskRange);
        }
    }

    function clearBallMaskPointSets(ctx, origin, radius) {
        if (!(radius > 0) || Number.isNaN(radius)) return;
        const ox = Number(origin?.x) || 0;
        const oy = Number(origin?.y) || 0;
        const oz = Number(origin?.z) || 0;
        const radiusSq = radius * radius;

        const apply = (points) => {
            if (!Array.isArray(points) || !points.length) return;
            let write = 0;
            for (let read = 0; read < points.length; read++) {
                const point = points[read];
                if (!point) continue;
                const dx = (Number(point.x) || 0) - ox;
                const dy = (Number(point.y) || 0) - oy;
                const dz = (Number(point.z) || 0) - oz;
                if (dx * dx + dy * dy + dz * dz > radiusSq) {
                    points[write++] = point;
                }
            }
            points.length = write;
        };

        apply(ctx.points);
        if (Array.isArray(ctx.previewPoints) && ctx.previewPoints.length) {
            apply(ctx.previewPoints);
        }
    }

    function clearRoundXZMaskPointSets(ctx, origin, radius, yAxisRange) {
        if (!(radius > 0) || Number.isNaN(radius)) return;
        const ox = Number(origin?.x) || 0;
        const oy = Number(origin?.y) || 0;
        const oz = Number(origin?.z) || 0;
        const radiusSq = radius * radius;
        const yRange = num(yAxisRange);
        const limitY = yRange > 0;

        const apply = (points) => {
            if (!Array.isArray(points) || !points.length) return;
            let write = 0;
            for (let read = 0; read < points.length; read++) {
                const point = points[read];
                if (!point) continue;
                const dx = (Number(point.x) || 0) - ox;
                const dz = (Number(point.z) || 0) - oz;
                const inRound = dx * dx + dz * dz < radiusSq;
                const inY = !limitY || Math.abs((Number(point.y) || 0) - oy) <= yRange;
                if (!(inRound && inY)) {
                    points[write++] = point;
                }
            }
            points.length = write;
        };

        apply(ctx.points);
        if (Array.isArray(ctx.previewPoints) && ctx.previewPoints.length) {
            apply(ctx.previewPoints);
        }
    }

    // -------------------------
    // KIND
    // -------------------------
    const KIND = {
        axis: {
            title: "axis(对称轴)",
            desc: "设置旋转轴（axis），不新增点",
            defaultParams: {x: 0, y: 1, z: 0},
            apply(ctx, node) {
                ctx.axis = U.v(num(node.params.x), num(node.params.y), num(node.params.z));
            },
            kotlin(node) {
                return `.axis(${relExpr(node.params.x, node.params.y, node.params.z)})`;
            }
        },

        rotate_as_axis: {
            title: "rotateAsAxis(绕轴旋转)",
            desc: "绕当前轴旋转已有点（不新增点）",
            defaultParams: {deg: 90, degUnit: "deg", useCustomAxis: false, ax: 0, ay: 1, az: 0},
            apply(ctx, node) {
                const rad = U.angleToRad(num(node.params.deg), node.params.degUnit);
                const axis = node.params.useCustomAxis
                    ? U.v(num(node.params.ax), num(node.params.ay), num(node.params.az))
                    : ctx.axis;
                mapAllPointSets(ctx, (point) => U.rotateAroundAxis(point, axis, rad));
            },
            kotlin(node) {
                const radExpr = U.angleToKotlinRadExpr(num(node.params.deg), node.params.degUnit);
                if (node.params.useCustomAxis) {
                    return `.rotateAsAxis(${radExpr}, ${relExpr(node.params.ax, node.params.ay, node.params.az)})`;
                }
                return `.rotateAsAxis(${radExpr})`;
            }
        },

        rotate_to: {
            title: "rotateTo(指向目标)",
            desc: "把轴指向目标方向（不新增点）",
            defaultParams: {mode: "toVec", tox: 0, toy: 1, toz: 1, ox: 0, oy: 0, oz: 0, ex: 0, ey: 0, ez: 1},
            apply(ctx, node) {
                if (!ctx.points || ctx.points.length === 0) return;

                // 检查参数
                const toX = num(node.params.tox);
                const toY = num(node.params.toy);
                const toZ = num(node.params.toz);

                let to;
                if (node.params.mode === "originEnd") {
                    // origin+end 模式计算目标向量
                    const origin = U.v(num(node.params.ox), num(node.params.oy), num(node.params.oz));
                    const end = U.v(num(node.params.ex), num(node.params.ey), num(node.params.ez));
                    to = U.sub(end, origin); // 计算目标向量
                } else {
                    // 使用传入的 toX, toY, toZ 作为目标向量
                    to = U.v(toX, toY, toZ);  // 将目标向量传入
                }
                const axis = U.norm(ctx.axis);  // 当前轴向
                const toN = U.norm(to);         // 目标向量的单位向量

                // 目标向量和轴向为零向量：跳过
                if (U.len(axis) <= 1e-12 || U.len(toN) <= 1e-12) return;

                // 计算旋转的四元数（根据目标向量来旋转）
                const q = new THREE.Quaternion();
                q.setFromUnitVectors(
                    new THREE.Vector3(axis.x, axis.y, axis.z),
                    new THREE.Vector3(toN.x, toN.y, toN.z)
                );

                // 使用四元数旋转所有点
                const v = new THREE.Vector3();
                for (const list of [ctx.points, ctx.previewPoints, ctx.maskPreviewPoints]) {
                    if (!Array.isArray(list) || !list.length) continue;
                    for (let i = 0; i < list.length; i++) {
                        const p = list[i];
                        v.set(p.x, p.y, p.z).applyQuaternion(q);  // 使用四元数旋转
                        p.x = v.x;
                        p.y = v.y;
                        p.z = v.z;
                    }
                }
            },
            kotlin(node) {
                if (node.params.mode === "originEnd") {
                    return `.rotateTo(${relExpr(node.params.ox, node.params.oy, node.params.oz)}, ${relExpr(node.params.ex, node.params.ey, node.params.ez)})`;
                }
                return `.rotateTo(${relExpr(node.params.tox, node.params.toy, node.params.toz)})`;
            }
        },

        scale: {
            title: "scale(缩放)",
            desc: "缩放现有点集（不新增点）",
            defaultParams: {factor: 1},
            apply(ctx, node) {
                const f = num(node.params.factor);
                if (f <= 0) return;
                mapAllPointSets(ctx, (point) => {
                    const out = U.mul(point, f);
                    if (point && point.radius !== undefined) out.radius = num(point.radius) * Math.abs(f);
                    if (point && point.yAxisRange !== undefined) out.yAxisRange = num(point.yAxisRange) * Math.abs(f);
                    return out;
                });
            },
            kotlin(node) {
                return `.scale(${U.fmt(num(node.params.factor))})`;
            }
        },

        add_point: {
            title: "addPoint(单点)",
            desc: "添加一个点（addPoint）",
            defaultParams: {x: 0, y: 0, z: 0},
            apply(ctx, node) {
                ctx.points.push(U.v(num(node.params.x), num(node.params.y), num(node.params.z)));
            },
            kotlin(node) {
                return `.addPoint(${relExpr(node.params.x, node.params.y, node.params.z)})`;
            }
        },

        add_line: {
            title: "addLine(线段)",
            desc: "添加线段采样点（addLine）",
            defaultParams: {sx: 0, sy: 0, sz: 0, ex: 3, ey: 0, ez: 3, count: 30},
            apply(ctx, node) {
                const s = U.v(num(node.params.sx), num(node.params.sy), num(node.params.sz));
                const e = U.v(num(node.params.ex), num(node.params.ey), num(node.params.ez));
                ctx.points.push(...U.getLineLocations(s, e, Math.max(1, int(node.params.count))));
            },
            kotlin(node) {
                return `.addLine(${relExpr(node.params.sx, node.params.sy, node.params.sz)}, ${relExpr(node.params.ex, node.params.ey, node.params.ez)}, ${int(node.params.count)})`;
            }
        },

        add_dotted_line: {
            title: "addDottedLine(虚线)",
            desc: "添加虚线线段采样点（addDottedLine）",
            defaultParams: {
                tx: 3, ty: 0, tz: 3,
                totalCount: 30,
                dottedCount: 4,
                emptyStep: 0.3,
                ox: 0, oy: 0, oz: 0
            },
            apply(ctx, node) {
                pushPoints(
                    ctx,
                    U.getDottedLineLocations(
                        U.v(num(node.params.tx), num(node.params.ty), num(node.params.tz)),
                        int(node.params.totalCount),
                        int(node.params.dottedCount),
                        num(node.params.emptyStep)
                    ),
                    getOffset(node.params)
                );
            },
            kotlin(node) {
                const offset = getOffset(node.params);
                const target = relExpr(node.params.tx, node.params.ty, node.params.tz);
                const totalCount = int(node.params.totalCount);
                const dottedCount = int(node.params.dottedCount);
                const emptyStep = U.fmt(num(node.params.emptyStep));
                if (hasOffset(offset)) {
                    return `.addDottedLine(${relExpr(offset.x, offset.y, offset.z)}, ${target}, ${totalCount}, ${dottedCount}, ${emptyStep})`;
                }
                return `.addDottedLine(${target}, ${totalCount}, ${dottedCount}, ${emptyStep})`;
            }
        },

        add_fill_triangle: {
            title: "addFillTriangle(三点填充三角形)",
            desc: "添加三角形填充点（addFillTriangle）",
            defaultParams: {
                p1x: 0, p1y: 0, p1z: 0,
                p2x: 3, p2y: 0, p2z: 0,
                p3x: 0, p3y: 0, p3z: 3,
                sampler: 3
            },
            apply(ctx, node) {
                const p1 = U.v(num(node.params.p1x), num(node.params.p1y), num(node.params.p1z));
                const p2 = U.v(num(node.params.p2x), num(node.params.p2y), num(node.params.p2z));
                const p3 = U.v(num(node.params.p3x), num(node.params.p3y), num(node.params.p3z));
                ctx.points.push(...U.fillTriangle(p1, p2, p3, num(node.params.sampler)));
            },
            kotlin(node) {
                return `.addFillTriangle(${relExpr(node.params.p1x, node.params.p1y, node.params.p1z)}, ${relExpr(node.params.p2x, node.params.p2y, node.params.p2z)}, ${relExpr(node.params.p3x, node.params.p3y, node.params.p3z)}, ${U.fmt(num(node.params.sampler))})`;
            }
        },

        add_circle: {
            title: "addCircle(XZ圆)",
            desc: "添加 XZ 圆周采样点（addCircle）",
            defaultParams: {r: 2, count: 120, ox: 0, oy: 0, oz: 0},
            apply(ctx, node) {
                pushPoints(ctx, U.getCircleXZ(num(node.params.r), int(node.params.count)), getOffset(node.params));
            },
            kotlin(node) {
                const offset = getOffset(node.params);
                const r = U.fmt(num(node.params.r));
                const count = int(node.params.count);
                if (hasOffset(offset)) return `.addCircle(${relExpr(offset.x, offset.y, offset.z)}, ${r}, ${count})`;
                return `.addCircle(${r}, ${count})`;
            }
        },

        add_dotted_circle: {
            title: "addDottedCircle(XZ虚线圆环)",
            desc: "添加 XZ 虚线圆环点（addDottedCircle）",
            defaultParams: {r: 2, totalCount: 120, dottedCount: 8, emptyStep: 0.2, ox: 0, oy: 0, oz: 0},
            apply(ctx, node) {
                pushPoints(
                    ctx,
                    U.getDottedCircleXZ(
                        num(node.params.r),
                        int(node.params.totalCount),
                        int(node.params.dottedCount),
                        num(node.params.emptyStep)
                    ),
                    getOffset(node.params)
                );
            },
            kotlin(node) {
                const offset = getOffset(node.params);
                const r = U.fmt(num(node.params.r));
                const totalCount = int(node.params.totalCount);
                const dottedCount = int(node.params.dottedCount);
                const emptyStep = U.fmt(num(node.params.emptyStep));
                if (hasOffset(offset)) {
                    return `.addDottedCircle(${relExpr(offset.x, offset.y, offset.z)}, ${r}, ${totalCount}, ${dottedCount}, ${emptyStep})`;
                }
                return `.addDottedCircle(${r}, ${totalCount}, ${dottedCount}, ${emptyStep})`;
            }
        },

        add_discrete_circle_xz: {
            title: "addDiscreteCircleXZ(离散圆环)",
            desc: "添加离散圆环点（addDiscreteCircleXZ）",
            defaultParams: {r: 2, count: 120, discrete: 0.4, seedEnabled: false, seed: 1, ox: 0, oy: 0, oz: 0},
            apply(ctx, node) {
                const seed = node.params.seedEnabled ? int(node.params.seed) : null;
                pushPoints(
                    ctx,
                    U.getDiscreteCircleXZ(num(node.params.r), int(node.params.count), num(node.params.discrete), seed),
                    getOffset(node.params)
                );
            },
            kotlin(node) {
                const offset = getOffset(node.params);
                const r = U.fmt(num(node.params.r));
                const count = int(node.params.count);
                const discrete = U.fmt(num(node.params.discrete));
                if (hasOffset(offset)) return `.addDiscreteCircleXZ(${relExpr(offset.x, offset.y, offset.z)}, ${r}, ${count}, ${discrete})`;
                return `.addDiscreteCircleXZ(${r}, ${count}, ${discrete})`;
            }
        },

        add_half_circle: {
            title: "addHalfCircle(半圆XZ)",
            desc: "添加半圆弧点（addHalfCircle）",
            defaultParams: {r: 2, count: 80, useRotate: false, rotateDeg: 0, rotateDegUnit: "deg", ox: 0, oy: 0, oz: 0},
            apply(ctx, node) {
                const rot = node.params.useRotate ? U.angleToRad(num(node.params.rotateDeg), node.params.rotateDegUnit) : 0;
                pushPoints(ctx, U.getHalfCircleXZ(num(node.params.r), int(node.params.count), rot), getOffset(node.params));
            },
            kotlin(node) {
                const offset = getOffset(node.params);
                const r = U.fmt(num(node.params.r));
                const c = int(node.params.count);
                if (!node.params.useRotate) {
                    if (hasOffset(offset)) return `.addHalfCircle(${relExpr(offset.x, offset.y, offset.z)}, ${r}, ${c})`;
                    return `.addHalfCircle(${r}, ${c})`;
                }
                const radExpr = U.angleToKotlinRadExpr(num(node.params.rotateDeg), node.params.rotateDegUnit);
                if (hasOffset(offset)) return `.addHalfCircle(${relExpr(offset.x, offset.y, offset.z)}, ${r}, ${c}, ${radExpr})`;
                return `.addHalfCircle(${r}, ${c}, ${radExpr})`;
            }
        },

        add_radian_center: {
            title: "addRadianCenter(弧线中心XZ)",
            desc: "添加居中弧线点（addRadianCenter）",
            defaultParams: {r: 2, count: 80, radianDeg: 120, radianDegUnit: "deg", useRotate: false, rotateDeg: 0, rotateDegUnit: "deg", ox: 0, oy: 0, oz: 0},
            apply(ctx, node) {
                const radian = U.angleToRad(num(node.params.radianDeg), node.params.radianDegUnit);
                const rot = node.params.useRotate ? U.angleToRad(num(node.params.rotateDeg), node.params.rotateDegUnit) : 0;
                pushPoints(ctx, U.getRadianXZCenter(num(node.params.r), int(node.params.count), radian, rot), getOffset(node.params));
            },
            kotlin(node) {
                const offset = getOffset(node.params);
                const r = U.fmt(num(node.params.r));
                const c = int(node.params.count);
                const radianExpr = U.angleToKotlinRadExpr(num(node.params.radianDeg), node.params.radianDegUnit);
                if (!node.params.useRotate) {
                    if (hasOffset(offset)) return `.addRadianCenter(${relExpr(offset.x, offset.y, offset.z)}, ${r}, ${c}, ${radianExpr})`;
                    return `.addRadianCenter(${r}, ${c}, ${radianExpr})`;
                }
                const rotExpr = U.angleToKotlinRadExpr(num(node.params.rotateDeg), node.params.rotateDegUnit);
                if (hasOffset(offset)) return `.addRadianCenter(${relExpr(offset.x, offset.y, offset.z)}, ${r}, ${c}, ${radianExpr}, ${rotExpr})`;
                return `.addRadianCenter(${r}, ${c}, ${radianExpr}, ${rotExpr})`;
            }
        },

        add_radian: {
            title: "addRadian(弧线XZ)",
            desc: "添加起止角弧线点（addRadian）",
            defaultParams: {r: 2, count: 80, startDeg: 0, startDegUnit: "deg", endDeg: 120, endDegUnit: "deg", useRotate: false, rotateDeg: 0, rotateDegUnit: "deg", ox: 0, oy: 0, oz: 0},
            apply(ctx, node) {
                const sr = U.angleToRad(num(node.params.startDeg), node.params.startDegUnit);
                const er = U.angleToRad(num(node.params.endDeg), node.params.endDegUnit);
                const rot = node.params.useRotate ? U.angleToRad(num(node.params.rotateDeg), node.params.rotateDegUnit) : 0;
                pushPoints(ctx, U.getRadianXZ(num(node.params.r), int(node.params.count), sr, er, rot), getOffset(node.params));
            },
            kotlin(node) {
                const offset = getOffset(node.params);
                const r = U.fmt(num(node.params.r));
                const c = int(node.params.count);
                const srExpr = U.angleToKotlinRadExpr(num(node.params.startDeg), node.params.startDegUnit);
                const erExpr = U.angleToKotlinRadExpr(num(node.params.endDeg), node.params.endDegUnit);
                if (!node.params.useRotate) {
                    if (hasOffset(offset)) return `.addRadian(${relExpr(offset.x, offset.y, offset.z)}, ${r}, ${c}, ${srExpr}, ${erExpr})`;
                    return `.addRadian(${r}, ${c}, ${srExpr}, ${erExpr})`;
                }
                const rotExpr = U.angleToKotlinRadExpr(num(node.params.rotateDeg), node.params.rotateDegUnit);
                if (hasOffset(offset)) return `.addRadian(${relExpr(offset.x, offset.y, offset.z)}, ${r}, ${c}, ${srExpr}, ${erExpr}, ${rotExpr})`;
                return `.addRadian(${r}, ${c}, ${srExpr}, ${erExpr}, ${rotExpr})`;
            }
        },

        add_ball: {
            title: "addBall(球面点集)",
            desc: "添加球面点集（addBall / countPow）",
            defaultParams: {r: 2, countPow: 24, ox: 0, oy: 0, oz: 0},
            apply(ctx, node) {
                pushPoints(ctx, U.getBallLocations(num(node.params.r), int(node.params.countPow)), getOffset(node.params));
            },
            kotlin(node) {
                const offset = getOffset(node.params);
                const r = U.fmt(num(node.params.r));
                const countPow = int(node.params.countPow);
                if (hasOffset(offset)) return `.addBall(${relExpr(offset.x, offset.y, offset.z)}, ${r}, ${countPow})`;
                return `.addBall(${r}, ${countPow})`;
            }
        },

        add_polygon: {
            title: "addPolygon(正多边形边点)",
            desc: "添加正多边形边点（addPolygon）",
            defaultParams: {r: 2, sideCount: 5, count: 30, ox: 0, oy: 0, oz: 0},
            apply(ctx, node) {
                pushPoints(
                    ctx,
                    U.getPolygonInCircleLocations(int(node.params.sideCount) || 3, int(node.params.count) || 1, num(node.params.r)),
                    getOffset(node.params)
                );
            },
            kotlin(node) {
                const offset = getOffset(node.params);
                const sideCount = int(node.params.sideCount);
                const count = int(node.params.count);
                const r = U.fmt(num(node.params.r));
                if (hasOffset(offset)) return `.addPolygonInCircle(${relExpr(offset.x, offset.y, offset.z)}, ${sideCount}, ${count}, ${r})`;
                return `.addPolygonInCircle(${sideCount}, ${count}, ${r})`;
            }
        },

        add_polygon_in_circle: {
            title: "addPolygonInCircle(内接正多边形边点)",
            desc: "添加内接多边形边点（addPolygonInCircle）",
            defaultParams: {n: 5, edgeCount: 30, r: 2, ox: 0, oy: 0, oz: 0},
            apply(ctx, node) {
                pushPoints(
                    ctx,
                    U.getPolygonInCircleLocations(int(node.params.n) || 3, int(node.params.edgeCount) || 1, num(node.params.r)),
                    getOffset(node.params)
                );
            },
            kotlin(node) {
                const offset = getOffset(node.params);
                const n = int(node.params.n);
                const edgeCount = int(node.params.edgeCount);
                const r = U.fmt(num(node.params.r));
                if (hasOffset(offset)) return `.addPolygonInCircle(${relExpr(offset.x, offset.y, offset.z)}, ${n}, ${edgeCount}, ${r})`;
                return `.addPolygonInCircle(${n}, ${edgeCount}, ${r})`;
            }
        },

        add_round_shape: {
            title: "addRoundShape(圆面XZ)",
            desc: "添加 XZ 圆面填充点（addRoundShape）",
            defaultParams: {
                r: 3,
                step: 0.25,
                mode: "fixed",
                preCircleCount: 60,
                minCircleCount: 20,
                maxCircleCount: 120,
                ox: 0,
                oy: 0,
                oz: 0
            },
            apply(ctx, node) {
                const offset = getOffset(node.params);
                if (node.params.mode === "range") {
                    pushPoints(
                        ctx,
                        U.getRoundScapeLocationsRange(num(node.params.r), num(node.params.step), int(node.params.minCircleCount), int(node.params.maxCircleCount)),
                        offset
                    );
                } else {
                    pushPoints(
                        ctx,
                        U.getRoundScapeLocations(num(node.params.r), num(node.params.step), int(node.params.preCircleCount)),
                        offset
                    );
                }
            },
            kotlin(node) {
                const offset = getOffset(node.params);
                const r = U.fmt(num(node.params.r));
                const step = U.fmt(num(node.params.step));
                if (node.params.mode === "range") {
                    if (hasOffset(offset)) {
                        return `.addRoundShape(${relExpr(offset.x, offset.y, offset.z)}, ${r}, ${step}, ${int(node.params.minCircleCount)}, ${int(node.params.maxCircleCount)})`;
                    }
                    return `.addRoundShape(${r}, ${step}, ${int(node.params.minCircleCount)}, ${int(node.params.maxCircleCount)})`;
                }
                if (hasOffset(offset)) {
                    return `.addRoundShape(${relExpr(offset.x, offset.y, offset.z)}, ${r}, ${step}, ${int(node.params.preCircleCount)})`;
                }
                return `.addRoundShape(${r}, ${step}, ${int(node.params.preCircleCount)})`;
            }
        },

        add_bezier: {
            hiddenInPicker: true,
            title: "addBezier(三点贝塞尔)",
            desc: "兼容旧版三点贝塞尔曲线点（addBezier）",
            defaultParams: {
                p1x: 0, p1y: 0, p1z: 0,
                p2x: 2, p2y: 2, p2z: 0,
                p3x: 4, p3y: 0, p3z: 0,
                count: 80
            },
            apply(ctx, node) {
                const p = node.params;
                const p0 = U.v(num(p.p1x), num(p.p1y), num(p.p1z));
                const p1 = U.v(num(p.p2x), num(p.p2y), num(p.p2z));
                const p2 = U.v(num(p.p3x), num(p.p3y), num(p.p3z));
                const cubic = quadToCubic(p0, p1, p2);
                ctx.points.push(...buildCubicBezier(p0, cubic.c1, cubic.c2, p2, int(p.count)));
            },
            kotlin(node) {
                const p = node.params;
                const p0 = U.v(num(p.p1x), num(p.p1y), num(p.p1z));
                const p1 = U.v(num(p.p2x), num(p.p2y), num(p.p2z));
                const p2 = U.v(num(p.p3x), num(p.p3y), num(p.p3z));
                const cubic = quadToCubic(p0, p1, p2);
                const target = U.sub(p2, p0);
                const startHandle = U.sub(cubic.c1, p0);
                const endHandle = U.sub(cubic.c2, p2);
                const startExpr = relExpr(p0.x, p0.y, p0.z);
                return `.addWith { generateBezierCurve(${relExpr(target.x, target.y, target.z)}, ${relExpr(startHandle.x, startHandle.y, startHandle.z)}, ${relExpr(endHandle.x, endHandle.y, endHandle.z)}, ${int(p.count)}).onEach { it.add(${startExpr}) } }`;
            }
        },

        add_bezier_4: {
            title: "Bezier(start-end+曲柄)",
            desc: "添加显式 start/end 与两个曲柄的三维贝塞尔曲线",
            defaultParams: {
                sx: 0, sy: 0, sz: 0,
                ex: 6, ey: 0, ez: 0,
                shx: 2, shy: 2, shz: 0,
                ehx: -2, ehy: 2, ehz: 0,
                count: 80
            },
            apply(ctx, node) {
                const p = node.params;
                const start = U.v(num(p.sx), num(p.sy), num(p.sz));
                const end = U.v(num(p.ex), num(p.ey), num(p.ez));
                const p1 = U.add(start, U.v(num(p.shx), num(p.shy), num(p.shz)));
                const p2 = U.add(end, U.v(num(p.ehx), num(p.ehy), num(p.ehz)));
                ctx.points.push(...buildCubicBezier(start, p1, p2, end, int(p.count)));
            },
            kotlin(node) {
                const p = node.params;
                return `.addBezierCurve(${relExpr(p.sx, p.sy, p.sz)}, ${relExpr(p.ex, p.ey, p.ez)}, ${relExpr(p.shx, p.shy, p.shz)}, ${relExpr(p.ehx, p.ehy, p.ehz)}, ${int(p.count)})`;
            }
        },

        add_bezier_curve: {
            title: "Bezier(end+曲柄)",
            desc: "添加以原点为 start、仅输入 end 与两个曲柄的三维贝塞尔曲线",
            defaultParams: { ex: 5, ey: 0, ez: 0, shx: 2, shy: 2, shz: 0, ehx: -2, ehy: 2, ehz: 0, count: 80 },
            apply(ctx, node) {
                const p = node.params;
                const start = U.v(0, 0, 0);
                const end = U.v(num(p.ex), num(p.ey), num(p.ez));
                const p1 = U.add(start, U.v(num(p.shx), num(p.shy), num(p.shz)));
                const p2 = U.add(end, U.v(num(p.ehx), num(p.ehy), num(p.ehz)));
                ctx.points.push(...buildCubicBezier(start, p1, p2, end, int(p.count)));
            },
            kotlin(node) {
                const p = node.params;
                return `.addBezierCurve(${relExpr(0, 0, 0)}, ${relExpr(p.ex, p.ey, p.ez)}, ${relExpr(p.shx, p.shy, p.shz)}, ${relExpr(p.ehx, p.ehy, p.ehz)}, ${int(p.count)})`;
            }
        },

        add_lightning_points: {
            title: "addLightningPoints(闪电折线点)",
            desc: "添加闪电折线采样点（addLightningPoints）",
            defaultParams: {
                useStart: false,
                sx: 0, sy: 0, sz: 0,
                ex: 6, ey: 2, ez: 0,
                count: 6,
                preLineCount: 10,
                useOffsetRange: true,
                offsetRange: 1.2
            },
            apply(ctx, node) {
                const end = U.v(num(node.params.ex), num(node.params.ey), num(node.params.ez));
                const counts = int(node.params.count);
                const plc = int(node.params.preLineCount);
                const offset = node.params.useOffsetRange ? num(node.params.offsetRange) : null;

                if (!node.params.useStart) {
                    ctx.points.push(...U.getLightningEffectPoints(end, counts, plc, offset));
                } else {
                    // 对齐 Kotlin：getLightningEffectPoints(end...).onEach{ it.add(start) }
                    // 注意：这里 end 是“偏移向量”，不是绝对终点
                    const start = U.v(num(node.params.sx), num(node.params.sy), num(node.params.sz));
                    const pts = U.getLightningEffectPoints(end, counts, plc, offset);
                    ctx.points.push(...pts.map(p => U.add(p, start)));
                }
            },
            kotlin(node) {
                const counts = int(node.params.count);
                const plc = int(node.params.preLineCount);
                const end = relExpr(node.params.ex, node.params.ey, node.params.ez);

                if (!node.params.useStart) {
                    if (node.params.useOffsetRange) {
                        return `.addLightningPoints(${end}, ${counts}, ${plc}, ${U.fmt(num(node.params.offsetRange))})`;
                    }
                    return `.addLightningPoints(${end}, ${counts}, ${plc})`;
                } else {
                    const start = relExpr(node.params.sx, node.params.sy, node.params.sz);
                    if (node.params.useOffsetRange) {
                        return `.addLightningPoints(${start}, ${end}, ${counts}, ${plc}, ${U.fmt(num(node.params.offsetRange))})`;
                    }
                    return `.addLightningPoints(${start}, ${end}, ${counts}, ${plc})`;
                }
            }
        },
        add_lightning_nodes: {
            title: "addLightningNodes(闪电节点)",
            desc: "添加闪电节点（addLightningNodes）",
            defaultParams: {
                useStart: false,
                sx: 0, sy: 0, sz: 0,
                ex: 6, ey: 2, ez: 0,
                count: 6,
                useOffsetRange: false,
                offsetRange: 1.2
            },
            apply(ctx, node) {
                const p = node.params;
                const start = p.useStart ? U.v(num(p.sx), num(p.sy), num(p.sz)) : U.v(0, 0, 0);
                const end = U.v(num(p.ex), num(p.ey), num(p.ez));
                const count = int(p.count);
                if (p.useOffsetRange) {
                    ctx.points.push(...U.getLightningEffectNodes(start, end, count, num(p.offsetRange)));
                } else {
                    ctx.points.push(...U.getLightningEffectNodes(start, end, count));
                }
            },
            kotlin(node) {
                const p = node.params;
                const end = relExpr(p.ex, p.ey, p.ez);
                const count = int(p.count);
                if (!p.useStart) {
                    if (p.useOffsetRange) {
                        return `.addLightningNodes(${end}, ${count}, ${U.fmt(num(p.offsetRange))})`;
                    }
                    return `.addLightningNodes(${end}, ${count})`;
                }
                const start = relExpr(p.sx, p.sy, p.sz);
                if (p.useOffsetRange) {
                    return `.addLightningNodes(${start}, ${end}, ${count}, ${U.fmt(num(p.offsetRange))})`;
                }
                return `.addLightningNodes(${start}, ${end}, ${count})`;
            }
        },
        add_lightning_nodes_attenuation: {
            title: "addLightningNodesAttenuation(衰减闪电节点)",
            desc: "添加带衰减的闪电节点（addLightningNodesAttenuation）",
            defaultParams: {
                useStart: false,
                sx: 0, sy: 0, sz: 0,
                ex: 6, ey: 2, ez: 0,
                counts: 6,
                maxOffset: 1.2,
                attenuation: 0.8,
                seedEnabled: false,
                seed: 1
            },
            apply(ctx, node) {
                const p = node.params;
                const start = p.useStart ? U.v(num(p.sx), num(p.sy), num(p.sz)) : U.v(0, 0, 0);
                const end = U.v(num(p.ex), num(p.ey), num(p.ez));
                const seed = p.seedEnabled ? int(p.seed) : null;

                ctx.points.push(
                    ...U.getLightningNodesEffectAttenuation(
                        start,
                        end,
                        int(p.counts),
                        num(p.maxOffset),
                        num(p.attenuation),
                        seed
                    )
                );
            },
            kotlin(node) {
                const p = node.params;
                const end = relExpr(p.ex, p.ey, p.ez);
                const counts = int(p.counts);
                const maxOffset = U.fmt(num(p.maxOffset));
                const attenuation = U.fmt(num(p.attenuation));

                if (!p.useStart) {
                    return `.addLightningNodesAttenuation(${end}, ${counts}, ${maxOffset}, ${attenuation})`;
                }
                const start = relExpr(p.sx, p.sy, p.sz);
                return `.addLightningNodesAttenuation(${start}, ${end}, ${counts}, ${maxOffset}, ${attenuation})`;
            }
        },
        apply_noise_offset: {
            title: "applyNoiseOffset(随机扰动)",
            desc: "对现有点做随机扰动（applyNoiseOffset）",
            defaultParams: {
                noiseX: 0.2, noiseY: 0.2, noiseZ: 0.2,
                mode: "AXIS_UNIFORM",
                seedEnabled: false, seed: 1,
                lenMinEnabled: false, offsetLenMin: 0.0,
                lenMaxEnabled: false, offsetLenMax: 0.0
            },
            apply(ctx, node) {
                const opts = {
                    mode: node.params.mode,
                    seed: node.params.seedEnabled ? int(node.params.seed) : null,
                    offsetLenMin: node.params.lenMinEnabled ? num(node.params.offsetLenMin) : null,
                    offsetLenMax: node.params.lenMaxEnabled ? num(node.params.offsetLenMax) : null,
                };
                mutateAllPointSets(ctx, (list) => {
                    U.applyNoiseOffset(list, num(node.params.noiseX), num(node.params.noiseY), num(node.params.noiseZ), opts);
                });
            },
            kotlin(node) {
                const nx = U.fmt(num(node.params.noiseX));
                const ny = U.fmt(num(node.params.noiseY));
                const nz = U.fmt(num(node.params.noiseZ));

                const named = [];
                if (node.params.mode && node.params.mode !== "AXIS_UNIFORM") named.push(`mode = NoiseMode.${node.params.mode}`);
                if (node.params.seedEnabled) named.push(`seed = ${int(node.params.seed)}L`);
                if (node.params.lenMinEnabled) named.push(`offsetLenMin = ${U.fmt(num(node.params.offsetLenMin))}`);
                if (node.params.lenMaxEnabled) named.push(`offsetLenMax = ${U.fmt(num(node.params.offsetLenMax))}`);

                if (named.length > 0) return `.applyNoiseOffset(${nx}, ${ny}, ${nz}, ${named.join(", ")})`;
                return `.applyNoiseOffset(${nx}, ${ny}, ${nz})`;
            }
        },

        points_on_each_offset: {
            title: "pointsOnEach { it.add(...) } (快捷偏移)",
            desc: "对每个点追加偏移点（pointsOnEach）",
            defaultParams: {offX: 0.2, offY: 0, offZ: 0, kotlinMode: "direct3"},
            apply(ctx, node) {
                const dx = num(node.params.offX), dy = num(node.params.offY), dz = num(node.params.offZ);
                mapAllPointSets(ctx, (point) => ({ x: point.x + dx, y: point.y + dy, z: point.z + dz }));
            },
            kotlin(node, emitCtx) {
                const dx = U.fmt(num(node.params.offX));
                const dy = U.fmt(num(node.params.offY));
                const dz = U.fmt(num(node.params.offZ));
                const mode = node.params.kotlinMode;

                if (mode === "newRel") return `.pointsOnEach { it.add(RelativeLocation(${dx}, ${dy}, ${dz})) }`;
                if (mode === "valRel") {
                    const varName = `rel_${node.id.slice(0, 6)}`;
                    emitCtx.decls.push(`val ${varName} = RelativeLocation(${dx}, ${dy}, ${dz})`);
                    return `.pointsOnEach { it.add(${varName}) }`;
                }
                return `.pointsOnEach { it.add(${dx}, ${dy}, ${dz}) }`;
            }
        },

        add_with: {
            title: "旋转嵌套组",
            desc: "按旋转重复嵌套组",
            defaultParams: {
                r: 3,
                c: 6,
                rotateToCenter: true,
                rotateReverse: false,
                rotateOffsetEnabled: false,
                rox: 0,
                roy: 0,
                roz: 0,
                ox: 0,
                oy: 0,
                oz: 0,
                previewBeforeOffsetEnabled: false
            },
            apply(ctx, node) {
                const r = num(node.params.r);
                const c = int(node.params.c);
                const rotateToCenter = !!node.params.rotateToCenter;
                const rotateReverse = !!node.params.rotateReverse;
                const rotateOffsetEnabled = !!node.params.rotateOffsetEnabled;
                const rox = num(node.params.rox);
                const roy = num(node.params.roy);
                const roz = num(node.params.roz);
                const offset = getOffset(node.params);
                const verts = U.getPolygonInCircleVertices(c, r);

                if (node.params.previewBeforeOffsetEnabled) {
                    const previewCtx = { points: [], axis: U.v(0, 1, 0), previewPoints: [], maskPreviewPoints: [] };
                    for (const ch of (node.children || [])) {
                        const def = KIND[ch.kind];
                        if (def && def.apply) def.apply(previewCtx, ch);
                    }
                    pushPreviewPoints(ctx, previewCtx.points || [], offset);
                    pushMaskPreviewPoints(ctx, previewCtx.maskPreviewPoints || [], { offset });
                }

                for (const it of verts) {
                    const childCtx = {points: [], axis: U.v(0, 1, 0), previewPoints: [], maskPreviewPoints: []};
                    for (const ch of (node.children || [])) {
                        const def = KIND[ch.kind];
                        if (def && def.apply) def.apply(childCtx, ch);
                    }

                    const pts = (childCtx.points || []).map(p => U.clone(p));
                    const maskPts = (childCtx.maskPreviewPoints || []).map(p => ({ ...p }));
                    const base = it;
                    if (rotateToCenter) {
                        const targetPoint = rotateOffsetEnabled ? U.v(rox, roy, roz) : U.v(0, 0, 0);
                        const rotateTarget = rotateReverse ? U.add(targetPoint, it) : U.sub(targetPoint, it);
                        rotatePointsToPointUpright(pts, rotateTarget, childCtx.axis);
                        rotatePointsToPointUpright(maskPts, rotateTarget, childCtx.axis);
                    }
                    for (const p of pts) {
                        ctx.points.push({
                            x: p.x + base.x + offset.x,
                            y: p.y + base.y + offset.y,
                            z: p.z + base.z + offset.z
                        });
                    }
                    for (const p of maskPts) {
                        if (!Array.isArray(ctx.maskPreviewPoints)) ctx.maskPreviewPoints = [];
                        ctx.maskPreviewPoints.push({
                            ...p,
                            x: num(p.x) + base.x + offset.x,
                            y: num(p.y) + base.y + offset.y,
                            z: num(p.z) + base.z + offset.z
                        });
                    }
                }
            },
            kotlin(node, emitCtx, indent, emitNodesKotlinLines) {
                const r = U.fmt(num(node.params.r));
                const c = int(node.params.c);
                const rotateToCenter = !!node.params.rotateToCenter;
                const rotateReverse = !!node.params.rotateReverse;
                const rotateOffsetEnabled = !!node.params.rotateOffsetEnabled;
                const rox = U.fmt(num(node.params.rox));
                const roy = U.fmt(num(node.params.roy));
                const roz = U.fmt(num(node.params.roz));
                const offset = getOffset(node.params);
                const lines = [];
                lines.push(`${indent}.addWith {`);
                lines.push(`${indent}  val res = arrayListOf<RelativeLocation>()`);
                lines.push(`${indent}  getPolygonInCircleVertices(${c}, ${r})`);
                lines.push(`${indent}        .forEach { it ->`);
                lines.push(`${indent}            val p = PointsBuilder()`);

                const childLines = emitNodesKotlinLines(node.children || [], indent + "              ", emitCtx);
                lines.push(...childLines);

                if (rotateToCenter) {
                    if (rotateOffsetEnabled) {
                        if (rotateReverse) {
                            lines.push(`${indent}            p.rotateTo(it.clone().add(${rox}, ${roy}, ${roz}))`);
                        } else {
                            lines.push(`${indent}            p.rotateTo((-it).add(${rox}, ${roy}, ${roz}))`);
                        }
                    } else {
                        lines.push(`${indent}            p.rotateTo(${rotateReverse ? "it" : "-it"})`);
                    }
                }
                lines.push(`${indent}            res.addAll(p`);
                lines.push(`${indent}                    .pointsOnEach { rel -> rel.add(it) }`);
                lines.push(`${indent}                    .createWithoutClone()`);
                lines.push(`${indent}            )`);
                lines.push(`${indent}        }`);
                if (hasOffset(offset)) {
                    lines.push(`${indent}  res.onEach { rel -> rel.add(${relExpr(offset.x, offset.y, offset.z)}) }`);
                }
                lines.push(`${indent}  res`);
                lines.push(`${indent}}`);
                return lines;
            }
        },

        add_builder: {
            title: "添加组",
            desc: "拼接子组的点并整体偏移",
            defaultParams: {ox: 0, oy: 0, oz: 0, folded: false},
            apply(ctx, node) {
                const ox = num(node.params.ox);
                const oy = num(node.params.oy);
                const oz = num(node.params.oz);
                const childCtx = {points: [], axis: U.v(0, 1, 0), previewPoints: [], maskPreviewPoints: []};
                for (const ch of (node.children || [])) {
                    const def = KIND[ch.kind];
                    if (def && def.apply) def.apply(childCtx, ch);
                }
                for (const p of (childCtx.points || [])) {
                    ctx.points.push({x: p.x + ox, y: p.y + oy, z: p.z + oz});
                }
                pushMaskPreviewPoints(ctx, childCtx.maskPreviewPoints || [], {
                    offset: { x: ox, y: oy, z: oz }
                });
            },
            kotlin(node, emitCtx, indent, emitNodesKotlinLines) {
                const lines = [];
                const ox = num(node.params.ox);
                const oy = num(node.params.oy);
                const oz = num(node.params.oz);
                lines.push(`${indent}.addBuilder(${relExpr(ox, oy, oz)},`);
                lines.push(`${indent}  PointsBuilder()`);

                const childLines = emitNodesKotlinLines(node.children || [], indent + "    ", emitCtx);
                lines.push(...childLines);

                lines.push(`${indent}  )`);
                return lines;
            }
        },

        add_fourier_series: {
            title: "addFourierSeries(傅里叶级数)",
            desc: "添加傅里叶级数曲线点（addFourierSeries）",
            defaultParams: {count: 360, scale: 1.0, folded: false, ox: 0, oy: 0, oz: 0},
            apply(ctx, node) {
                const terms = (node.terms || []).map(t => ({
                    r: num(t.r),
                    w: num(t.w),
                    startAngle: num(t.startAngle),
                    startAngleUnit: t.startAngleUnit
                }));
                const pts = U.buildFourierSeries(terms, int(node.params.count), num(node.params.scale));
                pushPoints(ctx, pts, getOffset(node.params));
            },
            kotlin(node, emitCtx, indent) {
                const lines = [];
                const offset = getOffset(node.params);
                if (hasOffset(offset)) lines.push(`${indent}.addFourierSeries(${relExpr(offset.x, offset.y, offset.z)},`);
                else lines.push(`${indent}.addFourierSeries(`);
                lines.push(`${indent}  FourierSeriesBuilder()`);
                lines.push(`${indent}    .count(${int(node.params.count)})`);
                lines.push(`${indent}    .scale(${U.fmt(num(node.params.scale))})`);
                for (const t of (node.terms || [])) {
                    // Kotlin: addFourier(r, w, startAngle)
                    const startAngleDeg = U.angleToDeg(num(t.startAngle), t.startAngleUnit);
                    lines.push(`${indent}    .addFourier(${U.fmt(num(t.r))}, ${U.fmt(num(t.w))}, ${U.fmt(startAngleDeg)})`);
                }
                lines.push(`${indent}  )`);
                return lines;
            }
        },

        clear_as_mask: {
            title: "clearAsMask(遮罩组)",
            desc: "子组正常生成点，然后用这些点遮罩清理此前点",
            defaultParams: {maskRange: 1.0},
            apply(ctx, node) {
                if (!Array.isArray(ctx.points)) ctx.points = [];
                const childCtx = { points: [], axis: U.v(0, 1, 0), previewPoints: [] };
                for (const ch of (node.children || [])) {
                    const def = KIND[ch.kind];
                    if (def && def.apply) def.apply(childCtx, ch);
                }
                if (childCtx.points.length) {
                    clearMaskPointSetsFromSource(ctx, childCtx.points, num(node.params.maskRange));
                    for (const p of childCtx.points) {
                        pushMaskPreviewCircleSegments(ctx, p, num(node.params.maskRange), {
                            nodeId: node.id,
                            maskKind: "point_mask",
                            segments: 24
                        });
                    }
                }
                for (const p of (childCtx.points || [])) {
                    ctx.points.push({ x: p.x, y: p.y, z: p.z });
                }
                if (Array.isArray(childCtx.previewPoints) && childCtx.previewPoints.length) {
                    if (!Array.isArray(ctx.previewPoints)) ctx.previewPoints = [];
                    for (const p of childCtx.previewPoints) {
                        ctx.previewPoints.push({ ...p });
                    }
                }
            },
            kotlin(node, emitCtx, indent, emitNodesKotlinLines) {
                const lines = [];
                lines.push(`${indent}.clearAsMaskAndJoin(`);
                lines.push(`${indent}  PointsBuilder()`);
                const childLines = emitNodesKotlinLines(node.children || [], indent + "    ", emitCtx);
                lines.push(...childLines);
                lines.push(`${indent}  , ${U.fmt(num(node.params.maskRange))}`);
                lines.push(`${indent})`);
                return lines;
            }
        },

        clear_as_ball_mask: {
            title: "clearAsBallMask(球形遮罩)",
            desc: "按球形范围清除当前组内此前生成的点",
            defaultParams: {ox: 0, oy: 0, oz: 0, radius: 1.0},
            apply(ctx, node) {
                const origin = U.v(num(node.params.ox), num(node.params.oy), num(node.params.oz));
                const radius = num(node.params.radius);
                clearBallMaskPointSets(
                    ctx,
                    origin,
                    radius
                );
                pushMaskPreviewSphereSegments(ctx, origin, radius, {
                    nodeId: node.id,
                    maskKind: "ball_mask"
                });
            },
            kotlin(node) {
                return `.clearAsBallMask(${relExpr(node.params.ox, node.params.oy, node.params.oz)}, ${U.fmt(num(node.params.radius))})`;
            }
        },

        clear_as_round_xz_mask: {
            title: "clearAsRoundXZMask(圆面遮罩)",
            desc: "按 XZ 圆面范围清除当前组内此前生成的点，可用 yAxisRange 限制高度范围",
            defaultParams: {ox: 0, oy: 0, oz: 0, radius: 1.0, yAxisRange: -1.0},
            apply(ctx, node) {
                const origin = U.v(num(node.params.ox), num(node.params.oy), num(node.params.oz));
                const radius = num(node.params.radius);
                clearRoundXZMaskPointSets(
                    ctx,
                    origin,
                    radius,
                    num(node.params.yAxisRange)
                );
                pushMaskPreviewCircleSegments(ctx, origin, radius, {
                    nodeId: node.id,
                    maskKind: "round_xz_mask",
                    segments: 72
                });
            },
            kotlin(node) {
                const origin = relExpr(node.params.ox, node.params.oy, node.params.oz);
                const radius = U.fmt(num(node.params.radius));
                const yAxisRange = U.fmt(num(node.params.yAxisRange));
                return `.clearAsRoundXZMask(${origin}, ${radius}, ${yAxisRange})`;
            }
        },

        clear: {
            title: "clear()",
            desc: "清空当前点集（clear）",
            defaultParams: {},
            apply(ctx) {
                clearAllPointSets(ctx);
            },
            kotlin() {
                return `.clear()`;
            }
        },
    };
    return KIND;
}

