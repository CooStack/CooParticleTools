import {
  initStandaloneOrEmbeddedReturn,
  installStoragePrefixPatch,
  migratePointsBuilderSharedStorage,
  POINTS_BUILDER_SHARED_STORAGE_KEYS,
  setOptionalStorage,
} from "../shared/storage-prefix-bootstrap.js?v=20260801_1";

window.__PB_STORAGE_PREFIX = "egpb_";
document.body.classList.add("emitter-no-kotlin");

migratePointsBuilderSharedStorage({
  prefix: String(window.__PB_STORAGE_PREFIX || ""),
  storage: localStorage,
  sharedKeys: POINTS_BUILDER_SHARED_STORAGE_KEYS,
});

installStoragePrefixPatch({
  prefix: String(window.__PB_STORAGE_PREFIX || ""),
  guardProperty: "__egpbPatched",
  keyPattern: /^pb_/,
  sharedKeys: POINTS_BUILDER_SHARED_STORAGE_KEYS,
});

const homeButton = document.getElementById("btnPointsBuilderHome");
const backButton = document.getElementById("btnPointsBuilderEmitterReturn");
if (homeButton) homeButton.style.display = "none";
if (backButton) backButton.style.display = "";

initStandaloneOrEmbeddedReturn({
  backButtonId: "btnPointsBuilderEmitterReturn",
  messageType: "egpb-builder-return",
  defaultReturnPage: "generator.html",
  queryReturnKey: "return",
  hideKotlin: false,
  writeStorage(params, storage) {
    const emitterId = params.get("emitterId") || params.get("emit") || "";
    setOptionalStorage(storage, "egpb_return_emitter_v1", emitterId);
  },
});
