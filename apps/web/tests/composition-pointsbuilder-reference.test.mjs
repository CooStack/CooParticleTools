import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const compositionMainUrl = new URL('../public/legacy/assets/composition_builder/js/main.js', import.meta.url);
const previewRuntimeUrl = new URL('../public/legacy/assets/composition_builder/js/preview_runtime_mixin.js', import.meta.url);
const pointsBuilderMainUrl = new URL('../public/legacy/assets/points_builder/js/main.js', import.meta.url);
const storageBootstrapUrl = new URL('../public/legacy/assets/src/js/shared/storage-prefix-bootstrap.js', import.meta.url);
const compositionBootstrapUrl = new URL('../public/legacy/assets/src/js/pages/composition-pointsbuilder-bootstrap.page.js', import.meta.url);

test('Composition PointsBuilder reference keeps the complete current card in the overlay', async () => {
  const source = await readFile(pointsBuilderMainUrl, 'utf8');

  assert.doesNotMatch(source, /COMPOSITION_REFERENCE_SHOW_CURRENT_KEY/);
  assert.doesNotMatch(source, /compositionReferenceShowCurrent/);
  assert.match(source, /const defaultVisible = row\.isCurrentCard \? false : true/);
  assert.match(source, /visible: compositionReferenceOnlyCurrent/);
  assert.match(source, /groups\s*\.filter\(\(group\)\s*=>\s*group\.visible/);
  assert.doesNotMatch(source, /group\.visible\s*&&\s*!group\.isCurrent/);
});

test('Composition PointsBuilder leaves editable points in Builder local coordinates', async () => {
  const source = await readFile(pointsBuilderMainUrl, 'utf8');

  assert.doesNotMatch(source, /applyCurrentCompositionOffset/);
  assert.match(source, /setPoints\(res\.points,\s*res\.previewPoints\s*\|\|\s*\[\]/);
});

test('Composition PointsBuilder imports the shared theme list required during startup', async () => {
  const source = await readFile(pointsBuilderMainUrl, 'utf8');

  assert.match(source, /import \{[^}]*\bALL_THEMES\b[^}]*\} from "\.\.\/\.\.\/shared\/js\/app-theme\.js/);
  assert.match(source, /import \{[^}]*\bAPP_THEME_KEY\b[^}]*\} from "\.\.\/\.\.\/shared\/js\/app-theme\.js/);
  assert.match(source, /import \{[^}]*\bwatchAppTheme\b[^}]*\} from "\.\.\/\.\.\/shared\/js\/app-theme\.js/);
  assert.match(source, /const THEME_ORDER = ALL_THEMES/);
  assert.match(source, /const finalId = normalizeTheme\(id\)/);
  assert.match(source, /watchAppTheme\(\(next\) => applyTheme\(next\)\)/);
});

test('Composition reference snapshots are generated on editor entry only and report sampling', async () => {
  const [compositionSource, previewSource] = await Promise.all([
    readFile(compositionMainUrl, 'utf8'),
    readFile(previewRuntimeUrl, 'utf8')
  ]);

  assert.doesNotMatch(compositionSource, /this\.rebuildPreview\(\{ immediate: true \}\)/);
  assert.match(compositionSource, /进入 PointsBuilder 不强制同步重建 Composition/);
  assert.match(previewSource, /cancelIdleCallback\(pendingHandle\)/);
  assert.match(previewSource, /this\.previewBuildHandle = 0/);
  assert.match(previewSource, /this\.previewBuildRequestId = int\(this\.previewBuildRequestId \|\| 0\) \+ 1/);
  assert.match(previewSource, /this\.previewBuildQueued = false/);
  assert.match(previewSource, /this\.previewBuildInProgress = false/);
  assert.doesNotMatch(previewSource, /scheduleBuilderCompositionReferenceSnapshot/);
  assert.match(compositionSource, /compositionReferenceOverride:\s*null/);
  assert.match(compositionSource, /compositionReferenceStatus:\s*"pending"/);
  assert.match(compositionSource, /visibleMasks/);
  assert.match(compositionSource, /snapshot\.currentCardId/);
  assert.match(compositionSource, /this\.builderCompositionReferencePromise/);
  assert.match(compositionSource, /sampled:\s*sourcePointTotal\s*>\s*basePoints\.length/);
  assert.match(compositionSource, /frameTicks/);
  assert.match(compositionSource, /totalTicks/);
  assert.match(compositionSource, /let gpuReferenceEnabled = this\.previewGpuParticlePathEnabled === true/);
  assert.match(compositionSource, /this\.previewReferenceAllCards = true;[\s\S]*?this\.canUsePreviewGpuParticlePath\?\.\(\) === true/);
  assert.match(compositionSource, /const frameCount = gpuReferenceEnabled \? totalTicks : Math\.min\(15, totalTicks\)/);
  assert.match(compositionSource, /return Math\.round\(index \* \(totalTicks - 1\) \/ \(frameCount - 1\)\)/);
  assert.match(compositionSource, /const progressChunkSize = Math\.max\(8, Math\.ceil\(frameCount \/ 16\)\)/);
  assert.match(compositionSource, /if \(frameIndex > 0\) \{[\s\S]*?setTimeout\(resolve, 16\)/);
  assert.match(compositionSource, /putCompositionReferenceSnapshot/);
  assert.match(compositionSource, /const persistProgress = \(progress\) =>/);
  assert.match(compositionSource, /onProgress: persistProgress/);
  assert.match(compositionSource, /complete: false/);
  assert.match(compositionSource, /storage:\s*"indexeddb"/);
  assert.doesNotMatch(compositionSource, /Math\.min\(16/);
  assert.doesNotMatch(previewSource, /writeBuilderCompositionContext\?\.\(null, "root", \{ includeReference: true \}\)/);
});

test('Composition reference sampling waits for idle preview geometry before reading points', async () => {
  const source = await readFile(compositionMainUrl, 'utf8');

  assert.match(source, /Preview geometry is built during idle time/);
  assert.match(source, /this\.previewBuildInProgress === true/);
  assert.match(source, /this\.previewBuildQueued === true/);
  assert.match(source, /!Array\.isArray\(this\.previewBasePoints\)/);
  assert.match(source, /performance\.now\(\) - waitStartedAt < 5000/);
  assert.match(source, /await new Promise\(\(resolve\) => setTimeout\(resolve, 16\)\)/);
});

test('Composition reference context keeps the cpb storage namespace shared with embedded PointsBuilder', async () => {
  const [compositionSource, storageSource] = await Promise.all([
    readFile(compositionMainUrl, 'utf8'),
    readFile(storageBootstrapUrl, 'utf8')
  ]);

  assert.match(compositionSource, /const CPB_PREFIX = "cpb_"/);
  assert.match(compositionSource, /const CPB_COMP_CONTEXT_KEY = `\$\{CPB_PREFIX\}pb_comp_context_v1`/);
  assert.doesNotMatch(storageSource, /"pb_comp_context_v1"/);
});

test('Composition reference snapshots are invalidated when the sampler contract changes', async () => {
  const [compositionSource, pointsBuilderSource] = await Promise.all([
    readFile(compositionMainUrl, 'utf8'),
    readFile(pointsBuilderMainUrl, 'utf8')
  ]);

  assert.match(compositionSource, /COMPOSITION_REFERENCE_BUILD_VERSION/);
  assert.match(compositionSource, /COMPOSITION_REFERENCE_STORAGE_PREFIX = "composition-reference-v3:"/);
  assert.match(compositionSource, /contextSnapshot\.referenceVersion \|\| ""\) === COMPOSITION_REFERENCE_BUILD_VERSION/);
  assert.match(compositionSource, /snapshot\.referenceVersion \|\| ""\) === COMPOSITION_REFERENCE_BUILD_VERSION/);
  assert.match(pointsBuilderSource, /storedReference\.referenceVersion \|\| ""\) === COMPOSITION_REFERENCE_BUILD_VERSION/);
});

test('Composition reference snapshots are isolated by Composition content revision', async () => {
  const [compositionSource, pointsBuilderSource] = await Promise.all([
    readFile(compositionMainUrl, 'utf8'),
    readFile(pointsBuilderMainUrl, 'utf8')
  ]);

  assert.match(compositionSource, /function compositionReferenceStateRevision\(state\)/);
  assert.match(compositionSource, /compositionReferenceRevision:\s*compositionRevision/);
  assert.match(compositionSource, /COMPOSITION_REFERENCE_STORAGE_PREFIX\}\$\{String\(this\.state\.projectName/);
  assert.match(compositionSource, /String\(contextSnapshot\.compositionRevision \|\| ""\) === compositionRevision/);
  assert.match(pointsBuilderSource, /storedReference\.compositionRevision \|\| ""\) === compositionRevision/);
});

test('Composition reference sampling keeps the editor responsive while navigation proceeds', async () => {
  const source = await readFile(compositionMainUrl, 'utf8');

  assert.match(source, /const shell = globalThis\.cooParticlesShell \|\| globalThis\.parent\?\.cooParticlesShell/);
  assert.match(source, /if \(shell\?\.isElectron === true\) \{[\s\S]*?referenceSampler: "1"[\s\S]*?window\.open\(`\.\/composition_builder\.html\?/);
  assert.match(source, /for \(const key of \["projectId", "projectType", "shellOpen", "shellNew"\]\)/);
  assert.match(source, /typeof window\.__legacyNavigate === "function"/);
  assert.match(source, /window\.__legacyNavigate\(href\)/);
  assert.doesNotMatch(source, /window\.open\(buildEditorHref\(\), "coo-particles-pointsbuilder"\)/);
  assert.match(source, /startCompositionReferenceSamplerFromQuery/);
  assert.match(source, /closeWindow/);
  assert.match(source, /__cooCompositionReferenceSamplerFrame/);
  assert.match(source, /host-level hidden iframe/);
});

test('Composition reference storage fallback cannot reuse a stale snapshot and sampled counts are labeled', async () => {
  const [compositionSource, pointsBuilderSource] = await Promise.all([
    readFile(compositionMainUrl, 'utf8'),
    readFile(pointsBuilderMainUrl, 'utf8')
  ]);

  assert.match(compositionSource, /localStorage\.removeItem\(CPB_COMP_CONTEXT_KEY\)/);
  assert.match(compositionSource, /compositionReference:\s*null,\s*compositionReferenceStatus:\s*"storage_limit"/);
  assert.match(pointsBuilderSource, /compositionReferenceSnapshot\?\.sampled === true/);
  assert.match(pointsBuilderSource, /frameSampled/);
  assert.match(pointsBuilderSource, /decodeCompositionReferenceMask/);
  assert.match(pointsBuilderSource, /\$\{sampled \? "抽样 " : ""\}\$\{group\.pointCount\} 点/);
  assert.match(pointsBuilderSource, /Composition 参考快照过大，未能写入本地存储/);
});

test('Composition reference fallback starts from a real static Tick 0 frame', async () => {
  const source = await readFile(compositionMainUrl, 'utf8');

  assert.match(source, /buildBuilderCompositionReferenceFallbackSnapshot/);
  assert.match(source, /const frame = this\.computePreviewFrame\?\.\(\{/);
  assert.match(source, /elapsedTick:\s*0/);
  assert.match(source, /globalCycleAge:\s*0/);
  assert.match(source, /frameSampled:\s*false/);
  assert.doesNotMatch(source, /const basePoints = Array\.isArray\(this\.previewPoints\)/);
});

test('Composition reference fallback restores live animation runtime state', async () => {
  const source = await readFile(compositionMainUrl, 'utf8');

  assert.match(source, /const liveRuntime = captureRuntime\(\);/);
  assert.match(source, /const sampledRuntime = \{ \.\.\.liveRuntime \};/);
  assert.match(source, /"previewRenderWorkerInitBaselineReady"/);
  assert.match(source, /installRuntime\(sampledRuntime\);/);
  assert.match(source, /finally \{\s*restoreReferenceMode\(\);\s*installRuntime\(liveRuntime\);/);
});

test('Composition reference page owns static frame controls and can isolate the current card', async () => {
  const [htmlSource, cssSource, pointsBuilderSource] = await Promise.all([
    readFile(new URL('../public/legacy/composition_pointsbuilder.html', import.meta.url), 'utf8'),
    readFile(new URL('../public/legacy/assets/points_builder/css/style.css', import.meta.url), 'utf8'),
    readFile(pointsBuilderMainUrl, 'utf8')
  ]);

  assert.match(htmlSource, /id="builderColumnTitleLabel"/);
  assert.match(htmlSource, /id="builderColumnFootnote"/);
  assert.match(pointsBuilderSource, /COMPOSITION_REFERENCE_ONLY_CURRENT_KEY/);
  assert.match(pointsBuilderSource, /data-reference-frame-range/);
  assert.match(pointsBuilderSource, /data-reference-frame-action="prev"/);
  assert.match(pointsBuilderSource, /data-reference-frame-action="next"/);
  assert.match(pointsBuilderSource, /compositionReferenceOnlyCurrent/);
  assert.doesNotMatch(pointsBuilderSource, /data-reference-show-current/);
  assert.doesNotMatch(pointsBuilderSource, /compositionReferenceShowCurrent/);
  assert.match(pointsBuilderSource, /data-reference-eye/);
  assert.match(pointsBuilderSource, /COMPOSITION_REFERENCE_VISIBILITY_KEY = "cpb_composition_reference_visibility_v2"/);
  assert.match(pointsBuilderSource, /COMPOSITION_REFERENCE_OPACITY_KEY/);
  assert.match(pointsBuilderSource, /data-reference-opacity/);
  assert.doesNotMatch(pointsBuilderSource, /function updateCompositionReferenceFrame\(/);
  assert.match(pointsBuilderSource, /compositionReferenceCurrentSourcePoints/);
  assert.match(pointsBuilderSource, /const delta = compositionReferenceGpuMatrixDelta\(/);
  assert.match(pointsBuilderSource, /const currentTargetIsNested = currentTargetPath\.length > 0/);
  assert.match(pointsBuilderSource, /const positionDelta = 1/);
  assert.match(pointsBuilderSource, /const transformVectorDelta = currentTargetIsNested \? 1 : 0/);
  assert.match(pointsBuilderSource, /transformVectorAttr\.array\[offset\] = .*transformVectorDelta/);
  assert.match(cssSource, /\.composition-reference-controls/);
  assert.match(cssSource, /\.composition-page-hidden/);
});

test('Composition reference eye toggles current-card descendants from their hidden default', async () => {
  const source = await readFile(pointsBuilderMainUrl, 'utf8');

  assert.match(source, /const defaultVisible = group\?\.isCurrentCard \? false : true;/);
  assert.doesNotMatch(source, /const defaultVisible = group\?\.isCurrentCard && group\.depth === 0 \? false : true;/);
});

test('Pending Composition references expose the full timeline and do not mutate solo visibility', async () => {
  const [compositionSource, previewSource, pointsBuilderSource] = await Promise.all([
    readFile(compositionMainUrl, 'utf8'),
    readFile(previewRuntimeUrl, 'utf8'),
    readFile(pointsBuilderMainUrl, 'utf8')
  ]);

  assert.match(compositionSource, /const run = async \(\) =>/);
  assert.match(compositionSource, /this\.buildBuilderCompositionReferenceSnapshot\?\./);
  assert.match(compositionSource, /pending\?\.finally\?\.\(\(\) =>/);
  assert.match(previewSource, /this\.previewReferenceAllCards === true/);
  assert.match(compositionSource, /this\.previewReferenceAllCards = true/);
  assert.doesNotMatch(compositionSource, /card\.previewVisible = true;\s*\n\s*card\.previewSolo = false;/);
  assert.match(pointsBuilderSource, /timelineCount/);
  assert.match(pointsBuilderSource, /function getCompositionReferenceTimelineInfo\(snapshot, hydrating = false\)/);
  assert.match(pointsBuilderSource, /Math\.max\(totalTicks, frames\.length\)/);
  assert.doesNotMatch(pointsBuilderSource, /const isHydratingSingleFrame = isVirtualTimeline \|\| \(compositionReferenceHydrating && frames\.length <= 1\)/);
});

test('Composition references preserve nested shape paths for tree grouping and visibility', async () => {
  const [compositionSource, pointsBuilderSource] = await Promise.all([
    readFile(compositionMainUrl, 'utf8'),
    readFile(pointsBuilderMainUrl, 'utf8')
  ]);

  assert.match(compositionSource, /function compositionReferenceNodeId\(cardId, path = \[\]\)/);
  assert.match(compositionSource, /rootCardId = ""/);
  assert.match(compositionSource, /path: nodePath/);
  assert.match(compositionSource, /currentOwnerId: compositionReferenceNodeId/);
  assert.match(compositionSource, /path: nodePath\.slice\(\)/);
  assert.match(compositionSource, /path: nodePath\.slice\(\)/);
  assert.match(pointsBuilderSource, /function compositionReferenceNodeId\(cardId, path = \[\]\)/);
  assert.match(pointsBuilderSource, /data-reference-depth/);
  assert.match(pointsBuilderSource, /isCompositionReferenceDescendant/);
  assert.match(pointsBuilderSource, /compositionReferenceOnlyCurrent/);
});

test('Composition preview keeps nested reference owners aligned with the collapsible tree', async () => {
  const [previewSource, pointsBuilderSource] = await Promise.all([
    readFile(previewRuntimeUrl, 'utf8'),
    readFile(pointsBuilderMainUrl, 'utf8')
  ]);

  assert.match(previewSource, /const referenceOwners = \[\];/);
  assert.match(previewSource, /this\.previewReferenceOwners = referenceOwners/);
  assert.match(previewSource, /tuplePath\.length/);
  assert.match(previewSource, /nodePath: parentPath\.concat\(childIndex\)/);
  assert.match(previewSource, /path: nodePath\.slice\(\)/);
  assert.match(pointsBuilderSource, /data-reference-collapse/);
  assert.match(pointsBuilderSource, /composition-reference-children/);
  assert.match(pointsBuilderSource, /COMPOSITION_REFERENCE_COLLAPSED_KEY = "cpb_composition_reference_collapsed_v2"/);
  assert.match(pointsBuilderSource, /compositionReferenceCollapsed\[id\]/);
  assert.doesNotMatch(pointsBuilderSource, /!String\(snapshot\?\.currentTarget \|\| "root"\)\.startsWith\("tree_node:"\)/);
});

test('Returning from Composition PointsBuilder does not change the card binding mode', async () => {
  const source = await readFile(compositionMainUrl, 'utf8');

  assert.match(source, /Returning from PointsBuilder only transfers the edited point model/);
  assert.match(source, /setCardBuilderState\(card, target, state, \{ activateBinding: false \}\)/);
  assert.match(source, /if \(this\.renderer && this\.pointsGeom\) \{[\s\S]*afterStructureMutate\(\{ rerenderProject: false, rerenderCards: true, rebuildPreview: true \}\)/);
  assert.match(source, /const activateBinding = options\?\.activateBinding !== false/);
  assert.match(source, /if \(activateBinding\) card\.bindMode = "builder"/);
});

test('Composition ignores a stale Builder return instead of applying it to the focused card', async () => {
  const source = await readFile(compositionMainUrl, 'utf8');

  assert.match(source, /const card = this\.getCardById\(cardId\);/);
  assert.match(source, /Never fall back to the focused\/first card/);
  assert.doesNotMatch(source, /const card = this\.getCardById\(cardId\) \|\| this\.getFocusedCard\(\) \|\| this\.state\.cards\[0\]/);
});

test('The hidden Composition reference sampler does not persist project state', async () => {
  const source = await readFile(compositionMainUrl, 'utf8');

  assert.match(source, /this\.referenceSamplerMode = \(\(\) =>/);
  assert.match(source, /if \(this\.referenceSamplerMode\) return;/);
  assert.match(source, /if \(this\.referenceSamplerMode\) \{[\s\S]*?writeBuilderCompositionContext\(\);[\s\S]*?return;/);
});

test('Composition preview assigns source indices for nested non-single nodes', async () => {
  const source = await readFile(compositionMainUrl, 'utf8');

  assert.match(source, /for \(let si = 0; si < src\.length; si\+\+\)/);
  assert.match(source, /const p = src\[si\];/);
  assert.match(source, /newLevels\.push\(\{ vec: U\.clone\(sv\), ref: si/);
});

test('Composition reference frame slider remains interactive while snapshot frames hydrate', async () => {
  const source = await readFile(pointsBuilderMainUrl, 'utf8');

  assert.match(source, /frameRange\?\.addEventListener\("input"/);
  assert.match(source, /frameRange\?\.addEventListener\("change"/);
  assert.match(source, /compositionReferenceHydrating/);
  assert.match(source, /Keep the requested frame while IndexedDB is loading/);
  assert.match(source, /range\.value = String\(compositionReferenceFrameIndex\)/);
  assert.match(source, /compositionReferenceHydrationRetryHandle/);
  assert.match(source, /stored\.complete === false && token === compositionReferenceHydrationToken/);
  assert.match(source, /hydrateCompositionReferenceSnapshot\(storageKey\)/);
  assert.match(source, /compositionReferenceFrameDragging/);
  assert.match(source, /frameRange\?\.addEventListener\("pointerdown"/);
  assert.match(source, /if \(!compositionReferenceFrameDragging\) renderCompositionReferencePanel\(\)/);
});

test('Composition reference sampling does not block on cumulative IndexedDB checkpoints', async () => {
  const source = await readFile(compositionMainUrl, 'utf8');

  assert.match(source, /const persistProgress = \(progress\) =>/);
  assert.match(source, /progressWritePromise/);
  assert.match(source, /pendingProgress/);
  assert.doesNotMatch(source, /const persistProgress = async \(progress\) =>/);
  assert.match(source, /onProgress\(\{/);
  assert.match(source, /progressCheckpointStride/);
  assert.match(source, /while \(progressWritePromise && requestId === this\.builderCompositionReferenceRequestId\)/);
  assert.doesNotMatch(source, /if \(progressWritePromise\) await progressWritePromise;/);
});

test('Composition reference sampler cannot overwrite a newer editor context', async () => {
  const source = await readFile(compositionMainUrl, 'utf8');

  assert.match(source, /const contextStillOwned = \(\) =>/);
  assert.match(source, /if \(contextStillOwned\(\)\) \{[\s\S]*compositionReferenceStatus: "pending"/);
  assert.match(source, /if \(contextStillOwned\(\)\) \{[\s\S]*compositionReferenceStatus: "ready"/);
});

test('Electron PointsBuilder return stays on the main route and preserves the editor context', async () => {
  const [storageSource, compositionBootstrapSource, compositionSource] = await Promise.all([
    readFile(storageBootstrapUrl, 'utf8'),
    readFile(compositionBootstrapUrl, 'utf8'),
    readFile(compositionMainUrl, 'utf8')
  ]);

  assert.match(compositionBootstrapSource, /__PB_EDITOR_CONTEXT/);
  assert.match(storageSource, /shell\?\.isElectron === true && globalThis\.__PB_ELECTRON_CHILD_WINDOW === true/);
  assert.match(compositionSource, /window\.addEventListener\("storage", \(e\) => \{[\s\S]*CPB_RETURN_CARD_KEY[\s\S]*consumeBuilderReturnState\(\)/);
  assert.match(compositionSource, /typeof window\.__legacyNavigate === "function"/);
});

test('PointsBuilder return is bound to the opening card in every return path', async () => {
  const [compositionSource, bootstrapSource, ioSource] = await Promise.all([
    readFile(compositionMainUrl, 'utf8'),
    readFile(compositionBootstrapUrl, 'utf8'),
    readFile(new URL('../public/legacy/assets/points_builder/js/io.js', import.meta.url), 'utf8')
  ]);

  assert.match(compositionSource, /consumeBuilderReturnState\(\{ closeModal: true, pushHistory: true \}\)/);
  assert.match(compositionSource, /const card = this\.getCardById\(cardId\);/);
  assert.match(compositionSource, /String\(context\?\.compositionRevision \|\| ""\) !== String\(expectedRevision\)/);
  assert.match(compositionSource, /compositionRevision,\s*t: String\(Date\.now\(\)\)/);
  assert.match(bootstrapSource, /compositionRevision: String\(params\.get\("compositionRevision"\) \|\| ""\)\.trim\(\)/);
  assert.match(ioSource, /if \(!right\.compositionRevision\) return true;/);
  assert.match(ioSource, /return left\.compositionRevision === right\.compositionRevision;/);
  assert.match(compositionSource, /target: normalizeBuilderTarget\(this\.builderModalTarget \|\| "root"\)/);
  assert.match(compositionSource, /compositionRevision: compositionReferenceStateRevision\(this\.state\)/);
});

test('GPU reference fast path rechecks dynamic transforms after enabling all cards', async () => {
  const source = await readFile(compositionMainUrl, 'utf8');

  assert.match(source, /this\.previewReferenceAllCards = true;\s*this\.configurePreviewGpuParticlePath\?\.\(\);/);
  assert.match(source, /this\.previewRuntimeGlobals = null;[\s\S]*?this\.updatePreviewGpuParticleAnimation\(now\)/);
  assert.match(source, /this\.updatePreviewGpuParticleTransforms\?\.\(elapsedTick, cycleCfg, \{ force: true \}\)/);
  assert.match(source, /this\.updatePreviewGpuParticleVisibility\?\.\(elapsedTick, \{ force: true \}\)/);
  assert.match(source, /GPU particle compositions already have their complete lifecycle/);
});

test('Builder entry publishes a static fallback before lazy sampling', async () => {
  const source = await readFile(compositionMainUrl, 'utf8');

  assert.match(source, /buildBuilderCompositionReferenceFallbackSnapshot\?\.\(card\.id, normalizedTarget\)/);
  assert.match(source, /referenceVersion: COMPOSITION_REFERENCE_BUILD_VERSION/);
  assert.match(source, /compositionReferenceStatus: "pending"/);
});

test('Composition context does not clear a same-target pending reference from another editor tab', async () => {
  const source = await readFile(compositionMainUrl, 'utf8');

  assert.match(source, /preservePendingReference/);
  assert.match(source, /previous\?\.compositionReferenceStatus === "pending"/);
  assert.match(source, /sameReferenceTarget/);
});

test('PointsBuilder renders editable and Composition reference particles through WebGL Points', async () => {
  const source = await readFile(pointsBuilderMainUrl, 'utf8');

  assert.match(source, /new THREE\.Points\(geom, mat\)/);
  assert.match(source, /compositionReferencePointsObj = new THREE\.Points\(geom, mat\)/);
  assert.match(source, /new THREE\.PointsMaterial\(/);
});

test('CPU Composition reference snapshots preserve Composition colors, sizes, and alpha per frame', async () => {
  const [compositionSource, workerSource, pointsBuilderSource] = await Promise.all([
    readFile(compositionMainUrl, 'utf8'),
    readFile(new URL('../public/legacy/assets/composition_builder/js/preview_render_cache_worker.js', import.meta.url), 'utf8'),
    readFile(pointsBuilderMainUrl, 'utf8')
  ]);

  assert.match(workerSource, /colors:\s*copyColorArray\(frame\?\.colors/);
  assert.match(workerSource, /alphas:\s*copyAlphaArray\(frame\?\.alphas/);
  assert.match(compositionSource, /const colors = new Array\(total\)/);
  assert.match(compositionSource, /const sizes = new Array\(total\)/);
  assert.match(compositionSource, /const alphas = new Array\(total\)/);
  assert.match(compositionSource, /colors:\s*workerResult\.colors/);
  assert.match(compositionSource, /alphas:\s*workerResult\.alphas/);
  assert.match(pointsBuilderSource, /compositionReferenceSnapshot\?\.colors\?\./);
  assert.match(pointsBuilderSource, /vertexColors:\s*true/);
  assert.match(pointsBuilderSource, /aReferenceAlpha/);
  assert.doesNotMatch(pointsBuilderSource, /color:\s*0x7ea8b8/);
});

test('Nested Composition growth groups by Composition node rather than leaf CParticle path', async () => {
  const source = await readFile(new URL('../public/legacy/assets/composition_builder/js/preview_runtime_mixin.js', import.meta.url), 'utf8');

  assert.match(source, /levels\.push\(\{\s*node:\s*card,/);
  assert.match(source, /return \{\s*node,\s*scopeLevel:\s*depth,/);
  assert.match(source, /const runtimeNode = runtimeLevels\[levelIndex\]\?\.node \|\| null/);
  assert.match(source, /pointMetas\.findIndex\(\(meta\) => meta\?\.node === runtimeNode\)/);
  assert.match(source, /nested Composition unlocks all of its CParticle children/);
});

test('Nested CParticle leaf alpha participates in Composition reference opacity', async () => {
  const source = await readFile(new URL('../public/legacy/assets/composition_builder/js/preview_runtime_mixin.js', import.meta.url), 'utf8');

  assert.match(source, /const nodeType = String\(node\.type \|\| "single"\)/);
  assert.match(source, /node\.particleBackend === "cparticle"/);
  assert.match(source, /sources\.push\(node\)/);
});

test('GPU Composition references keep static attributes and drive Tick changes through uniforms', async () => {
  const [compositionSource, pointsBuilderSource] = await Promise.all([
    readFile(compositionMainUrl, 'utf8'),
    readFile(pointsBuilderMainUrl, 'utf8')
  ]);

  assert.match(compositionSource, /gpu:\s*\{[\s\S]*attributes,[\s\S]*timeline/);
  assert.match(compositionSource, /frames:\s*\[\]/);
  assert.match(pointsBuilderSource, /snapshot\?\.gpu\?\.enabled === true/);
  assert.match(pointsBuilderSource, /new THREE\.BufferAttribute\((?:array|buffer), itemSize\)/);
  assert.match(pointsBuilderSource, /uReferenceTick/);
  assert.match(pointsBuilderSource, /uReferencePlayTicks/);
  assert.match(pointsBuilderSource, /aReferenceVisible/);
  assert.match(pointsBuilderSource, /positionAttr\.array\[i \* 3\]\s*= \(Number\(basePosition\[i \* 3\]\)/);
  assert.doesNotMatch(pointsBuilderSource, /attribute vec3 aReferenceDelta/);
  assert.match(compositionSource, /playTicks: Math\.max\(1, Math\.trunc\(Number\(cycleCfg\?\.play\) \|\| 1\)\)/);
});

test('GPU Composition reference snapping uses final transformed points without making them selectable', async () => {
  const source = await readFile(pointsBuilderMainUrl, 'utf8');

  assert.match(source, /function ensureCompositionReferencePickObj\(\)/);
  assert.match(source, /updateCompositionReferencePickPoints\(points\)/);
  assert.match(source, /const compositionReferenceSnapTarget = compositionReferencePickObj\?\.visible/);
  assert.match(source, /hit\.object === compositionReferencePointsObj \|\| hit\.object === compositionReferencePickObj/);
  const selectablePicker = source.match(/function pickSelectablePointHitFromEvent\(ev\) \{([\s\S]*?)\n\}/)?.[1] || "";
  assert.doesNotMatch(selectablePicker, /compositionReferencePickObj/);
});

test('Composition reference sampling preserves sequenced root visibility rules', async () => {
  const source = await readFile(compositionMainUrl, 'utf8');

  assert.match(source, /this\.previewReferenceAllCards = true/);
  assert.doesNotMatch(source, /this\.state\.compositionType = "particle";\s*\n\s*this\.previewReferenceAllCards = true/);
  assert.match(source, /contextSnapshot\.complete !== false/);
});

test('PointsBuilder collapse controls use chevrons instead of text arrows', async () => {
  const source = await readFile(new URL('../public/legacy/assets/points_builder/js/cards.js', import.meta.url), 'utf8');

  assert.match(source, /function chevronSvg\(collapsed\)/);
  assert.match(source, /treeToggleBtn\.innerHTML = chevronSvg\(nextCollapsed\)/);
  assert.match(source, /collapseBtn\.innerHTML = chevronSvg\(node\.collapsed\)/);
  assert.doesNotMatch(source, /iconBtn\(node\.collapsed \? "▸" : "▾"/);
  assert.doesNotMatch(source, /iconBtn\(treeCollapsed \? ">" : "⌄"/);
});
