import "../compat/install-legacy-globals.js";
import { installGlassSurface } from "../../../shared/js/glass-surface.js?v=20260825_1";
import "../../../composition_builder/js/main.js?v=20260825_10";

// Glass blur / frost are device preferences shared with every other tool, and
// the pointer rim light needs one delegated listener per document. Both are
// appearance only, so they are installed here rather than threaded through the
// builder's own main.js.
installGlassSurface();
