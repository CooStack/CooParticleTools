import { createId } from "./utils.js";
import { normalizeLanguage } from "./languageJsTs.js";

export function createEditorCore(options) {
  const monaco = options.monaco;
  const mount = options.mount;
  const language = normalizeLanguage(options.language);
  const initialCode = typeof options.initialCode === "string" ? options.initialCode : "";
  const fontFamily =
    options.fontFamily ||
    "'Cascadia Mono', 'JetBrains Mono', 'Sarasa Mono SC', 'Noto Sans Mono CJK SC', Consolas, 'Courier New', monospace";

  const modelUri = monaco.Uri.parse(`inmemory://code-tip/${createId("model")}.${language === "typescript" ? "ts" : "js"}`);
  const model = monaco.editor.createModel(initialCode, language, modelUri);

  const editor = monaco.editor.create(mount, {
    model,
    theme: "vs",
    automaticLayout: true,
    fontFamily,
    fontSize: 14,
    lineHeight: 21,
    letterSpacing: 0,
    fontLigatures: false,
    disableMonospaceOptimizations: true,
    minimap: {
      enabled: true
    },
    smoothScrolling: true,
    scrollBeyondLastLine: false,
    tabSize: 2,
    insertSpaces: true,
    detectIndentation: false,
    formatOnType: true,
    formatOnPaste: true,
    suggestOnTriggerCharacters: true,
    quickSuggestions: {
      comments: true,
      strings: true,
      other: true
    },
    parameterHints: {
      enabled: true
    },
    lightbulb: {
      enabled: "on"
    },
    bracketPairColorization: {
      enabled: true
    },
    guides: {
      bracketPairs: true,
      indentation: true
    }
  });

  const disposables = [];

  const remeasureFontAndLayout = () => {
    if (editor.isDisposed()) {
      return;
    }

    try {
      monaco.editor.remeasureFonts();
    } catch (error) {
      // Ignore. Monaco may throw during early startup in some environments.
    }

    editor.layout();
    editor.render(true);
  };

  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(() => {
      remeasureFontAndLayout();
    });
  } else {
    setTimeout(() => {
      remeasureFontAndLayout();
    }, 0);
  }

  if (document.fonts && typeof document.fonts.ready?.then === "function") {
    document.fonts.ready.then(() => {
      remeasureFontAndLayout();
    }).catch(() => {});
  }

  if (document.fonts && typeof document.fonts.addEventListener === "function") {
    const onFontsLoaded = () => {
      remeasureFontAndLayout();
    };

    document.fonts.addEventListener("loadingdone", onFontsLoaded);
    disposables.push({
      dispose() {
        document.fonts.removeEventListener("loadingdone", onFontsLoaded);
      }
    });
  }

  if (typeof options.onChange === "function") {
    disposables.push(
      editor.onDidChangeModelContent((event) => {
        options.onChange(editor.getValue(), event);
      })
    );
  }

  if (typeof options.onBlur === "function") {
    disposables.push(
      editor.onDidBlurEditorWidget(() => {
        options.onBlur(editor.getValue());
      })
    );
  }

  if (typeof options.onFocus === "function") {
    disposables.push(
      editor.onDidFocusEditorWidget(() => {
        options.onFocus();
      })
    );
  }

  if (typeof options.onRunShortcut === "function") {
    editor.addAction({
      id: "code-tip-run-preview",
      label: "CodeTip：运行预览",
      keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter],
      run() {
        options.onRunShortcut(editor.getValue());
      }
    });
  }

  function dispose() {
    disposables.forEach((item) => item.dispose());
    editor.dispose();
    model.dispose();
  }

  return {
    editor,
    model,
    dispose
  };
}
