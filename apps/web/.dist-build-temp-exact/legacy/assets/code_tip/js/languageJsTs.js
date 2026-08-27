import { createId, sanitizeFileName, toArray } from "./utils.js";
import { t } from "./i18nZhCN.js";

let globalDefaultsConfigured = false;
let snippetRefCount = 0;
let snippetDisposables = [];

const DEFAULT_SNIPPETS = [
  {
    label: t("snippets.logLabel"),
    filterText: "log",
    detail: t("snippets.logLabel"),
    documentation: t("snippets.logDoc"),
    insertText: "console.log(${1:值});",
    sortText: "0-log"
  },
  {
    label: t("snippets.fnLabel"),
    filterText: "fn",
    detail: t("snippets.fnDetail"),
    documentation: t("snippets.fnDoc"),
    insertText: "function ${1:函数名}(${2:参数}) {\\n\\t${0}\\n}",
    sortText: "0-fn"
  },
  {
    label: t("snippets.forOfLabel"),
    filterText: "forof",
    detail: t("snippets.forOfDetail"),
    documentation: t("snippets.forOfDoc"),
    insertText: "for (const ${1:项} of ${2:列表}) {\\n\\t${0}\\n}",
    sortText: "0-forof"
  },
  {
    label: t("snippets.ifLabel"),
    filterText: "if",
    detail: t("snippets.ifDetail"),
    documentation: t("snippets.ifDoc"),
    insertText: "if (${1:条件}) {\\n\\t${0}\\n}",
    sortText: "0-if"
  },
  {
    label: t("snippets.tryCatchLabel"),
    filterText: "trycatch",
    detail: t("snippets.tryCatchDetail"),
    documentation: t("snippets.tryCatchDoc"),
    insertText: "try {\\n\\t${1}\\n} catch (${2:错误}) {\\n\\tconsole.error(${2:错误});\\n}",
    sortText: "0-trycatch"
  }
];

function normalizeLanguage(language) {
  return language === "typescript" ? "typescript" : "javascript";
}

function configureGlobalDefaults(monaco) {
  if (globalDefaultsConfigured) {
    return;
  }

  const tsDefaults = monaco.languages.typescript.typescriptDefaults;
  const jsDefaults = monaco.languages.typescript.javascriptDefaults;

  const sharedCompiler = {
    target: monaco.languages.typescript.ScriptTarget.ES2020,
    module: monaco.languages.typescript.ModuleKind.ESNext,
    moduleResolution: monaco.languages.typescript.ModuleResolutionKind.NodeJs,
    allowNonTsExtensions: true,
    allowSyntheticDefaultImports: true,
    esModuleInterop: true,
    strict: true,
    noEmit: true,
    lib: ["es2020", "dom"]
  };

  tsDefaults.setEagerModelSync(true);
  jsDefaults.setEagerModelSync(true);

  tsDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    noSuggestionDiagnostics: false
  });

  jsDefaults.setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    noSuggestionDiagnostics: false
  });

  tsDefaults.setCompilerOptions(sharedCompiler);
  jsDefaults.setCompilerOptions({
    ...sharedCompiler,
    allowJs: true,
    checkJs: true
  });

  globalDefaultsConfigured = true;
}

function severityFromMarker(monaco, severity) {
  if (severity === monaco.MarkerSeverity.Error) {
    return "error";
  }
  if (severity === monaco.MarkerSeverity.Warning) {
    return "warning";
  }
  if (severity === monaco.MarkerSeverity.Info) {
    return "info";
  }
  return "hint";
}

function markerToProblem(monaco, marker) {
  const code = typeof marker.code === "object" ? marker.code.value : marker.code;
  const severity = severityFromMarker(monaco, marker.severity);

  return {
    source: t("diagnostics.sourceDiagnostic"),
    severity,
    message: marker.message,
    line: marker.startLineNumber || 0,
    column: marker.startColumn || 0,
    endLine: marker.endLineNumber || 0,
    endColumn: marker.endColumn || 0,
    code: code || "",
    explain: `${t("diagnostics.levelLabel")}：${severity === "error" ? t("common.error") : severity === "warning" ? t("common.warning") : severity === "info" ? t("common.info") : t("common.hint")}`
  };
}

function acquireSnippetProviders(monaco) {
  if (snippetRefCount === 0) {
    const register = (language) =>
      monaco.languages.registerCompletionItemProvider(language, {
        provideCompletionItems(model, position) {
          const word = model.getWordUntilPosition(position);
          const range = {
            startLineNumber: position.lineNumber,
            endLineNumber: position.lineNumber,
            startColumn: word.startColumn,
            endColumn: word.endColumn
          };

          const suggestions = DEFAULT_SNIPPETS.map((snippet) => ({
            label: snippet.label,
            kind: monaco.languages.CompletionItemKind.Snippet,
            detail: snippet.detail,
            documentation: snippet.documentation,
            insertText: snippet.insertText,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            filterText: snippet.filterText,
            range,
            sortText: snippet.sortText
          }));

          return { suggestions };
        }
      });

    snippetDisposables = [register("javascript"), register("typescript")];
  }

  snippetRefCount += 1;
}

function releaseSnippetProviders() {
  snippetRefCount -= 1;

  if (snippetRefCount <= 0) {
    snippetRefCount = 0;
    snippetDisposables.forEach((item) => item.dispose());
    snippetDisposables = [];
  }
}

function completionKindFromName(monaco, value) {
  if (typeof value === "number") {
    return value;
  }

  const kindName = String(value || "text").toLowerCase();
  const table = {
    text: monaco.languages.CompletionItemKind.Text,
    method: monaco.languages.CompletionItemKind.Method,
    function: monaco.languages.CompletionItemKind.Function,
    constructor: monaco.languages.CompletionItemKind.Constructor,
    field: monaco.languages.CompletionItemKind.Field,
    variable: monaco.languages.CompletionItemKind.Variable,
    class: monaco.languages.CompletionItemKind.Class,
    interface: monaco.languages.CompletionItemKind.Interface,
    module: monaco.languages.CompletionItemKind.Module,
    property: monaco.languages.CompletionItemKind.Property,
    unit: monaco.languages.CompletionItemKind.Unit,
    value: monaco.languages.CompletionItemKind.Value,
    enum: monaco.languages.CompletionItemKind.Enum,
    keyword: monaco.languages.CompletionItemKind.Keyword,
    snippet: monaco.languages.CompletionItemKind.Snippet,
    color: monaco.languages.CompletionItemKind.Color,
    file: monaco.languages.CompletionItemKind.File,
    reference: monaco.languages.CompletionItemKind.Reference,
    folder: monaco.languages.CompletionItemKind.Folder,
    enummember: monaco.languages.CompletionItemKind.EnumMember,
    constant: monaco.languages.CompletionItemKind.Constant,
    struct: monaco.languages.CompletionItemKind.Struct,
    event: monaco.languages.CompletionItemKind.Event,
    operator: monaco.languages.CompletionItemKind.Operator,
    typeparameter: monaco.languages.CompletionItemKind.TypeParameter
  };

  return table[kindName] || monaco.languages.CompletionItemKind.Text;
}

function toMonacoSuggestion(monaco, model, position, item) {
  const word = model.getWordUntilPosition(position);
  const defaultRange = {
    startLineNumber: position.lineNumber,
    endLineNumber: position.lineNumber,
    startColumn: word.startColumn,
    endColumn: word.endColumn
  };

  const suggestion = {
    label: item.label,
    kind: completionKindFromName(monaco, item.kind),
    detail: item.detail,
    documentation: item.documentation,
    insertText: item.insertText != null ? item.insertText : item.label,
    sortText: item.sortText,
    filterText: item.filterText,
    range: item.range || defaultRange
  };

  if (item.snippet) {
    suggestion.insertTextRules = monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet;
  }

  if (item.command) {
    suggestion.command = item.command;
  }

  return suggestion;
}

function createCustomCompletionBridge(monaco, model, language) {
  const providers = [];

  const disposable = monaco.languages.registerCompletionItemProvider(language, {
    triggerCharacters: [".", "\"", "'", "/", "@", "<", ":"],
    async provideCompletionItems(activeModel, position, context, token) {
      if (activeModel.uri.toString() !== model.uri.toString()) {
        return { suggestions: [] };
      }

      const suggestions = [];

      for (const provider of providers) {
        try {
          const result = await provider.provideCompletionItems({
            monaco,
            model: activeModel,
            position,
            context,
            token,
            language
          });

          const items = Array.isArray(result) ? result : result && Array.isArray(result.suggestions) ? result.suggestions : [];

          items.forEach((item) => {
            if (!item || !item.label) {
              return;
            }
            suggestions.push(toMonacoSuggestion(monaco, activeModel, position, item));
          });
        } catch (error) {
          console.error("CodeTip: 自定义补全提供器执行失败", error);
        }
      }

      return { suggestions };
    }
  });

  return {
    register(provider) {
      providers.push(provider);
      return {
        dispose() {
          const index = providers.indexOf(provider);
          if (index >= 0) {
            providers.splice(index, 1);
          }
        }
      };
    },
    dispose() {
      providers.length = 0;
      disposable.dispose();
    }
  };
}

function normalizeLibEntries(libs) {
  return toArray(libs)
    .filter((item) => item && typeof item.content === "string")
    .map((item, index) => ({
      id: String(item.id || item.filePath || item.name || `lib-${index + 1}`),
      name: item.name || `extra-${index + 1}.d.ts`,
      content: item.content,
      enabled: item.enabled !== false,
      filePath: item.filePath || ""
    }));
}

function toDisposable(monaco, entry, scope, index) {
  const safeName = sanitizeFileName(entry.name, `extra-${index + 1}.d.ts`);
  const filePath = entry.filePath || `file:///code-tip/${scope}/${safeName}`;
  const tsDisposable = monaco.languages.typescript.typescriptDefaults.addExtraLib(entry.content, filePath);
  const jsDisposable = monaco.languages.typescript.javascriptDefaults.addExtraLib(entry.content, filePath);

  return {
    key: entry.id,
    signature: `${filePath}\n${entry.content}`,
    dispose() {
      tsDisposable.dispose();
      jsDisposable.dispose();
    }
  };
}

export { normalizeLanguage };

export function createLanguageService(options) {
  const monaco = options.monaco;
  const language = normalizeLanguage(options.language);
  const model = options.model;

  configureGlobalDefaults(monaco);
  acquireSnippetProviders(monaco);

  const completionBridge = createCustomCompletionBridge(monaco, model, language);
  const scopes = new Map();

  function ensureScope(scope) {
    if (!scopes.has(scope)) {
      scopes.set(scope, {
        declared: [],
        active: new Map()
      });
    }
    return scopes.get(scope);
  }

  function getExtraLibs(scope) {
    const state = ensureScope(scope);
    return state.declared.map((item) => ({ ...item }));
  }

  function setExtraLibs(scope, libs) {
    const state = ensureScope(scope);
    const declared = normalizeLibEntries(libs);

    const nextActive = new Map();
    const usedKeys = new Set();

    declared.forEach((entry, index) => {
      const baseKey = entry.id || `lib-${index + 1}`;
      let key = baseKey;
      let attempt = 1;
      while (usedKeys.has(key)) {
        attempt += 1;
        key = `${baseKey}-${attempt}`;
      }
      usedKeys.add(key);

      if (!entry.enabled || typeof entry.content !== "string") {
        return;
      }

      const existing = state.active.get(key);
      const next = toDisposable(monaco, { ...entry, id: key }, scope, index);

      if (existing && existing.signature === next.signature) {
        next.dispose();
        nextActive.set(key, existing);
      } else {
        if (existing) {
          existing.dispose();
        }
        nextActive.set(key, next);
      }
    });

    state.active.forEach((item, key) => {
      if (!nextActive.has(key)) {
        item.dispose();
      }
    });

    state.active = nextActive;
    state.declared = declared;
  }

  function addExtraLib(lib, scope = "manual") {
    const list = getExtraLibs(scope);
    const id = lib && lib.id ? lib.id : createId("extra-lib");
    list.push({ ...lib, id });
    setExtraLibs(scope, list);

    return {
      dispose() {
        const nextList = getExtraLibs(scope).filter((item) => item.id !== id);
        setExtraLibs(scope, nextList);
      }
    };
  }

  toArray(options.libs).forEach((lib) => {
    addExtraLib(lib, "init");
  });

  function observeDiagnostics(onChange) {
    const emit = () => {
      const markers = monaco.editor.getModelMarkers({ resource: model.uri });
      onChange(markers.map((marker) => markerToProblem(monaco, marker)));
    };

    emit();

    const markerDisposable = monaco.editor.onDidChangeMarkers((resources) => {
      for (const resource of resources) {
        if (resource.toString() === model.uri.toString()) {
          emit();
          break;
        }
      }
    });

    return {
      dispose() {
        markerDisposable.dispose();
      }
    };
  }

  function registerCompletionProvider(provider) {
    if (!provider || typeof provider.provideCompletionItems !== "function") {
      throw new Error("CodeTip: 补全提供器必须实现 provideCompletionItems(context)。");
    }

    return completionBridge.register(provider);
  }

  function dispose() {
    completionBridge.dispose();
    scopes.forEach((state) => {
      state.active.forEach((item) => item.dispose());
      state.active.clear();
      state.declared = [];
    });
    scopes.clear();
    releaseSnippetProviders();
  }

  return {
    language,
    addExtraLib,
    getExtraLibs,
    setExtraLibs,
    observeDiagnostics,
    registerCompletionProvider,
    dispose
  };
}
