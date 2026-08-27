import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const mainUrl = new URL('../public/legacy/assets/points_builder/js/main.js', import.meta.url);
const cardsUrl = new URL('../public/legacy/assets/points_builder/js/cards.js', import.meta.url);
const filtersUrl = new URL('../public/legacy/assets/points_builder/js/filters.js', import.meta.url);
const shortcutsUrl = new URL('../public/legacy/assets/points_builder/js/main-shortcuts.js', import.meta.url);

async function source(url) {
  return readFile(url, 'utf8');
}

function functionBody(text, name, nextName) {
  const start = text.indexOf(`function ${name}(`);
  const end = text.indexOf(`function ${nextName}(`, start + 1);
  assert.notEqual(start, -1, `${name} should exist`);
  assert.notEqual(end, -1, `${nextName} should follow ${name}`);
  return text.slice(start, end);
}

test('W Bezier creation captures card and node mutations independently', async () => {
  const text = await source(mainUrl);
  const insertCard = functionBody(text, 'insertEmptyBezierCreateNode', 'appendBezierCreateNode');
  const appendNode = functionBody(text, 'appendBezierCreateNode', 'connectBezierClosure');
  const beginDrag = functionBody(text, 'beginBezierCreateDrag', 'finishBezierCreateDrag');

  assert.ok(insertCard.indexOf('historyCapture("create_bezier_card")') < insertCard.indexOf('list.splice('));
  assert.ok(appendNode.indexOf('historyCapture("add_bezier_node")') < appendNode.indexOf('nodes.push('));
  assert.ok(beginDrag.indexOf('historyCapture("add_bezier_node")') < beginDrag.indexOf('targetNodes.push('));
});

test('W Bezier pen only creates nodes from Ctrl left-click', async () => {
  const text = await source(mainUrl);
  const start = text.indexOf('if (bezierCreateState) {', text.indexOf('function onPointerDown('));
  const end = text.indexOf('// 非拾取模式', start);
  assert.notEqual(start, -1);
  assert.notEqual(end, -1);
  const branch = text.slice(start, end);

  assert.match(branch, /if \(ev\.ctrlKey\)[\s\S]*?beginBezierCreateDrag\(mapped, ev\)/);
  assert.equal((branch.match(/beginBezierCreateDrag\(mapped, ev\)/g) || []).length, 1);
});

test('deleting the final Bezier node removes its card in one history action', async () => {
  const [main, cards] = await Promise.all([source(mainUrl), source(cardsUrl)]);
  const deletion = functionBody(main, 'deleteBezierNodes', 'beginBezierNodeMoveDrag');

  assert.match(deletion, /historyCapture\(reason\)/);
  assert.match(deletion, /const deletingCard = targets\.length >= nodes\.length/);
  assert.match(deletion, /ctx\.parentList\.splice\(ctx\.index, 1\)/);
  assert.doesNotMatch(deletion, /至少需要 1 个节点/);
  assert.match(cards, /deleteBezierNodeAt\(node\.id, index\)/);
  assert.doesNotMatch(cards, /del\.disabled = fixedCount !== null \|\| params\.nodes\.length <= 1/);
});

test('Bezier circle preset nodes use the same editable history path', async () => {
  const [main, cards] = await Promise.all([source(mainUrl), source(cardsUrl)]);
  const append = functionBody(main, 'appendBezierCreateNode', 'connectBezierClosure');
  const deletion = functionBody(main, 'deleteBezierNodes', 'beginBezierNodeMoveDrag');

  assert.doesNotMatch(append, /固定为 4 个节点/);
  assert.doesNotMatch(deletion, /add_bezier_circle_preset/);
  assert.match(cards, /case "add_bezier_circle_preset":[\s\S]*?renderBezierNodeEditors\(body, node\);/);
});

test('Bezier parameter sync diffs node fields and ignores editor-only state', async () => {
  const text = await source(filtersUrl);
  const diff = functionBody(text, 'diffParams', 'applyParamDiff');

  assert.match(diff, /String\(key\)\.startsWith\("__pb_"\)/);
  assert.match(diff, /p\.length === n\.length/);
  assert.match(diff, /walk\(p\[i\], n\[i\], path\.concat\(i\)\)/);
});

test('Bezier guide controls stay renderable after camera zoom', async () => {
  const text = await source(mainUrl);
  const guideObjects = functionBody(text, 'ensureBezierGuideObjects', 'hideBezierGuidePreview');
  const preview = functionBody(text, 'updateBezierGuidePreview', 'pickBezierGuideAnchorFromEvent');

  assert.match(guideObjects, /bezierGuidePointsObj\.frustumCulled = false/);
  assert.match(guideObjects, /bezierGuideAnchorObj\.frustumCulled = false/);
  assert.match(preview, /bezierGuidePointsObj\.geometry\.computeBoundingSphere\(\)/);
});

test('history restore exits the active Bezier pen state', async () => {
  const text = await source(mainUrl);
  const restore = functionBody(text, 'restoreSnapshot', 'historyUndo');
  assert.match(restore, /stopBezierCreate\?\.\(\)/);
});

test('Bezier box selection supports node-level selection across card owners', async () => {
  const text = await source(mainUrl);
  const finish = functionBody(text, 'finishViewBoxSelection', 'scrollCardToTop');
  const collect = functionBody(text, 'collectBezierNodeSelectionsInRect', 'isPreviewSelectableGroupChild');
  const beginMove = functionBody(text, 'beginBezierNodeMoveDrag', 'updateBezierNodeMoveDrag');
  const updateMove = functionBody(text, 'updateBezierNodeMoveDrag', 'finishBezierNodeMoveDrag');

  assert.match(collect, /visit\(state\?\.root\?\.children \|\| \[\]\)/);
  assert.match(finish, /resolveBezierBoxSelectionLevel\(selection\.ownerIds, bezierNodesByOwner\)/);
  assert.match(finish, /setBezierNodeSelections\(bezierNodesByOwner, \{ additive \}\)/);
  assert.match(beginMove, /nodeId: row\.node\.id/);
  assert.match(updateMove, /findNodeContextById\(start\.nodeId\)/);
});

test('W Bezier pen edits handles and leaves blank drags for box selection', async () => {
  const text = await source(mainUrl);
  const start = text.indexOf('if (bezierCreateState) {', text.indexOf('function onPointerDown('));
  const end = text.indexOf('// 非拾取模式', start);
  const branch = text.slice(start, end);

  assert.match(branch, /pickBezierGuideControlFromEvent\(ev\)/);
  assert.match(branch, /beginBezierHandleDrag\(ev, controlHit\.meta, \{ symmetric: !!ev\.altKey \}\)/);
  assert.match(branch, /beginViewBoxPending\(ev\)/);
  assert.ok(branch.indexOf('if (ev.ctrlKey)') < branch.indexOf('pickBezierGuideControlFromEvent(ev)'));
});

test('W Bezier keeps controls visible but arms the sampled curve only with Ctrl', async () => {
  const text = await source(mainUrl);
  assert.equal(
    (text.match(/bezierGuideCurveObj\.visible = !createState \|\| createState\.previewArmed;/g) || []).length,
    2
  );
  assert.match(text, /startBezierCreate\(\)[\s\S]*?updateBezierGuidePreview\(\);/);
});

test('Alt handle drag mirrors the opposite handle and X can lock to the plane normal', async () => {
  const [main, shortcuts] = await Promise.all([source(mainUrl), source(shortcutsUrl)]);
  const handle = functionBody(main, 'setBezierHandleRelative', 'insertBezierCreateNode');
  const worldPoint = functionBody(main, 'getBezierHandleWorldPointByDragState', 'shouldApplyLockPlane');

  assert.match(handle, /options\.symmetric === true/);
  assert.match(handle, /item\[`\$\{opposite\}x`\] = -rel\.x/);
  assert.match(worldPoint, /Array\.isArray\(guide\.nodes\)/);
  assert.match(worldPoint, /dragState\.nodeIndex/);
  assert.match(shortcuts, /isBezierHandleDragActive/);
  assert.match(shortcuts, /isLockPlaneDragActive[\s\S]*?lockPlaneHold/);
});
