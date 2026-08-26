import "../compat/install-legacy-globals.js";
import { installGlassSurface } from "../../../shared/js/glass-surface.js?v=20260825_1";

// Appearance only, and shared with every other tool — see composition-builder.page.js.
installGlassSurface();

const params = new URLSearchParams(window.location.search || "");
if (params.get("pointsBuilderContext") === "generator") {
  await import("./emitter-pointsbuilder-bootstrap.page.js?v=20260801_1");
}

await import("../../../points_builder/js/main.js?v=20260826_10");
