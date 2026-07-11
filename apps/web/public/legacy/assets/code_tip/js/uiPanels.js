import { resolveElement } from "./utils.js";
import { t } from "./i18nZhCN.js";

function createElement(tag, className, text) {
  const element = document.createElement(tag);
  if (className) {
    element.className = className;
  }
  if (typeof text === "string") {
    element.textContent = text;
  }
  return element;
}

function locationText(problem) {
  if (!problem || !problem.line) {
    return "L?";
  }

  const column = problem.column || 1;
  return `L${problem.line}:C${column}`;
}

function localizedSeverity(level) {
  const normalized = String(level || "").toLowerCase();
  if (normalized === "error") {
    return t("common.error");
  }
  if (normalized === "warning" || normalized === "warn") {
    return t("common.warning");
  }
  if (normalized === "info") {
    return t("common.info");
  }
  return t("common.hint");
}

function sortProblems(problems) {
  const weight = {
    error: 0,
    warning: 1,
    info: 2,
    hint: 3
  };

  return [...problems].sort((a, b) => {
    const aw = weight[a.severity] != null ? weight[a.severity] : 99;
    const bw = weight[b.severity] != null ? weight[b.severity] : 99;

    if (aw !== bw) {
      return aw - bw;
    }

    if ((a.line || 0) !== (b.line || 0)) {
      return (a.line || 0) - (b.line || 0);
    }

    return (a.column || 0) - (b.column || 0);
  });
}

export function createEditorPanels(options) {
  const mount = resolveElement(options.mount, "mount");
  const language = options.language === "typescript" ? t("editor.languageTypeScript") : t("editor.languageJavaScript");

  mount.innerHTML = "";

  const shell = createElement("section", "ct-editor-shell");
  const toolbar = createElement("div", "ct-toolbar");
  const toolbarLeft = createElement("div", "ct-toolbar-left");
  const toolbarRight = createElement("div", "ct-toolbar-right");

  const runButton = createElement("button", "ct-btn ct-btn-primary", t("editor.runShortcut"));
  runButton.type = "button";

  const clearProblemsButton = createElement("button", "ct-btn", t("editor.clearProblems"));
  clearProblemsButton.type = "button";

  const languageBadge = createElement("span", "ct-language-badge", language);

  toolbarLeft.appendChild(runButton);
  toolbarLeft.appendChild(clearProblemsButton);
  toolbarRight.appendChild(languageBadge);

  toolbar.appendChild(toolbarLeft);
  toolbar.appendChild(toolbarRight);

  const editorHost = createElement("div", "ct-editor-host");

  const statusBar = createElement("div", "ct-statusbar ct-status-idle");
  const statusText = createElement("span", "ct-status-text", t("editor.statusReady"));
  statusBar.appendChild(statusText);

  const problemsPanel = createElement("section", "ct-problems-panel");
  const problemsHeader = createElement("div", "ct-problems-header");
  const problemsTitle = createElement("span", "ct-problems-title", `${t("editor.problemsTitle")} (0)`);
  problemsHeader.appendChild(problemsTitle);

  const problemsList = createElement("ul", "ct-problems-list");

  problemsPanel.appendChild(problemsHeader);
  problemsPanel.appendChild(problemsList);

  shell.appendChild(toolbar);
  shell.appendChild(editorHost);
  shell.appendChild(statusBar);
  shell.appendChild(problemsPanel);

  mount.appendChild(shell);

  function setStatus(message, tone = "idle") {
    statusText.textContent = message;
    statusBar.className = `ct-statusbar ct-status-${tone}`;
  }

  function setProblems(problems) {
    const sorted = sortProblems(problems || []);
    problemsTitle.textContent = `${t("editor.problemsTitle")} (${sorted.length})`;
    problemsList.innerHTML = "";

    if (sorted.length === 0) {
      const empty = createElement("li", "ct-problem-item ct-problem-empty", t("common.noProblems"));
      problemsList.appendChild(empty);
      return;
    }

    sorted.forEach((problem) => {
      const item = createElement("li", `ct-problem-item ct-problem-${problem.severity || "hint"}`);

      const lineA = createElement(
        "div",
        "ct-problem-message",
        `[${localizedSeverity(problem.severity)}] ${problem.message || t("common.unknownIssue")}`
      );
      const lineB = createElement(
        "div",
        "ct-problem-meta",
        `${problem.source || t("common.sourceUnknown")} · ${locationText(problem)}${problem.code ? ` · ${problem.code}` : ""}`
      );

      item.appendChild(lineA);
      item.appendChild(lineB);

      if (problem.explain) {
        const explain = createElement("div", "ct-problem-explain", `${t("diagnostics.explainPrefix")}：${problem.explain}`);
        item.appendChild(explain);
      }

      problemsList.appendChild(item);
    });
  }

  function onRun(handler) {
    runButton.addEventListener("click", handler);
    return () => runButton.removeEventListener("click", handler);
  }

  function onClearProblems(handler) {
    clearProblemsButton.addEventListener("click", handler);
    return () => clearProblemsButton.removeEventListener("click", handler);
  }

  function dispose() {
    mount.innerHTML = "";
  }

  return {
    editorHost,
    setStatus,
    setProblems,
    onRun,
    onClearProblems,
    dispose
  };
}

export function createPreviewPanels(options) {
  const mount = resolveElement(options.mount, "previewMount");

  mount.innerHTML = "";

  const shell = createElement("section", "ct-preview-shell");

  const header = createElement("div", "ct-preview-header");
  const title = createElement("span", "ct-preview-title", t("preview.title"));
  const runtimeStatus = createElement("span", "ct-runtime-status ct-runtime-idle", t("preview.statusIdle"));

  const clearConsoleButton = createElement("button", "ct-btn", t("preview.clearConsole"));
  clearConsoleButton.type = "button";

  header.appendChild(title);
  header.appendChild(runtimeStatus);
  header.appendChild(clearConsoleButton);

  const previewHost = createElement("div", "ct-preview-host");

  const consolePanel = createElement("section", "ct-console-panel");
  const consoleHeader = createElement("div", "ct-console-header", t("preview.consoleTitle"));
  const consoleList = createElement("ul", "ct-console-list");

  consolePanel.appendChild(consoleHeader);
  consolePanel.appendChild(consoleList);

  shell.appendChild(header);
  shell.appendChild(previewHost);
  shell.appendChild(consolePanel);

  mount.appendChild(shell);

  function setRuntimeStatus(message, tone = "idle") {
    runtimeStatus.textContent = message;
    runtimeStatus.className = `ct-runtime-status ct-runtime-${tone}`;
  }

  function appendConsole(level, args) {
    const row = createElement("li", `ct-console-item ct-console-${level || "log"}`);
    const text = Array.isArray(args) ? args.join(" ") : String(args || "");
    row.textContent = text;
    consoleList.appendChild(row);
    consoleList.scrollTop = consoleList.scrollHeight;
  }

  function clearConsole() {
    consoleList.innerHTML = "";
  }

  function onClearConsole(handler) {
    clearConsoleButton.addEventListener("click", handler);
    return () => clearConsoleButton.removeEventListener("click", handler);
  }

  function dispose() {
    mount.innerHTML = "";
  }

  return {
    previewHost,
    setRuntimeStatus,
    appendConsole,
    clearConsole,
    onClearConsole,
    dispose
  };
}
