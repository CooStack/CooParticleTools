import {
    GRAPH_INPUT_ID,
    GRAPH_OUTPUT_ID,
    countTextureParams,
    createParamTemplate,
    getPostInputTextureMinCount,
    isTextureParam,
    resolveNodeFragmentPath
} from "./store.js";

const NODE_WIDTH = 286;
const LINK_HOLD_REWIRE_MS = 260;
const SNAP_RADIUS_PX = 26;
const MIN_GRAPH_SCALE = 0.35;
const MAX_GRAPH_SCALE = 2.6;
const NODE_TYPE_TEXTURE = "texture";
const NODE_TYPE_OPTIONS = [
    { value: "simple", label: "simple" },
    { value: "pingpong", label: "pingpong" },
    { value: "texture", label: "texture" }
];
const NODE_FILTER_OPTIONS = [
    "GL33.GL_LINEAR",
    "GL33.GL_NEAREST_MIPMAP_LINEAR",
    "GL33.GL_NEAREST"
];
const PARAM_TYPE_OPTIONS = ["float", "int", "bool", "vec2", "vec3", "texture"];

function cubicPath(a, b) {
    const dx = Math.max(48, Math.abs(b.x - a.x) * 0.45);
    return `M ${a.x} ${a.y} C ${a.x + dx} ${a.y}, ${b.x - dx} ${b.y}, ${b.x} ${b.y}`;
}

function clampNodePosInView(x, y, wrapRect, view, width = NODE_WIDTH, height = 86) {
    const scale = Math.max(0.0001, Number(view?.scale || 1));
    const ox = Number(view?.offsetX || 0);
    const oy = Number(view?.offsetY || 0);

    const minX = (8 - ox) / scale;
    const minY = (8 - oy) / scale;
    const maxX = (Math.max(8, wrapRect.width - 8) - ox) / scale - width;
    const maxY = (Math.max(8, wrapRect.height - 8) - oy) / scale - height;

    const nx = Math.max(minX, Math.min(x, Math.max(minX, maxX)));
    const ny = Math.max(minY, Math.min(y, Math.max(minY, maxY)));
    return { x: nx, y: ny };
}

function clampNodePosLocal(x, y, wrapRect, width = NODE_WIDTH, height = 86) {
    const nx = Math.max(8, Math.min(x, Math.max(8, wrapRect.width - width - 8)));
    const ny = Math.max(8, Math.min(y, Math.max(8, wrapRect.height - height - 8)));
    return { x: nx, y: ny };
}

function asCount(value, fallback = 1, max = 8) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(0, Math.min(max, Math.round(n)));
}

function normalizeInt(value, fallback = 1, min = 1, max = 8) {
    const n = Number(value);
    if (!Number.isFinite(n)) return fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
}

function normalizeNodeType(type) {
    const t = String(type || "simple").trim().toLowerCase();
    if (t === "pingpong") return "pingpong";
    if (t === NODE_TYPE_TEXTURE) return NODE_TYPE_TEXTURE;
    return "simple";
}

function minInputCountByNodeType(type) {
    return normalizeNodeType(type) === NODE_TYPE_TEXTURE ? 0 : 1;
}

function formatFragmentOutputHint(node, outputCount = 1) {
    if (normalizeNodeType(node?.type) === NODE_TYPE_TEXTURE) {
        return "output: location 0 -> TextureOut";
    }

    const decls = Array.isArray(node?.__fragmentOutputs) ? node.__fragmentOutputs : [];
    if (!decls.length) return "output: fallback slot0";
    return decls.map((item, idx) => {
        const slot = Number.isFinite(Number(item?.location)) ? Math.round(Number(item.location)) : idx;
        const name = String(item?.name || `FragColor${idx}`);
        return `${slot}:${name}`;
    }).join(" | ");
}

function stopEditorEvent(ev) {
    ev.stopPropagation();
}

function bindEditorEvents(el) {
    if (!(el instanceof HTMLElement)) return;
    ["pointerdown", "click", "dblclick", "contextmenu"].forEach((evt) => {
        el.addEventListener(evt, stopEditorEvent);
    });
}

function placeholderByType(type) {
    const t = String(type || "float").toLowerCase();
    if (t === "vec3") return "x,y,z";
    if (t === "vec2") return "x,y";
    if (t === "bool") return "true/false";
    if (t === "texture") return "采样槽位";
    return "常量";
}

const UNIFORM_EXPR_OPTIONS_BY_TYPE = Object.freeze({
    float: ["uTime", "tickDelta", "partialTicks"],
    int: ["Math.round(tickDelta)", "Math.round(partialTicks)", "0"],
    bool: ["true", "false"],
    vec2: ["uResolution", "uMouse", "org.joml.Vector2f(uTime, uTime)"],
    vec3: ["CameraPos", "org.joml.Vector3f(1f, 1f, 1f)"]
});

function uniformExprOptionsByType(type) {
    const t = String(type || "float").toLowerCase();
    const base = UNIFORM_EXPR_OPTIONS_BY_TYPE[t] || UNIFORM_EXPR_OPTIONS_BY_TYPE.float;
    return Array.from(new Set(base.map((it) => String(it || "").trim()).filter(Boolean)));
}

function defaultUniformExprByType(type) {
    const list = uniformExprOptionsByType(type);
    return list[0] || "uTime";
}

function populateUniformExprSelect(selectEl, type, currentValue = "") {
    if (!(selectEl instanceof HTMLSelectElement)) return;
    const current = String(currentValue || "").trim();
    const options = uniformExprOptionsByType(type);
    if (current && !options.includes(current)) options.unshift(current);
    selectEl.innerHTML = "";
    for (const expr of options) {
        const opt = document.createElement("option");
        opt.value = expr;
        opt.textContent = expr;
        if (expr === current) opt.selected = true;
        selectEl.appendChild(opt);
    }
    if (!selectEl.value && options.length) selectEl.value = options[0];
}

export class GraphEditor {
    constructor({ wrapEl, canvasEl, linesEl, store, callbacks = {} }) {
        this.wrapEl = wrapEl;
        this.canvasEl = canvasEl;
        this.linesEl = linesEl;
        this.store = store;
        this.callbacks = Object.assign({
            onSelectNode: () => {},
            onDeleteNode: () => {},
            onDeleteNodes: () => {},
            onMoveNode: () => {},
            onMoveNodes: () => {},
            onMoveSystemNodes: () => {},
            onCreateLink: () => {},
            onDeleteLink: () => {},
            onDeleteLinks: () => {},
            onDuplicateNode: () => {},
            onOpenNodeEditor: () => {},
            onPatchNode: () => {},
            onAddNode: () => {}
        }, callbacks);

        this.nodeElements = new Map();
        this.dragState = null;
        this.panState = null;
        this.connectState = null;
        this.boxSelectState = null;
        this.selectedNodeIds = new Set();
        this.selectedLinkIds = new Set();
        this.initialSelectionSynced = false;
        this.inputHoldState = null;
        this.linkMetaById = new Map();
        this.systemNodePositions = {
            [GRAPH_INPUT_ID]: null,
            [GRAPH_OUTPUT_ID]: null
        };
        this.systemNodeUserMoved = {
            [GRAPH_INPUT_ID]: false,
            [GRAPH_OUTPUT_ID]: false
        };
        this.view = {
            scale: 1,
            offsetX: 0,
            offsetY: 0
        };

        this.contextMenuPayload = null;
        this.contextMenuEl = this.createContextMenu();
        document.body.appendChild(this.contextMenuEl);
        this.selectionRectEl = document.createElement("div");
        this.selectionRectEl.className = "graph-selection-box hidden";
        this.wrapEl.appendChild(this.selectionRectEl);

        this.pointerMoveHandler = this.onPointerMove.bind(this);
        this.pointerUpHandler = this.onPointerUp.bind(this);
        this.wrapPointerDownHandler = this.onWrapPointerDown.bind(this);
        this.wrapWheelHandler = this.onWrapWheel.bind(this);
        this.wrapContextMenuHandler = this.onWrapContextMenu.bind(this);
        this.globalPointerDownHandler = this.onGlobalPointerDown.bind(this);
        this.globalKeydownHandler = this.onGlobalKeydown.bind(this);
        this.globalContextMenuHandler = this.onGlobalContextMenu.bind(this);
        this.globalResizeHandler = this.closeContextMenu.bind(this);

        window.addEventListener("pointermove", this.pointerMoveHandler);
        window.addEventListener("pointerup", this.pointerUpHandler);
        this.wrapEl.addEventListener("pointerdown", this.wrapPointerDownHandler);
        this.wrapEl.addEventListener("wheel", this.wrapWheelHandler, { passive: false });
        this.wrapEl.addEventListener("contextmenu", this.wrapContextMenuHandler);
        window.addEventListener("pointerdown", this.globalPointerDownHandler, true);
        window.addEventListener("keydown", this.globalKeydownHandler);
        window.addEventListener("contextmenu", this.globalContextMenuHandler, true);
        window.addEventListener("resize", this.globalResizeHandler);

        this.resizeObserver = new ResizeObserver(() => this.render());
        this.resizeObserver.observe(this.wrapEl);
        this.applyViewTransform();
    }

    dispose() {
        window.removeEventListener("pointermove", this.pointerMoveHandler);
        window.removeEventListener("pointerup", this.pointerUpHandler);
        this.wrapEl.removeEventListener("pointerdown", this.wrapPointerDownHandler);
        this.wrapEl.removeEventListener("wheel", this.wrapWheelHandler);
        this.wrapEl.removeEventListener("contextmenu", this.wrapContextMenuHandler);
        window.removeEventListener("pointerdown", this.globalPointerDownHandler, true);
        window.removeEventListener("keydown", this.globalKeydownHandler);
        window.removeEventListener("contextmenu", this.globalContextMenuHandler, true);
        window.removeEventListener("resize", this.globalResizeHandler);
        this.resizeObserver.disconnect();
        this.clearInputHandleHold();
        this.closeContextMenu();
        if (this.contextMenuEl?.parentNode) {
            this.contextMenuEl.parentNode.removeChild(this.contextMenuEl);
        }
        if (this.selectionRectEl?.parentNode) {
            this.selectionRectEl.parentNode.removeChild(this.selectionRectEl);
        }
    }

    createContextMenu() {
        const menu = document.createElement("div");
        menu.className = "graph-node-menu hidden";

        menu.addEventListener("pointerdown", (ev) => ev.stopPropagation());
        menu.addEventListener("contextmenu", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
        });
        menu.addEventListener("click", (ev) => {
            const target = ev.target instanceof HTMLElement ? ev.target.closest(".graph-node-menu-item") : null;
            if (!(target instanceof HTMLButtonElement)) return;
            const payload = this.contextMenuPayload;
            const action = String(target.dataset.action || "");
            if (action === "add-node") {
                this.callbacks.onAddNode();
                this.closeContextMenu();
                return;
            }

            const nodeId = String(payload?.nodeId || "");
            if (!nodeId) {
                this.closeContextMenu();
                return;
            }

            if (action === "open-editor") {
                this.selectSingleNode(nodeId, { primary: true });
                this.callbacks.onOpenNodeEditor(nodeId);
            } else if (action === "duplicate-node") {
                this.selectSingleNode(nodeId, { primary: true });
                this.callbacks.onDuplicateNode(nodeId);
            } else if (action === "delete-node") {
                if (this.selectedNodeIds.has(nodeId) && this.selectedNodeIds.size > 1) {
                    this.deleteSelectedNodes();
                } else {
                    this.clearSelection({ nodes: true, links: true, primary: false });
                    this.selectedNodeIds.add(nodeId);
                    this.deleteSelectedNodes();
                }
            }
            this.closeContextMenu();
        });

        return menu;
    }

    openContextMenu(payload, clientX, clientY) {
        if (!(this.contextMenuEl instanceof HTMLElement)) return;
        const mode = String(payload?.mode || "");
        const nodeId = String(payload?.nodeId || "");
        this.contextMenuPayload = mode === "node"
            ? { mode: "node", nodeId }
            : { mode: "canvas" };

        this.contextMenuEl.innerHTML = "";
        const items = [];
        if (mode === "node" && nodeId) {
            items.push({ action: "open-editor", text: "Open Editor", danger: false });
            items.push({ action: "duplicate-node", text: "Duplicate Node", danger: false });
            items.push({ action: "delete-node", text: "Delete Node", danger: true });
        } else {
            items.push({ action: "add-node", text: "Add Node", danger: false });
        }
        for (const item of items) {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = `graph-node-menu-item${item.danger ? " danger" : ""}`;
            btn.dataset.action = item.action;
            btn.textContent = item.text;
            this.contextMenuEl.appendChild(btn);
        }

        this.contextMenuEl.classList.remove("hidden");
        this.contextMenuEl.style.left = "0px";
        this.contextMenuEl.style.top = "0px";

        const pad = 8;
        const w = Math.max(140, this.contextMenuEl.offsetWidth || 180);
        const h = Math.max(72, this.contextMenuEl.offsetHeight || 88);
        const maxX = Math.max(pad, window.innerWidth - w - pad);
        const maxY = Math.max(pad, window.innerHeight - h - pad);
        const x = Math.max(pad, Math.min(Math.round(clientX), maxX));
        const y = Math.max(pad, Math.min(Math.round(clientY), maxY));

        this.contextMenuEl.style.left = `${x}px`;
        this.contextMenuEl.style.top = `${y}px`;
    }

    closeContextMenu() {
        if (!(this.contextMenuEl instanceof HTMLElement)) return;
        this.contextMenuEl.classList.add("hidden");
        this.contextMenuPayload = null;
    }

    onGlobalPointerDown(ev) {
        if (!(this.contextMenuEl instanceof HTMLElement)) return;
        if (this.contextMenuEl.classList.contains("hidden")) return;
        const target = ev.target;
        if (target instanceof Node && this.contextMenuEl.contains(target)) return;
        this.closeContextMenu();
    }

    onGlobalContextMenu(ev) {
        if (!(this.contextMenuEl instanceof HTMLElement)) return;
        if (this.contextMenuEl.classList.contains("hidden")) return;
        const target = ev.target;
        if (target instanceof Node && this.contextMenuEl.contains(target)) return;
        this.closeContextMenu();
    }

    onGlobalKeydown(ev) {
        if (ev.code !== "Escape") return;
        this.closeContextMenu();
        if (this.boxSelectState) this.endBoxSelection({ cancelled: true });
    }

    isSystemNodeId(nodeId) {
        return nodeId === GRAPH_INPUT_ID || nodeId === GRAPH_OUTPUT_ID;
    }

    clearSelection({ nodes = true, links = true, primary = false } = {}) {
        let changed = false;
        if (nodes && this.selectedNodeIds.size) {
            this.selectedNodeIds.clear();
            changed = true;
        }
        if (links && this.selectedLinkIds.size) {
            this.selectedLinkIds.clear();
            changed = true;
        }
        if (!changed) return false;
        this.updateSelectionClasses();
        this.drawLinks(this.store.getState());
        if (primary) this.callbacks.onSelectNode("");
        return true;
    }

    updateSelectionClasses() {
        for (const [id, el] of this.nodeElements.entries()) {
            if (!(el instanceof HTMLElement)) continue;
            el.classList.toggle("selected", this.selectedNodeIds.has(id));
        }
    }

    selectSingleNode(nodeId, { primary = true } = {}) {
        const id = String(nodeId || "");
        if (!id) return;
        this.selectedNodeIds.clear();
        this.selectedNodeIds.add(id);
        this.selectedLinkIds.clear();
        this.updateSelectionClasses();
        this.drawLinks(this.store.getState());
        if (primary) this.callbacks.onSelectNode(id);
    }

    toggleNodeSelection(nodeId, { primary = true } = {}) {
        const id = String(nodeId || "");
        if (!id) return;
        if (this.selectedNodeIds.has(id)) {
            this.selectedNodeIds.delete(id);
        } else {
            this.selectedNodeIds.add(id);
        }
        this.selectedLinkIds.clear();
        this.updateSelectionClasses();
        this.drawLinks(this.store.getState());
        if (!primary) return;
        if (this.selectedNodeIds.has(id)) {
            this.callbacks.onSelectNode(id);
        } else {
            const next = this.selectedNodeIds.values().next().value;
            if (next) this.callbacks.onSelectNode(String(next));
        }
    }

    beginBoxSelection(ev) {
        const wrapRect = this.wrapEl.getBoundingClientRect();
        const x = ev.clientX - wrapRect.left;
        const y = ev.clientY - wrapRect.top;
        const lineOnly = !!(ev.ctrlKey || ev.metaKey);
        this.boxSelectState = {
            pointerId: ev.pointerId,
            startClientX: ev.clientX,
            startClientY: ev.clientY,
            startX: x,
            startY: y,
            currentX: x,
            currentY: y,
            additive: !!ev.shiftKey,
            mode: lineOnly ? "links" : "nodes"
        };
        this.selectionRectEl.classList.remove("hidden");
        this.updateSelectionRectEl(this.boxSelectState);
        if (typeof this.wrapEl.setPointerCapture === "function") {
            try {
                this.wrapEl.setPointerCapture(ev.pointerId);
            } catch {}
        }
    }

    updateSelectionRectEl(state) {
        if (!state || !(this.selectionRectEl instanceof HTMLElement)) return;
        const left = Math.min(state.startX, state.currentX);
        const top = Math.min(state.startY, state.currentY);
        const width = Math.abs(state.currentX - state.startX);
        const height = Math.abs(state.currentY - state.startY);
        this.selectionRectEl.style.left = `${Math.round(left)}px`;
        this.selectionRectEl.style.top = `${Math.round(top)}px`;
        this.selectionRectEl.style.width = `${Math.round(width)}px`;
        this.selectionRectEl.style.height = `${Math.round(height)}px`;
    }

    normalizeRect(rect) {
        return {
            left: Math.min(rect.left, rect.right),
            right: Math.max(rect.left, rect.right),
            top: Math.min(rect.top, rect.bottom),
            bottom: Math.max(rect.top, rect.bottom)
        };
    }

    rectIntersects(a, b) {
        return !(a.right < b.left || a.left > b.right || a.bottom < b.top || a.top > b.bottom);
    }

    collectNodesInRect(clientRect) {
        const found = [];
        for (const [id, nodeEl] of this.nodeElements.entries()) {
            if (!(nodeEl instanceof HTMLElement)) continue;
            const r = nodeEl.getBoundingClientRect();
            if (this.rectIntersects(clientRect, {
                left: r.left,
                right: r.right,
                top: r.top,
                bottom: r.bottom
            })) {
                found.push(id);
            }
        }
        return found;
    }

    collectLinksInLocalRect(localRect) {
        const found = [];
        for (const [id, meta] of this.linkMetaById.entries()) {
            const box = meta?.bbox;
            if (!box) continue;
            if (this.rectIntersects(localRect, box)) {
                found.push(String(id));
            }
        }
        return found;
    }

    applyBoxSelection({ nodeIds, linkIds, additive = false }) {
        const nodes = Array.isArray(nodeIds) ? nodeIds : [];
        const links = Array.isArray(linkIds) ? linkIds : [];

        if (!additive) {
            this.selectedNodeIds.clear();
            this.selectedLinkIds.clear();
        }

        if (nodes.length) {
            if (additive) {
                for (const id of nodes) {
                    if (this.selectedNodeIds.has(id)) this.selectedNodeIds.delete(id);
                    else this.selectedNodeIds.add(id);
                }
            } else {
                for (const id of nodes) this.selectedNodeIds.add(id);
            }
            this.selectedLinkIds.clear();
        } else if (links.length) {
            if (additive) {
                for (const id of links) {
                    if (this.selectedLinkIds.has(id)) this.selectedLinkIds.delete(id);
                    else this.selectedLinkIds.add(id);
                }
            } else {
                for (const id of links) this.selectedLinkIds.add(id);
            }
            this.selectedNodeIds.clear();
        }

        this.updateSelectionClasses();
        this.drawLinks(this.store.getState());
        if (this.selectedNodeIds.size) {
            const head = this.selectedNodeIds.values().next().value;
            if (head) this.callbacks.onSelectNode(String(head));
        }
    }

    endBoxSelection({ cancelled = false } = {}) {
        if (!this.boxSelectState) return false;
        const state = this.boxSelectState;
        this.boxSelectState = null;
        this.selectionRectEl.classList.add("hidden");
        if (typeof this.wrapEl.releasePointerCapture === "function") {
            try {
                this.wrapEl.releasePointerCapture(state.pointerId);
            } catch {}
        }
        if (cancelled) return true;

        const dx = state.currentX - state.startX;
        const dy = state.currentY - state.startY;
        const isClick = Math.abs(dx) < 3 && Math.abs(dy) < 3;
        if (isClick) {
            if (!state.additive) this.clearSelection({ nodes: true, links: true, primary: false });
            return true;
        }

        const wrapRect = this.wrapEl.getBoundingClientRect();
        const clientRect = this.normalizeRect({
            left: state.startClientX,
            right: state.startClientX + dx,
            top: state.startClientY,
            bottom: state.startClientY + dy
        });
        const localRect = this.normalizeRect({
            left: state.startClientX - wrapRect.left,
            right: state.startClientX + dx - wrapRect.left,
            top: state.startClientY - wrapRect.top,
            bottom: state.startClientY + dy - wrapRect.top
        });

        const nodeIds = state.mode === "nodes"
            ? this.collectNodesInRect(clientRect)
            : [];
        const linkIds = state.mode === "links"
            ? this.collectLinksInLocalRect(localRect)
            : [];
        this.applyBoxSelection({ nodeIds, linkIds, additive: state.additive });
        return true;
    }

    deleteSelectedNodes() {
        const nodeIds = Array.from(this.selectedNodeIds).filter((id) => !this.isSystemNodeId(id));
        if (!nodeIds.length) return 0;
        if (typeof this.callbacks.onDeleteNodes === "function") {
            this.callbacks.onDeleteNodes(nodeIds);
        } else {
            for (const id of nodeIds) this.callbacks.onDeleteNode(id);
        }
        for (const id of nodeIds) this.selectedNodeIds.delete(id);
        this.updateSelectionClasses();
        this.drawLinks(this.store.getState());
        return nodeIds.length;
    }

    deleteSelectedLinks() {
        const linkIds = Array.from(this.selectedLinkIds);
        if (!linkIds.length) return 0;
        if (typeof this.callbacks.onDeleteLinks === "function") {
            this.callbacks.onDeleteLinks(linkIds);
        } else {
            for (const id of linkIds) this.callbacks.onDeleteLink(id);
        }
        this.selectedLinkIds.clear();
        this.drawLinks(this.store.getState());
        return linkIds.length;
    }

    deleteSelection() {
        if (this.selectedLinkIds.size) {
            return { kind: "links", count: this.deleteSelectedLinks() };
        }
        if (Array.from(this.selectedNodeIds).some((id) => !this.isSystemNodeId(id))) {
            return { kind: "nodes", count: this.deleteSelectedNodes() };
        }
        return { kind: "", count: 0 };
    }

    hasAnySelection() {
        return this.selectedNodeIds.size > 0 || this.selectedLinkIds.size > 0;
    }

    applyViewTransform() {
        const scale = Math.max(MIN_GRAPH_SCALE, Math.min(MAX_GRAPH_SCALE, Number(this.view?.scale || 1)));
        const offsetX = Number.isFinite(Number(this.view?.offsetX)) ? Number(this.view.offsetX) : 0;
        const offsetY = Number.isFinite(Number(this.view?.offsetY)) ? Number(this.view.offsetY) : 0;
        this.view.scale = scale;
        this.view.offsetX = offsetX;
        this.view.offsetY = offsetY;

        this.canvasEl.style.transformOrigin = "0 0";
        this.canvasEl.style.transform = `translate(${Math.round(offsetX * 100) / 100}px, ${Math.round(offsetY * 100) / 100}px) scale(${Math.round(scale * 1000) / 1000})`;
    }

    screenToGraph(clientX, clientY, wrapRect = null) {
        const rect = wrapRect || this.wrapEl.getBoundingClientRect();
        const px = clientX - rect.left;
        const py = clientY - rect.top;
        const scale = Math.max(0.0001, Number(this.view?.scale || 1));
        const ox = Number(this.view?.offsetX || 0);
        const oy = Number(this.view?.offsetY || 0);
        return {
            x: (px - ox) / scale,
            y: (py - oy) / scale,
            localX: px,
            localY: py
        };
    }

    onWrapPointerDown(ev) {
        if (ev.button !== 0 && ev.button !== 1) return;
        if (this.connectState) return;

        const target = ev.target;
        if (!(target instanceof HTMLElement)) return;
        if (target.closest("button, input, select, textarea, label")) return;

        const isBackground = target === this.wrapEl || target === this.canvasEl || target === this.linesEl;
        if (!isBackground) return;

        this.closeContextMenu();
        if (ev.button === 1) {
            this.panState = {
                pointerId: ev.pointerId,
                startClientX: ev.clientX,
                startClientY: ev.clientY,
                startOffsetX: Number(this.view?.offsetX || 0),
                startOffsetY: Number(this.view?.offsetY || 0)
            };
            this.wrapEl.classList.add("panning");
            if (typeof this.wrapEl.setPointerCapture === "function") {
                try {
                    this.wrapEl.setPointerCapture(ev.pointerId);
                } catch {}
            }
        } else {
            this.beginBoxSelection(ev);
        }
        ev.preventDefault();
    }

    onWrapContextMenu(ev) {
        const target = ev.target;
        if (!(target instanceof HTMLElement)) return;
        const isBackground = target === this.wrapEl || target === this.canvasEl || target === this.linesEl;
        if (!isBackground) return;
        ev.preventDefault();
        this.openContextMenu({ mode: "canvas" }, ev.clientX, ev.clientY);
    }

    onWrapWheel(ev) {
        ev.preventDefault();
        this.closeContextMenu();

        const rect = this.wrapEl.getBoundingClientRect();
        const currentScale = Math.max(MIN_GRAPH_SCALE, Math.min(MAX_GRAPH_SCALE, Number(this.view?.scale || 1)));
        const zoomFactor = Math.exp(-Number(ev.deltaY || 0) * 0.0015);
        const nextScale = Math.max(MIN_GRAPH_SCALE, Math.min(MAX_GRAPH_SCALE, currentScale * zoomFactor));
        if (Math.abs(nextScale - currentScale) < 1e-5) return;

        const px = ev.clientX - rect.left;
        const py = ev.clientY - rect.top;
        const worldX = (px - Number(this.view?.offsetX || 0)) / currentScale;
        const worldY = (py - Number(this.view?.offsetY || 0)) / currentScale;

        this.view.scale = nextScale;
        this.view.offsetX = px - worldX * nextScale;
        this.view.offsetY = py - worldY * nextScale;
        this.applyViewTransform();
        this.drawLinks(this.store.getState());
    }

    getSystemNodeLayout() {
        const rawRect = this.wrapEl.getBoundingClientRect();
        const safeRect = {
            width: Math.max(620, Number(rawRect.width || 0)),
            height: Math.max(220, Number(rawRect.height || 0))
        };
        const h = safeRect.height;
        const w = safeRect.width;
        const y = Math.max(14, Math.round(h * 0.42));
        const defaults = {
            [GRAPH_INPUT_ID]: { x: 12, y, inputs: 0, outputs: 1 },
            [GRAPH_OUTPUT_ID]: { x: Math.max(12, w - NODE_WIDTH - 12), y, inputs: 1, outputs: 0 }
        };
        const out = {
            [GRAPH_INPUT_ID]: null,
            [GRAPH_OUTPUT_ID]: null
        };
        for (const id of [GRAPH_INPUT_ID, GRAPH_OUTPUT_ID]) {
            const saved = this.systemNodePositions[id];
            const userMoved = !!this.systemNodeUserMoved[id];
            const savedX = Number(saved?.x);
            const savedY = Number(saved?.y);
            const hasSavedPos = Number.isFinite(savedX) && Number.isFinite(savedY);
            if (userMoved && hasSavedPos) {
                out[id] = {
                    x: savedX,
                    y: savedY,
                    inputs: defaults[id].inputs,
                    outputs: defaults[id].outputs
                };
                continue;
            }
            const outputCollapsedNearInput = id === GRAPH_OUTPUT_ID
                && !this.systemNodeUserMoved[GRAPH_INPUT_ID]
                && !this.systemNodeUserMoved[GRAPH_OUTPUT_ID]
                && Number(rawRect.width || 0) > 240
                && Number(this.systemNodePositions[GRAPH_INPUT_ID]?.x || 0) <= 24
                && Number(saved?.x || 0) <= 24
                && Math.abs(Number(saved?.y || 0) - Number(this.systemNodePositions[GRAPH_INPUT_ID]?.y || 0)) < 28;
            const base = saved
                && !outputCollapsedNearInput
                ? {
                    x: Number(saved.x || defaults[id].x),
                    y: Number(saved.y || defaults[id].y),
                    inputs: defaults[id].inputs,
                    outputs: defaults[id].outputs
                }
                : defaults[id];
            const clamped = clampNodePosLocal(
                base.x,
                base.y,
                safeRect,
                NODE_WIDTH,
                80
            );
            out[id] = {
                x: clamped.x,
                y: clamped.y,
                inputs: defaults[id].inputs,
                outputs: defaults[id].outputs
            };
            if (Number(rawRect.width || 0) > 180 && Number(rawRect.height || 0) > 120) {
                this.systemNodePositions[id] = { x: clamped.x, y: clamped.y };
            }
        }
        return out;
    }

    syncSystemNodesFromState(state) {
        const positions = state?.post?.systemNodePositions;
        const moved = state?.post?.systemNodeUserMoved;
        if (!positions || typeof positions !== "object") return;
        for (const id of [GRAPH_INPUT_ID, GRAPH_OUTPUT_ID]) {
            const pos = positions[id];
            const x = Number(pos?.x);
            const y = Number(pos?.y);
            if (Number.isFinite(x) && Number.isFinite(y)) {
                this.systemNodePositions[id] = { x, y };
            }
            if (moved && Object.prototype.hasOwnProperty.call(moved, id)) {
                this.systemNodeUserMoved[id] = !!moved[id];
            }
        }
    }

    createHandle({ nodeId, kind, slot, total }) {
        const handle = document.createElement("button");
        handle.type = "button";
        handle.className = `handle ${kind}`;
        handle.title = `${kind === "in" ? "Input Slot" : "Output Slot"} ${slot}`;
        handle.dataset.nodeId = nodeId;
        handle.dataset.slot = String(slot);
        handle.dataset.kind = kind;
        handle.textContent = String(slot);

        const top = total <= 1 ? 50 : ((slot + 1) / (total + 1)) * 100;
        handle.style.top = `${Math.round(top * 100) / 100}%`;

        if (kind === "in") {
            handle.addEventListener("pointerdown", (ev) => this.onInputHandlePointerDown(ev));
            handle.addEventListener("pointerup", (ev) => this.onInputHandlePointerUp(ev));
            handle.addEventListener("pointercancel", (ev) => this.onInputHandlePointerCancel(ev));
            handle.addEventListener("pointerleave", (ev) => this.onInputHandlePointerCancel(ev));
        } else {
            handle.addEventListener("pointerdown", (ev) => this.onOutputHandlePointerDown(ev));
        }

        return handle;
    }

    buildNodeBody(node, inputCount, outputCount) {
        const body = document.createElement("div");
        body.className = "graph-node-body";

        const summary = document.createElement("div");
        summary.className = "graph-node-summary";
        summary.textContent = `In:${inputCount} Out:${outputCount} | Params:${Number(node.params?.length || 0)}`;
        body.appendChild(summary);
        const outputHint = document.createElement("div");
        outputHint.className = "graph-node-output-hint";
        outputHint.textContent = formatFragmentOutputHint(node, outputCount);
        body.appendChild(outputHint);


        const inline = document.createElement("div");
        inline.className = "graph-node-inline";
        bindEditorEvents(inline);

        const nameRow = document.createElement("div");
        nameRow.className = "graph-node-inline-row";
        const inpName = document.createElement("input");
        inpName.className = "input";
        inpName.value = String(node.name || "");
        inpName.placeholder = "Card Name";
        bindEditorEvents(inpName);
        inpName.addEventListener("change", () => {
            const next = String(inpName.value || "").trim() || String(node.name || "Card");
            this.callbacks.onPatchNode(node.id, (target) => {
                target.name = next;
                if (target.fragmentPathTemplate) {
                    target.fragmentPath = resolveNodeFragmentPath(next, target.fragmentPathTemplate);
                }
            }, { reason: "node-inline-name", forceCompile: false, forceKotlin: true });
        });
        nameRow.appendChild(inpName);
        inline.appendChild(nameRow);

        const textureNode = normalizeNodeType(node.type) === NODE_TYPE_TEXTURE;

        const rowTypeFilter = document.createElement("div");
        rowTypeFilter.className = textureNode ? "graph-node-inline-row" : "graph-node-inline-row dual";
        const selType = document.createElement("select");
        selType.className = "input";
        bindEditorEvents(selType);
        for (const item of NODE_TYPE_OPTIONS) {
            const opt = document.createElement("option");
            opt.value = item.value;
            opt.textContent = item.label;
            if (item.value === String(node.type || "simple")) opt.selected = true;
            selType.appendChild(opt);
        }
        selType.addEventListener("change", () => {
            this.callbacks.onPatchNode(node.id, (target) => {
                target.type = String(selType.value || "simple");
            }, { reason: "node-inline-type", forceCompile: true, forceKotlin: true });
        });

        const selFilter = document.createElement("select");
        selFilter.className = "input";
        bindEditorEvents(selFilter);
        for (const f of NODE_FILTER_OPTIONS) {
            const opt = document.createElement("option");
            opt.value = f;
            opt.textContent = f.replace("GL33.", "");
            if (f === String(node.filter || "GL33.GL_LINEAR")) opt.selected = true;
            selFilter.appendChild(opt);
        }
        selFilter.addEventListener("change", () => {
            this.callbacks.onPatchNode(node.id, (target) => {
                target.filter = String(selFilter.value || "GL33.GL_LINEAR");
            }, { reason: "node-inline-filter", forceCompile: true, forceKotlin: true });
        });
        selFilter.disabled = textureNode;
        if (textureNode) {
            selFilter.title = "texture node does not use shader filter mode";
        }

        rowTypeFilter.appendChild(selType);
        if (!textureNode) rowTypeFilter.appendChild(selFilter);
        inline.appendChild(rowTypeFilter);

        const createInlineField = (labelText, controlEl) => {
            const field = document.createElement("div");
            field.className = "graph-node-inline-field";
            const label = document.createElement("span");
            label.className = "graph-node-inline-field-label";
            label.textContent = labelText;
            field.appendChild(label);
            field.appendChild(controlEl);
            return field;
        };

        const rowSlots = document.createElement("div");
        rowSlots.className = "graph-node-inline-row dual";
        const minInputs = minInputCountByNodeType(node.type);

        const inpInputs = document.createElement("input");
        inpInputs.className = "input";
        inpInputs.type = "number";
        inpInputs.min = String(minInputs);
        inpInputs.max = "8";
        inpInputs.step = "1";
        inpInputs.value = String(normalizeInt(node.inputs, minInputs, minInputs, 8));
        inpInputs.placeholder = "\u8f93\u5165\u69fd";
        inpInputs.title = textureNode ? "texture node input slots are fixed to 0" : "input slots";
        inpInputs.disabled = textureNode;
        bindEditorEvents(inpInputs);
        inpInputs.addEventListener("change", () => {
            this.callbacks.onPatchNode(node.id, (target) => {
                const targetMin = minInputCountByNodeType(target.type);
                target.inputs = normalizeInt(inpInputs.value, targetMin, targetMin, 8);
            }, { reason: "node-inline-inputs", forceCompile: true, forceKotlin: true });
        });

        const inpOutputs = document.createElement("input");
        inpOutputs.className = "input";
        inpOutputs.type = "number";
        inpOutputs.min = "1";
        inpOutputs.max = "8";
        inpOutputs.step = "1";
        inpOutputs.value = String(normalizeInt(node.outputs, 1, 1, 8));
        inpOutputs.placeholder = "\u8f93\u51fa\u69fd";
        inpOutputs.title = formatFragmentOutputHint(node, outputCount);
        inpOutputs.readOnly = true;
        inpOutputs.disabled = true;
        bindEditorEvents(inpOutputs);

        rowSlots.appendChild(createInlineField("Input Slots", inpInputs));
        rowSlots.appendChild(createInlineField("Output Slots (auto)", inpOutputs));
        if (!textureNode) inline.appendChild(rowSlots);

        const rowRuntime = document.createElement("div");
        rowRuntime.className = "graph-node-inline-row dual";
        const inpTexUnit = document.createElement("input");
        inpTexUnit.className = "input";
        inpTexUnit.type = "number";
        inpTexUnit.min = "0";
        inpTexUnit.step = "1";
        inpTexUnit.value = String(Math.max(0, Math.round(Number(node.textureUnit || 1))));
        inpTexUnit.placeholder = "\u7eb9\u7406\u5355\u5143";
        inpTexUnit.title = "\u7eb9\u7406\u5355\u5143";
        inpTexUnit.disabled = textureNode;
        bindEditorEvents(inpTexUnit);
        inpTexUnit.addEventListener("change", () => {
            this.callbacks.onPatchNode(node.id, (target) => {
                target.textureUnit = Math.max(0, Math.round(Number(inpTexUnit.value || 0)));
            }, { reason: "node-inline-tex-unit", forceCompile: true, forceKotlin: true });
        });

        const inpIterations = document.createElement("input");
        inpIterations.className = "input";
        inpIterations.type = "number";
        inpIterations.min = "1";
        inpIterations.step = "1";
        inpIterations.value = String(Math.max(1, Math.round(Number(node.iterations || 1))));
        inpIterations.placeholder = "\u8fed\u4ee3\u6b21\u6570";
        inpIterations.title = "PingPong \u8fed\u4ee3\u6b21\u6570";
        inpIterations.disabled = textureNode || normalizeNodeType(node.type) !== "pingpong";
        bindEditorEvents(inpIterations);
        inpIterations.addEventListener("change", () => {
            this.callbacks.onPatchNode(node.id, (target) => {
                target.iterations = Math.max(1, Math.round(Number(inpIterations.value || 1)));
            }, { reason: "node-inline-iterations", forceCompile: true, forceKotlin: true });
        });

        rowRuntime.appendChild(createInlineField("Texture Unit", inpTexUnit));
        rowRuntime.appendChild(createInlineField("Iterations", inpIterations));
        if (!textureNode) inline.appendChild(rowRuntime);

        if (textureNode) {
            const textureHint = document.createElement("div");
            textureHint.className = "graph-node-output-hint";
            textureHint.textContent = "texture node outputs texture only, no fragment shader processing.";
            inline.appendChild(textureHint);
        }

        const rowMipmap = document.createElement("div");
        rowMipmap.className = "graph-node-inline-row";
        const chkWrap = document.createElement("label");
        chkWrap.className = "graph-node-inline-check";
        bindEditorEvents(chkWrap);
        const chkMipmap = document.createElement("input");
        chkMipmap.type = "checkbox";
        chkMipmap.checked = !!node.useMipmap;
        bindEditorEvents(chkMipmap);
        chkMipmap.addEventListener("change", () => {
            this.callbacks.onPatchNode(node.id, (target) => {
                target.useMipmap = !!chkMipmap.checked;
            }, { reason: "node-inline-mipmap", forceCompile: true, forceKotlin: true });
        });
        const chkText = document.createElement("span");
        chkText.textContent = "Enable Mipmap";
        chkWrap.appendChild(chkMipmap);
        chkWrap.appendChild(chkText);
        rowMipmap.appendChild(chkWrap);
        if (!textureNode) inline.appendChild(rowMipmap);

        const paramsHead = document.createElement("div");
        paramsHead.className = "graph-node-param-head";
        const headText = document.createElement("span");
        headText.textContent = `Params (${Number(node.params?.length || 0)})`;
        const btnAddParam = document.createElement("button");
        btnAddParam.type = "button";
        btnAddParam.className = "btn small";
        btnAddParam.textContent = "+Param";
        bindEditorEvents(btnAddParam);
        if (textureNode) {
            btnAddParam.disabled = true;
            btnAddParam.classList.add("hidden");
            btnAddParam.title = "texture node keeps one texture parameter";
        } else {
            btnAddParam.addEventListener("click", () => {
                this.callbacks.onPatchNode(node.id, (target) => {
                    const p = createParamTemplate();
                    const current = Array.isArray(target.params) ? target.params : [];
                    const serial = current.filter((it) => !isTextureParam(it)).length + 1;
                    p.name = `uParam${serial}`;
                    target.params = Array.isArray(target.params) ? target.params : [];
                    target.params.push(p);
                }, { reason: "node-inline-param-add", forceCompile: true, forceKotlin: true });
            });
        }
        paramsHead.appendChild(headText);
        paramsHead.appendChild(btnAddParam);
        inline.appendChild(paramsHead);

        const paramList = document.createElement("div");
        paramList.className = "graph-node-param-list";
        const minTextureCount = getPostInputTextureMinCount(node.inputs);
        const textureParamCount = countTextureParams(node.params || []);
        const stateSnapshot = this.store?.getState ? this.store.getState() : null;
        const textures = Array.isArray(stateSnapshot?.textures) ? stateSnapshot.textures : [];

        for (let i = 0; i < (node.params || []).length; i += 1) {
            const p = node.params[i] || {};
            const lockTextureParam = isTextureParam(p) && (textureNode ? i === 0 : textureParamCount <= minTextureCount);
            const item = document.createElement("div");
            item.className = "graph-node-param-item";

            if (textureNode) {
                const rowUploadOnly = document.createElement("div");
                rowUploadOnly.className = "graph-node-param-value-source";
                rowUploadOnly.style.gridTemplateColumns = "1fr";

                const selTextureUploadOnly = document.createElement("select");
                selTextureUploadOnly.className = "input";
                bindEditorEvents(selTextureUploadOnly);

                const noneOpt = document.createElement("option");
                noneOpt.value = "";
                noneOpt.textContent = "select uploaded texture";
                selTextureUploadOnly.appendChild(noneOpt);

                for (const tex of textures) {
                    const opt = document.createElement("option");
                    opt.value = tex.id;
                    opt.textContent = tex.name || tex.id;
                    if (String(tex.id || "") === String(p.textureId || "")) opt.selected = true;
                    selTextureUploadOnly.appendChild(opt);
                }

                selTextureUploadOnly.addEventListener("change", () => {
                    this.callbacks.onPatchNode(node.id, (target) => {
                        const param = target.params?.[i];
                        if (!param) return;
                        param.type = "texture";
                        param.sourceType = "upload";
                        param.textureId = String(selTextureUploadOnly.value || "");
                        param.connection = "";
                        param.valueSource = "value";
                        param.valueExpr = "";
                        if (!String(param.value || "").trim()) param.value = "0";
                    }, { reason: "node-inline-param-upload-only", forceCompile: true, forceKotlin: true });
                });

                rowUploadOnly.appendChild(selTextureUploadOnly);
                item.appendChild(rowUploadOnly);
                paramList.appendChild(item);
                continue;
            }

            const inpParamName = document.createElement("input");
            inpParamName.className = "input";
            inpParamName.value = String(p.name || "");
            inpParamName.placeholder = "param name";
            bindEditorEvents(inpParamName);
            inpParamName.addEventListener("change", () => {
                this.callbacks.onPatchNode(node.id, (target) => {
                    const param = target.params?.[i];
                    if (!param) return;
                    param.name = String(inpParamName.value || "").trim();
                }, { reason: "node-inline-param-name", forceCompile: true, forceKotlin: true });
            });

            const rowParamControls = document.createElement("div");
            rowParamControls.className = "graph-node-param-controls";

            const rowValueSource = document.createElement("div");
            rowValueSource.className = "graph-node-param-value-source";

            const rowTextureSource = document.createElement("div");
            rowTextureSource.className = "graph-node-param-value-source";
            const fixedTextureSource = !textureNode;
            rowTextureSource.style.gridTemplateColumns = fixedTextureSource ? "1fr" : "1fr 2fr";

            const selParamType = document.createElement("select");
            selParamType.className = "input";
            bindEditorEvents(selParamType);
            for (const t of PARAM_TYPE_OPTIONS) {
                const opt = document.createElement("option");
                opt.value = t;
                opt.textContent = t;
                if (t === String(p.type || "float")) opt.selected = true;
                selParamType.appendChild(opt);
            }
            if (lockTextureParam || textureNode) selParamType.disabled = true;

            const inpParamValue = document.createElement("input");
            inpParamValue.className = "input";
            inpParamValue.value = String(p.value ?? "");
            inpParamValue.placeholder = placeholderByType(p.type);
            bindEditorEvents(inpParamValue);

            const selValueSource = document.createElement("select");
            selValueSource.className = "input";
            bindEditorEvents(selValueSource);
            [
                { value: "value", label: "value" },
                { value: "uniform", label: "uniform" }
            ].forEach((item) => {
                const opt = document.createElement("option");
                opt.value = item.value;
                opt.textContent = item.label;
                if (item.value === String(p.valueSource || "value")) opt.selected = true;
                selValueSource.appendChild(opt);
            });

            const selUniformExpr = document.createElement("select");
            selUniformExpr.className = "input";
            bindEditorEvents(selUniformExpr);
            populateUniformExprSelect(selUniformExpr, p.type, String(p.valueExpr || defaultUniformExprByType(p.type)));

            const selTextureSource = document.createElement("select");
            selTextureSource.className = "input";
            bindEditorEvents(selTextureSource);
            (fixedTextureSource
                ? [{ value: "connection", label: "connection" }]
                : [
                    { value: "value", label: "pass input" },
                    { value: "upload", label: "uploaded" },
                    { value: "connection", label: "connection" }
                ]).forEach((item) => {
                const opt = document.createElement("option");
                opt.value = item.value;
                opt.textContent = item.label;
                if (fixedTextureSource) {
                    opt.selected = item.value === "connection";
                } else if (item.value === String(p.sourceType || "value")) {
                    opt.selected = true;
                }
                selTextureSource.appendChild(opt);
            });
            if (fixedTextureSource) {
                selTextureSource.disabled = true;
                selTextureSource.classList.add("hidden");
            }

            const textureInputHost = document.createElement("div");
            textureInputHost.style.display = "grid";
            textureInputHost.style.gridTemplateColumns = "1fr";
            textureInputHost.style.gap = "6px";

            const inpTextureSlot = document.createElement("input");
            inpTextureSlot.className = "input";
            inpTextureSlot.placeholder = fixedTextureSource ? "input slot N" : "sampler slot";
            if (fixedTextureSource) inpTextureSlot.title = "input card input port index (input slot N)";
            inpTextureSlot.value = String(p.value ?? "0");
            bindEditorEvents(inpTextureSlot);

            const selTextureUpload = document.createElement("select");
            selTextureUpload.className = "input";
            bindEditorEvents(selTextureUpload);
            const noneOpt = document.createElement("option");
            noneOpt.value = "";
            noneOpt.textContent = "select texture";
            selTextureUpload.appendChild(noneOpt);
            for (const tex of textures) {
                const opt = document.createElement("option");
                opt.value = tex.id;
                opt.textContent = tex.name || tex.id;
                if (String(tex.id || "") === String(p.textureId || "")) opt.selected = true;
                selTextureUpload.appendChild(opt);
            }

            const inpTextureConnection = document.createElement("input");
            inpTextureConnection.className = "input";
            inpTextureConnection.placeholder = "from node, e.g. bloom:0";
            inpTextureConnection.value = String(p.connection || "");
            bindEditorEvents(inpTextureConnection);

            const updateTextureSourceUI = () => {
                const sourceType = fixedTextureSource ? "connection" : String(selTextureSource.value || "value");
                const showSlot = fixedTextureSource ? true : sourceType === "value";
                inpTextureSlot.classList.toggle("hidden", !showSlot);
                selTextureUpload.classList.toggle("hidden", sourceType !== "upload");
                inpTextureConnection.classList.toggle("hidden", fixedTextureSource || sourceType !== "connection");
            };

            const updateValueSourceUI = () => {
                const currentType = String(selParamType.value || "float").toLowerCase();
                const isTextureType = currentType === "texture";
                const useExpr = !isTextureType && selValueSource.value === "uniform";
                const hideValueInput = isTextureType || useExpr;

                rowValueSource.style.display = isTextureType ? "none" : "";
                rowTextureSource.style.display = isTextureType ? "" : "none";
                rowParamControls.style.gridTemplateColumns = hideValueInput ? "1fr auto" : "1fr 1fr auto";
                rowValueSource.style.gridTemplateColumns = useExpr ? "1fr 2fr" : "1fr";
                inpParamValue.classList.toggle("hidden", hideValueInput);
                selUniformExpr.classList.toggle("hidden", !useExpr);
                selUniformExpr.disabled = !useExpr;
                inpParamValue.disabled = hideValueInput;

                if (useExpr && !String(selUniformExpr.value || "").trim()) {
                    populateUniformExprSelect(selUniformExpr, currentType, defaultUniformExprByType(currentType));
                }
                updateTextureSourceUI();
            };
            updateValueSourceUI();

            if (!lockTextureParam && !textureNode) {
                selParamType.addEventListener("change", () => {
                    const nextType = String(selParamType.value || "float").toLowerCase();
                    populateUniformExprSelect(selUniformExpr, nextType, String(selUniformExpr.value || ""));
                    updateValueSourceUI();
                    inpParamValue.placeholder = placeholderByType(nextType);
                    this.callbacks.onPatchNode(node.id, (target) => {
                        const param = target.params?.[i];
                        if (!param) return;
                        param.type = nextType;
                        if (nextType === "texture") {
                            param.sourceType = fixedTextureSource
                                ? "connection"
                                : String(param.sourceType || "value");
                            if (fixedTextureSource) {
                                param.textureId = "";
                                param.connection = "";
                            }
                            param.valueSource = "value";
                            param.valueExpr = "";
                            if (!String(param.value || "").trim()) param.value = "0";
                        } else {
                            param.sourceType = "value";
                            param.textureId = "";
                            param.connection = "";
                            param.valueSource = String(selValueSource.value || "value");
                            if (!String(param.valueExpr || "").trim()) {
                                param.valueExpr = String(selUniformExpr.value || defaultUniformExprByType(nextType));
                            }
                        }
                    }, { reason: "node-inline-param-type", forceCompile: true, forceKotlin: true });
                });
            }

            selValueSource.addEventListener("change", () => {
                updateValueSourceUI();
                this.callbacks.onPatchNode(node.id, (target) => {
                    const param = target.params?.[i];
                    if (!param || String(param.type || "float").toLowerCase() === "texture") return;
                    param.valueSource = String(selValueSource.value || "value");
                    if (param.valueSource === "uniform" && !String(param.valueExpr || "").trim()) {
                        param.valueExpr = String(selUniformExpr.value || defaultUniformExprByType(param.type));
                    }
                }, { reason: "node-inline-param-source", forceCompile: true, forceKotlin: true });
            });

            selUniformExpr.addEventListener("change", () => {
                this.callbacks.onPatchNode(node.id, (target) => {
                    const param = target.params?.[i];
                    if (!param || String(param.type || "float").toLowerCase() === "texture") return;
                    param.valueExpr = String(selUniformExpr.value || "").trim();
                    param.valueSource = "uniform";
                }, { reason: "node-inline-param-expr", forceCompile: true, forceKotlin: true });
            });

            inpParamValue.addEventListener("change", () => {
                this.callbacks.onPatchNode(node.id, (target) => {
                    const param = target.params?.[i];
                    if (!param || String(param.type || "float").toLowerCase() === "texture") return;
                    param.value = String(inpParamValue.value || "").trim();
                }, { reason: "node-inline-param-value", forceCompile: true, forceKotlin: true });
            });

            selTextureSource.addEventListener("change", () => {
                updateValueSourceUI();
                this.callbacks.onPatchNode(node.id, (target) => {
                    const param = target.params?.[i];
                    if (!param || String(param.type || "float").toLowerCase() !== "texture") return;
                    const sourceType = fixedTextureSource ? "connection" : String(selTextureSource.value || "value");
                    param.sourceType = sourceType;
                    if (sourceType === "value") {
                        param.textureId = "";
                        param.connection = "";
                    } else if (sourceType === "upload") {
                        param.connection = "";
                    } else if (sourceType === "connection") {
                        param.textureId = "";
                        if (fixedTextureSource) param.connection = "";
                    }
                    if (!String(param.value || "").trim()) param.value = "0";
                }, { reason: "node-inline-param-source-type", forceCompile: true, forceKotlin: true });
            });

            inpTextureSlot.addEventListener("change", () => {
                this.callbacks.onPatchNode(node.id, (target) => {
                    const param = target.params?.[i];
                    if (!param || String(param.type || "float").toLowerCase() !== "texture") return;
                    const next = String(inpTextureSlot.value || "").trim();
                    param.value = next || "0";
                }, { reason: "node-inline-param-slot", forceCompile: true, forceKotlin: true });
            });

            selTextureUpload.addEventListener("change", () => {
                this.callbacks.onPatchNode(node.id, (target) => {
                    const param = target.params?.[i];
                    if (!param || String(param.type || "float").toLowerCase() !== "texture") return;
                    param.textureId = String(selTextureUpload.value || "");
                }, { reason: "node-inline-param-upload", forceCompile: true, forceKotlin: true });
            });

            inpTextureConnection.addEventListener("change", () => {
                this.callbacks.onPatchNode(node.id, (target) => {
                    const param = target.params?.[i];
                    if (!param || String(param.type || "float").toLowerCase() !== "texture") return;
                    param.connection = String(inpTextureConnection.value || "").trim();
                }, { reason: "node-inline-param-connection", forceCompile: true, forceKotlin: true });
            });

            const btnDelParam = document.createElement("button");
            btnDelParam.type = "button";
            btnDelParam.className = "btn small danger";
            btnDelParam.textContent = "Del";
            bindEditorEvents(btnDelParam);
            if (lockTextureParam) {
                btnDelParam.disabled = true;
                btnDelParam.title = "required texture input cannot be removed";
            } else {
                btnDelParam.addEventListener("click", () => {
                    this.callbacks.onPatchNode(node.id, (target) => {
                        if (!Array.isArray(target.params)) return;
                        target.params.splice(i, 1);
                    }, { reason: "node-inline-param-delete", forceCompile: true, forceKotlin: true });
                });
            }

            rowParamControls.appendChild(selParamType);
            rowParamControls.appendChild(inpParamValue);
            rowParamControls.appendChild(btnDelParam);

            rowValueSource.appendChild(selValueSource);
            rowValueSource.appendChild(selUniformExpr);

            textureInputHost.appendChild(inpTextureSlot);
            textureInputHost.appendChild(selTextureUpload);
            textureInputHost.appendChild(inpTextureConnection);
            rowTextureSource.appendChild(selTextureSource);
            rowTextureSource.appendChild(textureInputHost);

            item.appendChild(inpParamName);
            item.appendChild(rowParamControls);
            item.appendChild(rowValueSource);
            item.appendChild(rowTextureSource);
            paramList.appendChild(item);
        }
        inline.appendChild(paramList);

        const rowActions = document.createElement("div");
        rowActions.className = "graph-node-inline-row";
        const btnDeleteNode = document.createElement("button");
        btnDeleteNode.type = "button";
        btnDeleteNode.className = "btn small danger";
        btnDeleteNode.textContent = "Delete Card";
        bindEditorEvents(btnDeleteNode);
        btnDeleteNode.addEventListener("click", () => {
            if (this.selectedNodeIds.has(node.id) && this.selectedNodeIds.size > 1) {
                this.deleteSelectedNodes();
            } else {
                this.callbacks.onDeleteNode(node.id);
            }
        });
        rowActions.appendChild(btnDeleteNode);
        inline.appendChild(rowActions);

        body.appendChild(inline);
        return body;
    }

    buildNodeElement(node, { system = false, selected = false }) {
        const defaultInputCount = system ? (node.id === GRAPH_OUTPUT_ID ? 1 : 0) : minInputCountByNodeType(node.type);
        const inputCount = asCount(node.inputs, defaultInputCount, 8);
        const outputCount = asCount(node.outputs, system ? (node.id === GRAPH_INPUT_ID ? 1 : 0) : 1, 8);

        const el = document.createElement("div");
        el.className = `graph-node${system ? " system" : ""}${selected ? " selected" : ""}`;
        el.dataset.nodeId = node.id;
        el.style.left = `${Math.round(node.x)}px`;
        el.style.top = `${Math.round(node.y)}px`;

        const head = document.createElement("div");
        head.className = "graph-node-head";

        const title = document.createElement("div");
        title.className = "graph-node-title";
        title.textContent = node.name;

        const type = document.createElement("div");
        type.className = "graph-node-type";
        type.textContent = String(node.type || "");

        head.appendChild(title);
        head.appendChild(type);

        head.addEventListener("pointerdown", (ev) => this.onNodeDragStart(ev, node.id, { system }));
        el.addEventListener("click", (ev) => this.onNodeClick(ev, node.id, { system }));

        if (!system) {
            el.addEventListener("contextmenu", (ev) => this.onNodeContextMenu(ev, node.id));
            el.appendChild(head);
            el.appendChild(this.buildNodeBody(node, inputCount, outputCount));
        } else {
            const body = document.createElement("div");
            body.className = "graph-node-body";
            body.textContent = node.id === GRAPH_INPUT_ID
                ? "Input System Node (valueInputPipe)"
                : "Output System Node (valueOutput)";
            el.appendChild(head);
            el.appendChild(body);
        }

        for (let i = 0; i < inputCount; i++) {
            el.appendChild(this.createHandle({ nodeId: node.id, kind: "in", slot: i, total: inputCount }));
        }
        for (let i = 0; i < outputCount; i++) {
            el.appendChild(this.createHandle({ nodeId: node.id, kind: "out", slot: i, total: outputCount }));
        }

        return el;
    }

    onNodeClick(ev, nodeId, { system = false } = {}) {
        if (!(ev instanceof MouseEvent)) return;
        if (ev.button !== 0) return;
        if (this.dragState?.moved) return;
        if (this.boxSelectState) return;
        const additive = !!(ev.shiftKey || ev.ctrlKey || ev.metaKey);
        if (additive) {
            this.toggleNodeSelection(nodeId, { primary: !system });
        } else {
            this.selectSingleNode(nodeId, { primary: !system });
        }
    }

    onNodeContextMenu(ev, nodeId) {
        ev.preventDefault();
        ev.stopPropagation();
        if (!this.selectedNodeIds.has(nodeId)) {
            this.selectSingleNode(nodeId, { primary: true });
        } else {
            this.selectedLinkIds.clear();
            this.updateSelectionClasses();
            this.drawLinks(this.store.getState());
        }
        this.openContextMenu({ mode: "node", nodeId }, ev.clientX, ev.clientY);
    }

    onNodeDragStart(ev, nodeId, { system = false } = {}) {
        if (ev.button !== 0) return;
        const target = ev.target;
        if (target instanceof HTMLElement && target.closest("button, input, select, textarea, label")) return;
        this.closeContextMenu();

        if (!this.selectedNodeIds.has(nodeId)) {
            this.selectSingleNode(nodeId, { primary: !system });
        } else {
            this.selectedLinkIds.clear();
            this.drawLinks(this.store.getState());
        }

        const wrapRect = this.wrapEl.getBoundingClientRect();
        const pointer = this.screenToGraph(ev.clientX, ev.clientY, wrapRect);
        const scale = Math.max(0.0001, Number(this.view?.scale || 1));
        const dragged = [];
        const candidateIds = this.selectedNodeIds.has(nodeId)
            ? Array.from(this.selectedNodeIds)
            : [nodeId];
        for (const id of candidateIds) {
            const nodeEl = this.nodeElements.get(id);
            if (!(nodeEl instanceof HTMLElement)) continue;
            const rect = nodeEl.getBoundingClientRect();
            dragged.push({
                id,
                el: nodeEl,
                startX: Number.parseFloat(nodeEl.style.left) || 0,
                startY: Number.parseFloat(nodeEl.style.top) || 0,
                width: rect.width / scale,
                height: rect.height / scale,
                system: this.isSystemNodeId(id)
            });
        }
        if (!dragged.length) return;
        this.dragState = {
            pointerId: ev.pointerId,
            anchorX: pointer.x,
            anchorY: pointer.y,
            moved: false,
            nodes: dragged,
            positions: new Map(dragged.map((item) => [item.id, { x: item.startX, y: item.startY }]))
        };
        ev.preventDefault();
    }

    onOutputHandlePointerDown(ev) {
        if (ev.button !== 0) return;
        this.closeContextMenu();
        this.clearInputHandleHold();
        const handle = ev.currentTarget;
        if (!(handle instanceof HTMLElement)) return;
        const fromNode = String(handle.dataset.nodeId || "");
        const fromSlot = Number(handle.dataset.slot || 0);
        const center = this.getHandleCenter(fromNode, "out", fromSlot);
        if (!center) return;
        this.beginConnectionFrom(fromNode, fromSlot, center, ev.clientX, ev.clientY);
        ev.stopPropagation();
        ev.preventDefault();
    }

    clearInputHandleHold() {
        if (!this.inputHoldState) return;
        if (this.inputHoldState.timer) {
            clearTimeout(this.inputHoldState.timer);
        }
        this.inputHoldState = null;
    }

    onInputHandlePointerDown(ev) {
        if (ev.button !== 0) return;
        const handle = ev.currentTarget;
        if (!(handle instanceof HTMLElement)) return;
        this.clearInputHandleHold();
        if (this.connectState) return;

        const toNode = String(handle.dataset.nodeId || "");
        const toSlot = Number(handle.dataset.slot || 0);
        if (!toNode) return;

        const links = Array.isArray(this.store.getState()?.post?.links) ? this.store.getState().post.links : [];
        const targetLink = links.find((l) => String(l?.toNode || "") === toNode && Number(l?.toSlot || 0) === toSlot);
        if (!targetLink) return;

        const sx = ev.clientX;
        const sy = ev.clientY;
        const hold = {
            handle,
            toNode,
            toSlot,
            triggered: false,
            timer: 0
        };

        hold.timer = setTimeout(() => {
            const fromNode = String(targetLink.fromNode || "");
            const fromSlot = Number(targetLink.fromSlot || 0);
            if (!fromNode) return;
            const start = this.getHandleCenter(fromNode, "out", fromSlot);
            if (!start) return;

            hold.triggered = true;
            this.selectedLinkIds.clear();
            if (targetLink.id) this.selectedLinkIds.add(targetLink.id);
            this.callbacks.onDeleteLink(targetLink.id, { silent: true });
            this.beginConnectionFrom(fromNode, fromSlot, start, sx, sy);
        }, LINK_HOLD_REWIRE_MS);

        this.inputHoldState = hold;
        ev.preventDefault();
        ev.stopPropagation();
    }

    onInputHandlePointerCancel(ev) {
        const handle = ev?.currentTarget;
        if (!(handle instanceof HTMLElement)) {
            this.clearInputHandleHold();
            return;
        }
        if (this.inputHoldState?.handle === handle && !this.inputHoldState.triggered) {
            this.clearInputHandleHold();
        }
    }

    onInputHandlePointerUp(ev) {
        const handle = ev.currentTarget;
        if (!(handle instanceof HTMLElement)) return;

        if (this.inputHoldState?.handle === handle) {
            const triggered = !!this.inputHoldState.triggered;
            this.clearInputHandleHold();
            if (triggered) {
                ev.preventDefault();
                ev.stopPropagation();
                return;
            }
        }

        if (!this.connectState) return;
        const toNode = String(handle.dataset.nodeId || "");
        const toSlot = Number(handle.dataset.slot || 0);
        this.finalizeConnection(toNode, toSlot);
        ev.preventDefault();
        ev.stopPropagation();
    }

    getHandleCenter(nodeId, kind, slot) {
        const nodeEl = this.nodeElements.get(String(nodeId || ""));
        if (!nodeEl) return null;
        const selector = `.handle.${kind}[data-slot="${Number(slot || 0)}"]`;
        const handle = nodeEl.querySelector(selector);
        if (!(handle instanceof HTMLElement)) return null;
        const wrapRect = this.wrapEl.getBoundingClientRect();
        const r = handle.getBoundingClientRect();
        return {
            x: r.left - wrapRect.left + r.width * 0.5,
            y: r.top - wrapRect.top + r.height * 0.5
        };
    }

    beginConnectionFrom(fromNode, fromSlot, start, pointerX = null, pointerY = null) {
        this.clearTemporaryConnection();
        if (!fromNode) return;

        this.connectState = {
            fromNode: String(fromNode),
            fromSlot: Number(fromSlot || 0),
            start,
            pathEl: null,
            snapTarget: null
        };

        const tempPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
        tempPath.setAttribute("class", "graph-line");
        tempPath.setAttribute("d", cubicPath(start, start));
        this.linesEl.appendChild(tempPath);
        this.connectState.pathEl = tempPath;

        if (Number.isFinite(pointerX) && Number.isFinite(pointerY)) {
            this.onPointerMove({ clientX: pointerX, clientY: pointerY });
        }
    }

    clearSnapHandle() {
        if (this.connectState?.snapTarget?.handle instanceof HTMLElement) {
            this.connectState.snapTarget.handle.classList.remove("snap-target");
        }
        if (this.connectState) this.connectState.snapTarget = null;
    }

    setSnapHandle(target) {
        if (!this.connectState) return;
        const prev = this.connectState.snapTarget?.handle;
        if (prev instanceof HTMLElement && prev !== target?.handle) {
            prev.classList.remove("snap-target");
        }

        if (target?.handle instanceof HTMLElement) {
            target.handle.classList.add("snap-target");
            this.connectState.snapTarget = target;
        } else {
            this.connectState.snapTarget = null;
        }
    }

    findNearestInputHandle(point, radius = SNAP_RADIUS_PX) {
        if (!point) return null;
        let best = null;
        let bestD2 = radius * radius;
        const candidates = this.wrapEl.querySelectorAll(".handle.in");
        const wrapRect = this.wrapEl.getBoundingClientRect();

        candidates.forEach((el) => {
            if (!(el instanceof HTMLElement)) return;
            const toNode = String(el.dataset.nodeId || "");
            const toSlot = Number(el.dataset.slot || 0);
            if (!toNode) return;
            if (toNode === this.connectState?.fromNode) return;

            const r = el.getBoundingClientRect();
            const cx = r.left - wrapRect.left + r.width * 0.5;
            const cy = r.top - wrapRect.top + r.height * 0.5;
            const dx = cx - point.x;
            const dy = cy - point.y;
            const d2 = dx * dx + dy * dy;
            if (d2 > bestD2) return;
            best = {
                handle: el,
                nodeId: toNode,
                slot: toSlot,
                x: cx,
                y: cy
            };
            bestD2 = d2;
        });

        return best;
    }

    finalizeConnection(toNode, toSlot) {
        if (!this.connectState) return;
        const fromNode = String(this.connectState.fromNode || "");
        const fromSlot = Number(this.connectState.fromSlot || 0);
        this.clearTemporaryConnection();
        if (!fromNode || !toNode || fromNode === toNode) return;
        this.callbacks.onCreateLink({ fromNode, fromSlot, toNode, toSlot });
    }

    clearTemporaryConnection() {
        this.clearSnapHandle();
        if (this.connectState?.pathEl && this.connectState.pathEl.parentNode) {
            this.connectState.pathEl.parentNode.removeChild(this.connectState.pathEl);
        }
        this.connectState = null;
    }

    onPointerMove(ev) {
        if (this.boxSelectState) {
            const wrapRect = this.wrapEl.getBoundingClientRect();
            this.boxSelectState.currentX = ev.clientX - wrapRect.left;
            this.boxSelectState.currentY = ev.clientY - wrapRect.top;
            this.updateSelectionRectEl(this.boxSelectState);
            return;
        }

        if (this.panState) {
            this.view.offsetX = this.panState.startOffsetX + (ev.clientX - this.panState.startClientX);
            this.view.offsetY = this.panState.startOffsetY + (ev.clientY - this.panState.startClientY);
            this.applyViewTransform();
            this.drawLinks(this.store.getState());
            return;
        }

        if (this.dragState) {
            const wrapRect = this.wrapEl.getBoundingClientRect();
            const pointer = this.screenToGraph(ev.clientX, ev.clientY, wrapRect);
            const dx = pointer.x - this.dragState.anchorX;
            const dy = pointer.y - this.dragState.anchorY;
            if (!this.dragState.moved && (Math.abs(dx) >= 1 || Math.abs(dy) >= 1)) {
                this.dragState.moved = true;
            }

            for (const item of this.dragState.nodes) {
                const rawX = item.startX + dx;
                const rawY = item.startY + dy;
                const pos = clampNodePosInView(rawX, rawY, wrapRect, this.view, item.width, item.height);
                this.dragState.positions.set(item.id, pos);
                item.el.style.left = `${Math.round(pos.x)}px`;
                item.el.style.top = `${Math.round(pos.y)}px`;
                if (item.system) {
                    this.systemNodePositions[item.id] = { x: pos.x, y: pos.y };
                    if (this.dragState.moved) this.systemNodeUserMoved[item.id] = true;
                }
            }
            this.drawLinks(this.store.getState());
            return;
        }

        if (this.connectState?.pathEl) {
            const wrapRect = this.wrapEl.getBoundingClientRect();
            const pointer = {
                x: ev.clientX - wrapRect.left,
                y: ev.clientY - wrapRect.top
            };
            const snap = this.findNearestInputHandle(pointer);
            this.setSnapHandle(snap);
            const end = snap
                ? { x: snap.x, y: snap.y }
                : pointer;
            this.connectState.pathEl.setAttribute("d", cubicPath(this.connectState.start, end));
        }
    }

    onPointerUp(ev) {
        this.clearInputHandleHold();

        if (this.boxSelectState) {
            this.endBoxSelection();
        }

        if (this.panState) {
            if (typeof this.wrapEl.releasePointerCapture === "function") {
                try {
                    this.wrapEl.releasePointerCapture(this.panState.pointerId);
                } catch {}
            }
            this.panState = null;
            this.wrapEl.classList.remove("panning");
        }
        if (this.dragState) {
            const movedRegular = [];
            const movedSystem = [];
            if (this.dragState.moved) {
                for (const item of this.dragState.nodes) {
                    const pos = this.dragState.positions.get(item.id);
                    if (!pos) continue;
                    if (item.system) {
                        this.systemNodePositions[item.id] = { x: pos.x, y: pos.y };
                        this.systemNodeUserMoved[item.id] = true;
                        movedSystem.push({
                            id: item.id,
                            x: pos.x,
                            y: pos.y,
                            userMoved: true
                        });
                        continue;
                    }
                    movedRegular.push({
                        id: item.id,
                        x: Math.round(pos.x),
                        y: Math.round(pos.y)
                    });
                }
                if (movedRegular.length) {
                    if (typeof this.callbacks.onMoveNodes === "function") {
                        this.callbacks.onMoveNodes(movedRegular);
                    } else {
                        for (const move of movedRegular) {
                            this.callbacks.onMoveNode(move.id, move.x, move.y);
                        }
                    }
                }
                if (movedSystem.length && typeof this.callbacks.onMoveSystemNodes === "function") {
                    this.callbacks.onMoveSystemNodes(movedSystem);
                }
            }
            this.dragState = null;
        }
        if (this.connectState) {
            const snap = this.connectState.snapTarget;
            if (snap?.nodeId) {
                this.finalizeConnection(String(snap.nodeId), Number(snap.slot || 0));
                return;
            }
            this.clearTemporaryConnection();
        }
    }

    collectHandlePositions() {
        const map = new Map();
        const wrapRect = this.wrapEl.getBoundingClientRect();

        for (const [id, nodeEl] of this.nodeElements.entries()) {
            const inputs = new Map();
            const outputs = new Map();

            const inHandles = nodeEl.querySelectorAll(".handle.in");
            const outHandles = nodeEl.querySelectorAll(".handle.out");

            inHandles.forEach((h) => {
                const slot = Number(h.dataset.slot || 0);
                const r = h.getBoundingClientRect();
                inputs.set(slot, {
                    x: r.left - wrapRect.left + r.width * 0.5,
                    y: r.top - wrapRect.top + r.height * 0.5
                });
            });

            outHandles.forEach((h) => {
                const slot = Number(h.dataset.slot || 0);
                const r = h.getBoundingClientRect();
                outputs.set(slot, {
                    x: r.left - wrapRect.left + r.width * 0.5,
                    y: r.top - wrapRect.top + r.height * 0.5
                });
            });

            map.set(id, { in: inputs, out: outputs });
        }

        return map;
    }

    drawLinks(state) {
        const rect = this.wrapEl.getBoundingClientRect();
        this.linesEl.setAttribute("viewBox", `0 0 ${Math.max(1, rect.width)} ${Math.max(1, rect.height)}`);
        this.linesEl.setAttribute("width", `${Math.max(1, rect.width)}`);
        this.linesEl.setAttribute("height", `${Math.max(1, rect.height)}`);

        const tempPath = this.connectState?.pathEl || null;
        this.linesEl.innerHTML = "";
        if (tempPath) this.linesEl.appendChild(tempPath);
        this.linkMetaById.clear();

        const positions = this.collectHandlePositions();
        for (const link of state.post.links || []) {
            const fromNode = positions.get(link.fromNode);
            const toNode = positions.get(link.toNode);
            const from = fromNode?.out?.get(Number(link.fromSlot || 0));
            const to = toNode?.in?.get(Number(link.toSlot || 0));
            if (!from || !to) continue;

            const d = cubicPath(from, to);
            const dx = Math.max(48, Math.abs(to.x - from.x) * 0.45);
            const c1x = from.x + dx;
            const c2x = to.x - dx;
            this.linkMetaById.set(String(link.id || ""), {
                from,
                to,
                bbox: {
                    left: Math.min(from.x, to.x, c1x, c2x),
                    right: Math.max(from.x, to.x, c1x, c2x),
                    top: Math.min(from.y, to.y),
                    bottom: Math.max(from.y, to.y)
                }
            });
            const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
            path.setAttribute("d", d);
            path.setAttribute("class", `graph-line${this.selectedLinkIds.has(link.id) ? " selected" : ""}`);
            path.dataset.linkId = link.id;
            path.style.pointerEvents = "none";
            this.linesEl.appendChild(path);

            const hitPath = document.createElementNS("http://www.w3.org/2000/svg", "path");
            hitPath.setAttribute("d", d);
            hitPath.setAttribute("class", "graph-line-hit");
            hitPath.dataset.linkId = link.id;
            let holdTimer = 0;
            let holdTriggered = false;
            let suppressClick = false;

            const clearHold = () => {
                if (holdTimer) {
                    clearTimeout(holdTimer);
                    holdTimer = 0;
                }
            };

            const beginRewire = (clientX, clientY) => {
                holdTriggered = true;
                suppressClick = true;
                this.callbacks.onDeleteLink(link.id, { silent: true });
                this.selectedLinkIds.delete(link.id);
                this.drawLinks(this.store.getState());

                this.beginConnectionFrom(
                    String(link.fromNode || ""),
                    Number(link.fromSlot || 0),
                    { x: from.x, y: from.y },
                    clientX,
                    clientY
                );
            };

            hitPath.addEventListener("pointerdown", (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                this.closeContextMenu();
                holdTriggered = false;
                clearHold();
                const sx = ev.clientX;
                const sy = ev.clientY;
                holdTimer = setTimeout(() => {
                    beginRewire(sx, sy);
                }, LINK_HOLD_REWIRE_MS);
            });

            hitPath.addEventListener("pointerup", (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                clearHold();
            });

            hitPath.addEventListener("pointercancel", () => {
                clearHold();
            });

            hitPath.addEventListener("pointerleave", () => {
                if (!holdTriggered) clearHold();
                path.classList.remove("focused");
            });

            hitPath.addEventListener("pointerenter", () => {
                path.classList.add("focused");
            });

            hitPath.addEventListener("click", (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                if (suppressClick) {
                    suppressClick = false;
                    return;
                }
                const additive = !!(ev.shiftKey || ev.ctrlKey || ev.metaKey);
                this.selectedNodeIds.clear();
                if (!additive) this.selectedLinkIds.clear();
                if (additive) {
                    if (this.selectedLinkIds.has(link.id)) this.selectedLinkIds.delete(link.id);
                    else this.selectedLinkIds.add(link.id);
                } else {
                    this.selectedLinkIds.add(link.id);
                }
                this.updateSelectionClasses();
                this.drawLinks(this.store.getState());
            });

            hitPath.addEventListener("dblclick", (ev) => {
                ev.preventDefault();
                ev.stopPropagation();
                clearHold();
                this.callbacks.onDeleteLink(link.id);
                this.selectedLinkIds.delete(link.id);
            });

            this.linesEl.appendChild(hitPath);
        }
    }

    render() {
        const state = this.store.getState();
        this.syncSystemNodesFromState(state);
        const system = this.getSystemNodeLayout();
        this.canvasEl.innerHTML = "";
        this.nodeElements.clear();
        const validNodeIds = new Set([GRAPH_INPUT_ID, GRAPH_OUTPUT_ID]);
        for (const node of state.post.nodes || []) validNodeIds.add(String(node.id || ""));
        for (const id of Array.from(this.selectedNodeIds)) {
            if (!validNodeIds.has(id)) this.selectedNodeIds.delete(id);
        }
        if (!this.initialSelectionSynced && !this.selectedNodeIds.size && state.selectedNodeId
            && (state.post.nodes || []).some((n) => n.id === state.selectedNodeId)) {
            this.selectedNodeIds.add(String(state.selectedNodeId));
        }
        const validLinkIds = new Set((state.post.links || []).map((l) => String(l?.id || "")).filter(Boolean));
        for (const id of Array.from(this.selectedLinkIds)) {
            if (!validLinkIds.has(id)) this.selectedLinkIds.delete(id);
        }

        const inputNode = { id: GRAPH_INPUT_ID, name: "Input", type: "System", ...system[GRAPH_INPUT_ID] };
        const outputNode = { id: GRAPH_OUTPUT_ID, name: "Output", type: "System", ...system[GRAPH_OUTPUT_ID] };

        const inputEl = this.buildNodeElement(inputNode, { system: true, selected: this.selectedNodeIds.has(GRAPH_INPUT_ID) });
        const outputEl = this.buildNodeElement(outputNode, { system: true, selected: this.selectedNodeIds.has(GRAPH_OUTPUT_ID) });
        this.canvasEl.appendChild(inputEl);
        this.canvasEl.appendChild(outputEl);
        this.nodeElements.set(inputNode.id, inputEl);
        this.nodeElements.set(outputNode.id, outputEl);

        for (const node of state.post.nodes || []) {
            const nodeEl = this.buildNodeElement(node, { system: false, selected: this.selectedNodeIds.has(node.id) });
            this.canvasEl.appendChild(nodeEl);
            this.nodeElements.set(node.id, nodeEl);
        }

        this.updateSelectionClasses();
        this.applyViewTransform();
        this.drawLinks(state);
        this.initialSelectionSynced = true;
    }

    autoLayout() {
        const state = this.store.getState();
        const nodes = state.post.nodes || [];
        const links = Array.isArray(state.post?.links) ? state.post.links : [];
        if (!nodes.length) {
            this.render();
            return;
        }

        const nodeMap = new Map(nodes.map((n) => [String(n.id), n]));
        const outgoing = new Map();
        const incoming = new Map();
        for (const id of nodeMap.keys()) {
            outgoing.set(id, []);
            incoming.set(id, []);
        }
        outgoing.set(GRAPH_INPUT_ID, []);

        for (const link of links) {
            const fromNode = String(link?.fromNode || "");
            const toNode = String(link?.toNode || "");
            if (!fromNode || !toNode) continue;
            if (toNode !== GRAPH_OUTPUT_ID && !nodeMap.has(toNode)) continue;
            if (fromNode !== GRAPH_INPUT_ID && !nodeMap.has(fromNode)) continue;

            if (!outgoing.has(fromNode)) outgoing.set(fromNode, []);
            outgoing.get(fromNode).push({
                toNode,
                fromSlot: Number(link?.fromSlot || 0),
                toSlot: Number(link?.toSlot || 0)
            });
            if (incoming.has(toNode)) {
                incoming.get(toNode).push({
                    fromNode,
                    fromSlot: Number(link?.fromSlot || 0),
                    toSlot: Number(link?.toSlot || 0)
                });
            }
        }

        const reachable = new Set();
        const queueReach = [GRAPH_INPUT_ID];
        for (let i = 0; i < queueReach.length; i += 1) {
            const cur = queueReach[i];
            for (const edge of outgoing.get(cur) || []) {
                const toNode = String(edge.toNode || "");
                if (!nodeMap.has(toNode) || reachable.has(toNode)) continue;
                reachable.add(toNode);
                queueReach.push(toNode);
            }
        }

        const indeg = new Map();
        for (const id of reachable) {
            let v = 0;
            for (const edge of incoming.get(id) || []) {
                if (edge.fromNode === GRAPH_INPUT_ID || reachable.has(edge.fromNode)) v += 1;
            }
            indeg.set(id, v);
        }

        const queue = Array.from(reachable)
            .filter((id) => (indeg.get(id) || 0) <= 0)
            .sort((a, b) => {
                const ay = Number(nodeMap.get(a)?.y || 0);
                const by = Number(nodeMap.get(b)?.y || 0);
                if (ay !== by) return ay - by;
                return String(a).localeCompare(String(b));
            });

        const order = [];
        while (queue.length) {
            const cur = queue.shift();
            if (!cur) continue;
            order.push(cur);
            for (const edge of outgoing.get(cur) || []) {
                const toNode = String(edge.toNode || "");
                if (!reachable.has(toNode)) continue;
                const next = (indeg.get(toNode) || 0) - 1;
                indeg.set(toNode, next);
                if (next <= 0) queue.push(toNode);
            }
        }
        for (const id of reachable) {
            if (!order.includes(id)) order.push(id);
        }

        const layer = new Map();
        for (const id of order) {
            let lv = 1;
            for (const edge of incoming.get(id) || []) {
                if (edge.fromNode === GRAPH_INPUT_ID) {
                    lv = Math.max(lv, 1);
                } else if (layer.has(edge.fromNode)) {
                    lv = Math.max(lv, (layer.get(edge.fromNode) || 1) + 1);
                }
            }
            layer.set(id, lv);
        }

        const placed = new Set(order);
        const extras = nodes
            .map((n) => String(n.id || ""))
            .filter((id) => id && !placed.has(id))
            .sort((a, b) => {
                const ay = Number(nodeMap.get(a)?.y || 0);
                const by = Number(nodeMap.get(b)?.y || 0);
                if (ay !== by) return ay - by;
                return String(a).localeCompare(String(b));
            });

        const maxLayer = Math.max(1, ...Array.from(layer.values()));
        for (let i = 0; i < extras.length; i += 1) {
            layer.set(extras[i], maxLayer + 1 + Math.floor(i / 4));
            order.push(extras[i]);
        }

        const columns = new Map();
        for (const id of order) {
            const col = Math.max(1, Number(layer.get(id) || 1));
            if (!columns.has(col)) columns.set(col, []);
            columns.get(col).push(id);
        }

        const xGap = NODE_WIDTH + 44;
        const nodeGapY = 18;
        const sys = this.getSystemNodeLayout();
        const inputPos = sys[GRAPH_INPUT_ID] || { x: 12, y: 40 };
        const startX = Math.round(Number(inputPos.x || 12) + NODE_WIDTH + 64);
        const startY = Math.max(24, Math.round(Number(inputPos.y || 40) - 140));
        const sortedCols = Array.from(columns.keys()).sort((a, b) => a - b);
        const rowByNode = new Map();
        const layoutMoves = [];

        const renderedHeightById = new Map();
        for (const id of nodeMap.keys()) {
            const el = this.nodeElements.get(id);
            if (!(el instanceof HTMLElement)) continue;
            const h = Number(el.getBoundingClientRect().height || 0);
            if (Number.isFinite(h) && h > 0) {
                renderedHeightById.set(id, Math.ceil(h));
            }
        }

        const estimateNodeHeight = (id) => {
            const rendered = Number(renderedHeightById.get(id) || 0);
            if (rendered > 0) return rendered;
            const node = nodeMap.get(id);
            const params = Array.isArray(node?.params) ? node.params.length : 0;
            return 258 + params * 62;
        };

        for (const col of sortedCols) {
            const colNodes = columns.get(col) || [];
            colNodes.sort((a, b) => {
                const scoreNode = (id) => {
                    const ins = incoming.get(id) || [];
                    const refs = [];
                    for (const edge of ins) {
                        const fromNode = String(edge.fromNode || "");
                        if (fromNode === GRAPH_INPUT_ID) {
                            refs.push(startY + Number(edge.toSlot || 0) * 22);
                            continue;
                        }
                        if (rowByNode.has(fromNode)) refs.push(Number(rowByNode.get(fromNode) || 0));
                    }
                    if (!refs.length) return startY + Number(order.indexOf(id)) * 120;
                    return refs.reduce((acc, v) => acc + v, 0) / refs.length;
                };
                const sa = scoreNode(a);
                const sb = scoreNode(b);
                if (sa !== sb) return sa - sb;
                return String(a).localeCompare(String(b));
            });

            let yCursor = startY;
            for (const id of colNodes) {
                const h = estimateNodeHeight(id);
                const y = Math.round(yCursor);
                rowByNode.set(id, y + h * 0.5);
                layoutMoves.push({
                    id,
                    x: startX + (col - 1) * xGap,
                    y
                });
                yCursor += h + nodeGapY;
            }
        }
        if (layoutMoves.length) {
            if (typeof this.callbacks.onMoveNodes === "function") {
                this.callbacks.onMoveNodes(layoutMoves);
            } else {
                for (const move of layoutMoves) {
                    this.callbacks.onMoveNode(move.id, move.x, move.y, { silentRender: true });
                }
            }
        }
        this.render();
    }
}
