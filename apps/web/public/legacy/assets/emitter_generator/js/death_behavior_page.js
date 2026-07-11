import {
    createEmitterVar,
    createTickAction,
    createDeathVarAction,
    loadEmitterBehavior,
    saveEmitterBehavior,
    normalizeEmitterBehavior,
    genEmitterBehaviorKotlin,
    isValidEmitterVarName,
} from "./emitter_behavior.js";
import { escapeHtml, safeNum } from "./utils.js";

(() => {
    let state = normalizeEmitterBehavior(loadEmitterBehavior());

    function persist() {
        state = normalizeEmitterBehavior(state);
        saveEmitterBehavior(state);
    }

    function setCode(text) {
        const el = document.getElementById("deathKotlinOut");
        if (!el) return;
        const raw = String(text ?? "");
        const hl = window.CodeHighlighter && typeof window.CodeHighlighter.highlightKotlin === "function"
            ? window.CodeHighlighter.highlightKotlin
            : null;
        if (hl) el.innerHTML = hl(raw);
        else el.textContent = raw;
    }

    function renderCode() {
        setCode(genEmitterBehaviorKotlin(state));
    }

    function renderVarList() {
        const $list = $("#deathVarList");
        $list.empty();
        if (!state.emitterVars.length) {
            $list.append(`<div class="small">暂无变量。</div>`);
            return;
        }
        state.emitterVars.forEach((v) => {
            const row = `
<div class="kv-row" data-id="${escapeHtml(v.id)}">
  <input class="input deathVarInput" data-key="name" type="text" value="${escapeHtml(v.name)}" placeholder="变量名"/>
  <select class="input deathVarInput" data-key="type">
    <option value="double">Double</option>
    <option value="int">Int</option>
  </select>
  <input class="input deathVarInput" data-key="defaultValue" type="number" step="any" value="${escapeHtml(String(v.defaultValue))}" />
  <button class="btn small kv-del btnDelDeathVar" type="button">删除</button>
</div>`;
            $list.append(row);
        });
        $list.find('.deathVarInput[data-key="type"]').each((_, el) => {
            const id = $(el).closest(".kv-row").data("id");
            const item = state.emitterVars.find((it) => it.id === id);
            if (item) $(el).val(item.type);
        });
    }

    function renderTickList() {
        const $list = $("#deathTickList");
        $list.empty();
        if (!state.tickActions.length) {
            $list.append(`<div class="small">暂无 doTick 语句。</div>`);
            return;
        }
        state.tickActions.forEach((t) => {
            const row = `
<div class="kv-row-compact" data-id="${escapeHtml(t.id)}">
  <input class="input deathTickInput" data-key="expr" type="text" value="${escapeHtml(t.expr)}" placeholder="例如：counter += 1"/>
  <button class="btn small kv-del btnDelDeathTick" type="button">删除</button>
</div>`;
            $list.append(row);
        });
    }

    function renderDeathVarActions() {
        const $list = $("#deathVarActionList");
        $list.empty();
        const actions = Array.isArray(state.death.varActions) ? state.death.varActions : [];
        if (!actions.length) {
            $list.append(`<div class="small">暂无死亡时变量修改语句。</div>`);
            return;
        }
        actions.forEach((a) => {
            const row = `
<div class="kv-row-compact" data-id="${escapeHtml(a.id)}">
  <input class="input deathVarActionInput" data-key="expr" type="text" value="${escapeHtml(a.expr)}" placeholder="例如：counter += 1"/>
  <button class="btn small kv-del btnDelDeathVarAction" type="button">删除</button>
</div>`;
            $list.append(row);
        });
    }

    function renderDeathForm() {
        const d = state.death;
        $("#deathEnabled").val(d.enabled ? "true" : "false");
        $("#deathMode").val(d.mode);
        $("#deathCondition").val(d.condition || "");
        $("#deathRespawnCount").val(d.respawnCount);
        $("#deathSizeMul").val(d.sizeMul);
        $("#deathSpeedMul").val(d.speedMul);
        $("#deathOffX").val(d.offset.x);
        $("#deathOffY").val(d.offset.y);
        $("#deathOffZ").val(d.offset.z);
        $("#deathSignMode").val(d.signMode);
        $("#deathSignValue").val(d.signValue);
        $("#deathMaxAgeExpr").val(d.maxAgeExpr || "");

        const showRespawn = d.enabled && d.mode === "respawn";
        $("#deathRespawnBlock").toggle(showRespawn);
        $("#deathSignValueWrap").toggle(d.signMode === "set");
    }

    function renderAll() {
        state = normalizeEmitterBehavior(state);
        renderVarList();
        renderTickList();
        renderDeathForm();
        renderDeathVarActions();
        renderCode();
    }

    function copyCode() {
        const text = genEmitterBehaviorKotlin(state);
        if (!text) return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).catch(() => {
            });
            return;
        }
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
    }

    function bindEvents() {
        $("#btnAddDeathVar").on("click", () => {
            state.emitterVars.push(createEmitterVar());
            persist();
            renderAll();
        });
        $("#btnAddDeathTick").on("click", () => {
            state.tickActions.push(createTickAction());
            persist();
            renderAll();
        });
        $("#btnAddDeathVarAction").on("click", () => {
            state.death.varActions.push(createDeathVarAction());
            persist();
            renderAll();
        });

        $("#deathVarList").on("input change", ".deathVarInput", function (e) {
            const id = $(this).closest(".kv-row").data("id");
            const key = String($(this).data("key") || "");
            const item = state.emitterVars.find((it) => it.id === id);
            if (!item || !key) return;
            if (key === "name") {
                const raw = String($(this).val() || "").trim();
                item.name = raw;
                if (raw && !isValidEmitterVarName(raw) && e && e.type === "change") {
                    alert("变量名不合法（仅支持 [A-Za-z_][A-Za-z0-9_]* ）");
                }
            } else if (key === "type") {
                item.type = ($(this).val() === "int") ? "int" : "double";
                item.defaultValue = item.type === "int"
                    ? Math.trunc(safeNum(item.defaultValue, 0))
                    : safeNum(item.defaultValue, 0);
            } else if (key === "defaultValue") {
                item.defaultValue = safeNum($(this).val(), item.defaultValue);
                if (item.type === "int") item.defaultValue = Math.trunc(item.defaultValue);
            }
            persist();
            renderCode();
        });
        $("#deathVarList").on("click", ".btnDelDeathVar", function () {
            const id = $(this).closest(".kv-row").data("id");
            state.emitterVars = state.emitterVars.filter((it) => it.id !== id);
            persist();
            renderAll();
        });

        $("#deathTickList").on("input change", ".deathTickInput", function () {
            const id = $(this).closest(".kv-row-compact").data("id");
            const item = state.tickActions.find((it) => it.id === id);
            if (!item) return;
            item.expr = String($(this).val() || "").trim();
            persist();
            renderCode();
        });
        $("#deathTickList").on("click", ".btnDelDeathTick", function () {
            const id = $(this).closest(".kv-row-compact").data("id");
            state.tickActions = state.tickActions.filter((it) => it.id !== id);
            persist();
            renderAll();
        });

        $("#deathVarActionList").on("input change", ".deathVarActionInput", function () {
            const id = $(this).closest(".kv-row-compact").data("id");
            const item = state.death.varActions.find((it) => it.id === id);
            if (!item) return;
            item.expr = String($(this).val() || "").trim();
            persist();
            renderCode();
        });
        $("#deathVarActionList").on("click", ".btnDelDeathVarAction", function () {
            const id = $(this).closest(".kv-row-compact").data("id");
            state.death.varActions = state.death.varActions.filter((it) => it.id !== id);
            persist();
            renderAll();
        });

        $("#deathEnabled").on("change", function () {
            state.death.enabled = $(this).val() === "true";
            persist();
            renderAll();
        });
        $("#deathMode").on("change", function () {
            state.death.mode = ($(this).val() === "respawn") ? "respawn" : "dissipate";
            persist();
            renderAll();
        });
        $("#deathCondition").on("input change", function () {
            state.death.condition = String($(this).val() || "").trim();
            persist();
            renderCode();
        });
        $("#deathRespawnCount").on("input change", function () {
            state.death.respawnCount = Math.max(0, Math.trunc(safeNum($(this).val(), state.death.respawnCount)));
            persist();
            renderCode();
        });
        $("#deathSizeMul").on("input change", function () {
            state.death.sizeMul = safeNum($(this).val(), state.death.sizeMul);
            persist();
            renderCode();
        });
        $("#deathSpeedMul").on("input change", function () {
            state.death.speedMul = safeNum($(this).val(), state.death.speedMul);
            persist();
            renderCode();
        });
        $("#deathOffX").on("input change", function () {
            state.death.offset.x = safeNum($(this).val(), state.death.offset.x);
            persist();
            renderCode();
        });
        $("#deathOffY").on("input change", function () {
            state.death.offset.y = safeNum($(this).val(), state.death.offset.y);
            persist();
            renderCode();
        });
        $("#deathOffZ").on("input change", function () {
            state.death.offset.z = safeNum($(this).val(), state.death.offset.z);
            persist();
            renderCode();
        });
        $("#deathSignMode").on("change", function () {
            state.death.signMode = ($(this).val() === "set") ? "set" : "keep";
            persist();
            renderAll();
        });
        $("#deathSignValue").on("input change", function () {
            state.death.signValue = Math.trunc(safeNum($(this).val(), state.death.signValue));
            persist();
            renderCode();
        });
        $("#deathMaxAgeExpr").on("input change", function () {
            state.death.maxAgeExpr = String($(this).val() || "").trim();
            persist();
            renderCode();
        });

        $("#btnCopyDeathCode").on("click", copyCode);
        $("#btnResetDeathCfg").on("click", () => {
            if (!confirm("确定重置死亡行为配置为默认？")) return;
            state = normalizeEmitterBehavior(null);
            persist();
            renderAll();
        });
    }

    $(document).ready(() => {
        bindEvents();
        renderAll();
    });
})();
