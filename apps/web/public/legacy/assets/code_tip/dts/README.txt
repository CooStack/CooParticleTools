CodeTip（纯静态 JS/TS 智能提示编辑器）

1) 在任意 HTML 中引用

<link rel="stylesheet" href="./assets/code_tip/css/code_tip.css">
<div id="editor"></div>
<div id="preview"></div>
<script type="module">
  import { createCodeTipEditor } from "./assets/code_tip/js/codeTip.js";

  const api = await createCodeTipEditor({
    mount: "#editor",
    previewMount: "#preview",
    language: "typescript", // 或 "javascript"
    initialCode: "console.log('hello')"
  });
</script>

2) 注入自定义 d.ts（补全/悬浮/类型检查）

const api = await createCodeTipEditor({
  mount: "#editor",
  previewMount: "#preview",
  language: "typescript",
  libs: [
    { name: "sample-api.d.ts", content: "declare function magicBolt(target: string): Promise<number>;" }
  ]
});

运行时也可追加：
api.addLib({ name: "extra.d.ts", content: "declare const foo: number;" });

3) blur 自动编译与预览

- 触发：编辑器失焦 -> 300ms 防抖 -> Worker 编译 -> sandbox iframe 执行
- JavaScript：经 TypeScript transpileModule 做语法/检查后运行
- TypeScript：先转 JS 再运行
- 预览面板捕获：
  - console.log / info / warn / error
  - window.onerror
  - unhandledrejection
- 编译错误与运行错误会进入“问题”面板与状态栏

4) 类型库与映射

- `typeLibraryPanel.js`：维护多份 d.ts（新增/删除/启用/重命名/导入导出）
- `typeMappingPanel.js`：维护 TS↔Kotlin 映射，支持导入导出与文档导出
- `mappingToDts.js`：把映射自动生成 `__mapping__.d.ts` 注入编辑器

常用 API：
- api.setTypeLibraries(libs)
- api.setMappingDts(dtsString, "__mapping__.d.ts")
- api.refreshTypeLibraries()

5) CDN 版本

- monaco-editor@0.55.1（AMD loader + vs/editor/editor.main）
- typescript@5.9.3（worker importScripts）
- esbuild-wasm@0.27.3 未启用（bundle 模式会降级 transpile）
