import { t } from "./i18nZhCN.js";

const BUILTIN_GENERIC_TARGET = {
  List: "Array",
  Set: "Set",
  Map: "Map",
  Promise: "Promise",
  Record: "Record"
};

const RESERVED_GLOBAL_NAMES = new Set([
  "Array",
  "Date",
  "Error",
  "Map",
  "Math",
  "Number",
  "Object",
  "Promise",
  "Record",
  "RegExp",
  "Set",
  "String"
]);

function normalizeMappings(mappings) {
  if (!Array.isArray(mappings)) {
    return [];
  }

  return mappings
    .filter((item) => item && typeof item.ts === "string" && typeof item.kotlin === "string")
    .map((item, index) => ({
      id: item.id || `mapping-${index + 1}`,
      type: item.type === "template" ? "template" : "alias",
      ts: item.ts.trim(),
      kotlin: item.kotlin.trim(),
      description: String(item.description || "").trim(),
      enabled: item.enabled !== false
    }));
}

function parseTemplate(tsType) {
  const match = /^([A-Za-z_$][\w$]*)\s*<\s*(.+)\s*>$/.exec(tsType);
  if (!match) {
    return null;
  }

  const typeName = match[1];
  const rawParams = match[2];
  const placeholderMatches = rawParams.match(/\$\{\s*([A-Za-z_$][\w$]*)\s*\}/g) || [];
  const generics = placeholderMatches.map((token) => token.replace(/[^A-Za-z_$0-9]/g, ""));

  if (generics.length === 0) {
    return null;
  }

  return {
    typeName,
    generics
  };
}

function safeTypeName(name, fallback) {
  const cleaned = String(name || "")
    .replace(/[^A-Za-z0-9_$]/g, "_")
    .replace(/^[^A-Za-z_$]+/, "");
  return cleaned || fallback;
}

function toCommentBlock(item) {
  return [
    `/**`,
    ` * TS: ${item.ts}`,
    ` * ${t("mappingDts.kotlinLabel")}: ${item.kotlin}`,
    ` * ${t("mappingDts.descriptionLabel")}: ${item.description || "-"}`,
    ` */`
  ];
}

function renderAlias(item) {
  const typeName = item.ts;

  if (!/^[A-Za-z_$][\w$]*$/.test(typeName)) {
    return [`// 无法生成别名：TS 表达式 \"${item.ts}\" 不是合法标识符`];
  }

  const lines = [...toCommentBlock(item)];

  if (RESERVED_GLOBAL_NAMES.has(typeName)) {
    const aliasName = safeTypeName(`${typeName}_Alias`, "MappedAlias");
    lines.push(`declare namespace TypeMappingAliases {`);
    lines.push(`  type ${aliasName} = ${t("mappingDts.fallbackAliasValue")};`);
    lines.push(`}`);
    return lines;
  }

  lines.push(`type ${typeName} = ${t("mappingDts.fallbackAliasValue")};`);
  return lines;
}

function templateTarget(parsed) {
  const typeName = parsed.typeName;
  const generics = parsed.generics;

  if (typeName === "List") {
    return `${generics[0]}[]`;
  }

  if (typeName === "Map") {
    return `Record<${generics[0]}, ${generics[1] || "unknown"}>`;
  }

  const builtin = BUILTIN_GENERIC_TARGET[typeName];
  if (builtin) {
    return `${builtin}<${generics.join(", ")}>`;
  }

  return t("mappingDts.fallbackAliasValue");
}

function renderTemplate(item) {
  const parsed = parseTemplate(item.ts);

  if (!parsed) {
    return [`// 无法生成模板：TS 表达式 \"${item.ts}\" 不是可识别的模板类型`];
  }

  const typeName = parsed.typeName;
  const genericText = parsed.generics.join(", ");
  const target = templateTarget(parsed);
  const lines = [...toCommentBlock(item)];

  if (RESERVED_GLOBAL_NAMES.has(typeName)) {
    const aliasName = safeTypeName(`${typeName}_Template`, "MappedTemplate");
    lines.push("declare namespace TypeMappingAliases {");
    lines.push(`  type ${aliasName}<${genericText}> = ${target};`);
    lines.push("}");
    return lines;
  }

  lines.push(`type ${typeName}<${genericText}> = ${target};`);
  return lines;
}

export function mappingToDts(mappings) {
  const normalized = normalizeMappings(mappings).filter((item) => item.enabled);

  const lines = [
    `// ${t("mappingDts.header")}`,
    "",
    "declare namespace TypeMappingDocs {"
  ];

  normalized.forEach((item, index) => {
    lines.push("  /**");
    lines.push(`   * TS: ${item.ts}`);
    lines.push(`   * ${t("mappingDts.kotlinLabel")}: ${item.kotlin}`);
    lines.push(`   * ${t("mappingDts.descriptionLabel")}: ${item.description || "-"}`);
    lines.push("   */");
    lines.push(`  type Entry${index + 1} = \"${item.ts}\";`);
    lines.push("");
  });

  lines.push("}");
  lines.push("");

  normalized.forEach((item) => {
    const chunk = item.type === "template" ? renderTemplate(item) : renderAlias(item);
    lines.push(...chunk);
    lines.push("");
  });

  return lines.join("\n").trim() + "\n";
}

export function mappingToMarkdown(mappings) {
  const normalized = normalizeMappings(mappings);

  const lines = [
    "# Kotlin / TypeScript 映射说明",
    "",
    "| 启用 | 类型 | TS | Kotlin | 说明 |",
    "| --- | --- | --- | --- | --- |"
  ];

  normalized.forEach((item) => {
    lines.push(
      `| ${item.enabled ? "是" : "否"} | ${item.type === "template" ? t("mapping.typeTemplate") : t("mapping.typeAlias")} | \`${item.ts}\` | \`${item.kotlin}\` | ${item.description || "-"} |`
    );
  });

  if (normalized.length === 0) {
    lines.push("| - | - | - | - | 暂无映射 | ");
  }

  lines.push("");
  return lines.join("\n");
}

export function mappingToKotlinStub(mappings) {
  const normalized = normalizeMappings(mappings);

  const lines = [
    "// 自动生成的 Kotlin 映射骨架（示例）",
    "package code.tip.mapping",
    "",
    "object TypeMappingRegistry {"
  ];

  normalized.forEach((item, index) => {
    lines.push(`    // ${index + 1}. ${item.description || "无说明"}`);
    lines.push(`    // TS: ${item.ts}`);
    lines.push(`    // Kotlin: ${item.kotlin}`);
    lines.push(`    val mapping${index + 1}: Pair<String, String> = \"${item.ts}\" to \"${item.kotlin}\"`);
    lines.push("");
  });

  if (normalized.length === 0) {
    lines.push("    // 暂无映射");
  }

  lines.push("}");
  lines.push("");

  return lines.join("\n");
}
