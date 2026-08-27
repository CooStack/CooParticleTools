import { loadMonaco } from "./monacoLoader.js";
import { createEditorCore } from "./editorCore.js";
import { createLanguageService, normalizeLanguage } from "./languageJsTs.js";
import { createCompiler } from "./compiler.js";
import { createPreviewSandbox } from "./preview.js";
import { createEditorPanels, createPreviewPanels } from "./uiPanels.js";
import { createId, debounce, resolveElement, toArray } from "./utils.js";
import { format, t } from "./i18nZhCN.js";

const DEFAULT_JS = `/**
 * @param {number[]} values
 * @returns {number}
 */
function sum(values) {
  return values.reduce((acc, item) => acc + item, 0);
}

const list = [1, 2, 3, 4];
console.log("sum =", sum(list));`;

const DEFAULT_TS = `type DemoUser = {
  id: number;
  name: string;
};

async function boot() {
  const value = await magicBolt("preview-target", { retries: 1 });
  const user: DemoUser = { id: value, name: "CodeTip" };
  console.log("user", user, toolkit.sum(user.id, 8));
}

boot();`;

function normalizeLibEntries(libs) {
  return toArray(libs)
    .filter((item) => item && typeof item.content === "string")
    .map((item, index) => ({
      id: item.id || `lib-${index + 1}`,
      name: item.name || `custom-${index + 1}.d.ts`,
      content: item.content,
      enabled: item.enabled !== false,
      filePath: item.filePath || ""
    }));
}

function compilerItemToProblem(item, fallbackSeverity) {
  const severity = item.category === "warning" ? "warning" : fallbackSeverity;
  return {
    source: t("compiler.sourceCompiler"),
    severity,
    message: item.message || "Compiler message",
    line: item.line || 0,
    column: item.column || 0,
    endLine: item.endLine || 0,
    endColumn: item.endColumn || 0,
    code: item.code || "",
    explain: `${t("diagnostics.tsOriginal")}：${item.message || ""}`
  };
}

function runtimePayloadToProblem(payload) {
  return {
    source: t("compiler.sourceRuntime"),
    severity: "error",
    message: payload && payload.message ? payload.message : "Runtime error",
    line: payload && payload.lineno ? payload.lineno : 0,
    column: payload && payload.colno ? payload.colno : 0,
    code: "",
    explain: payload && payload.stack ? payload.stack : ""
  };
}

async function loadBuiltinSampleLib() {
  const url = new URL("../dts/sample-api.d.ts", import.meta.url);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return {
      id: "builtin-sample-api",
      name: "sample-api.d.ts",
      content: await response.text(),
      enabled: true
    };
  } catch (error) {
    console.warn("CodeTip: failed to load builtin sample-api.d.ts", error);
    return null;
  }
}

function pickInitialCode(language, userCode) {
  if (typeof userCode === "string") {
    return userCode;
  }
  return language === "typescript" ? DEFAULT_TS : DEFAULT_JS;
}

export async function createCodeTipEditor(options = {}) {
  const mount = resolveElement(options.mount, "mount");
  const previewMount = resolveElement(options.previewMount, "previewMount");
  const language = normalizeLanguage(options.language);

  const monaco = await loadMonaco();

  const editorPanels = createEditorPanels({ mount, language });
  const previewPanels = createPreviewPanels({ mount: previewMount });

  let diagnosticsProblems = [];
  let compileProblems = [];
  let warningProblems = [];
  let runtimeProblems = [];
  let disposed = false;
  let compileSeq = 0;

  const stateLibs = {
    builtin: [],
    external: normalizeLibEntries(options.libs),
    typeLibrary: [],
    mapping: [],
    manual: []
  };

  let scheduleCompileAndRun = () => {};

  const editorCore = createEditorCore({
    monaco,
    mount: editorPanels.editorHost,
    language,
    initialCode: pickInitialCode(language, options.initialCode),
    onBlur: () => {
      scheduleCompileAndRun();
    },
    onFocus: () => {
      editorPanels.setStatus(t("editor.statusEditing"), "busy");
    },
    onChange: () => {
      runtimeProblems = [];
    },
    onRunShortcut: () => {
      compileAndRun("shortcut");
    }
  });

  const languageService = createLanguageService({
    monaco,
    language,
    model: editorCore.model,
    libs: []
  });

  const compiler = createCompiler();

  const builtinLib = options.loadBuiltinLib === false ? null : await loadBuiltinSampleLib();
  stateLibs.builtin = builtinLib ? [builtinLib] : [];
  languageService.setExtraLibs("builtin", stateLibs.builtin);
  languageService.setExtraLibs("external", stateLibs.external);

  const clearObserveDiagnostics = languageService.observeDiagnostics((problems) => {
    diagnosticsProblems = problems;
    flushProblems();
  });

  const removeRunClick = editorPanels.onRun(() => compileAndRun("manual"));
  const removeClearProblems = editorPanels.onClearProblems(() => {
    compileProblems = [];
    warningProblems = [];
    runtimeProblems = [];
    flushProblems();
  });
  const removeClearConsole = previewPanels.onClearConsole(() => previewPanels.clearConsole());

  const preview = createPreviewSandbox({
    mount: previewPanels.previewHost,
    onMessage(message) {
      switch (message.type) {
        case "sandbox-ready":
          previewPanels.setRuntimeStatus(t("preview.statusSandboxReady"), "ok");
          break;
        case "console-clear":
          previewPanels.clearConsole();
          break;
        case "console":
          previewPanels.appendConsole(message.payload.level, message.payload.args || []);
          break;
        case "run-start":
          previewPanels.setRuntimeStatus(t("preview.statusRunning"), "busy");
          break;
        case "run-success":
          previewPanels.setRuntimeStatus(t("preview.statusUpdated"), "ok");
          break;
        case "run-fail":
          previewPanels.setRuntimeStatus(t("preview.statusExecutionFailed"), "error");
          break;
        case "runtime-error":
          runtimeProblems = [runtimePayloadToProblem(message.payload || {})];
          previewPanels.setRuntimeStatus(t("preview.statusRuntimeError"), "error");
          flushProblems();
          break;
        default:
          break;
      }
    }
  });

  function mergedProblems() {
    return [...diagnosticsProblems, ...compileProblems, ...warningProblems, ...runtimeProblems];
  }

  function hasError(problems) {
    return problems.some((item) => item.severity === "error");
  }

  function flushProblems() {
    const current = mergedProblems();
    editorPanels.setProblems(current);

    const errorCount = current.filter((item) => item.severity === "error").length;
    const warningCount = current.filter((item) => item.severity === "warning").length;

    if (errorCount > 0) {
      editorPanels.setStatus(format(t("editor.statusProblems"), { errors: errorCount, warnings: warningCount }), "error");
      return;
    }

    if (warningCount > 0) {
      editorPanels.setStatus(format(t("editor.statusWarnings"), { warnings: warningCount }), "warn");
      return;
    }

    editorPanels.setStatus(t("editor.statusReady"), "ok");
  }

  async function compileAndRun(trigger) {
    if (disposed) {
      return;
    }

    const seq = ++compileSeq;
    const source = editorCore.editor.getValue();

    compileProblems = [];
    warningProblems = [];
    runtimeProblems = [];

    editorPanels.setStatus(trigger === "manual" ? t("editor.statusCompilingManual") : t("editor.statusCompiling"), "busy");
    previewPanels.setRuntimeStatus(t("preview.statusCompiling"), "busy");
    editorPanels.setProblems(mergedProblems());

    let output;

    try {
      output = await compiler.compile({
        language,
        code: source,
        mode: options.mode === "bundle" ? "bundle" : "transpile",
        sourceMap: true
      });
    } catch (error) {
      if (disposed || seq !== compileSeq) {
        return;
      }

      compileProblems = [
        {
          source: t("compiler.sourceCompiler"),
          severity: "error",
          message: error && error.message ? error.message : String(error),
          line: 0,
          column: 0,
          code: ""
        }
      ];

      flushProblems();
      previewPanels.setRuntimeStatus(t("preview.statusCompileFailed"), "error");
      return;
    }

    if (disposed || seq !== compileSeq) {
      return;
    }

    compileProblems = (output.errors || []).map((item) => compilerItemToProblem(item, "error"));
    warningProblems = (output.warnings || []).map((item) => compilerItemToProblem(item, "warning"));

    flushProblems();

    if (hasError(compileProblems)) {
      previewPanels.setRuntimeStatus(t("preview.statusCompileFailed"), "error");
      return;
    }

    try {
      await preview.run(output.code || "");
    } catch (error) {
      runtimeProblems = [
        {
          source: t("compiler.sourceRuntime"),
          severity: "error",
          message: error && error.message ? error.message : String(error),
          line: 0,
          column: 0,
          code: ""
        }
      ];
      flushProblems();
      previewPanels.setRuntimeStatus(t("preview.statusPreviewFailed"), "error");
      return;
    }

    const currentProblems = mergedProblems();
    const hasAnyError = currentProblems.some((item) => item.severity === "error");
    if (hasAnyError) {
      flushProblems();
      return;
    }

    if (currentProblems.length > 0) {
      editorPanels.setStatus(t("editor.statusPreviewUpdatedWithWarnings"), "warn");
    } else {
      editorPanels.setStatus(t("editor.statusPreviewUpdated"), "ok");
    }
  }

  function applyTypeLibraries(libs) {
    stateLibs.typeLibrary = normalizeLibEntries(libs);
    languageService.setExtraLibs("type-library", stateLibs.typeLibrary);
  }

  function applyMappingDts(content, fileName = "__mapping__.d.ts") {
    const text = String(content || "").trim();
    stateLibs.mapping =
      text.length > 0
        ? [
            {
              id: "mapping-dts",
              name: fileName,
              content: text,
              enabled: true
            }
          ]
        : [];

    languageService.setExtraLibs("type-mapping", stateLibs.mapping);
  }

  function setExternalLibs(libs) {
    stateLibs.external = normalizeLibEntries(libs);
    languageService.setExtraLibs("external", stateLibs.external);
  }

  function refreshTypeLibraries() {
    languageService.setExtraLibs("type-library", stateLibs.typeLibrary);
    languageService.setExtraLibs("type-mapping", stateLibs.mapping);
  }

  scheduleCompileAndRun = debounce(() => {
    compileAndRun("blur");
  }, 300);

  if (options.autoRunOnInit !== false) {
    compileAndRun("init");
  }

  function registerCompletionProvider(provider) {
    return languageService.registerCompletionProvider(provider);
  }

  function addLib(lib) {
    const id = lib && lib.id ? lib.id : createId("manual-lib");
    stateLibs.manual = [...stateLibs.manual, { ...lib, id }];
    languageService.setExtraLibs("manual", stateLibs.manual);

    return {
      dispose() {
        stateLibs.manual = stateLibs.manual.filter((item) => item.id !== id);
        languageService.setExtraLibs("manual", stateLibs.manual);
      }
    };
  }

  function dispose() {
    if (disposed) {
      return;
    }

    disposed = true;
    scheduleCompileAndRun.cancel();
    removeRunClick();
    removeClearProblems();
    removeClearConsole();
    clearObserveDiagnostics.dispose();
    preview.dispose();
    compiler.dispose();
    languageService.dispose();
    editorCore.dispose();
    editorPanels.dispose();
    previewPanels.dispose();
  }

  return {
    monaco,
    editor: editorCore.editor,
    model: editorCore.model,
    run: () => compileAndRun("manual"),
    addLib,
    setExternalLibs,
    setTypeLibraries: applyTypeLibraries,
    refreshTypeLibraries,
    setMappingDts: applyMappingDts,
    registerCompletionProvider,
    getValue: () => editorCore.editor.getValue(),
    setValue: (value) => editorCore.editor.setValue(String(value || "")),
    dispose
  };
}

