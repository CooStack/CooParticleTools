import { createCodeTipEditor } from "../../../code_tip/js/codeTip.js";
import { createTypeLibraryPanel } from "../../../code_tip/js/typeLibraryPanel.js";
import { createTypeMappingPanel } from "../../../code_tip/js/typeMappingPanel.js";

    const initialCode = `type DemoReport = {
  target: string;
  score: number;
  stamp: string;
};

async function runDemo() {
  const score = await magicBolt("aurora-core", { retries: 2 });
  const report: DemoReport = {
    target: "aurora-core",
    score,
    stamp: toolkit.nowISO()
  };

  console.log("report", report);
  console.log("sum", toolkit.sum(report.score, 12));
}

runDemo();`;

    const editorApi = await createCodeTipEditor({
      mount: "#editor",
      previewMount: "#preview",
      language: "typescript",
      initialCode,
      libs: []
    });

    editorApi.registerCompletionProvider({
      provideCompletionItems() {
        return [
          {
            label: "向量示例",
            kind: "snippet",
            detail: "插入 Vec3 示例对象",
            documentation: "用于快速验证映射类型提示",
            insertText: "const vec: Vec3 = { x: 0, y: 0, z: 0 };",
            snippet: false
          }
        ];
      }
    });

    const typeLibraryPanel = createTypeLibraryPanel({
      mount: "#type-library",
      onChange(libs) {
        editorApi.setTypeLibraries(libs);
      }
    });

    const typeMappingPanel = createTypeMappingPanel({
      mount: "#type-mapping",
      initialMappings: [
        {
          id: "default-vec3",
          type: "alias",
          ts: "Vec3",
          kotlin: "net.minecraft.util.math.Vec3d",
          description: "MC-like 三维向量",
          enabled: true
        },
        {
          id: "default-list",
          type: "template",
          ts: "List<${T}>",
          kotlin: "kotlin.collections.List<${T}>",
          description: "Kotlin List 对应 TS 数组语义",
          enabled: true
        },
        {
          id: "default-record",
          type: "template",
          ts: "Record<${K}, ${V}>",
          kotlin: "kotlin.collections.Map<${K}, ${V}>",
          description: "Kotlin Map 映射到 TS Record",
          enabled: true
        }
      ],
      onChange(payload) {
        editorApi.setMappingDts(payload.dts, "__mapping__.d.ts");
      }
    });

    window.codeTipDemo = {
      editorApi,
      typeLibraryPanel,
      typeMappingPanel
    };
