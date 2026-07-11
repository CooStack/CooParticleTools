import { installUtilsGlobal } from "./utils-global.js";
import { installCodeHighlighterGlobal } from "./codehighlighter-global.js";

export function installLegacyGlobals() {
  const Utils = installUtilsGlobal();
  const CodeHighlighter = installCodeHighlighterGlobal();
  return { Utils, CodeHighlighter };
}

installLegacyGlobals();
