import * as THREE from "three";

const PLANE_KEYS = new Set(["XZ", "XY", "ZY"]);
const EPS = 1e-6;

function normalizePlane(raw) {
    const s = String(raw || "XZ").toUpperCase();
    return PLANE_KEYS.has(s) ? s : "XZ";
}

function clampNum(v, fallback = 0) {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
}

function getGridOffset(plane) {
    if (plane === "XY") return { x: 0, y: 0, z: -0.01 };
    if (plane === "ZY") return { x: -0.01, y: 0, z: 0 };
    return { x: 0, y: -0.01, z: 0 };
}

function applyPlaneToGrid(grid, plane) {
    if (!grid) return;
    grid.rotation.set(0, 0, 0);
    if (plane === "XY") {
        grid.rotation.x = Math.PI * 0.5;
    } else if (plane === "ZY") {
        grid.rotation.z = Math.PI * 0.5;
    }
    const off = getGridOffset(plane);
    grid.position.set(off.x, off.y, off.z);
}

function planeNormal(plane) {
    if (plane === "XY") return new THREE.Vector3(0, 0, 1);
    if (plane === "ZY") return new THREE.Vector3(1, 0, 0);
    return new THREE.Vector3(0, 1, 0);
}

function snapByStep(value, step, radius) {
    if (!(step > 0)) return value;
    const target = Math.round(value / step) * step;
    if (!(radius >= 0)) return target;
    return Math.abs(value - target) <= radius ? target : value;
}

function getPlaneAxes(plane) {
    if (plane === "XY") return ["x", "y"];
    if (plane === "ZY") return ["z", "y"];
    return ["x", "z"];
}

function setMeshColor(mesh, selected) {
    if (!mesh || !mesh.material || !mesh.material.color) return;
    if (selected) mesh.material.color.setHex(0xff9f1c);
    else mesh.material.color.setHex(0x2ec4b6);
}

function makeGhostGrid() {
    const g = new THREE.GridHelper(512, 512, 0x66a8ff, 0x66a8ff);
    const mats = Array.isArray(g.material) ? g.material : [g.material];
    for (const m of mats) {
        if (!m) continue;
        m.transparent = true;
        m.depthWrite = false;
        m.opacity = 0.0;
    }
    return g;
}

export function createMotionEditorRuntime(ctx = {}) {
    const {
        scene,
        camera,
        renderer,
        viewportEl,
        gridHelper,
        getMotionEditorState,
        onMotionEditorSelectionChange,
        onMotionEditorMoveCommit,
        onMotionEditorOffsetModeChange,
        onMotionEditorAddPoint,
        onMotionEditorContextMenu,
        onMotionEditorStatus,
    } = ctx;

    if (!scene || !camera || !renderer) {
        return {
            syncFromState() {},
            dispose() {},
        };
    }

    const group = new THREE.Group();
    group.name = "motion-editor-group";
    group.visible = false;
    scene.add(group);

    const ghostGrid = makeGhostGrid();
    ghostGrid.visible = false;
    scene.add(ghostGrid);

    const axisGeom = new THREE.BufferGeometry().setAttribute(
        "position",
        new THREE.Float32BufferAttribute([0, -1, 0, 0, 1, 0], 3)
    );
    const axisMat = new THREE.LineBasicMaterial({
        color: 0xffc857,
        transparent: true,
        opacity: 0.9,
        depthTest: false,
    });
    const axisLine = new THREE.Line(axisGeom, axisMat);
    axisLine.visible = false;
    group.add(axisLine);

    const chainGeom = new THREE.BufferGeometry();
    const chainMat = new THREE.LineBasicMaterial({
        color: 0x8ec5ff,
        transparent: true,
        opacity: 0.82,
        depthTest: true,
        depthWrite: false,
    });
    const chainLine = new THREE.Line(chainGeom, chainMat);
    chainLine.visible = false;
    chainLine.renderOrder = 10;
    group.add(chainLine);

    const pointGeo = new THREE.OctahedronGeometry(0.13, 0);

    const raycaster = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const tmpVec = new THREE.Vector3();

    const runtime = {
        active: false,
        editorId: "",
        plane: "XZ",
        snapGrid: false,
        snapStep: 0.5,
        snapRadius: 0.35,
        lockVertical: false,
        points: [],
        meshes: [],
        drag: null,
        box: null,
        boxEl: null,
        offsetMode: false,
        offsetIds: [],
        offsetRefPoint: null,
        offsetBasePositions: new Map(),
        offsetHoverPoint: null,
        offsetTargetPoint: null,
        ghostUntil: 0,
        lastPlane: "XZ",
        lastStatus: "",
    };

    function setStatus(text = "", show = false) {
        const key = `${show ? "1" : "0"}:${text}`;
        if (runtime.lastStatus === key) return;
        runtime.lastStatus = key;
        if (typeof onMotionEditorStatus === "function") {
            onMotionEditorStatus({ text, show: !!show });
        }
    }

    function ensureBoxEl() {
        if (runtime.boxEl) return runtime.boxEl;
        const wrap = viewportEl ? viewportEl.closest(".viewport-wrap") : null;
        if (!wrap) return null;
        const el = document.createElement("div");
        el.className = "motion-select-box hidden";
        wrap.appendChild(el);
        runtime.boxWrap = wrap;
        runtime.boxEl = el;
        return el;
    }

    function hideBox() {
        if (runtime.boxEl) runtime.boxEl.classList.add("hidden");
    }

    function updateBox() {
        const box = runtime.box;
        const el = ensureBoxEl();
        const wrap = runtime.boxWrap;
        if (!box || !el || !wrap) {
            hideBox();
            return;
        }
        const wrapRect = wrap.getBoundingClientRect();
        const minX = Math.min(box.startX, box.endX);
        const maxX = Math.max(box.startX, box.endX);
        const minY = Math.min(box.startY, box.endY);
        const maxY = Math.max(box.startY, box.endY);
        el.classList.remove("hidden");
        el.style.left = `${minX - wrapRect.left}px`;
        el.style.top = `${minY - wrapRect.top}px`;
        el.style.width = `${Math.max(0, maxX - minX)}px`;
        el.style.height = `${Math.max(0, maxY - minY)}px`;
    }

    function toNdc(ev) {
        const rect = renderer.domElement.getBoundingClientRect();
        const x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
        ndc.set(x, y);
        return rect;
    }

    function worldToClient(v3) {
        const rect = renderer.domElement.getBoundingClientRect();
        camera.updateMatrixWorld();
        tmpVec.copy(v3).project(camera);
        return {
            x: (tmpVec.x * 0.5 + 0.5) * rect.width + rect.left,
            y: (-tmpVec.y * 0.5 + 0.5) * rect.height + rect.top,
        };
    }

    function ensureMeshCount(n) {
        while (runtime.meshes.length < n) {
            const mat = new THREE.MeshBasicMaterial({
                color: 0x66b9ff,
                transparent: true,
                opacity: 0.95,
                depthTest: true,
                depthWrite: false,
            });
            const mesh = new THREE.Mesh(pointGeo, mat);
            mesh.renderOrder = 12;
            mesh.userData.__motionPoint = true;
            runtime.meshes.push(mesh);
            group.add(mesh);
        }
        while (runtime.meshes.length > n) {
            const mesh = runtime.meshes.pop();
            group.remove(mesh);
            if (mesh.material) mesh.material.dispose();
        }
    }

    function refreshMeshes() {
        ensureMeshCount(runtime.points.length);
        for (let i = 0; i < runtime.points.length; i++) {
            const p = runtime.points[i];
            const mesh = runtime.meshes[i];
            mesh.visible = true;
            mesh.position.set(clampNum(p.x), clampNum(p.y), clampNum(p.z));
            mesh.userData.pointId = p.id;
            mesh.userData.index = i;
            setMeshColor(mesh, !!p.selected);
        }
        for (let i = runtime.points.length; i < runtime.meshes.length; i++) {
            runtime.meshes[i].visible = false;
        }
        syncChainLine();
    }

    function syncChainLine() {
        if (!runtime.active || !Array.isArray(runtime.points) || runtime.points.length < 2) {
            chainLine.visible = false;
            return;
        }
        const sorted = runtime.points
            .map((it, idx) => ({ ...it, __idx: idx }))
            .sort((a, b) => {
                const dt = (Number(a.time) || 0) - (Number(b.time) || 0);
                if (Math.abs(dt) > 1e-9) return dt;
                return a.__idx - b.__idx;
            });
        const arr = new Float32Array(sorted.length * 3);
        for (let i = 0; i < sorted.length; i++) {
            const p = sorted[i];
            arr[i * 3 + 0] = clampNum(p.x, 0);
            arr[i * 3 + 1] = clampNum(p.y, 0);
            arr[i * 3 + 2] = clampNum(p.z, 0);
        }
        chainGeom.setAttribute("position", new THREE.BufferAttribute(arr, 3));
        chainGeom.computeBoundingSphere();
        chainLine.visible = true;
    }

    function pickPoint(ev) {
        if (!runtime.active || !runtime.meshes.length) return null;
        toNdc(ev);
        raycaster.setFromCamera(ndc, camera);
        const hits = raycaster.intersectObjects(runtime.meshes, false);
        if (!hits.length) return null;
        const hit = hits[0].object;
        const idx = Number(hit.userData.index);
        if (!Number.isFinite(idx) || idx < 0 || idx >= runtime.points.length) return null;
        return runtime.points[idx];
    }

    function buildPlane(anchor) {
        const plane = normalizePlane(runtime.plane);
        const n = planeNormal(plane);
        const base = anchor || new THREE.Vector3(0, 0, 0);
        const c = -n.dot(base);
        return new THREE.Plane(n, c);
    }

    function intersectPointerPlane(ev, anchor) {
        toNdc(ev);
        raycaster.setFromCamera(ndc, camera);
        const out = new THREE.Vector3();
        const plane = buildPlane(anchor);
        const ok = raycaster.ray.intersectPlane(plane, out);
        return ok ? out : null;
    }

    function applyGridSnap(pos, origin) {
        if (!runtime.snapGrid) return pos;
        const step = Math.max(EPS, clampNum(runtime.snapStep, 0.5));
        const radius = Math.max(0, clampNum(runtime.snapRadius, 0.35));
        const plane = normalizePlane(runtime.plane);
        const [a, b] = getPlaneAxes(plane);
        const next = pos.clone();
        next[a] = snapByStep(next[a], step, radius);
        next[b] = snapByStep(next[b], step, radius);
        const normal = planeNormal(plane);
        if (Math.abs(normal.x) > 0.5) next.x = origin.x;
        if (Math.abs(normal.y) > 0.5) next.y = origin.y;
        if (Math.abs(normal.z) > 0.5) next.z = origin.z;
        return next;
    }

    function emitSelection(ids, additive) {
        if (typeof onMotionEditorSelectionChange !== "function") return;
        onMotionEditorSelectionChange({
            editorId: runtime.editorId,
            ids: Array.isArray(ids) ? ids.slice() : [],
            additive: !!additive,
        });
    }

    function emitOffsetMode(active) {
        if (typeof onMotionEditorOffsetModeChange !== "function") return;
        onMotionEditorOffsetModeChange({
            editorId: runtime.editorId,
            active: !!active,
        });
    }

    function clearOffsetState() {
        runtime.offsetIds = [];
        runtime.offsetRefPoint = null;
        runtime.offsetBasePositions = new Map();
        runtime.offsetHoverPoint = null;
        runtime.offsetTargetPoint = null;
    }

    function syncOffsetBaseFromPoints() {
        if (!runtime.offsetMode) {
            clearOffsetState();
            return false;
        }
        const selected = runtime.points.filter((it) => !!it.selected);
        if (!selected.length) {
            clearOffsetState();
            runtime.offsetMode = false;
            emitOffsetMode(false);
            return false;
        }
        let sx = 0;
        let sy = 0;
        let sz = 0;
        const base = new Map();
        const ids = [];
        for (const p of selected) {
            const id = String(p.id || "");
            if (!id) continue;
            ids.push(id);
            sx += p.x;
            sy += p.y;
            sz += p.z;
            base.set(id, new THREE.Vector3(p.x, p.y, p.z));
        }
        if (!ids.length) {
            clearOffsetState();
            runtime.offsetMode = false;
            emitOffsetMode(false);
            return false;
        }
        runtime.offsetIds = ids;
        runtime.offsetBasePositions = base;
        runtime.offsetRefPoint = new THREE.Vector3(sx / ids.length, sy / ids.length, sz / ids.length);
        return true;
    }

    function getOffsetTargetFromEvent(ev) {
        if (!runtime.offsetMode || !runtime.offsetRefPoint) return null;
        if (runtime.lockVertical) {
            const screenRef = worldToClient(runtime.offsetRefPoint);
            const dist = Math.max(0.001, camera.position.distanceTo(runtime.offsetRefPoint));
            const scale = dist * 0.0036;
            let nextY = runtime.offsetRefPoint.y - (ev.clientY - screenRef.y) * scale;
            if (runtime.snapGrid) {
                const step = Math.max(EPS, clampNum(runtime.snapStep, 0.5));
                const radius = Math.max(0, clampNum(runtime.snapRadius, 0.35));
                nextY = snapByStep(nextY, step, radius);
            }
            return new THREE.Vector3(runtime.offsetRefPoint.x, nextY, runtime.offsetRefPoint.z);
        }
        const hit = intersectPointerPlane(ev, runtime.offsetRefPoint);
        if (!hit) return null;
        return applyGridSnap(hit, runtime.offsetRefPoint);
    }

    function applyOffsetPreviewTarget(target) {
        if (!runtime.offsetMode || !runtime.offsetRefPoint || !target) return false;
        const delta = target.clone().sub(runtime.offsetRefPoint);
        runtime.offsetTargetPoint = target.clone();
        runtime.offsetHoverPoint = target.clone();
        for (const id of runtime.offsetIds) {
            const p = runtime.points.find((it) => it.id === id);
            const start = runtime.offsetBasePositions.get(id);
            if (!p || !start) continue;
            p.x = start.x + delta.x;
            p.y = start.y + delta.y;
            p.z = start.z + delta.z;
        }
        refreshMeshes();
        syncAxisLine();
        return true;
    }

    function commitOffsetPreviewAndExit(ev) {
        if (!runtime.offsetMode) return false;
        if (!runtime.offsetRefPoint || !runtime.offsetIds.length || !runtime.offsetBasePositions.size) {
            if (!syncOffsetBaseFromPoints()) {
                runtime.offsetMode = false;
                clearOffsetState();
                emitOffsetMode(false);
                syncAxisLine();
                return true;
            }
        }
        const target = getOffsetTargetFromEvent(ev) || runtime.offsetHoverPoint || runtime.offsetRefPoint;
        if (!target || !applyOffsetPreviewTarget(target)) {
            runtime.offsetMode = false;
            clearOffsetState();
            emitOffsetMode(false);
            syncAxisLine();
            return true;
        }
        const payload = [];
        let changed = false;
        for (const id of runtime.offsetIds) {
            const p = runtime.points.find((it) => it.id === id);
            const start = runtime.offsetBasePositions.get(id);
            if (!p || !start) continue;
            if (Math.abs(p.x - start.x) + Math.abs(p.y - start.y) + Math.abs(p.z - start.z) > 1e-8) changed = true;
            payload.push({ id: p.id, x: p.x, y: p.y, z: p.z });
        }
        if (changed && typeof onMotionEditorMoveCommit === "function") {
            onMotionEditorMoveCommit({
                editorId: runtime.editorId,
                points: payload,
            });
        }
        runtime.offsetMode = false;
        clearOffsetState();
        emitOffsetMode(false);
        syncAxisLine();
        return true;
    }

    function startDrag(ev, point, hadSingleSelection) {
        const selected = runtime.points.filter((it) => !!it.selected);
        const selectedIds = selected.map((it) => it.id);
        const dragIds = selectedIds.includes(point.id) ? selectedIds : [point.id];

        const anchor = new THREE.Vector3(point.x, point.y, point.z);
        const hit = intersectPointerPlane(ev, anchor) || anchor.clone();
        const startPositions = new Map();
        for (const id of dragIds) {
            const src = runtime.points.find((it) => it.id === id);
            if (!src) continue;
            startPositions.set(id, new THREE.Vector3(src.x, src.y, src.z));
        }
        runtime.drag = {
            pointerId: ev.pointerId,
            ids: dragIds,
            anchor,
            startHit: hit,
            startPositions,
            clientX0: ev.clientX,
            clientY0: ev.clientY,
            startClientY: ev.clientY,
            moved: false,
            hadSingleSelection: !!hadSingleSelection,
        };
    }

    function startBox(ev, fromAlt = false, hadHit = false) {
        runtime.box = {
            pointerId: ev.pointerId,
            startX: ev.clientX,
            startY: ev.clientY,
            endX: ev.clientX,
            endY: ev.clientY,
            fromAlt: !!fromAlt,
            hadHit: !!hadHit,
            moved: false,
        };
        updateBox();
    }

    function applyDragMove(ev) {
        const drag = runtime.drag;
        if (!drag) return;
        const moved = Math.abs(ev.clientX - (drag.clientX0 || ev.clientX)) > 2
            || Math.abs(ev.clientY - (drag.clientY0 || ev.clientY)) > 2;
        if (moved) drag.moved = true;

        const lockVertical = !!runtime.lockVertical;

        if (lockVertical) {
            const dist = Math.max(0.001, camera.position.distanceTo(new THREE.Vector3(0, 0, 0)));
            const scale = dist * 0.0036;
            const dy = -(ev.clientY - drag.startClientY) * scale;
            for (const id of drag.ids) {
                const p = runtime.points.find((it) => it.id === id);
                const start = drag.startPositions.get(id);
                if (!p || !start) continue;
                p.x = start.x;
                p.z = start.z;
                let nextY = start.y + dy;
                if (runtime.snapGrid) {
                    const step = Math.max(EPS, clampNum(runtime.snapStep, 0.5));
                    const radius = Math.max(0, clampNum(runtime.snapRadius, 0.35));
                    nextY = snapByStep(nextY, step, radius);
                }
                p.y = nextY;
            }
        } else {
            const nowHit = intersectPointerPlane(ev, drag.anchor);
            if (!nowHit) return;
            const delta = nowHit.clone().sub(drag.startHit);
            for (const id of drag.ids) {
                const p = runtime.points.find((it) => it.id === id);
                const start = drag.startPositions.get(id);
                if (!p || !start) continue;
                const next = start.clone().add(delta);
                const snapped = applyGridSnap(next, drag.anchor);
                p.x = snapped.x;
                p.y = snapped.y;
                p.z = snapped.z;
            }
        }
        refreshMeshes();
    }

    function finalizeDrag() {
        const drag = runtime.drag;
        if (!drag) return;
        runtime.drag = null;
        if (!drag.moved) return;
        if (typeof onMotionEditorMoveCommit !== "function") return;
        const points = drag.ids.map((id) => {
            const p = runtime.points.find((it) => it.id === id);
            return p ? { id: p.id, x: p.x, y: p.y, z: p.z } : null;
        }).filter(Boolean);
        onMotionEditorMoveCommit({
            editorId: runtime.editorId,
            points,
        });
    }

    function applyBoxSelection(box = runtime.box) {
        if (!box) return;
        const minX = Math.min(box.startX, box.endX);
        const maxX = Math.max(box.startX, box.endX);
        const minY = Math.min(box.startY, box.endY);
        const maxY = Math.max(box.startY, box.endY);
        const ids = [];
        camera.updateMatrixWorld();
        const rect = renderer.domElement.getBoundingClientRect();
        for (const p of runtime.points) {
            tmpVec.set(p.x, p.y, p.z).project(camera);
            if (tmpVec.z > 1) continue;
            const sx = (tmpVec.x * 0.5 + 0.5) * rect.width + rect.left;
            const sy = (-tmpVec.y * 0.5 + 0.5) * rect.height + rect.top;
            if (sx >= minX && sx <= maxX && sy >= minY && sy <= maxY) {
                ids.push(p.id);
            }
        }
        emitSelection(ids, !!box.fromAlt);
    }

    function maybeAddPointFromAltClick(ev, box = runtime.box) {
        if (!box || !box.fromAlt || box.hadHit || box.moved) return;
        if (typeof onMotionEditorAddPoint !== "function") return;
        const anchor = new THREE.Vector3(0, 0, 0);
        const hit = intersectPointerPlane(ev, anchor);
        if (!hit) return;
        const snapped = applyGridSnap(hit, anchor);
        onMotionEditorAddPoint({
            editorId: runtime.editorId,
            x: snapped.x,
            y: snapped.y,
            z: snapped.z,
        });
    }

    function finalizeBox(ev) {
        const box = runtime.box;
        runtime.box = null;
        hideBox();
        if (!box) return;
        const dx = Math.abs(box.endX - box.startX);
        const dy = Math.abs(box.endY - box.startY);
        if (dx > 3 || dy > 3) {
            applyBoxSelection(box);
            return;
        }
        maybeAddPointFromAltClick(ev, box);
    }

    function syncAxisLine() {
        const drag = runtime.drag;
        if (!runtime.active || !runtime.lockVertical) {
            axisLine.visible = false;
            return;
        }
        let x = 0;
        let z = 0;
        let found = false;
        if (drag && drag.ids.length) {
            const p = runtime.points.find((it) => it.id === drag.ids[0]);
            if (p) {
                x = p.x;
                z = p.z;
                found = true;
            }
        } else if (runtime.offsetMode) {
            const ref = runtime.offsetTargetPoint || runtime.offsetRefPoint;
            if (ref) {
                x = ref.x;
                z = ref.z;
                found = true;
            }
        }
        if (!found) {
            axisLine.visible = false;
            return;
        }
        const arr = axisLine.geometry.getAttribute("position").array;
        arr[0] = x; arr[1] = -1024; arr[2] = z;
        arr[3] = x; arr[4] = 1024; arr[5] = z;
        axisLine.geometry.getAttribute("position").needsUpdate = true;
        axisLine.visible = true;
    }

    function updateGhost() {
        if (!ghostGrid.visible) return;
        const now = performance.now();
        const remain = runtime.ghostUntil - now;
        const mats = Array.isArray(ghostGrid.material) ? ghostGrid.material : [ghostGrid.material];
        if (remain <= 0) {
            ghostGrid.visible = false;
            for (const m of mats) {
                if (!m) continue;
                m.opacity = 0.0;
            }
            return;
        }
        const alpha = Math.max(0, Math.min(1, remain / 420));
        for (const m of mats) {
            if (!m) continue;
            m.opacity = 0.35 * alpha;
        }
    }

    function applyPlane(plane, withGhost = false) {
        const finalPlane = normalizePlane(plane);
        runtime.plane = finalPlane;
        applyPlaneToGrid(gridHelper, finalPlane);
        if (withGhost) {
            applyPlaneToGrid(ghostGrid, finalPlane);
            ghostGrid.visible = true;
            runtime.ghostUntil = performance.now() + 420;
        }
    }

    function onPointerDown(ev) {
        if (!runtime.active || ev.button !== 0) return;
        if (runtime.offsetMode) {
            commitOffsetPreviewAndExit(ev);
            ev.preventDefault();
            return;
        }
        const hit = pickPoint(ev);
        const fromAlt = !!ev.altKey;
        if (fromAlt) {
            startBox(ev, true, !!hit);
            renderer.domElement.setPointerCapture(ev.pointerId);
            ev.preventDefault();
            return;
        }

        if (hit) {
            const alreadySelected = runtime.points.some((it) => it.id === hit.id && it.selected);
            if (!alreadySelected) {
                emitSelection([hit.id], false);
            }
            startDrag(ev, hit, !alreadySelected);
            renderer.domElement.setPointerCapture(ev.pointerId);
            ev.preventDefault();
            return;
        }
        startBox(ev, false, false);
        renderer.domElement.setPointerCapture(ev.pointerId);
        ev.preventDefault();
    }

    function onPointerMove(ev) {
        if (!runtime.active) return;
        if (runtime.drag) {
            applyDragMove(ev);
            ev.preventDefault();
            return;
        }
        if (runtime.box) {
            runtime.box.endX = ev.clientX;
            runtime.box.endY = ev.clientY;
            runtime.box.moved = runtime.box.moved
                || Math.abs(runtime.box.endX - runtime.box.startX) > 2
                || Math.abs(runtime.box.endY - runtime.box.startY) > 2;
            updateBox();
            ev.preventDefault();
            return;
        }
        if (runtime.offsetMode) {
            if (!runtime.offsetRefPoint || !runtime.offsetIds.length) syncOffsetBaseFromPoints();
            const target = getOffsetTargetFromEvent(ev);
            if (target) applyOffsetPreviewTarget(target);
            ev.preventDefault();
        }
    }

    function onPointerUp(ev) {
        if (!runtime.active) return;
        if (runtime.drag) {
            finalizeDrag();
            ev.preventDefault();
        } else if (runtime.box) {
            finalizeBox(ev);
            ev.preventDefault();
        }
        try {
            renderer.domElement.releasePointerCapture(ev.pointerId);
        } catch {}
    }

    function onContextMenu(ev) {
        if (!runtime.active) return;
        const hit = pickPoint(ev);
        if (!hit) return;
        ev.preventDefault();
        if (typeof onMotionEditorContextMenu === "function") {
            onMotionEditorContextMenu({
                editorId: runtime.editorId,
                id: hit.id,
                clientX: ev.clientX,
                clientY: ev.clientY,
            });
        }
    }

    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointercancel", onPointerUp);
    renderer.domElement.addEventListener("contextmenu", onContextMenu);

    function syncExternalPoints(external) {
        if (!external || !Array.isArray(external.points)) {
            runtime.points = [];
            refreshMeshes();
            return;
        }
        const points = external.points.map((it, idx) => ({
            id: String(it?.id ?? idx),
            x: clampNum(it?.x, 0),
            y: clampNum(it?.y, 0),
            z: clampNum(it?.z, 0),
            selected: !!it?.selected,
            time: clampNum(it?.time, 0),
        }));
        runtime.points = points;
        refreshMeshes();
    }

    function syncFromState() {
        const external = (typeof getMotionEditorState === "function")
            ? getMotionEditorState()
            : null;
        const active = !!external?.active;
        runtime.active = active;
        group.visible = active;
        if (!active) {
            runtime.editorId = "";
            runtime.drag = null;
            runtime.box = null;
            runtime.offsetMode = false;
            clearOffsetState();
            hideBox();
            axisLine.visible = false;
            chainLine.visible = false;
            setStatus("", false);
            updateGhost();
            return;
        }

        runtime.editorId = String(external.editorId || "");
        runtime.snapGrid = !!external.snapGrid;
        runtime.snapStep = Math.max(EPS, clampNum(external.snapStep, 0.5));
        runtime.snapRadius = Math.max(0, clampNum(external.snapRadius, 0.35));
        runtime.lockVertical = !!external.lockVertical;
        runtime.offsetMode = !!external.offsetMode;
        if (runtime.offsetMode) {
            runtime.drag = null;
            runtime.box = null;
            hideBox();
        }

        const plane = normalizePlane(external.plane);
        if (runtime.lastPlane !== plane) {
            runtime.lastPlane = plane;
            applyPlane(plane, true);
        } else {
            applyPlane(plane, false);
        }

        if (!runtime.drag && !runtime.box) {
            syncExternalPoints(external);
        } else {
            refreshMeshes();
        }

        if (runtime.offsetMode) {
            if (!syncOffsetBaseFromPoints()) {
                runtime.offsetMode = false;
                clearOffsetState();
            } else if (runtime.offsetHoverPoint) {
                applyOffsetPreviewTarget(runtime.offsetHoverPoint);
            }
        } else if (runtime.offsetHoverPoint || runtime.offsetRefPoint || runtime.offsetIds.length) {
            clearOffsetState();
        }

        syncAxisLine();
        updateBox();
        updateGhost();

        const status = `关键帧编辑 ${plane}${runtime.snapGrid ? ` | Grid ${runtime.snapStep}` : " | Grid Off"}${runtime.lockVertical ? " | X:竖直" : ""}${runtime.offsetMode ? " | V:中心跟随" : ""}`;
        setStatus(status, true);
    }

    function dispose() {
        renderer.domElement.removeEventListener("pointerdown", onPointerDown);
        renderer.domElement.removeEventListener("pointermove", onPointerMove);
        renderer.domElement.removeEventListener("pointerup", onPointerUp);
        renderer.domElement.removeEventListener("pointercancel", onPointerUp);
        renderer.domElement.removeEventListener("contextmenu", onContextMenu);
        hideBox();
        if (runtime.boxEl && runtime.boxEl.parentElement) runtime.boxEl.parentElement.removeChild(runtime.boxEl);
        runtime.boxEl = null;

        for (const mesh of runtime.meshes) {
            group.remove(mesh);
            if (mesh.material) mesh.material.dispose();
        }
        runtime.meshes = [];
        pointGeo.dispose();
        axisGeom.dispose();
        axisMat.dispose();
        chainGeom.dispose();
        chainMat.dispose();

        if (ghostGrid && ghostGrid.parent) ghostGrid.parent.remove(ghostGrid);
        const gm = Array.isArray(ghostGrid.material) ? ghostGrid.material : [ghostGrid.material];
        for (const m of gm) {
            if (m && typeof m.dispose === "function") m.dispose();
        }
        if (ghostGrid.geometry && typeof ghostGrid.geometry.dispose === "function") ghostGrid.geometry.dispose();

        if (group && group.parent) group.parent.remove(group);
    }

    return {
        syncFromState,
        dispose,
        isActive() {
            return !!runtime.active;
        },
        pickPointFromEvent(ev) {
            return pickPoint(ev);
        },
    };
}
