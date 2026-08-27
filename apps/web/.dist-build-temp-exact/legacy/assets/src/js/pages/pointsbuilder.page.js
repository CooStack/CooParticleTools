import "../compat/install-legacy-globals.js";

const params = new URLSearchParams(window.location.search || "");
if (params.get("pointsBuilderContext") === "generator") {
  await import("./emitter-pointsbuilder-bootstrap.page.js?v=20260801_1");
}

await import("../../../points_builder/js/main.js?v=20260824_1");
