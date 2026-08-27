import * as THREE from "three";
import { createPointsBuilderReferenceGuide } from "./model.js?v=20260826_5";

const AXIS_KEYS = {
    X: "x",
    Y: "y",
    Z: "z"
};

const MIRROR_NORMAL_KEYS = {
    XY: "z",
    XZ: "y",
    ZY: "x"
};

const AXIS_COLORS = {
    X: 0xff6262,
    Y: 0x66dd88,
    Z: 0x5f9dff
};
const MAX_SEGMENT_SNAP_POINTS = 66;

const EYE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.8 12s3.3-5.2 9.2-5.2S21.2 12 21.2 12s-3.3 5.2-9.2 5.2S2.8 12 2.8 12Z"/><circle cx="12" cy="12" r="2.4"/></svg>';
const LOCK_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5.5" y="10" width="13" height="9.5" rx="2"/><path d="M8.5 10V7.5a3.5 3.5 0 0 1 7 0V10"/></svg>';
const DELETE_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5"/></svg>';

function finiteNumber(value, fallback = 0) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}

function escapeHtml(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

function formatNumber(value) {
    const number = finiteNumber(value, 0);
    if (Math.abs(number) < 1e-10) return "0";
    return Number(number.toFixed(6)).toString();
}

function guidePoint(guide, scalar) {
    const point = {
        x: finiteNumber(guide?.origin?.x, 0),
        y: finiteNumber(guide?.origin?.y, 0),
        z: finiteNumber(guide?.origin?.z, 0)
    };
    const key = AXIS_KEYS[guide?.axis] || "x";
    point[key] += finiteNumber(scalar, 0);
    return point;
}

export function createMeasuredReferenceGuide(result, options = {}) {
    const axis = String(result?.axis || "").toUpperCase();
    const key = AXIS_KEYS[axis];
    if (!key || !result?.pointA) return null;
    const origin = {
        x: finiteNumber(result.pointA.x, 0),
        y: finiteNumber(result.pointA.y, 0),
        z: finiteNumber(result.pointA.z, 0)
    };
    let signedDistance = finiteNumber(result.signedDistance, NaN);
    if (!Number.isFinite(signedDistance) && result?.pointB) {
        signedDistance = finiteNumber(result.pointB[key], origin[key]) - origin[key];
    }
    if (!Number.isFinite(signedDistance)) return null;
    return createPointsBuilderReferenceGuide({
        id: options.id,
        name: options.name || `${axis} 轴参考线`,
        axis,
        mode: "segment",
        origin,
        start: Math.min(0, signedDistance),
        end: Math.max(0, signedDistance)
    }, options);
}

export function createMirroredReferenceGuide(source, options = {}) {
    if (!source) return null;
    const plane = String(options.plane || "XZ").toUpperCase();
    const normalKey = MIRROR_NORMAL_KEYS[plane];
    if (!normalKey) return null;
    const offset = finiteNumber(options.offset, 0);
    const origin = {
        x: finiteNumber(source.origin?.x, 0),
        y: finiteNumber(source.origin?.y, 0),
        z: finiteNumber(source.origin?.z, 0)
    };
    origin[normalKey] = offset * 2 - origin[normalKey];
    let start = finiteNumber(source.start, -2);
    let end = finiteNumber(source.end, 2);
    if (AXIS_KEYS[source.axis] === normalKey) {
        [start, end] = [-end, -start];
    }
    return createPointsBuilderReferenceGuide({
        ...source,
        id: options.id,
        name: options.name || `${source.name || `${source.axis || "X"} 轴参考线`} 镜像`,
        origin,
        start,
        end
    }, options);
}

export function getReferenceGuideSnapPoints(guide, options = {}) {
    if (!guide || guide.visible === false || guide.snapEnabled === false || guide.mode !== "segment") return [];
    const start = finiteNumber(guide.start, -2);
    const end = finiteNumber(guide.end, 2);
    const points = [];
    if (options.includeEndpoints !== false && guide.snapEndpoints !== false) {
        points.push({ ...guidePoint(guide, start), snapType: "endpoint" });
        points.push({ ...guidePoint(guide, end), snapType: "endpoint" });
    }
    const divisionCount = Math.max(1, Math.min(64, Math.trunc(finiteNumber(guide.divisionCount, 1))));
    for (let index = 1; index <= divisionCount; index++) {
        const t = index / (divisionCount + 1);
        points.push({
            ...guidePoint(guide, start + (end - start) * t),
            snapType: "division"
        });
    }
    return points;
}

function pointDistanceSquared(left, right) {
    return (left.x - right.x) ** 2
        + (left.y - right.y) ** 2
        + (left.z - right.z) ** 2;
}

function infiniteGuideSnapPoint(guide, raw) {
    const point = {
        x: finiteNumber(guide?.origin?.x, 0),
        y: finiteNumber(guide?.origin?.y, 0),
        z: finiteNumber(guide?.origin?.z, 0),
        snapType: "step"
    };
    const key = AXIS_KEYS[guide?.axis] || "x";
    const step = Math.max(0.000001, finiteNumber(guide.step, 1));
    const originValue = point[key];
    point[key] = originValue + Math.round((finiteNumber(raw?.[key], originValue) - originValue) / step) * step;
    return point;
}

export function findReferenceGuideSnapCandidate(guides, raw, plane = "XZ", maxDistance = Infinity, options = {}) {
    const safeRaw = raw && typeof raw === "object" ? raw : { x: 0, y: 0, z: 0 };
    const limit = Math.max(0, finiteNumber(maxDistance, Infinity));
    let best = null;
    let bestDistanceSquared = Infinity;
    for (const guide of Array.isArray(guides) ? guides : []) {
        if (!guide || guide.visible === false || guide.snapEnabled === false) continue;
        const candidates = guide.mode === "line"
            ? [infiniteGuideSnapPoint(guide, safeRaw)]
            : getReferenceGuideSnapPoints(guide, options);
        for (const point of candidates) {
            const candidateDistanceSquared = pointDistanceSquared(safeRaw, point);
            if (candidateDistanceSquared >= bestDistanceSquared) continue;
            bestDistanceSquared = candidateDistanceSquared;
            best = { point, guide, distanceSquared: candidateDistanceSquared };
        }
    }
    if (!best || bestDistanceSquared > limit * limit) return null;
    const point = { ...best.point };
    if (plane === "XY") point.z = finiteNumber(safeRaw.z, point.z);
    else if (plane === "ZY") point.x = finiteNumber(safeRaw.x, point.x);
    else point.y = finiteNumber(safeRaw.y, point.y);
    return { ...best, point };
}

function renderGuideItem(guide, selectedId = "") {
    const locked = guide.locked === true;
    const segment = guide.mode === "segment";
    const length = Math.abs(finiteNumber(guide.end, 2) - finiteNumber(guide.start, -2));
    const selected = guide.id === selectedId;
    const summary = segment
        ? `线段 · 长度 ${formatNumber(length)}`
        : `直线 · 步长 ${formatNumber(guide.step)}`;
    return `
        <article class="reference-guide-item${locked ? " locked" : ""}${selected ? " selected" : ""}" data-guide-id="${escapeHtml(guide.id)}" aria-current="${selected ? "true" : "false"}">
            <div class="reference-guide-head">
                <span class="reference-guide-axis reference-guide-axis--${guide.axis.toLowerCase()}">${guide.axis}</span>
                <span class="reference-guide-title" title="${escapeHtml(guide.name)}">${escapeHtml(guide.name)}</span>
                <button class="reference-guide-icon${guide.visible !== false ? " active" : ""}" type="button" data-guide-action="visible" title="显示或隐藏" aria-label="显示或隐藏">${EYE_ICON}</button>
                <button class="reference-guide-icon${locked ? " active" : ""}" type="button" data-guide-action="locked" title="锁定或解锁" aria-label="锁定或解锁">${LOCK_ICON}</button>
                <button class="reference-guide-icon danger" type="button" data-guide-action="delete" title="删除参考线" aria-label="删除参考线">${DELETE_ICON}</button>
            </div>
            <div class="reference-guide-summary">
                <span>${summary}</span>
                <span>${guide.snapEnabled !== false ? "吸附开启" : "吸附关闭"}${locked ? " · 已锁定" : ""}</span>
            </div>
        </article>
    `;
}

function renderGuideEditor(guide) {
    const locked = guide.locked === true;
    const disabled = locked ? " disabled" : "";
    const segment = guide.mode === "segment";
    const length = Math.abs(finiteNumber(guide.end, 2) - finiteNumber(guide.start, -2));
    return `
        <section class="reference-guide-editor" data-guide-id="${escapeHtml(guide.id)}">
            <div class="reference-guide-editor-head">
                <span class="reference-guide-axis reference-guide-axis--${guide.axis.toLowerCase()}">${guide.axis}</span>
                <label class="reference-guide-editor-name"><span>名称</span><input class="input" data-guide-field="name" value="${escapeHtml(guide.name)}"${disabled}/></label>
            </div>
            ${locked ? '<div class="reference-guide-editor-state">参考线已锁定。请在左侧列表解锁后编辑。</div>' : ""}
            <div class="reference-guide-grid">
                <label><span>轴向</span><select class="input" data-guide-field="axis"${disabled}>
                    ${["X", "Y", "Z"].map((axis) => `<option value="${axis}"${guide.axis === axis ? " selected" : ""}>${axis}</option>`).join("")}
                </select></label>
                <label><span>模式</span><select class="input" data-guide-field="mode"${disabled}>
                    <option value="segment"${segment ? " selected" : ""}>线段</option>
                    <option value="line"${segment ? "" : " selected"}>直线</option>
                </select></label>
                <label><span>吸附</span><input type="checkbox" data-guide-field="snapEnabled"${guide.snapEnabled !== false ? " checked" : ""}${disabled}/></label>
            </div>
            <div class="reference-guide-origin">
                <span>位置</span>
                ${["x", "y", "z"].map((key) => `<label><span>${key.toUpperCase()}</span><input class="input" type="number" data-guide-origin="${key}" value="${formatNumber(guide.origin?.[key])}" step="0.1"${disabled}/></label>`).join("")}
            </div>
            ${segment ? `
                <div class="reference-guide-grid reference-guide-grid--segment">
                    <label><span>起点</span><input class="input" type="number" data-guide-field="start" value="${formatNumber(guide.start)}" step="0.1"${disabled}/></label>
                    <label><span>终点</span><input class="input" type="number" data-guide-field="end" value="${formatNumber(guide.end)}" step="0.1"${disabled}/></label>
                    <label><span>N 分点</span><input class="input" type="number" data-guide-field="divisionCount" value="${guide.divisionCount}" min="1" max="64" step="1"${disabled}/></label>
                    <label><span>端点</span><input type="checkbox" data-guide-field="snapEndpoints"${guide.snapEndpoints !== false ? " checked" : ""}${disabled}/></label>
                </div>
                <div class="reference-guide-meta">实际长度 ${formatNumber(length)}</div>
            ` : `
                <div class="reference-guide-grid reference-guide-grid--line">
                    <label><span>吸附步长</span><input class="input" type="number" data-guide-field="step" value="${formatNumber(guide.step)}" min="0.000001" step="0.1"${disabled}/></label>
                    <div class="reference-guide-meta">无限直线 · 按 step 吸附</div>
                </div>
            `}
        </section>
    `;
}

function createLineObject(guide) {
    const material = new THREE.LineBasicMaterial({
        color: AXIS_COLORS[guide.axis] || AXIS_COLORS.X,
        transparent: true,
        opacity: 0.82,
        depthWrite: false,
        depthTest: false
    });
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3).setUsage(THREE.DynamicDrawUsage));
    const line = new THREE.Line(lineGeometry, material);
    line.renderOrder = 30;
    line.userData.referenceGuideId = guide.id;
    const pointMaterial = new THREE.PointsMaterial({
        color: AXIS_COLORS[guide.axis] || AXIS_COLORS.X,
        size: 0.12,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.94,
        depthWrite: false,
        depthTest: false
    });
    const pointGeometry = new THREE.BufferGeometry();
    pointGeometry.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(MAX_SEGMENT_SNAP_POINTS * 3), 3).setUsage(THREE.DynamicDrawUsage)
    );
    pointGeometry.setDrawRange(0, 0);
    const points = new THREE.Points(pointGeometry, pointMaterial);
    points.renderOrder = 31;
    points.userData.referenceGuideId = guide.id;
    const group = new THREE.Group();
    group.add(line, points);
    group.userData.referenceGuideId = guide.id;
    return { group, line, points, axis: guide.axis, mode: guide.mode };
}

function disposeGuideObject(entry, scene) {
    if (!entry) return;
    scene?.remove(entry.group);
    entry.line?.geometry?.dispose?.();
    entry.line?.material?.dispose?.();
    entry.points?.geometry?.dispose?.();
    entry.points?.material?.dispose?.();
}

function setLinePositions(entry, start, end) {
    const attribute = entry.line.geometry.getAttribute("position");
    const values = attribute.array;
    values[0] = start.x;
    values[1] = start.y;
    values[2] = start.z;
    values[3] = end.x;
    values[4] = end.y;
    values[5] = end.z;
    attribute.needsUpdate = true;
    entry.line.geometry.computeBoundingSphere();
}

function setPointPositions(entry, points) {
    const attribute = entry.points.geometry.getAttribute("position");
    const values = attribute.array;
    points.forEach((point, index) => {
        values[index * 3] = point.x;
        values[index * 3 + 1] = point.y;
        values[index * 3 + 2] = point.z;
    });
    attribute.needsUpdate = true;
    entry.points.geometry.setDrawRange(0, points.length);
    if (points.length) entry.points.geometry.computeBoundingSphere();
    entry.points.visible = points.length > 0;
}

export function createReferenceGuideController({
    scene,
    camera,
    controls,
    renderer,
    root,
    getGuides,
    createId,
    captureHistory,
    onChange,
    onSelect,
    isInteractionBlocked
} = {}) {
    const objects = new Map();
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let hoveredId = "";
    let selectedId = "";
    let offsetPreviewId = "";
    let offsetPreviewDelta = null;
    let lastCameraSyncKey = "";

    function guides() {
        const value = typeof getGuides === "function" ? getGuides() : [];
        return Array.isArray(value) ? value : [];
    }

    function findGuide(id) {
        return guides().find((guide) => guide?.id === id) || null;
    }

    function markChanged(options = {}) {
        sync();
        if (options.renderPanel !== false) renderPanel();
        if (typeof onChange === "function") onChange(options);
    }

    function selectGuide(id, options = {}) {
        const next = findGuide(String(id || ""))?.id || "";
        if (next === selectedId) return false;
        selectedId = next;
        sync();
        if (options.renderPanel !== false) renderPanel();
        if (typeof onSelect === "function") onSelect(selectedId, options);
        return true;
    }

    function insertGuide(rawGuide, options = {}) {
        const list = getGuides?.();
        if (!Array.isArray(list) || !rawGuide) return null;
        captureHistory?.(options.historyLabel || "add_reference_guide");
        const guide = createPointsBuilderReferenceGuide(rawGuide, { idFactory: createId });
        list.push(guide);
        selectedId = guide.id;
        markChanged({ guideId: guide.id });
        onSelect?.(selectedId, { source: options.source || "panel" });
        return guide;
    }

    function addGuide(axis) {
        return insertGuide({
            id: createId?.(),
            axis,
            name: `${axis} 轴参考线`
        });
    }

    function addGuideFromMeasurement(result) {
        const guide = createMeasuredReferenceGuide(result, { id: createId?.(), idFactory: createId });
        return insertGuide(guide, {
            historyLabel: "add_measured_reference_guide",
            source: "measurement"
        });
    }

    function copyGuide(id) {
        const source = findGuide(id);
        if (!source) return null;
        return insertGuide({
            ...source,
            id: createId?.(),
            name: `${source.name || `${source.axis} 轴参考线`} 副本`,
            origin: { ...source.origin }
        }, {
            historyLabel: "copy_reference_guide",
            source: "copy"
        });
    }

    function mirrorCopyGuide(id, options = {}) {
        const source = findGuide(id);
        if (!source) return null;
        const guide = createMirroredReferenceGuide(source, {
            ...options,
            id: createId?.(),
            idFactory: createId
        });
        return insertGuide(guide, {
            historyLabel: "mirror_copy_reference_guide",
            source: "mirror_copy"
        });
    }

    function deleteGuide(id, options = {}) {
        const guide = findGuide(String(id || ""));
        const list = getGuides?.();
        if (!guide || !Array.isArray(list)) return false;
        const index = list.indexOf(guide);
        if (index < 0) return false;
        captureHistory?.(options.historyLabel || "delete_reference_guide");
        const wasSelected = selectedId === guide.id;
        list.splice(index, 1);
        if (wasSelected) selectedId = "";
        markChanged({ guideId: guide.id, deleted: true });
        if (wasSelected) onSelect?.("", { source: options.source || "panel", deleted: true });
        return true;
    }

    function updateGuideField(guide, field, rawValue, source) {
        if (!guide || guide.locked === true) return;
        if (["visible", "locked"].includes(field)) return;
        if (field === "name") guide.name = String(rawValue || "");
        else if (field === "axis") guide.axis = ["X", "Y", "Z"].includes(String(rawValue)) ? String(rawValue) : "X";
        else if (field === "mode") guide.mode = rawValue === "line" ? "line" : "segment";
        else if (["snapEnabled", "snapEndpoints"].includes(field)) guide[field] = !!source?.checked;
        else if (field === "divisionCount") guide.divisionCount = Math.max(1, Math.min(64, Math.trunc(finiteNumber(rawValue, 1))));
        else if (field === "step") guide.step = Math.max(0.000001, finiteNumber(rawValue, 1));
        else if (["start", "end"].includes(field)) guide[field] = finiteNumber(rawValue, guide[field]);
        markChanged({
            guideId: guide.id,
            renderEditor: field === "mode" || field === "axis"
        });
    }

    function renderPanel() {
        if (!root) return;
        const list = guides();
        root.innerHTML = `
            <div class="reference-guides-toolbar">
                <span>添加轴向参考线</span>
                <div class="reference-guides-add" role="group" aria-label="添加参考线">
                    ${["X", "Y", "Z"].map((axis) => `<button class="btn reference-guide-add reference-guide-axis--${axis.toLowerCase()}" type="button" data-guide-add="${axis}" title="添加 ${axis} 轴参考线">+${axis}</button>`).join("")}
                </div>
            </div>
            <div class="reference-guides-list">
                ${list.length ? list.map((guide) => renderGuideItem(guide, selectedId)).join("") : '<div class="reference-guides-empty">暂无参考线。可添加多条 X、Y、Z 轴参考线。</div>'}
            </div>
        `;
    }

    function bindEditorHost(host) {
        if (!host || host.__referenceGuideEditorBound) return;
        host.__referenceGuideEditorBound = true;
        host.addEventListener("focusin", (event) => {
            const field = event.target?.closest?.("[data-guide-field], [data-guide-origin]");
            if (!field || field.__referenceGuideHistoryCaptured) return;
            captureHistory?.("edit_reference_guide");
            field.__referenceGuideHistoryCaptured = true;
        });
        host.addEventListener("focusout", (event) => {
            const field = event.target?.closest?.("[data-guide-field], [data-guide-origin]");
            if (field) field.__referenceGuideHistoryCaptured = false;
        });
        const onFieldChange = (event) => {
            const field = event.target?.closest?.("[data-guide-field], [data-guide-origin]");
            const editor = event.target?.closest?.("[data-guide-id]");
            if (!field || !editor) return;
            const guide = findGuide(editor.dataset.guideId);
            if (!guide || guide.locked) return;
            const originKey = field.dataset.guideOrigin;
            if (originKey) {
                guide.origin[originKey] = finiteNumber(field.value, guide.origin[originKey]);
                markChanged({ guideId: guide.id, renderEditor: false });
                return;
            }
            updateGuideField(guide, field.dataset.guideField, field.value, field);
        };
        host.addEventListener("input", onFieldChange);
        host.addEventListener("change", onFieldChange);
    }

    function renderSelectedEditor(host) {
        if (!host) return false;
        bindEditorHost(host);
        const guide = findGuide(selectedId);
        if (!guide) return false;
        host.innerHTML = renderGuideEditor(guide);
        return true;
    }

    function cameraSyncKey() {
        const target = controls?.target;
        const position = camera?.position;
        return [
            position?.x, position?.y, position?.z,
            target?.x, target?.y, target?.z
        ].map((value) => finiteNumber(value, 0).toFixed(5)).join("|");
    }

    function sync() {
        lastCameraSyncKey = cameraSyncKey();
        const liveIds = new Set();
        const extent = Math.max(24, camera?.position?.distanceTo?.(controls?.target || new THREE.Vector3()) * 6 || 24);
        for (const guide of guides()) {
            if (!guide?.id) continue;
            liveIds.add(guide.id);
            let entry = objects.get(guide.id);
            if (!entry) {
                entry = createLineObject(guide);
                objects.set(guide.id, entry);
                scene?.add(entry.group);
            }
            const axisChanged = entry.axis !== guide.axis;
            entry.axis = guide.axis;
            entry.mode = guide.mode;
            entry.group.visible = guide.visible !== false;
            entry.line.material.color.setHex(AXIS_COLORS[guide.axis] || AXIS_COLORS.X);
            entry.points.material.color.setHex(AXIS_COLORS[guide.axis] || AXIS_COLORS.X);
            const highlighted = hoveredId === guide.id || selectedId === guide.id;
            entry.line.material.opacity = highlighted ? 1 : 0.82;
            entry.line.material.color.setHex(highlighted ? 0xffd166 : (AXIS_COLORS[guide.axis] || AXIS_COLORS.X));
            entry.points.material.color.setHex(highlighted ? 0xffd166 : (AXIS_COLORS[guide.axis] || AXIS_COLORS.X));
            const axisKey = AXIS_KEYS[guide.axis] || "x";
            if (guide.locked && offsetPreviewId === guide.id) {
                offsetPreviewId = "";
                offsetPreviewDelta = null;
            }
            const previewDelta = offsetPreviewId === guide.id ? offsetPreviewDelta : null;
            const previewAxisDelta = guide.mode === "line" ? finiteNumber(previewDelta?.[axisKey], 0) : 0;
            const targetScalar = finiteNumber(controls?.target?.[axisKey], 0)
                - finiteNumber(guide.origin?.[axisKey], 0)
                - previewAxisDelta;
            const startScalar = guide.mode === "line" ? targetScalar - extent : finiteNumber(guide.start, -2);
            const endScalar = guide.mode === "line" ? targetScalar + extent : finiteNumber(guide.end, 2);
            const applyPreview = (point) => previewDelta
                ? {
                    x: point.x + previewDelta.x,
                    y: point.y + previewDelta.y,
                    z: point.z + previewDelta.z
                }
                : point;
            setLinePositions(entry, applyPreview(guidePoint(guide, startScalar)), applyPreview(guidePoint(guide, endScalar)));
            setPointPositions(entry, guide.mode === "segment"
                ? getReferenceGuideSnapPoints(guide).map(applyPreview)
                : []);
            if (axisChanged) {
                entry.line.material.needsUpdate = true;
                entry.points.material.needsUpdate = true;
            }
        }
        for (const [id, entry] of objects) {
            if (liveIds.has(id)) continue;
            disposeGuideObject(entry, scene);
            objects.delete(id);
        }
        if (selectedId && !liveIds.has(selectedId)) selectedId = "";
        if (offsetPreviewId && !liveIds.has(offsetPreviewId)) {
            offsetPreviewId = "";
            offsetPreviewDelta = null;
        }
    }

    function setPointer(event) {
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
        pointer.y = -(((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);
        raycaster.setFromCamera(pointer, camera);
    }

    function pickGuide(event) {
        if (!renderer || !camera) return null;
        setPointer(event);
        raycaster.params.Line = raycaster.params.Line || {};
        raycaster.params.Line.threshold = Math.max(0.05, camera.position.distanceTo(controls.target) * 0.008);
        const lines = Array.from(objects.values()).map((entry) => entry.line).filter((line) => line.visible !== false && line.parent?.visible !== false);
        const hit = raycaster.intersectObjects(lines, false)[0];
        if (!hit) return null;
        const id = String(hit.object?.userData?.referenceGuideId || "");
        return id ? { id, hit } : null;
    }

    function setHovered(id) {
        const next = String(id || "");
        if (next === hoveredId) return;
        hoveredId = next;
        sync();
    }

    function onPointerMove(event) {
        if (isInteractionBlocked?.()) {
            setHovered("");
            return;
        }
        const picked = pickGuide(event);
        setHovered(picked?.id || "");
        renderer.domElement.style.cursor = picked ? "pointer" : "";
    }

    function onPointerDown(event) {
        if (event.button !== 0 || isInteractionBlocked?.()) return;
        const picked = pickGuide(event);
        if (!picked) return;
        selectGuide(picked.id, { source: "canvas", event });
        event.preventDefault();
        event.stopImmediatePropagation();
    }

    function onPointerLeave() {
        setHovered("");
        if (renderer?.domElement) renderer.domElement.style.cursor = "";
    }

    function bindPanel() {
        if (!root || root.__referenceGuidesBound) return;
        root.__referenceGuidesBound = true;
        root.addEventListener("click", (event) => {
            const addButton = event.target?.closest?.("[data-guide-add]");
            if (addButton) {
                addGuide(addButton.dataset.guideAdd);
                return;
            }
            const item = event.target?.closest?.("[data-guide-id]");
            const action = event.target?.closest?.("[data-guide-action]")?.dataset?.guideAction;
            if (!item) return;
            const guide = findGuide(item.dataset.guideId);
            if (!guide) return;
            selectGuide(guide.id, { source: "panel", renderPanel: false });
            if (!action) {
                renderPanel();
                return;
            }
            if (action === "delete") {
                deleteGuide(guide.id, { source: "panel" });
                return;
            }
            if (action === "visible") {
                captureHistory?.("toggle_reference_guide_visibility");
                guide.visible = guide.visible === false;
                markChanged({ guideId: guide.id });
                return;
            }
            if (action === "locked") {
                captureHistory?.("toggle_reference_guide_lock");
                guide.locked = !guide.locked;
                markChanged({ guideId: guide.id });
            }
        });
    }

    renderer?.domElement?.addEventListener("pointermove", onPointerMove);
    renderer?.domElement?.addEventListener("pointerdown", onPointerDown);
    renderer?.domElement?.addEventListener("pointerleave", onPointerLeave);
    bindPanel();
    renderPanel();
    sync();

    return {
        renderPanel,
        renderSelectedEditor,
        sync,
        update() {
            if (cameraSyncKey() !== lastCameraSyncKey) sync();
        },
        getSelectedGuideId: () => selectedId,
        getSelectedGuide: () => findGuide(selectedId),
        selectGuide,
        addGuideFromMeasurement,
        copyGuide,
        mirrorCopyGuide,
        deleteGuide,
        deleteSelectedGuide: () => deleteGuide(selectedId, { source: "shortcut" }),
        getGuideOrigin(id) {
            const guide = findGuide(id);
            return guide ? {
                x: finiteNumber(guide.origin?.x, 0),
                y: finiteNumber(guide.origin?.y, 0),
                z: finiteNumber(guide.origin?.z, 0)
            } : null;
        },
        isGuideLocked: (id) => findGuide(id)?.locked === true,
        moveGuideBy(id, delta) {
            const guide = findGuide(id);
            if (!guide || guide.locked || !delta) return false;
            const next = {
                x: finiteNumber(delta.x, NaN),
                y: finiteNumber(delta.y, NaN),
                z: finiteNumber(delta.z, NaN)
            };
            if (![next.x, next.y, next.z].every(Number.isFinite)) return false;
            for (const key of ["x", "y", "z"]) {
                guide.origin[key] = finiteNumber(guide.origin?.[key], 0) + next[key];
            }
            offsetPreviewId = "";
            offsetPreviewDelta = null;
            markChanged({ guideId: guide.id });
            return true;
        },
        setOffsetPreview(id, delta) {
            const guide = findGuide(id);
            if (!guide || guide.locked || !delta) return false;
            const next = {
                x: finiteNumber(delta.x, NaN),
                y: finiteNumber(delta.y, NaN),
                z: finiteNumber(delta.z, NaN)
            };
            if (![next.x, next.y, next.z].every(Number.isFinite)) return false;
            offsetPreviewId = guide.id;
            offsetPreviewDelta = next;
            sync();
            return true;
        },
        clearOffsetPreview() {
            if (!offsetPreviewId && !offsetPreviewDelta) return;
            offsetPreviewId = "";
            offsetPreviewDelta = null;
            sync();
        },
        hasEnabledSnapGuides: () => guides().some((guide) => guide?.visible !== false && guide?.snapEnabled !== false),
        findSnapCandidate(raw, plane, maxDistance, options = {}) {
            const excludedIds = new Set(Array.isArray(options.excludeIds) ? options.excludeIds : []);
            const available = excludedIds.size
                ? guides().filter((guide) => !excludedIds.has(guide?.id))
                : guides();
            return findReferenceGuideSnapCandidate(available, raw, plane, maxDistance, options);
        },
        dispose() {
            renderer?.domElement?.removeEventListener("pointermove", onPointerMove);
            renderer?.domElement?.removeEventListener("pointerdown", onPointerDown);
            renderer?.domElement?.removeEventListener("pointerleave", onPointerLeave);
            for (const entry of objects.values()) disposeGuideObject(entry, scene);
            objects.clear();
        }
    };
}
