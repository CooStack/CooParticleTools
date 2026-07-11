import { resolveElement, createId, downloadTextFile, readTextFile } from "./utils.js";
import { t } from "./i18nZhCN.js";

function normalizeLibraries(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter((item) => item && typeof item.name === "string")
    .map((item, index) => ({
      id: item.id || `lib-${index + 1}-${createId("dts")}`,
      name: item.name.trim() || `custom-${index + 1}.d.ts`,
      content: typeof item.content === "string" ? item.content : "",
      enabled: item.enabled !== false
    }));
}

function createDefaultLibrary() {
  return {
    id: createId("type-lib"),
    name: `custom-${Date.now()}.d.ts`,
    content: "declare const demoValue: string;",
    enabled: true
  };
}

function loadLibraries(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return normalizeLibraries(parsed.libs || []);
  } catch (error) {
    console.warn("CodeTip: load type libraries failed", error);
    return [];
  }
}

function saveLibraries(storageKey, libs) {
  const payload = {
    libs: normalizeLibraries(libs)
  };

  localStorage.setItem(storageKey, JSON.stringify(payload));
}

function cloneLibraries(libs) {
  return libs.map((item) => ({ ...item }));
}

export function createTypeLibraryPanel(options = {}) {
  const mount = resolveElement(options.mount, "typeLibraryMount");
  const storageKey = options.storageKey || t("typeLibrary.storageKey");
  const storedLibraries = loadLibraries(storageKey);
  const initialLibraries = options.initialLibs ? normalizeLibraries(options.initialLibs) : [];

  const state = {
    libs: storedLibraries.length > 0 ? storedLibraries : initialLibraries,
    selectedId: ""
  };

  if (state.libs.length === 0) {
    state.libs = [];
  }

  state.selectedId = state.libs[0] ? state.libs[0].id : "";

  mount.innerHTML = "";

  const shell = document.createElement("section");
  shell.className = "ct-side-shell";

  const header = document.createElement("div");
  header.className = "ct-side-header";

  const title = document.createElement("h3");
  title.className = "ct-side-title";
  title.textContent = t("typeLibrary.title");

  const actions = document.createElement("div");
  actions.className = "ct-side-actions";

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.className = "ct-btn ct-btn-primary";
  addButton.textContent = t("typeLibrary.add");

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "ct-btn";
  removeButton.textContent = t("typeLibrary.remove");

  const refreshButton = document.createElement("button");
  refreshButton.type = "button";
  refreshButton.className = "ct-btn";
  refreshButton.textContent = t("typeLibrary.refresh");

  const exportButton = document.createElement("button");
  exportButton.type = "button";
  exportButton.className = "ct-btn";
  exportButton.textContent = t("typeLibrary.exportJson");

  const importButton = document.createElement("button");
  importButton.type = "button";
  importButton.className = "ct-btn";
  importButton.textContent = t("typeLibrary.importJson");

  const importInput = document.createElement("input");
  importInput.type = "file";
  importInput.accept = "application/json,.json";
  importInput.className = "ct-hidden-input";

  actions.appendChild(addButton);
  actions.appendChild(removeButton);
  actions.appendChild(refreshButton);
  actions.appendChild(exportButton);
  actions.appendChild(importButton);

  header.appendChild(title);
  header.appendChild(actions);
  header.appendChild(importInput);

  const body = document.createElement("div");
  body.className = "ct-side-body";

  const list = document.createElement("div");
  list.className = "ct-side-list";

  const editor = document.createElement("div");
  editor.className = "ct-side-editor";

  const nameLabel = document.createElement("label");
  nameLabel.className = "ct-field-label";
  nameLabel.textContent = t("typeLibrary.itemName");

  const nameInput = document.createElement("input");
  nameInput.type = "text";
  nameInput.className = "ct-field-input";
  nameInput.placeholder = t("typeLibrary.placeholderName");

  const enabledLine = document.createElement("label");
  enabledLine.className = "ct-checkbox-line";
  const enabledInput = document.createElement("input");
  enabledInput.type = "checkbox";
  const enabledText = document.createElement("span");
  enabledText.textContent = t("typeLibrary.itemEnabled");
  enabledLine.appendChild(enabledInput);
  enabledLine.appendChild(enabledText);

  const contentLabel = document.createElement("label");
  contentLabel.className = "ct-field-label";
  contentLabel.textContent = t("typeLibrary.itemContent");

  const contentInput = document.createElement("textarea");
  contentInput.className = "ct-field-textarea";
  contentInput.placeholder = t("typeLibrary.placeholderContent");

  editor.appendChild(nameLabel);
  editor.appendChild(nameInput);
  editor.appendChild(enabledLine);
  editor.appendChild(contentLabel);
  editor.appendChild(contentInput);

  body.appendChild(list);
  body.appendChild(editor);

  shell.appendChild(header);
  shell.appendChild(body);

  mount.appendChild(shell);

  function getSelected() {
    return state.libs.find((item) => item.id === state.selectedId) || null;
  }

  function persistAndEmit() {
    saveLibraries(storageKey, state.libs);

    if (typeof options.onChange === "function") {
      options.onChange(cloneLibraries(state.libs));
    }
  }

  function renderList() {
    list.innerHTML = "";

    if (state.libs.length === 0) {
      const empty = document.createElement("div");
      empty.className = "ct-side-empty";
      empty.textContent = t("typeLibrary.empty");
      list.appendChild(empty);
      return;
    }

    state.libs.forEach((item) => {
      const row = document.createElement("label");
      row.className = `ct-side-item${item.id === state.selectedId ? " is-active" : ""}`;

      const pick = document.createElement("input");
      pick.type = "radio";
      pick.name = "ct-type-lib-pick";
      pick.checked = item.id === state.selectedId;
      pick.addEventListener("change", () => {
        state.selectedId = item.id;
        render();
      });

      const enabled = document.createElement("input");
      enabled.type = "checkbox";
      enabled.checked = item.enabled;
      enabled.addEventListener("change", () => {
        item.enabled = enabled.checked;
        persistAndEmit();
      });

      const label = document.createElement("span");
      label.className = "ct-side-item-label";
      label.textContent = item.name;

      row.appendChild(pick);
      row.appendChild(enabled);
      row.appendChild(label);

      list.appendChild(row);
    });
  }

  function renderEditor() {
    const selected = getSelected();
    const disabled = !selected;

    nameInput.disabled = disabled;
    contentInput.disabled = disabled;
    enabledInput.disabled = disabled;
    removeButton.disabled = disabled;

    if (!selected) {
      nameInput.value = "";
      contentInput.value = "";
      enabledInput.checked = false;
      return;
    }

    nameInput.value = selected.name;
    contentInput.value = selected.content;
    enabledInput.checked = selected.enabled;
  }

  function render() {
    renderList();
    renderEditor();
  }

  addButton.addEventListener("click", () => {
    const next = createDefaultLibrary();
    state.libs.push(next);
    state.selectedId = next.id;
    render();
    persistAndEmit();
  });

  removeButton.addEventListener("click", () => {
    const index = state.libs.findIndex((item) => item.id === state.selectedId);
    if (index < 0) {
      return;
    }

    state.libs.splice(index, 1);
    state.selectedId = state.libs[index] ? state.libs[index].id : state.libs[index - 1] ? state.libs[index - 1].id : "";
    render();
    persistAndEmit();
  });

  refreshButton.addEventListener("click", () => {
    persistAndEmit();
  });

  exportButton.addEventListener("click", () => {
    const payload = JSON.stringify({ libs: cloneLibraries(state.libs) }, null, 2);
    downloadTextFile("type_libraries.json", payload, "application/json");
  });

  importButton.addEventListener("click", () => importInput.click());

  importInput.addEventListener("change", async () => {
    const file = importInput.files && importInput.files[0];
    importInput.value = "";

    if (!file) {
      return;
    }

    try {
      const text = await readTextFile(file);
      const parsed = JSON.parse(text);

      if (!parsed || !Array.isArray(parsed.libs)) {
        throw new Error(t("typeLibrary.importInvalid"));
      }

      state.libs = normalizeLibraries(parsed.libs);
      state.selectedId = state.libs[0] ? state.libs[0].id : "";
      render();
      persistAndEmit();
    } catch (error) {
      alert(error && error.message ? error.message : t("typeLibrary.importInvalid"));
    }
  });

  nameInput.addEventListener("input", () => {
    const selected = getSelected();
    if (!selected) {
      return;
    }

    selected.name = nameInput.value.trim() || selected.name;
    renderList();
    persistAndEmit();
  });

  enabledInput.addEventListener("change", () => {
    const selected = getSelected();
    if (!selected) {
      return;
    }

    selected.enabled = enabledInput.checked;
    renderList();
    persistAndEmit();
  });

  contentInput.addEventListener("input", () => {
    const selected = getSelected();
    if (!selected) {
      return;
    }

    selected.content = contentInput.value;
    persistAndEmit();
  });

  render();
  persistAndEmit();

  return {
    getLibraries() {
      return cloneLibraries(state.libs);
    },
    setLibraries(nextLibraries) {
      state.libs = normalizeLibraries(nextLibraries);
      state.selectedId = state.libs[0] ? state.libs[0].id : "";
      render();
      persistAndEmit();
    },
    refresh() {
      persistAndEmit();
    },
    dispose() {
      mount.innerHTML = "";
    }
  };
}
