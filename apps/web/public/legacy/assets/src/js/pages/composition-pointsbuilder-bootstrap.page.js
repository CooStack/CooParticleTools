import {
  initStandaloneOrEmbeddedReturn,
  installStoragePrefixPatch,
  setOptionalStorage,
} from "../shared/storage-prefix-bootstrap.js";

window.__PB_STORAGE_PREFIX = "cpb_";

installStoragePrefixPatch({
  prefix: String(window.__PB_STORAGE_PREFIX || ""),
  guardProperty: "__cpbPatched",
  keyPattern: /^pb_/,
  sharedKeys: [
    "pb_settings_v1",
    "pb_presets_v1",
    "pb_preset_groups_v1",
    "pb_kotlin_end_v1",
    "pb_hotkeys_v2",
    "pb_layout_v1",
    "pb_root_filter_v2",
    "pb_theme_v2",
  ],
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
