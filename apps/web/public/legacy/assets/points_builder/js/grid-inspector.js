import * as THREE from "three";

const PLANE_AXES = {
    XZ: ["x", "z"],
    XY: ["x", "y"],
    ZY: ["z", "y"]
};

function formatNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number) || Math.abs(number) < 1e-10) return "0";
    return Number(number.toFixed(6)).toString();
}

function makeLabelSprite(text) {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 64;
    const context = canvas.getContext("2d");
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = "600 34px sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineWidth = 7;
    context.strokeStyle = "rgba(5, 10, 18, 0.82)";
    context.strokeText(text, canvas.width / 2, canvas.height / 2);
    context.fillStyle = "#f8fafc";
    context.fillText(text, canvas.width / 2, canvas.height / 2);
    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map: texture,
        transparent: true,
        depthTest: false,
        depthWrite: false
    }));
    sprite.renderOrder = 42;
    return sprite;
}

function setPointOnPlane(target, plane, first, second) {
    target.set(0, 0, 0);
    const axes = PLANE_AXES[plane] || PLANE_AXES.XZ;
    target[axes[0]] = first;
    target[axes[1]] = second;
    return target;
}

export function createGridInspector({
    scene,
    camera,
    controls,
    renderer,
    host,
    adaptiveGrid,
    getPlane,
    isVisible,
    isAxesVisible,
    isInteractionBlocked
} = {}) {
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const hit = new THREE.Vector3();
    const plane = new THREE.Plane();
    const highlightGeometry = new THREE.BufferGeometry();
    highlightGeometry.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3).setUsage(THREE.DynamicDrawUsage));
    const highlight = new THREE.Line(highlightGeometry, new THREE.LineBasicMaterial({
        color: 0xffd166,
        transparent: true,
        opacity: 0.98,
        depthTest: false,
        depthWrite: false
    }));
    highlight.renderOrder = 40;
    highlight.visible = false;
    scene.add(highlight);

    const labels = ["-1", "1", "-1", "1"].map(makeLabelSprite);
    const labelGroup = new THREE.Group();
    labels.forEach((label) => labelGroup.add(label));
    labelGroup.renderOrder = 42;
    labelGroup.visible = false;
    scene.add(labelGroup);

    const tooltip = document.createElement("div");
    tooltip.className = "grid-measure-tooltip hidden";
    host?.appendChild(tooltip);
    let pointerEvent = null;
    let hoverInfo = null;

    function currentPlane() {
        const value = String(getPlane?.() || "XZ").toUpperCase();
        return PLANE_AXES[value] ? value : "XZ";
    }

    function setRayPlane(planeKey) {
        if (planeKey === "XY") plane.set(new THREE.Vector3(0, 0, 1), 0.01);
        else if (planeKey === "ZY") plane.set(new THREE.Vector3(1, 0, 0), 0.01);
        else plane.set(new THREE.Vector3(0, 1, 0), 0.01);
    }

    function hideHover() {
        hoverInfo = null;
        highlight.visible = false;
        tooltip.classList.add("hidden");
    }

    function updateAxisLabels(metrics, planeKey) {
        const visibleStep = Number(metrics?.blend) >= 0.5 ? metrics?.coarseStep : metrics?.fineStep;
        const stepIsOne = Math.abs(Number(visibleStep) - 1) < 1e-8;
        labelGroup.visible = Boolean(isVisible?.() && isAxesVisible?.() && stepIsOne);
        if (!labelGroup.visible) return;
        const axes = PLANE_AXES[planeKey] || PLANE_AXES.XZ;
        const positions = [
            [-1, 0],
            [1, 0],
            [0, -1],
            [0, 1]
        ];
        positions.forEach(([first, second], index) => {
            setPointOnPlane(labels[index].position, planeKey, first, second);
        });
        const distance = camera.position.distanceTo(controls.target);
        const scale = Math.max(0.3, distance * 0.028);
        labels.forEach((label) => label.scale.set(scale * 2, scale, 1));
        labelGroup.userData.axes = axes;
    }

    function updateHighlight(metrics, planeKey) {
        if (!pointerEvent || isInteractionBlocked?.() || !isVisible?.()) {
            hideHover();
            return;
        }
        const rect = renderer.domElement.getBoundingClientRect();
        pointer.x = ((pointerEvent.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
        pointer.y = -(((pointerEvent.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);
        raycaster.setFromCamera(pointer, camera);
        setRayPlane(planeKey);
        if (!raycaster.ray.intersectPlane(plane, hit)) {
            hideHover();
            return;
        }
        const axes = PLANE_AXES[planeKey] || PLANE_AXES.XZ;
        const visibleStep = Number(metrics?.blend) >= 0.5 ? metrics?.coarseStep : metrics?.fineStep;
        const step = Math.max(0.000001, Number(visibleStep) || 1);
        const firstValue = hit[axes[0]];
        const secondValue = hit[axes[1]];
        const firstLine = Math.round(firstValue / step) * step;
        const secondLine = Math.round(secondValue / step) * step;
        const firstDistance = Math.abs(firstValue - firstLine);
        const secondDistance = Math.abs(secondValue - secondLine);
        const cameraDistance = camera.position.distanceTo(controls.target);
        const worldPerPixel = 2 * cameraDistance * Math.tan(camera.fov * Math.PI / 360) / Math.max(1, renderer.domElement.clientHeight);
        const threshold = Math.min(step * 0.35, Math.max(step * 0.08, worldPerPixel * 7));
        const useFirst = firstDistance <= secondDistance;
        const nearestDistance = useFirst ? firstDistance : secondDistance;
        if (nearestDistance > threshold) {
            hideHover();
            return;
        }
        const start = new THREE.Vector3();
        const end = new THREE.Vector3();
        if (useFirst) {
            const segmentStart = Math.floor(secondValue / step) * step;
            setPointOnPlane(start, planeKey, firstLine, segmentStart);
            setPointOnPlane(end, planeKey, firstLine, segmentStart + step);
        } else {
            const segmentStart = Math.floor(firstValue / step) * step;
            setPointOnPlane(start, planeKey, segmentStart, secondLine);
            setPointOnPlane(end, planeKey, segmentStart + step, secondLine);
        }
        const position = highlight.geometry.getAttribute("position");
        const values = position.array;
        values[0] = start.x;
        values[1] = start.y;
        values[2] = start.z;
        values[3] = end.x;
        values[4] = end.y;
        values[5] = end.z;
        position.needsUpdate = true;
        highlight.geometry.computeBoundingSphere();
        highlight.visible = true;
        const coordinateAxis = useFirst ? axes[0].toUpperCase() : axes[1].toUpperCase();
        const coordinateValue = useFirst ? firstLine : secondLine;
        hoverInfo = {
            coordinateAxis,
            coordinateValue,
            length: start.distanceTo(end),
            start: start.clone(),
            end: end.clone()
        };
        tooltip.textContent = `${coordinateAxis} = ${formatNumber(coordinateValue)} · 线段长度 ${formatNumber(hoverInfo.length)}`;
        tooltip.classList.remove("hidden");
        const left = Math.max(6, Math.min(
            Math.max(6, (host?.clientWidth || rect.width) - tooltip.offsetWidth - 6),
            pointerEvent.clientX - rect.left + 14
        ));
        const top = Math.max(6, Math.min(
            Math.max(6, (host?.clientHeight || rect.height) - tooltip.offsetHeight - 6),
            pointerEvent.clientY - rect.top - 32
        ));
        tooltip.style.left = `${left}px`;
        tooltip.style.top = `${top}px`;
    }

    function update() {
        const metrics = adaptiveGrid?.getMetrics?.() || null;
        const planeKey = currentPlane();
        updateAxisLabels(metrics, planeKey);
        updateHighlight(metrics, planeKey);
    }

    function onPointerMove(event) {
        pointerEvent = event;
    }

    function onPointerLeave() {
        pointerEvent = null;
        hideHover();
    }

    renderer?.domElement?.addEventListener("pointermove", onPointerMove, { passive: true });
    renderer?.domElement?.addEventListener("pointerleave", onPointerLeave, { passive: true });

    return {
        update,
        hide: hideHover,
        getHoverInfo: () => hoverInfo,
        dispose() {
            renderer?.domElement?.removeEventListener("pointermove", onPointerMove);
            renderer?.domElement?.removeEventListener("pointerleave", onPointerLeave);
            scene.remove(highlight);
            scene.remove(labelGroup);
            highlight.geometry.dispose();
            highlight.material.dispose();
            labels.forEach((label) => {
                label.material?.map?.dispose?.();
                label.material?.dispose?.();
            });
            tooltip.remove();
        }
    };
}
