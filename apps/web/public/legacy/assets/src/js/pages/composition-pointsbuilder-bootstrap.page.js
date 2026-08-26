import {
  initStandaloneOrEmbeddedReturn,
  installStoragePrefixPatch,
  migratePointsBuilderSharedStorage,
  POINTS_BUILDER_SHARED_STORAGE_KEYS,
  setOptionalStorage,
} from "../shared/storage-prefix-bootstrap.js?v=20260825_2";

window.__PB_STORAGE_PREFIX = "cpb_";
try {
  const params = new URLSearchParams(window.location.search || "");
  const rawTarget = String(params.get("target") || "").trim();
  const target = /^tree_node:/.test(rawTarget)
    || /^shape_level:\d+$/.test(rawTarget)
    || rawTarget === "shape"
    || rawTarget === "shape_child"
    || rawTarget === "root"
    ? rawTarget
    : "root";
  window.__PB_EDITOR_CONTEXT = {
    cardId: String(params.get("card") || "").trim(),
    target,
    compositionRevision: String(params.get("compositionRevision") || "").trim()
  };
} catch {
  window.__PB_EDITOR_CONTEXT = null;
}
try {
  const shell = globalThis.cooParticlesShell || globalThis.parent?.cooParticlesShell;
  window.__PB_ELECTRON_CHILD_WINDOW = shell?.isElectron === true
    && String(window.top?.location?.pathname || "").endsWith("/composition-pointsbuilder");
} catch {
  window.__PB_ELECTRON_CHILD_WINDOW = false;
}

migratePointsBuilderSharedStorage({
  prefix: String(window.__PB_STORAGE_PREFIX || ""),
  storage: localStorage,
  sharedKeys: POINTS_BUILDER_SHARED_STORAGE_KEYS,
});

installStoragePrefixPatch({
  prefix: String(window.__PB_STORAGE_PREFIX || ""),
  guardProperty: "__cpbPatched",
  keyPattern: /^pb_/,
  sharedKeys: POINTS_BUILDER_SHARED_STORAGE_KEYS,
});

initStandaloneOrEmbeddedReturn({
  backButtonId: "btnBackComposition",
  messageType: "cpb-builder-return",
  defaultReturnPage: "composition_builder.html",
  queryReturnKey: "return",
  writeStorage(params, storage) {
    const cardId = params.get("card") || "";
    const rawTarget = String(params.get("target") || "").trim();
    const target = /^tree_node:/.test(rawTarget)
      || /^shape_level:\d+$/.test(rawTarget)
      || rawTarget === "shape"
      || rawTarget === "shape_child"
      || rawTarget === "root"
      ? rawTarget
      : "root";

    setOptionalStorage(storage, "cpb_return_card_v1", cardId);
    setOptionalStorage(storage, "cpb_return_target_v1", target);
  },
});
