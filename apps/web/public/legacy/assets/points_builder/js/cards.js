import {
    isCardVisibleForBoxSelection,
    selectionRectIntersects
} from "./card-selection.js";

const EXPRESSION_VALUE_TYPES = new Set(["Int", "Long", "Float", "Double"]);
const INTEGER_ROW_LABELS = new Set([
    "count", "count1", "count2", "counts", "countW", "countH",
    "countPow",
    "totalCount", "dottedCount", "sideCount", "edgeCount", "n",
    "minCircleCount", "maxCircleCount", "preCircleCount", "preLineCount",
    "置换个数 c"
]);

function normalizeExpressionSuggestion(item) {
    if (item && typeof item === "object") {
        const value = String(item.value || item.ref || item.name || "").trim();
        const type = String(item.type || "Double").trim();
        if (!value || !EXPRESSION_VALUE_TYPES.has(type)) return null;
        return {
            value,
            type,
            label: String(item.label || "").trim(),
            numeric: item.numeric === true
        };
    }
    const value = String(item || "").trim();
    return value ? { value, type: "Double", label: "" } : null;
}

export function filterExpressionSuggestionsByType(items, valueType = "Double") {
    const expectedType = EXPRESSION_VALUE_TYPES.has(String(valueType || ""))
        ? String(valueType)
        : "Double";
    const seen = new Set();
    const result = [];
    for (const item of Array.isArray(items) ? items : []) {
        const normalized = normalizeExpressionSuggestion(item);
        if (!normalized) continue;
        const compatible = normalized.numeric
            ? (expectedType !== "Long" || normalized.long === true)
            : normalized.type === expectedType
            || normalized.type === "Int" && expectedType === "Double";
        if (!compatible || seen.has(normalized.value)) continue;
        seen.add(normalized.value);
        result.push(normalized);
    }
    return result;
}

export function filterVectorSuggestionsByType(items) {
    return (Array.isArray(items) ? items : [])
        .filter((item) => ["Vec3", "RelativeLocation"].includes(String(item?.type || "Vec3")));
}

export function expressionValueTypeForRow(label) {
    const text = String(label || "").trim();
    if (text === "seed值") return "Long";
    return INTEGER_ROW_LABELS.has(text) ? "Int" : "Double";
}

export function createCardInputs(ctx) {
    const {
        num,
        armHistoryOnFocus,
        historyCapture,
        setActiveVecTarget,
        getParamStep,
        enableExprNumbers,
        getExprSuggestions,
        getVec3VariableOptions,
        parseExprNumber,
        compareSuggestionNames,
        sortSuggestionNames,
        touchSuggestionUsage
    } = ctx || {};
    const startPointPickForVecTarget = (...args) => {
        const fn = ctx && ctx.startPointPickForVecTarget;
        return (typeof fn === "function") ? fn(...args) : false;
    };

    function countDecimalsFromString(value) {
        const text = String(value ?? "").trim().toLowerCase();
        if (!text) return 0;
        const parts = text.split("e-");
        const base = parts[0];
        const dot = base.indexOf(".");
        let dec = dot >= 0 ? (base.length - dot - 1) : 0;
        if (parts.length > 1) {
            const exp = parseInt(parts[1], 10);
            if (Number.isFinite(exp)) dec += exp;
        }
        return dec;
    }

    function formatAngleValue(value) {
        const n = Number(value);
        if (!Number.isFinite(n)) return "0";
        const fixed = Math.abs(n) < 1e-12 ? 0 : Number(n.toFixed(6));
        return String(fixed);
    }

    function normalizeAngleUnit(unit) {
        return unit === "rad" ? "rad" : "deg";
    }

    function convertAngleValue(value, fromUnit, toUnit) {
        const v = Number(value) || 0;
        const from = normalizeAngleUnit(fromUnit);
        const to = normalizeAngleUnit(toUnit);
        if (from === to) return v;
        if (from === "deg" && to === "rad") return v * Math.PI / 180;
        return v * 180 / Math.PI;
    }

    const TIP_MAP = {
        generic: {
            seed: "启用随机种子，固定结果可复现。",
            "seed值": "随机种子数值。",
            rotate: "启用整体旋转/角度偏移。",
            "rotate角度": "整体旋转角度。",
            r: "半径，决定图形大小。",
            count: "采样点数量，越大越密。",
            sampler: "采样密度，越大越密。",
            w: "宽度/尺度，影响图形横向尺寸。",
            h: "高度/尺度，影响图形纵向尺寸。",
            step: "步进间距，越小越密。",
            thickness: "环宽/厚度，决定内外差。",
            scale: "缩放倍数，>1 放大，<1 缩小。",
            height: "高度范围。",
            min: "最小偏移长度。",
            max: "最大偏移长度。",
            xOffset: "X 方向偏移。",
            zOffset: "Z 方向偏移。",
            offX: "X 方向偏移分量。",
            offY: "Y 方向偏移分量。",
            offZ: "Z 方向偏移分量。",
            countW: "宽方向采样点数量。",
            countH: "高方向采样点数量。",
            sideCount: "边数。",
            edgeCount: "每条边采样点数量。",
            n: "边数。",
            mode: "采样/噪声模式。",
            "输出形式": "Kotlin 输出方式。"
        },
        kinds: {
            fourier_term: {
                r: "该项振幅，决定这条谐波的半径大小。",
                w: "该项频率（倍频），决定波形振荡速度。",
                startAngle: "相位起始角，整体相位偏移。"
            },
            axis: {
                axis: "对称轴方向，影响旋转/指向操作。"
            },
            scale: {
                factor: "整体缩放倍数，>1 放大，<1 缩小。"
            },
            rotate_as_axis: {
                "角度": "绕当前轴旋转的角度。",
                "自定义轴": "启用自定义轴向量。",
                ax: "自定义轴 X 分量。",
                ay: "自定义轴 Y 分量。",
                az: "自定义轴 Z 分量。"
            },
            rotate_to: {
                "模式": "选择目标向量或起止点计算朝向。",
                origin: "起点坐标，用于计算朝向向量。",
                end: "终点坐标，与起点形成朝向。",
                to: "目标朝向向量（从原点指向）。"
            },
            add_point: {
                point: "点的位置坐标。"
            },
            add_line: {
                start: "线段起点坐标。",
                end: "线段终点坐标。",
                count: "线段采样点数量。"
            },
            add_dotted_line: {
                target: "从 offset 原点指向 target 的终点向量。",
                totalCount: "虚线总采样点数量。",
                dottedCount: "虚线段数量。",
                emptyStep: "每段虚线之间的空隙长度。"
            },
            add_fill_triangle: {
                p1: "三角形第一个顶点。",
                p2: "三角形第二个顶点。",
                p3: "三角形第三个顶点。",
                sampler: "三角形填充采样密度（越大越密）。"
            },
            add_circle: {
                r: "圆半径。",
                count: "圆周采样点数量。"
            },
            add_dotted_circle: {
                r: "虚线圆环半径。",
                totalCount: "虚线圆环总采样点数量。",
                dottedCount: "虚线段数量。",
                emptyStep: "每段虚线之间的空隙弧度（弧度制）。"
            },
            add_discrete_circle_xz: {
                r: "圆环半径。",
                count: "圆环采样点数量。",
                discrete: "离散间距，越大越稀疏。",
                seed: "启用随机种子（固定结果）。",
                "seed值": "随机种子数值。"
            },
            add_half_circle: {
                r: "半圆半径。",
                count: "半圆采样点数量。",
                rotate: "是否整体旋转半圆。",
                "角度": "半圆整体旋转角度。"
            },
            add_radian_center: {
                r: "弧线半径。",
                count: "弧线采样点数量。",
                radian: "弧线总角度（中心对称）。",
                rotate: "是否整体旋转弧线。",
                "rotate角度": "弧线整体旋转角度。"
            },
            add_radian: {
                r: "弧线半径。",
                count: "弧线采样点数量。",
                start: "弧线起始角。",
                end: "弧线结束角。",
                rotate: "是否整体旋转弧线。",
                "rotate角度": "弧线整体旋转角度。"
            },
            add_ball: {
                r: "球半径。",
                countPow: "旧版分辨率参数，最终点数为 countPow 的平方。",
                offset: "球面点集的中心偏移。"
            },
            add_ball_surface: {
                r: "球半径。",
                count: "球面的最终采样点数量。",
                offset: "球面点集的中心偏移。"
            },
            add_ball_solid: {
                r: "球半径。",
                count: "球体内部的最终采样点数量。",
                offset: "球体点集的中心偏移。"
            },
            add_ball_volume: {
                r: "球半径。",
                count: "球体体积内的最终采样点数量。",
                offset: "球体点集的中心偏移。"
            },
            add_cube_surface: {
                "尺寸模式": "使用等边尺寸，或分别设置长、高、深。",
                size: "等边方块的边长。",
                width: "长方体沿 X 轴的长度。",
                height: "长方体沿 Y 轴的高度。",
                depth: "长方体沿 Z 轴的深度。",
                count: "六个表面的总采样点数量，按各面面积分配。",
                offset: "方块表面点集的中心偏移。"
            },
            add_ring: {
                r: "外环半径。",
                thickness: "环宽/厚度，决定内外差。",
                count: "环面采样点数量。",
                discrete: "离散间距。"
            },
            clear_as_mask: {
                maskRange: "点遮罩距离，新点会清理范围内此前生成的旧点。"
            },
            clear_as_ball_mask: {
                origin: "球形遮罩中心，只影响当前组内此前生成的点。",
                radius: "球形遮罩半径。"
            },
            clear_as_round_xz_mask: {
                origin: "圆面遮罩中心，按 XZ 平面距离判断。",
                radius: "圆面遮罩半径。",
                yAxisRange: "Y 轴限制范围；小于等于 0 时不限制高度。"
            },
            add_rect: {
                w: "矩形宽度。",
                h: "矩形高度。",
                countW: "宽方向采样点数量。",
                countH: "高方向采样点数量。"
            },
            add_arc: {
                r: "弧线半径。",
                center: "圆心位置。",
                start: "起始角。",
                end: "结束角。",
                count: "弧线采样点数量。"
            },
            add_lightning_points: {
                useStart: "是否自定义起点。",
                start: "起点坐标（未启用则从原点开始）。",
                end: "终点向量/位置。",
                count: "折线段数量。",
                preLineCount: "每段插值点数量。",
                useOffsetRange: "启用随机偏移。",
                offsetRange: "随机偏移幅度。"
            },
            add_lightning_nodes: {
                useStart: "是否自定义起点。",
                start: "起点坐标。",
                end: "终点坐标。",
                count: "节点数量。",
                useOffsetRange: "启用随机偏移。",
                offsetRange: "随机偏移幅度。"
            },
            add_lightning_nodes_attenuation: {
                useStart: "是否自定义起点。",
                start: "起点坐标。",
                end: "终点坐标。",
                counts: "节点数量。",
                maxOffset: "最大偏移幅度。",
                attenuation: "衰减系数（越小收束更快）。",
                seed: "启用随机种子。",
                "seed值": "随机种子数值。"
            },
            add_bezier: {
                p1: "起点坐标。",
                p2: "控制点坐标（影响曲线弯曲）。",
                p3: "终点坐标。",
                count: "采样点数量。"
            },
            add_bezier_4: {
                p1: "起点坐标。",
                p2: "控制点 1。",
                p3: "控制点 2。",
                p4: "终点坐标。",
                count: "采样点数量。"
            },
            add_bezier_curve: {
                "target.x": "终点向量 X（相对起点）。",
                "target.y": "终点向量 Y（相对起点）。",
                "startHandle.x": "起点控制柄 X。",
                "startHandle.y": "起点控制柄 Y。",
                "endHandle.x": "终点控制柄 X。",
                "endHandle.y": "终点控制柄 Y。",
                count: "采样点数量。"
            },
            add_bezier_curve_multi: {
                count: "整条空间贝塞尔曲线的采样点数量。",
                point: "节点坐标。",
                startHandle: "节点出射曲柄（相对向量）。",
                endHandle: "节点入射曲柄（相对向量）。"
            },
            apply_bezier_distribution: {
                count: "路径采样点数量。",
                point: "路径节点坐标。",
                startHandle: "路径节点出射曲柄（相对向量）。",
                endHandle: "路径节点入射曲柄（相对向量）。"
            },
            add_bezier_circle_preset: {
                count: "圆周采样点数量。",
                point: "圆曲线节点坐标。",
                startHandle: "节点出射曲柄（相对向量）。",
                endHandle: "节点入射曲柄（相对向量）。"
            },
            add_broken_line: {
                p1: "起点坐标。",
                p2: "折点坐标。",
                p3: "终点坐标。",
                count1: "第一段采样点数量。",
                count2: "第二段采样点数量。"
            },
            add_polygon: {
                r: "外接圆半径。",
                sideCount: "边数。",
                count: "每条边采样点数量。"
            },
            add_polygon_in_circle: {
                n: "边数。",
                edgeCount: "每条边采样点数量。",
                r: "内接圆半径。"
            },
            add_round_shape: {
                r: "圆面半径。",
                step: "圆环步进间距，越小越密。",
                mode: "采样模式：固定 / 范围。",
                minCircleCount: "最小圆环点数量。",
                maxCircleCount: "最大圆环点数量。",
                preCircleCount: "固定模式下每圈点数量。"
            },
            apply_rotate: {
                angle: "整体旋转角度。",
                axis: "旋转轴方向。",
                rotateAsAxis: "启用自定义旋转轴。",
                rotateAxis: "自定义旋转轴向量。"
            },
            apply_move: {
                offset: "整体平移偏移量。"
            },
            apply_rel_move: {
                offset: "相对平移偏移量。"
            },
            apply_per_point_offset: {
                offset: "对每个点追加偏移量。"
            },
            apply_scale: {
                scale: "整体缩放倍数。"
            },
            apply_spiral_offset: {
                count: "螺旋采样段数量。",
                r: "螺旋半径。",
                height: "螺旋高度。",
                rotate: "是否整体旋转螺旋。",
                "rotate角度": "螺旋整体旋转角度。"
            },
            apply_random_offset: {
                min: "随机偏移最小长度。",
                max: "随机偏移最大长度。",
                seed: "启用随机种子。",
                "seed值": "随机种子数值。"
            },
            apply_noise_offset: {
                noiseX: "X 轴噪声强度。",
                noiseY: "Y 轴噪声强度。",
                noiseZ: "Z 轴噪声强度。",
                mode: "噪声分布模式。",
                seed: "启用随机种子。",
                "seed值": "随机种子数值。",
                lenMin: "启用最小偏移限制。",
                "min值": "最小偏移长度。",
                lenMax: "启用最大偏移限制。",
                "max值": "最大偏移长度。"
            },
            points_on_each_offset: {
                offX: "X 方向追加偏移分量。",
                offY: "Y 方向追加偏移分量。",
                offZ: "Z 方向追加偏移分量。",
                "输出形式": "Kotlin 输出方式。"
            },
            add_with: {
                "旋转半径 r": "复制布局半径。",
                "置换个数 c": "复制数量（围成多边形）。",
                rotateToCenter: "是否朝向中心。",
                "反向": "朝向反转。",
                "旋转偏移": "启用中心偏移。",
                "偏移": "中心偏移量。",
                "折叠子卡片": "折叠/展开子 Builder。"
            },
            add_builder: {
                offset: "子 Builder 的整体偏移量。"
            },
            add_fourier_series: {
                "折叠": "折叠/展开 term 列表。",
                angle: "整体相位旋转。",
                count: "采样点数量。"
            }
        }
    };

    let activeTipKind = null;
    function setTipKind(kind) {
        activeTipKind = kind || null;
    }

    function getTipForLabel(label) {
        const key = String(label || "").trim();
        if (!key) return "";
        if (activeTipKind && TIP_MAP.kinds[activeTipKind] && TIP_MAP.kinds[activeTipKind][key]) {
            return TIP_MAP.kinds[activeTipKind][key];
        }
        if (TIP_MAP.generic && TIP_MAP.generic[key]) return TIP_MAP.generic[key];
        return "";
    }

    function applyRowTips(editorEl, label) {
        const tip = getTipForLabel(label);
        if (!tip || !editorEl) return;
        const applyTip = (el) => {
            if (!el || el.dataset?.tipSkip) return;
            if (el.getAttribute && el.getAttribute("data-tip")) return;
            el.setAttribute && el.setAttribute("data-tip", tip);
        };
        if (editorEl.matches && editorEl.matches("input.input, select.input")) {
            applyTip(editorEl);
        }
        if (editorEl.querySelectorAll) {
            editorEl.querySelectorAll("input.input, select.input").forEach(applyTip);
        }
    }

    function row(label, editorEl) {
        const r = document.createElement("div");
        r.className = "row";
        const l = document.createElement("div");
        l.className = "label";
        l.textContent = label;
        r.appendChild(l);
        r.appendChild(editorEl);
        const expectedType = expressionValueTypeForRow(label);
        const inputs = [];
        if (editorEl.matches?.("input[data-pb-expression-input]")) inputs.push(editorEl);
        editorEl.querySelectorAll?.("input[data-pb-expression-input]").forEach((input) => inputs.push(input));
        inputs.forEach((input) => {
            if (input.dataset.pbExplicitValueType !== "1") input.dataset.pbValueType = expectedType;
        });
        applyRowTips(editorEl, label);
        return r;
    }

    function exprModeEnabled() {
        if (typeof enableExprNumbers === "function") return !!enableExprNumbers();
        return !!enableExprNumbers;
    }

    let exprSuggestEl = null;
    let exprSuggestInput = null;
    let exprSuggestItems = [];
    let exprSuggestActive = 0;
    let exprSuggestRange = { start: 0, end: 0, token: "" };
    let exprSuggestBound = false;

    function ensureExprSuggestEl() {
        if (exprSuggestEl && exprSuggestEl.isConnected) return exprSuggestEl;
        const el = document.createElement("div");
        el.className = "pb-num-suggest hidden";
        el.addEventListener("mousedown", (ev) => ev.preventDefault());
        el.addEventListener("click", (ev) => {
            const btn = ev.target instanceof HTMLElement ? ev.target.closest("button[data-idx]") : null;
            if (!btn) return;
            const idx = Number(btn.dataset.idx);
            if (!Number.isFinite(idx)) return;
            acceptExprSuggestion(idx);
        });
        document.body.appendChild(el);
        exprSuggestEl = el;
        if (!exprSuggestBound) {
            exprSuggestBound = true;
            document.addEventListener("pointerdown", (ev) => {
                if (!exprSuggestEl || exprSuggestEl.classList.contains("hidden")) return;
                const target = ev.target;
                if (target instanceof HTMLElement && (target.closest(".pb-num-suggest") || target === exprSuggestInput)) return;
                closeExprSuggestion();
            }, true);
            window.addEventListener("resize", () => closeExprSuggestion());
            window.addEventListener("scroll", () => closeExprSuggestion(), true);
        }
        return el;
    }

    function closeExprSuggestion() {
        if (!exprSuggestEl) return;
        exprSuggestEl.classList.add("hidden");
        exprSuggestEl.innerHTML = "";
        exprSuggestItems = [];
        exprSuggestInput = null;
        exprSuggestRange = { start: 0, end: 0, token: "" };
        exprSuggestActive = 0;
    }

    function escapeHtml(raw) {
        return String(raw ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll("\"", "&quot;");
    }

    function getExprTokenAtCursor(input) {
        const value = String(input?.value || "");
        const pos = Math.max(0, Number(input?.selectionStart) || 0);
        const left = value.slice(0, pos);
        const m = left.match(/(?:this@[A-Za-z_$][A-Za-z0-9_$]*\.)?[A-Za-z_$][A-Za-z0-9_$]*(?:\.[A-Za-z_$][A-Za-z0-9_$]*)*$/);
        if (!m) return { token: "", start: pos, end: pos };
        const token = String(m[0] || "");
        return { token, start: pos - token.length, end: pos };
    }

    function getExprSuggestList(input) {
        const expectedType = String(input?.dataset?.pbValueType || "Double");
        const raw = (typeof getExprSuggestions === "function") ? getExprSuggestions(expectedType) : [];
        return filterExpressionSuggestionsByType(raw, expectedType).slice(0, 300);
    }

    function renderExprSuggestionPanel() {
        const el = ensureExprSuggestEl();
        if (!exprSuggestInput || !exprSuggestItems.length) {
            closeExprSuggestion();
            return;
        }
        const token = String(exprSuggestRange.token || "");
        const head = token ? "<div class=\"pb-num-suggest-head\">" + escapeHtml(token) + "</div>" : "";
        const html = exprSuggestItems.map((item, idx) => {
            const active = idx === exprSuggestActive ? " active" : "";
            const label = item.label && item.label !== item.value ? item.label : item.type;
            return "<button type=\"button\" class=\"pb-num-suggest-item" + active + "\" data-idx=\"" + idx + "\"><span>" + escapeHtml(item.value) + "</span><small>" + escapeHtml(label) + "</small></button>";
        }).join("");
        el.innerHTML = head + html;
        el.classList.remove("hidden");

        const rect = exprSuggestInput.getBoundingClientRect();
        const vw = window.innerWidth || 1280;
        const vh = window.innerHeight || 720;
        const width = Math.min(380, Math.max(220, rect.width));
        let left = rect.left;
        let top = rect.bottom + 6;
        const panelHeight = 236;
        if (left + width > vw - 8) left = Math.max(8, vw - width - 8);
        if (top + panelHeight > vh - 8) top = Math.max(8, rect.top - panelHeight - 8);
        el.style.left = String(Math.round(left)) + "px";
        el.style.top = String(Math.round(top)) + "px";
        el.style.width = String(Math.round(width)) + "px";
    }

    function openExprSuggestion(input, force = false) {
        if (!exprModeEnabled()) return;
        if (!(input instanceof HTMLInputElement)) return;
        const info = getExprTokenAtCursor(input);
        const token = String(info.token || "");
        if (!force && !token) {
            closeExprSuggestion();
            return;
        }
        const source = getExprSuggestList(input);
        let list = source;
        if (token) {
            const lower = token.toLowerCase();
            list = source.filter((it) => String(it.value || "").toLowerCase().includes(lower));
            list = list.slice().sort((a, b) => {
                const cmp = typeof compareSuggestionNames === "function"
                    ? compareSuggestionNames(a.value, b.value, token)
                    : String(a.value || "").localeCompare(String(b.value || ""));
                return cmp;
            });
        } else if (typeof sortSuggestionNames === "function") {
            list = list.slice().sort((a, b) => {
                const sorted = sortSuggestionNames([a.value, b.value]);
                return sorted[0] === a.value ? -1 : 1;
            });
        }
        list = list.slice(0, 16);
        if (!list.length) {
            closeExprSuggestion();
            return;
        }
        exprSuggestInput = input;
        exprSuggestItems = list;
        exprSuggestRange = info;
        exprSuggestActive = 0;
        renderExprSuggestionPanel();
    }

    function moveExprSuggestion(delta) {
        if (!exprSuggestItems.length) return;
        const n = exprSuggestItems.length;
        exprSuggestActive = (exprSuggestActive + delta + n) % n;
        renderExprSuggestionPanel();
    }

    function acceptExprSuggestion(index = 0) {
        if (!(exprSuggestInput instanceof HTMLInputElement)) return;
        const idx = Math.max(0, Math.min(Number(index) || 0, exprSuggestItems.length - 1));
        const item = String(exprSuggestItems[idx]?.value || "");
        if (!item) return;
        const start = Math.max(0, Number(exprSuggestRange.start) || 0);
        const end = Math.max(start, Number(exprSuggestRange.end) || start);
        const textValue = String(exprSuggestInput.value || "");
        const next = textValue.slice(0, start) + item + textValue.slice(end);
        const caret = start + item.length;
        exprSuggestInput.value = next;
        exprSuggestInput.setSelectionRange(caret, caret);
        exprSuggestInput.dispatchEvent(new Event("input", { bubbles: true }));
        if (typeof touchSuggestionUsage === "function") touchSuggestionUsage(item);
        closeExprSuggestion();
    }

    function inputNum(value, onInput, options = {}) {
        const i = document.createElement("input");
        i.className = "input";
        const exprMode = true;
        const suggestMode = exprModeEnabled();
        const modalNavigation = !!options.modalNavigation;
        const onNavigate = typeof options.onNavigate === "function" ? options.onNavigate : null;
        i.type = "text";
        i.dataset.pbExpressionInput = "1";
        i.dataset.pbValueType = EXPRESSION_VALUE_TYPES.has(String(options.valueType || ""))
            ? String(options.valueType)
            : "Double";
        if (options.valueType) i.dataset.pbExplicitValueType = "1";
        i.inputMode = (suggestMode || modalNavigation) ? "text" : "decimal";
        const step = (typeof getParamStep === "function") ? getParamStep() : null;
        const initialValue = (value === null || value === undefined || (typeof value === "string" && value.trim() === ""))
            ? 0
            : value;
        i.value = String(initialValue);
        i.placeholder = i.placeholder || "支持变量/表达式";
        i.autocomplete = "off";
        i.spellcheck = false;
        if (modalNavigation) i.dataset.pbModalInputNavSelf = "1";
        armHistoryOnFocus && armHistoryOnFocus(i, "edit");
        i.addEventListener("keydown", (e) => {
            if (suggestMode) {
                const suggestOpen = !!exprSuggestEl
                    && !exprSuggestEl.classList.contains("hidden")
                    && exprSuggestInput === i;
                if ((e.ctrlKey || e.metaKey) && e.code === "Space") {
                    e.preventDefault();
                    openExprSuggestion(i, true);
                    return;
                }
                if (suggestOpen && e.key === "ArrowDown") {
                    e.preventDefault();
                    moveExprSuggestion(1);
                    return;
                }
                if (suggestOpen && e.key === "ArrowUp") {
                    e.preventDefault();
                    moveExprSuggestion(-1);
                    return;
                }
                if (suggestOpen && (e.key === "Enter" || e.key === "Tab")) {
                    e.preventDefault();
                    acceptExprSuggestion(exprSuggestActive);
                    return;
                }
                if (suggestOpen && e.key === "Escape") {
                    e.preventDefault();
                    closeExprSuggestion();
                    return;
                }
            }
            if (modalNavigation && (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "Enter")) {
                e.preventDefault();
                if (exprSuggestInput === i) closeExprSuggestion();
                if (onNavigate) onNavigate(e.key, i, e);
                return;
            }
            if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
            const liveStep = (typeof getParamStep === "function") ? getParamStep() : null;
            if (!Number.isFinite(liveStep) || liveStep <= 0) return;
            e.preventDefault();
            const curStr = i.value;
            const cur = typeof parseExprNumber === "function" ? parseExprNumber(curStr) : (num ? num(curStr) : Number(curStr));
            const base = Number.isFinite(cur) ? cur : 0;
            const next = base + (e.key === "ArrowUp" ? liveStep : -liveStep);
            const precision = Math.max(countDecimalsFromString(curStr), countDecimalsFromString(liveStep));
            const fixed = Number.isFinite(next) ? Number(next.toFixed(Math.min(12, precision + 2))) : next;
            i.value = String(fixed);
            i.dispatchEvent(new Event("input", { bubbles: true }));
        });
        i.addEventListener("input", () => {
            onInput(String(i.value ?? ""));
            if (suggestMode) openExprSuggestion(i, false);
        });
        if (suggestMode) {
            i.addEventListener("focus", () => openExprSuggestion(i, false));
            i.addEventListener("blur", () => setTimeout(() => {
                if (exprSuggestInput === i) closeExprSuggestion();
            }, 120));
        }
        return i;
    }

function select(options, value, onChange) {
        const s = document.createElement("select");
        s.className = "input";
        armHistoryOnFocus && armHistoryOnFocus(s, "edit");
        for (const [val, name] of options) {
            const o = document.createElement("option");
            o.value = val;
            o.textContent = name;
            if (val === value) o.selected = true;
            s.appendChild(o);
        }
        s.addEventListener("change", () => onChange(s.value));
        return s;
    }

    function checkbox(checked, onChange) {
        const wrap = document.createElement("div");
        wrap.className = "mini";
        const c = document.createElement("input");
        c.type = "checkbox";
        c.checked = !!checked;
        armHistoryOnFocus && armHistoryOnFocus(c, "edit");
        c.addEventListener("pointerdown", () => historyCapture && historyCapture("checkbox"));
        c.addEventListener("change", () => onChange(c.checked));
        wrap.appendChild(c);
        const sp = document.createElement("span");
        sp.className = "pill";
        sp.textContent = c.checked ? "启用" : "禁用";
        wrap.appendChild(sp);
        c.addEventListener("change", () => sp.textContent = c.checked ? "启用" : "禁用");
        return wrap;
    }

    function makeVec3Editor(p, prefix, onChange, label = "") {
        const box = document.createElement("div");
        box.className = "mini";
        box.style.flexDirection = "column";
        box.style.alignItems = "stretch";
        box.style.width = "100%";
        box.style.gap = "6px";
        const modeKey = `__pb_vec_mode_${prefix || "root"}`;
        const varKey = `__pb_vec_var_${prefix || "root"}`;
        const xKey = prefix + "x";
        const yKey = prefix + "y";
        const zKey = prefix + "z";
        const vecOptions = filterVectorSuggestionsByType(
            (typeof getVec3VariableOptions === "function") ? getVec3VariableOptions() : []
        );
        const getManualFallback = (key) => num(p[key]);
        const applyWholeVarBinding = (ref) => {
            const base = String(ref || "").trim();
            if (!base) return;
            p[xKey] = `${base}.x`;
            p[yKey] = `${base}.y`;
            p[zKey] = `${base}.z`;
        };
        const inferWholeVarRef = () => {
            const x = String(p[xKey] ?? "").trim();
            const y = String(p[yKey] ?? "").trim();
            const z = String(p[zKey] ?? "").trim();
            if (!x || !y || !z) return "";
            for (const option of vecOptions) {
                const ref = String(option?.ref || option?.value || option?.name || "").trim();
                if (!ref) continue;
                if (x === `${ref}.x` && y === `${ref}.y` && z === `${ref}.z`) return ref;
            }
            return "";
        };
        if (p[modeKey] !== "var" && p[modeKey] !== "manual") {
            const inferred = inferWholeVarRef();
            p[modeKey] = inferred ? "var" : "manual";
            if (inferred && !p[varKey]) p[varKey] = inferred;
        }
        if (!p[varKey]) {
            const inferred = inferWholeVarRef();
            if (inferred) p[varKey] = inferred;
        }

        const topRow = document.createElement("div");
        topRow.className = "mini";
        topRow.style.width = "100%";
        topRow.style.marginBottom = "0";
        const modeSelect = select([
            ["manual", "手动 / 分量"],
            ["var", "整向量变量"]
        ], p[modeKey] || "manual", (value) => {
            const prevMode = p[modeKey] || "manual";
            p[modeKey] = value === "var" ? "var" : "manual";
            if (p[modeKey] === "manual" && prevMode === "var") {
                p[xKey] = getManualFallback(xKey);
                p[yKey] = getManualFallback(yKey);
                p[zKey] = getManualFallback(zKey);
            }
            if (p[modeKey] === "var") {
                const ref = String(p[varKey] || inferWholeVarRef() || vecOptions[0]?.ref || vecOptions[0]?.value || "").trim();
                if (ref) {
                    p[varKey] = ref;
                    applyWholeVarBinding(ref);
                }
            }
            refreshModeView();
            onChange();
        });
        modeSelect.style.width = "160px";
        modeSelect.style.maxWidth = "100%";
        topRow.appendChild(modeSelect);
        box.appendChild(topRow);

        const varRow = document.createElement("div");
        varRow.className = "mini";
        varRow.style.flexDirection = "column";
        varRow.style.alignItems = "stretch";
        varRow.style.width = "100%";
        varRow.style.gap = "6px";
        const varInput = document.createElement("input");
        varInput.className = "input";
        varInput.type = "text";
        varInput.placeholder = "输入 Vec3 变量名";
        varInput.value = String(p[varKey] || inferWholeVarRef() || "");
        armHistoryOnFocus && armHistoryOnFocus(varInput, "edit");
        varInput.addEventListener("input", () => {
            const ref = String(varInput.value || "").trim();
            p[varKey] = ref;
            if (ref) applyWholeVarBinding(ref);
            onChange();
        });
        varInput.addEventListener("focus", () => {
            if (typeof setActiveVecTarget === "function") setActiveVecTarget(target);
        });
        varInput.style.width = "100%";
        varInput.style.minWidth = "0";
        varInput.style.flex = "1 1 auto";
        varRow.appendChild(varInput);
        if (vecOptions.length) {
            const varSelectOptions = [["", "选择变量"]].concat(vecOptions.map((option) => {
                const ref = String(option?.ref || option?.value || option?.name || "").trim();
                const type = String(option?.type || "Vec3").trim() || "Vec3";
                const labelText = String(option?.label || `${ref}（${type}）`).trim();
                return [ref, labelText];
            }));
            const varSelect = select(varSelectOptions, String(p[varKey] || inferWholeVarRef() || ""), (value) => {
                const ref = String(value || "").trim();
                p[varKey] = ref;
                varInput.value = ref;
                if (ref) applyWholeVarBinding(ref);
                onChange();
            });
            varSelect.style.width = "100%";
            varSelect.style.minWidth = "0";
            varSelect.style.flex = "1 1 auto";
            varRow.appendChild(varSelect);
            varRow.__quickPick = varSelect;
        }

        const manualRow = document.createElement("div");
        manualRow.className = "mini";
        manualRow.style.display = "grid";
        manualRow.style.gridTemplateColumns = "repeat(3, minmax(0, 1fr)) auto";
        manualRow.style.width = "100%";
        manualRow.style.gap = "6px";
        const ix = inputNum(p[xKey], v => {
            p[xKey] = v;
            onChange();
        });
        const iy = inputNum(p[yKey], v => {
            p[yKey] = v;
            onChange();
        });
        const iz = inputNum(p[zKey], v => {
            p[zKey] = v;
            onChange();
        });
        ix.style.width = iy.style.width = iz.style.width = "100%";
        ix.style.minWidth = iy.style.minWidth = iz.style.minWidth = "0";
        manualRow.appendChild(ix);
        manualRow.appendChild(iy);
        manualRow.appendChild(iz);
        const target = {
            obj: p,
            keys: {x: xKey, y: yKey, z: zKey},
            inputs: {x: ix, y: iy, z: iz},
            label: label || prefix || "vec3",
            onChange
        };
        const pickBtn = document.createElement("button");
        pickBtn.type = "button";
        pickBtn.className = "iconbtn vec3-pick-btn no-drag";
        pickBtn.title = "拾取坐标";
        pickBtn.setAttribute("aria-label", "拾取坐标");
        pickBtn.textContent = "⌖";
        pickBtn.addEventListener("pointerdown", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
        });
        pickBtn.addEventListener("click", (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            p[modeKey] = "manual";
            refreshModeView();
            if (typeof setActiveVecTarget === "function") setActiveVecTarget(target);
            startPointPickForVecTarget(target);
        });
        manualRow.appendChild(pickBtn);
        box.appendChild(varRow);
        box.appendChild(manualRow);

        const refreshModeView = () => {
            const mode = p[modeKey] || "manual";
            varRow.style.display = mode === "var" ? "flex" : "none";
            manualRow.style.display = mode === "var" ? "none" : "grid";
            modeSelect.value = mode;
            varInput.value = String(p[varKey] || inferWholeVarRef() || "");
            if (varRow.__quickPick) {
                varRow.__quickPick.value = String(p[varKey] || inferWholeVarRef() || "");
            }
        };
        refreshModeView();

        const tipBase = getTipForLabel(label) || getTipForLabel(prefix);
        if (tipBase) {
            ix.setAttribute("data-tip", `${tipBase}（X）`);
            iy.setAttribute("data-tip", `${tipBase}（Y）`);
            iz.setAttribute("data-tip", `${tipBase}（Z）`);
        }
        ix.__vecTarget = target;
        iy.__vecTarget = target;
        iz.__vecTarget = target;
        const onFocus = () => {
            if (typeof setActiveVecTarget === "function") setActiveVecTarget(target);
        };
        ix.addEventListener("focus", onFocus);
        iy.addEventListener("focus", onFocus);
        iz.addEventListener("focus", onFocus);
        return box;
    }

    let anglePiBound = false;
    function bindAnglePiClose() {
        if (anglePiBound) return;
        anglePiBound = true;
        document.addEventListener("click", (e) => {
            const target = e.target;
            if (target && target.closest && target.closest(".angle-pi")) return;
            document.querySelectorAll(".angle-pi-panel.open").forEach((panel) => {
                panel.classList.remove("open");
                const btn = panel.__toggle || panel.closest(".angle-pi")?.querySelector(".angle-pi-toggle");
                if (btn) btn.classList.remove("active");
            });
        });
    }

    function angleInput(obj, key, onChange, options = {}) {
        const wrap = document.createElement("div");
        wrap.className = "angle-control";

        const main = document.createElement("div");
        main.className = "angle-control-main";

        const unitKey = options.unitKey || `${key}Unit`;
        const unit = normalizeAngleUnit(obj[unitKey]);
        obj[unitKey] = unit;

        const input = inputNum(obj[key], v => {
            obj[key] = v;
            if (typeof onChange === "function") onChange();
        });
        input.classList.add("angle-value");
        input.dataset.angleKey = key;

        const unitSelect = select([["deg", "度"], ["rad", "弧度"]], unit, (val) => {
            const prevUnit = normalizeAngleUnit(obj[unitKey]);
            const nextUnit = normalizeAngleUnit(val);
            if (prevUnit === nextUnit) return;
            obj[unitKey] = nextUnit;
            const converted = convertAngleValue(input.value, prevUnit, nextUnit);
            input.value = formatAngleValue(converted);
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });
        unitSelect.classList.add("angle-unit");
        unitSelect.dataset.angleUnitKey = unitKey;
        unitSelect.setAttribute("data-tip", "单位切换：度 / 弧度");

        const piWrap = document.createElement("div");
        piWrap.className = "angle-pi";

        const piToggle = document.createElement("button");
        piToggle.type = "button";
        piToggle.className = "btn small angle-pi-toggle";
        piToggle.textContent = "nπ";
        piToggle.title = "n×PI 转换";

        const piPanel = document.createElement("div");
        piPanel.className = "angle-pi-panel";

        const piField = document.createElement("div");
        piField.className = "angle-pi-field";
        const piLabel = document.createElement("div");
        piLabel.className = "angle-pi-label";
        piLabel.textContent = "n×π";
        const piInput = document.createElement("input");
        piInput.className = "input angle-pi-input";
        piInput.type = "number";
        const piStep = (typeof getParamStep === "function") ? getParamStep() : null;
        piInput.step = Number.isFinite(piStep) ? String(piStep) : "0.1";
        piInput.value = "1";
        piInput.dataset.tipSkip = "1";
        piField.appendChild(piLabel);
        piField.appendChild(piInput);

        const piInfo = document.createElement("div");
        piInfo.className = "angle-pi-info";
        const degLine = document.createElement("div");
        const radLine = document.createElement("div");
        piInfo.appendChild(degLine);
        piInfo.appendChild(radLine);

        const updatePiInfo = () => {
            const n = Number(piInput.value);
            const safe = Number.isFinite(n) ? n : 0;
            const deg = safe * 180;
            const rad = safe * Math.PI;
            degLine.textContent = `角度: ${formatAngleValue(deg)}°`;
            radLine.textContent = `弧度: ${formatAngleValue(rad)}`;
        };
        updatePiInfo();
        piInput.addEventListener("input", updatePiInfo);

        const applyBtn = document.createElement("button");
        applyBtn.type = "button";
        applyBtn.className = "btn small primary angle-pi-apply";
        applyBtn.textContent = "应用";
        applyBtn.addEventListener("click", () => {
            historyCapture && historyCapture("angle_pi_apply");
            const n = Number(piInput.value);
            const safe = Number.isFinite(n) ? n : 0;
            const rad = safe * Math.PI;
            const deg = safe * 180;
            const curUnit = normalizeAngleUnit(unitSelect.value);
            const nextVal = curUnit === "rad" ? rad : deg;
            input.value = formatAngleValue(nextVal);
            input.dispatchEvent(new Event("input", { bubbles: true }));
        });

        piPanel.appendChild(piField);
        piPanel.appendChild(piInfo);
        piPanel.appendChild(applyBtn);
        piPanel.__toggle = piToggle;

        piToggle.addEventListener("click", (e) => {
            e.stopPropagation();
            document.querySelectorAll(".angle-pi-panel.open").forEach((panel) => {
                if (panel !== piPanel) {
                    panel.classList.remove("open");
                    const btn = panel.__toggle || panel.closest(".angle-pi")?.querySelector(".angle-pi-toggle");
                    if (btn) btn.classList.remove("active");
                }
            });
            const next = !piPanel.classList.contains("open");
            piPanel.classList.toggle("open", next);
            piToggle.classList.toggle("active", next);
        });
        piPanel.addEventListener("click", (e) => e.stopPropagation());
        piWrap.appendChild(piToggle);

        main.appendChild(input);
        main.appendChild(unitSelect);
        main.appendChild(piWrap);
        wrap.appendChild(main);
        wrap.appendChild(piPanel);

        bindAnglePiClose();
        return wrap;
    }

    return { row, inputNum, select, checkbox, makeVec3Editor, angleInput, setTipKind };
}

export function initCardSystem(ctx = {}) {
    const {
        KIND,
        elCardsRoot,
        row,
        inputNum,
        select,
        checkbox,
        makeVec3Editor,
        angleInput,
        setTipKind,
        historyCapture,
        rebuildPreviewAndKotlin,
        openModal,
        mirrorCopyNode,
        copyFocusedCard: copyFocusedCardAction,
        mirrorCopyFocusedCard: mirrorCopyFocusedCardAction,
        cloneNodeDeep,
        cloneNodeListDeep,
        makeNode,
        ensureAxisEverywhere,
        ensureAxisInList,
        isBuilderContainerKind,
        showToast,
        clearEmptyBuilderCards,
        pickReasonableFocusAfterDelete,
        bindCardBodyResizer,
        bindSubblockWidthResizer,
        bindSubblockHeightResizer,
        handleBuilderDrop,
        tryCopyWithBuilderIntoAddWith,
        moveNodeById,
        moveNodesByIds,
        downloadText,
        deepClone,
        fileBuilderJson,
        stopLinePick,
        startLinePick,
        stopPointPick,
        startOffsetMode,
        connectBezierClosure,
        deleteBezierNodeAt
    } = ctx;

    const getState = ctx.getState || (() => ctx.state);
    const getRenderAll = ctx.getRenderAll || (() => ctx.renderAll);
    const getFocusedNodeId = ctx.getFocusedNodeId || (() => ctx.focusedNodeId);
    const setFocusedNode = ctx.setFocusedNode || (() => {});
    const clearFocusedNodeIf = ctx.clearFocusedNodeIf || (() => {});
    const updateFocusCardUI = ctx.updateFocusCardUI || (() => {});
    const getIsRenderingCards = ctx.getIsRenderingCards || (() => false);
    const setIsRenderingCards = ctx.setIsRenderingCards || (() => {});
    const getSuppressCardFocusOutClear = ctx.getSuppressCardFocusOutClear || (() => false);
    const getMirrorPlaneInfo = ctx.getMirrorPlaneInfo || (() => ({ label: "XZ" }));
    const getMirrorPlane = ctx.getMirrorPlane || (() => "XZ");
    const getBuilderJsonTargetNode = ctx.getBuilderJsonTargetNode || (() => null);
    const setBuilderJsonTargetNode = ctx.setBuilderJsonTargetNode || (() => {});
    const getLinePickMode = ctx.getLinePickMode || (() => false);
    const getPointPickMode = ctx.getPointPickMode || (() => false);
    const getAutoSelectCompleteGroups = ctx.getAutoSelectCompleteGroups || (() => false);
    const makeUid = ctx.uid || (() => (Math.random().toString(16).slice(2) + Date.now().toString(16)).slice(0, 16));
    const renderCardParamsInline = ctx.renderCardParamsInline !== false;

    const INPUT_TIP_DELAY = 650;
    const inputTipState = { timer: 0, el: null, target: null };
    let inputTipBound = false;

    function ensureInputTipEl() {
        if (inputTipState.el) return inputTipState.el;
        const el = document.createElement("div");
        el.className = "pb-tooltip";
        el.setAttribute("role", "tooltip");
        el.style.display = "none";
        document.body.appendChild(el);
        inputTipState.el = el;
        return el;
    }

    function hideInputTip() {
        if (inputTipState.timer) {
            clearTimeout(inputTipState.timer);
            inputTipState.timer = 0;
        }
        inputTipState.target = null;
        const el = inputTipState.el;
        if (!el) return;
        el.classList.remove("show");
        el.style.display = "none";
    }

    function positionInputTip(target, el) {
        const rect = target.getBoundingClientRect();
        const margin = 10;
        const gap = 8;
        const tipRect = el.getBoundingClientRect();

        let x = rect.left + rect.width / 2 - tipRect.width / 2;
        x = Math.max(margin, Math.min(x, window.innerWidth - margin - tipRect.width));

        let y = rect.bottom + gap;
        if (y + tipRect.height + margin > window.innerHeight) {
            y = rect.top - gap - tipRect.height;
        }
        if (y < margin) y = margin;

        el.style.left = `${Math.round(x)}px`;
        el.style.top = `${Math.round(y)}px`;
    }

    function showInputTip(target, text) {
        if (!text) return;
        const el = ensureInputTipEl();
        el.textContent = text;
        el.style.display = "block";
        el.style.visibility = "hidden";
        positionInputTip(target, el);
        el.style.visibility = "visible";
        requestAnimationFrame(() => el.classList.add("show"));
    }

    function scheduleInputTip(target) {
        if (!target) return;
        const tip = String(target.getAttribute("data-tip") || "").trim();
        if (!tip) return;
        if (inputTipState.timer) clearTimeout(inputTipState.timer);
        inputTipState.target = target;
        inputTipState.timer = setTimeout(() => {
            if (inputTipState.target !== target) return;
            showInputTip(target, tip);
        }, INPUT_TIP_DELAY);
    }

    function bindInputTips() {
        if (inputTipBound) return;
        inputTipBound = true;
        document.addEventListener("mouseover", (e) => {
            const target = e.target;
            const input = target && target.closest ? target.closest(".input[data-tip]") : null;
            if (!input) return;
            scheduleInputTip(input);
        });
        document.addEventListener("mouseout", (e) => {
            const target = e.target;
            const input = target && target.closest ? target.closest(".input[data-tip]") : null;
            if (!input) return;
            if (e.relatedTarget && input.contains(e.relatedTarget)) return;
            hideInputTip();
        });
        document.addEventListener("mousedown", hideInputTip);
        window.addEventListener("scroll", hideInputTip, true);
        window.addEventListener("resize", hideInputTip);
        document.addEventListener("keydown", hideInputTip);
    }

    const renderAll = () => {
        const fn = getRenderAll();
        if (typeof fn === "function") fn();
    };

    const getVisibleEntries = (...args) => {
        const fn = ctx.getVisibleEntries ? ctx.getVisibleEntries() : ctx.getVisibleEntries;
        return typeof fn === "function" ? fn(...args) : null;
    };
    const cleanupFilterMenus = () => {
        const fn = ctx.getCleanupFilterMenus ? ctx.getCleanupFilterMenus() : ctx.cleanupFilterMenus;
        if (typeof fn === "function") fn();
    };
    const isFilterActive = (...args) => {
        const fn = ctx.getIsFilterActive ? ctx.getIsFilterActive() : ctx.isFilterActive;
        return typeof fn === "function" ? fn(...args) : false;
    };
    const findVisibleSwapIndex = (...args) => {
        const fn = ctx.getFindVisibleSwapIndex ? ctx.getFindVisibleSwapIndex() : ctx.findVisibleSwapIndex;
        return typeof fn === "function" ? fn(...args) : -1;
    };
    const swapInList = (...args) => {
        const fn = ctx.getSwapInList ? ctx.getSwapInList() : ctx.swapInList;
        if (typeof fn === "function") fn(...args);
    };
    const createFilterControls = (...args) => {
        const fn = ctx.getCreateFilterControls ? ctx.getCreateFilterControls() : ctx.createFilterControls;
        return typeof fn === "function" ? fn(...args) : null;
    };
    const createParamSyncControls = (...args) => {
        const fn = ctx.getCreateParamSyncControls ? ctx.getCreateParamSyncControls() : ctx.createParamSyncControls;
        return typeof fn === "function" ? fn(...args) : null;
    };
    const getParamSync = () => (ctx.getParamSync ? ctx.getParamSync() : ctx.paramSync);
    const isSyncSelectableEvent = (e) => {
        const fn = ctx.getIsSyncSelectableEvent ? ctx.getIsSyncSelectableEvent() : ctx.isSyncSelectableEvent;
        return typeof fn === "function" ? fn(e) : false;
    };
    const toggleSyncTarget = (node) => {
        const fn = ctx.getToggleSyncTarget ? ctx.getToggleSyncTarget() : ctx.toggleSyncTarget;
        if (typeof fn === "function") fn(node);
    };
    const setSyncTargetsByIds = (ids, options) => {
        const fn = ctx.getSetSyncTargetsByIds ? ctx.getSetSyncTargetsByIds() : ctx.setSyncTargetsByIds;
        return (typeof fn === "function") ? fn(ids, options) : [];
    };
    const notifyCardSelectionChange = () => {
        if (typeof ctx.onCardSelectionChange === "function") ctx.onCardSelectionChange();
    };
    const findNodeContextById = (...args) => {
        const fn = ctx.findNodeContextById;
        return (typeof fn === "function") ? fn(...args) : null;
    };
    const findNodePathById = (...args) => {
        const fn = ctx.findNodePathById;
        return (typeof fn === "function") ? fn(...args) : null;
    };

    let activeScopeBuilderId = null;

    function getBuilderScopeType(node) {
        if (!node || !node.kind) return "builder";
        if (node.kind === "add_with") return "旋转嵌套组";
        if (node.kind === "with_builder") return "withBuilder";
        if (node.kind === "clear_as_mask") return "遮罩组";
        if (node.kind === "add_builder") return "添加组";
        return node.kind;
    }

    function getScopePathByBuilderId(builderId) {
        if (!builderId) return [];
        const path = findNodePathById(builderId);
        if (!Array.isArray(path) || !path.length) return [];
        return path.filter((step) => step && step.node && isBuilderContainerKind(step.node.kind));
    }

    function setActiveCardScope(builderId) {
        const nextId = getScopePathByBuilderId(builderId).length ? builderId : null;
        if (activeScopeBuilderId === nextId) return false;
        activeScopeBuilderId = nextId;
        return true;
    }

    function getCurrentCardScopeContext() {
        const state = getState();
        const rootList = state?.root?.children || [];
        const path = getScopePathByBuilderId(activeScopeBuilderId);
        const currentStep = path.length ? path[path.length - 1] : null;
        const ownerNode = currentStep ? currentStep.node : null;
        if (ownerNode && !Array.isArray(ownerNode.children)) ownerNode.children = [];
        const list = ownerNode ? ownerNode.children : rootList;
        const typeLabel = ownerNode ? getBuilderScopeType(ownerNode) : "root";
        const label = ownerNode ? `子Builder（${typeLabel}）` : "主Builder";
        const crumbs = [{ ownerId: null, label: "最外层", active: !ownerNode, typeLabel: "root" }];
        for (const step of path) {
            crumbs.push({
                ownerId: step.node.id,
                label: getBuilderScopeType(step.node),
                active: ownerNode ? step.node.id === ownerNode.id : false,
                typeLabel: getBuilderScopeType(step.node)
            });
        }
        return {
            list,
            ownerNode,
            scopeId: ownerNode ? ownerNode.id : null,
            label,
            typeLabel,
            crumbs
        };
    }

    function navigateCardScope(builderId) {
        if (!setActiveCardScope(builderId)) return false;
        renderAll();
        requestAnimationFrame(() => {
            if (elCardsRoot) elCardsRoot.scrollTop = 0;
        });
        return true;
    }

    function revealCardScopeById(nodeId) {
        if (!nodeId) return setActiveCardScope(null);
        const path = findNodePathById(nodeId);
        if (!Array.isArray(path) || !path.length) return setActiveCardScope(null);
        let nextScopeId = null;
        for (let i = path.length - 2; i >= 0; i--) {
            const step = path[i];
            if (step && step.node && isBuilderContainerKind(step.node.kind)) {
                nextScopeId = step.node.id;
                break;
            }
        }
        return setActiveCardScope(nextScopeId);
    }

    function renderScopeBar(scopeCtx) {
        const bar = document.createElement("div");
        bar.className = "pb-scope-bar";

        const crumbs = document.createElement("div");
        crumbs.className = "pb-scope-breadcrumb";
        const crumbList = Array.isArray(scopeCtx?.crumbs) ? scopeCtx.crumbs : [];
        crumbList.forEach((crumb, index) => {
            if (index > 0) {
                const sep = document.createElement("span");
                sep.className = "pb-scope-sep";
                sep.textContent = ">";
                crumbs.appendChild(sep);
            }
            if (crumb.active) {
                const current = document.createElement("span");
                current.className = "pb-scope-crumb active";
                current.textContent = crumb.label;
                crumbs.appendChild(current);
            } else {
                const btn = document.createElement("button");
                btn.type = "button";
                btn.className = "pb-scope-crumb clickable";
                btn.textContent = crumb.label;
                btn.addEventListener("click", () => {
                    navigateCardScope(crumb.ownerId || null);
                });
                crumbs.appendChild(btn);
            }
        });

        const meta = document.createElement("div");
        meta.className = "pb-scope-meta";

        const kind = document.createElement("span");
        kind.className = "pb-scope-kind";
        kind.textContent = scopeCtx?.ownerNode ? scopeCtx.typeLabel : "root";
        meta.appendChild(kind);

        const summary = document.createElement("span");
        summary.className = "pb-scope-summary";
        summary.textContent = `当前层 ${Array.isArray(scopeCtx?.list) ? scopeCtx.list.length : 0} 张卡片`;
        meta.appendChild(summary);

        bar.appendChild(crumbs);
        bar.appendChild(meta);
        return bar;
    }

    function renderBuilderScopeEntry(node) {
        const wrap = document.createElement("div");
        wrap.className = "pb-builder-entry";

        const info = document.createElement("div");
        info.className = "pb-builder-entry-info";

        const kind = document.createElement("span");
        kind.className = "pb-builder-entry-kind";
        kind.textContent = getBuilderScopeType(node);
        info.appendChild(kind);

        const summary = document.createElement("span");
        summary.className = "pb-builder-entry-summary";
        summary.textContent = `当前含 ${Array.isArray(node?.children) ? node.children.length : 0} 张卡片`;
        info.appendChild(summary);

        wrap.appendChild(info);
        wrap.dataset.builderScopeId = node && node.id ? String(node.id) : "";
        wrap.dataset.builderScopeKind = node && node.kind ? String(node.kind) : "";

        return wrap;
    }

    function getNodeDisplayName(node) {
        if (!node) return "";
        const raw = String(node.label || "").trim();
        if (raw) return raw;
        const def = KIND[node.kind];
        return (def && def.title) || getBuilderScopeType(node) || node.kind || "";
    }

    function formatNodePathLabel(nodeId) {
        const path = findNodePathById(nodeId);
        if (!Array.isArray(path) || !path.length) return "";
        return path
            .map((step) => getNodeDisplayName(step && step.node))
            .filter(Boolean)
            .join(" > ");
    }

    function beginRenameNode(nodeId, ev = null) {
        const id = String(nodeId || "").trim();
        if (!id || !elCardsRoot) return false;
        const card = elCardsRoot.querySelector(`.card[data-id="${id}"]`);
        if (!card) return false;
        const fn = card.__pbBeginRename;
        if (typeof fn !== "function") return false;
        ev?.preventDefault?.();
        ev?.stopPropagation?.();
        fn(ev);
        return true;
    }

    function iconBtn(text, onClick, danger = false) {
        const b = document.createElement("button");
        b.type = "button";
        b.className = "iconbtn" + (danger ? " danger" : "");
        b.classList.add("action-item");
        b.textContent = text;
        b.addEventListener("click", onClick);
        return b;
    }

    function chevronSvg(collapsed) {
        return `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${collapsed ? "m9 6 6 6-6 6" : "m6 9 6 6 6-6"}"/></svg>`;
    }

    function panelToolSvgIcon(name) {
        const icons = {
            builder: `
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="M3.5 7.5h6.2l1.8 2h9v8.2a2.3 2.3 0 0 1-2.3 2.3H5.8a2.3 2.3 0 0 1-2.3-2.3Z"/>
                    <path d="M3.5 7.5V6.2A2.2 2.2 0 0 1 5.7 4h4.4l1.7 1.8h5.9A2.3 2.3 0 0 1 20 8.1v1.4"/>
                    <path d="M9 15h6"/>
                </svg>
            `,
            with: `
                <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                    <path d="m12 3.5 8 4.2-8 4.2-8-4.2Z"/>
                    <path d="m4 12.3 8 4.2 8-4.2"/>
                    <path d="m4 17 8 4.2 8-4.2"/>
                    <path d="M9.2 16.5h5.6"/>
                </svg>
            `
        };
        return icons[name] || "";
    }

    function syncCollapseUIForList(list) {
        if (typeof ctx.syncCardCollapseUI !== "function") return false;
        let updated = 0;
        const visit = (arr) => {
            const nodes = arr || [];
            for (const n of nodes) {
                if (!n) continue;
                if (n.id && ctx.syncCardCollapseUI(n.id)) updated++;
                if (isBuilderContainerKind(n.kind) && Array.isArray(n.children)) {
                    visit(n.children);
                }
            }
        };
        visit(list);
        return updated > 0;
    }

    function makeCollapseAllButtons(scopeIdRef, listGetter, small = true) {
        const collapseBtn = document.createElement("button");
        collapseBtn.className = small ? "btn small" : "btn";
        collapseBtn.textContent = "折叠所有";
        collapseBtn.addEventListener("click", () => {
            const list = (typeof listGetter === "function") ? listGetter() : [];
            const scopeId = typeof scopeIdRef === "function" ? scopeIdRef() : scopeIdRef;
            if (typeof ctx.collapseAllInScope === "function") ctx.collapseAllInScope(scopeId, list);
            if (!syncCollapseUIForList(list)) renderAll();
        });

        const expandBtn = document.createElement("button");
        expandBtn.className = small ? "btn small" : "btn";
        expandBtn.textContent = "展开所有";
        expandBtn.addEventListener("click", () => {
            const list = (typeof listGetter === "function") ? listGetter() : [];
            const scopeId = typeof scopeIdRef === "function" ? scopeIdRef() : scopeIdRef;
            if (typeof ctx.expandAllInScope === "function") ctx.expandAllInScope(scopeId, list);
            if (!syncCollapseUIForList(list)) renderAll();
        });

        return { collapseBtn, expandBtn };
    }

    let moreMenuBound = false;
    let scopeRootBtn = null;
    let scopeFilterHost = null;
    let scopeFilterUi = null;
    let scopeFilterScopeKey = "__pb_scope_root__";
    let floatingToolTipEl = null;

    function ensureFloatingToolTipEl() {
        if (floatingToolTipEl && document.body.contains(floatingToolTipEl)) return floatingToolTipEl;
        const el = document.createElement("div");
        el.className = "pb-floating-tip hidden";
        document.body.appendChild(el);
        floatingToolTipEl = el;
        return el;
    }

    function hideFloatingToolTip() {
        if (floatingToolTipEl) floatingToolTipEl.classList.add("hidden");
    }

    function showFloatingToolTip(anchor) {
        if (!anchor || !anchor.dataset) return;
        const text = String(anchor.dataset.tip || "").trim();
        if (!text) return;
        const el = ensureFloatingToolTipEl();
        el.textContent = text;
        el.classList.remove("hidden");
        const a = anchor.getBoundingClientRect();
        const t = el.getBoundingClientRect();
        const gap = 8;
        const vw = window.innerWidth || document.documentElement.clientWidth || 0;
        const vh = window.innerHeight || document.documentElement.clientHeight || 0;
        let left = a.left + a.width / 2 - t.width / 2;
        let top = a.bottom + gap;
        if (left < gap) left = gap;
        if (left + t.width > vw - gap) left = Math.max(gap, vw - t.width - gap);
        if (top + t.height > vh - gap) top = Math.max(gap, a.top - t.height - gap);
        el.style.left = `${Math.round(left)}px`;
        el.style.top = `${Math.round(top)}px`;
    }

    function bindFloatingToolTips() {
        if (document.__pbFloatingToolTipsBound) return;
        document.__pbFloatingToolTipsBound = true;
        let activeAnchor = null;
        const getAnchor = (target) => target && target.closest ? target.closest(".panel-tool-icon[data-tip]") : null;
        document.addEventListener("pointerover", (ev) => {
            const anchor = getAnchor(ev.target);
            if (!anchor) return;
            activeAnchor = anchor;
            showFloatingToolTip(anchor);
        }, true);
        document.addEventListener("pointerout", (ev) => {
            if (!activeAnchor) return;
            const next = ev.relatedTarget;
            if (next && activeAnchor.contains(next)) return;
            activeAnchor = null;
            hideFloatingToolTip();
        }, true);
        document.addEventListener("focusin", (ev) => {
            const anchor = getAnchor(ev.target);
            if (!anchor) return;
            activeAnchor = anchor;
            showFloatingToolTip(anchor);
        }, true);
        document.addEventListener("focusout", (ev) => {
            const anchor = getAnchor(ev.target);
            if (!anchor || anchor !== activeAnchor) return;
            activeAnchor = null;
            hideFloatingToolTip();
        }, true);
        window.addEventListener("resize", hideFloatingToolTip);
        window.addEventListener("scroll", hideFloatingToolTip, true);
    }

    function ensureMoreMenu(actionsEl) {
        let wrap = actionsEl.querySelector(".more-wrap");
        if (wrap) return wrap;
        wrap = document.createElement("div");
        wrap.className = "more-wrap hidden";
        const btn = document.createElement("button");
        btn.className = "iconbtn more-btn";
        btn.textContent = "⋯";
        const menu = document.createElement("div");
        menu.className = "more-menu";
        wrap.appendChild(btn);
        wrap.appendChild(menu);
        actionsEl.appendChild(wrap);
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            wrap.classList.toggle("open");
        });
        menu.addEventListener("click", (e) => e.stopPropagation());
        if (!moreMenuBound) {
            moreMenuBound = true;
            document.addEventListener("click", () => {
                document.querySelectorAll(".more-wrap.open").forEach((el) => el.classList.remove("open"));
            });
        }
        return wrap;
    }

    function layoutActionOverflow() {
        const cards = document.querySelectorAll(".card-actions");
        cards.forEach((actionsEl) => {
            const wrap = ensureMoreMenu(actionsEl);
            const menu = wrap.querySelector(".more-menu");
            wrap.classList.remove("open");

            // move all items back to main row
            Array.from(menu.children).forEach((item) => {
                actionsEl.insertBefore(item, wrap);
            });
            menu.innerHTML = "";
            wrap.classList.add("hidden");

            if (actionsEl.scrollWidth <= actionsEl.clientWidth) return;
            wrap.classList.remove("hidden");

            const items = Array.from(actionsEl.querySelectorAll(".action-item")).filter((el) => !wrap.contains(el));
            const normalItems = items.filter((el) => el.dataset.keepMainAction !== "1");
            const stickyItems = items.filter((el) => el.dataset.keepMainAction === "1");
            while (actionsEl.scrollWidth > actionsEl.clientWidth && (normalItems.length || stickyItems.length)) {
                const item = normalItems.length ? normalItems.pop() : stickyItems.pop();
                menu.insertBefore(item, menu.firstChild);
            }
            if (!menu.children.length) wrap.classList.add("hidden");
        });
    }

    function initCollapseAllControls() {
        bindFloatingToolTips();
        const title = document.querySelector(".panel.left .panel-title");
        if (!title || !title.parentElement) return;
        const existingTools = title.parentElement.querySelector(".panel-tools");
        if (existingTools) {
            scopeRootBtn = existingTools.querySelector("[data-pb-scope-root='1']") || null;
            scopeFilterHost = existingTools.querySelector("[data-pb-scope-filter='1']") || null;
            return;
        }
        const tools = document.createElement("div");
        tools.className = "panel-tools";
        scopeRootBtn = document.createElement("button");
        scopeRootBtn.type = "button";
        scopeRootBtn.className = "panel-tool-icon hidden";
        scopeRootBtn.textContent = "↩";
        scopeRootBtn.dataset.tip = "回到最外层";
        scopeRootBtn.setAttribute("aria-label", "回到最外层");
        scopeRootBtn.dataset.pbScopeRoot = "1";
        scopeRootBtn.addEventListener("click", () => {
            navigateCardScope(null);
        });
        tools.appendChild(scopeRootBtn);

        const appendCleanupBtn = (kind, icon, tip, emptyMsg, successLabel) => {
            if (typeof clearEmptyBuilderCards !== "function") return;
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "panel-tool-icon";
            btn.innerHTML = icon;
            btn.dataset.tip = tip;
            btn.setAttribute("aria-label", tip);
            btn.addEventListener("click", () => {
                const removed = clearEmptyBuilderCards(kind);
                if (!removed) {
                    if (typeof showToast === "function") showToast(emptyMsg, "info");
                    return;
                }
                if (typeof showToast === "function") showToast(`已清理 ${removed} 个空的 ${successLabel} 卡片`, "success");
            });
            tools.appendChild(btn);
        };
        appendCleanupBtn("add_builder", panelToolSvgIcon("builder"), "清空空的添加组", "没有可清理的空添加组卡片", "添加组");
        appendCleanupBtn("add_with", panelToolSvgIcon("with"), "清空空的旋转嵌套组", "没有可清理的空旋转嵌套组卡片", "旋转嵌套组");
        appendCleanupBtn("clear_as_mask", panelToolSvgIcon("builder"), "清空空的遮罩组", "没有可清理的空遮罩组卡片", "遮罩组");

        scopeFilterHost = document.createElement("div");
        scopeFilterHost.dataset.pbScopeFilter = "1";
        tools.appendChild(scopeFilterHost);

        title.insertAdjacentElement("afterend", tools);
        updateScopeToolbar(getCurrentCardScopeContext());
    }

    function updateScopeToolbar(scopeCtx) {
        if (!scopeRootBtn) return;
        scopeRootBtn.classList.add("hidden");
        scopeRootBtn.title = scopeCtx?.ownerNode && scopeCtx?.typeLabel
            ? `当前位于 ${scopeCtx.typeLabel}，点击返回最外层`
            : "点击返回最外层";
        if (!scopeFilterHost) return;
        const nextScopeKey = scopeCtx?.scopeId || "__pb_scope_root__";
        if (scopeFilterUi && scopeFilterScopeKey === nextScopeKey) return;
        scopeFilterScopeKey = nextScopeKey;
        scopeFilterUi = createFilterControls(scopeCtx?.scopeId || null, renderCards, true);
        scopeFilterHost.innerHTML = "";
        if (scopeFilterUi?.wrap) scopeFilterHost.appendChild(scopeFilterUi.wrap);
    }

    const selectedNodeIds = new Set();
    let selectionAnchorNodeId = null;
    let cardBoxEl = null;
    let cardBoxPending = null; // { pointerId,startX,startY,ctrlKey,shiftKey }
    let cardBoxSelecting = false;
    let cardBoxRect = null; // {left,top,right,bottom}
    let cardBoxBound = false;

    function pruneSelectedNodeIds() {
        if (!selectedNodeIds.size) return false;
        let changed = false;
        for (const id of Array.from(selectedNodeIds)) {
            if (!id || !findNodeContextById(id)) {
                selectedNodeIds.delete(id);
                changed = true;
            }
        }
        if (selectionAnchorNodeId && !findNodeContextById(selectionAnchorNodeId)) {
            selectionAnchorNodeId = null;
        }
        return changed;
    }

    function getSelectedNodeIds() {
        pruneSelectedNodeIds();
        return selectedNodeIds;
    }

    function getPreferredSelectedNodeId(ids) {
        const list = Array.isArray(ids) ? ids : [];
        for (const id of list) {
            const ctx = findNodeContextById(id);
            if (ctx && ctx.node && isBuilderContainerKind(ctx.node.kind)) return id;
        }
        return list.find(Boolean) || null;
    }

    function expandSelectedNodeIdsWithCompleteGroups(ids) {
        const selected = new Set((Array.isArray(ids) ? ids : []).filter(Boolean));
        if (!selected.size) return [];
        const state = getState();
        let changed = true;
        while (changed) {
            changed = false;
            const visit = (list) => {
                const arr = Array.isArray(list) ? list : [];
                for (const node of arr) {
                    if (!node || !node.id) continue;
                    if (isBuilderContainerKind(node.kind) && Array.isArray(node.children)) {
                        const required = node.children.map((child) => child && child.id).filter(Boolean);
                        if (required.length && required.every((id) => selected.has(id)) && !selected.has(node.id)) {
                            selected.add(node.id);
                            changed = true;
                        }
                        visit(node.children);
                    }
                }
            };
            visit(state?.root?.children || []);
        }
        const pruneDescendants = (list, ancestorSelected = false) => {
            const arr = Array.isArray(list) ? list : [];
            for (const node of arr) {
                if (!node || !node.id) continue;
                const selectedHere = selected.has(node.id);
                if (ancestorSelected) selected.delete(node.id);
                if (Array.isArray(node.children)) {
                    pruneDescendants(node.children, ancestorSelected || selectedHere);
                }
            }
        };
        pruneDescendants(state?.root?.children || []);
        return Array.from(selected);
    }

    function setSelectedNodeIds(ids, options = {}) {
        const replace = options.replace !== false;
        const focus = !!options.focus;
        const recordHistory = options.recordHistory !== false;
        const allowSync = options.syncWithParamSync !== false;
        const syncStrictKind = !!options.syncStrictKind;
        const updateAnchor = options.updateAnchor !== false;
        const src = Array.isArray(ids) ? ids : [];
        const valid = [];
        const seen = new Set();
        for (const id of src) {
            if (!id || seen.has(id)) continue;
            seen.add(id);
            if (findNodeContextById(id)) valid.push(id);
        }

        let changed = false;
        if (replace) {
            if (selectedNodeIds.size !== valid.length || valid.some(id => !selectedNodeIds.has(id))) changed = true;
            selectedNodeIds.clear();
        }
        for (const id of valid) {
            if (!selectedNodeIds.has(id)) changed = true;
            selectedNodeIds.add(id);
        }

        if (replace && valid.length === 0 && selectedNodeIds.size !== 0) {
            changed = true;
            selectedNodeIds.clear();
        }

        if (getAutoSelectCompleteGroups()) {
            const normalizedIds = expandSelectedNodeIdsWithCompleteGroups(Array.from(selectedNodeIds));
            if (normalizedIds.length !== selectedNodeIds.size || normalizedIds.some((id) => !selectedNodeIds.has(id))) {
                changed = true;
                selectedNodeIds.clear();
                for (const id of normalizedIds) selectedNodeIds.add(id);
            }
        }

        if (updateAnchor) {
            selectionAnchorNodeId = options.anchorId || getPreferredSelectedNodeId(Array.from(selectedNodeIds)) || valid[0] || null;
        }

        if (allowSync) {
            const sync = getParamSync();
            if (sync && sync.open) setSyncTargetsByIds(valid, { replace, strictKind: syncStrictKind });
        }

        if (focus) {
            const focusId = options.focusId || getPreferredSelectedNodeId(Array.from(selectedNodeIds)) || null;
            setFocusedNode(focusId, recordHistory);
        }
        if (changed || focus) {
            updateFocusCardUI();
            notifyCardSelectionChange();
        }
        return Array.from(selectedNodeIds);
    }

    function buildRangeNodeIds(anchorId, targetId, siblings, scopeId) {
        if (!anchorId || !targetId || anchorId === targetId) return [targetId];
        const entries = getVisibleEntries(siblings, scopeId) || (Array.isArray(siblings) ? siblings.map((node, index) => ({ node, index })) : []);
        const orderedIds = entries.map((it) => it?.node?.id).filter(Boolean);
        const start = orderedIds.indexOf(anchorId);
        const end = orderedIds.indexOf(targetId);
        if (start < 0 || end < 0) return [targetId];
        const from = Math.min(start, end);
        const to = Math.max(start, end);
        return orderedIds.slice(from, to + 1);
    }

    function clearSelectedNodeIds() {
        if (!selectedNodeIds.size) return;
        selectedNodeIds.clear();
        updateFocusCardUI();
        notifyCardSelectionChange();
    }

    function getDragIdsForNode(nodeId, listRef, containerEl = null) {
        if (!nodeId || !Array.isArray(listRef)) return [];
        const selectedForDrag = new Set(getSelectedNodeIds());
        if (containerEl && containerEl.querySelectorAll) {
            containerEl.querySelectorAll(".card.multi-selected[data-id]").forEach((el) => {
                const id = String(el.dataset.id || "").trim();
                if (id) selectedForDrag.add(id);
            });
        }
        if (elCardsRoot && elCardsRoot.querySelectorAll) {
            elCardsRoot.querySelectorAll(".card.multi-selected[data-id]").forEach((el) => {
                const id = String(el.dataset.id || "").trim();
                if (id) selectedForDrag.add(id);
            });
        }
        if (!selectedForDrag.has(nodeId)) return [nodeId];
        const ordered = [];
        const addOrdered = (id) => {
            if (!id || !selectedForDrag.has(id) || ordered.includes(id)) return;
            if (!findNodeContextById(id)) return;
            ordered.push(id);
        };
        if (elCardsRoot && elCardsRoot.querySelectorAll) {
            elCardsRoot.querySelectorAll(".card.multi-selected[data-id]").forEach((el) => addOrdered(String(el.dataset.id || "").trim()));
        }
        for (const n of listRef) {
            if (!n || !n.id) continue;
            addOrdered(n.id);
        }
        for (const id of selectedForDrag) {
            addOrdered(id);
        }
        if (!ordered.includes(nodeId)) ordered.unshift(nodeId);
        return ordered.length > 1 ? ordered : [nodeId];
    }

    function ensureCardBoxEl() {
        if (cardBoxEl) return cardBoxEl;
        const el = document.createElement("div");
        el.className = "pb-select-box pb-select-box-card hidden";
        document.body.appendChild(el);
        cardBoxEl = el;
        return el;
    }

    function hideCardBoxEl() {
        if (!cardBoxEl) return;
        cardBoxEl.classList.add("hidden");
    }

    function releaseCardBoxPointer(pointerId) {
        if (!elCardsRoot || pointerId === null || pointerId === undefined) return;
        try {
            if (elCardsRoot.hasPointerCapture && elCardsRoot.hasPointerCapture(pointerId)) {
                elCardsRoot.releasePointerCapture(pointerId);
            }
        } catch {}
    }

    function setCardBoxRect(startX, startY, endX, endY) {
        const left = Math.min(startX, endX);
        const right = Math.max(startX, endX);
        const top = Math.min(startY, endY);
        const bottom = Math.max(startY, endY);
        cardBoxRect = { left, right, top, bottom };
        const el = ensureCardBoxEl();
        el.style.left = `${Math.round(left)}px`;
        el.style.top = `${Math.round(top)}px`;
        el.style.width = `${Math.round(Math.max(0, right - left))}px`;
        el.style.height = `${Math.round(Math.max(0, bottom - top))}px`;
        el.classList.remove("hidden");
    }

    function clearCardBoxState(pointerId = null) {
        cardBoxPending = null;
        cardBoxSelecting = false;
        cardBoxRect = null;
        hideCardBoxEl();
        if (pointerId !== null && pointerId !== undefined) releaseCardBoxPointer(pointerId);
    }

    function shouldStartCardBox(ev) {
        if (!ev || ev.button !== 0) return false;
        const t = ev.target;
        if (!t || !t.closest) return false;
        if (t.closest("input, select, textarea, button, .iconbtn, .handle, .card-actions, .card-resizer, .subblock-resizer, .subblock-resizer-y")) return false;
        return true;
    }

    function collectCardIdsInRect(rect) {
        if (!rect || !elCardsRoot) return [];
        const hits = [];
        const cards = elCardsRoot.querySelectorAll(".card[data-id]");
        cards.forEach((card) => {
            if (!isCardVisibleForBoxSelection(card, elCardsRoot)) return;
            const r = card.getBoundingClientRect();
            if (!selectionRectIntersects(rect, r)) return;
            hits.push({ id: card.dataset.id, top: r.top, left: r.left });
        });
        hits.sort((a, b) => (a.top - b.top) || (a.left - b.left));
        return hits.map(it => it.id).filter(Boolean);
    }

    function startCardBoxSelecting(ev) {
        if (!cardBoxPending || !ev || ev.pointerId !== cardBoxPending.pointerId) return;
        cardBoxSelecting = true;
        setCardBoxRect(cardBoxPending.startX, cardBoxPending.startY, ev.clientX, ev.clientY);
    }

    function updateCardBoxSelecting(ev) {
        if (!cardBoxPending || !ev || ev.pointerId !== cardBoxPending.pointerId) return false;
        if (!cardBoxSelecting) return false;
        setCardBoxRect(cardBoxPending.startX, cardBoxPending.startY, ev.clientX, ev.clientY);
        return true;
    }

    function finishCardBoxSelection(ev) {
        if (!cardBoxPending || !ev || ev.pointerId !== cardBoxPending.pointerId) return false;
        const pointerId = cardBoxPending.pointerId;
        const active = cardBoxSelecting;
        const rect = cardBoxRect;
        const additive = !!(cardBoxPending.ctrlKey || cardBoxPending.shiftKey);
        clearCardBoxState(pointerId);
        if (!active || !rect) return false;
        if ((rect.right - rect.left) < 3 && (rect.bottom - rect.top) < 3) return false;

        const ids = collectCardIdsInRect(rect);
        if (ids.length) {
            setSelectedNodeIds(ids, { replace: !additive, focus: true, syncStrictKind: true });
        } else if (!additive) {
            clearSelectedNodeIds();
            const sync = getParamSync();
            if (sync && sync.open) setSyncTargetsByIds([], { replace: true });
        }
        return true;
    }

    function bindCardBoxSelection() {
        if (!elCardsRoot || cardBoxBound) return;
        cardBoxBound = true;

        elCardsRoot.addEventListener("pointerdown", (ev) => {
            if (!shouldStartCardBox(ev)) return;
            clearCardBoxState();
            cardBoxPending = {
                pointerId: ev.pointerId,
                startX: ev.clientX,
                startY: ev.clientY,
                ctrlKey: !!ev.ctrlKey,
                shiftKey: !!ev.shiftKey
            };
            if (elCardsRoot.setPointerCapture) {
                try { elCardsRoot.setPointerCapture(ev.pointerId); } catch {}
            }
            startCardBoxSelecting(ev);
        }, true);

        window.addEventListener("pointermove", (ev) => {
            if (updateCardBoxSelecting(ev)) ev.preventDefault();
        }, true);

        window.addEventListener("pointerup", (ev) => {
            if (!finishCardBoxSelection(ev) && cardBoxPending && ev.pointerId === cardBoxPending.pointerId) {
                clearCardBoxState(ev.pointerId);
            }
        }, true);

        window.addEventListener("pointercancel", (ev) => {
            if (cardBoxPending && ev.pointerId === cardBoxPending.pointerId) {
                clearCardBoxState(ev.pointerId);
            }
        }, true);

        window.addEventListener("blur", () => {
            const pid = cardBoxPending ? cardBoxPending.pointerId : null;
            clearCardBoxState(pid);
        }, true);
    }

    let draggingId = null;
    let draggingIds = null;
    const DRAG_TYPE_NODE = "application/x-pb-node";
    const DRAG_TYPE_NODE_MULTI = "application/x-pb-node-multi";
    const DRAG_TYPE_BUILDER = "application/x-pb-builder";
    let draggingBuilder = null;
    let pendingCardSwapAnim = false;
    let dragPreview = null;
    const requestCardSwapAnim = () => {
        pendingCardSwapAnim = true;
    };

    function getDragNodeIds(e) {
        if (Array.isArray(draggingIds) && draggingIds.length) return draggingIds.slice();
        try {
            if (e?.dataTransfer) {
                const byMulti = e.dataTransfer.getData(DRAG_TYPE_NODE_MULTI);
                if (byMulti) {
                    try {
                        const arr = JSON.parse(byMulti);
                        if (Array.isArray(arr) && arr.length) {
                            return arr.map(v => String(v || "").trim()).filter(Boolean);
                        }
                    } catch {}
                }
                const byType = e.dataTransfer.getData(DRAG_TYPE_NODE);
                if (byType) return [byType];
                const plain = e.dataTransfer.getData("text/plain");
                if (plain && plain !== "pb_builder") return [plain];
            }
        } catch {}
        return draggingId ? [draggingId] : [];
    }

    function getDragNodeId(e) {
        const ids = getDragNodeIds(e);
        return ids.length ? ids[0] : null;
    }

    function getDragBuilderInfo(e) {
        try {
            const raw = e?.dataTransfer?.getData(DRAG_TYPE_BUILDER);
            if (raw) {
                try { return JSON.parse(raw); } catch { return { type: raw }; }
            }
        } catch {}
        return draggingBuilder;
    }

    function startDragPreview(cardEl, listRef, ownerNode, dragIds = null) {
        if (!cardEl) return;
        const container = cardEl.parentElement;
        const ids = (Array.isArray(dragIds) && dragIds.length) ? dragIds.slice() : [cardEl.dataset.id];
        const cardEls = container
            ? ids.map((id) => container.querySelector(`.card[data-id="${id}"]`)).filter(Boolean)
            : [cardEl];
        dragPreview = {
            id: cardEl.dataset.id,
            ids,
            cardEl,
            cardEls,
            listRef,
            ownerNode,
            container,
            originalOrder: container ? Array.from(container.querySelectorAll(".card[data-id]")) : [],
            dirty: false,
            didDrop: false,
            lastTargetId: null,
            lastMode: null,
            lastAfter: null,
        };
    }

    function markDragPreviewDrop() {
        if (dragPreview) dragPreview.didDrop = true;
    }

    function finishDragPreview() {
        if (!dragPreview) return;
        const shouldRevert = dragPreview.dirty && !dragPreview.didDrop;
        dragPreview = null;
        if (shouldRevert) renderAll();
    }

    function getDragScrollContainer(el) {
        if (!el || !el.closest) return elCardsRoot || null;
        const sub = el.closest(".subcards");
        if (sub) return sub;
        const root = el.closest(".cards");
        if (root) return root;
        return elCardsRoot || null;
    }

    function autoScrollDuringDrag(containerEl, clientY) {
        if (!containerEl || !Number.isFinite(clientY)) return;
        const rect = containerEl.getBoundingClientRect();
        const edge = 56;
        const maxStep = 28;
        let delta = 0;
        if (clientY < rect.top + edge) {
            const ratio = Math.min(1, (rect.top + edge - clientY) / edge);
            delta = -Math.ceil(maxStep * ratio);
        } else if (clientY > rect.bottom - edge) {
            const ratio = Math.min(1, (clientY - (rect.bottom - edge)) / edge);
            delta = Math.ceil(maxStep * ratio);
        }
        if (delta !== 0) containerEl.scrollTop += delta;
    }

    function clearDragOverIndicators(containerEl = null) {
        const root = containerEl || elCardsRoot || document;
        root.querySelectorAll?.(".card.drag-over, .card.drag-over-top, .card.drag-over-bottom, .card.drag-over-inside").forEach((el) => {
            el.classList.remove("drag-over", "drag-over-top", "drag-over-bottom", "drag-over-inside");
        });
    }

    function setDragOverIndicator(cardEl, mode, after) {
        if (!cardEl) return;
        const container = cardEl.parentElement || elCardsRoot;
        clearDragOverIndicators(container);
        cardEl.classList.add("drag-over");
        if (mode === "insert") {
            cardEl.classList.add(after ? "drag-over-bottom" : "drag-over-top");
        }
    }


    function setupDnD(handleEl, cardEl, node, listRef, getIdx, ownerNode = null) {
        const isNestedDropTarget = (target) => {
            if (!target || !target.closest) return false;
            const zone = target.closest(".subcards, .dropzone, .builder-drop-surface");
            if (!zone || !cardEl.contains(zone)) return false;
            if (!zone.classList?.contains("builder-drop-surface")) return true;
            const ownerWrap = zone.closest(".pb-tree-node");
            return !!ownerWrap && ownerWrap !== cardEl.parentElement;
        };
        const canDropIntoCardBody = (target) => {
            if (!target || !target.closest) return true;
            if (target.closest(".handle, .card-actions, button, input, textarea, select, [contenteditable='true']")) return false;
            const inner = target.closest(".card[data-id]");
            return !inner || inner === cardEl;
        };
        const getCardBodyDropTarget = (e) => {
            if (!node || !isBuilderContainerKind(node.kind)) return null;
            if (isNestedDropTarget(e?.target)) return null;
            if (!canDropIntoCardBody(e?.target)) return null;
            const rect = cardEl.getBoundingClientRect();
            if (rect && rect.height > 0 && Number.isFinite(e?.clientY)) {
                const edge = Math.min(18, Math.max(8, rect.height * 0.25));
                if (e.clientY < rect.top + edge || e.clientY > rect.bottom - edge) return null;
            }
            const dragIds = getDragNodeIds(e);
            if (!dragIds.length || dragIds.includes(node.id)) return null;
            if (!Array.isArray(node.children)) node.children = [];
            const movableIds = dragIds.filter((dragId) => {
                if (!dragId || dragId === node.id) return false;
                const from = findNodeContextById(dragId);
                return !!(from && from.node && !nodeContainsId(from.node, node.id));
            });
            if (!movableIds.length) return null;
            return { ids: movableIds, list: node.children, owner: node };
        };
        handleEl.setAttribute("draggable", "true");
        handleEl.addEventListener("pointerdown", (e) => {
            e.stopPropagation();
            if (typeof ctx.setDraggingState === "function") ctx.setDraggingState(true);
        });
        handleEl.addEventListener("pointerup", () => {
            if (typeof ctx.setDraggingState === "function") ctx.setDraggingState(false);
        });
        handleEl.addEventListener("pointercancel", () => {
            if (typeof ctx.setDraggingState === "function") ctx.setDraggingState(false);
        });
        handleEl.addEventListener("dragstart", (e) => {
            draggingId = node?.id || cardEl.dataset.id;
            const dragIds = getDragIdsForNode(draggingId, listRef, cardEl.parentElement);
            draggingIds = (dragIds.length > 1) ? dragIds.slice() : null;
            draggingBuilder = null;
            startDragPreview(cardEl, listRef, ownerNode, dragIds);
            const dragEls = (dragPreview && Array.isArray(dragPreview.cardEls) && dragPreview.cardEls.length)
                ? dragPreview.cardEls
                : [cardEl];
            dragEls.forEach((el) => el.classList.add("dragging"));
            if (typeof ctx.setDraggingState === "function") ctx.setDraggingState(true);
            e.dataTransfer.effectAllowed = "move";
            if (dragIds.length > 1) {
                try { e.dataTransfer.setData(DRAG_TYPE_NODE_MULTI, JSON.stringify(dragIds)); } catch {}
            }
            try { e.dataTransfer.setData(DRAG_TYPE_NODE, draggingId); } catch {}
            e.dataTransfer.setData("text/plain", draggingId);
        });
        handleEl.addEventListener("dragend", () => {
            draggingId = null;
            draggingIds = null;
            draggingBuilder = null;
            const dragEls = (dragPreview && Array.isArray(dragPreview.cardEls) && dragPreview.cardEls.length)
                ? dragPreview.cardEls
                : [cardEl];
            dragEls.forEach((el) => {
                el.classList.remove("dragging");
            });
            clearDragOverIndicators(dragPreview?.container || cardEl.parentElement || elCardsRoot);
            finishDragPreview();
            if (typeof ctx.setDraggingState === "function") ctx.setDraggingState(false);
        });

        cardEl.addEventListener("dragover", (e) => {
            if (isNestedDropTarget(e.target)) return;
            e.preventDefault();
            autoScrollDuringDrag(getDragScrollContainer(cardEl), e.clientY);
            const builderInfo = getDragBuilderInfo(e);
            e.dataTransfer.dropEffect = builderInfo ? "copy" : "move";
            const bodyDrop = !builderInfo ? getCardBodyDropTarget(e) : null;
            if (bodyDrop) {
                clearDragOverIndicators(cardEl.parentElement || elCardsRoot);
                cardEl.classList.add("drag-over", "drag-over-inside");
                return;
            }
            setDragOverIndicator(cardEl, builderInfo ? "copy" : "insert", e.clientY > (cardEl.getBoundingClientRect().top + cardEl.getBoundingClientRect().height / 2));

            if (builderInfo) return;
            const dragIds = getDragNodeIds(e);
            if (!dragIds.length) return;
            if (dragIds.length > 1) {
                if (!dragPreview || !Array.isArray(dragPreview.ids) || dragPreview.ids.length < 2) return;
                if (dragPreview.listRef !== listRef) return;
                if (!cardEl.parentElement || cardEl.parentElement !== dragPreview.container) return;
                const targetCardId = cardEl.dataset.id;
                if (!targetCardId || dragPreview.ids.includes(targetCardId)) return;

                const scopeId = ownerNode ? ownerNode.id : null;
                const mode = isFilterActive(scopeId) ? "swap" : "insert";
                if (mode === "swap") return;
                const rect = cardEl.getBoundingClientRect();
                const after = (e.clientY > rect.top + rect.height / 2);
                setDragOverIndicator(cardEl, mode, after);
                if (dragPreview.lastTargetId === targetCardId
                    && dragPreview.lastMode === mode
                    && dragPreview.lastAfter === after) {
                    return;
                }
                dragPreview.lastTargetId = targetCardId;
                dragPreview.lastMode = mode;
                dragPreview.lastAfter = after;
                return;
            }
            const id = dragIds[0];
            if (!id || !dragPreview || dragPreview.id !== id) return;
            if (dragPreview.listRef !== listRef) return;
            if (dragPreview.cardEl === cardEl) return;
            if (!cardEl.parentElement || cardEl.parentElement !== dragPreview.container) return;

            const scopeId = ownerNode ? ownerNode.id : null;
            const mode = isFilterActive(scopeId) ? "swap" : "insert";
            const rect = cardEl.getBoundingClientRect();
            const after = (mode === "insert") && (e.clientY > rect.top + rect.height / 2);
            setDragOverIndicator(cardEl, mode, after);
            if (dragPreview.lastTargetId === cardEl.dataset.id
                && dragPreview.lastMode === mode
                && (mode === "swap" || dragPreview.lastAfter === after)) {
                return;
            }
            dragPreview.lastTargetId = cardEl.dataset.id;
            dragPreview.lastMode = mode;
            dragPreview.lastAfter = after;
        });
        cardEl.addEventListener("dragleave", () => {
            cardEl.classList.remove("drag-over-inside");
            clearDragOverIndicators(cardEl.parentElement || elCardsRoot);
        });
        cardEl.addEventListener("drop", (e) => {
            if (isNestedDropTarget(e.target)) {
                clearDragOverIndicators(cardEl.parentElement || elCardsRoot);
                return;
            }
            e.preventDefault();
            e.stopPropagation();
            cardEl.classList.remove("drag-over-inside");
            clearDragOverIndicators(cardEl.parentElement || elCardsRoot);
            const builderInfo = getDragBuilderInfo(e);
            if (builderInfo) {
                if (handleBuilderDrop(builderInfo, listRef, getIdx(), ownerNode)) {
                    markDragPreviewDrop();
                    requestCardSwapAnim();
                    renderAll();
                }
                return;
            }

            const dragIds = getDragNodeIds(e);
            if (!dragIds.length) return;
            if (!canDropIntoBuilderOwner(ownerNode, dragIds)) {
                showToast("空间贝塞尔分布卡片只能接收组类卡片", "info");
                return;
            }
            const bodyDrop = getCardBodyDropTarget(e);
            if (bodyDrop) {
                if (bodyDrop.ids.length > 1) {
                    historyCapture("drag_drop_multi_into_group");
                    const ok = (typeof moveNodesByIds === "function")
                        ? moveNodesByIds(bodyDrop.ids, bodyDrop.list, bodyDrop.list.length, bodyDrop.owner)
                        : false;
                    if (ok) {
                        markDragPreviewDrop();
                        requestCardSwapAnim();
                        renderAll();
                    }
                    return;
                }
                if (tryCopyWithBuilderIntoAddWith(bodyDrop.ids[0], bodyDrop.owner)) {
                    markDragPreviewDrop();
                    requestCardSwapAnim();
                    renderAll();
                    return;
                }
                historyCapture("drag_drop_into_group");
                const ok = moveNodeById(bodyDrop.ids[0], bodyDrop.list, bodyDrop.list.length, bodyDrop.owner);
                if (ok) {
                    markDragPreviewDrop();
                    requestCardSwapAnim();
                    renderAll();
                }
                return;
            }
            const isMulti = dragIds.length > 1;
            const id = dragIds[0];

            if (isMulti) {
                const scopeId = ownerNode ? ownerNode.id : null;
                const useSwap = isFilterActive(scopeId);
                if (useSwap) {
                    showToast("过滤中暂不支持多卡片拖拽", "info");
                    return;
                }
                historyCapture("drag_drop_multi");
                const rect = cardEl.getBoundingClientRect();
                const after = (e.clientY > rect.top + rect.height / 2);
                const targetCardIndex = getIdx();
                let targetIndex = targetCardIndex + (after ? 1 : 0);
                const selectedIndices = dragIds
                    .map((dragId) => listRef.findIndex((it) => it && it.id === dragId))
                    .filter((v) => v >= 0)
                    .sort((a, b) => a - b);
                if (selectedIndices.length) {
                    const firstSel = selectedIndices[0];
                    const lastSel = selectedIndices[selectedIndices.length - 1];
                    // 紧邻上方/下方目标时，避免 targetIndex 落在原区间导致“看起来没交换”
                    if (targetCardIndex < firstSel && targetIndex === firstSel) {
                        targetIndex = targetCardIndex;
                    } else if (targetCardIndex > lastSel && targetIndex === (lastSel + 1)) {
                        targetIndex = targetCardIndex + 1;
                    }
                }
                if (typeof moveNodesByIds === "function") {
                    const ok = moveNodesByIds(dragIds, listRef, targetIndex, ownerNode);
                    if (ok) {
                        markDragPreviewDrop();
                        requestCardSwapAnim();
                        renderAll();
                    }
                }
                return;
            }

            // drop 在卡片上：插入到该卡片之前（同列表=排序，跨列表=移动）
            if (tryCopyWithBuilderIntoAddWith(id, ownerNode)) {
                markDragPreviewDrop();
                requestCardSwapAnim();
                renderAll();
                return;
            }
            historyCapture("drag_drop");
            const scopeId = ownerNode ? ownerNode.id : null;
            const useSwap = isFilterActive(scopeId);
            const rect = cardEl.getBoundingClientRect();
            const after = !useSwap && (e.clientY > rect.top + rect.height / 2);
            const targetIndex = getIdx() + (after ? 1 : 0);
            const ok = moveNodeById(id, listRef, targetIndex, ownerNode);
            if (ok) {
                markDragPreviewDrop();
                requestCardSwapAnim();
                renderAll();
            }
        });
    }

    // 用于 add_fourier_series 内部 term 卡片的拖拽排序
    function setupDrag(handleEl, cardEl, listRef, getIdx, onRender) {
        if (!handleEl || !cardEl || !Array.isArray(listRef)) return;
        handleEl.setAttribute("draggable", "true");
        handleEl.addEventListener("pointerdown", (e) => {
            e.stopPropagation();
            if (typeof ctx.setDraggingState === "function") ctx.setDraggingState(true);
        });
        handleEl.addEventListener("pointerup", () => {
            if (typeof ctx.setDraggingState === "function") ctx.setDraggingState(false);
        });
        handleEl.addEventListener("pointercancel", () => {
            if (typeof ctx.setDraggingState === "function") ctx.setDraggingState(false);
        });
        handleEl.addEventListener("dragstart", (e) => {
            draggingId = cardEl.dataset.id;
            draggingIds = null;
            draggingBuilder = null;
            cardEl.classList.add("dragging");
            if (typeof ctx.setDraggingState === "function") ctx.setDraggingState(true);
            e.dataTransfer.effectAllowed = "move";
            e.dataTransfer.setData("text/plain", draggingId);
        });
        handleEl.addEventListener("dragend", () => {
            draggingId = null;
            draggingIds = null;
            draggingBuilder = null;
            cardEl.classList.remove("dragging");
            cardEl.classList.remove("drag-over");
            if (typeof ctx.setDraggingState === "function") ctx.setDraggingState(false);
        });

        cardEl.addEventListener("dragover", (e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            cardEl.classList.add("drag-over");
        });
        cardEl.addEventListener("dragleave", () => cardEl.classList.remove("drag-over"));
        cardEl.addEventListener("drop", (e) => {
            e.preventDefault();
            e.stopPropagation();
            cardEl.classList.remove("drag-over");
            const id = e.dataTransfer.getData("text/plain") || draggingId;
            if (!id) return;
            const fromIdx = listRef.findIndex(it => it && it.id === id);
            const toIdx = getIdx();
            if (fromIdx < 0 || toIdx < 0 || fromIdx === toIdx) return;
            historyCapture("drag_term");
            const item = listRef.splice(fromIdx, 1)[0];
            const insertAt = (fromIdx < toIdx) ? Math.max(0, toIdx - 1) : toIdx;
            listRef.splice(insertAt, 0, item);
            requestCardSwapAnim();
            if (typeof onRender === "function") onRender();
            else renderAll();
        });
    }

    function bindAddWithBuilderDrag(handleEl, ownerNode) {
        if (!handleEl || !ownerNode) return;
        handleEl.setAttribute("draggable", "true");
        handleEl.classList.add("drag-handle");
        handleEl.addEventListener("pointerdown", (e) => {
            e.stopPropagation();
            if (typeof ctx.setDraggingState === "function") ctx.setDraggingState(true);
        });
        handleEl.addEventListener("pointerup", () => {
            if (typeof ctx.setDraggingState === "function") ctx.setDraggingState(false);
        });
        handleEl.addEventListener("pointercancel", () => {
            if (typeof ctx.setDraggingState === "function") ctx.setDraggingState(false);
        });
        handleEl.addEventListener("dragstart", (e) => {
            const payload = { type: "add_with_builder", ownerId: ownerNode.id };
            draggingId = null;
            draggingIds = null;
            draggingBuilder = payload;
            handleEl.classList.add("dragging");
            if (typeof ctx.setDraggingState === "function") ctx.setDraggingState(true);
            e.dataTransfer.effectAllowed = "copy";
            try { e.dataTransfer.setData(DRAG_TYPE_BUILDER, JSON.stringify(payload)); } catch {}
            try { e.dataTransfer.setData("text/plain", "pb_builder"); } catch {}
        });
        handleEl.addEventListener("dragend", () => {
            draggingBuilder = null;
            handleEl.classList.remove("dragging");
            if (typeof ctx.setDraggingState === "function") ctx.setDraggingState(false);
        });
    }

    function canDropIntoBuilderOwner(owner, ids) {
        if (!owner || owner.kind !== "apply_bezier_distribution") return true;
        const list = Array.isArray(ids) ? ids : [];
        return list.every((id) => {
            const ctx = findNodeContextById(id);
            return !!(ctx?.node && isBuilderContainerKind(ctx.node.kind));
        });
    }

    function setupListDropZone(containerEl, getListRef, getOwnerNode) {
        if (!containerEl || containerEl.__pbDropZoneBound) return;
        containerEl.__pbDropZoneBound = true;

        containerEl.addEventListener("dragover", (e) => {
            e.preventDefault();
            e.stopPropagation();
            autoScrollDuringDrag(getDragScrollContainer(containerEl), e.clientY);
            const builderInfo = getDragBuilderInfo(e);
            e.dataTransfer.dropEffect = builderInfo ? "copy" : "move";
            containerEl.classList.add("dropzone-active");
        });

        containerEl.addEventListener("dragleave", () => containerEl.classList.remove("dropzone-active"));

        containerEl.addEventListener("drop", (e) => {
            e.preventDefault();
            e.stopPropagation();
            containerEl.classList.remove("dropzone-active");
            const listRef = getListRef();
            const owner = getOwnerNode ? getOwnerNode() : null;
            if (!Array.isArray(listRef)) return;
            const scopeId = owner ? owner.id : null;
            if (isFilterActive(scopeId)) {
                showToast("过滤中只能交换顺序", "info");
                return;
            }

            const builderInfo = getDragBuilderInfo(e);
            if (builderInfo) {
                if (handleBuilderDrop(builderInfo, listRef, listRef.length, owner)) {
                    markDragPreviewDrop();
                    requestCardSwapAnim();
                    renderAll();
                }
                return;
            }

            const dragIds = getDragNodeIds(e);
            if (!dragIds.length) return;
            if (!canDropIntoBuilderOwner(owner, dragIds)) {
                showToast("空间贝塞尔分布卡片只能接收组类卡片", "info");
                return;
            }
            const id = dragIds[0];

            if (dragIds.length > 1) {
                historyCapture("drag_drop_multi_end");
                if (typeof moveNodesByIds === "function") {
                    const ok = moveNodesByIds(dragIds, listRef, listRef.length, owner);
                    if (ok) {
                        markDragPreviewDrop();
                        requestCardSwapAnim();
                        renderAll();
                    }
                }
                return;
            }

            if (tryCopyWithBuilderIntoAddWith(id, owner)) {
                markDragPreviewDrop();
                requestCardSwapAnim();
                renderAll();
                return;
            }
            historyCapture("drag_drop_end");
            const ok = moveNodeById(id, listRef, listRef.length, owner);
            if (ok) {
                markDragPreviewDrop();
                requestCardSwapAnim();
                renderAll();
            }
        });
    }

    function bindSubDropZone(zoneEl, listRef, ownerNode) {
        if (!zoneEl) return;
        zoneEl.addEventListener("dragover", (e) => {
            e.preventDefault();
            e.stopPropagation();
            autoScrollDuringDrag(getDragScrollContainer(zoneEl), e.clientY);
            const builderInfo = getDragBuilderInfo(e);
            e.dataTransfer.dropEffect = builderInfo ? "copy" : "move";
            zoneEl.classList.add("active");
        });
        zoneEl.addEventListener("dragleave", () => zoneEl.classList.remove("active"));
        zoneEl.addEventListener("drop", (e) => {
            e.preventDefault();
            e.stopPropagation();
            zoneEl.classList.remove("active");
            const scopeId = ownerNode ? ownerNode.id : null;
            if (isFilterActive(scopeId)) {
                showToast("过滤中只能交换顺序", "info");
                return;
            }
            const builderInfo = getDragBuilderInfo(e);
            if (builderInfo) {
                if (handleBuilderDrop(builderInfo, listRef, listRef.length, ownerNode)) {
                    markDragPreviewDrop();
                    requestCardSwapAnim();
                    renderAll();
                }
                return;
            }

            const dragIds = getDragNodeIds(e);
            if (!dragIds.length) return;
            if (!canDropIntoBuilderOwner(ownerNode, dragIds)) {
                showToast("空间贝塞尔分布卡片只能接收组类卡片", "info");
                return;
            }
            const id = dragIds[0];

            if (dragIds.length > 1) {
                historyCapture("drag_drop_multi_sub");
                if (typeof moveNodesByIds === "function") {
                    const ok = moveNodesByIds(dragIds, listRef, listRef.length, ownerNode);
                    if (ok) {
                        markDragPreviewDrop();
                        requestCardSwapAnim();
                        renderAll();
                    }
                }
                return;
            }

            if (tryCopyWithBuilderIntoAddWith(id, ownerNode)) {
                markDragPreviewDrop();
                requestCardSwapAnim();
                renderAll();
                return;
            }
            historyCapture("drag_drop_sub");
            const ok = moveNodeById(id, listRef, listRef.length, ownerNode);
            if (ok) {
                markDragPreviewDrop();
                requestCardSwapAnim();
                renderAll();
            }
        });
    }

    function addQuickOffsetTo(list) {
        const state = getState();
        const target = (list || state?.root?.children || []);
        historyCapture("quick_offset");
        target.push(makeNode("points_on_each_offset", {params: {offX: 0.2, offY: 0, offZ: 0}}));
        renderAll();
    }

    function renderFourierTermCard(parentNode, idx) {
        const t = parentNode.terms[idx];
        if (!t) return document.createElement("div");
        if (typeof setTipKind === "function") setTipKind("fourier_term");
        const card = document.createElement("div");
        card.className = "card subcard";
        card.dataset.id = t.id;
        if (getFocusedNodeId() === t.id) card.classList.add("focused");
        if (t.collapsed) card.classList.add("collapsed");

        const head = document.createElement("div");
        head.className = "card-head";

        const title = document.createElement("div");
        title.className = "card-title";

        const handle = document.createElement("div");
        handle.className = "handle";
        handle.textContent = "≡";

        const ttext = document.createElement("div");
        ttext.className = "title-text";
        ttext.textContent = `term ${idx + 1}`;

        title.appendChild(handle);
        title.appendChild(ttext);

        const actions = document.createElement("div");
        actions.className = "card-actions";

        const collapseBtn = iconBtn("", (e) => {
            e.stopPropagation();
            historyCapture("toggle_term_collapse");
            t.collapsed = !t.collapsed;
            const synced = (typeof ctx.syncCardCollapseUI === "function") ? ctx.syncCardCollapseUI(t.id) : false;
            if (!synced) {
                card.classList.toggle("collapsed", t.collapsed);
                collapseBtn.innerHTML = chevronSvg(t.collapsed);
                collapseBtn.title = t.collapsed ? "展开" : "收起";
            }
        });
        collapseBtn.innerHTML = chevronSvg(t.collapsed);
        collapseBtn.title = t.collapsed ? "展开" : "收起";
        actions.appendChild(collapseBtn);

        actions.appendChild(iconBtn("↑", () => {
            if (idx > 0) {
                historyCapture("move_fourier_term_up");
                const tmp = parentNode.terms[idx - 1];
                parentNode.terms[idx - 1] = parentNode.terms[idx];
                parentNode.terms[idx] = tmp;
                renderAll();
            }
        }));
        actions.appendChild(iconBtn("↓", () => {
            if (idx < parentNode.terms.length - 1) {
                historyCapture("move_fourier_term_down");
                const tmp = parentNode.terms[idx + 1];
                parentNode.terms[idx + 1] = parentNode.terms[idx];
                parentNode.terms[idx] = tmp;
                renderAll();
            }
        }));
        actions.appendChild(iconBtn("🗑", () => {
            historyCapture("delete_fourier_term");
            const wasFocused = (getFocusedNodeId() === t.id);
            parentNode.terms.splice(idx, 1);
            if (wasFocused) {
                const next = pickReasonableFocusAfterDelete({ parentList: parentNode.terms, index: idx, parentNode });
                setFocusedNode(next, false);
            }
            renderAll();
        }, true));

        head.appendChild(title);
        head.appendChild(actions);

        const body = document.createElement("div");
        body.className = "card-body";
        if (Number.isFinite(t.bodyHeight) && !t.collapsed) {
            body.style.height = `${t.bodyHeight}px`;
            body.style.maxHeight = `${t.bodyHeight}px`;
        }
        const desc = document.createElement("div");
        desc.className = "pill";
        desc.textContent = "r, w, startAngle";
        body.appendChild(desc);

        body.appendChild(row("r", inputNum(t.r, v => {
            t.r = v;
            rebuildPreviewAndKotlin();
        })));
        body.appendChild(row("w", inputNum(t.w, v => {
            t.w = v;
            rebuildPreviewAndKotlin();
        })));
        body.appendChild(row("startAngle", angleInput(t, "startAngle", rebuildPreviewAndKotlin)));

        card.appendChild(head);
        card.appendChild(body);
        const resizer = document.createElement("div");
        resizer.className = "card-resizer";
        bindCardBodyResizer(resizer, body, t);
        card.appendChild(resizer);

        // ✅ 同样处理焦点：避免焦点落在 Fourier 子卡片时仍残留上一张卡的高亮
        card.tabIndex = 0;
        card.addEventListener("pointerdown", (e) => {
            if (getIsRenderingCards()) return;
            if (e.button !== 0) return;
            // ✅ 避免父卡片接管子卡片的点击：只响应“事件发生在当前卡片自身区域”
            const inner = e.target && e.target.closest ? e.target.closest(".card") : null;
            if (inner && inner !== card) return;
            setFocusedNode(t.id);
        });
        card.addEventListener("focusin", (e) => {
            if (getIsRenderingCards()) return;
            // ✅ focusin 会冒泡：子卡片获得焦点时，父卡片不应抢走高亮
            const inner = e.target && e.target.closest ? e.target.closest(".card") : null;
            if (inner && inner !== card) return;
            setFocusedNode(t.id);
        });
        card.addEventListener("focusout", (e) => {
            if (getIsRenderingCards()) return;
            if (getSuppressCardFocusOutClear()) return;
            const next = e.relatedTarget;
            if (next && card.contains(next)) return;
            requestAnimationFrame(() => {
                const ae = document.activeElement;
                if (ae && card.contains(ae)) return;
                const nextCard = ae && ae.closest ? ae.closest(".card") : null;
                if (!nextCard || nextCard === card) return;
                clearFocusedNodeIf(t.id);
            });
        });

        setupDrag(handle, card, parentNode.terms, () => idx, () => renderAll());
        if (typeof setTipKind === "function") setTipKind(null);
        return card;
    }

    function renderCompactCardBody(body, node, def) {
        const summary = document.createElement("div");
        summary.className = "card-tree-summary";

        const label = document.createElement("span");
        if (isBuilderContainerKind(node.kind)) {
            const count = Array.isArray(node.children) ? node.children.length : 0;
            label.innerHTML = `<strong>文件夹</strong> ${count} 张子卡片`;
        } else {
            label.textContent = "选中后在右侧编辑参数";
        }
        summary.appendChild(label);

        const kind = document.createElement("span");
        kind.textContent = def?.title || node.kind;
        summary.appendChild(kind);
        body.appendChild(summary);
    }

    function renderNodeCard(node, siblings, idx, ownerLabel, ownerNode = null) {
        const def = KIND[node.kind];
        const card = document.createElement("div");
        card.className = "card";
        if (!renderCardParamsInline) card.classList.add("compact-card");
        card.dataset.id = node.id;
        const scopeId = ownerNode ? ownerNode.id : null;
        const useFilterSwap = isFilterActive(scopeId);
        if (node.id === getFocusedNodeId()) card.classList.add("focused");
        if (selectedNodeIds.has(node.id)) card.classList.add("multi-selected");
        const sync = getParamSync();
        if (sync && sync.selectedIds && sync.selectedIds.has(node.id)) card.classList.add("sync-target");
        if (node.collapsed) card.classList.add("collapsed");
        card.dataset.ownerId = ownerNode ? String(ownerNode.id || "") : "";

        const head = document.createElement("div");
        head.className = "card-head";

        const title = document.createElement("div");
        title.className = "card-title";

        const handle = document.createElement("div");
        handle.className = "handle";
        handle.textContent = "≡";

        const getCardTitleText = () => node.label || (def ? def.title : node.kind);
        const titleText = document.createElement("span");
        titleText.className = "title-text card-title-label";
        titleText.textContent = getCardTitleText();
        titleText.title = "右键重命名，或选中后按 F2";
        const beginCardTitleEdit = (ev = null) => {
            ev?.stopPropagation?.();
            if (titleText.dataset.editing === "1") return;
            titleText.dataset.editing = "1";
            const input = document.createElement("input");
            input.className = "title-text card-title-input";
            input.value = node.label || "";
            input.placeholder = def ? def.title : node.kind;
            input.title = "回车确认，Esc 取消";
            let done = false;
            const finish = (commit = true) => {
                if (done) return;
                done = true;
                if (commit) {
                    const next = String(input.value || "").trim();
                    node.label = next || "";
                    if (typeof historyCapture === "function") historyCapture("rename_card");
                    if (typeof rebuildPreviewAndKotlin === "function") rebuildPreviewAndKotlin();
                }
                titleText.dataset.editing = "";
                titleText.textContent = getCardTitleText();
                if (input.parentNode) input.replaceWith(titleText);
            };
            input.addEventListener("pointerdown", (e) => e.stopPropagation());
            input.addEventListener("click", (e) => e.stopPropagation());
            input.addEventListener("keydown", (e) => {
                if (e.key === "Enter") {
                    e.preventDefault();
                    finish(true);
                } else if (e.key === "Escape") {
                    e.preventDefault();
                    finish(false);
                }
            });
            input.addEventListener("blur", () => finish(true), { once: true });
            titleText.replaceWith(input);
            requestAnimationFrame(() => {
                input.focus();
                input.select();
            });
        };
        card.__pbBeginRename = beginCardTitleEdit;
        title.title = "右键重命名，或选中后按 F2";

        const badge = document.createElement("div");
        badge.className = "badge2";
        badge.textContent = node.kind;

        if (!renderCardParamsInline && isBuilderContainerKind(node.kind)) {
            const treeCollapsed = node.treeCollapsed === true;
            const treeToggleBtn = iconBtn("", (e) => {
                e.stopPropagation();
                historyCapture("toggle_tree_collapse");
                node.treeCollapsed = !(node.treeCollapsed === true);
                const nextCollapsed = node.treeCollapsed === true;
                const children = card.parentElement ? card.parentElement.querySelector(":scope > .pb-tree-children") : null;
                if (children) children.classList.toggle("collapsed", nextCollapsed);
                treeToggleBtn.innerHTML = chevronSvg(nextCollapsed);
                treeToggleBtn.dataset.tip = nextCollapsed ? "展开子卡片" : "折叠子卡片";
                treeToggleBtn.setAttribute("aria-label", treeToggleBtn.dataset.tip);
                treeToggleBtn.title = treeToggleBtn.dataset.tip;
            });
            treeToggleBtn.classList.add("tree-toggle-btn");
            treeToggleBtn.innerHTML = chevronSvg(treeCollapsed);
            treeToggleBtn.dataset.keepMainAction = "1";
            treeToggleBtn.dataset.tip = treeCollapsed ? "展开子卡片" : "折叠子卡片";
            treeToggleBtn.setAttribute("aria-label", treeToggleBtn.dataset.tip);
            treeToggleBtn.title = treeToggleBtn.dataset.tip;
            title.appendChild(treeToggleBtn);
        }

        title.appendChild(handle);
        title.appendChild(titleText);
        title.appendChild(badge);

        const actions = document.createElement("div");
        actions.className = "card-actions";

        if (renderCardParamsInline) {
            let collapsePrev = null;
            const rememberCollapsePrev = () => {
                if (collapsePrev !== null) return;
                collapsePrev = node.collapsed;
            };
            const collapseBtn = iconBtn("", (e) => {
                e.stopPropagation();
                historyCapture("toggle_card_collapse");
                const wasCollapsed = (collapsePrev !== null) ? collapsePrev : node.collapsed;
                collapsePrev = null;
                node.collapsed = !wasCollapsed;
                if (typeof ctx.isCollapseAllActive === "function" && ctx.isCollapseAllActive(scopeId)) {
                    const scope = (typeof ctx.getCollapseScope === "function") ? ctx.getCollapseScope(scopeId) : null;
                    if (scope && scope.manualOpen) {
                        if (node.collapsed) scope.manualOpen.delete(node.id);
                        else scope.manualOpen.add(node.id);
                    }
                }
                const synced = (typeof ctx.syncCardCollapseUI === "function") ? ctx.syncCardCollapseUI(node.id) : false;
                if (!synced) {
                    card.classList.toggle("collapsed", node.collapsed);
                    collapseBtn.innerHTML = chevronSvg(node.collapsed);
                    collapseBtn.title = node.collapsed ? "展开" : "收起";
                }
            });
            collapseBtn.innerHTML = chevronSvg(node.collapsed);
            collapseBtn.addEventListener("pointerdown", rememberCollapsePrev);
            collapseBtn.addEventListener("mousedown", rememberCollapsePrev);
            collapseBtn.addEventListener("touchstart", rememberCollapsePrev, { passive: true });
            collapseBtn.addEventListener("keydown", (ev) => {
                if (ev.key === " " || ev.key === "Enter") rememberCollapsePrev();
            });
            collapseBtn.dataset.collapseBtn = "1";
            collapseBtn.title = node.collapsed ? "展开" : "收起";
            actions.appendChild(collapseBtn);

            const addBtn = iconBtn("＋", () => {
                if (isBuilderContainerKind(node.kind)) {
                    const options = node.kind === "apply_bezier_distribution"
                        ? { allowedKinds: ["add_builder", "add_with", "clear_as_mask", "apply_bezier_distribution"] }
                        : undefined;
                    openModal(node.children, (node.children || []).length, "子Builder", node.id, options);
                } else {
                    openModal(siblings, idx + 1, ownerLabel);
                }
            });
            addBtn.title = "在下方新增";
            actions.appendChild(addBtn);

            const toTopBtn = iconBtn("⇡", () => {
                if (useFilterSwap) {
                    const target = findVisibleSwapIndex(idx, "top", siblings, scopeId);
                    if (target >= 0 && target !== idx) {
                        historyCapture("move_top");
                        swapInList(siblings, idx, target);
                        renderAll();
                    }
                    return;
                }
                if (idx > 0) {
                    historyCapture("move_top");
                    const n = siblings.splice(idx, 1)[0];
                    siblings.unshift(n);
                    renderAll();
                }
            });
            toTopBtn.title = "置顶";
            actions.appendChild(toTopBtn);

            const upBtn = iconBtn("↑", () => {
                if (useFilterSwap) {
                    const target = findVisibleSwapIndex(idx, "prev", siblings, scopeId);
                    if (target >= 0 && target !== idx) {
                        historyCapture("move_up");
                        swapInList(siblings, idx, target);
                        renderAll();
                    }
                    return;
                }
                if (idx > 0) {
                    historyCapture("move_up");
                    const t = siblings[idx - 1];
                    siblings[idx - 1] = siblings[idx];
                    siblings[idx] = t;
                    renderAll();
                }
            });
            upBtn.title = "上移";
            actions.appendChild(upBtn);

            const downBtn = iconBtn("↓", () => {
                if (useFilterSwap) {
                    const target = findVisibleSwapIndex(idx, "next", siblings, scopeId);
                    if (target >= 0 && target !== idx) {
                        historyCapture("move_down");
                        swapInList(siblings, idx, target);
                        renderAll();
                    }
                    return;
                }
                if (idx < siblings.length - 1) {
                    historyCapture("move_down");
                    const t = siblings[idx + 1];
                    siblings[idx + 1] = siblings[idx];
                    siblings[idx] = t;
                    renderAll();
                }
            });
            downBtn.title = "下移";
            actions.appendChild(downBtn);

            const toBottomBtn = iconBtn("⇣", () => {
                if (useFilterSwap) {
                    const target = findVisibleSwapIndex(idx, "bottom", siblings, scopeId);
                    if (target >= 0 && target !== idx) {
                        historyCapture("move_bottom");
                        swapInList(siblings, idx, target);
                        renderAll();
                    }
                    return;
                }
                if (idx < siblings.length - 1) {
                    historyCapture("move_bottom");
                    const n = siblings.splice(idx, 1)[0];
                    siblings.push(n);
                    renderAll();
                }
            });
            toBottomBtn.title = "置底";
            actions.appendChild(toBottomBtn);

            if (node.kind === "add_line" || node.kind === "add_fill_triangle" || node.kind === "points_on_each_offset"
                || node.kind === "add_bezier_4" || node.kind === "add_bezier_curve" || node.kind === "add_bezier_curve_multi"
                || node.kind === "apply_bezier_distribution" || node.kind === "add_bezier_circle_preset") {
                const mirrorBtn = iconBtn("⇋", () => {
                    if (selectedNodeIds.size > 1 && selectedNodeIds.has(node.id) && typeof mirrorCopyFocusedCardAction === "function") {
                        if (mirrorCopyFocusedCardAction()) return;
                    }
                    const cloned = mirrorCopyNode(node, getMirrorPlane());
                    if (!cloned) return;
                    historyCapture("mirror_copy");
                    siblings.splice(idx + 1, 0, cloned);
                    renderAll();
                    if (typeof showToast === "function") showToast(`已镜像粘贴 1 张卡片（${getMirrorPlaneInfo().label}）`, "success");
                    requestAnimationFrame(() => {
                        const el = elCardsRoot.querySelector(`.card[data-id="${cloned.id}"]`);
                        if (el) {
                            try { el.focus(); } catch {}
                            try { el.scrollIntoView({ block: "nearest" }); } catch {}
                            setFocusedNode(cloned.id, false);
                        }
                    });
                });
                mirrorBtn.dataset.mirrorBtn = "1";
                mirrorBtn.title = `镜像复制（${getMirrorPlaneInfo().label}）`;
                actions.appendChild(mirrorBtn);
            }
        }

        // ✅ 复制卡片：在当前卡片下方插入一张一模一样的（含子卡片/terms）
        const copyBtn = iconBtn("⧉", () => {
            if (selectedNodeIds.size > 1 && selectedNodeIds.has(node.id) && typeof copyFocusedCardAction === "function") {
                if (copyFocusedCardAction()) return;
            }
            historyCapture("copy_card");
            const cloned = cloneNodeDeep(node);
            siblings.splice(idx + 1, 0, cloned);
            renderAll();
            if (typeof showToast === "function") showToast("已粘贴 1 张卡片", "success");

            // 尝试把焦点放到新卡片，方便继续编辑
            requestAnimationFrame(() => {
                const el = elCardsRoot.querySelector(`.card[data-id="${cloned.id}"]`);
                if (el) {
                    el.focus();
                    try { el.scrollIntoView({ block: "nearest" }); } catch {}
                }
            });
        });
        copyBtn.title = "复制";
        actions.appendChild(copyBtn);

        const delBtn = iconBtn("🗑", () => {
            historyCapture("delete_card");
            siblings.splice(idx, 1);
            // 如果删的是当前聚焦卡片：把焦点挪到更合理的位置（不额外写历史）
            if (getFocusedNodeId() === node.id) {
                const next = pickReasonableFocusAfterDelete({ parentList: siblings, index: idx, parentNode: ownerNode });
                setFocusedNode(next, false);
            }
            ensureAxisEverywhere();
            renderAll();
        }, true);
        delBtn.title = "删除";
        actions.appendChild(delBtn);

        head.appendChild(title);
        head.appendChild(actions);

        if (renderCardParamsInline) {
            const body = document.createElement("div");
            body.className = "card-body";
            if (Number.isFinite(node.bodyHeight) && !node.collapsed) {
                body.style.height = `${node.bodyHeight}px`;
                body.style.maxHeight = `${node.bodyHeight}px`;
            }

            if (def?.desc) {
                const d = document.createElement("div");
                d.className = "pill";
                d.textContent = def.desc;
                body.appendChild(d);
            }
            renderParamsEditors(body, node, ownerLabel);
            card.appendChild(head);
            card.appendChild(body);
            const resizer = document.createElement("div");
            resizer.className = "card-resizer";
            bindCardBodyResizer(resizer, body, node);
            card.appendChild(resizer);
        } else {
            card.appendChild(head);
        }

        // ✅ 聚焦高亮：卡片获得焦点时，让对应新增的粒子变色
        card.tabIndex = 0; // 让卡片标题区也可获得焦点（点击空白处也算聚焦）
        card.addEventListener("pointerdown", (e) => {
            if (e.button !== 0) return;
            // ✅ 避免 addBuilder 父卡片接管子卡片：只响应“事件发生在当前卡片自身区域”
            const inner = e.target && e.target.closest ? e.target.closest(".card") : null;
            if (inner && inner !== card) return;
            const append = !!(e.ctrlKey || e.metaKey);
            if (e.shiftKey && selectionAnchorNodeId) {
                const rangeIds = buildRangeNodeIds(selectionAnchorNodeId, node.id, siblings, scopeId);
                setSelectedNodeIds(rangeIds, {
                    replace: !append,
                    focus: false,
                    syncWithParamSync: false,
                    updateAnchor: false
                });
            } else {
                setSelectedNodeIds([node.id], {
                    replace: !append,
                    focus: false,
                    syncWithParamSync: false,
                    anchorId: node.id
                });
            }
            if (isSyncSelectableEvent(e)) toggleSyncTarget(node);
            setFocusedNode(node.id);
        });
        card.addEventListener("dblclick", (e) => {
            if (getIsRenderingCards()) return;
            const inner = e.target && e.target.closest ? e.target.closest(".card") : null;
            if (inner && inner !== card) return;
            const tag = e.target && e.target.tagName ? String(e.target.tagName).toUpperCase() : "";
            if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || tag === "BUTTON") return;
            if (e.target && e.target.isContentEditable) return;
            if (e.target && e.target.closest && e.target.closest(".card-actions")) return;
            setFocusedNode(node.id);
            if (isBuilderContainerKind(node.kind)) {
                historyCapture("toggle_tree_collapse");
                node.treeCollapsed = node.treeCollapsed !== true;
                renderAll();
            }
        });
        card.addEventListener("focusin", (e) => {
            // ✅ focusin 会冒泡：子卡片获得焦点时，父卡片不应抢走高亮
            const inner = e.target && e.target.closest ? e.target.closest(".card") : null;
            if (inner && inner !== card) return;
            setFocusedNode(node.id);
        });
        card.addEventListener("focusout", (e) => {
            if (getIsRenderingCards()) return;
            if (getSuppressCardFocusOutClear()) return;
            const next = e.relatedTarget;
            if (next && card.contains(next)) return;
            // 延迟一帧：避免同卡片内切换焦点时误清空
            requestAnimationFrame(() => {
                const ae = document.activeElement;
                if (ae && card.contains(ae)) return;
                const nextCard = ae && ae.closest ? ae.closest(".card") : null;
                if (!nextCard || nextCard === card) return;
                clearFocusedNodeIf(node.id);
            });
        });

        setupDnD(handle, card, node, siblings, () => idx, ownerNode);
        return card;
    }

    function captureCardPositionsIn(containerEl) {
        const map = new Map();
        if (!containerEl) return map;
        containerEl.querySelectorAll(".card[data-id]").forEach((el) => {
            map.set(el.dataset.id, el.getBoundingClientRect());
        });
        return map;
    }

    function applyCardSwapAnimationIn(containerEl, prevPositions) {
        if (!prevPositions || !prevPositions.size || !containerEl) return;
        const moving = [];
        containerEl.querySelectorAll(".card[data-id]").forEach((el) => {
            if (el.classList.contains("dragging")) return;
            const prev = prevPositions.get(el.dataset.id);
            if (!prev) return;
            const next = el.getBoundingClientRect();
            const dx = prev.left - next.left;
            const dy = prev.top - next.top;
            if (dx || dy) moving.push(el);
        });
        if (!moving.length) return;
        moving.forEach((el) => {
            if (el.__pbDragSwapTimer) clearTimeout(el.__pbDragSwapTimer);
            el.classList.remove("drag-swap-highlight");
            void el.offsetWidth;
            el.classList.add("drag-swap-highlight");
            el.__pbDragSwapTimer = setTimeout(() => {
                el.classList.remove("drag-swap-highlight");
                el.__pbDragSwapTimer = 0;
            }, 320);
        });
    }

    function captureCardPositions() {
        return captureCardPositionsIn(elCardsRoot);
    }

    function applyCardSwapAnimation(prevPositions) {
        applyCardSwapAnimationIn(elCardsRoot, prevPositions);
    }

    function renderNodeTree(node, siblings, idx, ownerLabel, ownerNode = null, depth = 0) {
        const wrap = document.createElement("div");
        wrap.className = `pb-tree-node depth-${Math.min(6, Math.max(0, depth | 0))}`;
        wrap.appendChild(renderNodeCard(node, siblings, idx, ownerLabel, ownerNode));

        if (node && isBuilderContainerKind(node.kind)) {
            if (!Array.isArray(node.children)) node.children = [];
            const childrenVisible = renderCardParamsInline ? !node.collapsed : node.treeCollapsed !== true;
            const children = document.createElement("div");
            children.className = "pb-tree-children builder-drop-surface";
            if (!childrenVisible) children.classList.add("collapsed");
            if (!node.children.length) children.classList.add("empty");
            setupListDropZone(children, () => node.children, () => node);

            const entries = getVisibleEntries(node.children, node.id)
                || node.children.map((child, index) => ({ node: child, index }));
            for (const it of entries) {
                children.appendChild(renderNodeTree(it.node, node.children, it.index, "子Builder", node, depth + 1));
            }
            wrap.appendChild(children);
        }

        return wrap;
    }

    function renderCards() {
        const pruned = pruneSelectedNodeIds();
        setIsRenderingCards(true);
        const prevPositions = pendingCardSwapAnim ? captureCardPositions() : null;
        try {
            elCardsRoot.innerHTML = "";
            cleanupFilterMenus();
            const scopeCtx = getCurrentCardScopeContext();
            const list = scopeCtx.list || [];
            updateScopeToolbar(scopeCtx);
            elCardsRoot.appendChild(renderScopeBar(scopeCtx));
            const tree = document.createElement("div");
            tree.className = "pb-tree";
            const entries = getVisibleEntries(list, scopeCtx.scopeId) || list.map((node, index) => ({ node, index }));
            for (const it of entries) {
                tree.appendChild(renderNodeTree(it.node, list, it.index, scopeCtx.label || "主Builder", scopeCtx.ownerNode || null, 0));
            }
            elCardsRoot.appendChild(tree);
        } finally {
            setIsRenderingCards(false);
        }
        // DOM 重建后重新标记聚焦高亮
        updateFocusCardUI();
        if (pruned) notifyCardSelectionChange();
        requestAnimationFrame(() => {
            if (prevPositions) applyCardSwapAnimation(prevPositions);
            layoutActionOverflow();
        });
        pendingCardSwapAnim = false;
    }

    function renderBezierNodeEditors(body, node, options = {}) {
        const params = node.params || (node.params = {});
        if (!Array.isArray(params.nodes)) params.nodes = [];
        const fixedCount = Number.isInteger(options.fixedCount) ? options.fixedCount : null;
        const list = document.createElement("div");
        list.className = "pb-bezier-node-list";
        const rebuild = () => rebuildPreviewAndKotlin();
        const render = () => {
            list.innerHTML = "";
            params.nodes.forEach((item, index) => {
                const entry = document.createElement("div");
                entry.className = "pb-bezier-node-entry subblock";
                const head = document.createElement("div");
                head.className = "subblock-head";
                const label = document.createElement("div");
                label.className = "subblock-title";
                label.textContent = `节点 ${index + 1}`;
                const del = document.createElement("button");
                del.type = "button";
                del.className = "iconbtn danger";
                del.textContent = "x";
                del.title = "删除节点";
                del.disabled = fixedCount !== null;
                del.addEventListener("click", () => {
                    if (typeof deleteBezierNodeAt === "function") {
                        deleteBezierNodeAt(node.id, index);
                        return;
                    }
                    historyCapture("delete_bezier_node");
                    params.nodes.splice(index, 1);
                    render();
                    rebuild();
                });
                head.appendChild(label);
                head.appendChild(del);
                entry.appendChild(head);
                entry.appendChild(row("point", makeVec3Editor(item, "", rebuild, "point")));
                entry.appendChild(row("startHandle", makeVec3Editor(item, "sh", rebuild, "startHandle")));
                entry.appendChild(row("endHandle", makeVec3Editor(item, "eh", rebuild, "endHandle")));
                list.appendChild(entry);
            });
            if (!params.nodes.length) {
                const empty = document.createElement("div");
                empty.className = "pill";
                empty.textContent = "尚未添加节点";
                list.appendChild(empty);
            }
        };
        const add = document.createElement("button");
        add.type = "button";
        add.className = "btn small primary";
        add.textContent = "＋ 添加节点";
        add.disabled = fixedCount !== null && params.nodes.length >= fixedCount;
        add.addEventListener("click", () => {
            if (fixedCount !== null && params.nodes.length >= fixedCount) return;
            historyCapture("add_bezier_node");
            const prev = params.nodes[params.nodes.length - 1];
            params.nodes.push({ x: Number(prev?.x) || 0, y: Number(prev?.y) || 0, z: Number(prev?.z) || 0, shx: 0, shy: 0, shz: 0, ehx: 0, ehy: 0, ehz: 0 });
            render();
            rebuild();
        });
        body.appendChild(add);
        body.appendChild(list);
        render();
    }

    function renderBezierDistributionChildren(body, node, options) {
        if (!Array.isArray(node.children)) node.children = [];
        if (!options?.paramsOnly) body.appendChild(renderBuilderScopeEntry(node));
        if (options?.paramsOnly) return;
        const note = document.createElement("div");
        note.className = "pill";
        note.textContent = "此卡片只能添加组类卡片，子组内再编辑具体点集。";
        body.appendChild(note);
        const addGroup = document.createElement("button");
        addGroup.type = "button";
        addGroup.className = "btn small primary";
        addGroup.textContent = "＋ 添加子组";
        addGroup.addEventListener("click", () => openModal(node.children, node.children.length, "空间贝塞尔分布子组", node.id, {
            allowedKinds: ["add_builder", "add_with", "clear_as_mask", "apply_bezier_distribution"]
        }));
        body.appendChild(addGroup);
        const list = document.createElement("div");
        list.className = "subcards pb-bezier-distribution-children";
        setupListDropZone(list, () => node.children, () => node);
        node.children.forEach((child, index) => list.appendChild(renderNodeCard(child, node.children, index, "分布子组", node)));
        body.appendChild(list);
    }

    function renderParamsEditors(body, node, ownerLabel, options = null) {
        const p = node.params;
        const opts = options || {};
        if (typeof setTipKind === "function") setTipKind(node.kind);
        switch (node.kind) {
            case "axis":
                body.appendChild(row("axis", makeVec3Editor(p, "", rebuildPreviewAndKotlin, "axis")));
                break;

            case "scale":
                body.appendChild(row("factor", inputNum(p.factor, v => {
                    p.factor = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "rotate_as_axis":
                body.appendChild(row("角度", angleInput(p, "deg", rebuildPreviewAndKotlin)));
                body.appendChild(row("自定义轴", checkbox(p.useCustomAxis, v => {
                    p.useCustomAxis = v;
                    renderAll();
                })));
                if (p.useCustomAxis) {
                    body.appendChild(row("ax", inputNum(p.ax, v => {
                        p.ax = v;
                        rebuildPreviewAndKotlin();
                    })));
                    body.appendChild(row("ay", inputNum(p.ay, v => {
                        p.ay = v;
                        rebuildPreviewAndKotlin();
                    })));
                    body.appendChild(row("az", inputNum(p.az, v => {
                        p.az = v;
                        rebuildPreviewAndKotlin();
                    })));
                }
                break;

            case "rotate_to":
                body.appendChild(row("模式", select([["toVec", "目标向量"], ["originEnd", "origin+end"]], p.mode, v => {
                    p.mode = v;
                    renderAll();
                })));
                if (p.mode === "originEnd") {
                    body.appendChild(row("origin", makeVec3Editor(p, "o", rebuildPreviewAndKotlin, "origin")));
                    body.appendChild(row("end", makeVec3Editor(p, "e", rebuildPreviewAndKotlin, "end")));
                } else {
                    body.appendChild(row("to", makeVec3Editor(p, "to", rebuildPreviewAndKotlin, "to")));
                }
                break;

            case "add_point":
                body.appendChild(row("point", makeVec3Editor(p, "", rebuildPreviewAndKotlin, "point")));
                break;

            case "clear_as_mask": {
                body.appendChild(row("maskRange", inputNum(p.maskRange, v => {
                    p.maskRange = v;
                    rebuildPreviewAndKotlin();
                })));
                {
                    const note = document.createElement("div");
                    note.className = "pb-builder-entry";
                    note.style.margin = "6px 0 10px";
                    note.style.opacity = ".82";
                    note.textContent = "组内子卡片正常生成点，这些点会遮罩清理它之前的点";
                    body.appendChild(note);
                }
                if (!opts.paramsOnly) body.appendChild(renderBuilderScopeEntry(node));
                if (opts.paramsOnly) break;
                if (!node.folded) {
                    const block = document.createElement("div");
                    block.className = "subblock";
                    block.classList.add("builder-drop-surface");
                    if (Number.isFinite(node.subWidth)) {
                        const w = Math.max(240, node.subWidth);
                        node.subWidth = w;
                        block.style.width = `${w}px`;
                    }
                    setupListDropZone(block, () => node.children, () => node);

                    const head = document.createElement("div");
                    head.className = "subblock-head";

                    const title = document.createElement("div");
                    title.className = "subblock-title";
                    const getSubblockTitle = () => node.label || "遮罩组";
                    const titleText = document.createElement("span");
                    titleText.className = "subblock-title-text subblock-title-label";
                    titleText.textContent = getSubblockTitle();
                    titleText.title = "右键重命名，或选中后按 F2";
                    const beginSubblockTitleEdit = (ev) => {
                        ev?.stopPropagation?.();
                        if (titleText.dataset.editing === "1") return;
                        titleText.dataset.editing = "1";
                        const titleInput = document.createElement("input");
                        titleInput.className = "subblock-title-input";
                        titleInput.value = node.label || "";
                        titleInput.placeholder = getSubblockTitle();
                        titleInput.title = "回车确认，Esc 取消";
                        let done = false;
                        const finish = (commit = true) => {
                            if (done) return;
                            done = true;
                            if (commit) {
                                node.label = String(titleInput.value || "").trim();
                                if (typeof historyCapture === "function") historyCapture("rename_builder_group");
                                if (typeof rebuildPreviewAndKotlin === "function") rebuildPreviewAndKotlin();
                            }
                            titleText.dataset.editing = "";
                            titleText.textContent = getSubblockTitle();
                            if (titleInput.parentNode) titleInput.replaceWith(titleText);
                        };
                        titleInput.addEventListener("pointerdown", (e) => e.stopPropagation());
                        titleInput.addEventListener("click", (e) => e.stopPropagation());
                        titleInput.addEventListener("keydown", (e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                finish(true);
                            } else if (e.key === "Escape") {
                                e.preventDefault();
                                finish(false);
                            }
                        });
                        titleInput.addEventListener("blur", () => finish(true), { once: true });
                        titleText.replaceWith(titleInput);
                        requestAnimationFrame(() => {
                            titleInput.focus();
                            titleInput.select();
                        });
                    };
                    card.__pbBeginRename = beginSubblockTitleEdit;
                    title.title = "右键重命名，或选中后按 F2";
                    title.addEventListener("pointerdown", (ev) => ev.stopPropagation());
                    title.appendChild(titleText);

                    const actions = document.createElement("div");
                    actions.className = "mini";

                    const exportBtn = document.createElement("button");
                    exportBtn.className = "btn small";
                    exportBtn.textContent = "导出JSON";
                    exportBtn.title = "导出当前子 Builder 的 JSON";
                    exportBtn.addEventListener("click", () => {
                        const out = {root: {id: "root", kind: "ROOT", children: deepClone(node.children || [])}};
                        downloadText("clearAsMaskBuilder.json", JSON.stringify(out, null, 2), "application/json");
                    });

                    const importBtn = document.createElement("button");
                    importBtn.className = "btn small";
                    importBtn.textContent = "导入JSON";
                    importBtn.title = "导入后将覆盖当前子 Builder 内容";
                    importBtn.addEventListener("click", () => {
                        if (!fileBuilderJson) return;
                        setBuilderJsonTargetNode(node);
                        fileBuilderJson.click();
                    });
                    const ioHint = document.createElement("span");
                    ioHint.style.fontSize = "11px";
                    ioHint.style.opacity = ".72";
                    ioHint.textContent = "提示：先点击该卡片，再点“添加卡片”可在此卡片内新增";
                    ioHint.title = "点击卡片后再点击添加卡片，即可在当前子 Builder 内添加卡片";

                    actions.appendChild(exportBtn);
                    actions.appendChild(importBtn);
                    actions.appendChild(ioHint);

                    head.appendChild(title);
                    head.appendChild(actions);

                    const sub = document.createElement("div");
                    sub.className = "subcards";
                    if (Number.isFinite(node.subHeight)) {
                        const h = Math.max(120, node.subHeight);
                        node.subHeight = h;
                        sub.style.height = `${h}px`;
                        sub.style.maxHeight = `${h}px`;
                    }
                    setupListDropZone(sub, () => node.children, () => node);

                    const list = node.children || [];
                    const entries = getVisibleEntries(list, node.id) || list.map((node, index) => ({ node, index }));
                    for (const it of entries) {
                        sub.appendChild(renderNodeCard(it.node, list, it.index, "子Builder", node));
                    }

                    block.appendChild(head);
                    block.appendChild(sub);

                    const zone = document.createElement("div");
                    zone.className = "dropzone";
                    zone.textContent = "拖到这里 → 放进 遮罩组 子列表（可拖回主列表）";
                    bindSubDropZone(zone, node.children, node);
                    block.appendChild(zone);

                    const heightResizer = document.createElement("div");
                    heightResizer.className = "subblock-resizer-y";
                    bindSubblockHeightResizer(heightResizer, sub, node);
                    block.appendChild(heightResizer);

                    const widthResizer = document.createElement("div");
                    widthResizer.className = "subblock-resizer";
                    bindSubblockWidthResizer(widthResizer, block, node);
                    block.appendChild(widthResizer);

                    body.appendChild(block);
                } else if (!opts.paramsOnly) {
                    const zone = document.createElement("div");
                    zone.className = "dropzone";
                    zone.textContent = "拖到这里 → 放进 遮罩组 子列表";
                    bindSubDropZone(zone, node.children, node);
                    body.appendChild(zone);
                }
                break;
            }

            case "clear_as_ball_mask":
                body.appendChild(row("origin", makeVec3Editor(p, "o", rebuildPreviewAndKotlin, "origin")));
                body.appendChild(row("radius", inputNum(p.radius, v => {
                    p.radius = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "clear_as_round_xz_mask":
                body.appendChild(row("origin", makeVec3Editor(p, "o", rebuildPreviewAndKotlin, "origin")));
                body.appendChild(row("radius", inputNum(p.radius, v => {
                    p.radius = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("yAxisRange", inputNum(p.yAxisRange, v => {
                    p.yAxisRange = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "add_circle":
                body.appendChild(row("r", inputNum(p.r, v => {
                    p.r = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("offset", makeVec3Editor(p, "o", rebuildPreviewAndKotlin, "offset")));
                break;

            case "add_discrete_circle_xz":
                body.appendChild(row("r", inputNum(p.r, v => {
                    p.r = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("discrete", inputNum(p.discrete, v => {
                    p.discrete = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("seed", checkbox(p.seedEnabled, v => {
                    p.seedEnabled = v;
                    renderAll();
                })));
                if (p.seedEnabled) body.appendChild(row("seed值", inputNum(p.seed, v => {
                    p.seed = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("offset", makeVec3Editor(p, "o", rebuildPreviewAndKotlin, "offset")));
                break;

            case "add_half_circle":
                body.appendChild(row("r", inputNum(p.r, v => {
                    p.r = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("rotate", checkbox(p.useRotate, v => {
                    p.useRotate = v;
                    renderAll();
                })));
                if (p.useRotate) body.appendChild(row("角度", angleInput(p, "rotateDeg", rebuildPreviewAndKotlin)));
                body.appendChild(row("offset", makeVec3Editor(p, "o", rebuildPreviewAndKotlin, "offset")));
                break;

            case "add_radian_center":
                body.appendChild(row("r", inputNum(p.r, v => {
                    p.r = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("radian", angleInput(p, "radianDeg", rebuildPreviewAndKotlin)));
                body.appendChild(row("rotate", checkbox(p.useRotate, v => {
                    p.useRotate = v;
                    renderAll();
                })));
                if (p.useRotate) body.appendChild(row("rotate角度", angleInput(p, "rotateDeg", rebuildPreviewAndKotlin)));
                body.appendChild(row("offset", makeVec3Editor(p, "o", rebuildPreviewAndKotlin, "offset")));
                break;

            case "add_radian":
                body.appendChild(row("r", inputNum(p.r, v => {
                    p.r = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("start", angleInput(p, "startDeg", rebuildPreviewAndKotlin)));
                body.appendChild(row("end", angleInput(p, "endDeg", rebuildPreviewAndKotlin)));
                body.appendChild(row("rotate", checkbox(p.useRotate, v => {
                    p.useRotate = v;
                    renderAll();
                })));
                if (p.useRotate) body.appendChild(row("rotate角度", angleInput(p, "rotateDeg", rebuildPreviewAndKotlin)));
                body.appendChild(row("offset", makeVec3Editor(p, "o", rebuildPreviewAndKotlin, "offset")));
                break;

            case "add_ball":
                body.appendChild(row("r", inputNum(p.r, v => {
                    p.r = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("countPow", inputNum(p.countPow, v => {
                    p.countPow = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("offset", makeVec3Editor(p, "o", rebuildPreviewAndKotlin, "offset")));
                break;

            case "add_ball_surface":
            case "add_ball_solid":
            case "add_ball_volume":
                body.appendChild(row("r", inputNum(p.r, v => {
                    p.r = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("offset", makeVec3Editor(p, "o", rebuildPreviewAndKotlin, "offset")));
                break;

            case "add_cube_surface":
                body.appendChild(row("尺寸模式", select([
                    ["uniform", "等边尺寸"],
                    ["dimensions", "长 / 高 / 深"]
                ], p.sizeMode, v => {
                    p.sizeMode = v;
                    renderAll();
                })));
                if (p.sizeMode === "dimensions") {
                    body.appendChild(row("width", inputNum(p.width, v => {
                        p.width = v;
                        rebuildPreviewAndKotlin();
                    })));
                    body.appendChild(row("height", inputNum(p.height, v => {
                        p.height = v;
                        rebuildPreviewAndKotlin();
                    })));
                    body.appendChild(row("depth", inputNum(p.depth, v => {
                        p.depth = v;
                        rebuildPreviewAndKotlin();
                    })));
                } else {
                    body.appendChild(row("size", inputNum(p.size, v => {
                        p.size = v;
                        rebuildPreviewAndKotlin();
                    })));
                }
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("offset", makeVec3Editor(p, "o", rebuildPreviewAndKotlin, "offset")));
                break;

            case "add_ring":
                body.appendChild(row("r", inputNum(p.r, v => {
                    p.r = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("thickness", inputNum(p.thickness, v => {
                    p.thickness = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("discrete", inputNum(p.discrete, v => {
                    p.discrete = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "add_line":
                body.appendChild(row("start", makeVec3Editor(p, "s", rebuildPreviewAndKotlin, "start")));
                body.appendChild(row("end", makeVec3Editor(p, "e", rebuildPreviewAndKotlin, "end")));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "add_dotted_line":
                body.appendChild(row("target", makeVec3Editor(p, "t", rebuildPreviewAndKotlin, "target")));
                body.appendChild(row("totalCount", inputNum(p.totalCount, v => {
                    p.totalCount = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("dottedCount", inputNum(p.dottedCount, v => {
                    p.dottedCount = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("emptyStep", inputNum(p.emptyStep, v => {
                    p.emptyStep = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("offset", makeVec3Editor(p, "o", rebuildPreviewAndKotlin, "offset")));
                break;

            case "add_fill_triangle":
                body.appendChild(row("p1", makeVec3Editor(p, "p1", rebuildPreviewAndKotlin, "p1")));
                body.appendChild(row("p2", makeVec3Editor(p, "p2", rebuildPreviewAndKotlin, "p2")));
                body.appendChild(row("p3", makeVec3Editor(p, "p3", rebuildPreviewAndKotlin, "p3")));
                body.appendChild(row("sampler", inputNum(p.sampler, v => {
                    p.sampler = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "add_bezier_curve":
                body.appendChild(row("end", makeVec3Editor(p, "e", rebuildPreviewAndKotlin, "end")));
                body.appendChild(row("startHandle", makeVec3Editor(p, "sh", rebuildPreviewAndKotlin, "startHandle")));
                body.appendChild(row("endHandle", makeVec3Editor(p, "eh", rebuildPreviewAndKotlin, "endHandle")));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "add_bezier":
                body.appendChild(row("p1", makeVec3Editor(p, "p1", rebuildPreviewAndKotlin, "p1")));
                body.appendChild(row("p2", makeVec3Editor(p, "p2", rebuildPreviewAndKotlin, "p2")));
                body.appendChild(row("p3", makeVec3Editor(p, "p3", rebuildPreviewAndKotlin, "p3")));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "add_bezier_4":
                body.appendChild(row("start", makeVec3Editor(p, "s", rebuildPreviewAndKotlin, "start")));
                body.appendChild(row("end", makeVec3Editor(p, "e", rebuildPreviewAndKotlin, "end")));
                body.appendChild(row("startHandle", makeVec3Editor(p, "sh", rebuildPreviewAndKotlin, "startHandle")));
                body.appendChild(row("endHandle", makeVec3Editor(p, "eh", rebuildPreviewAndKotlin, "endHandle")));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "add_bezier_curve_multi":
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("闭合连接", checkbox(!!p.closed, v => {
                    p.closed = !!v;
                    if (p.closed && typeof connectBezierClosure === "function") connectBezierClosure(node);
                    rebuildPreviewAndKotlin();
                })));
                renderBezierNodeEditors(body, node);
                break;

            case "apply_bezier_distribution":
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("闭合连接", checkbox(!!p.closed, v => {
                    p.closed = !!v;
                    if (p.closed && typeof connectBezierClosure === "function") connectBezierClosure(node);
                    rebuildPreviewAndKotlin();
                })));
                renderBezierNodeEditors(body, node);
                renderBezierDistributionChildren(body, node, opts);
                break;

            case "add_bezier_circle_preset":
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                renderBezierNodeEditors(body, node);
                break;

            case "add_broken_line":
                body.appendChild(row("p1", makeVec3Editor(p, "p1", rebuildPreviewAndKotlin, "p1")));
                body.appendChild(row("p2", makeVec3Editor(p, "p2", rebuildPreviewAndKotlin, "p2")));
                body.appendChild(row("p3", makeVec3Editor(p, "p3", rebuildPreviewAndKotlin, "p3")));
                body.appendChild(row("count1", inputNum(p.count1, v => {
                    p.count1 = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("count2", inputNum(p.count2, v => {
                    p.count2 = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "add_polygon":
                body.appendChild(row("r", inputNum(p.r, v => {
                    p.r = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("sideCount", inputNum(p.sideCount, v => {
                    p.sideCount = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("offset", makeVec3Editor(p, "o", rebuildPreviewAndKotlin, "offset")));
                break;

            case "add_polygon_in_circle":
                body.appendChild(row("n", inputNum(p.n, v => {
                    p.n = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("edgeCount", inputNum(p.edgeCount, v => {
                    p.edgeCount = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("r", inputNum(p.r, v => {
                    p.r = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("offset", makeVec3Editor(p, "o", rebuildPreviewAndKotlin, "offset")));
                break;

            case "add_dotted_circle":
                body.appendChild(row("r", inputNum(p.r, v => {
                    p.r = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("totalCount", inputNum(p.totalCount, v => {
                    p.totalCount = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("dottedCount", inputNum(p.dottedCount, v => {
                    p.dottedCount = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("emptyStep", inputNum(p.emptyStep, v => {
                    p.emptyStep = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("offset", makeVec3Editor(p, "o", rebuildPreviewAndKotlin, "offset")));
                break;

            case "add_round_shape":
                body.appendChild(row("r", inputNum(p.r, v => {
                    p.r = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("step", inputNum(p.step, v => {
                    p.step = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("mode", select(
                    [["fixed", "fixed"], ["range", "range"]],
                    p.mode,
                    v => {
                        p.mode = v;
                        renderAll();
                    }
                )));
                if (p.mode === "range") {
                    body.appendChild(row("minCircleCount", inputNum(p.minCircleCount, v => {
                        p.minCircleCount = v;
                        rebuildPreviewAndKotlin();
                    })));
                    body.appendChild(row("maxCircleCount", inputNum(p.maxCircleCount, v => {
                        p.maxCircleCount = v;
                        rebuildPreviewAndKotlin();
                    })));
                } else {
                    body.appendChild(row("preCircleCount", inputNum(p.preCircleCount, v => {
                        p.preCircleCount = v;
                        rebuildPreviewAndKotlin();
                    })));
                }
                body.appendChild(row("offset", makeVec3Editor(p, "o", rebuildPreviewAndKotlin, "offset")));
                break;

            case "add_rect":
                body.appendChild(row("w", inputNum(p.w, v => {
                    p.w = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("h", inputNum(p.h, v => {
                    p.h = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("countW", inputNum(p.countW, v => {
                    p.countW = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("countH", inputNum(p.countH, v => {
                    p.countH = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "add_arc":
                body.appendChild(row("r", inputNum(p.r, v => {
                    p.r = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("center", makeVec3Editor(p, "c", rebuildPreviewAndKotlin, "center")));
                body.appendChild(row("start", angleInput(p, "startDeg", rebuildPreviewAndKotlin)));
                body.appendChild(row("end", angleInput(p, "endDeg", rebuildPreviewAndKotlin)));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "add_lightning_points":
                body.appendChild(row("useStart", checkbox(p.useStart, v => {
                    p.useStart = v;
                    renderAll();
                })));
                if (p.useStart) {
                    body.appendChild(row("start", makeVec3Editor(p, "s", rebuildPreviewAndKotlin, "start")));
                }
                body.appendChild(row("end", makeVec3Editor(p, "e", rebuildPreviewAndKotlin, "end")));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("preLineCount", inputNum(p.preLineCount, v => {
                    p.preLineCount = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("useOffsetRange", checkbox(p.useOffsetRange, v => {
                    p.useOffsetRange = v;
                    renderAll();
                })));
                if (p.useOffsetRange) {
                    body.appendChild(row("offsetRange", inputNum(p.offsetRange, v => {
                        p.offsetRange = v;
                        rebuildPreviewAndKotlin();
                    })));
                }
                break;

            case "add_lightning_nodes":
                body.appendChild(row("useStart", checkbox(p.useStart, v => {
                    p.useStart = v;
                    renderAll();
                })));
                if (p.useStart) {
                    body.appendChild(row("start", makeVec3Editor(p, "s", rebuildPreviewAndKotlin, "start")));
                }
                body.appendChild(row("end", makeVec3Editor(p, "e", rebuildPreviewAndKotlin, "end")));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("useOffsetRange", checkbox(p.useOffsetRange, v => {
                    p.useOffsetRange = v;
                    renderAll();
                })));
                if (p.useOffsetRange) {
                    body.appendChild(row("offsetRange", inputNum(p.offsetRange, v => {
                        p.offsetRange = v;
                        rebuildPreviewAndKotlin();
                    })));
                }
                break;

            case "add_lightning_nodes_attenuation":
                body.appendChild(row("useStart", checkbox(p.useStart, v => {
                    p.useStart = v;
                    renderAll();
                })));
                if (p.useStart) {
                    body.appendChild(row("start", makeVec3Editor(p, "s", rebuildPreviewAndKotlin, "start")));
                }
                body.appendChild(row("end", makeVec3Editor(p, "e", rebuildPreviewAndKotlin, "end")));
                body.appendChild(row("counts", inputNum(p.counts, v => {
                    p.counts = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("maxOffset", inputNum(p.maxOffset, v => {
                    p.maxOffset = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("attenuation", inputNum(p.attenuation, v => {
                    p.attenuation = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("seed", checkbox(p.seedEnabled, v => {
                    p.seedEnabled = v;
                    renderAll();
                })));
                if (p.seedEnabled) {
                    body.appendChild(row("seed值", inputNum(p.seed, v => {
                        p.seed = v;
                        rebuildPreviewAndKotlin();
                    })));
                }
                break;

            case "apply_rotate":
                body.appendChild(row("angle", angleInput(p, "angleDeg", rebuildPreviewAndKotlin)));
                body.appendChild(row("axis", makeVec3Editor(p, "axis", rebuildPreviewAndKotlin, "axis")));
                body.appendChild(row("rotateAsAxis", checkbox(p.rotateAsAxis, v => {
                    p.rotateAsAxis = v;
                    renderAll();
                })));
                if (p.rotateAsAxis) body.appendChild(row("rotateAxis", makeVec3Editor(p, "rotAxis", rebuildPreviewAndKotlin, "rotateAxis")));
                break;

            case "apply_move":
                body.appendChild(row("offset", makeVec3Editor(p, "off", rebuildPreviewAndKotlin, "offset")));
                break;

            case "apply_rel_move":
                body.appendChild(row("offset", makeVec3Editor(p, "off", rebuildPreviewAndKotlin, "offset")));
                break;

            case "apply_scale":
                body.appendChild(row("scale", inputNum(p.scale, v => {
                    p.scale = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "apply_per_point_offset":
                body.appendChild(row("offset", makeVec3Editor(p, "off", rebuildPreviewAndKotlin, "offset")));
                break;

            case "apply_spiral_offset":
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("r", inputNum(p.r, v => {
                    p.r = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("height", inputNum(p.h, v => {
                    p.h = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("rotate", checkbox(p.useRotate, v => {
                    p.useRotate = v;
                    renderAll();
                })));
                if (p.useRotate) body.appendChild(row("rotate角度", angleInput(p, "rotateDeg", rebuildPreviewAndKotlin)));
                break;

            case "apply_random_offset":
                body.appendChild(row("min", inputNum(p.offsetLenMin, v => {
                    p.offsetLenMin = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("max", inputNum(p.offsetLenMax, v => {
                    p.offsetLenMax = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("seed", checkbox(p.seedEnabled, v => {
                    p.seedEnabled = v;
                    renderAll();
                })));
                if (p.seedEnabled) body.appendChild(row("seed值", inputNum(p.seed, v => {
                    p.seed = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "apply_noise_offset":
                body.appendChild(row("noiseX", inputNum(p.noiseX, v => {
                    p.noiseX = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("noiseY", inputNum(p.noiseY, v => {
                    p.noiseY = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("noiseZ", inputNum(p.noiseZ, v => {
                    p.noiseZ = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("mode", select(
                    [["AXIS_UNIFORM", "AXIS_UNIFORM"], ["SPHERE_UNIFORM", "SPHERE_UNIFORM"], ["SHELL_UNIFORM", "SHELL_UNIFORM"]],
                    p.mode,
                    v => {
                        p.mode = v;
                        rebuildPreviewAndKotlin();
                    }
                )));
                body.appendChild(row("seed", checkbox(p.seedEnabled, v => {
                    p.seedEnabled = v;
                    renderAll();
                })));
                if (p.seedEnabled) body.appendChild(row("seed值", inputNum(p.seed, v => {
                    p.seed = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("lenMin", checkbox(p.lenMinEnabled, v => {
                    p.lenMinEnabled = v;
                    renderAll();
                })));
                if (p.lenMinEnabled) body.appendChild(row("min值", inputNum(p.offsetLenMin, v => {
                    p.offsetLenMin = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("lenMax", checkbox(p.lenMaxEnabled, v => {
                    p.lenMaxEnabled = v;
                    renderAll();
                })));
                if (p.lenMaxEnabled) body.appendChild(row("max值", inputNum(p.offsetLenMax, v => {
                    p.offsetLenMax = v;
                    rebuildPreviewAndKotlin();
                })));
                break;

            case "points_on_each_offset":
                body.appendChild(row("offX", inputNum(p.offX, v => {
                    p.offX = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("offY", inputNum(p.offY, v => {
                    p.offY = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("offZ", inputNum(p.offZ, v => {
                    p.offZ = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("输出形式", select(
                    [["direct3", "it.add(x,y,z)"], ["newRel", "it.add(RelativeLocation)"], ["valRel", "val rel; it.add(rel)"]],
                    p.kotlinMode,
                    v => {
                        p.kotlinMode = v;
                        rebuildPreviewAndKotlin();
                    }
                )));
                break;

            case "add_with":
                if (!Array.isArray(node.children)) node.children = [];
                if (!opts.paramsOnly) body.appendChild(renderBuilderScopeEntry(node));
                body.appendChild(row("旋转半径 r", inputNum(p.r, v => {
                    p.r = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("置换个数 c", inputNum(p.c, v => {
                    p.c = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("rotateToCenter", checkbox(p.rotateToCenter, v => {
                    p.rotateToCenter = v;
                    renderAll();
                })));
                if (p.rotateToCenter) {
                    body.appendChild(row("反向", checkbox(p.rotateReverse, v => {
                        p.rotateReverse = v;
                        rebuildPreviewAndKotlin();
                    })));
                }
                body.appendChild(row("旋转偏移", checkbox(p.rotateOffsetEnabled, v => {
                    p.rotateOffsetEnabled = v;
                    renderAll();
                })));
                if (p.rotateOffsetEnabled) {
                    body.appendChild(row("偏移", makeVec3Editor(p, "ro", rebuildPreviewAndKotlin, "offset")));
                }
                body.appendChild(row("offset", makeVec3Editor(p, "o", rebuildPreviewAndKotlin, "offset")));
                body.appendChild(row("开启偏移前预览", checkbox(p.previewBeforeOffsetEnabled, v => {
                    p.previewBeforeOffsetEnabled = v;
                    rebuildPreviewAndKotlin();
                })));
                if (!opts.paramsOnly) {
                    body.appendChild(row("折叠子卡片", checkbox(node.folded, v => {
                        node.folded = v;
                        renderAll();
                    })));
                }
                if (!opts.paramsOnly && !node.folded) {
                    const block = document.createElement("div");
                    block.className = "subblock";
                    block.classList.add("builder-drop-surface");
                    if (Number.isFinite(node.subWidth)) {
                        const w = Math.max(240, node.subWidth);
                        node.subWidth = w;
                        block.style.width = `${w}px`;
                    }
                    setupListDropZone(block, () => node.children, () => node);

                    const head = document.createElement("div");
                    head.className = "subblock-head";

                    const title = document.createElement("div");
                    title.className = "subblock-title";
                    const getSubblockTitle = () => node.label || (node.kind === "add_builder" ? "添加组" : "旋转嵌套组");
                    const titleText = document.createElement("span");
                    titleText.className = "subblock-title-text subblock-title-label";
                    titleText.textContent = getSubblockTitle();
                    titleText.title = "右键重命名，或选中后按 F2";
                    const beginSubblockTitleEdit = (ev) => {
                        ev?.stopPropagation?.();
                        if (titleText.dataset.editing === "1") return;
                        titleText.dataset.editing = "1";
                        const titleInput = document.createElement("input");
                        titleInput.className = "subblock-title-input";
                        titleInput.value = node.label || "";
                        titleInput.placeholder = getSubblockTitle();
                        titleInput.title = "回车确认，Esc 取消";
                        let done = false;
                        const finish = (commit = true) => {
                            if (done) return;
                            done = true;
                            if (commit) {
                                node.label = String(titleInput.value || "").trim();
                                if (typeof historyCapture === "function") historyCapture("rename_builder_group");
                                if (typeof rebuildPreviewAndKotlin === "function") rebuildPreviewAndKotlin();
                            }
                            titleText.dataset.editing = "";
                            titleText.textContent = getSubblockTitle();
                            if (titleInput.parentNode) titleInput.replaceWith(titleText);
                        };
                        titleInput.addEventListener("pointerdown", (e) => e.stopPropagation());
                        titleInput.addEventListener("click", (e) => e.stopPropagation());
                        titleInput.addEventListener("keydown", (e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                finish(true);
                            } else if (e.key === "Escape") {
                                e.preventDefault();
                                finish(false);
                            }
                        });
                        titleInput.addEventListener("blur", () => finish(true), { once: true });
                        titleText.replaceWith(titleInput);
                        requestAnimationFrame(() => {
                            titleInput.focus();
                            titleInput.select();
                        });
                    };
                    card.__pbBeginRename = beginSubblockTitleEdit;
                    title.title = "右键重命名，或选中后按 F2";
                    title.addEventListener("pointerdown", (ev) => ev.stopPropagation());
                    title.appendChild(titleText);

                    const actions = document.createElement("div");
                    actions.className = "mini";

                    const exportBtn = document.createElement("button");
                    exportBtn.className = "btn small";
                    exportBtn.textContent = "导出JSON";
                    exportBtn.title = "导出当前子 Builder 的 JSON";
                    exportBtn.addEventListener("click", () => {
                        const out = {root: {id: "root", kind: "ROOT", children: deepClone(node.children || [])}};
                        downloadText("addWithBuilder.json", JSON.stringify(out, null, 2), "application/json");
                    });

                    const importBtn = document.createElement("button");
                    importBtn.className = "btn small";
                    importBtn.textContent = "导入JSON";
                    importBtn.title = "导入后将覆盖当前子 Builder 内容";
                    importBtn.addEventListener("click", () => {
                        if (!fileBuilderJson) return;
                        setBuilderJsonTargetNode(node);
                        fileBuilderJson.click();
                    });
                    const ioHint = document.createElement("span");
                    ioHint.style.fontSize = "11px";
                    ioHint.style.opacity = ".72";
                    ioHint.textContent = "提示：先点击该卡片，再点“添加卡片”可在此卡片内新增";
                    ioHint.title = "点击卡片后再点击添加卡片，即可在当前子 Builder 内添加卡片";

                    actions.appendChild(exportBtn);
                    actions.appendChild(importBtn);
                    actions.appendChild(ioHint);

                    head.appendChild(title);
                    head.appendChild(actions);

                    const sub = document.createElement("div");
                    sub.className = "subcards";
                    if (Number.isFinite(node.subHeight)) {
                        const h = Math.max(120, node.subHeight);
                        node.subHeight = h;
                        sub.style.height = `${h}px`;
                        sub.style.maxHeight = `${h}px`;
                    }
                    setupListDropZone(sub, () => node.children, () => node);

                    const list = node.children || [];
                    const entries = getVisibleEntries(list, node.id) || list.map((node, index) => ({ node, index }));
                    for (const it of entries) {
                        sub.appendChild(renderNodeCard(it.node, list, it.index, "子Builder", node));
                    }

                    block.appendChild(head);
                    block.appendChild(sub);

                    const zone = document.createElement("div");
                    zone.className = "dropzone";
                    zone.textContent = "拖到这里 → 放进 addWith 子列表（可拖回主列表）";
                    bindSubDropZone(zone, node.children, node);
                    block.appendChild(zone);

                    const heightResizer = document.createElement("div");
                    heightResizer.className = "subblock-resizer-y";
                    bindSubblockHeightResizer(heightResizer, sub, node);
                    block.appendChild(heightResizer);

                    const widthResizer = document.createElement("div");
                    widthResizer.className = "subblock-resizer";
                    bindSubblockWidthResizer(widthResizer, block, node);
                    block.appendChild(widthResizer);

                    body.appendChild(block);
                } else if (!opts.paramsOnly) {
                    const mini = document.createElement("div");
                    mini.className = "mini";
                    const exportBtn = document.createElement("button");
                    exportBtn.className = "btn small";
                    exportBtn.textContent = "导出JSON";
                    exportBtn.title = "导出当前子 Builder 的 JSON";
                    exportBtn.addEventListener("click", () => {
                        const out = {root: {id: "root", kind: "ROOT", children: deepClone(node.children || [])}};
                        downloadText("addWithBuilder.json", JSON.stringify(out, null, 2), "application/json");
                    });
                    const importBtn = document.createElement("button");
                    importBtn.className = "btn small";
                    importBtn.textContent = "导入JSON";
                    importBtn.title = "导入后将覆盖当前子 Builder 内容";
                    importBtn.addEventListener("click", () => {
                        if (!fileBuilderJson) return;
                        setBuilderJsonTargetNode(node);
                        fileBuilderJson.click();
                    });
                    const ioHint = document.createElement("span");
                    ioHint.style.fontSize = "11px";
                    ioHint.style.opacity = ".72";
                    ioHint.textContent = "提示：先点击该卡片，再点“添加卡片”可在此卡片内新增";
                    ioHint.title = "点击卡片后再点击添加卡片，即可在当前子 Builder 内添加卡片";
                    mini.appendChild(exportBtn);
                    mini.appendChild(importBtn);
                    mini.appendChild(ioHint);
                    body.appendChild(mini);

                    const zone = document.createElement("div");
                    zone.className = "dropzone";
                    zone.textContent = "拖到这里 → 放进 addWith 子列表";
                    bindSubDropZone(zone, node.children, node);
                    body.appendChild(zone);
                }
                break;

            case "add_builder":
                body.appendChild(row("offset", makeVec3Editor(p, "o", rebuildPreviewAndKotlin, "offset")));
                if (!opts.paramsOnly) body.appendChild(renderBuilderScopeEntry(node));
                if (opts.paramsOnly) break;
                if (!node.folded) {
                    const block = document.createElement("div");
                    block.className = "subblock";
                    block.classList.add("builder-drop-surface");
                    if (Number.isFinite(node.subWidth)) {
                        const w = Math.max(240, node.subWidth);
                        node.subWidth = w;
                        block.style.width = `${w}px`;
                    }
                    setupListDropZone(block, () => node.children, () => node);

                    const head = document.createElement("div");
                    head.className = "subblock-head";

                    const title = document.createElement("div");
                    title.className = "subblock-title";
                    const getSubblockTitle = () => node.label || "子 PointsBuilder（addBuilder）";
                    const titleText = document.createElement("span");
                    titleText.className = "subblock-title-text subblock-title-label";
                    titleText.textContent = getSubblockTitle();
                    titleText.title = "右键重命名，或选中后按 F2";
                    const beginSubblockTitleEdit = (ev) => {
                        ev?.stopPropagation?.();
                        if (titleText.dataset.editing === "1") return;
                        titleText.dataset.editing = "1";
                        const titleInput = document.createElement("input");
                        titleInput.className = "subblock-title-input";
                        titleInput.value = node.label || "";
                        titleInput.placeholder = getSubblockTitle();
                        titleInput.title = "回车确认，Esc 取消";
                        let done = false;
                        const finish = (commit = true) => {
                            if (done) return;
                            done = true;
                            if (commit) {
                                node.label = String(titleInput.value || "").trim();
                                if (typeof historyCapture === "function") historyCapture("rename_builder_group");
                                if (typeof rebuildPreviewAndKotlin === "function") rebuildPreviewAndKotlin();
                            }
                            titleText.dataset.editing = "";
                            titleText.textContent = getSubblockTitle();
                            if (titleInput.parentNode) titleInput.replaceWith(titleText);
                        };
                        titleInput.addEventListener("pointerdown", (e) => e.stopPropagation());
                        titleInput.addEventListener("click", (e) => e.stopPropagation());
                        titleInput.addEventListener("keydown", (e) => {
                            if (e.key === "Enter") {
                                e.preventDefault();
                                finish(true);
                            } else if (e.key === "Escape") {
                                e.preventDefault();
                                finish(false);
                            }
                        });
                        titleInput.addEventListener("blur", () => finish(true), { once: true });
                        titleText.replaceWith(titleInput);
                        requestAnimationFrame(() => {
                            titleInput.focus();
                            titleInput.select();
                        });
                    };
                    card.__pbBeginRename = beginSubblockTitleEdit;
                    title.title = "右键重命名，或选中后按 F2";
                    title.addEventListener("pointerdown", (ev) => ev.stopPropagation());
                    title.appendChild(titleText);

                    const actions = document.createElement("div");
                    actions.className = "mini";

                    const exportBtn = document.createElement("button");
                    exportBtn.className = "btn small";
                    exportBtn.textContent = "导出JSON";
                    exportBtn.title = "导出当前子 Builder 的 JSON";
                    exportBtn.addEventListener("click", () => {
                        const out = {root: {id: "root", kind: "ROOT", children: deepClone(node.children || [])}};
                        downloadText("addBuilder.json", JSON.stringify(out, null, 2), "application/json");
                    });

                    const importBtn = document.createElement("button");
                    importBtn.className = "btn small";
                    importBtn.textContent = "导入JSON";
                    importBtn.title = "导入后将覆盖当前子 Builder 内容";
                    importBtn.addEventListener("click", () => {
                        if (!fileBuilderJson) return;
                        setBuilderJsonTargetNode(node);
                        fileBuilderJson.click();
                    });
                    const ioHint = document.createElement("span");
                    ioHint.style.fontSize = "11px";
                    ioHint.style.opacity = ".72";
                    ioHint.textContent = "提示：先点击该卡片，再点“添加卡片”可在此卡片内新增";
                    ioHint.title = "点击卡片后再点击添加卡片，即可在当前子 Builder 内添加卡片";

                    actions.appendChild(exportBtn);
                    actions.appendChild(importBtn);
                    actions.appendChild(ioHint);

                    head.appendChild(title);
                    head.appendChild(actions);

                    const sub = document.createElement("div");
                    sub.className = "subcards";
                    if (Number.isFinite(node.subHeight)) {
                        const h = Math.max(120, node.subHeight);
                        node.subHeight = h;
                        sub.style.height = `${h}px`;
                        sub.style.maxHeight = `${h}px`;
                    }
                    setupListDropZone(sub, () => node.children, () => node);

                    const list = node.children || [];
                    const entries = getVisibleEntries(list, node.id) || list.map((node, index) => ({ node, index }));
                    for (const it of entries) {
                        sub.appendChild(renderNodeCard(it.node, list, it.index, "子Builder", node));
                    }

                    block.appendChild(head);
                    block.appendChild(sub);

                    const zone = document.createElement("div");
                    zone.className = "dropzone";
                    zone.textContent = "拖到这里 → 放进 addBuilder 子列表（可拖回主列表）";
                    bindSubDropZone(zone, node.children, node);
                    block.appendChild(zone);

                    const heightResizer = document.createElement("div");
                    heightResizer.className = "subblock-resizer-y";
                    bindSubblockHeightResizer(heightResizer, sub, node);
                    block.appendChild(heightResizer);

                    const widthResizer = document.createElement("div");
                    widthResizer.className = "subblock-resizer";
                    bindSubblockWidthResizer(widthResizer, block, node);
                    block.appendChild(widthResizer);

                    body.appendChild(block);
                } else {
                    const zone = document.createElement("div");
                    zone.className = "dropzone";
                    zone.textContent = "拖到这里 → 放进 addBuilder 子列表";
                    bindSubDropZone(zone, node.children, node);
                    body.appendChild(zone);
                }
                break;

            case "add_fourier_series":
                if (!opts.paramsOnly) {
                    body.appendChild(row("折叠", checkbox(node.folded, v => {
                        node.folded = v;
                        renderAll();
                    })));
                }
                body.appendChild(row("angle", angleInput(p, "angle", rebuildPreviewAndKotlin)));
                body.appendChild(row("scale", inputNum(p.scale, v => {
                    p.scale = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("count", inputNum(p.count, v => {
                    p.count = v;
                    rebuildPreviewAndKotlin();
                })));
                body.appendChild(row("offset", makeVec3Editor(p, "o", rebuildPreviewAndKotlin, "offset")));
                const showTerms = (!opts.paramsOnly || opts.includeFourierTerms) && !node.folded;
                if (showTerms) {
                    const sub = document.createElement("div");
                    if (!Array.isArray(node.terms)) node.terms = [];
                    const list = node.terms;
                    const denseTerms = list.length >= 3;
                    sub.className = `subcards fourier-terms${denseTerms ? " dense" : ""}`;
                    for (let i = 0; i < list.length; i++) {
                        sub.appendChild(renderFourierTermCard(node, i));
                    }
                    body.appendChild(sub);

                    const btn = document.createElement("button");
                    btn.className = "btn small";
                    btn.textContent = "添加 term";
                    btn.addEventListener("click", () => {
                        historyCapture("add_fourier_term");
                        list.push({id: makeUid(), r: 1, w: 1, startAngle: 0, startAngleUnit: "deg", collapsed: false, bodyHeight: null});
                        renderAll();
                    });
                    body.appendChild(btn);
                }
                break;
            default:
                break;
        }
        if (typeof setTipKind === "function") setTipKind(null);
    }

    bindInputTips();
    bindCardBoxSelection();
    return {
        renderCards,
        renderParamsEditors,
        layoutActionOverflow,
        initCollapseAllControls,
        setupListDropZone,
        addQuickOffsetTo,
        navigateCardScope,
        revealCardScopeById,
        getCurrentCardScopeContext,
        formatNodePathLabel,
        beginRenameNode,
        getSelectedNodeIds,
        setSelectedNodeIds,
        clearSelectedNodeIds
    };
}
