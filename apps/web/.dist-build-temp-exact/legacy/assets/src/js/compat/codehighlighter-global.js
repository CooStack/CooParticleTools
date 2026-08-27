import "./legacy-codehighlight.global.js";

export function installCodeHighlighterGlobal() {
  const highlighter = globalThis.CodeHighlighter || globalThis.window?.CodeHighlighter;
  if (!highlighter) {
    throw new Error("CodeHighlighter global is not available after compat installation");
  }
  return highlighter;
}
