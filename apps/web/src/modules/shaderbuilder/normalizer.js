import {
  createShaderLink,
  createShaderParam,
  createShaderPass,
  createShaderProject,
  createShaderTexture
} from './defaults.js';

export function normalizeShaderProject(rawProject = {}) {
  const base = createShaderProject();
  const project = {
    ...base,
    ...rawProject,
    settings: {
      ...base.settings,
      ...(rawProject?.settings || {})
    },
    model: {
      ...base.model,
      ...(rawProject?.model || {}),
      shader: {
        ...base.model.shader,
        ...(rawProject?.model?.shader || {})
      }
    },
    post: {
      ...base.post,
      ...(rawProject?.post || {})
    }
  };
  project.model.shader.params = Array.isArray(rawProject?.model?.shader?.params) && rawProject.model.shader.params.length
    ? rawProject.model.shader.params.map((item) => createShaderParam({ ...item }))
    : base.model.shader.params;
  project.textures = Array.isArray(rawProject?.textures) && rawProject.textures.length
    ? rawProject.textures.map((item) => createShaderTexture({ ...item }))
    : [];
  project.post.nodes = Array.isArray(rawProject?.post?.nodes) && rawProject.post.nodes.length
    ? rawProject.post.nodes.map((item) => createShaderPass({ ...item }))
    : base.post.nodes;
  project.post.links = Array.isArray(rawProject?.post?.links)
    ? rawProject.post.links.map((item) => createShaderLink({ ...item }))
    : [];
  project.schemaVersion = 2;
  return project;
}
