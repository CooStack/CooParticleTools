export const POINTS_BUILDER_SCHEMA_VERSION = 2;

export function createRootNode() {
  return {
    id: 'root',
    kind: 'ROOT',
    children: []
  };
}

export function createPointsBuilderSettings() {
  return {
    realtimeCode: true,
    pointSize: 0.07,
    previewAxis: 'xz',
    paramStep: 0.1,
    snapGrid: true,
    snapParticle: true,
    snapPlane: 'XZ',
    mirrorPlane: 'XZ'
  };
}

export function createPointsBuilderBaseProject(tool = 'pointsbuilder') {
  return {
    id: '',
    tool,
    schemaVersion: POINTS_BUILDER_SCHEMA_VERSION,
    name: tool === 'composition-pointsbuilder' ? 'CompositionBuilderPoints' : 'PointsBuilderProject',
    description: 'Vue 重写的高保真 PointsBuilder 项目',
    kotlinEndMode: 'builder',
    settings: createPointsBuilderSettings(),
    state: {
      root: createRootNode(),
      selection: {
        focusedNodeId: ''
      }
    }
  };
}
