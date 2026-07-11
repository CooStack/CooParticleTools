import { normalizeShaderProject } from './normalizer.js';

export function generateShaderKotlin(rawProject) {
  const project = normalizeShaderProject(rawProject);
  const lines = [];
  lines.push(`object ${project.name || 'ShaderWorkbench'} {`);
  lines.push('  fun createModelShader() = modelShader {');
  lines.push(`    primitive = \"${project.model.primitive}\"`);
  lines.push(`    vertexPath = \"${project.model.shader.vertexPath}\"`);
  lines.push(`    fragmentPath = \"${project.model.shader.fragmentPath}\"`);
  project.model.shader.params.forEach((param) => {
    lines.push(`    param(\"${param.name}\", \"${param.type}\", \"${param.value}\")`);
  });
  project.textures.forEach((texture) => {
    lines.push(`    texture(\"${texture.name}\")`);
  });
  lines.push('  }');
  lines.push('');
  lines.push('  fun createPostPipeline() = postPipeline {');
  project.post.nodes.forEach((node) => {
    lines.push(`    pass(\"${node.name}\", \"${node.fragmentPath}\", ${Number(node.iterations || 1)})`);
  });
  project.post.links.forEach((link) => {
    if (!link.from || !link.to) return;
    lines.push(`    link(\"${link.from}\", \"${link.to}\")`);
  });
  lines.push('  }');
  lines.push('');
  lines.push('  fun sources() = mapOf(');
  lines.push(`    \"vertex\" to \"\"\"${project.model.shader.vertexSource}\"\"\",`);
  lines.push(`    \"fragment\" to \"\"\"${project.model.shader.fragmentSource}\"\"\"`);
  lines.push('  )');
  lines.push('}');
  return lines.join('\n');
}
