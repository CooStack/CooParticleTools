import {
    applyCompositionPreset,
    createCompositionPreset,
    createCompositionPresetStorage,
    isPresetCategoryAccessible,
    normalizePresetCategory,
    normalizePresetDescription,
    normalizePresetName,
    normalizePresetTreePath
} from "./preset_store.js?v=20260729_4";

export function installCompositionPresetMethods(CompositionBuilderApp, deps = {}) {
    const {
        esc,
        normalizeCard,
        normalizeShapeTreeNode
    } = deps;
    if (!CompositionBuilderApp?.prototype) throw new Error("installCompositionPresetMethods requires CompositionBuilderApp");
    if (typeof esc !== "function" || typeof normalizeCard !== "function" || typeof normalizeShapeTreeNode !== "function") {
        throw new Error("installCompositionPresetMethods dependencies are incomplete");
    }

    class CompositionPresetMixin {
    initCompositionPresetState() {
        const createModalState = (category) => ({
            category,
            folders: [
                { name: "cards", builtin: true, count: 0 },
                { name: "nodes", builtin: true, count: 0 },
                { name: "shared", builtin: true, count: 0 }
            ],
            context: null,
            items: [],
            selectedName: "",
            query: "",
            saveDialogOpen: false,
            saveDialogGeneration: 0,
            saveDialogSubmitting: false,
            folderEditorOpen: false,
            rowEditor: null,
            contextMenu: null,
            draggedName: "",
            loadedPreset: null,
            loadedKey: "",
            loading: false,
            requestToken: 0,
            folderRequestToken: 0,
            operationToken: 0
        });
        this.projectPresetContext = {
            projectFilePath: "",
            projectId: "",
            projectType: "composition",
            projectName: ""
        };
        this.compositionPresetState = {
            card: createModalState("cards"),
            node: createModalState("nodes")
        };
    }

    getCompositionPresetState(targetKind) {
        const state = this.compositionPresetState?.[targetKind];
        if (!state) throw new Error("未知的预设窗口。");
        return state;
    }

    getCompositionPresetUi(targetKind) {
        const card = targetKind === "card";
        return {
            modal: card ? this.dom.cardPresetModal : this.dom.nodePresetModal,
            mask: card ? this.dom.cardPresetMask : this.dom.nodePresetMask,
            context: card ? this.dom.cardPresetContext : this.dom.nodePresetContext,
            search: card ? this.dom.cardPresetSearch : this.dom.nodePresetSearch,
            list: card ? this.dom.cardPresetList : this.dom.nodePresetList,
            status: card ? this.dom.cardPresetStatus : this.dom.nodePresetStatus,
            close: card ? this.dom.btnCloseCardPreset : this.dom.btnCloseNodePreset
        };
    }

    getCompositionPresetShell() {
        try {
            return globalThis.cooParticlesShell || globalThis.parent?.cooParticlesShell || null;
        } catch {
            return globalThis.cooParticlesShell || null;
        }
    }

    hasCompositionPresetProjectContext() {
        return !!this.getCompositionPresetShell();
    }

    getCompositionPresetStorage(projectContext = this.projectPresetContext) {
        return createCompositionPresetStorage({
            bridge: this.getCompositionPresetShell(),
            ...projectContext
        });
    }

    cloneCompositionPresetTargetContext(context) {
        if (!context) return null;
        return {
            cardId: String(context.cardId || ""),
            treePath: normalizePresetTreePath(context.treePath || []),
            nodeId: String(context.nodeId || "")
        };
    }

    cloneCompositionPresetProjectContext(context = this.projectPresetContext) {
        return {
            projectFilePath: String(context?.projectFilePath || ""),
            projectId: String(context?.projectId || ""),
            projectType: String(context?.projectType || "composition"),
            projectName: String(context?.projectName || "")
        };
    }

    compositionPresetProjectKey(context = this.projectPresetContext) {
        return [context?.projectFilePath, context?.projectId, context?.projectType].map((value) => String(value || "")).join("\n");
    }

    compositionPresetTargetKey(context) {
        if (!context) return "";
        return `${String(context.cardId || "")}\n${normalizePresetTreePath(context.treePath || []).join(".")}\n${String(context.nodeId || "")}`;
    }

    invalidateCompositionPresetOperations(targetKind) {
        const state = this.getCompositionPresetState(targetKind);
        state.operationToken += 1;
        state.requestToken += 1;
    }

    invalidateCompositionPresetSaveDialog(targetKind) {
        const state = this.getCompositionPresetState(targetKind);
        state.saveDialogGeneration += 1;
        state.saveDialogOpen = false;
        state.saveDialogSubmitting = false;
    }

    beginCompositionPresetOperation(targetKind, name = "", options = {}) {
        const state = this.getCompositionPresetState(targetKind);
        return {
            token: ++state.operationToken,
            category: state.category,
            name,
            trackSelection: options.trackSelection === true,
            context: this.cloneCompositionPresetTargetContext(state.context),
            projectContext: this.cloneCompositionPresetProjectContext()
        };
    }

    isCompositionPresetOperationCurrent(targetKind, operation) {
        if (!operation) return false;
        const state = this.getCompositionPresetState(targetKind);
        return (!operation.trackSelection || state.selectedName === operation.name)
            && state.operationToken === operation.token
            && state.category === operation.category
            && this.compositionPresetProjectKey() === this.compositionPresetProjectKey(operation.projectContext)
            && this.compositionPresetTargetKey(state.context) === this.compositionPresetTargetKey(operation.context);
    }

    setCompositionPresetProjectContext(rawContext = {}) {
        const next = this.cloneCompositionPresetProjectContext(rawContext);
        const changed = this.compositionPresetProjectKey() !== this.compositionPresetProjectKey(next);
        this.projectPresetContext = next;
        if (!changed) return false;
        for (const targetKind of ["card", "node"]) {
            const state = this.getCompositionPresetState(targetKind);
            this.invalidateCompositionPresetOperations(targetKind);
            state.items = [];
            state.selectedName = "";
            state.query = "";
            this.invalidateCompositionPresetSaveDialog(targetKind);
            state.folderEditorOpen = false;
            state.rowEditor = null;
            state.contextMenu = null;
            state.loadedPreset = null;
            state.loadedKey = "";
            state.loading = false;
            const ui = this.getCompositionPresetUi(targetKind);
            if (ui.search) ui.search.value = "";
            this.syncCompositionPresetUi(targetKind);
        }
        return true;
    }

    bindCompositionPresetEvents() {
        for (const targetKind of ["card", "node"]) {
            const ui = this.getCompositionPresetUi(targetKind);
            ui.modal?.addEventListener("click", (event) => this.onCompositionPresetClick(targetKind, event));
            ui.modal?.addEventListener("keydown", (event) => this.onCompositionPresetKeydown(targetKind, event));
            ui.modal?.addEventListener("input", (event) => this.onCompositionPresetInput(targetKind, event));
            ui.modal?.addEventListener("dragstart", (event) => this.onCompositionPresetDragStart(targetKind, event));
            ui.modal?.addEventListener("dragover", (event) => this.onCompositionPresetDragOver(targetKind, event));
            ui.modal?.addEventListener("dragleave", (event) => this.onCompositionPresetDragLeave(targetKind, event));
            ui.modal?.addEventListener("drop", (event) => this.onCompositionPresetDrop(targetKind, event));
            ui.modal?.addEventListener("dragend", () => this.clearCompositionPresetDragState(targetKind));
            ui.modal?.addEventListener("contextmenu", (event) => this.onCompositionPresetContextMenu(targetKind, event));
        }
        window.addEventListener("resize", () => this.closeAllCompositionPresetContextMenus());
        window.addEventListener("message", (event) => this.onCompositionProjectContextMessage(event));
        this.requestCompositionProjectContext();
    }

    requestCompositionProjectContext() {
        if (!window.parent || window.parent === window) return;
        window.parent.postMessage({
            type: "coo-request-project-context",
            requestId: `composition-presets-${Date.now()}`
        }, window.location.origin);
    }

    onCompositionProjectContextMessage(event) {
        if (event.source !== window.parent) return;
        if (event.origin && event.origin !== window.location.origin) return;
        if (event.data?.type !== "coo-project-context") return;
        this.setCompositionPresetProjectContext({
            projectFilePath: String(event.data.projectFilePath || ""),
            projectId: String(event.data.projectId || ""),
            projectType: String(event.data.projectType || "composition"),
            projectName: String(event.data.projectName || "")
        });
        for (const targetKind of ["card", "node"]) {
            const ui = this.getCompositionPresetUi(targetKind);
            if (!ui.modal?.classList.contains("hidden")) void this.refreshCompositionPresetList(targetKind);
        }
    }

    showCardPresetModal(cardId) {
        const card = this.getCardById(cardId);
        if (!card) return;
        this.openCompositionPresetModal("card", {
            cardId: String(card.id || cardId),
            treePath: [],
            nodeId: ""
        });
    }

    showNodePresetModal(cardId, rawTreePath) {
        const card = this.getCardById(cardId);
        if (!card) return;
        let treePath;
        try {
            treePath = normalizePresetTreePath(JSON.parse(rawTreePath || "[]"));
        } catch (error) {
            this.showToast(error?.message || String(error), "error");
            return;
        }
        const node = this.getShapeNodeByPath(card, treePath);
        if (!node) return;
        this.openCompositionPresetModal("node", {
            cardId: String(card.id || cardId),
            treePath,
            nodeId: String(node.id || "")
        });
    }

    openCompositionPresetModal(targetKind, context) {
        const state = this.getCompositionPresetState(targetKind);
        const ui = this.getCompositionPresetUi(targetKind);
        this.invalidateCompositionPresetOperations(targetKind);
        state.context = {
            cardId: String(context.cardId || ""),
            treePath: normalizePresetTreePath(context.treePath || []),
            nodeId: String(context.nodeId || "")
        };
        state.selectedName = "";
        state.query = "";
        this.invalidateCompositionPresetSaveDialog(targetKind);
        state.folderEditorOpen = false;
        state.rowEditor = null;
        state.contextMenu = null;
        state.loadedPreset = null;
        state.loadedKey = "";
        if (ui.search) ui.search.value = "";
        const resolved = this.resolveCompositionPresetTarget(targetKind, state.context);
        if (ui.context) {
            ui.context.textContent = targetKind === "card"
                ? `当前卡片：${resolved.target.name || "未命名卡片"}`
                : `当前子节点：${resolved.target.name || "未命名子节点"}（路径 ${state.context.treePath.join(".")}）`;
        }
        ui.modal?.classList.remove("hidden");
        ui.mask?.classList.remove("hidden");
        this.syncCompositionPresetUi(targetKind);
        void this.refreshCompositionPresetFolders(targetKind);
        void this.refreshCompositionPresetList(targetKind);
        ui.close?.focus();
    }

    hideCardPresetModal() {
        this.closeCompositionPresetModal("card");
    }

    hideNodePresetModal() {
        this.closeCompositionPresetModal("node");
    }

    closeCompositionPresetModal(targetKind) {
        this.invalidateCompositionPresetOperations(targetKind);
        this.invalidateCompositionPresetSaveDialog(targetKind);
        this.closeCompositionPresetContextMenu(targetKind);
        const ui = this.getCompositionPresetUi(targetKind);
        ui.modal?.classList.add("hidden");
        ui.mask?.classList.add("hidden");
    }

    resolveCompositionPresetTarget(targetKind, context) {
        const cardIndex = this.getCardIndexById(context?.cardId);
        if (cardIndex < 0) throw new Error("原卡片已不存在，未应用预设。");
        const card = this.state.cards[cardIndex];
        if (targetKind === "card") return { card, cardIndex, target: card, targetIndex: cardIndex };
        const treePath = normalizePresetTreePath(context?.treePath || []);
        if (!treePath.length) throw new Error("子节点路径无效。");
        const node = this.getShapeNodeByPath(card, treePath);
        if (!node || String(node.id || "") !== String(context?.nodeId || "")) {
            throw new Error("子节点已移动或替换，未应用预设。请重新打开预设窗口。");
        }
        return { card, cardIndex, target: node, targetIndex: treePath[treePath.length - 1], treePath };
    }

    setCompositionPresetStatus(targetKind, message = "", type = "") {
        const status = this.getCompositionPresetUi(targetKind).status;
        if (!status) return;
        status.textContent = String(message || "");
        status.classList.toggle("error", type === "error");
        status.classList.toggle("success", type === "success");
    }

    syncCompositionPresetUi(targetKind) {
        const state = this.getCompositionPresetState(targetKind);
        const ui = this.getCompositionPresetUi(targetKind);
        const accessible = isPresetCategoryAccessible(targetKind, state.category);
        const storageReady = accessible && !!this.getCompositionPresetShell();
        this.renderCompositionPresetFolders(targetKind);
        const path = ui.modal?.querySelector?.(".preset-directory-path");
        if (path) path.textContent = `presets/${state.category}/`;
        if (ui.search && ui.search.value !== state.query) ui.search.value = state.query;
        const saveDialog = ui.modal?.querySelector?.("[data-preset-save-dialog]");
        const saveDialogMask = ui.modal?.querySelector?.("[data-preset-save-dialog-mask]");
        const confirmSave = ui.modal?.querySelector?.('[data-preset-action="confirm-save"]');
        saveDialog?.classList.toggle("hidden", !state.saveDialogOpen);
        saveDialogMask?.classList.toggle("hidden", !state.saveDialogOpen);
        if (confirmSave) confirmSave.disabled = state.saveDialogSubmitting;
        const folderEditor = ui.modal?.querySelector?.("[data-preset-folder-editor]");
        folderEditor?.classList.toggle("hidden", !state.folderEditorOpen);
        const apply = ui.modal?.querySelector?.('[data-preset-action="apply"]');
        if (apply) apply.disabled = !storageReady || (!state.selectedName && !state.loadedPreset);
        this.renderCompositionPresetList(targetKind);
    }

    renderCompositionPresetFolders(targetKind) {
        const state = this.getCompositionPresetState(targetKind);
        const list = this.getCompositionPresetUi(targetKind).modal?.querySelector?.("[data-preset-folder-list]");
        if (!list) return;
        list.innerHTML = state.folders.map((item, index) => {
            const category = normalizePresetCategory(item.name);
            const selected = category === state.category;
            const allowed = isPresetCategoryAccessible(targetKind, category);
            const branch = index === state.folders.length - 1 ? "└─" : "├─";
            return `
                <div class="preset-tree-folder ${selected ? "selected" : ""} ${allowed ? "" : "unavailable"}"
                     data-preset-folder="${esc(category)}" role="button" tabindex="${allowed ? "0" : "-1"}"
                     aria-current="${selected ? "page" : "false"}" aria-disabled="${String(!allowed)}">
                    <span class="preset-tree-branch" aria-hidden="true">${branch}</span>
                    <span class="preset-tree-folder-name">${esc(category)}/</span>
                    ${item.count ? `<small>${item.count}</small>` : ""}
                </div>`;
        }).join("");
    }

    renderCompositionPresetList(targetKind) {
        const state = this.getCompositionPresetState(targetKind);
        const ui = this.getCompositionPresetUi(targetKind);
        if (!ui.list) return;
        if (state.loading) {
            ui.list.className = "preset-list empty";
            ui.list.textContent = "正在读取预设...";
            return;
        }
        const query = state.query.trim().toLocaleLowerCase();
        const items = query
            ? state.items.filter((item) => `${item.name || ""}\n${item.description || ""}`.toLocaleLowerCase().includes(query))
            : state.items;
        if (!items.length) {
            ui.list.className = "preset-list empty";
            ui.list.textContent = query ? "没有匹配的预设" : "该目录还没有预设";
            return;
        }
        ui.list.className = "preset-list";
        ui.list.innerHTML = items.map((item) => {
            const name = String(item.name || "");
            const selected = name === state.selectedName;
            const date = String(item.modifiedAt || "").slice(0, 10);
            const description = String(item.description || "");
            const editor = state.rowEditor?.name === name ? state.rowEditor : null;
            const field = editor
                ? String(editor.value ?? (editor.type === "name" ? name : description))
                : "";
            const editorMarkup = editor ? `
                <div class="preset-inline-editor">
                    <input class="input preset-inline-input" type="text" data-preset-edit-input value="${esc(field)}"
                           maxlength="${editor.type === "name" ? "80" : "240"}"
                           aria-label="${editor.type === "name" ? "预设名称" : "预设描述"}"
                           placeholder="${editor.type === "name" ? "预设名称" : "预设描述"}" autocomplete="off"/>
                    <button class="btn icon" type="button" data-preset-action="confirm-edit" title="确认修改" aria-label="确认修改">✓</button>
                    <button class="btn icon" type="button" data-preset-action="cancel-edit" title="取消修改" aria-label="取消修改">×</button>
                </div>` : "";
            return `
                <div class="preset-list-row ${selected ? "selected" : ""}" role="option" aria-selected="${selected}"
                     data-preset-name="${esc(name)}" data-preset-select="${esc(name)}" draggable="${String(!editor)}">
                    <div class="preset-list-fields">
                        ${editor?.type === "name" ? editorMarkup : `
                            <span class="preset-list-name" data-preset-rename="${esc(name)}" role="button" tabindex="0" title="修改预设名称">${esc(name)}</span>`}
                        ${editor?.type === "description" ? editorMarkup : `
                            <span class="preset-list-description" data-preset-description="${esc(name)}" role="button" tabindex="0" title="修改预设描述">${esc(description || date || "添加描述")}</span>`}
                    </div>
                </div>`;
        }).join("");
    }

    onCompositionPresetContextMenu(targetKind, event) {
        const target = event.target;
        if (target?.closest?.("input, textarea, [contenteditable='true']")) {
            this.closeCompositionPresetContextMenu(targetKind);
            return;
        }
        const ui = this.getCompositionPresetUi(targetKind);
        const row = target?.closest?.("[data-preset-name]");
        const folder = target?.closest?.("[data-preset-folder]");
        const inPresetList = ui.list === target || ui.list?.contains?.(target);
        const inFolderTree = !!target?.closest?.(".preset-tree");
        if (!row && !folder && !inPresetList && !inFolderTree) {
            this.closeCompositionPresetContextMenu(targetKind);
            return;
        }
        event.preventDefault();
        event.stopPropagation?.();
        if (row) {
            this.openCompositionPresetContextMenu(targetKind, {
                kind: "preset-row",
                name: String(row.dataset.presetName || ""),
                clientX: event.clientX,
                clientY: event.clientY
            });
        } else if (inPresetList) {
            this.openCompositionPresetContextMenu(targetKind, {
                kind: "preset-list",
                clientX: event.clientX,
                clientY: event.clientY
            });
        } else {
            this.openCompositionPresetContextMenu(targetKind, {
                kind: folder ? "folder" : "folder-root",
                category: String(folder?.dataset?.presetFolder || ""),
                clientX: event.clientX,
                clientY: event.clientY
            });
        }
    }

    openCompositionPresetContextMenu(targetKind, options = {}) {
        const state = this.getCompositionPresetState(targetKind);
        const modal = this.getCompositionPresetUi(targetKind).modal;
        const menu = modal?.querySelector?.("[data-preset-context-menu]");
        if (!menu) return;
        const context = {
            kind: String(options.kind || ""),
            name: String(options.name || ""),
            category: String(options.category || ""),
            clientX: Number(options.clientX) || 0,
            clientY: Number(options.clientY) || 0
        };
        const storageReady = isPresetCategoryAccessible(targetKind, state.category) && !!this.getCompositionPresetShell();
        const actions = [];
        if (context.kind === "folder" || context.kind === "folder-root") {
            actions.push({ action: "create-folder", label: "新建预设文件夹", disabled: !this.getCompositionPresetShell() });
            if (context.category && !["cards", "nodes", "shared"].includes(context.category)) {
                actions.push({
                    action: "delete-folder",
                    label: `删除文件夹（${context.category}）`,
                    danger: true,
                    disabled: !this.getCompositionPresetShell()
                });
            }
        } else if (context.kind === "preset-row" && context.name) {
            actions.push({
                action: "overwrite-preset",
                label: `覆盖预设（${context.name}）`,
                disabled: !storageReady
            });
            actions.push({
                action: "delete-preset",
                label: `删除预设（${context.name}）`,
                danger: true,
                disabled: !storageReady
            });
        } else {
            let targetName = targetKind === "card" ? "未命名卡片" : "未命名节点";
            try {
                targetName = String(this.resolveCompositionPresetTarget(targetKind, state.context).target?.name || targetName);
            } catch {
                // The disabled action still explains what would be saved after the target becomes valid again.
            }
            actions.push({
                action: "save-current",
                label: targetKind === "card"
                    ? `保存当前卡片（${targetName}）为预设`
                    : `保存当前节点（${targetName}）为预设`,
                disabled: !storageReady
            });
        }
        state.contextMenu = context;
        menu.innerHTML = actions.map((item) => `
            <button class="preset-context-menu-item ${item.danger ? "danger" : ""}" type="button" role="menuitem"
                    data-preset-menu-action="${item.action}" ${item.disabled ? "disabled" : ""}>${esc(item.label)}</button>`).join("");
        menu.classList.remove("hidden");
        const position = () => {
            if (state.contextMenu !== context) return;
            const margin = 8;
            const modalRect = modal?.getBoundingClientRect?.() || {
                left: 0,
                top: 0,
                width: Number(globalThis.innerWidth) || 1280,
                height: Number(globalThis.innerHeight) || 720
            };
            const width = Number(menu.offsetWidth) || 240;
            const height = Number(menu.offsetHeight) || (actions.length * 34 + 8);
            const localX = context.clientX - Number(modalRect.left || 0);
            const localY = context.clientY - Number(modalRect.top || 0);
            menu.style.left = `${Math.max(margin, Math.min(localX, modalRect.width - width - margin))}px`;
            menu.style.top = `${Math.max(margin, Math.min(localY, modalRect.height - height - margin))}px`;
        };
        position();
        globalThis.requestAnimationFrame?.(() => {
            if (state.contextMenu !== context) return;
            position();
            menu.querySelector?.("button:not(:disabled)")?.focus?.();
        });
    }

    closeCompositionPresetContextMenu(targetKind) {
        const state = this.getCompositionPresetState(targetKind);
        state.contextMenu = null;
        this.getCompositionPresetUi(targetKind).modal?.querySelector?.("[data-preset-context-menu]")?.classList?.add("hidden");
    }

    closeAllCompositionPresetContextMenus() {
        if (!this.compositionPresetState) return;
        for (const targetKind of ["card", "node"]) this.closeCompositionPresetContextMenu(targetKind);
    }

    runCompositionPresetContextMenuAction(targetKind, action) {
        const state = this.getCompositionPresetState(targetKind);
        const context = state.contextMenu;
        this.closeCompositionPresetContextMenu(targetKind);
        if (!context) return;
        if (action === "save-current") this.openCompositionPresetSaveDialog(targetKind);
        else if (action === "overwrite-preset") void this.overwriteCompositionPreset(targetKind, context.name);
        else if (action === "create-folder") this.openCompositionPresetFolderEditor(targetKind);
        else if (action === "delete-folder") void this.deleteCompositionPresetFolder(targetKind, context.category);
        else if (action === "delete-preset") void this.deleteCompositionPreset(targetKind, context.name);
    }

    async refreshCompositionPresetFolders(targetKind) {
        const state = this.getCompositionPresetState(targetKind);
        const token = ++state.folderRequestToken;
        const projectContext = this.cloneCompositionPresetProjectContext();
        const isCurrent = () => token === state.folderRequestToken
            && this.compositionPresetProjectKey(projectContext) === this.compositionPresetProjectKey();
        try {
            const folders = await this.getCompositionPresetStorage(projectContext).listDirectories();
            if (!isCurrent()) return;
            state.folders = folders;
            if (!folders.some((item) => item.name === state.category)) {
                state.category = targetKind === "card" ? "cards" : "nodes";
                state.items = [];
                state.selectedName = "";
                state.loadedPreset = null;
                state.loadedKey = "";
                void this.refreshCompositionPresetList(targetKind);
            }
            this.syncCompositionPresetUi(targetKind);
        } catch (error) {
            if (!isCurrent()) return;
            this.setCompositionPresetStatus(targetKind, error?.message || String(error), "error");
        }
    }

    async refreshCompositionPresetList(targetKind) {
        const state = this.getCompositionPresetState(targetKind);
        const token = ++state.requestToken;
        const category = state.category;
        const projectContext = this.cloneCompositionPresetProjectContext();
        const isCurrent = () => token === state.requestToken
            && category === state.category
            && this.compositionPresetProjectKey(projectContext) === this.compositionPresetProjectKey();
        state.items = [];
        if (!isPresetCategoryAccessible(targetKind, category)) {
            state.loading = false;
            this.setCompositionPresetStatus(targetKind, "此目录与当前窗口不兼容。", "");
            this.syncCompositionPresetUi(targetKind);
            return;
        }
        state.loading = true;
        this.setCompositionPresetStatus(targetKind, "");
        this.syncCompositionPresetUi(targetKind);
        try {
            const items = await this.getCompositionPresetStorage(projectContext).list(category);
            if (!isCurrent()) return;
            state.items = items;
        } catch (error) {
            if (!isCurrent()) return;
            this.setCompositionPresetStatus(targetKind, error?.message || String(error), "error");
        } finally {
            if (isCurrent()) {
                state.loading = false;
                this.syncCompositionPresetUi(targetKind);
            }
        }
    }

    onCompositionPresetKeydown(targetKind, event) {
        if (event.key === "Escape" && this.getCompositionPresetState(targetKind).saveDialogOpen) {
            event.preventDefault();
            this.closeCompositionPresetSaveDialog(targetKind);
            return;
        }
        if (event.key === "Escape" && this.getCompositionPresetState(targetKind).contextMenu) {
            event.preventDefault();
            this.closeCompositionPresetContextMenu(targetKind);
            return;
        }
        const editableText = event.target?.closest?.("[data-preset-rename], [data-preset-description]");
        if (editableText) {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            if (editableText.dataset.presetRename) {
                this.openCompositionPresetRowEditor(targetKind, editableText.dataset.presetRename, "name");
            } else {
                this.openCompositionPresetRowEditor(targetKind, editableText.dataset.presetDescription, "description");
            }
            return;
        }
        if (event.target?.matches?.("[data-preset-folder]")) {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            this.selectCompositionPresetCategory(targetKind, event.target.dataset.presetFolder);
            return;
        }
        if (event.target?.matches?.("[data-preset-save-name]")) {
            if (event.key === "Enter") {
                event.preventDefault();
                void this.confirmCompositionPresetSave(targetKind);
            } else if (event.key === "Escape") {
                event.preventDefault();
                this.closeCompositionPresetSaveDialog(targetKind);
            }
            return;
        }
        if (event.target?.matches?.("[data-preset-folder-name]")) {
            if (event.key === "Enter") {
                event.preventDefault();
                void this.createCompositionPresetFolder(targetKind);
            } else if (event.key === "Escape") {
                event.preventDefault();
                this.closeCompositionPresetFolderEditor(targetKind);
            }
            return;
        }
        if (event.target?.matches?.("[data-preset-edit-input]")) {
            if (event.key === "Enter") {
                event.preventDefault();
                void this.confirmCompositionPresetRowEdit(targetKind);
            } else if (event.key === "Escape") {
                event.preventDefault();
                this.cancelCompositionPresetRowEdit(targetKind);
            }
        }
    }

    onCompositionPresetInput(targetKind, event) {
        const state = this.getCompositionPresetState(targetKind);
        if (event.target?.matches?.("[data-preset-search]")) {
            state.query = String(event.target.value || "");
            this.renderCompositionPresetList(targetKind);
            return;
        }
        if (event.target?.matches?.("[data-preset-edit-input]") && state.rowEditor) {
            state.rowEditor.value = String(event.target.value || "");
        }
    }

    onCompositionPresetClick(targetKind, event) {
        if (event.target?.matches?.("[data-preset-edit-input]")) {
            this.closeCompositionPresetContextMenu(targetKind);
            return;
        }
        const menuAction = event.target?.closest?.("[data-preset-menu-action]");
        if (menuAction) {
            this.runCompositionPresetContextMenuAction(targetKind, menuAction.dataset.presetMenuAction);
            return;
        }
        this.closeCompositionPresetContextMenu(targetKind);
        const folder = event.target?.closest?.("[data-preset-folder]");
        if (folder) {
            this.selectCompositionPresetCategory(targetKind, folder.dataset.presetFolder);
            return;
        }
        const rename = event.target?.closest?.("[data-preset-rename]");
        if (rename) {
            this.openCompositionPresetRowEditor(targetKind, rename.dataset.presetRename, "name");
            return;
        }
        const description = event.target?.closest?.("[data-preset-description]");
        if (description) {
            this.openCompositionPresetRowEditor(targetKind, description.dataset.presetDescription, "description");
            return;
        }
        const action = event.target?.closest?.("[data-preset-action]")?.dataset?.presetAction;
        if (action === "confirm-save") void this.confirmCompositionPresetSave(targetKind);
        else if (action === "cancel-save") this.closeCompositionPresetSaveDialog(targetKind);
        else if (action === "confirm-folder") void this.createCompositionPresetFolder(targetKind);
        else if (action === "cancel-folder") this.closeCompositionPresetFolderEditor(targetKind);
        else if (action === "confirm-edit") void this.confirmCompositionPresetRowEdit(targetKind);
        else if (action === "cancel-edit") this.cancelCompositionPresetRowEdit(targetKind);
        else if (action === "apply") void this.applyLoadedCompositionPreset(targetKind);
        if (action) return;
        const select = event.target?.closest?.("[data-preset-select]");
        if (select) this.selectCompositionPreset(targetKind, select.dataset.presetSelect);
    }

    selectCompositionPreset(targetKind, rawName) {
        const state = this.getCompositionPresetState(targetKind);
        this.invalidateCompositionPresetOperations(targetKind);
        state.selectedName = String(rawName || "");
        state.loadedPreset = null;
        state.loadedKey = "";
        this.setCompositionPresetStatus(targetKind, "");
        this.syncCompositionPresetUi(targetKind);
    }

    selectCompositionPresetCategory(targetKind, rawCategory) {
        const state = this.getCompositionPresetState(targetKind);
        const category = normalizePresetCategory(rawCategory);
        if (!isPresetCategoryAccessible(targetKind, category)) return;
        this.invalidateCompositionPresetOperations(targetKind);
        state.category = category;
        state.items = [];
        state.selectedName = "";
        state.rowEditor = null;
        state.loadedPreset = null;
        state.loadedKey = "";
        this.closeCompositionPresetContextMenu(targetKind);
        this.syncCompositionPresetUi(targetKind);
        void this.refreshCompositionPresetList(targetKind);
    }

    openCompositionPresetSaveDialog(targetKind) {
        const state = this.getCompositionPresetState(targetKind);
        this.closeCompositionPresetContextMenu(targetKind);
        this.invalidateCompositionPresetSaveDialog(targetKind);
        state.saveDialogOpen = true;
        state.folderEditorOpen = false;
        state.rowEditor = null;
        const generation = state.saveDialogGeneration;
        this.syncCompositionPresetUi(targetKind);
        const input = this.getCompositionPresetUi(targetKind).modal?.querySelector?.("[data-preset-save-name]");
        if (input) input.value = "";
        globalThis.requestAnimationFrame?.(() => {
            if (state.saveDialogOpen && state.saveDialogGeneration === generation) input?.focus();
        });
    }

    closeCompositionPresetSaveDialog(targetKind) {
        this.invalidateCompositionPresetSaveDialog(targetKind);
        this.syncCompositionPresetUi(targetKind);
    }

    async confirmCompositionPresetSave(targetKind) {
        const state = this.getCompositionPresetState(targetKind);
        if (!state.saveDialogOpen || state.saveDialogSubmitting) return;
        const input = this.getCompositionPresetUi(targetKind).modal?.querySelector?.("[data-preset-save-name]");
        const generation = state.saveDialogGeneration;
        state.saveDialogSubmitting = true;
        this.syncCompositionPresetUi(targetKind);
        try {
            await this.saveCompositionPreset(targetKind, input?.value || "", { saveDialogGeneration: generation });
        } finally {
            if (state.saveDialogGeneration !== generation) return;
            state.saveDialogSubmitting = false;
            this.syncCompositionPresetUi(targetKind);
        }
    }

    openCompositionPresetFolderEditor(targetKind) {
        const state = this.getCompositionPresetState(targetKind);
        this.closeCompositionPresetContextMenu(targetKind);
        this.invalidateCompositionPresetSaveDialog(targetKind);
        state.folderEditorOpen = true;
        state.rowEditor = null;
        this.syncCompositionPresetUi(targetKind);
        const input = this.getCompositionPresetUi(targetKind).modal?.querySelector?.("[data-preset-folder-name]");
        if (input) input.value = "";
        globalThis.requestAnimationFrame?.(() => input?.focus());
    }

    closeCompositionPresetFolderEditor(targetKind) {
        const state = this.getCompositionPresetState(targetKind);
        state.folderEditorOpen = false;
        this.syncCompositionPresetUi(targetKind);
    }

    async createCompositionPresetFolder(targetKind) {
        const state = this.getCompositionPresetState(targetKind);
        const ui = this.getCompositionPresetUi(targetKind);
        try {
            const input = ui.modal?.querySelector?.("[data-preset-folder-name]");
            const category = normalizePresetCategory(input?.value || "");
            const projectContext = this.cloneCompositionPresetProjectContext();
            await this.getCompositionPresetStorage(projectContext).createDirectory(category);
            if (this.compositionPresetProjectKey(projectContext) !== this.compositionPresetProjectKey()) return;
            state.folderEditorOpen = false;
            state.category = category;
            state.items = [];
            state.selectedName = "";
            state.loadedPreset = null;
            state.loadedKey = "";
            await this.refreshCompositionPresetFolders(targetKind);
            await this.refreshCompositionPresetList(targetKind);
            this.setCompositionPresetStatus(targetKind, `已创建 presets/${category}/`, "success");
        } catch (error) {
            this.setCompositionPresetStatus(targetKind, error?.message || String(error), "error");
        }
    }

    async deleteCompositionPresetFolder(targetKind, rawCategory = "") {
        const state = this.getCompositionPresetState(targetKind);
        const category = normalizePresetCategory(rawCategory || state.category);
        if (["cards", "nodes", "shared"].includes(category)) return;
        const accepted = await this.askThemeConfirm({
            title: "删除预设文件夹",
            message: `确定删除空文件夹“${category}”吗？`,
            okText: "删除",
            danger: true
        });
        if (!accepted) return;
        try {
            const projectContext = this.cloneCompositionPresetProjectContext();
            await this.getCompositionPresetStorage(projectContext).removeDirectory(category);
            if (this.compositionPresetProjectKey(projectContext) !== this.compositionPresetProjectKey()) return;
            const deletedCurrentFolder = state.category === category;
            if (deletedCurrentFolder) {
                state.category = targetKind === "card" ? "cards" : "nodes";
                state.items = [];
                state.selectedName = "";
                state.loadedPreset = null;
                state.loadedKey = "";
            }
            await this.refreshCompositionPresetFolders(targetKind);
            if (deletedCurrentFolder) await this.refreshCompositionPresetList(targetKind);
            this.setCompositionPresetStatus(targetKind, `已删除文件夹“${category}”`, "success");
        } catch (error) {
            this.setCompositionPresetStatus(targetKind, error?.message || String(error), "error");
        }
    }

    openCompositionPresetRowEditor(targetKind, rawName, type) {
        const state = this.getCompositionPresetState(targetKind);
        const name = String(rawName || "");
        const item = state.items.find((entry) => entry.name === name);
        if (!item) return;
        this.invalidateCompositionPresetSaveDialog(targetKind);
        this.selectCompositionPreset(targetKind, name);
        state.folderEditorOpen = false;
        state.rowEditor = {
            name,
            type: type === "description" ? "description" : "name",
            value: type === "description" ? String(item.description || "") : name
        };
        this.renderCompositionPresetList(targetKind);
        globalThis.requestAnimationFrame?.(() => {
            const input = this.getCompositionPresetUi(targetKind).list?.querySelector?.("[data-preset-edit-input]");
            input?.focus();
            input?.select();
        });
    }

    cancelCompositionPresetRowEdit(targetKind) {
        const state = this.getCompositionPresetState(targetKind);
        state.rowEditor = null;
        this.renderCompositionPresetList(targetKind);
    }

    async confirmCompositionPresetRowEdit(targetKind) {
        const state = this.getCompositionPresetState(targetKind);
        const editor = state.rowEditor;
        if (!editor) return;
        const input = this.getCompositionPresetUi(targetKind).list?.querySelector?.("[data-preset-edit-input]");
        const value = input?.value ?? editor.value;
        if (editor.type === "name") {
            await this.renameCompositionPreset(targetKind, editor.name, value);
        } else {
            await this.updateCompositionPresetDescription(targetKind, editor.name, value);
        }
    }

    onCompositionPresetDragStart(targetKind, event) {
        const row = event.target?.closest?.("[data-preset-name]");
        if (!row || row.getAttribute("draggable") !== "true") return;
        const state = this.getCompositionPresetState(targetKind);
        state.draggedName = String(row.dataset.presetName || "");
        row.classList.add("dragging");
        if (event.dataTransfer) {
            event.dataTransfer.effectAllowed = "move";
            event.dataTransfer.setData("text/plain", state.draggedName);
        }
    }

    onCompositionPresetDragOver(targetKind, event) {
        const folder = event.target?.closest?.("[data-preset-folder]");
        if (!folder) return;
        const state = this.getCompositionPresetState(targetKind);
        const category = normalizePresetCategory(folder.dataset.presetFolder);
        if (!state.draggedName || category === state.category || !isPresetCategoryAccessible(targetKind, category)) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
        folder.classList.add("drag-over");
    }

    onCompositionPresetDragLeave(_targetKind, event) {
        const folder = event.target?.closest?.("[data-preset-folder]");
        if (folder && !folder.contains(event.relatedTarget)) folder.classList.remove("drag-over");
    }

    onCompositionPresetDrop(targetKind, event) {
        const folder = event.target?.closest?.("[data-preset-folder]");
        if (!folder) return;
        event.preventDefault();
        const state = this.getCompositionPresetState(targetKind);
        const name = state.draggedName || event.dataTransfer?.getData("text/plain") || "";
        const category = normalizePresetCategory(folder.dataset.presetFolder);
        this.clearCompositionPresetDragState(targetKind);
        if (name && category !== state.category && isPresetCategoryAccessible(targetKind, category)) {
            void this.moveCompositionPreset(targetKind, name, category);
        }
    }

    clearCompositionPresetDragState(targetKind) {
        const state = this.getCompositionPresetState(targetKind);
        state.draggedName = "";
        const modal = this.getCompositionPresetUi(targetKind).modal;
        modal?.querySelectorAll?.(".dragging, .drag-over").forEach((element) => {
            element.classList.remove("dragging", "drag-over");
        });
    }

    async saveCompositionPreset(targetKind, rawName, options = {}) {
        const state = this.getCompositionPresetState(targetKind);
        const saveDialogGeneration = Number.isInteger(options.saveDialogGeneration)
            ? options.saveDialogGeneration
            : null;
        let operation = null;
        const isCurrent = () => this.isCompositionPresetOperationCurrent(targetKind, operation)
            && (saveDialogGeneration === null || state.saveDialogGeneration === saveDialogGeneration);
        try {
            if (!isPresetCategoryAccessible(targetKind, state.category)) throw new Error("当前目录不能保存此类预设。");
            const name = normalizePresetName(rawName);
            operation = this.beginCompositionPresetOperation(targetKind, name);
            const resolved = this.resolveCompositionPresetTarget(targetKind, operation.context);
            const preset = createCompositionPreset({
                name,
                sourceKind: targetKind,
                target: resolved.target,
                cardId: operation.context.cardId,
                treePath: operation.context.treePath
            });
            const storage = this.getCompositionPresetStorage(operation.projectContext);
            try {
                await storage.save(operation.category, preset);
            } catch (error) {
                if (error?.code !== "PRESET_EXISTS") throw error;
                if (!isCurrent()) return;
                const overwrite = await this.askThemeConfirm({
                    title: "覆盖预设",
                    message: `“${name}”已存在，是否覆盖？`,
                    okText: "覆盖",
                    danger: true
                });
                if (!overwrite || !isCurrent()) return;
                await storage.save(operation.category, preset, { overwrite: true });
            }
            if (!isCurrent()) return;
            state.selectedName = name;
            state.loadedPreset = preset;
            state.loadedKey = `${operation.category}/${name}`;
            await this.refreshCompositionPresetList(targetKind);
            if (!isCurrent()) return;
            state.saveDialogOpen = false;
            this.setCompositionPresetStatus(targetKind, `已保存到 presets/${operation.category}/${name}.json`, "success");
            this.syncCompositionPresetUi(targetKind);
        } catch (error) {
            if (operation && !isCurrent()) return;
            this.setCompositionPresetStatus(targetKind, error?.message || String(error), "error");
        }
    }

    async overwriteCompositionPreset(targetKind, rawName) {
        const state = this.getCompositionPresetState(targetKind);
        let operation = null;
        try {
            if (!isPresetCategoryAccessible(targetKind, state.category)) throw new Error("当前目录不能保存此类预设。");
            const name = normalizePresetName(rawName);
            operation = this.beginCompositionPresetOperation(targetKind, name);
            const accepted = await this.askThemeConfirm({
                title: "覆盖预设",
                message: targetKind === "card"
                    ? `确定使用当前卡片覆盖预设“${name}”吗？`
                    : `确定使用当前节点覆盖预设“${name}”吗？`,
                okText: "覆盖",
                danger: true
            });
            if (!accepted || !this.isCompositionPresetOperationCurrent(targetKind, operation)) return;
            const resolved = this.resolveCompositionPresetTarget(targetKind, operation.context);
            const description = state.items.find((item) => item.name === name)?.description || "";
            const preset = createCompositionPreset({
                name,
                description,
                sourceKind: targetKind,
                target: resolved.target,
                cardId: operation.context.cardId,
                treePath: operation.context.treePath
            });
            await this.getCompositionPresetStorage(operation.projectContext).save(
                operation.category,
                preset,
                { overwrite: true }
            );
            if (!this.isCompositionPresetOperationCurrent(targetKind, operation)) return;
            state.selectedName = name;
            state.loadedPreset = preset;
            state.loadedKey = `${operation.category}/${name}`;
            await this.refreshCompositionPresetList(targetKind);
            if (!this.isCompositionPresetOperationCurrent(targetKind, operation)) return;
            this.setCompositionPresetStatus(targetKind, `已覆盖预设“${name}”`, "success");
            this.syncCompositionPresetUi(targetKind);
        } catch (error) {
            if (operation && !this.isCompositionPresetOperationCurrent(targetKind, operation)) return;
            this.setCompositionPresetStatus(targetKind, error?.message || String(error), "error");
        }
    }

    async loadCompositionPreset(targetKind) {
        const state = this.getCompositionPresetState(targetKind);
        let operation = null;
        try {
            const name = normalizePresetName(state.selectedName);
            operation = this.beginCompositionPresetOperation(targetKind, name, { trackSelection: true });
            const preset = await this.getCompositionPresetStorage(operation.projectContext).load(operation.category, name);
            if (!this.isCompositionPresetOperationCurrent(targetKind, operation)) return null;
            state.selectedName = name;
            state.loadedPreset = preset;
            state.loadedKey = `${operation.category}/${name}`;
            this.setCompositionPresetStatus(targetKind, `已加载“${name}”`, "success");
            this.syncCompositionPresetUi(targetKind);
            return preset;
        } catch (error) {
            if (operation && !this.isCompositionPresetOperationCurrent(targetKind, operation)) return null;
            this.setCompositionPresetStatus(targetKind, error?.message || String(error), "error");
            return null;
        }
    }

    getCompositionPresetSelectedSections(targetKind) {
        return Array.from(this.getCompositionPresetUi(targetKind).modal?.querySelectorAll("[data-preset-section]:checked") || [])
            .map((input) => String(input.dataset.presetSection || ""));
    }

    async applyLoadedCompositionPreset(targetKind) {
        const state = this.getCompositionPresetState(targetKind);
        let operation = null;
        try {
            const name = normalizePresetName(state.selectedName);
            operation = this.beginCompositionPresetOperation(targetKind, name, { trackSelection: true });
            let preset = state.loadedKey === `${operation.category}/${name}` ? state.loadedPreset : null;
            if (!preset) {
                preset = await this.getCompositionPresetStorage(operation.projectContext).load(operation.category, name);
                if (!this.isCompositionPresetOperationCurrent(targetKind, operation)) return;
                state.selectedName = name;
                state.loadedPreset = preset;
                state.loadedKey = `${operation.category}/${name}`;
            }
            const selectedSections = this.getCompositionPresetSelectedSections(targetKind);
            const resolved = this.resolveCompositionPresetTarget(targetKind, operation.context);
            const nextTarget = applyCompositionPreset(
                resolved.target,
                preset,
                selectedSections,
                targetKind
            );
            const normalized = targetKind === "card"
                ? normalizeCard(nextTarget, resolved.targetIndex)
                : normalizeShapeTreeNode(nextTarget, resolved.targetIndex);
            if (!this.isCompositionPresetOperationCurrent(targetKind, operation)) return;
            this.resolveCompositionPresetTarget(targetKind, operation.context);
            this.armedHistorySnapshot = null;
            this.pushHistory();
            if (targetKind === "card") {
                this.state.cards[resolved.cardIndex] = normalized;
            } else if (resolved.treePath.length === 1) {
                resolved.card.shapeChildren[resolved.treePath[0]] = normalized;
            } else {
                const parent = this.getShapeNodeByPath(resolved.card, resolved.treePath.slice(0, -1));
                if (!parent) throw new Error("子节点父级已不存在，未应用预设。");
                parent.children[resolved.treePath[resolved.treePath.length - 1]] = normalized;
            }
            this.afterStructureMutate({ rerenderProject: false, rerenderCards: true, rebuildPreview: true });
            this.closeCompositionPresetModal(targetKind);
            this.showToast(`已应用预设“${name}”`, "success");
        } catch (error) {
            if (operation && !this.isCompositionPresetOperationCurrent(targetKind, operation)) return;
            this.setCompositionPresetStatus(targetKind, error?.message || String(error), "error");
        }
    }

    async renameCompositionPreset(targetKind, rawName, rawNextName) {
        const state = this.getCompositionPresetState(targetKind);
        let operation = null;
        try {
            const name = normalizePresetName(rawName);
            const nextName = normalizePresetName(rawNextName);
            if (name === nextName) {
                state.rowEditor = null;
                this.renderCompositionPresetList(targetKind);
                return;
            }
            operation = this.beginCompositionPresetOperation(targetKind, name);
            await this.getCompositionPresetStorage(operation.projectContext).move(
                operation.category,
                name,
                operation.category,
                { name: nextName }
            );
            if (!this.isCompositionPresetOperationCurrent(targetKind, operation)) return;
            state.selectedName = nextName;
            state.rowEditor = null;
            if (state.loadedKey === `${operation.category}/${name}` && state.loadedPreset) {
                state.loadedPreset = { ...state.loadedPreset, name: nextName };
                state.loadedKey = `${operation.category}/${nextName}`;
            }
            await this.refreshCompositionPresetList(targetKind);
            this.setCompositionPresetStatus(targetKind, `已重命名为“${nextName}”`, "success");
            this.syncCompositionPresetUi(targetKind);
        } catch (error) {
            if (operation && !this.isCompositionPresetOperationCurrent(targetKind, operation)) return;
            const message = error?.code === "PRESET_EXISTS" ? "同名预设已存在。" : (error?.message || String(error));
            this.setCompositionPresetStatus(targetKind, message, "error");
        }
    }

    async updateCompositionPresetDescription(targetKind, rawName, rawDescription) {
        const state = this.getCompositionPresetState(targetKind);
        let operation = null;
        try {
            const name = normalizePresetName(rawName);
            const description = normalizePresetDescription(rawDescription);
            operation = this.beginCompositionPresetOperation(targetKind, name);
            await this.getCompositionPresetStorage(operation.projectContext).move(
                operation.category,
                name,
                operation.category,
                { description }
            );
            if (!this.isCompositionPresetOperationCurrent(targetKind, operation)) return;
            state.rowEditor = null;
            if (state.loadedKey === `${operation.category}/${name}` && state.loadedPreset) {
                state.loadedPreset = { ...state.loadedPreset, description };
            }
            await this.refreshCompositionPresetList(targetKind);
            this.setCompositionPresetStatus(targetKind, description ? "预设描述已更新" : "预设描述已清空", "success");
            this.syncCompositionPresetUi(targetKind);
        } catch (error) {
            if (operation && !this.isCompositionPresetOperationCurrent(targetKind, operation)) return;
            this.setCompositionPresetStatus(targetKind, error?.message || String(error), "error");
        }
    }

    async moveCompositionPreset(targetKind, rawName, rawTargetCategory) {
        const state = this.getCompositionPresetState(targetKind);
        let operation = null;
        try {
            const name = normalizePresetName(rawName);
            const targetCategory = normalizePresetCategory(rawTargetCategory);
            if (!isPresetCategoryAccessible(targetKind, targetCategory)) throw new Error("目标目录不能保存此类预设。");
            operation = this.beginCompositionPresetOperation(targetKind, name);
            await this.getCompositionPresetStorage(operation.projectContext).move(
                operation.category,
                name,
                targetCategory
            );
            if (!this.isCompositionPresetOperationCurrent(targetKind, operation)) return;
            if (state.selectedName === name) {
                state.selectedName = "";
                state.loadedPreset = null;
                state.loadedKey = "";
            }
            await this.refreshCompositionPresetList(targetKind);
            await this.refreshCompositionPresetFolders(targetKind);
            this.setCompositionPresetStatus(targetKind, `已移动到 presets/${targetCategory}/`, "success");
            this.syncCompositionPresetUi(targetKind);
        } catch (error) {
            if (operation && !this.isCompositionPresetOperationCurrent(targetKind, operation)) return;
            const message = error?.code === "PRESET_EXISTS" ? "目标目录已有同名预设。" : (error?.message || String(error));
            this.setCompositionPresetStatus(targetKind, message, "error");
        }
    }

    async deleteCompositionPreset(targetKind, rawName) {
        const state = this.getCompositionPresetState(targetKind);
        let operation = null;
        try {
            const name = normalizePresetName(rawName);
            operation = this.beginCompositionPresetOperation(targetKind, name);
            const accepted = await this.askThemeConfirm({
                title: "删除预设",
                message: `确定删除“${name}”吗？`,
                okText: "删除",
                danger: true
            });
            if (!accepted || !this.isCompositionPresetOperationCurrent(targetKind, operation)) return;
            await this.getCompositionPresetStorage(operation.projectContext).remove(operation.category, name);
            if (!this.isCompositionPresetOperationCurrent(targetKind, operation)) return;
            if (state.selectedName === name) {
                state.selectedName = "";
                state.loadedPreset = null;
                state.loadedKey = "";
            }
            await this.refreshCompositionPresetList(targetKind);
            if (!this.isCompositionPresetOperationCurrent(targetKind, operation)) return;
            this.setCompositionPresetStatus(targetKind, `已删除“${name}”`, "success");
            this.syncCompositionPresetUi(targetKind);
        } catch (error) {
            if (operation && !this.isCompositionPresetOperationCurrent(targetKind, operation)) return;
            this.setCompositionPresetStatus(targetKind, error?.message || String(error), "error");
        }
    }
    }

    for (const key of Object.getOwnPropertyNames(CompositionPresetMixin.prototype)) {
        if (key === "constructor") continue;
        CompositionBuilderApp.prototype[key] = CompositionPresetMixin.prototype[key];
    }
}
