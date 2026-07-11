export function createBuilderTools(ctx) {
    const { KIND, U, getState, getKotlinEndMode, rotatePointsToPointUpright } = ctx || {};
    const num = (value, fallback = 0) => {
        const next = Number(value);
        return Number.isFinite(next) ? next : fallback;
    };
    const int = (value, fallback = 0) => {
        const next = Math.trunc(num(value, fallback));
        return Number.isFinite(next) ? next : fallback;
    };

    function getSegmentRanges(seg) {
        if (!seg) return [];
        if (Array.isArray(seg.ranges)) {
            return seg.ranges
                .map((range) => ({
                    start: Math.trunc(Number(range?.start)),
                    end: Math.trunc(Number(range?.end))
                }))
                .filter((range) => Number.isFinite(range.start) && Number.isFinite(range.end) && range.end > range.start);
        }
        const start = Math.trunc(Number(seg.start));
        const end = Math.trunc(Number(seg.end));
        if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return [];
        return [{ start, end }];
    }

    function offsetSegmentRanges(seg, offset) {
        const delta = Math.trunc(Number(offset) || 0);
        return getSegmentRanges(seg).map((range) => ({
            start: range.start + delta,
            end: range.end + delta
        }));
    }

    function maskGridKey(point, inverseCellSize) {
        const x = Math.floor((Number(point?.x) || 0) * inverseCellSize);
        const y = Math.floor((Number(point?.y) || 0) * inverseCellSize);
        const z = Math.floor((Number(point?.z) || 0) * inverseCellSize);
        return `${x}:${y}:${z}`;
    }

    function applyMaskInPlace(points, maskRange) {
        if (!Array.isArray(points) || !points.length || !(maskRange > 0) || Number.isNaN(maskRange)) return null;
        const originalSize = points.length;
        const alive = new Array(originalSize).fill(true);
        const indexMap = new Array(originalSize).fill(-1);
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
                indexMap[read] = write;
                points[write++] = points[read];
            }
        }
        if (write < originalSize) {
            points.length = write;
        }
        return indexMap;
    }

    function applyMaskFromSourceInPlace(targetPoints, sourcePoints, maskRange) {
        if (!Array.isArray(targetPoints) || !targetPoints.length) return null;
        if (!Array.isArray(sourcePoints) || !sourcePoints.length) return null;
        if (!(maskRange > 0) || Number.isNaN(maskRange)) return null;
        const originalSize = targetPoints.length;
        const alive = new Array(originalSize).fill(true);
        const indexMap = new Array(originalSize).fill(-1);
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
                indexMap[read] = write;
                targetPoints[write++] = targetPoints[read];
            }
        }
        if (write < originalSize) {
            targetPoints.length = write;
        }
        return indexMap;
    }

    function clearMaskPointSets(ctx, maskRange) {
        const indexMap = applyMaskInPlace(ctx.points, maskRange);
        if (Array.isArray(ctx.previewPoints) && ctx.previewPoints.length) {
            applyMaskInPlace(ctx.previewPoints, maskRange);
        }
        return indexMap;
    }

    function clearMaskPointSetsFromSource(ctx, sourcePoints, maskRange) {
        const indexMap = applyMaskFromSourceInPlace(ctx.points, sourcePoints, maskRange);
        if (Array.isArray(ctx.previewPoints) && ctx.previewPoints.length) {
            applyMaskFromSourceInPlace(ctx.previewPoints, sourcePoints, maskRange);
        }
        return indexMap;
    }

    function remapSegmentRanges(seg, indexMap) {
        const ranges = getSegmentRanges(seg);
        if (!ranges.length || !Array.isArray(indexMap) || !indexMap.length) return [];
        const remapped = [];
        let current = null;

        const pushCurrent = () => {
            if (current && current.end > current.start) {
                remapped.push(current);
            }
            current = null;
        };

        for (const range of ranges) {
            const start = Math.max(0, range.start | 0);
            const end = Math.min(indexMap.length, range.end | 0);
            for (let i = start; i < end; i++) {
                const mapped = indexMap[i];
                if (!(mapped >= 0)) {
                    pushCurrent();
                    continue;
                }
                if (current && current.end === mapped) {
                    current.end += 1;
                } else {
                    pushCurrent();
                    current = { start: mapped, end: mapped + 1 };
                }
            }
            pushCurrent();
        }

        pushCurrent();
        return remapped;
    }

    function remapAllSegmentsAfterMask(segments, indexMap) {
        if (!segments || !Array.isArray(indexMap) || !indexMap.length) return;
        for (const [id, seg] of segments.entries()) {
            const remapped = remapSegmentRanges(seg, indexMap);
            if (remapped.length) {
                segments.set(id, { ranges: remapped });
            } else {
                segments.delete(id);
            }
        }
    }

    function pushSegmentRanges(map, id, ranges) {
        if (!id || !Array.isArray(ranges) || !ranges.length) return;
        const valid = ranges.filter((range) => range && range.end > range.start);
        if (!valid.length) return;
        const prev = map.get(id);
        const prevRanges = getSegmentRanges(prev);
        map.set(id, { ranges: prevRanges.concat(valid) });
    }

    function buildPointOwnerByIndex(totalCount, segments) {
        const owners = new Array(totalCount || 0);
        if (!segments) return owners;
        for (const [id, seg] of segments.entries()) {
            for (const range of getSegmentRanges(seg)) {
                const start = Math.max(0, range.start | 0);
                const end = Math.min(owners.length, range.end | 0);
                for (let i = start; i < end; i++) owners[i] = id;
            }
        }
        return owners;
    }

    function pushMaskPreviewPoints(targetCtx, points, offset = null) {
        const list = Array.isArray(points) ? points : [];
        if (!list.length) return;
        if (!Array.isArray(targetCtx.maskPreviewPoints)) targetCtx.maskPreviewPoints = [];
        const off = offset || { x: 0, y: 0, z: 0 };
        for (const p of list) {
            targetCtx.maskPreviewPoints.push({
                ...p,
                x: num(p?.x) + num(off.x),
                y: num(p?.y) + num(off.y),
                z: num(p?.z) + num(off.z)
            });
        }
    }

    function getCirclePoint(origin, radius, angle, plane = "XZ") {
        const c = Math.cos(angle) * radius;
        const s = Math.sin(angle) * radius;
        if (plane === "XY") return { x: origin.x + c, y: origin.y + s, z: origin.z };
        if (plane === "ZY") return { x: origin.x, y: origin.y + c, z: origin.z + s };
        return { x: origin.x + c, y: origin.y, z: origin.z + s };
    }

    function pushMaskPreviewCircleSegments(targetCtx, origin, radius, options = {}) {
        const r = num(radius);
        if (!(r > 0) || Number.isNaN(r)) return;
        const center = { x: num(origin?.x), y: num(origin?.y), z: num(origin?.z) };
        const segments = Math.max(12, int(options.segments || 72));
        const plane = options.plane || "XZ";
        if (!Array.isArray(targetCtx.maskPreviewPoints)) targetCtx.maskPreviewPoints = [];
        for (let i = 0; i < segments; i += 2) {
            const a = getCirclePoint(center, r, (i / segments) * Math.PI * 2, plane);
            const b = getCirclePoint(center, r, ((i + 1) / segments) * Math.PI * 2, plane);
            targetCtx.maskPreviewPoints.push({
                ...a,
                radius: r,
                maskKind: options.maskKind || "point_mask",
                nodeId: options.nodeId || null,
                previewType: "mask_line"
            });
            targetCtx.maskPreviewPoints.push({
                ...b,
                radius: r,
                maskKind: options.maskKind || "point_mask",
                nodeId: options.nodeId || null,
                previewType: "mask_line"
            });
        }
    }

    // Eval（同时计算：每个卡片新增的点在最终点数组里的区间，用于高亮）
    function evalBuilderWithMeta(nodes, initialAxis) {
        const ctxLocal = { points: [], axis: U.clone(initialAxis || U.v(0, 1, 0)), previewPoints: [], maskPreviewPoints: [] };
        const segments = new Map(); // nodeId -> {start, end}

        function evalList(list, targetCtx, baseOffset) {
            const arr = list || [];
            for (const n of arr) {
                if (!n) continue;

                // 特殊：addBuilder/withBuilder 需要递归并把子段位移到父数组区间
                if (n.kind === "add_builder" || n.kind === "with_builder") {
                    const before = targetCtx.points.length;
                    const child = evalBuilderWithMeta(n.children || [], U.v(0, 1, 0));
                    const useOffset = n.kind === "add_builder";
                    let ox = 0, oy = 0, oz = 0;
                    if (useOffset) {
                        const rx = Number(n.params?.ox);
                        const ry = Number(n.params?.oy);
                        const rz = Number(n.params?.oz);
                        ox = Number.isFinite(rx) ? rx : 0;
                        oy = Number.isFinite(ry) ? ry : 0;
                        oz = Number.isFinite(rz) ? rz : 0;
                    }
                    if (useOffset) {
                        for (const p of (child.points || [])) {
                            targetCtx.points.push({ x: p.x + ox, y: p.y + oy, z: p.z + oz });
                        }
                    } else {
                        targetCtx.points.push(...child.points);
                    }
                    if (Array.isArray(child.previewPoints) && child.previewPoints.length) {
                        if (!Array.isArray(targetCtx.previewPoints)) targetCtx.previewPoints = [];
                        if (useOffset) {
                            for (const p of child.previewPoints) {
                                targetCtx.previewPoints.push({
                                    ...p,
                                    x: p.x + ox,
                                    y: p.y + oy,
                                    z: p.z + oz
                                });
                            }
                        } else {
                            targetCtx.previewPoints.push(...child.previewPoints.map((p) => ({ ...p })));
                        }
                    }
                    pushMaskPreviewPoints(targetCtx, child.maskPreviewPoints, useOffset ? { x: ox, y: oy, z: oz } : null);
                    const after = targetCtx.points.length;

                    if (after > before) segments.set(n.id, { start: before + baseOffset, end: after + baseOffset });
                    for (const [cid, seg] of child.segments.entries()) {
                        pushSegmentRanges(segments, cid, offsetSegmentRanges(seg, before + baseOffset));
                    }
                    continue;
                }

                if (n.kind === "clear_as_mask") {
                    const child = evalBuilderWithMeta(n.children || [], U.v(0, 1, 0));
                    const childPoints = Array.isArray(child.points) ? child.points : [];
                    const childPreviewPoints = Array.isArray(child.previewPoints) ? child.previewPoints : [];
                    const indexMap = childPoints.length
                        ? clearMaskPointSetsFromSource(targetCtx, childPoints, num(n.params?.maskRange))
                        : null;
                    remapAllSegmentsAfterMask(segments, indexMap);
                    const childStart = targetCtx.points.length;
                    if (childPoints.length) {
                        for (const p of childPoints) {
                            pushMaskPreviewCircleSegments(targetCtx, p, num(n.params?.maskRange), {
                                nodeId: n.id || null,
                                maskKind: "point_mask",
                                segments: 24
                            });
                        }
                        for (const p of childPoints) {
                            targetCtx.points.push({ x: p.x, y: p.y, z: p.z });
                        }
                    }
                    if (childPreviewPoints.length) {
                        if (!Array.isArray(targetCtx.previewPoints)) targetCtx.previewPoints = [];
                        targetCtx.previewPoints.push(...childPreviewPoints.map((p) => ({ ...p })));
                    }
                    pushMaskPreviewPoints(targetCtx, child.maskPreviewPoints);
                    for (const [cid, seg] of child.segments.entries()) {
                        pushSegmentRanges(segments, cid, offsetSegmentRanges(seg, childStart + baseOffset));
                    }
                    const childEnd = targetCtx.points.length;
                    if (Array.isArray(indexMap) && indexMap.length) {
                        segments.set(n.id, { start: childStart + baseOffset, end: childEnd + baseOffset });
                    } else if (childEnd > childStart) {
                        segments.set(n.id, { start: childStart + baseOffset, end: childEnd + baseOffset });
                    }
                    continue;
                }

                if (n.kind === "add_with") {
                    const before = targetCtx.points.length;
                    const child = evalBuilderWithMeta(n.children || [], U.v(0, 1, 0));
                    const childPoints = Array.isArray(child.points) ? child.points : [];
                    const offset = {
                        x: num(n.params?.ox),
                        y: num(n.params?.oy),
                        z: num(n.params?.oz)
                    };

                    if (n.params?.previewBeforeOffsetEnabled && childPoints.length) {
                        if (!Array.isArray(targetCtx.previewPoints)) targetCtx.previewPoints = [];
                        const previewOwners = buildPointOwnerByIndex(childPoints.length, child.segments);
                        for (let i = 0; i < childPoints.length; i++) {
                            const point = childPoints[i];
                            targetCtx.previewPoints.push({
                                x: num(point?.x) + offset.x,
                                y: num(point?.y) + offset.y,
                                z: num(point?.z) + offset.z,
                                nodeId: previewOwners[i] || null,
                                previewParentId: n.id || null,
                                previewSource: "add_with"
                            });
                        }
                    }

                    const r = num(n.params?.r);
                    const c = Math.max(0, int(n.params?.c));
                    const rotateToCenter = !!n.params?.rotateToCenter;
                    const rotateReverse = !!n.params?.rotateReverse;
                    const rotateOffsetEnabled = !!n.params?.rotateOffsetEnabled;
                    const rox = num(n.params?.rox);
                    const roy = num(n.params?.roy);
                    const roz = num(n.params?.roz);
                    const verts = U.getPolygonInCircleVertices(c, r) || [];
                    const childAxis = child.axis || U.v(0, 1, 0);
                    const repeatedChildSegments = new Map();

                    for (const base of verts) {
                        const repeatStart = targetCtx.points.length;
                        const pts = childPoints.map((point) => U.clone(point));
                        const maskPts = (child.maskPreviewPoints || []).map((point) => ({ ...point }));
                        if (rotateToCenter && pts.length && typeof rotatePointsToPointUpright === "function") {
                            const targetPoint = rotateOffsetEnabled ? U.v(rox, roy, roz) : U.v(0, 0, 0);
                            const rotateTarget = rotateReverse ? U.add(targetPoint, base) : U.sub(targetPoint, base);
                            rotatePointsToPointUpright(pts, rotateTarget, childAxis);
                            if (maskPts.length) rotatePointsToPointUpright(maskPts, rotateTarget, childAxis);
                        }
                        for (const point of pts) {
                            targetCtx.points.push({
                                x: num(point?.x) + num(base?.x) + offset.x,
                                y: num(point?.y) + num(base?.y) + offset.y,
                                z: num(point?.z) + num(base?.z) + offset.z
                            });
                        }
                        pushMaskPreviewPoints(targetCtx, maskPts, {
                            x: num(base?.x) + offset.x,
                            y: num(base?.y) + offset.y,
                            z: num(base?.z) + offset.z
                        });
                        for (const [cid, seg] of child.segments.entries()) {
                            pushSegmentRanges(repeatedChildSegments, cid, offsetSegmentRanges(seg, repeatStart));
                        }
                    }

                    const after = targetCtx.points.length;
                    if (after > before) segments.set(n.id, { start: before + baseOffset, end: after + baseOffset });
                    for (const [cid, seg] of repeatedChildSegments.entries()) {
                        pushSegmentRanges(segments, cid, offsetSegmentRanges(seg, baseOffset));
                    }
                    continue;
                }

                const def = KIND && KIND[n.kind];
                if (!def || !def.apply) continue;

                const beforeLen = targetCtx.points.length;
                const beforeRef = targetCtx.points;
                def.apply(targetCtx, n);
                const afterLen = targetCtx.points.length;

                // 只有“追加到同一数组”的情况才认为这张卡片直接新增了粒子
                if (afterLen > beforeLen && targetCtx.points === beforeRef) {
                    segments.set(n.id, { start: beforeLen + baseOffset, end: afterLen + baseOffset });
                }
            }
        }

        evalList(nodes || [], ctxLocal, 0);
        return {
            points: ctxLocal.points,
            segments,
            previewPoints: ctxLocal.previewPoints,
            maskPreviewPoints: ctxLocal.maskPreviewPoints,
            axis: ctxLocal.axis
        };
    }

    // 兼容旧调用：只要点集
    function evalBuilder(nodes, initialAxis) {
        return evalBuilderWithMeta(nodes, initialAxis).points;
    }

    // Kotlin emit（每个 add/调用一行）
    function emitNodesKotlinLines(nodes, indent, emitCtx) {
            const lines = [];
            for (const n of (nodes || [])) {
                const def = KIND && KIND[n.kind];
                if (!def || !def.kotlin) continue;

            if (n.kind === "add_builder" || n.kind === "with_builder" || n.kind === "add_with" || n.kind === "clear_as_mask") {
                lines.push(...def.kotlin(n, emitCtx, indent, emitNodesKotlinLines));
                continue;
            }
            if (n.kind === "add_fourier_series") {
                lines.push(...def.kotlin(n, emitCtx, indent));
                continue;
            }
            const call = def.kotlin(n, emitCtx);
            lines.push(`${indent}${call}`);
        }
        return lines;
    }

    function emitKotlin() {
        const emitCtx = {decls: []};
        const lines = [];
        const state = (typeof getState === "function") ? getState() : (ctx && ctx.state) || { root: { children: [] } };
        const endMode = (typeof getKotlinEndMode === "function") ? getKotlinEndMode() : (ctx && ctx.kotlinEndMode) || "builder";
        lines.push("PointsBuilder()");
        lines.push(...emitNodesKotlinLines(state.root.children, "  ", emitCtx));
        if (endMode === "list") {
            lines.push("  .createWithoutClone()");
        } else if (endMode === "clone") {
            lines.push("  .create()");
        }

        const expr = lines.join("\n");
        if (emitCtx.decls.length > 0) {
            const declLines = emitCtx.decls.map(s => `  ${s}`);
            return ["run {", ...declLines, `  ${expr.replace(/\n/g, "\n  ")}`, "}"].join("\n");
        }
        return expr;
    }

    return {
        evalBuilderWithMeta,
        evalBuilder,
        emitNodesKotlinLines,
        emitKotlin
    };
}
