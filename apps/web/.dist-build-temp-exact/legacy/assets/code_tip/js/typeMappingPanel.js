import { resolveElement, createId, downloadTextFile, readTextFile } from "./utils.js";
import { t } from "./i18nZhCN.js";
import { mappingToDts, mappingToMarkdown, mappingToKotlinStub } from "./mappingToDts.js";

function normalizeMappings(raw) {
  if (!Array.isArray(raw)) {
    return [];
  }

  return raw
    .filter((item) => item && typeof item.ts === "string" && typeof item.kotlin === "string")
    .map((item, index) => ({
      id: item.id || `mapping-${index + 1}-${createId("map")}`,
      type: item.type === "template" ? "template" : "alias",
      ts: item.ts.trim(),
      kotlin: item.kotlin.trim(),
      description: String(item.description || "").trim(),
      enabled: item.enabled !== false
    }));
}

function createDefaultMapping() {
  return {
    id: createId("mapping"),
    type: "alias",
    ts: "Vec3",
    kotlin: "net.minecraft.util.math.Vec3d",
    description: "MC 风格三维向量",
    enabled: true
  };
}

function cloneMappings(mappings) {
  return mappings.map((item) => ({ ...item }));
}

function loadMappings(storageKey) {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw);
    return normalizeMappings(parsed.mappings || []);
  } catch (error) {
    console.warn("CodeTip: load type mappings failed", error);
    return [];
  }
}

function saveMappings(storageKey, mappings) {
  const payload = {
    mappings: normalizeMappings(mappings)
  };

  localStorage.setItem(storageKey, JSON.stringify(payload));
}

export function createTypeMappingPanel(options = {}) {
  const mount = resolveElement(options.mount, "typeMappingMount");
  const storageKey = options.storageKey || t("mapping.storageKey");
  const storedMappings = loadMappings(storageKey);
  const initialMappings = options.initialMappings ? normalizeMappings(options.initialMappings) : [];

  const state = {
    mappings: storedMappings.length > 0 ? storedMappings : initialMappings,
    selectedId: ""
  };

  state.selectedId = state.mappings[0] ? state.mappings[0].id : "";

  mount.innerHTML = "";

  const shell = document.createElement("section");
  shell.className = "ct-side-shell";

  const header = document.createElement("div");
  header.className = "ct-side-header";

  const title = document.createElement("h3");
  title.className = "ct-side-title";
  title.textContent = t("mapping.title");

  const actions = document.createElement("div");
  actions.className = "ct-side-actions";

  const addButton = document.createElement("button");
  addButton.type = "button";
  addButton.className = "ct-btn ct-btn-primary";
  addButton.textContent = t("mapping.add");

  const removeButton = document.createElement("button");
  removeButton.type = "button";
  removeButton.className = "ct-btn";
  removeButton.textContent = t("mapping.remove");

  const refreshButton = document.createElement("button");
  refreshButton.type = "button";
  refreshButton.className = "ct-btn";
  refreshButton.textContent = t("mapping.refresh");

  const exportJsonButton = document.createElement("button");
  exportJsonButton.type = "button";
  exportJsonButton.className = "ct-btn";
  exportJsonButton.textContent = t("mapping.exportJson");

  const importJsonButton = document.createElement("button");
  importJsonButton.type = "button";
  importJsonButton.className = "ct-btn";
  importJsonButton.textContent = t("mapping.importJson");

  const exportDocButton = document.createElement("button");
  exportDocButton.type = "button";
  exportDocButton.className = "ct-btn";
  exportDocButton.textContent = t("mapping.exportDoc");

  const exportStubButton = document.createElement("button");
  exportStubButton.type = "button";
  exportStubButton.className = "ct-btn";
  exportStubButton.textContent = t("mapping.exportStub");

  const importInput = document.createElement("input");
  importInput.type = "file";
  importInput.accept = "application/json,.json";
  importInput.className = "ct-hidden-input";

  actions.appendChild(addButton);
  actions.appendChild(removeButton);
  actions.appendChild(refreshButton);
  actions.appendChild(exportJsonButton);
  actions.appendChild(importJsonButton);
  actions.appendChild(exportDocButton);
  actions.appendChild(exportStubButton);

  header.appendChild(title);
  header.appendChild(actions);
  header.appendChild(importInput);

  const body = document.createElement("div");
  body.className = "ct-side-body";

  const list = document.createElement("div");
  list.className = "ct-side-list";

  const editor = document.createElement("div");
  editor.className = "ct-side-editor";

  const typeLabel = document.createElement("label");
  typeLabel.className = "ct-field-label";
  typeLabel.textContent = t("mapping.fieldType");

  const typeSelect = document.createElement("select");
  typeSelect.className = "ct-field-input";

  const aliasOption = document.createElement("option");
  aliasOption.value = "alias";
  aliasOption.textContent = t("mapping.typeAlias");

  const templateOption = document.createElement("option");
  templateOption.value = "template";
  templateOption.textContent = t("mapping.typeTemplate");

  typeSelect.appendChild(aliasOption);
  typeSelect.appendChild(templateOption);

  const enabledLine = document.createElement("label");
  enabledLine.className = "ct-checkbox-line";
  const enabledInput = document.createElement("input");
  enabledInput.type = "checkbox";
  const enabledText = document.createElement("span");
  enabledText.textContent = t("typeLibrary.itemEnabled");
  enabledLine.appendChild(enabledInput);
  enabledLine.appendChild(enabledText);

  const tsLabel = document.createElement("label");
  tsLabel.className = "ct-field-label";
  tsLabel.textContent = t("mapping.fieldTs");

  const tsInput = document.createElement("input");
  tsInput.type = "text";
  tsInput.className = "ct-field-input";

  const kotlinLabel = document.createElement("label");
  kotlinLabel.className = "ct-field-label";
  kotlinLabel.textContent = t("mapping.fieldKotlin");

  const kotlinInput = document.createElement("input");
  kotlinInput.type = "text";
  kotlinInput.className = "ct-field-input";

  const descLabel = document.createElement("label");
  descLabel.className = "ct-field-label";
  descLabel.textContent = t("mapping.fieldDescription");

  const descInput = document.createElement("textarea");
  descInput.className = "ct-field-textarea";
  descInput.placeholder = t("mapping.placeholderDescription");

  editor.appendChild(typeLabel);
  editor.appendChild(typeSelect);
  editor.appendChild(enabledLine);
  editor.appendChild(tsLabel);
  editor.appendChild(tsInput);
  editor.appendChild(kotlinLabel);
  editor.appendChild(kotlinInput);
  editor.appendChild(descLabel);
  editor.appendChild(descInput);

  body.appendChild(list);
  body.appendChild(editor);

  shell.appendChild(header);
  shell.appendChild(body);

  mount.appendChild(shell);

  function getSelected() {
    return state.mappings.find((item) => item.id === state.selectedId) || null;
  }

  function persistAndEmit() {
    saveMappings(storageKey, state.mappings);

    if (typeof options.onChange === "function") {
      const payloadMappings = cloneMappings(state.mappings);
      options.onChange({
        mappings: payloadMappings,
        dts: mappingToDts(payloadMappings)
      });
    }
  }

  function renderList() {
    list.innerHTML = "";

    if (state.mappings.length === 0) {
      const empty = document.createElement("div");
      empty.className = "ct-side-empty";
      empty.textContent = t("common.noData");
      list.appendChild(empty);
      return;
    }

    state.mappings.forEach((item) => {
      const row = document.createElement("label");
      row.className = `ct-side-item${item.id === state.selectedId ? " is-active" : ""}`;

      const pick = document.createElement("input");
      pick.type = "radio";
      pick.name = "ct-type-mapping-pick";
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
      const typeLabelText = item.type === "template" ? t("mapping.typeTemplate") : t("mapping.typeAlias");
      label.textContent = `[${typeLabelText}] ${item.ts || "?"} -> ${item.kotlin || "?"}`;

      row.appendChild(pick);
      row.appendChild(enabled);
      row.appendChild(label);

      list.appendChild(row);
    });
  }

  function renderEditor() {
    const selected = getSelected();
    const disabled = !selected;

    removeButton.disabled = disabled;
    typeSelect.disabled = disabled;
    enabledInput.disabled = disabled;
    tsInput.disabled = disabled;
    kotlinInput.disabled = disabled;
    descInput.disabled = disabled;

    if (!selected) {
      typeSelect.value = "alias";
      enabledInput.checked = false;
      tsInput.value = "";
      kotlinInput.value = "";
      descInput.value = "";
      return;
    }

    typeSelect.value = selected.type;
    enabledInput.checked = selected.enabled;
    tsInput.value = selected.ts;
    kotlinInput.value = selected.kotlin;
    descInput.value = selected.description;

    tsInput.placeholder = selected.type === "template" ? t("mapping.placeholderTsTemplate") : t("mapping.placeholderTsAlias");
    kotlinInput.placeholder =
      selected.type === "template" ? t("mapping.placeholderKotlinTemplate") : t("mapping.placeholderKotlinAlias");
  }

  function render() {
    renderList();
    renderEditor();
  }

  addButton.addEventListener("click", () => {
    const next = createDefaultMapping();
    state.mappings.push(next);
    state.selectedId = next.id;
    render();
    persistAndEmit();
  });

  removeButton.addEventListener("click", () => {
    const index = state.mappings.findIndex((item) => item.id === state.selectedId);
    if (index < 0) {
      return;
    }

    state.mappings.splice(index, 1);
    state.selectedId =
      state.mappings[index] ? state.mappings[index].id : state.mappings[index - 1] ? state.mappings[index - 1].id : "";
    render();
    persistAndEmit();
  });

  refreshButton.addEventListener("click", () => {
    persistAndEmit();
  });

  exportJsonButton.addEventListener("click", () => {
    const payload = JSON.stringify({ mappings: cloneMappings(state.mappings) }, null, 2);
    downloadTextFile("mapping.json", payload, "application/json");
  });

  importJsonButton.addEventListener("click", () => importInput.click());

  importInput.addEventListener("change", async () => {
    const file = importInput.files && importInput.files[0];
    importInput.value = "";

    if (!file) {
      return;
    }

    try {
      const text = await readTextFile(file);
      const parsed = JSON.parse(text);

      if (!parsed || !Array.isArray(parsed.mappings)) {
        throw new Error(t("mapping.importInvalid"));
      }

      state.mappings = normalizeMappings(parsed.mappings);
      state.selectedId = state.mappings[0] ? state.mappings[0].id : "";
      render();
      persistAndEmit();
    } catch (error) {
      alert(error && error.message ? error.message : t("mapping.importInvalid"));
    }
  });

  exportDocButton.addEventListener("click", () => {
    const markdown = mappingToMarkdown(state.mappings);
    downloadTextFile("kotlin_mapping.md", markdown, "text/markdown");
  });

  exportStubButton.addEventListener("click", () => {
    const stub = mappingToKotlinStub(state.mappings);
    downloadTextFile("kotlin_stub_template.kt", stub, "text/plain");
  });

  typeSelect.addEventListener("change", () => {
    const selected = getSelected();
    if (!selected) {
      return;
    }

    selected.type = typeSelect.value === "template" ? "template" : "alias";
    render();
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

  tsInput.addEventListener("input", () => {
    const selected = getSelected();
    if (!selected) {
      return;
    }

    selected.ts = tsInput.value;
    renderList();
    persistAndEmit();
  });

  kotlinInput.addEventListener("input", () => {
    const selected = getSelected();
    if (!selected) {
      return;
    }

    selected.kotlin = kotlinInput.value;
    renderList();
    persistAndEmit();
  });

  descInput.addEventListener("input", () => {
    const selected = getSelected();
    if (!selected) {
      return;
    }

    selected.description = descInput.value;
    persistAndEmit();
  });

  render();
  persistAndEmit();

  return {
    getMappings() {
      return cloneMappings(state.mappings);
    },
    setMappings(nextMappings) {
      state.mappings = normalizeMappings(nextMappings);
      state.selectedId = state.mappings[0] ? state.mappings[0].id : "";
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
