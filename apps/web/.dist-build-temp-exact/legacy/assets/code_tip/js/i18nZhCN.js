export const zhCN = {
  app: {
    title: "CodeTip 编辑器演示",
    subtitle: "纯静态 HTML/CSS/JS，Monaco + TypeScript Worker，支持 JS/TS 智能提示、问题面板、类型库与类型映射。"
  },
  common: {
    ready: "就绪",
    unknownIssue: "未知问题",
    noProblems: "当前无问题",
    noData: "暂无数据",
    error: "错误",
    warning: "警告",
    info: "信息",
    hint: "提示",
    sourceUnknown: "未知来源"
  },
  editor: {
    languageJavaScript: "JavaScript",
    languageTypeScript: "TypeScript",
    runShortcut: "运行 (Ctrl/Cmd+Enter)",
    clearProblems: "清空问题",
    problemsTitle: "问题",
    statusEditing: "编辑中...",
    statusCompiling: "编译中...",
    statusCompilingManual: "手动编译中...",
    statusCompileFailed: "编译失败",
    statusPreviewUpdated: "预览已更新",
    statusPreviewUpdatedWithWarnings: "预览已更新（含警告）",
    statusProblems: "问题：{errors} 个错误，{warnings} 个警告",
    statusWarnings: "问题：{warnings} 个警告",
    statusReady: "就绪"
  },
  preview: {
    title: "预览",
    consoleTitle: "控制台",
    clearConsole: "清空控制台",
    statusIdle: "空闲",
    statusSandboxReady: "沙箱已就绪",
    statusCompiling: "编译中...",
    statusRunning: "运行中...",
    statusUpdated: "预览已更新",
    statusExecutionFailed: "执行失败",
    statusRuntimeError: "运行时错误",
    statusCompileFailed: "编译失败",
    statusPreviewFailed: "预览失败"
  },
  compiler: {
    sourceCompiler: "编译器",
    sourceRuntime: "运行时",
    bundleFallback: "当前纯静态版本未启用 Bundle，已自动降级为 Transpile 模式。"
  },
  snippets: {
    logLabel: "日志输出",
    logDetail: "输出日志",
    logDoc: "插入 console.log 代码片段",
    fnLabel: "函数模板",
    fnDetail: "函数声明",
    fnDoc: "插入函数声明模板",
    forOfLabel: "for...of 循环",
    forOfDetail: "遍历数组/可迭代对象",
    forOfDoc: "插入 for...of 循环模板",
    ifLabel: "if 条件",
    ifDetail: "条件判断",
    ifDoc: "插入 if 语句模板",
    tryCatchLabel: "异常处理",
    tryCatchDetail: "try/catch",
    tryCatchDoc: "插入 try/catch 模板"
  },
  diagnostics: {
    sourceDiagnostic: "诊断",
    levelLabel: "级别",
    explainPrefix: "说明",
    tsOriginal: "TS 原文"
  },
  typeLibrary: {
    title: "类型库",
    add: "添加类型",
    remove: "删除类型",
    refresh: "刷新类型",
    exportJson: "导出类型",
    importJson: "导入类型",
    empty: "暂无类型声明，点击“添加类型”开始。",
    itemName: "文件名",
    itemEnabled: "启用",
    itemContent: "声明内容 (.d.ts)",
    placeholderName: "例如：my-api.d.ts",
    placeholderContent: "declare function hello(name: string): string;",
    importInvalid: "导入失败：JSON 格式不正确或缺少 libs 数组。",
    storageKey: "code_tip.type_libraries.v1"
  },
  mapping: {
    title: "映射类型",
    add: "新增映射",
    remove: "删除映射",
    exportJson: "导出映射",
    importJson: "导入映射",
    exportDoc: "导出文档",
    exportStub: "导出Kotlin Stub",
    refresh: "刷新映射",
    typeAlias: "简单映射",
    typeTemplate: "模板映射",
    fieldType: "映射类型",
    fieldTs: "TS 表达式",
    fieldKotlin: "Kotlin 表达式",
    fieldDescription: "中文说明",
    placeholderTsAlias: "例如：Vec3",
    placeholderTsTemplate: "例如：List<${T}>",
    placeholderKotlinAlias: "例如：net.minecraft.util.math.Vec3d",
    placeholderKotlinTemplate: "例如：kotlin.collections.List<${T}>",
    placeholderDescription: "例如：MC 风格三维向量",
    importInvalid: "导入失败：JSON 格式不正确或缺少 mappings 数组。",
    storageKey: "code_tip.type_mapping.v1"
  },
  mappingDts: {
    header: "由映射表自动生成，用于编辑器补全提示。",
    descriptionLabel: "说明",
    kotlinLabel: "Kotlin",
    templateHint: "模板映射",
    fallbackAliasValue: "unknown"
  }
};

export function t(path, fallback = "") {
  if (!path) {
    return fallback;
  }

  const segments = String(path).split(".");
  let current = zhCN;

  for (const segment of segments) {
    if (current && Object.prototype.hasOwnProperty.call(current, segment)) {
      current = current[segment];
    } else {
      return fallback || path;
    }
  }

  return typeof current === "string" ? current : fallback || path;
}

export function format(template, params = {}) {
  return String(template || "").replace(/\{(\w+)\}/g, (_, key) => {
    return Object.prototype.hasOwnProperty.call(params, key) ? String(params[key]) : "";
  });
}
