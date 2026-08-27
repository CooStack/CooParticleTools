export function createNodeHelpers(options = {}) {
    const { KIND, uid, getDefaultMirrorPlane } = options;
    const makeId = (typeof uid === "function")
        ? uid
        : () => (Math.random().toString(16).slice(2) + Date.now().toString(16)).slice(0, 16);

    function makeNode(kind, init = {}) {
        const def = KIND ? KIND[kind] : null;
        const n = {
            id: makeId(),
            kind,
            folded: false,
            collapsed: false,
            bodyHeight: null,
            subWidth: null,
            subHeight: null,
            params: JSON.parse(JSON.stringify(def?.defaultParams || {})),
            children: [],
            terms: [],
            ...init
        };
        if (init.params) Object.assign(n.params, init.params);
        if (init.folded !== undefined) n.folded = !!init.folded;
        return n;
    }

    function cloneNodeDeep(node) {
        const raw = JSON.parse(JSON.stringify(node || {}));
        const reId = (n) => {
            n.id = makeId();
            if (Array.isArray(n.terms)) {
                for (const t of n.terms) {
                    if (t && typeof t === "object") t.id = makeId();
                }
            }
            if (Array.isArray(n.children)) {
                for (const c of n.children) reId(c);
            }
        };
        reId(raw);
        return raw;
    }

    function cloneNodeListDeep(list) {
        return (list || []).map(n => cloneNodeDeep(n));
    }

    function replaceListContents(listRef, newItems) {
        if (!Array.isArray(listRef)) return;
        listRef.splice(0, listRef.length, ...(newItems || []));
    }

    function mirrorPointByPlane(p, planeKey) {
        const fallbackPlane = (typeof getDefaultMirrorPlane === "function") ? getDefaultMirrorPlane() : "XZ";
        const plane = planeKey || fallbackPlane || "XZ";
        if (plane === "XY") return {x: p.x, y: p.y, z: -p.z};
        if (plane === "ZY") return {x: -p.x, y: p.y, z: p.z};
        return {x: p.x, y: -p.y, z: p.z};
    }

    function mirrorCopyNode(node, planeKey) {
        if (!node || !node.kind) return null;
        const cloned = cloneNodeDeep(node);
        if (node.kind === "add_line") {
            const s = mirrorPointByPlane({x: node.params.sx, y: node.params.sy, z: node.params.sz}, planeKey);
            const e = mirrorPointByPlane({x: node.params.ex, y: node.params.ey, z: node.params.ez}, planeKey);
            cloned.params.sx = s.x; cloned.params.sy = s.y; cloned.params.sz = s.z;
            cloned.params.ex = e.x; cloned.params.ey = e.y; cloned.params.ez = e.z;
            return cloned;
        }
        if (node.kind === "add_fill_triangle") {
            const p1 = mirrorPointByPlane({x: node.params.p1x, y: node.params.p1y, z: node.params.p1z}, planeKey);
            const p2 = mirrorPointByPlane({x: node.params.p2x, y: node.params.p2y, z: node.params.p2z}, planeKey);
            const p3 = mirrorPointByPlane({x: node.params.p3x, y: node.params.p3y, z: node.params.p3z}, planeKey);
            cloned.params.p1x = p1.x; cloned.params.p1y = p1.y; cloned.params.p1z = p1.z;
            cloned.params.p2x = p2.x; cloned.params.p2y = p2.y; cloned.params.p2z = p2.z;
            cloned.params.p3x = p3.x; cloned.params.p3y = p3.y; cloned.params.p3z = p3.z;
            return cloned;
        }
        if (node.kind === "add_bezier_4") {
            const s = mirrorPointByPlane({x: node.params.sx, y: node.params.sy, z: node.params.sz}, planeKey);
            const e = mirrorPointByPlane({x: node.params.ex, y: node.params.ey, z: node.params.ez}, planeKey);
            const sh = mirrorPointByPlane({x: node.params.shx, y: node.params.shy, z: node.params.shz}, planeKey);
            const eh = mirrorPointByPlane({x: node.params.ehx, y: node.params.ehy, z: node.params.ehz}, planeKey);
            cloned.params.sx = s.x; cloned.params.sy = s.y; cloned.params.sz = s.z;
            cloned.params.ex = e.x; cloned.params.ey = e.y; cloned.params.ez = e.z;
            cloned.params.shx = sh.x; cloned.params.shy = sh.y; cloned.params.shz = sh.z;
            cloned.params.ehx = eh.x; cloned.params.ehy = eh.y; cloned.params.ehz = eh.z;
            return cloned;
        }
        if (node.kind === "add_bezier_curve") {
            const e = mirrorPointByPlane({x: node.params.ex, y: node.params.ey, z: node.params.ez}, planeKey);
            const sh = mirrorPointByPlane({x: node.params.shx, y: node.params.shy, z: node.params.shz}, planeKey);
            const eh = mirrorPointByPlane({x: node.params.ehx, y: node.params.ehy, z: node.params.ehz}, planeKey);
            cloned.params.ex = e.x; cloned.params.ey = e.y; cloned.params.ez = e.z;
            cloned.params.shx = sh.x; cloned.params.shy = sh.y; cloned.params.shz = sh.z;
            cloned.params.ehx = eh.x; cloned.params.ehy = eh.y; cloned.params.ehz = eh.z;
            return cloned;
        }
        if (node.kind === "points_on_each_offset") {
            const v = mirrorPointByPlane({x: node.params.offX, y: node.params.offY, z: node.params.offZ}, planeKey);
            cloned.params.offX = v.x; cloned.params.offY = v.y; cloned.params.offZ = v.z;
            return cloned;
        }
        return null;
    }

    return {
        makeNode,
        cloneNodeDeep,
        cloneNodeListDeep,
        replaceListContents,
        mirrorPointByPlane,
        mirrorCopyNode
    };
}
