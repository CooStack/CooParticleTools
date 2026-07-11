import { makeId } from '../../utils/id.js';

export function createShaderParam(overrides = {}) {
  return {
    id: makeId('param'),
    name: 'color',
    type: 'vec3',
    value: '0.24,0.74,1.0',
    ...overrides
  };
}

export function createShaderTexture(overrides = {}) {
  return {
    id: makeId('texture'),
    name: 'noise.png',
    type: 'image',
    previewUrl: '',
    ...overrides
  };
}

export function createShaderPass(overrides = {}) {
  return {
    id: makeId('shaderPass'),
    name: 'Bloom',
    fragmentPath: 'core/post/bloom.fsh',
    iterations: 2,
    fragmentSource: 'vec4 effectColor = texture(tDiffuse, screen_uv);\nFragColor = effectColor;',
    ...overrides
  };
}

export function createShaderLink(overrides = {}) {
  return {
    id: makeId('shaderLink'),
    from: '',
    to: '',
    ...overrides
  };
}

export function createShaderProject(overrides = {}) {
  const bloom = createShaderPass();
  return {
    id: '',
    tool: 'shader-builder',
    schemaVersion: 2,
    name: 'ShaderWorkbench',
    description: 'Vue 重写的 Shader Builder 项目',
    settings: {
      realtimeCode: true,
      showGrid: true,
      showAxes: true,
      pointSize: 0.08
    },
    model: {
      primitive: 'sphere',
      shader: {
        vertexPath: 'core/vertex/point.vsh',
        fragmentPath: 'core/fragment/color.fsh',
        vertexSource: 'gl_Position = projMat * viewMat * transMat * vec4(pos, 1.0);',
        fragmentSource: 'FragColor = vec4(color, 1.0);',
        params: [createShaderParam()]
      }
    },
    textures: [createShaderTexture()],
    post: {
      nodes: [bloom],
      links: [createShaderLink({ from: bloom.id, to: bloom.id })]
    },
    ...overrides
  };
}
