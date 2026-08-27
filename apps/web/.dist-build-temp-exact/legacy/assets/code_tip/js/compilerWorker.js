const TYPESCRIPT_CDN = "https://cdn.jsdelivr.net/npm/typescript@5.9.3/lib/typescript.js";

let tsReadyPromise = null;

function ensureTypeScript() {
  if (self.ts) {
    return Promise.resolve(self.ts);
  }

  if (tsReadyPromise) {
    return tsReadyPromise;
  }

  tsReadyPromise = new Promise((resolve, reject) => {
    try {
      importScripts(TYPESCRIPT_CDN);
      if (!self.ts) {
        throw new Error("TypeScript global not found after importScripts.");
      }
      resolve(self.ts);
    } catch (error) {
      reject(error);
    }
  });

  return tsReadyPromise;
}

function normalizeCategory(ts, category) {
  if (category === ts.DiagnosticCategory.Error) {
    return "error";
  }
  if (category === ts.DiagnosticCategory.Warning) {
    return "warning";
  }
  if (category === ts.DiagnosticCategory.Suggestion) {
    return "suggestion";
  }
  return "message";
}

function normalizeDiagnostics(ts, diagnostics) {
  return (diagnostics || []).map((diag) => {
    const message = ts.flattenDiagnosticMessageText(diag.messageText, "\n");
    let line = 0;
    let column = 0;
    let endLine = 0;
    let endColumn = 0;

    if (diag.file && typeof diag.start === "number") {
      const start = diag.file.getLineAndCharacterOfPosition(diag.start);
      line = start.line + 1;
      column = start.character + 1;

      const endPos = typeof diag.length === "number" ? diag.start + diag.length : diag.start;
      const end = diag.file.getLineAndCharacterOfPosition(endPos);
      endLine = end.line + 1;
      endColumn = end.character + 1;
    }

    return {
      code: diag.code,
      category: normalizeCategory(ts, diag.category),
      message,
      line,
      column,
      endLine,
      endColumn
    };
  });
}

function createCompilerOptions(ts, language, sourceMap) {
  return {
    target: ts.ScriptTarget.ES2020,
    module: ts.ModuleKind.None,
    strict: true,
    allowJs: true,
    checkJs: language === "javascript",
    noEmitOnError: false,
    esModuleInterop: true,
    sourceMap: sourceMap,
    inlineSources: sourceMap,
    removeComments: false,
    pretty: false
  };
}

async function compile(payload) {
  const ts = await ensureTypeScript();

  const language = payload.language === "typescript" ? "typescript" : "javascript";
  const mode = payload.mode === "bundle" ? "bundle" : "transpile";
  const sourceMap = Boolean(payload.sourceMap);
  const code = String(payload.code || "");
  const fileName = language === "typescript" ? "main.ts" : "main.js";

  const result = ts.transpileModule(code, {
    fileName,
    compilerOptions: createCompilerOptions(ts, language, sourceMap),
    reportDiagnostics: true
  });

  const normalized = normalizeDiagnostics(ts, result.diagnostics || []);
  const errors = normalized.filter((item) => item.category === "error");
  const warnings = normalized.filter((item) => item.category !== "error");

  if (mode === "bundle") {
    warnings.push({
      code: "BUNDLE_FALLBACK",
      category: "warning",
      message: "当前纯静态版本未启用 Bundle，已自动降级为 Transpile 模式。",
      line: 0,
      column: 0,
      endLine: 0,
      endColumn: 0
    });
  }

  return {
    code: typeof result.outputText === "string" ? result.outputText : "",
    errors,
    warnings,
    sourcemap: result.sourceMapText || ""
  };
}

self.onmessage = async (event) => {
  const data = event.data || {};
  if (data.type !== "compile") {
    return;
  }

  const requestId = data.id;

  try {
    const result = await compile(data.payload || {});
    self.postMessage({
      type: "compile:result",
      id: requestId,
      result
    });
  } catch (error) {
    self.postMessage({
      type: "compile:error",
      id: requestId,
      error: {
        message: error && error.message ? error.message : String(error)
      }
    });
  }
};

