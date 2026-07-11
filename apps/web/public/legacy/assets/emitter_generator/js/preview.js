import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { clamp, lerp, rand, randInt } from "./utils.js";
import { normalizeEmitterBehavior } from "./emitter_behavior.js";
import { normalizeBuilderState, evaluateBuilderState } from "./points_builder_bridge.js";
import { createDoTickRuntimeScope } from "./do_tick_expression.js";
import { sampleFloatCurve } from "./command_curve.js";
import { createMotionEditorRuntime } from "./motion_editor_preview.js";
import { createPreviewDistanceTool } from "../../src/js/shared/preview-distance-tool.js";
import {
    normalizeConditionFilter,
} from "./expression_cards.js";
import {
    getParticleDataByName,
    calcTextureFrame,
} from "../../particles/particle_data_loader.js";

export function initPreview(ctx = {}) {
    const {
        getState,
        viewportEl,
        statEl,
        fpsEl,
        showToast,
        getMotionEditorState,
        onMotionEditorSelectionChange,
        onMotionEditorMoveCommit,
        onMotionEditorOffsetModeChange,
        onMotionEditorAddPoint,
        onMotionEditorContextMenu,
        onMotionEditorStatus,
    } = ctx;

    let renderer, scene, camera, controls;
    let points, pointsGeo, pointsMat;
    let axesHelper, gridHelper;
    let motionEditorRuntime = null;
    let pointScale = 1.0;
    let previewDistanceTool = null;

    const MAX_POINTS = 65536;
    const WHITE_COLOR = { r: 1, g: 1, b: 1 };
    const IDENT_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
    const BOOL_EXPR_SAFE_RE = /^[0-9A-Za-z_+\-*/%().<>=!&|?: \t\r\n]+$/;
    const BOOL_EXPR_BLOCK_RE = /\b(?:new|function|=>|while|for|if|return|class|import|export|this|window|globalThis|constructor|prototype)\b/;
    const CALC_MATH_OP_SET = new Set(["+", "-", "*", "/", "%"]);
    const CALC_CMP_SET = new Set(["==", "!=", ">", ">=", "<", "<="]);
    const BOOL_EXPR_FN_CACHE = new Map();
    const sim = {
        tickAcc: 0,
        lastTime: performance.now(),
        particles: [],
        emitRuntime: new Map(), // emitterId -> { burstTick:number, emittedOnce:boolean }
        behaviorRuntime: {
            sig: "",
            vars: {},
            tick: 0,
            doTickCompiledSource: "",
            doTickCompiledFn: null,
        },
    };
    const FPS_SAMPLE_WINDOW = 0.25;
    const FPS_SMOOTH_ALPHA = 0.35;
    const fpsRuntime = {
        accSeconds: 0,
        frameCount: 0,
        value: 0,
    };


    function getEmittersFromState(state) {
        const arr = Array.isArray(state?.emitters) ? state.emitters : null;
        if (arr && arr.length) return arr;
        // legacy fallback (older schema: state.emitter/state.emission/state.particle)
        if (state && state.emitter && state.particle) {
            return [{
                id: "legacy_emitter",
                emission: state.emission || { mode: "continuous", burstInterval: 0.5 },
                emitter: state.emitter,
                particle: state.particle,
            }];
        }
        return [];
    }

    function getCommandQueuesFromState(state) {
        const rawQueues = state?.commandQueues;
        if (Array.isArray(rawQueues) && rawQueues.length) return rawQueues;
        if (rawQueues && typeof rawQueues === "object") {
            const values = Object.values(rawQueues).filter((it) => it && typeof it === "object");
            if (values.length) return values;
        }
        const legacy = Array.isArray(state?.commands) ? state.commands : [];
        return [{ id: "legacy_queue", signs: [], commands: legacy }];
    }

    function getEmitterBuilderPoints(card) {
        const normalized = normalizeBuilderState(card?.emitter?.builderState);
        const built = evaluateBuilderState(normalized);
        return Array.isArray(built?.points) ? built.points : [];
    }

    function ensureEmitterRuntime(emitters) {
        const alive = new Set();
        for (const c of emitters || []) {
            const id = c && c.id != null ? String(c.id) : null;
            if (!id) continue;
            alive.add(id);
            if (!sim.emitRuntime.has(id)) {
                sim.emitRuntime.set(id, { burstTick: 1e9, emittedOnce: false });
            }
        }
        for (const id of Array.from(sim.emitRuntime.keys())) {
            if (!alive.has(id)) sim.emitRuntime.delete(id);
        }
    }

    function setDoTickCompiled(compiled) {
        const source = String(compiled?.source || "").trim();
        const fn = (typeof compiled?.fn === "function") ? compiled.fn : null;
        sim.behaviorRuntime.doTickCompiledSource = source;
        sim.behaviorRuntime.doTickCompiledFn = fn;
    }

    const shouldIgnoreArrowPan = (typeof ctx.shouldIgnoreArrowPan === "function")
        ? ctx.shouldIgnoreArrowPan
        : () => {
            const ae = document.activeElement;
            if (!ae) return false;
            const tag = (ae.tagName || "").toUpperCase();
            if (tag === "INPUT" || tag === "TEXTAREA") return true;
            return !!ae.isContentEditable;
        };
    const panKeyState = {ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false};
    const PAN_KEY_SPEED = 0.0025;
    const DEG_TO_RAD = Math.PI / 180;
    const _panDir = new THREE.Vector3();
    const _panRight = new THREE.Vector3();
    const _panUp = new THREE.Vector3();
    const _panMove = new THREE.Vector3();
    const _pickProj = new THREE.Vector3();

    function isArrowKey(code) {
        return code === "ArrowUp" || code === "ArrowDown" || code === "ArrowLeft" || code === "ArrowRight";
    }

    function applyArrowPan() {
        if (!controls || !camera) return;
        if (!panKeyState.ArrowUp && !panKeyState.ArrowDown && !panKeyState.ArrowLeft && !panKeyState.ArrowRight) return;
        const dist = camera.position.distanceTo(controls.target);
        const step = Math.max(0.0001, dist * PAN_KEY_SPEED) * (controls.panSpeed || 1);
        camera.getWorldDirection(_panDir);
        _panRight.crossVectors(_panDir, camera.up).normalize();
        _panUp.copy(camera.up).normalize();
        _panMove.set(0, 0, 0);
        if (panKeyState.ArrowLeft) _panMove.addScaledVector(_panRight, -step);
        if (panKeyState.ArrowRight) _panMove.addScaledVector(_panRight, step);
        if (panKeyState.ArrowUp) _panMove.addScaledVector(_panUp, step);
        if (panKeyState.ArrowDown) _panMove.addScaledVector(_panUp, -step);
        if (_panMove.lengthSq() > 0) {
            controls.target.add(_panMove);
            camera.position.add(_panMove);
        }
    }

    function bindArrowPan() {
        window.addEventListener("keydown", (e) => {
            if (!isArrowKey(e.code) || shouldIgnoreArrowPan()) return;
            e.preventDefault();
            panKeyState[e.code] = true;
        }, true);
        window.addEventListener("keyup", (e) => {
            if (!isArrowKey(e.code)) return;
            panKeyState[e.code] = false;
        }, true);
        window.addEventListener("blur", () => {
            panKeyState.ArrowUp = false;
            panKeyState.ArrowDown = false;
            panKeyState.ArrowLeft = false;
            panKeyState.ArrowRight = false;
        });
    }

    function makePointShaderMaterial() {
        return new THREE.ShaderMaterial({
            transparent: true,
            depthWrite: false,
            depthTest: true,
            uniforms: {
                uViewportY: {value: 600.0},
                uAtlas: {value: null},
                uFrameCount: {value: 0},
                uUseTexture: {value: 0},
            },
            vertexShader: `
        attribute float size;
        attribute vec3 aColor;
        attribute float aFrameIndex;
        varying vec3 vColor;
        varying float vFrameIndex;
        uniform float uViewportY;

        void main() {
          vColor = aColor;
          vFrameIndex = aFrameIndex;

          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          float perspFlag = step(0.5, abs(projectionMatrix[2][3]));
          float pxPerWorldAtZ1 = 0.5 * uViewportY * projectionMatrix[1][1];

          float z = max(0.001, -mvPosition.z);
          float atten = mix(1.0, 1.0 / z, perspFlag);

          float s = size * pxPerWorldAtZ1 * atten;

          gl_PointSize = clamp(s, 1.0, 512.0);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
            fragmentShader: `
            varying vec3 vColor;
            varying float vFrameIndex;
            uniform sampler2D uAtlas;
            uniform int uFrameCount;
            uniform int uUseTexture;

            void main() {
              if (uUseTexture == 1 && uFrameCount > 0) {
                float fc = float(uFrameCount);
                float fi = clamp(floor(vFrameIndex + 0.5), 0.0, fc - 1.0);
                vec2 uv = gl_PointCoord;
                float pad = 0.5 / (fc * 64.0);
                uv.x = (fi + clamp(uv.x, 0.01, 0.99)) / fc;
                uv.x = clamp(uv.x, fi / fc + pad, (fi + 1.0) / fc - pad);
                vec4 texel = texture2D(uAtlas, uv);
                if (texel.a < 0.01) discard;
                gl_FragColor = vec4(vColor * texel.rgb, texel.a);
              } else {
                vec2 uv = gl_PointCoord - vec2(0.5);
                float d = length(uv);
                if (d > 0.5) discard;
                gl_FragColor = vec4(vColor, 1.0);
              }
            }
          `
        });
    }

    function initThree() {
        const el = viewportEl || document.getElementById("viewport");
        const w = el.clientWidth, h = el.clientHeight;
        const previewSceneColor = getComputedStyle(document.body).getPropertyValue("--wb-preview-scene").trim() || "#0b1017";

        renderer = new THREE.WebGLRenderer({antialias: true, alpha: true});
        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setClearColor(previewSceneColor, 1);
        el.innerHTML = "";
        el.appendChild(renderer.domElement);

        scene = new THREE.Scene();
        scene.background = new THREE.Color(previewSceneColor);
        camera = new THREE.PerspectiveCamera(55, w / h, 0.01, 5000);
        camera.position.set(10, 10, 10);

        controls = new OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.mouseButtons.LEFT = null;
        controls.mouseButtons.MIDDLE = THREE.MOUSE.ROTATE;
        controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
        controls.target.set(0, 0, 0);
        controls.update();
        renderer.domElement.addEventListener("contextmenu", (e) => e.preventDefault());
        bindArrowPan();

        const GRID_SIZE = 512;
        const GRID_DIV = 512;
        gridHelper = new THREE.GridHelper(GRID_SIZE, GRID_DIV, 0x233044, 0x1a2434);
        gridHelper.position.y = -0.01;
        scene.add(gridHelper);

        axesHelper = new THREE.AxesHelper(64);
        scene.add(axesHelper);

        motionEditorRuntime = createMotionEditorRuntime({
            scene,
            camera,
            renderer,
            viewportEl: el,
            gridHelper,
            getMotionEditorState,
            onMotionEditorSelectionChange,
            onMotionEditorMoveCommit,
            onMotionEditorOffsetModeChange,
            onMotionEditorAddPoint,
            onMotionEditorContextMenu,
            onMotionEditorStatus,
        });

        pointsGeo = new THREE.BufferGeometry();
        const pos = new Float32Array(MAX_POINTS * 3);
        const col = new Float32Array(MAX_POINTS * 3);
        const siz = new Float32Array(MAX_POINTS);
        const fri = new Float32Array(MAX_POINTS);
        pointsGeo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
        pointsGeo.setAttribute("aColor", new THREE.BufferAttribute(col, 3));
        pointsGeo.setAttribute("size", new THREE.BufferAttribute(siz, 1));
        pointsGeo.setAttribute("aFrameIndex", new THREE.BufferAttribute(fri, 1));
        pointsGeo.setDrawRange(0, 0);

        pointsMat = makePointShaderMaterial();
        points = new THREE.Points(pointsGeo, pointsMat);
        points.frustumCulled = false;
        scene.add(points);

        previewDistanceTool = createPreviewDistanceTool({
            title: "Emitter 预览测距",
            canvas: renderer.domElement,
            showToast,
            resolvePointFromEvent: resolveDistancePointFromEvent,
            projectPointToClient: (point) => worldToClientPoint(point?.x, point?.y, point?.z),
            attachContextMenu: true,
            shouldOpenContextMenu: shouldOpenDistanceContextMenu,
        });

        window.addEventListener("resize", () => resizeRenderer());
        resizeRenderer();
    }

    function resizeRenderer() {
        const el = viewportEl || document.getElementById("viewport");
        const ww = el.clientWidth, hh = el.clientHeight;
        if (!renderer || !camera) return;
        renderer.setSize(ww, hh);
        camera.aspect = ww / hh;
        camera.updateProjectionMatrix();
        if (pointsMat && pointsMat.uniforms && pointsMat.uniforms.uViewportY) {
            pointsMat.uniforms.uViewportY.value = renderer.domElement.height;
        }
    }

    function worldToClientPoint(x, y, z) {
        if (!renderer || !camera) return null;
        const rect = renderer.domElement.getBoundingClientRect();
        _pickProj.set(x, y, z).project(camera);
        if (!Number.isFinite(_pickProj.x) || !Number.isFinite(_pickProj.y) || !Number.isFinite(_pickProj.z)) return null;
        if (_pickProj.z < -1 || _pickProj.z > 1) return null;
        return {
            x: rect.left + (_pickProj.x * 0.5 + 0.5) * rect.width,
            y: rect.top + (-_pickProj.y * 0.5 + 0.5) * rect.height
        };
    }

    function pickMainPreviewPointAtClientPoint(clientX, clientY, radiusPx = 14) {
        if (!pointsGeo) return null;
        const posAttr = pointsGeo.getAttribute("position");
        if (!posAttr || !posAttr.array) return null;
        const drawCount = Math.max(0, Number(pointsGeo.drawRange?.count) || 0);
        let best = null;
        let bestDist = Number.POSITIVE_INFINITY;
        for (let i = 0; i < drawCount; i++) {
            const x = posAttr.array[i * 3 + 0];
            const y = posAttr.array[i * 3 + 1];
            const z = posAttr.array[i * 3 + 2];
            const screen = worldToClientPoint(x, y, z);
            if (!screen) continue;
            const dx = screen.x - clientX;
            const dy = screen.y - clientY;
            const d2 = dx * dx + dy * dy;
            if (d2 >= bestDist) continue;
            bestDist = d2;
            best = { x, y, z, label: "particle", index: i };
        }
        if (bestDist <= radiusPx * radiusPx) return best;
        return null;
    }

    function resolveDistancePointFromEvent(ev) {
        if (motionEditorRuntime && typeof motionEditorRuntime.isActive === "function" && motionEditorRuntime.isActive()) {
            const picked = motionEditorRuntime.pickPointFromEvent?.(ev);
            if (!picked) return null;
            return {
                x: Number(picked.x) || 0,
                y: Number(picked.y) || 0,
                z: Number(picked.z) || 0,
                label: String(picked.id || "motionPoint")
            };
        }
        return pickMainPreviewPointAtClientPoint(ev.clientX, ev.clientY);
    }

    function shouldOpenDistanceContextMenu(ev) {
        if (motionEditorRuntime && typeof motionEditorRuntime.isActive === "function" && motionEditorRuntime.isActive()) {
            return !motionEditorRuntime.pickPointFromEvent?.(ev);
        }
        return true;
    }

    function hexToRgb01(hex) {
        const h = (hex || "").replace("#", "").trim();
        if (h.length !== 6) return {r: 1, g: 1, b: 1};
        const n = parseInt(h, 16);
        const r = ((n >> 16) & 255) / 255;
        const g = ((n >> 8) & 255) / 255;
        const b = (n & 255) / 255;
        return {r, g, b};
    }

    function isParticleTextureUsable(pData) {
        if (!pData || !pData.atlasReady || !pData.atlas) return false;
        if (!(Number(pData.frames) > 0)) return false;
        if (pData.textureLoadOk === false) return false;
        return true;
    }

    function resolvePreviewTextureConfig(state) {
        const emitters = Array.isArray(state?.emitters) ? state.emitters : [];
        if (!emitters.length) return {effectClass: "", useTexture: false};
        const focusedId = String(state?.focusedEmitterId || "").trim();
        let card = null;
        if (focusedId) {
            card = emitters.find((it) => String(it?.id || "") === focusedId) || null;
        }
        if (!card) card = emitters[0] || null;
        const template = card?.template || {};
        return {
            effectClass: String(template.effectClass || "").trim(),
            useTexture: template.useTexture !== false,
        };
    }

    let _mergedAtlasKey = "";
    let _mergedAtlasTexture = null;
    let _mergedAtlasTotalFrames = 0;
    let _mergedAtlasOffsets = null;

    function collectActiveEffects(state) {
        const emitters = Array.isArray(state?.emitters) ? state.emitters : [];
        const entries = [];
        const seen = new Set();
        for (const card of emitters) {
            const template = card?.template || {};
            const effectClass = String(template.effectClass || "").trim();
            const useTexture = template.useTexture !== false;
            if (!useTexture || !effectClass) continue;
            const pData = getParticleDataByName(effectClass);
            if (!isParticleTextureUsable(pData)) continue;
            if (seen.has(effectClass)) continue;
            seen.add(effectClass);
            entries.push({ effectClass, pData });
        }
        return entries;
    }

    function syncGeneratorTextureUniforms(state) {
        if (!pointsMat || !pointsMat.uniforms) return;
        const effectEntries = collectActiveEffects(state);
        if (!effectEntries.length) {
            pointsMat.uniforms.uAtlas.value = null;
            pointsMat.uniforms.uUseTexture.value = 0;
            pointsMat.uniforms.uFrameCount.value = 0;
            _mergedAtlasOffsets = null;
            return;
        }
        if (effectEntries.length === 1) {
            const { pData, effectClass } = effectEntries[0];
            if (!pData._threeTexture) {
                pData._threeTexture = new THREE.CanvasTexture(pData.atlas);
                pData._threeTexture.minFilter = THREE.NearestFilter;
                pData._threeTexture.magFilter = THREE.NearestFilter;
                pData._threeTexture.generateMipmaps = false;
            }
            pointsMat.uniforms.uAtlas.value = pData._threeTexture;
            pointsMat.uniforms.uFrameCount.value = pData.frames;
            pointsMat.uniforms.uUseTexture.value = 1;
            const offsets = new Map();
            offsets.set(effectClass, 0);
            _mergedAtlasOffsets = offsets;
            return;
        }
        const cacheKey = effectEntries.map((e) => e.effectClass).sort().join("|");
        if (_mergedAtlasKey === cacheKey && _mergedAtlasTexture && _mergedAtlasOffsets) {
            pointsMat.uniforms.uAtlas.value = _mergedAtlasTexture;
            pointsMat.uniforms.uFrameCount.value = _mergedAtlasTotalFrames;
            pointsMat.uniforms.uUseTexture.value = 1;
            return;
        }
        const FRAME_SIZE = 64;
        let totalFrames = 0;
        const offsets = new Map();
        for (const { effectClass, pData } of effectEntries) {
            offsets.set(effectClass, totalFrames);
            totalFrames += pData.frames;
        }
        const canvas = document.createElement("canvas");
        canvas.width = FRAME_SIZE * totalFrames;
        canvas.height = FRAME_SIZE;
        const ctx = canvas.getContext("2d");
        ctx.imageSmoothingEnabled = false;
        for (const { effectClass, pData } of effectEntries) {
            const offset = offsets.get(effectClass);
            if (pData.atlas) {
                ctx.drawImage(pData.atlas, offset * FRAME_SIZE, 0);
            }
        }
        if (_mergedAtlasTexture) {
            _mergedAtlasTexture.dispose();
        }
        const tex = new THREE.CanvasTexture(canvas);
        tex.minFilter = THREE.NearestFilter;
        tex.magFilter = THREE.NearestFilter;
        tex.generateMipmaps = false;
        _mergedAtlasKey = cacheKey;
        _mergedAtlasTexture = tex;
        _mergedAtlasTotalFrames = totalFrames;
        _mergedAtlasOffsets = offsets;
        pointsMat.uniforms.uAtlas.value = tex;
        pointsMat.uniforms.uFrameCount.value = totalFrames;
        pointsMat.uniforms.uUseTexture.value = 1;
    }

    function updatePointsBuffer() {
        const pArr = sim.particles;
        const posAttr = pointsGeo.getAttribute("position");
        const colAttr = pointsGeo.getAttribute("aColor");
        const sizeAttr = pointsGeo.getAttribute("size");
        const frameAttr = pointsGeo.getAttribute("aFrameIndex");
        const alpha = clamp(sim.tickAcc, 0, 1);

        const n = Math.min(pArr.length, MAX_POINTS);
        const state = getState();

        for (let i = 0; i < n; i++) {
            const p = pArr[i];

            const ix = lerp(p.prevPos.x, p.pos.x, alpha);
            const iy = lerp(p.prevPos.y, p.pos.y, alpha);
            const iz = lerp(p.prevPos.z, p.pos.z, alpha);

            posAttr.array[i * 3 + 0] = ix;
            posAttr.array[i * 3 + 1] = iy;
            posAttr.array[i * 3 + 2] = iz;

            const t = clamp(p.age / Math.max(1, p.life), 0, 1);
            const c0 = p.c0 || WHITE_COLOR;
            const c1 = p.c1 || WHITE_COLOR;
            colAttr.array[i * 3 + 0] = lerp(c0.r, c1.r, t);
            colAttr.array[i * 3 + 1] = lerp(c0.g, c1.g, t);
            colAttr.array[i * 3 + 2] = lerp(c0.b, c1.b, t);

            sizeAttr.array[i] = p.size * pointScale;
            if (frameAttr) {
                const ec = p.effectClass || "";
                const pData = ec ? getParticleDataByName(ec) : null;
                if (p.useTexture && pData && isParticleTextureUsable(pData) && _mergedAtlasOffsets) {
                    const baseFrame = calcTextureFrame(p.age, p.life, pData.frames);
                    const offset = _mergedAtlasOffsets.has(ec) ? _mergedAtlasOffsets.get(ec) : 0;
                    frameAttr.array[i] = baseFrame + offset;
                } else {
                    frameAttr.array[i] = 0;
                }
            }
        }

        pointsGeo.setDrawRange(0, n);
        posAttr.needsUpdate = true;
        colAttr.needsUpdate = true;
        sizeAttr.needsUpdate = true;
        if (frameAttr) frameAttr.needsUpdate = true;
        syncGeneratorTextureUniforms(state);

        if (statEl) statEl.textContent = `Particles: ${pArr.length}`;
        else {
            const el = document.getElementById("statChip");
            if (el) el.textContent = `Particles: ${pArr.length}`;
        }
    }

    function setFpsChipText(text) {
        if (fpsEl) {
            fpsEl.textContent = text;
            return;
        }
        const el = document.getElementById("fpsChip");
        if (el) el.textContent = text;
    }

    function updateFpsChip(dtSeconds) {
        if (!(dtSeconds > 0)) return;
        fpsRuntime.accSeconds += dtSeconds;
        fpsRuntime.frameCount += 1;
        if (fpsRuntime.accSeconds < FPS_SAMPLE_WINDOW) return;
        const instant = fpsRuntime.frameCount / fpsRuntime.accSeconds;
        fpsRuntime.value = (fpsRuntime.value > 0)
            ? lerp(fpsRuntime.value, instant, FPS_SMOOTH_ALPHA)
            : instant;
        fpsRuntime.accSeconds = 0;
        fpsRuntime.frameCount = 0;
        setFpsChipText(`FPS: ${Math.max(0, Math.round(fpsRuntime.value))}`);
    }

    function animate() {
        requestAnimationFrame(animate);
        const now = performance.now();
        const dt = (now - sim.lastTime) / 1000;
        sim.lastTime = now;
        updateFpsChip(dt);

        const state = getState();
        if (state.playing) stepSim(dt);
        applyArrowPan();
        if (controls) controls.update();
        updatePointsBuffer();
        if (motionEditorRuntime) motionEditorRuntime.syncFromState();
        renderer.render(scene, camera);
    }

    function stepSim(dtSeconds) {
        const state = getState();
        const tps = Math.max(1, state.ticksPerSecond);
        sim.tickAcc += dtSeconds * tps;
        while (sim.tickAcc >= 1.0) {
            sim.tickAcc -= 1.0;
            tickOnce();
        }
    }

    const REMOVE_REASON = {
        AGE: "AGE",
        COLLISION: "COLLISION",
        OUT_OF_RANGE: "OUT_OF_RANGE",
        MANUAL: "MANUAL",
        UNKNOWN: "UNKNOWN",
    };
    const REMOVE_REASON_SET = new Set(Object.values(REMOVE_REASON));

    function toReasonTokenFast(raw) {
        const s = String(raw || "").trim();
        if (!s) return REMOVE_REASON.AGE;
        if (REMOVE_REASON_SET.has(s)) return s;
        if (s.startsWith("RemoveReason.")) {
            const sub = s.slice("RemoveReason.".length).trim();
            if (REMOVE_REASON_SET.has(sub)) return sub;
        }
        return REMOVE_REASON.AGE;
    }

    function readNamedNumberFast(name, age, life, sign, respawnCount, tick, vars, fallback = 0) {
        const keyRaw = String(name || "").trim();
        const key = (keyRaw === "life") ? "maxAge" : keyRaw;
        if (!key) return fallback;
        if (key === "age") return Number.isFinite(age) ? age : fallback;
        if (key === "maxAge") return Number.isFinite(life) ? life : fallback;
        if (key === "sign") return Number.isFinite(sign) ? sign : fallback;
        if (key === "respawnCount") return Number.isFinite(respawnCount) ? respawnCount : fallback;
        if (key === "tick" || key === "time") return Number.isFinite(tick) ? tick : fallback;
        if (vars && Object.prototype.hasOwnProperty.call(vars, key)) {
            const n = Number(vars[key]);
            if (Number.isFinite(n)) return n;
        }
        if (key === "maxAge" && vars && Object.prototype.hasOwnProperty.call(vars, "life")) {
            const n = Number(vars.life);
            if (Number.isFinite(n)) return n;
        }
        return fallback;
    }

    function evalNumberFast(raw, fallback, age, life, sign, respawnCount, tick, vars, intMode = false, min = null, max = null) {
        let n = fallback;
        if (typeof raw === "number") {
            n = raw;
        } else if (typeof raw === "string") {
            const s = raw.trim();
            if (!s) {
                n = fallback;
            } else {
                const num = Number(s);
                if (Number.isFinite(num)) n = num;
                else if (IDENT_RE.test(s)) n = readNamedNumberFast(s, age, life, sign, respawnCount, tick, vars, fallback);
                else n = fallback;
            }
        } else {
            const v = Number(raw);
            if (Number.isFinite(v)) n = v;
        }
        if (!Number.isFinite(n)) n = fallback;
        if (intMode) n = Math.trunc(n);
        if (typeof min === "number") n = Math.max(min, n);
        if (typeof max === "number") n = Math.min(max, n);
        return n;
    }

    function evalNumberExpr(raw, fallback = 0, extra = {}, opts = {}) {
        const vars = (sim.behaviorRuntime && sim.behaviorRuntime.vars) ? sim.behaviorRuntime.vars : {};
        const age = Number(extra?.age);
        const life = Number(extra?.life);
        const sign = Number(extra?.sign);
        const respawnCount = Number(extra?.respawnCount);
        const tickVal = (extra && extra.tick !== undefined) ? Number(extra.tick) : Number(sim.behaviorRuntime.tick);
        const min = (opts && typeof opts.min === "number") ? opts.min : null;
        const max = (opts && typeof opts.max === "number") ? opts.max : null;
        return evalNumberFast(
            raw,
            fallback,
            Number.isFinite(age) ? age : 0,
            Number.isFinite(life) ? life : 0,
            Number.isFinite(sign) ? sign : 0,
            Number.isFinite(respawnCount) ? respawnCount : 0,
            Number.isFinite(tickVal) ? tickVal : 0,
            vars,
            !!opts?.int,
            min,
            max
        );
    }

    function evalIntExpr(raw, fallback = 0, extra = {}, opts = {}) {
        const vars = (sim.behaviorRuntime && sim.behaviorRuntime.vars) ? sim.behaviorRuntime.vars : {};
        const age = Number(extra?.age);
        const life = Number(extra?.life);
        const sign = Number(extra?.sign);
        const respawnCount = Number(extra?.respawnCount);
        const tickVal = (extra && extra.tick !== undefined) ? Number(extra.tick) : Number(sim.behaviorRuntime.tick);
        const min = (opts && typeof opts.min === "number") ? opts.min : null;
        const max = (opts && typeof opts.max === "number") ? opts.max : null;
        return evalNumberFast(
            raw,
            fallback,
            Number.isFinite(age) ? age : 0,
            Number.isFinite(life) ? life : 0,
            Number.isFinite(sign) ? sign : 0,
            Number.isFinite(respawnCount) ? respawnCount : 0,
            Number.isFinite(tickVal) ? tickVal : 0,
            vars,
            true,
            min,
            max
        );
    }

    function compareConditionFast(lhs, op, rhs) {
        if (op === "calc_eq") {
            const ln = Number(lhs);
            const rn = Number(rhs);
            if (!Number.isFinite(ln) || !Number.isFinite(rn)) return false;
            return Math.abs(ln - rn) <= 1e-6;
        }
        if (op === "==" || op === "!=") {
            const out = lhs === rhs;
            return op === "==" ? out : !out;
        }
        const ln = Number(lhs);
        const rn = Number(rhs);
        if (!Number.isFinite(ln) || !Number.isFinite(rn)) return false;
        if (op === ">") return ln > rn;
        if (op === ">=") return ln >= rn;
        if (op === "<") return ln < rn;
        if (op === "<=") return ln <= rn;
        return false;
    }

    function normalizeCalcMathOpFast(raw) {
        const op = String(raw || "").trim();
        return CALC_MATH_OP_SET.has(op) ? op : "-";
    }

    function normalizeCalcCmpFast(raw) {
        const cmp = String(raw || "").trim();
        return CALC_CMP_SET.has(cmp) ? cmp : "==";
    }

    function evalMathBinaryFast(a, op, b) {
        const l = Number(a);
        const r = Number(b);
        if (!Number.isFinite(l) || !Number.isFinite(r)) return 0;
        if (op === "+") return l + r;
        if (op === "-") return l - r;
        if (op === "*") return l * r;
        if (op === "/") return Math.abs(r) < 1e-12 ? 0 : l / r;
        if (op === "%") return Math.abs(r) < 1e-12 ? 0 : l % r;
        return l - r;
    }

    function compareCalcFast(lhs, cmp, rhs) {
        const ln = Number(lhs);
        const rn = Number(rhs);
        if (!Number.isFinite(ln) || !Number.isFinite(rn)) return false;
        if (cmp === "==") return Math.abs(ln - rn) <= 1e-6;
        if (cmp === "!=") return Math.abs(ln - rn) > 1e-6;
        if (cmp === ">") return ln > rn;
        if (cmp === ">=") return ln >= rn;
        if (cmp === "<") return ln < rn;
        if (cmp === "<=") return ln <= rn;
        return false;
    }

    function compileBooleanExprFast(rawExpr) {
        const key = String(rawExpr || "").trim();
        if (!key) return null;
        if (BOOL_EXPR_FN_CACHE.has(key)) return BOOL_EXPR_FN_CACHE.get(key);
        if (!BOOL_EXPR_SAFE_RE.test(key) || BOOL_EXPR_BLOCK_RE.test(key)) {
            BOOL_EXPR_FN_CACHE.set(key, null);
            return null;
        }
        try {
            const fn = new Function(
                "age", "maxAge", "life", "sign", "respawnCount", "tick", "vars", "Math", "abs",
                `try { with (vars || {}) { return !!(${key}); } } catch (_) { return false; }`
            );
            BOOL_EXPR_FN_CACHE.set(key, fn);
            return fn;
        } catch {
            BOOL_EXPR_FN_CACHE.set(key, null);
            return null;
        }
    }

    function evalBooleanExprFast(rawExpr, age, life, sign, respawnCount, tick, vars) {
        const fn = compileBooleanExprFast(rawExpr);
        if (!fn) return false;
        try {
            return !!fn(age, life, life, sign, respawnCount, tick, vars || {}, Math, Math.abs);
        } catch {
            return false;
        }
    }

    function resolveCalcTermFast(type, value, age, life, sign, respawnCount, tick, vars, fallback = 0) {
        const tRaw = String(type || "").trim();
        const t = (tRaw === "life") ? "maxAge" : tRaw;
        if (t === "number") return evalNumberFast(value, fallback, age, life, sign, respawnCount, tick, vars || {}, false);
        if (t === "var") return readNamedNumberFast(value, age, life, sign, respawnCount, tick, vars || {}, fallback);
        if (t === "age" || t === "maxAge" || t === "sign" || t === "respawnCount" || t === "tick") {
            return readNamedNumberFast(t, age, life, sign, respawnCount, tick, vars || {}, fallback);
        }
        return fallback;
    }

    function evaluateCalcEqRuleFast(row, age, life, sign, respawnCount, tick, reason, vars, fallbackLeft = 0, fallbackRight = 0) {
        const mode = String(row?.calcValueMode || "box");
        if (mode === "expr") {
            return evalBooleanExprFast(row?.calcBooleanExpr, age, life, sign, respawnCount, tick, vars);
        }
        const mainOp = normalizeCalcMathOpFast(row?.calcMathOp);
        const cmp = normalizeCalcCmpFast(row?.calcResultCmp);
        const a = resolveCalcTermFast(
            row?.calcLeftTermType,
            row?.calcLeftTermValue,
            age, life, sign, respawnCount, tick, vars,
            Number.isFinite(Number(fallbackLeft)) ? Number(fallbackLeft) : 0
        );
        const b = resolveCalcTermFast(
            row?.calcRightTermType,
            row?.calcRightTermValue,
            age, life, sign, respawnCount, tick, vars,
            Number.isFinite(Number(fallbackRight)) ? Number(fallbackRight) : 0
        );
        const lhs = evalMathBinaryFast(a, mainOp, b);
        let rhs = 0;
        if (String(row?.calcResultMode || "fixed") === "calc") {
            const cOp = normalizeCalcMathOpFast(row?.calcExpectMathOp);
            const c1 = resolveCalcTermFast(row?.calcExpectLeftTermType, row?.calcExpectLeftTermValue, age, life, sign, respawnCount, tick, vars, 0);
            const c2 = resolveCalcTermFast(row?.calcExpectRightTermType, row?.calcExpectRightTermValue, age, life, sign, respawnCount, tick, vars, 0);
            rhs = evalMathBinaryFast(c1, cOp, c2);
        } else {
            rhs = resolveCalcTermFast(row?.calcFixedTermType, row?.calcFixedTermValue, age, life, sign, respawnCount, tick, vars, 0);
        }
        return compareCalcFast(lhs, cmp, rhs);
    }

    function resolveConditionTokenFast(type, value, age, life, sign, respawnCount, tick, reason, vars) {
        if (type === "number") return evalNumberFast(value, 0, age, life, sign, respawnCount, tick, vars, false);
        if (type === "var") return readNamedNumberFast(value, age, life, sign, respawnCount, tick, vars, 0);
        if (type === "age" || type === "maxAge" || type === "life" || type === "sign" || type === "respawnCount" || type === "tick") {
            return readNamedNumberFast(type, age, life, sign, respawnCount, tick, vars, 0);
        }
        if (type === "reason") return toReasonTokenFast(value ?? reason);
        return 0;
    }

    function evaluateConditionFilterFast(filter, allowReason, age, life, sign, respawnCount, tick, reason) {
        const normalized = (filter && typeof filter === "object" && Array.isArray(filter.rules))
            ? filter
            : normalizeConditionFilter(filter, { allowReason });
        if (!normalized.enabled) return true;
        const rules = Array.isArray(normalized.rules) ? normalized.rules : [];
        if (!rules.length) return true;
        const vars = sim.behaviorRuntime.vars || {};
        let result = null;
        for (let i = 0; i < rules.length; i++) {
            const row = rules[i];
            let lhs;
            if (row.left === "var") lhs = readNamedNumberFast(row.leftVar, age, life, sign, respawnCount, tick, vars, 0);
            else if (row.left === "reason") lhs = toReasonTokenFast(reason);
            else lhs = resolveConditionTokenFast(row.left, row.left, age, life, sign, respawnCount, tick, reason, vars);

            let rhs;
            if (row.right === "var") rhs = readNamedNumberFast(row.rightValue, age, life, sign, respawnCount, tick, vars, 0);
            else if (row.right === "reason") rhs = toReasonTokenFast(row.rightValue);
            else rhs = resolveConditionTokenFast(row.right, row.rightValue, age, life, sign, respawnCount, tick, reason, vars);

            const useCalcCompare = (row.op === "calc_eq")
                || (row.op === "==" && row.left !== "reason" && row.right !== "reason");
            const ok = useCalcCompare
                ? evaluateCalcEqRuleFast(row, age, life, sign, respawnCount, tick, reason, vars, lhs, rhs)
                : compareConditionFast(lhs, row.op, rhs);
            if (result == null) result = ok;
            else if (row.link === "or") result = result || ok;
            else result = result && ok;
        }
        return result == null ? true : !!result;
    }

    function resolveVarActionValueFast(action, age, life, sign, respawnCount, tick, reason) {
        const type = String(action?.valueType || "number");
        const value = action?.value;
        if (type === "number") return evalNumberFast(value, 0, age, life, sign, respawnCount, tick, sim.behaviorRuntime.vars || {}, false);
        if (type === "var") return readNamedNumberFast(value, age, life, sign, respawnCount, tick, sim.behaviorRuntime.vars || {}, 0);
        return resolveConditionTokenFast(type, value, age, life, sign, respawnCount, tick, reason, sim.behaviorRuntime.vars || {});
    }

    function ensureBehaviorRuntime(behavior) {
        const varsDef = Array.isArray(behavior?.emitterVars) ? behavior.emitterVars : [];
        const sig = JSON.stringify(varsDef.map((v) => ({
            name: v.name,
            type: v.type,
            defaultValue: v.defaultValue,
            minEnabled: v.minEnabled,
            minValue: v.minValue,
            maxEnabled: v.maxEnabled,
            maxValue: v.maxValue,
        })));
        if (sim.behaviorRuntime.sig !== sig) {
            sim.behaviorRuntime.sig = sig;
            sim.behaviorRuntime.vars = {};
            for (const v of varsDef) {
                if (!v?.name) continue;
                const isInt = String(v.type) === "int";
                const def = evalNumberExpr(v.defaultValue, 0, {}, { int: isInt });
                sim.behaviorRuntime.vars[v.name] = def;
            }
        } else {
            for (const v of varsDef) {
                if (!v?.name) continue;
                if (sim.behaviorRuntime.vars[v.name] === undefined) {
                    const isInt = String(v.type) === "int";
                    sim.behaviorRuntime.vars[v.name] = evalNumberExpr(v.defaultValue, 0, {}, { int: isInt });
                }
            }
        }
        applyVarBounds(behavior);
    }

    function applyVarBounds(behavior) {
        const varsDef = Array.isArray(behavior?.emitterVars) ? behavior.emitterVars : [];
        const store = sim.behaviorRuntime.vars || {};
        for (const v of varsDef) {
            const name = String(v?.name || "").trim();
            if (!name || store[name] === undefined) continue;
            const isInt = String(v.type) === "int";
            let n = Number(store[name]);
            if (!Number.isFinite(n)) n = evalNumberExpr(v.defaultValue, 0, {}, { int: isInt });
            if (v.minEnabled) {
                const lo = evalNumberExpr(v.minValue, isInt ? 0 : -Infinity, {}, { int: isInt });
                if (n < lo) n = lo;
            }
            if (v.maxEnabled) {
                const hi = evalNumberExpr(v.maxValue, isInt ? 0 : Infinity, {}, { int: isInt });
                if (n > hi) n = hi;
            }
            if (isInt) n = Math.trunc(n);
            store[name] = n;
        }
    }

    function applyStructuredVarAction(action, extra = {}) {
        const vars = sim.behaviorRuntime.vars || {};
        if (!action || typeof action !== "object") return false;
        const varName = String(action.varName || "").trim();
        if (!IDENT_RE.test(varName)) return false;
        if (!Object.prototype.hasOwnProperty.call(vars, varName)) return false;

        const age = Number.isFinite(Number(extra?.age)) ? Number(extra.age) : 0;
        const life = Number.isFinite(Number(extra?.life)) ? Number(extra.life) : 0;
        const sign = Number.isFinite(Number(extra?.sign)) ? Number(extra.sign) : 0;
        const respawnCount = Number.isFinite(Number(extra?.respawnCount)) ? Number(extra.respawnCount) : 0;
        const tick = Number.isFinite(Number(extra?.tick)) ? Number(extra.tick) : Number(sim.behaviorRuntime.tick || 0);
        const reason = toReasonTokenFast(extra?.reason);

        let cur = Number(vars[varName]);
        if (!Number.isFinite(cur)) cur = 0;
        const op = String(action.op || "set");
        if (op === "inc") {
            vars[varName] = cur + 1;
            return true;
        }
        if (op === "dec") {
            vars[varName] = cur - 1;
            return true;
        }
        const rhs = Number(resolveVarActionValueFast(action, age, life, sign, respawnCount, tick, reason));
        const val = Number.isFinite(rhs) ? rhs : 0;
        if (op === "set") vars[varName] = val;
        else if (op === "add") vars[varName] = cur + val;
        else if (op === "sub") vars[varName] = cur - val;
        else if (op === "mul") vars[varName] = cur * val;
        else if (op === "div") vars[varName] = Math.abs(val) < 1e-12 ? cur : cur / val;
        else return false;
        return true;
    }

    function runDoTickActions(behavior) {
        const tick = Number(sim.behaviorRuntime.tick) || 0;
        const exprSource = String(behavior?.tickExpression || "").trim();
        if (exprSource) {
            const canRunCompiled = (
                sim.behaviorRuntime.doTickCompiledSource === exprSource
                && typeof sim.behaviorRuntime.doTickCompiledFn === "function"
            );
            if (canRunCompiled) {
                try {
                    const scope = createDoTickRuntimeScope(sim.behaviorRuntime.vars || {}, tick);
                    sim.behaviorRuntime.doTickCompiledFn(scope);
                } catch (_) {
                }
            }
            applyVarBounds(behavior);
            return;
        }

        const actions = Array.isArray(behavior?.tickActions) ? behavior.tickActions : [];
        for (const action of actions) {
            if (!evaluateConditionFilterFast(action?.condition, false, 0, 0, 0, 0, tick, REMOVE_REASON.UNKNOWN)) continue;
            applyStructuredVarAction(action, { tick });
        }
        applyVarBounds(behavior);
    }

    function evaluateLifeFilter(filter, age, life, sign = 0, respawnCount = 0, tick = 0) {
        return evaluateConditionFilterFast(
            filter,
            false,
            Number(age) || 0,
            Number(life) || 0,
            Number(sign) || 0,
            Number(respawnCount) || 0,
            Number(tick) || 0,
            REMOVE_REASON.UNKNOWN
        );
    }

    function evalDeathMaxAge(death, fallback, age, life, sign, respawnCount, tick) {
        if (!death?.maxAgeEnabled) return fallback;
        const vars = sim.behaviorRuntime.vars || {};
        const tRaw = String(death.maxAgeValueType || "number");
        const t = (tRaw === "life") ? "maxAge" : tRaw;
        if (t === "var") {
            return evalNumberFast(String(death.maxAgeValue || ""), fallback, age, life, sign, respawnCount, tick, vars, true, 1);
        }
        if (t === "age" || t === "maxAge" || t === "respawnCount" || t === "tick") {
            return evalNumberFast(t, fallback, age, life, sign, respawnCount, tick, vars, true, 1);
        }
        return evalNumberFast(death.maxAgeValue, fallback, age, life, sign, respawnCount, tick, vars, true, 1);
    }

    function runDeathAction(particle, behavior) {
        const death = behavior?.death || {};
        const reason = REMOVE_REASON.AGE;
        const respawnCount = Math.max(0, Math.trunc(Number(particle.respawnCount) || 0)) + 1;
        const vars = sim.behaviorRuntime.vars || {};
        const age = Number(particle.age) || 0;
        const life = Number(particle.life) || 0;
        const sign = Number(particle.sign) || 0;
        const tick = Number(sim.behaviorRuntime.tick) || 0;

        if (!evaluateConditionFilterFast(death.condition, true, age, life, sign, respawnCount, tick, reason)) return [];

        const varActions = Array.isArray(death.varActions) ? death.varActions : [];
        for (const action of varActions) {
            applyStructuredVarAction(action, { age, maxAge: life, life, sign, respawnCount, reason, tick });
        }
        applyVarBounds(behavior);

        if (!death.enabled || death.mode !== "respawn") return [];

        const count = evalNumberFast(death.respawnCount, 1, age, life, sign, respawnCount, tick, vars, true, 0);
        if (count <= 0) return [];
        const offX = evalNumberFast(death.offset?.x, 0, age, life, sign, respawnCount, tick, vars, false);
        const offY = evalNumberFast(death.offset?.y, 0, age, life, sign, respawnCount, tick, vars, false);
        const offZ = evalNumberFast(death.offset?.z, 0, age, life, sign, respawnCount, tick, vars, false);
        const sizeMul = evalNumberFast(death.sizeMul, 1, age, life, sign, respawnCount, tick, vars, false);
        const speedMul = evalNumberFast(death.speedMul, 1, age, life, sign, respawnCount, tick, vars, false);

        const out = [];
        const px = particle.pos.x + offX;
        const py = particle.pos.y + offY;
        const pz = particle.pos.z + offZ;
        for (let i = 0; i < count; i++) {
            const np = {
                pos: new THREE.Vector3(px, py, pz),
                prevPos: new THREE.Vector3(px, py, pz),
                vel: particle.vel.clone().multiplyScalar(speedMul),
                age: 0,
                life: particle.life,
                size: particle.size * sizeMul,
                c0: particle.c0,
                c1: particle.c1,
                sign: particle.sign,
                respawnCount,
                seed: particle.seed,
                pitch: Number(particle.pitch) || 0,
                yaw: Number(particle.yaw) || 0,
                roll: Number(particle.roll) || 0,
                cmdState: {},
            };
            if (death.signMode === "set") {
                np.sign = evalNumberFast(death.signValue, particle.sign, age, life, sign, respawnCount, tick, vars, true);
            }
            np.life = evalDeathMaxAge(death, np.life, age, life, sign, respawnCount, tick);
            out.push(np);
        }
        return out;
    }

    function tickOnce() {
        const state = getState();
        const emitters = getEmittersFromState(state);
        ensureEmitterRuntime(emitters);
        const behavior = normalizeEmitterBehavior(state?.emitterBehavior);
        ensureBehaviorRuntime(behavior);
        sim.behaviorRuntime.tick += 1;
        runDoTickActions(behavior);

        const tps = Math.max(1, Number(state.ticksPerSecond) || 20);
        const vars = sim.behaviorRuntime.vars || {};
        const tick = Number(sim.behaviorRuntime.tick) || 0;
        const rootLifecycle = normalizeRootLifecycle(state?.rootLifecycle);
        const canEmitThisTick = shouldEmitOnParentTick(rootLifecycle, tick);

        const spawnFor = (card) => {
            const pp = (card && card.particle) ? card.particle : {};
            const minC = Math.max(0, evalNumberFast(pp.countMin, 0, 0, 0, 0, 0, tick, vars, true));
            const maxC = Math.max(minC, evalNumberFast(pp.countMax, minC, 0, 0, 0, 0, tick, vars, true));
            const cnt = randInt(minC, maxC);
            const spawnCtx = {};
            if (String(card?.emitter?.type || "") === "points_builder") {
                // Re-evaluate builder output per emission event, so non-deterministic
                // builder nodes preserve runtime randomness in preview.
                spawnCtx.builderPoints = getEmitterBuilderPoints(card);
            }
            for (let i = 0; i < cnt; i++) {
                if (sim.particles.length >= MAX_POINTS) break;
                sim.particles.push(makeParticle(card, spawnCtx));
            }
        };

        for (const card of emitters) {
            const id = card && card.id != null ? String(card.id) : null;
            if (!id) continue;
            if (!canEmitThisTick) continue;
            if (!emitterWindowActive(card?.emission, tick, (v, def) => evalNumberFast(v, def, 0, 0, 0, 0, tick, vars, true))) continue;
            const mode = (card.emission && card.emission.mode) || "continuous";
            const rt = sim.emitRuntime.get(id);
            if (!rt) continue;

            if (mode === "once") {
                if (!rt.emittedOnce) {
                    spawnFor(card);
                    rt.emittedOnce = true;
                }
            } else if (mode === "burst") {
                const intervalSec = Math.max(0.01, evalNumberFast(card.emission?.burstInterval, 0.5, 0, 0, 0, 0, tick, vars, false, 0.01));
                const intervalTicks = Math.max(1, Math.round(intervalSec * tps));
                if (rt.burstTick >= intervalTicks) {
                    spawnFor(card);
                    rt.burstTick = 0;
                }
                rt.burstTick += 1;
            } else {
                spawnFor(card);
            }
        }

        const commandQueues = [];
        for (const queue of getCommandQueuesFromState(state)) {
            if (!queue || typeof queue !== "object") continue;
            let queueSignSet = null;
            if (Array.isArray(queue.signs) && queue.signs.length) {
                queueSignSet = new Set();
                for (const s of queue.signs) {
                    const v = Math.trunc(Number(s));
                    if (Number.isFinite(v)) queueSignSet.add(v);
                }
            }
            const cmds = [];
            const queueCmds = Array.isArray(queue.commands) ? queue.commands : [];
            for (const c of queueCmds) {
                if (!c || !c.enabled) continue;
                let signSet = null;
                if (Array.isArray(c.signs) && c.signs.length) {
                    signSet = new Set();
                    for (const s of c.signs) {
                        const v = Math.trunc(Number(s));
                        if (Number.isFinite(v)) signSet.add(v);
                    }
                }
                const lf = normalizeConditionFilter(c.lifeFilter, { allowReason: false });
                const hasLifeFilter = !!(lf && typeof lf === "object" && lf.enabled);
                cmds.push({ cmd: c, signSet, hasLifeFilter, lifeFilter: lf });
            }
            commandQueues.push({ queueSignSet, cmds });
        }

        for (let i = sim.particles.length - 1; i >= 0; i--) {
            const p = sim.particles[i];
            p.age++;
            const ps = Math.trunc(Number(p.sign) || 0);

            for (const q of commandQueues) {
                if (q.queueSignSet && !q.queueSignSet.has(ps)) continue;
                for (const item of q.cmds) {
                    if (item.signSet && !item.signSet.has(ps)) continue;
                    if (item.hasLifeFilter && !evaluateLifeFilter(item.lifeFilter, p.age, p.life, ps, p.respawnCount, tick)) continue;
                    applyCommandJS(item.cmd, p, 1);
                }
            }
            p.prevPos.copy(p.pos);
            p.pos.add(p.vel);
            if (p.age >= p.life) {
                const spawned = runDeathAction(p, behavior);
                const last = sim.particles.length - 1;
                if (i !== last) sim.particles[i] = sim.particles[last];
                sim.particles.pop();
                for (const np of spawned) {
                    if (sim.particles.length >= MAX_POINTS) break;
                    sim.particles.push(np);
                }
            }
        }
    }

    function getEmitterCommandOrigin(card) {
        const e = (card && card.emitter) ? card.emitter : {};
        return new THREE.Vector3(
            evalNumberExpr(e.offset?.x, 0),
            evalNumberExpr(e.offset?.y, 0),
            evalNumberExpr(e.offset?.z, 0)
        );
    }

    function makeParticle(card, spawnCtx = null) {
        const pp = (card && card.particle) ? card.particle : {};
        const emitterPos = getEmitterCommandOrigin(card);
        const pos = sampleEmitterPosition(card, spawnCtx, emitterPos);
        const vars = sim.behaviorRuntime.vars || {};
        const tick = Number(sim.behaviorRuntime.tick) || 0;
        const num = (v, def = 0, min = null, max = null) => evalNumberFast(v, def, 0, 0, 0, 0, tick, vars, false, min, max);
        const intNum = (v, def = 0, min = null, max = null) => evalNumberFast(v, def, 0, 0, 0, 0, tick, vars, true, min, max);

        const lifeMin = Math.max(1, intNum(pp.lifeMin, 40, 1));
        const lifeMax = Math.max(lifeMin, intNum(pp.lifeMax, 120, 1));
        const life = randInt(lifeMin, lifeMax);

        const sizeMin = Math.max(0.001, num(pp.sizeMin, 0.08, 0.001));
        const sizeMax = Math.max(sizeMin, num(pp.sizeMax, 0.18, 0.001));
        const size = rand(sizeMin, sizeMax);

        const velMode = String(pp.velMode || "fixed");
        const v0 = pp.vel || {};
        const vdir = (velMode === "spawn_rel")
            ? pos.clone()
            : new THREE.Vector3(
                num(v0.x, 0),
                num(v0.y, 0),
                num(v0.z, 0)
            );
        if (vdir.lengthSq() < 1e-10) {
            vdir.set(0, 0, 0);
        } else {
            const minSpeed = Math.max(0, num(pp.velSpeedMin, 0, 0));
            const maxSpeed = Math.max(minSpeed, num(pp.velSpeedMax, minSpeed, 0));
            const speed = rand(minSpeed, maxSpeed);
            vdir.normalize().multiplyScalar(speed);
        }

        const c0 = hexToRgb01(pp.colorStart || "#ffffff");
        const c1 = pp.colorOverLifeEnabled
            ? hexToRgb01(pp.colorEnd || pp.colorStart || "#ffffff")
            : { ...c0 };
        const faceToCamera = (card?.template?.faceToCamera !== false);
        const pitch = faceToCamera ? 0 : num(card?.template?.pitch, 0);
        const yaw = faceToCamera ? 0 : num(card?.template?.yaw, 0);
        const roll = faceToCamera ? 0 : num(card?.template?.roll, 0);

        return {
            pos,
            prevPos: pos.clone(),
            emitterPos: emitterPos.clone(),
            vel: vdir,
            age: 0,
            life,
            size,
            c0,
            c1,
            sign: intNum(card?.template?.sign, 0),
            effectClass: String(card?.template?.effectClass || "").trim(),
            useTexture: card?.template?.useTexture !== false,
            respawnCount: 0,
            seed: (Math.random() * 1e9) | 0,
            pitch,
            yaw,
            roll,
            cmdState: {},
        };
    }

    function rotateToAxis(vec, axis) {
        const ax = axis.clone();
        if (ax.lengthSq() < 1e-8) return vec;
        ax.normalize();
        const up = new THREE.Vector3(0, 1, 0);
        const q = new THREE.Quaternion().setFromUnitVectors(up, ax);
        return vec.applyQuaternion(q);
    }

    function sampleEmitterPosition(card, spawnCtx = null, emitterPos = null) {
        const e = (card && card.emitter) ? card.emitter : {};
        const pp = (card && card.particle) ? card.particle : {};
        const t = e.type || "point";
        const off = (emitterPos && emitterPos.isVector3)
            ? emitterPos.clone()
            : getEmitterCommandOrigin(card);
        if (t === "points_builder") {
            const source = Array.isArray(spawnCtx?.builderPoints)
                ? spawnCtx.builderPoints
                : getEmitterBuilderPoints(card);
            if (!source.length) return off.clone();
            const p = source[randInt(0, source.length - 1)] || { x: 0, y: 0, z: 0 };
            return new THREE.Vector3(
                Number.isFinite(Number(p.x)) ? Number(p.x) : 0,
                Number.isFinite(Number(p.y)) ? Number(p.y) : 0,
                Number.isFinite(Number(p.z)) ? Number(p.z) : 0
            ).add(off);
        }
        if (t === "point") return new THREE.Vector3(0, 0, 0).add(off);

        if (t === "box") {
            const bx = evalNumberExpr(e.box?.x, 1, {}, { min: 0.001 });
            const by = evalNumberExpr(e.box?.y, 1, {}, { min: 0.001 });
            const bz = evalNumberExpr(e.box?.z, 1, {}, { min: 0.001 });
            const surface = !!e.box?.surface;
            const density = evalNumberExpr(e.box?.density, 0, {}, { min: 0, max: 1 });

            function biased(u) {
                if (density <= 0) return u;
                const s = Math.sign(u) || 1;
                const a = Math.abs(u);
                const pw = lerp(1.0, 4.0, density);
                return s * Math.pow(a, pw);
            }

            let x = biased(rand(-0.5, 0.5)) * bx;
            let y = biased(rand(-0.5, 0.5)) * by;
            let z = biased(rand(-0.5, 0.5)) * bz;

            if (surface) {
                const axis = randInt(0, 2);
                if (axis === 0) x = (Math.random() < 0.5 ? -0.5 : 0.5) * bx;
                if (axis === 1) y = (Math.random() < 0.5 ? -0.5 : 0.5) * by;
                if (axis === 2) z = (Math.random() < 0.5 ? -0.5 : 0.5) * bz;
            }
            return new THREE.Vector3(x, y, z).add(off);
        }

        if (t === "sphere") {
            const r = evalNumberExpr(e.sphere?.r, 1, {}, { min: 0.001 });
            const u = Math.random();
            const v = Math.random();
            const theta = 2 * Math.PI * u;
            const phi = Math.acos(2 * v - 1);
            const dir = new THREE.Vector3(
                Math.sin(phi) * Math.cos(theta),
                Math.cos(phi),
                Math.sin(phi) * Math.sin(theta)
            );
            const rr = r * Math.cbrt(Math.random());
            return dir.multiplyScalar(rr).add(off);
        }

        if (t === "sphere_surface") {
            const r = evalNumberExpr(e.sphereSurface?.r, 1, {}, { min: 0.001 });
            const u = Math.random();
            const v = Math.random();
            const theta = 2 * Math.PI * u;
            const phi = Math.acos(2 * v - 1);
            const dir = new THREE.Vector3(
                Math.sin(phi) * Math.cos(theta),
                Math.cos(phi),
                Math.sin(phi) * Math.sin(theta)
            );
            return dir.multiplyScalar(r).add(off);
        }

        if (t === "line") {
            const d = e.line?.dir || {x: 1, y: 0, z: 0};
            const dir = new THREE.Vector3(
                evalNumberExpr(d.x, 0),
                evalNumberExpr(d.y, 0),
                evalNumberExpr(d.z, 0)
            );
            const step = evalNumberExpr(e.line?.step, 0.25, {}, { min: 0.0001 });
            const count = Math.max(1, evalIntExpr(pp.countMax, 1));
            if (dir.lengthSq() < 1e-8) dir.set(1, 0, 0);
            dir.normalize();
            const idx = randInt(0, Math.max(0, count - 1));
            return dir.multiplyScalar(step * idx).add(off);
        }

        if (t === "circle") {
            const r = evalNumberExpr(e.circle?.r, 1, {}, { min: 0.001 });
            const a = rand(0, Math.PI * 2);
            const vec = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
            const ax0 = e.circle?.axis || {x: 0, y: 1, z: 0};
            const axis = new THREE.Vector3(
                evalNumberExpr(ax0.x, 0),
                evalNumberExpr(ax0.y, 1),
                evalNumberExpr(ax0.z, 0)
            );
            return rotateToAxis(vec, axis).add(off);
        }

        if (t === "arc") {
            const r = evalNumberExpr(e.arc?.r, 1, {}, { min: 0.001 });
            let a0 = evalNumberExpr(e.arc?.start, 0) * DEG_TO_RAD;
            let a1 = evalNumberExpr(e.arc?.end, 0) * DEG_TO_RAD;
            if (a1 < a0) [a0, a1] = [a1, a0];
            const rot = evalNumberExpr(e.arc?.rotate, 0) * DEG_TO_RAD;
            const a = rand(a0, a1) + rot;
            const vec = new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r);
            const ax0 = e.arc?.axis || {x: 0, y: 1, z: 0};
            const axis = new THREE.Vector3(
                evalNumberExpr(ax0.x, 0),
                evalNumberExpr(ax0.y, 1),
                evalNumberExpr(ax0.z, 0)
            );
            return rotateToAxis(vec, axis).add(off);
        }

        if (t === "spiral") {
            const s = e.spiral || {};
            const count = Math.max(2, evalIntExpr(pp.countMax, 2, {}, { min: 2 }));
            const idx = randInt(0, count - 1);
            const process = idx / Math.max(1, count - 1);
            const rBias = Math.pow(process, evalNumberExpr(s.rBias, 1.0, {}, { min: 0.01 }));
            const hBias = Math.pow(process, evalNumberExpr(s.hBias, 1.0, {}, { min: 0.01 }));
            const radius = lerp(evalNumberExpr(s.startR, 0.5), evalNumberExpr(s.endR, 2.5), rBias);
            const height = lerp(0, evalNumberExpr(s.height, 2.0), hBias);
            const angle = idx * evalNumberExpr(s.rotateSpeed, 0);
            const vec = new THREE.Vector3(Math.cos(angle) * radius, height, Math.sin(angle) * radius);
            const ax0 = s.axis || {x: 0, y: 1, z: 0};
            const axis = new THREE.Vector3(
                evalNumberExpr(ax0.x, 0),
                evalNumberExpr(ax0.y, 1),
                evalNumberExpr(ax0.z, 0)
            );
            return rotateToAxis(vec, axis).add(off);
        }

        // ring fallback
        const rr = evalNumberExpr(e.ring?.r, 1, {}, { min: 0.001 });
        const th = evalNumberExpr(e.ring?.thickness, 0, {}, { min: 0 });
        const a = rand(0, Math.PI * 2);
        let x = Math.cos(a) * rr;
        let z = Math.sin(a) * rr;
        let y = 0;

        if (th > 0) {
            const j = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1));
            if (j.lengthSq() > 1e-8) j.normalize().multiplyScalar(rand(0, th));
            x += j.x;
            y += j.y;
            z += j.z;
        }

        const ax0 = e.ring?.axis || {x: 0, y: 1, z: 0};
        const axis = new THREE.Vector3(
            evalNumberExpr(ax0.x, 0),
            evalNumberExpr(ax0.y, 1),
            evalNumberExpr(ax0.z, 0)
        );
        return rotateToAxis(new THREE.Vector3(x, y, z), axis).add(off);
    }

    function expDampFactor(damping, dt) {
        return Math.exp(-Math.max(0, damping) * dt);
    }

    function fadeK(t) {
        return t * t * t * (t * (t * 6 - 15) + 10);
    }

    function lerpK(a, b, t) {
        return a + (b - a) * t;
    }

    function hash3K(ix, iy, iz, seed) {
        let n = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(iz, 2147483647) + Math.imul(seed, 374761)) | 0;
        n = Math.imul((n ^ (n >>> 13)) | 0, 1274126177) | 0;
        n = (n ^ (n >>> 16)) | 0;
        return ((n & 0x7fffffff) / 2147483647.0);
    }

    function valueNoise3KXYZ(x, y, z, seed) {
        const x0 = Math.floor(x) | 0;
        const y0 = Math.floor(y) | 0;
        const z0 = Math.floor(z) | 0;

        const fx = x - x0;
        const fy = y - y0;
        const fz = z - z0;

        const u = fadeK(fx);
        const v = fadeK(fy);
        const w = fadeK(fz);

        const h = (dx, dy, dz) => hash3K((x0 + dx), (y0 + dy), (z0 + dz), seed);

        const n000 = h(0, 0, 0);
        const n100 = h(1, 0, 0);
        const n010 = h(0, 1, 0);
        const n110 = h(1, 1, 0);
        const n001 = h(0, 0, 1);
        const n101 = h(1, 0, 1);
        const n011 = h(0, 1, 1);
        const n111 = h(1, 1, 1);

        const nx00 = lerpK(n000, n100, u);
        const nx10 = lerpK(n010, n110, u);
        const nx01 = lerpK(n001, n101, u);
        const nx11 = lerpK(n011, n111, u);

        const nxy0 = lerpK(nx00, nx10, v);
        const nxy1 = lerpK(nx01, nx11, v);

        return lerpK(nxy0, nxy1, w);
    }

    function valueNoise3K(p, seed) {
        return valueNoise3KXYZ(p.x, p.y, p.z, seed);
    }

    function inversePowerFalloff(dist, range, power) {
        const r = Math.max(1e-6, Number(range) || 1e-6);
        const p = Math.max(1.0, Number(power) || 1.0);
        const x = dist / r;
        return 1.0 / (1.0 + Math.pow(x, p));
    }

    function anyPerpToAxis(axisUnit) {
        const up = (Math.abs(axisUnit.y) < 0.99) ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
        const p = up.clone().cross(axisUnit);
        if (p.lengthSq() < 1e-12) return new THREE.Vector3(1, 0, 0);
        return p.normalize();
    }

    function smooth01(t) {
        const clamped = clamp(Number(t) || 0, 0, 1);
        return clamped * clamped * (3.0 - 2.0 * clamped);
    }

    function hashString32(raw) {
        const s = String(raw ?? "");
        let h = 2166136261 >>> 0;
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    function mulberry32(seed) {
        let t = seed >>> 0;
        return () => {
            t += 0x6d2b79f5;
            let x = Math.imul(t ^ (t >>> 15), 1 | t);
            x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
            return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
        };
    }

    function clampVectorLength(vec, maxLen) {
        if (!(maxLen > 0)) return vec;
        const len = vec.length();
        if (len <= 1e-9 || len <= maxLen) return vec;
        return vec.multiplyScalar(maxLen / len);
    }

    function transformMotionVector(vec, space, particle) {
        if (String(space || "WORLD") !== "LOCAL") return vec;
        const pitch = Number(particle?.pitch) || 0;
        const yaw = Number(particle?.yaw) || 0;
        const roll = Number(particle?.roll) || 0;
        const euler = new THREE.Euler(pitch, yaw, roll, "XYZ");
        return vec.applyEuler(euler);
    }

    function splitTopLevelArgs(text) {
        const parts = [];
        let depth = 0;
        let start = 0;
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (ch === "(") depth += 1;
            else if (ch === ")") depth = Math.max(0, depth - 1);
            else if (ch === "," && depth === 0) {
                parts.push(text.slice(start, i).trim());
                start = i + 1;
            }
        }
        const tail = text.slice(start).trim();
        if (tail) parts.push(tail);
        return parts;
    }

    function parseSourceVecExpr(raw, evalNumber, context = null) {
        const text = String(raw || "").trim();
        if (!text) return null;

        const emitterPos = (context?.emitterPos && context.emitterPos.isVector3)
            ? context.emitterPos.clone()
            : new THREE.Vector3(0, 0, 0);

        const parseVecArgs = (argsText) => {
            const parts = splitTopLevelArgs(argsText);
            if (parts.length !== 3) return null;
            return new THREE.Vector3(
                evalNumber(parts[0], 0),
                evalNumber(parts[1], 0),
                evalNumber(parts[2], 0)
            );
        };

        const vec3Match = /^Vec3\s*\((.*)\)\s*$/.exec(text);
        if (vec3Match) {
            return parseVecArgs(vec3Match[1]);
        }

        if (text === "this.pos") {
            return emitterPos;
        }

        if (!text.startsWith("this.pos")) {
            return parseVecArgs(text);
        }

        const result = emitterPos;
        let rest = text.slice("this.pos".length).trim();
        while (rest.length) {
            let op = null;
            if (rest.startsWith(".add")) op = "add";
            else if (rest.startsWith(".subtract")) op = "subtract";
            else return null;

            const openIdx = rest.indexOf("(");
            if (openIdx < 0) return null;

            let depth = 0;
            let closeIdx = -1;
            for (let i = openIdx; i < rest.length; i++) {
                const ch = rest[i];
                if (ch === "(") depth += 1;
                else if (ch === ")") {
                    depth -= 1;
                    if (depth === 0) {
                        closeIdx = i;
                        break;
                    }
                }
            }
            if (closeIdx < 0) return null;

            const delta = parseVecArgs(rest.slice(openIdx + 1, closeIdx));
            if (!delta) return null;
            if (op === "add") result.add(delta);
            else result.sub(delta);
            rest = rest.slice(closeIdx + 1).trim();
        }
        return result;
    }

    function normalizeRootLifecycleMode(rawMode) {
        const modeRaw = String(rawMode || "interval").trim().toLowerCase();
        if (modeRaw === "once") return "once";
        if (modeRaw === "interval_n_tick" || modeRaw === "intervalntick") return "interval_n_tick";
        return "interval";
    }

    function normalizeRootLifecycle(raw) {
        const src = (raw && typeof raw === "object") ? raw : {};
        const mode = normalizeRootLifecycleMode(src.mode);
        const intervalNum = Number(src.intervalTick);
        const maxTickNum = Number(src.maxTick);
        const intervalTick = Number.isFinite(intervalNum) ? Math.max(1, Math.trunc(intervalNum)) : 1;
        const maxTick = Number.isFinite(maxTickNum) ? Math.max(1, Math.trunc(maxTickNum)) : 120;
        return { mode, intervalTick, maxTick };
    }

    function shouldEmitOnParentTick(lifecycle, tick) {
        const t = Math.max(0, Math.trunc(Number(tick) || 0));
        if (lifecycle.mode === "once") return t === 1;
        if (lifecycle.mode === "interval") return ((t - 1) % lifecycle.intervalTick) === 0;
        if (t > lifecycle.maxTick) return false;
        return ((t - 1) % lifecycle.intervalTick) === 0;
    }

    function emitterWindowActive(emission, tick, evalNumber) {
        const startRaw = emission?.startTick;
        const endRaw = emission?.endTick;
        const startTick = Math.max(0, Math.trunc(evalNumber(startRaw, 0)));
        const endTick = Math.trunc(evalNumber(endRaw, -1));
        if (tick < startTick) return false;
        if (endTick >= 0 && tick > endTick) return false;
        return true;
    }

    function applyCommandJS(cmd, particle, dt) {
        const p = cmd.params;
        const vars = sim.behaviorRuntime.vars || {};
        const baseAge = Number(particle.age) || 0;
        const baseLife = Number(particle.life) || 0;
        const baseSign = Number(particle.sign) || 0;
        const baseRespawn = Number(particle.respawnCount) || 0;
        const baseTick = Number(sim.behaviorRuntime.tick) || 0;
        const num = (v, def = 0, extra = null, opts = null) => {
            const age = (extra && Number.isFinite(Number(extra.age))) ? Number(extra.age) : baseAge;
            const life = (extra && Number.isFinite(Number(extra.life))) ? Number(extra.life) : baseLife;
            const sign = (extra && Number.isFinite(Number(extra.sign))) ? Number(extra.sign) : baseSign;
            const respawnCount = (extra && Number.isFinite(Number(extra.respawnCount))) ? Number(extra.respawnCount) : baseRespawn;
            const tick = (extra && extra.tick !== undefined && Number.isFinite(Number(extra.tick))) ? Number(extra.tick) : baseTick;
            const intMode = !!opts?.int;
            const min = (opts && typeof opts.min === "number") ? opts.min : null;
            const max = (opts && typeof opts.max === "number") ? opts.max : null;
            return evalNumberFast(v, def, age, life, sign, respawnCount, tick, vars, intMode, min, max);
        };
        const t01 = (baseLife > 0) ? clamp(baseAge / baseLife, 0, 1) : 0.0;
        const cmdId = String(cmd?.id || cmd?.type || "command");
        const cmdStateMap = (particle.cmdState && typeof particle.cmdState === "object")
            ? particle.cmdState
            : (particle.cmdState = {});
        const ensureCmdState = (kind, factory) => {
            const key = `${cmdId}:${kind}`;
            if (!cmdStateMap[key]) cmdStateMap[key] = factory();
            return cmdStateMap[key];
        };
        const curveValue = (curve, fallback = 0, extra = null) => sampleFloatCurve(
            curve,
            t01,
            (v, def) => num(v, def, extra),
            fallback
        );

        switch (cmd.type) {
            case "ParticleNoiseCommand": {
                const seed = (particle.seed | 0);

                const strength = num(p.strength, 0.03);
                const frequency = num(p.frequency, 0.15);
                const speed = num(p.speed, 0.12);
                const affectY = num(p.affectY, 1.0);
                const clampSpeed = Math.max(0.0001, num(p.clampSpeed, 0.8, null, { min: 0.0001 }));
                const useLifeCurve = !!p.useLifeCurve;

                const time = baseAge * speed;
                const sampleX = particle.pos.x * frequency + time;
                const sampleY = particle.pos.y * frequency + time * 0.7;
                const sampleZ = particle.pos.z * frequency + time * 1.3;

                let nx = valueNoise3KXYZ(sampleX, sampleY, sampleZ, seed + 11) * 2 - 1;
                let ny = valueNoise3KXYZ(sampleX, sampleY, sampleZ, seed + 23) * 2 - 1;
                let nz = valueNoise3KXYZ(sampleX, sampleY, sampleZ, seed + 37) * 2 - 1;
                const len2 = nx * nx + ny * ny + nz * nz;
                if (len2 > 1e-9) {
                    const inv = 1.0 / Math.sqrt(len2);
                    nx *= inv;
                    ny *= inv;
                    nz *= inv;
                } else {
                    nx = 0;
                    ny = 0;
                    nz = 0;
                }

                let amp = strength;
                if (useLifeCurve) amp *= (1.0 - clamp(t01, 0, 1));

                particle.vel.x += nx * amp;
                particle.vel.y += ny * affectY * amp;
                particle.vel.z += nz * amp;

                const sp2 = particle.vel.x * particle.vel.x + particle.vel.y * particle.vel.y + particle.vel.z * particle.vel.z;
                const max2 = clampSpeed * clampSpeed;
                if (sp2 > max2 && sp2 > 1e-12) {
                    particle.vel.multiplyScalar(clampSpeed / Math.sqrt(sp2));
                }
                break;
            }

            case "ParticleDragCommand": {
                const damping = num(p.damping, 0.15);
                const minSpeed = num(p.minSpeed, 0.0);
                const linear = num(p.linear, 0.0);

                const sp = particle.vel.length();
                if (minSpeed > 0 && sp <= minSpeed) {
                    particle.vel.set(0, 0, 0);
                    break;
                }
                particle.vel.multiplyScalar(expDampFactor(damping, 1.0));
                if (linear > 0) particle.vel.multiplyScalar(clamp(1.0 - linear, 0, 1));
                break;
            }

            case "ParticleFlowFieldCommand": {
                const amplitude = num(p.amplitude, 0.15);
                const frequency = num(p.frequency, 0.25);
                const timeScale = num(p.timeScale, 0.06);
                const phaseOffset = num(p.phaseOffset, 0.0);

                const ox = num(p.worldOffsetX, 0.0);
                const oy = num(p.worldOffsetY, 0.0);
                const oz = num(p.worldOffsetZ, 0.0);

                const sx = particle.pos.x + ox;
                const sy = particle.pos.y + oy;
                const sz = particle.pos.z + oz;
                const t = (baseAge * timeScale) + phaseOffset;

                const fx = Math.sin((sy + t) * frequency) + Math.cos((sz - t) * frequency);
                const fy = Math.sin((sz + t) * frequency) + Math.cos((sx + t) * frequency);
                const fz = Math.sin((sx - t) * frequency) + Math.cos((sy - t) * frequency);

                const gain = amplitude * 0.5;
                particle.vel.x += fx * gain;
                particle.vel.y += fy * gain;
                particle.vel.z += fz * gain;
                break;
            }

            case "ParticleAttractionCommand": {
                const tx = num(p.targetX, 0);
                const ty = num(p.targetY, 0);
                const tz = num(p.targetZ, 0);

                const strength = num(p.strength, 0);
                const range = num(p.range, 1);
                const falloffPower = num(p.falloffPower, 2);
                const minDistance = Math.max(1e-6, num(p.minDistance, 0.25, null, { min: 1e-6 }));

                const dx = tx - particle.pos.x;
                const dy = ty - particle.pos.y;
                const dz = tz - particle.pos.z;
                const rawDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
                if (rawDist < 1e-9) break;

                const dist = Math.max(rawDist, minDistance);
                const falloff = inversePowerFalloff(dist, range, falloffPower);
                const scale = (strength * falloff) / dist;
                particle.vel.x += dx * scale;
                particle.vel.y += dy * scale;
                particle.vel.z += dz * scale;
                break;
            }

            case "ParticleOrbitCommand": {
                const cx = num(p.centerX, 0), cy = num(p.centerY, 0), cz = num(p.centerZ, 0);

                const ax = num(p.axisX, 0), ay = num(p.axisY, 1), az = num(p.axisZ, 0);
                const axis = new THREE.Vector3(ax, ay, az);
                const axisLen = axis.length();
                if (axisLen < 1e-9) break;
                axis.multiplyScalar(1.0 / axisLen);

                const radius = num(p.radius, 0);
                const angularSpeed = num(p.angularSpeed, 0);
                const radialCorrect = num(p.radialCorrect, 0);
                const minDistance = Math.max(1e-6, num(p.minDistance, 0.2, null, { min: 1e-6 }));
                const maxRadialStep = num(p.maxRadialStep, 0.5);
                const mode = (p.mode || "PHYSICAL");

                const center = new THREE.Vector3(cx, cy, cz);

                const r = particle.pos.clone().sub(center);
                const axial = axis.clone().multiplyScalar(r.dot(axis));
                const radialVec = r.clone().sub(axial);

                const radialDist0 = radialVec.length();

                const radialN = (radialDist0 < 1e-6)
                    ? anyPerpToAxis(axis)
                    : radialVec.multiplyScalar(1.0 / Math.max(radialDist0, minDistance));

                const radialDist = Math.max(radialDist0, minDistance);

                let tang = axis.clone().cross(radialN);
                const tLen = tang.length();
                if (tLen < 1e-9) tang = anyPerpToAxis(axis);
                else tang.multiplyScalar(1.0 / tLen);

                const dvTan = tang.multiplyScalar(angularSpeed);
                const err = radialDist - radius;

                if (mode === "SNAP") {
                    const targetPos = center.clone().add(axial).add(radialN.clone().multiplyScalar(radius));
                    const snapVec = targetPos.sub(particle.pos);
                    particle.vel.add(dvTan).add(snapVec.multiplyScalar(radialCorrect));
                } else {
                    const raw = (-err) * radialCorrect;
                    const step = clamp(raw, -maxRadialStep, maxRadialStep);
                    const dvRad = radialN.clone().multiplyScalar(step);
                    particle.vel.add(dvTan).add(dvRad);
                }
                break;
            }

            case "ParticleVortexCommand": {
                const cx = num(p.centerX, 0), cy = num(p.centerY, 0), cz = num(p.centerZ, 0);

                const ax0 = num(p.axisX, 0), ay0 = num(p.axisY, 1), az0 = num(p.axisZ, 0);
                const axis = new THREE.Vector3(ax0, ay0, az0);
                const axisLen = axis.length();
                if (axisLen < 1e-9) break;
                axis.multiplyScalar(1.0 / axisLen);

                const swirlStrength = num(p.swirlStrength, 0);
                const radialPull = num(p.radialPull, 0);
                const axialLift = num(p.axialLift, 0);

                const range = num(p.range, 1);
                const falloffPower = num(p.falloffPower, 1);
                const minDistance = Math.max(1e-6, num(p.minDistance, 0.2, null, { min: 1e-6 }));

                const center = new THREE.Vector3(cx, cy, cz);

                const r = particle.pos.clone().sub(center);
                const dist0 = r.length();
                if (dist0 < 1e-9) break;

                const dist = Math.max(dist0, minDistance);
                const falloff = inversePowerFalloff(dist, range, falloffPower);

                const tang = axis.clone().cross(r);
                const tLen = tang.length();
                if (tLen < 1e-9) break;
                tang.multiplyScalar(1.0 / tLen);

                const inward = r.multiplyScalar(-1.0 / dist);

                const dv = new THREE.Vector3(0, 0, 0)
                    .add(tang.multiplyScalar(swirlStrength * falloff))
                    .add(inward.multiplyScalar(radialPull * falloff))
                    .add(axis.clone().multiplyScalar(axialLift * falloff));

                particle.vel.add(dv);
                break;
            }

            case "ParticleToroidalCirculationCommand": {
                const cx = num(p.centerX, 0), cy = num(p.centerY, 0), cz = num(p.centerZ, 0);

                const ax0 = num(p.axisX, 0), ay0 = num(p.axisY, 1), az0 = num(p.axisZ, 0);
                const axis = new THREE.Vector3(ax0, ay0, az0);
                const axisLen = axis.length();
                if (axisLen < 1e-9) axis.set(0, 1, 0);
                else axis.multiplyScalar(1.0 / axisLen);

                const ringRadius = num(p.ringRadius, 3.0);
                const radialThickness = Math.max(1e-6, num(p.radialThickness, 1.2, null, { min: 1e-6 }));
                const axialThickness = Math.max(1e-6, num(p.axialThickness, 0.8, null, { min: 1e-6 }));
                const circulationStrength = num(p.circulationStrength, 0.35);
                const outwardStrength = num(p.outwardStrength, 0.0);
                const upwardStrength = num(p.upwardStrength, 0.0);
                const followStrength = num(p.followStrength, 0.12);
                const maxStep = num(p.maxStep, 0.6);
                const useLifeCurve = !!p.useLifeCurve;

                const center = new THREE.Vector3(cx, cy, cz);
                const rel = particle.pos.clone().sub(center);

                const axialDistance = rel.dot(axis);
                const planar = rel.clone().sub(axis.clone().multiplyScalar(axialDistance));
                const planarLen = planar.length();
                const radialDir = (planarLen < 1e-9)
                    ? anyPerpToAxis(axis)
                    : planar.clone().multiplyScalar(1.0 / planarLen);

                const qr = planarLen - ringRadius;
                const localRadial = qr / radialThickness;
                const localAxial = axialDistance / axialThickness;
                const normalizedDistance = Math.sqrt(localRadial * localRadial + localAxial * localAxial);

                const insideBand = normalizedDistance < 1.0;
                const bandWeight = insideBand ? smooth01(1.0 - normalizedDistance) : 0.0;
                const outerDistance = Math.max(0.0, normalizedDistance - 1.0);
                const captureWeight = outerDistance > 0.0
                    ? (1.0 / (1.0 + outerDistance * outerDistance * 4.0))
                    : 0.0;
                const lifeMul = (useLifeCurve && particle.life > 0)
                    ? clamp(1.0 - (particle.age / particle.life), 0.0, 1.0)
                    : 1.0;
                if (lifeMul <= 1e-9) break;

                const currentVelocity = (particle.vel.lengthSq() > 1e-12)
                    ? particle.vel.clone()
                    : new THREE.Vector3(0, 0, 0);
                const currentSpeed = currentVelocity.length();
                if (currentSpeed <= 1e-9) break;
                const currentDir = currentVelocity.clone().multiplyScalar(1.0 / currentSpeed);

                const circulationVector = radialDir.clone().multiplyScalar(-localAxial)
                    .add(axis.clone().multiplyScalar(localRadial));
                const toBandCenter = radialDir.clone().multiplyScalar(-localRadial)
                    .add(axis.clone().multiplyScalar(-localAxial));

                const desiredFlow = new THREE.Vector3(0, 0, 0);
                const circulationWeight = bandWeight * lifeMul;
                if (circulationStrength !== 0.0 && circulationWeight > 1e-9 && circulationVector.lengthSq() > 1e-12) {
                    desiredFlow.add(circulationVector.multiplyScalar(circulationStrength * circulationWeight));
                }
                if (insideBand && outwardStrength !== 0.0 && circulationWeight > 1e-9) {
                    desiredFlow.add(radialDir.clone().multiplyScalar(outwardStrength * circulationWeight));
                }
                if (insideBand && upwardStrength !== 0.0 && circulationWeight > 1e-9) {
                    desiredFlow.add(axis.clone().multiplyScalar(upwardStrength * circulationWeight));
                }

                const captureMul = captureWeight * lifeMul;
                if (followStrength !== 0.0 && captureMul > 1e-9 && toBandCenter.lengthSq() > 1e-12) {
                    desiredFlow.add(toBandCenter.clone().normalize().multiplyScalar(followStrength * captureMul));
                }

                const desiredFlowLen = desiredFlow.length();
                if (desiredFlowLen <= 1e-9) break;
                const desiredDir = desiredFlow.clone().multiplyScalar(1.0 / desiredFlowLen);
                const turnedDir = currentDir.clone().add(desiredDir.multiplyScalar(desiredFlowLen));
                const turnedLen = turnedDir.length();
                if (turnedLen <= 1e-12) break;
                turnedDir.multiplyScalar(1.0 / turnedLen);

                const dv = turnedDir.multiplyScalar(currentSpeed).sub(currentVelocity);
                const dvLen = dv.length();
                if (maxStep > 0.0 && dvLen > maxStep) {
                    dv.multiplyScalar(maxStep / dvLen);
                }

                particle.vel.add(dv);
                break;
            }

            case "ParticleRotationForceCommand": {
                const cx = num(p.centerX, 0), cy = num(p.centerY, 0), cz = num(p.centerZ, 0);

                const ax0 = num(p.axisX, 0), ay0 = num(p.axisY, 1), az0 = num(p.axisZ, 0);
                const ax = new THREE.Vector3(ax0, ay0, az0);
                const axLen = ax.length();
                if (axLen < 1e-9) break;
                ax.multiplyScalar(1.0 / axLen);

                const strength = num(p.strength, 0);
                const range = num(p.range, 1);
                const falloffPower = num(p.falloffPower, 1);

                const r = particle.pos.clone().sub(new THREE.Vector3(cx, cy, cz));
                const dist = r.length();
                if (dist < 1e-9) break;

                let t = ax.clone().cross(r);
                const tLen = t.length();
                if (tLen < 1e-9) break;
                t.multiplyScalar(1.0 / tLen);

                const falloff = inversePowerFalloff(dist, range, falloffPower);
                const dv = t.multiplyScalar(strength * falloff);

                particle.vel.add(dv);
                break;
            }

            case "ParticleDistortionCommand": {
                const cx = num(p.centerX, 0);
                const cy = num(p.centerY, 0);
                const cz = num(p.centerZ, 0);

                const ax0 = num(p.axisX, 0);
                const ay0 = num(p.axisY, 1);
                const az0 = num(p.axisZ, 0);
                const axis = new THREE.Vector3(ax0, ay0, az0);
                const axisLen = axis.length();
                if (axisLen < 1e-9) {
                    axis.set(0, 1, 0);
                } else {
                    axis.multiplyScalar(1.0 / axisLen);
                }

                const radius = num(p.radius, 0);
                const radialStrength = num(p.radialStrength, 0);
                const axialStrength = num(p.axialStrength, 0);
                const tangentialStrength = num(p.tangentialStrength, 0);
                const frequency = num(p.frequency, 0);
                const timeScale = num(p.timeScale, 0);
                const phaseOffset = num(p.phaseOffset, 0);
                const followStrength = num(p.followStrength, 0);
                const maxStep = num(p.maxStep, 0);
                const baseAxial = num(p.baseAxial, 0);
                const seedOffset = Math.trunc(num(p.seedOffset, 0));
                const useLifeCurve = !!p.useLifeCurve;

                const center = new THREE.Vector3(cx, cy, cz);
                const r = particle.pos.clone().sub(center);
                const axialComp = axis.clone().multiplyScalar(r.dot(axis));
                let radial = r.clone().sub(axialComp);
                let radialLen = radial.length();
                if (radialLen < 1e-9) {
                    radial = anyPerpToAxis(axis);
                    radialLen = 1.0;
                } else {
                    radial.multiplyScalar(1.0 / radialLen);
                }

                let tangent = axis.clone().cross(radial);
                const tLen = tangent.length();
                if (tLen < 1e-9) tangent = anyPerpToAxis(axis);
                else tangent.multiplyScalar(1.0 / tLen);

                const lifeT = (particle.life > 0) ? (particle.age / particle.life) : 0.0;
                const lifeMul = useLifeCurve ? clamp(1.0 - lifeT, 0, 1) : 1.0;

                const time = particle.age * timeScale + phaseOffset;
                const local = particle.pos.clone().sub(center);
                const samplePos = local.multiplyScalar(frequency)
                    .add(new THREE.Vector3(time, time * 0.7, time * 1.3));
                const seed = (particle.seed | 0) + seedOffset;

                const nr = valueNoise3K(samplePos, seed + 11) * 2 - 1;
                const na = valueNoise3K(samplePos, seed + 23) * 2 - 1;
                const nt = valueNoise3K(samplePos, seed + 37) * 2 - 1;

                const targetRadius = Math.max(0.0, radius + nr * radialStrength * lifeMul);
                const targetAxial = baseAxial + na * axialStrength * lifeMul;
                const targetTangential = nt * tangentialStrength * lifeMul;

                const targetPos = center.clone()
                    .add(axis.clone().multiplyScalar(targetAxial))
                    .add(radial.clone().multiplyScalar(targetRadius))
                    .add(tangent.clone().multiplyScalar(targetTangential));

                let dv = targetPos.sub(particle.pos).multiplyScalar(followStrength);
                const dvLen = dv.length();
                if (maxStep > 0.0 && dvLen > maxStep) {
                    dv.multiplyScalar(maxStep / dvLen);
                }
                particle.vel.add(dv);
                break;
            }

            case "ParticleLifetimeMotionCommand": {
                const state = ensureCmdState("lifetime_motion", () => ({
                    applied: new THREE.Vector3(0, 0, 0),
                    random: null,
                }));
                const randomize = !!p.randomizePerParticle;
                let scale = { x: 1, y: 1, z: 1 };
                if (randomize) {
                    const minScale = Math.min(num(p.randomScaleMin, 1.0), num(p.randomScaleMax, 1.0));
                    const maxScale = Math.max(num(p.randomScaleMin, 1.0), num(p.randomScaleMax, 1.0));
                    const seedOffset = Math.trunc(num(p.randomSeedOffset, 0));
                    const randomKey = `${minScale}|${maxScale}|${seedOffset}`;
                    if (!state.random || state.random.key !== randomKey) {
                        const seed = ((particle.seed | 0) ^ seedOffset ^ hashString32(cmdId)) >>> 0;
                        const rng = mulberry32(seed);
                        const pick = () => (Math.abs(maxScale - minScale) < 1e-9) ? minScale : (minScale + (maxScale - minScale) * rng());
                        state.random = { key: randomKey, x: pick(), y: pick(), z: pick() };
                    }
                    scale = state.random;
                } else {
                    state.random = null;
                }

                const force = new THREE.Vector3(
                    curveValue(p.forceX, 0.0),
                    curveValue(p.forceY, 0.0),
                    curveValue(p.forceZ, 0.0)
                );
                force.set(force.x * scale.x, force.y * scale.y, force.z * scale.z);
                transformMotionVector(force, p.forceSpace, particle);
                if (force.lengthSq() > 1e-12) {
                    particle.vel.add(force);
                }

                const sampledVelocity = new THREE.Vector3(
                    curveValue(p.velocityX, 0.0),
                    curveValue(p.velocityY, 0.0),
                    curveValue(p.velocityZ, 0.0)
                );
                sampledVelocity.set(sampledVelocity.x * scale.x, sampledVelocity.y * scale.y, sampledVelocity.z * scale.z);
                transformMotionVector(sampledVelocity, p.velocitySpace, particle);

                const velocityMode = String(p.velocityMode || "ADD");
                const maxDelta = num(p.maxVelocityDeltaPerTick, 0.0);
                if (velocityMode === "OVERRIDE") {
                    state.applied.set(0, 0, 0);
                    let target = sampledVelocity.clone();
                    if (maxDelta > 0.0) {
                        const delta = target.clone().sub(particle.vel);
                        clampVectorLength(delta, maxDelta);
                        target = particle.vel.clone().add(delta);
                    }
                    particle.vel.copy(target);
                } else if (velocityMode === "MULTIPLY") {
                    state.applied.set(0, 0, 0);
                    const current = particle.vel.clone();
                    let target = new THREE.Vector3(
                        current.x * sampledVelocity.x,
                        current.y * sampledVelocity.y,
                        current.z * sampledVelocity.z
                    );
                    if (maxDelta > 0.0) {
                        const delta = target.clone().sub(current);
                        clampVectorLength(delta, maxDelta);
                        target = current.add(delta);
                    }
                    particle.vel.copy(target);
                } else {
                    const delta = sampledVelocity.clone().sub(state.applied);
                    clampVectorLength(delta, maxDelta);
                    if (delta.lengthSq() > 1e-12) {
                        particle.vel.add(delta);
                    }
                    state.applied.add(delta);
                }
                break;
            }

            case "ParticleInheritVelocityCommand": {
                const state = ensureCmdState("inherit_velocity", () => ({
                    initialized: false,
                    applied: new THREE.Vector3(0, 0, 0),
                    random: null,
                }));
                const randomize = !!p.randomizePerParticle;
                let scale = { x: 1, y: 1, z: 1 };
                if (randomize) {
                    const minScale = Math.min(num(p.randomScaleMin, 1.0), num(p.randomScaleMax, 1.0));
                    const maxScale = Math.max(num(p.randomScaleMin, 1.0), num(p.randomScaleMax, 1.0));
                    const seedOffset = Math.trunc(num(p.randomSeedOffset, 0));
                    const randomKey = `${minScale}|${maxScale}|${seedOffset}`;
                    if (!state.random || state.random.key !== randomKey) {
                        const seed = ((particle.seed | 0) ^ seedOffset ^ hashString32(cmdId)) >>> 0;
                        const rng = mulberry32(seed);
                        const pick = () => (Math.abs(maxScale - minScale) < 1e-9) ? minScale : (minScale + (maxScale - minScale) * rng());
                        state.random = { key: randomKey, x: pick(), y: pick(), z: pick() };
                    }
                    scale = state.random;
                } else {
                    state.random = null;
                }

                let source = new THREE.Vector3(0, 0, 0);
                if (String(p.sourceMode || "emitter_velocity") === "custom") {
                    const parsed = parseSourceVecExpr(p.sourceExpr, (v, def) => num(v, def), { emitterPos: particle.emitterPos });
                    if (parsed) source.copy(parsed);
                } else if (particle.emitterVelocity && particle.emitterVelocity.isVector3) {
                    source.copy(particle.emitterVelocity);
                }

                source.set(
                    source.x * num(p.axisMaskX, 1.0),
                    source.y * num(p.axisMaskY, 1.0),
                    source.z * num(p.axisMaskZ, 1.0)
                );
                source.set(source.x * scale.x, source.y * scale.y, source.z * scale.z);

                const multiplier = num(p.multiplier, 1.0);
                const lifeMul = curveValue(p.overLifetime, 1.0);
                source.multiplyScalar(multiplier * lifeMul);
                transformMotionVector(source, p.space, particle);
                clampVectorLength(source, num(p.maxContributionSpeed, 0.0));

                const mode = String(p.mode || "INITIAL");
                const damping = num(p.damping, 0.0);
                let target;
                if (mode === "CURRENT") {
                    state.initialized = true;
                    if (damping > 0.0) {
                        const follow = clamp(1.0 - expDampFactor(damping, 1.0), 0, 1);
                        target = state.applied.clone().add(source.clone().sub(state.applied).multiplyScalar(follow));
                    } else {
                        target = source.clone();
                    }
                } else {
                    if (!state.initialized) {
                        state.initialized = true;
                        target = source.clone();
                    } else if (damping > 0.0) {
                        target = state.applied.clone().multiplyScalar(expDampFactor(damping, 1.0));
                    } else {
                        target = state.applied.clone();
                    }
                }

                const delta = target.clone().sub(state.applied);
                if (delta.lengthSq() > 1e-12) {
                    particle.vel.add(delta);
                }
                state.applied.copy(target);
                break;
            }

            case "ParticleGravityCommand": {
                const g = 0.8;
                particle.vel.y -= g * dt;
                particle.vel.multiplyScalar(Math.pow(0.98, dt * 20.0));
                break;
            }

            default:
                break;
        }
    }

    function clearParticles(resetEmit = true) {
        sim.particles.length = 0;
        if (resetEmit) resetEmission();
    }

    function resetEmission() {
        const state = getState();
        const emitters = getEmittersFromState(state);
        ensureEmitterRuntime(emitters);
        for (const rt of sim.emitRuntime.values()) {
            rt.emittedOnce = false;
            rt.burstTick = 1e9;
        }
        sim.behaviorRuntime.tick = 0;
        sim.behaviorRuntime.sig = "";
        sim.behaviorRuntime.vars = {};
    }

    function setShowAxes(show) {
        if (axesHelper) axesHelper.visible = !!show;
    }

    function setShowGrid(show) {
        if (gridHelper) gridHelper.visible = !!show;
    }

    function setPointScale(next) {
        const v = Number(next);
        pointScale = Number.isFinite(v) && v > 0 ? v : 1.0;
    }

    function resetTime() {
        sim.lastTime = performance.now();
        fpsRuntime.accSeconds = 0;
        fpsRuntime.frameCount = 0;
    }

    initThree();
    animate();

    return {
        resizeRenderer,
        clearParticles,
        resetEmission,
        setDoTickCompiled,
        setShowAxes,
        setShowGrid,
        setPointScale,
        resetTime,
        openDistanceToolMenu() {
            previewDistanceTool?.toggleMeasureMode();
        },
    };
}
