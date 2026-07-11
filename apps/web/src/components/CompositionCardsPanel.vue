<template>
  <div>
    <div class="panel-title card-title-row">
      <span>卡片</span>
      <div class="card-title-row-actions">
        <button class="btn small" title="折叠所有卡片" @click="$emit('collapse-all')">折叠所有</button>
        <button class="btn small" title="展开所有卡片" @click="$emit('expand-all')">展开所有</button>
        <button class="btn small primary" @click="$emit('add-card')">添加</button>
      </div>
    </div>

    <div class="cards">
      <article
        v-for="(card, cardIndex) in project.cards"
        :key="card.id"
        class="card"
        :class="{ selected: card.id === selectedCardId, folded: isCollapsed(card.id) }"
        @click="$emit('set-selected', card.id)"
      >
        <div class="card-head">
          <div class="card-head-left">
            <button class="iconbtn card-fold" @click.stop="$emit('toggle-card', card.id)">{{ isCollapsed(card.id) ? '▸' : '▾' }}</button>
            <input v-model="card.name" class="input card-name-input" type="text" placeholder="卡片名称" @click.stop />
          </div>
          <div class="card-head-actions">
            <button class="btn small" title="折叠全部分区" @click.stop="setAllSectionsCollapsed(card, true)">折叠所有</button>
            <button class="btn small" title="展开全部分区" @click.stop="setAllSectionsCollapsed(card, false)">展开所有</button>
            <button class="iconbtn" :disabled="cardIndex === 0" title="上移" @click.stop="$emit('move-card-up', card.id)">↑</button>
            <button class="iconbtn" :disabled="cardIndex === project.cards.length - 1" title="下移" @click.stop="$emit('move-card-down', card.id)">↓</button>
            <button class="iconbtn" title="复制" @click.stop="$emit('clone-card', card.id)">⧉</button>
            <button class="iconbtn" title="删除" @click.stop="$emit('remove-card', card.id)">🗑</button>
          </div>
        </div>

        <div v-if="!isCollapsed(card.id)" class="card-body">
          <div class="subgroup" data-section-key="base">
            <div class="subgroup-title">基础</div>
            <template v-if="!isSectionCollapsed(card, 'base')">
            <div class="grid2">
              <label class="field">
                <span>绑定方式</span>
                <select v-model="card.bindMode" class="input">
                  <option value="builder">PointsBuilder</option>
                  <option value="point">Point</option>
                </select>
              </label>
              <label class="field">
                <span>点类型</span>
                <select v-model="card.dataType" class="input">
                  <option v-for="item in dataTypes" :key="item.id" :value="item.id">{{ item.label }}</option>
                </select>
              </label>
              <label v-if="card.dataType === 'single'" class="field">
                <span>Effect</span>
                <select v-model="card.singleEffectClass" class="input" @change="syncSingleEffect(card)">
                  <option v-for="item in effectOptions" :key="item" :value="item">{{ item }}</option>
                </select>
              </label>
              <label v-if="card.dataType === 'single'" class="field">
                <span>Texture Preview</span>
                <span class="chk"><input v-model="card.singleUseTexture" type="checkbox" />Use Texture</span>
              </label>
            </div>
            <div class="grid2 compact-grid">
              <label class="field">
                <span>目标预设</span>
                <select v-model="card.targetPreset" class="input">
                  <option v-for="preset in relativeTargetPresets" :key="preset.expr" :value="preset.expr">{{ preset.label }}</option>
                </select>
              </label>
              <label class="field">
                <span>目标输入</span>
                <input v-model="card.targetPreset" class="input mono" type="text" />
              </label>
              <label class="field">
                <span>延迟</span>
                <input v-model.number="card.delay" class="input" type="number" step="1" />
              </label>
              <label class="field">
                <span>持续</span>
                <input v-model.number="card.duration" class="input" type="number" step="1" min="1" />
              </label>
              <label class="field">
                <span>分组</span>
                <input v-model="card.group" class="input" type="text" />
              </label>
              <div class="field-inline right">
                <label class="chk">
                  <input v-model="card.visible" type="checkbox" />
                  <span>启用</span>
                </label>
              </div>
            </div>
            </template>
          </div>

          <div class="subgroup" data-section-key="source">
            <div class="subgroup-title">{{ card.bindMode === 'builder' ? 'PointsBuilder' : 'Point' }}</div>
            <template v-if="!isSectionCollapsed(card, 'source')">
            <div v-if="card.bindMode === 'point'" class="kv-list">
              <div class="kv-row display-row">
                <div class="grid3">
                  <label class="field">
                    <span>X</span>
                    <input v-model.number="card.point.x" class="input" type="number" step="0.1" />
                  </label>
                  <label class="field">
                    <span>Y</span>
                    <input v-model.number="card.point.y" class="input" type="number" step="0.1" />
                  </label>
                  <label class="field">
                    <span>Z</span>
                    <input v-model.number="card.point.z" class="input" type="number" step="0.1" />
                  </label>
                </div>
              </div>
            </div>
            <div v-else class="kv-list">
              <div class="kv-row display-row">
                <div class="builder-actions">
                  <button class="btn small primary" @click.stop="$emit('open-builder', card)">编辑 Builder</button>
                  <button class="btn small" @click.stop="openBuilderImportDialog(card.id)">导入 JSON</button>
                  <button class="btn small" @click.stop="exportBuilderJson(card)">导出 JSON</button>
                  <button class="btn small" @click.stop="clearBuilder(card)">清空</button>
                  <input :ref="(element) => setBuilderImportInputRef(card.id, element)" type="file" accept="application/json" hidden @change="handleBuilderImportFileChange(card, $event)" />
                </div>
              </div>
              <div class="kv-row display-row">
                <div class="builder-meta">节点 {{ builderNodeCount(card) }} / 预览点 {{ builderPointCount(card) }}</div>
              </div>
            </div>
            </template>
          </div>

          <template v-if="card.dataType === 'single'">
            <div class="subgroup" data-section-key="single_particle_init">
              <div class="subgroup-title">Single: Particle Init</div>
              <template v-if="!isSectionCollapsed(card, 'single_particle_init')">
              <div class="list-tools">
                <button class="btn small primary" @click.stop="addParticleInit(card)">添加 init</button>
              </div>
              <div class="kv-list">
                <div v-if="!card.particleInit.length" class="mini-note">暂无 Particle Init。</div>
                <div v-for="(item, index) in card.particleInit" :key="item.id || index" class="kv-row grid-pinit">
                  <select v-model="item.target" class="input" @change="normalizeParticleInitExpr(item)">
                    <option v-for="target in particleInitTargets" :key="target" :value="target">{{ target }}</option>
                  </select>
                  <input v-model="item.expr" class="input mono" type="text" :placeholder="particleInitPlaceholder(item.target)" @blur="normalizeParticleInitExpr(item)" />
                  <button class="btn small" @click.stop="removeParticleInit(card, item.id)">删除</button>
                  <div v-if="isDirectColorParticleInit(item)" class="vector-inputs inline-vector-inputs particle-color-editor">
                    <div class="vector-ctor-label">Vector3f</div>
                    <input class="input" type="number" min="0" max="1" step="0.01" :value="particleInitVectorParts(item).x" @input="updateParticleInitVector(item, 'x', $event.target.value)" />
                    <input class="input" type="number" min="0" max="1" step="0.01" :value="particleInitVectorParts(item).y" @input="updateParticleInitVector(item, 'y', $event.target.value)" />
                    <input class="input" type="number" min="0" max="1" step="0.01" :value="particleInitVectorParts(item).z" @input="updateParticleInitVector(item, 'z', $event.target.value)" />
                    <input class="input vector-color" type="color" :value="particleInitColorHex(item)" title="打开调色板" @input="updateParticleInitColor(item, $event.target.value)" />
                  </div>
                </div>
              </div>
              </template>
            </div>

            <div class="subgroup" data-section-key="single_controller_init">
              <div class="subgroup-title">Single: Controller Init</div>
              <template v-if="!isSectionCollapsed(card, 'single_controller_init')">
              <div class="list-tools">
                <button class="btn small primary" @click.stop="addControllerVar(card)">添加局部变量</button>
                <button class="btn small primary" @click.stop="addControllerAction(card)">添加 tick action</button>
              </div>

              <div class="kv-list">
                <div v-if="!card.controllerVars.length" class="mini-note">暂无局部变量。</div>
                <div v-for="(item, index) in card.controllerVars" :key="item.id || index" class="kv-row grid-var">
                  <div class="grid2">
                    <input v-model="item.name" class="input" type="text" placeholder="name" />
                    <select v-model="item.type" class="input">
                      <option v-for="type in controllerVarTypes" :key="type" :value="type">{{ type }}</option>
                    </select>
                  </div>
                  <input v-model="item.expr" class="input mono" type="text" placeholder="初始值" />
                  <div class="row-actions">
                    <button class="btn small" @click.stop="removeControllerVar(card, item.id)">删除</button>
                  </div>
                </div>
              </div>

              <div class="kv-list">
                <div v-if="!card.controllerActions.length" class="mini-note">暂无 tick action。</div>
                <div v-for="(item, index) in card.controllerActions" :key="item.id || index" class="kv-row display-row">
                  <div class="grid2">
                    <select v-model="item.type" class="input">
                      <option v-for="type in controllerActionTypes" :key="type.id" :value="type.id">{{ type.title }}</option>
                    </select>
                    <div class="row-actions">
                      <button class="btn small" @click.stop="removeControllerAction(card, item.id)">删除</button>
                    </div>
                  </div>
                  <textarea v-model="item.script" class="input script-area" placeholder="if (...) { ... }
addSingle() / addMultiple(2)"></textarea>
                </div>
              </div>
              </template>
            </div>
          </template>

          <template v-else>
            <div class="subgroup subgroup-tight" data-section-key="shape_child_params">
              <div class="subgroup-title">形状树</div>
              <div class="tree-breadcrumb">
                <button v-if="activeShapeNode(card)" class="crumb clickable" @click.stop="navigateShapeBreadcrumb(card, -1)">根</button>
                <span v-else class="crumb active">根</span>
                <template v-for="(crumb, index) in shapeBreadcrumb(card)" :key="`${card.id}_${index}`">
                  <span class="crumb-sep">&gt;</span>
                  <button v-if="index < shapeBreadcrumb(card).length - 1" class="crumb clickable" @click.stop="navigateShapeBreadcrumb(card, index)">{{ crumb }}</button>
                  <span v-else class="crumb active">{{ crumb }}</span>
                </template>
              </div>

              <template v-if="activeShapeNode(card)">
                <div class="kv-row display-row">
                  <div class="grid2">
                    <label class="field">
                      <span>子节点类型</span>
                      <select v-model="activeShapeNode(card).type" class="input" @change="handleTreeNodeTypeChange(activeShapeNode(card))">
                        <option v-for="item in dataTypes" :key="item.id" :value="item.id">{{ item.label }}</option>
                      </select>
                    </label>
                    <label class="field">
                      <span>名称</span>
                      <input v-model="activeShapeNode(card).name" class="input" type="text" placeholder="子节点名称" />
                    </label>
                  </div>
                </div>

                <div class="kv-row display-row">
                  <div class="mini-note">子点来源</div>
                  <div class="grid2">
                    <label class="field">
                      <span>绑定选项</span>
                      <select v-model="activeShapeNode(card).bindMode" class="input">
                        <option value="point">point</option>
                        <option value="builder">PointsBuilder</option>
                      </select>
                    </label>
                  </div>
                  <div v-if="activeShapeNode(card).bindMode === 'point'" class="grid3">
                    <label class="field">
                      <span>X</span>
                      <input v-model.number="activeShapeNode(card).point.x" class="input" type="number" step="0.1" />
                    </label>
                    <label class="field">
                      <span>Y</span>
                      <input v-model.number="activeShapeNode(card).point.y" class="input" type="number" step="0.1" />
                    </label>
                    <label class="field">
                      <span>Z</span>
                      <input v-model.number="activeShapeNode(card).point.z" class="input" type="number" step="0.1" />
                    </label>
                  </div>
                  <div v-else class="kv-list">
                    <div class="kv-row display-row">
                      <div class="builder-actions">
                        <button class="btn small primary" @click.stop="$emit('open-node-builder', { card, node: activeShapeNode(card), treePath: [...(card.viewPath || [])] })">编辑 Builder</button>
                        <button class="btn small" @click.stop="$emit('pull-node-builder', { card, node: activeShapeNode(card), treePath: [...(card.viewPath || [])] })">拉取最新草稿</button>
                      </div>
                    </div>
                    <div class="kv-row display-row">
                      <div class="builder-meta">节点 {{ builderNodeCount(activeShapeNode(card)) }}</div>
                    </div>
                  </div>
                </div>

                <div v-if="activeShapeNode(card).type === 'single'" class="kv-row display-row">
                  <div class="grid2">
                    <label class="field">
                      <span>Effect</span>
                      <select v-model="activeShapeNode(card).effectClass" class="input">
                        <option v-for="item in effectOptions" :key="item" :value="item">{{ item }}</option>
                      </select>
                    </label>
                    <label class="field">
                      <span>Texture Preview</span>
                      <span class="chk"><input v-model="activeShapeNode(card).useTexture" type="checkbox" />Use Texture</span>
                    </label>
                  </div>
                </div>

                <div class="kv-row display-row">
                  <div class="mini-note">Axis</div>
                  <div class="grid2">
                    <label class="field">
                      <span>axis 预设</span>
                      <select v-model="activeShapeNode(card).axisPreset" class="input" @change="activeShapeNode(card).axisExpr = activeShapeNode(card).axisPreset">
                        <option v-for="preset in relativeTargetPresets" :key="preset.expr" :value="preset.expr">{{ preset.label }}</option>
                      </select>
                    </label>
                    <label class="field">
                      <span>axis 输入</span>
                      <input v-model="activeShapeNode(card).axisExpr" class="input mono" type="text" placeholder="axis 表达式" />
                    </label>
                  </div>
                  <div class="grid5 vector-inputs">
                    <select v-model="activeShapeNode(card).axisManualCtor" class="input vector-ctor">
                      <option value="Vec3">Vec3</option>
                      <option value="RelativeLocation">RelativeLocation</option>
                      <option value="Vector3f">Vector3f</option>
                    </select>
                    <input v-model.number="activeShapeNode(card).axisManualX" class="input" type="number" step="0.1" placeholder="0" />
                    <input v-model.number="activeShapeNode(card).axisManualY" class="input" type="number" step="0.1" placeholder="1" />
                    <input v-model.number="activeShapeNode(card).axisManualZ" class="input" type="number" step="0.1" placeholder="0" />
                    <button class="btn small primary" @click.stop="applyTreeNodeAxisManual(activeShapeNode(card))">套用手动输入</button>
                  </div>
                </div>

                <div class="kv-row display-row">
                  <div class="mini-note">Display 行为</div>
                  <div class="list-tools">
                    <button class="btn small primary" @click.stop="addTreeNodeDisplayAction(activeShapeNode(card))">添加 display action</button>
                  </div>
                  <div class="kv-list">
                    <div v-if="!activeShapeNode(card).displayActions.length" class="mini-note">暂无节点级显示动作。</div>
                    <div v-for="(action, actionIndex) in activeShapeNode(card).displayActions" :key="action.id || actionIndex" class="kv-row display-row">
                      <div class="grid2">
                        <select v-model="action.type" class="input">
                          <option v-for="item in displayActionTypes" :key="item.id" :value="item.id">{{ item.label }}</option>
                        </select>
                        <div class="row-actions">
                          <button class="btn small" @click.stop="removeTreeNodeDisplayAction(activeShapeNode(card), action.id)">删除</button>
                        </div>
                      </div>

                      <template v-if="action.type !== 'rotateAsAxis'">
                        <div class="grid-action">
                          <select v-model="action.toPreset" class="input" @change="syncTreeNodeDisplayPreset(action)">
                            <option v-for="preset in relativeTargetPresets" :key="preset.expr" :value="preset.expr">{{ preset.label }}</option>
                          </select>
                          <input v-model="action.toExpr" class="input mono" type="text" placeholder="to 表达式" />
                          <div class="mini-note">目标方向 / 目标点</div>
                          <div></div>
                        </div>
                        <div class="grid5 vector-inputs">
                          <select v-model="action.toManualCtor" class="input vector-ctor">
                            <option value="Vec3">Vec3</option>
                            <option value="RelativeLocation">RelativeLocation</option>
                            <option value="Vector3f">Vector3f</option>
                          </select>
                          <input v-model.number="action.toManualX" class="input" type="number" step="0.1" placeholder="0" />
                          <input v-model.number="action.toManualY" class="input" type="number" step="0.1" placeholder="1" />
                          <input v-model.number="action.toManualZ" class="input" type="number" step="0.1" placeholder="0" />
                          <button class="btn small primary" @click.stop="applyTreeNodeDisplayManual(action)">套用手动输入</button>
                        </div>
                      </template>

                      <div class="angle-control">
                        <div class="angle-control-main">
                          <select v-model="action.angleMode" class="input action-mode-select">
                            <option value="numeric">角度输入</option>
                            <option value="expr">表达式</option>
                          </select>
                          <template v-if="action.angleMode === 'numeric'">
                            <input v-model.number="action.angleValue" class="input angle-value" type="number" step="0.01" />
                            <select v-model="action.angleUnit" class="input angle-unit">
                              <option value="deg">度</option>
                              <option value="rad">弧度</option>
                            </select>
                          </template>
                        </div>
                        <template v-if="action.angleMode === 'expr'">
                          <div class="grid2">
                            <select v-model="action.angleExprPreset" class="input" @change="action.angleExpr = action.angleExprPreset">
                              <option v-for="preset in anglePresets" :key="preset" :value="preset">{{ preset }}</option>
                            </select>
                            <input v-model="action.angleExpr" class="input mono" type="text" placeholder="角度表达式" />
                          </div>
                        </template>
                      </div>

                      <label class="field editor-field">
                        <span>表达式脚本</span>
                        <textarea v-model="action.expression" class="input" placeholder="可选：附加显示动作表达式"></textarea>
                      </label>
                    </div>
                  </div>
                </div>

                <div class="kv-row display-row">
                  <div class="mini-note">相对角度偏移（可选）</div>
                  <div class="grid3">
                    <div class="field">
                      <span>启用</span>
                      <label class="chk">
                        <input v-model="activeShapeNode(card).angleOffset.enabled" type="checkbox" />
                        <span>开启相对角度偏移</span>
                      </label>
                    </div>
                    <label class="field">
                      <span>偏移个数</span>
                      <input v-model.number="activeShapeNode(card).angleOffset.count" class="input" type="number" min="1" step="1" />
                    </label>
                    <label class="field">
                      <span>glowingTick</span>
                      <input v-model.number="activeShapeNode(card).angleOffset.glowTick" class="input" type="number" min="1" step="1" />
                    </label>
                  </div>
                  <div class="grid3">
                    <label class="field">
                      <span>缓动</span>
                      <select v-model="activeShapeNode(card).angleOffset.ease" class="input">
                        <option v-for="item in angleOffsetEaseOptions" :key="item.id" :value="item.id">{{ item.title }}</option>
                      </select>
                    </label>
                    <div class="field">
                      <span>消散时反向收回</span>
                      <label class="chk">
                        <input v-model="activeShapeNode(card).angleOffset.reverseOnDisable" type="checkbox" />
                        <span>启用</span>
                      </label>
                    </div>
                    <label class="field">
                      <span>总角度模式</span>
                      <select v-model="activeShapeNode(card).angleOffset.angleMode" class="input">
                        <option value="numeric">角度输入</option>
                        <option value="expr">表达式</option>
                      </select>
                    </label>
                  </div>
                  <template v-if="activeShapeNode(card).angleOffset.angleMode === 'expr'">
                    <div class="grid2">
                      <label class="field">
                        <span>总角度预设</span>
                        <select v-model="activeShapeNode(card).angleOffset.angleExprPreset" class="input" @change="activeShapeNode(card).angleOffset.angleExpr = activeShapeNode(card).angleOffset.angleExprPreset">
                          <option v-for="preset in anglePresets" :key="preset" :value="preset">{{ preset }}</option>
                        </select>
                      </label>
                      <label class="field">
                        <span>总角度表达式</span>
                        <input v-model="activeShapeNode(card).angleOffset.angleExpr" class="input mono" type="text" placeholder="PI * 2" />
                      </label>
                    </div>
                  </template>
                  <template v-else>
                    <div class="grid2">
                      <label class="field">
                        <span>总角度</span>
                        <input v-model.number="activeShapeNode(card).angleOffset.angleValue" class="input" type="number" step="0.01" />
                      </label>
                      <label class="field">
                        <span>单位</span>
                        <select v-model="activeShapeNode(card).angleOffset.angleUnit" class="input">
                          <option value="deg">度</option>
                          <option value="rad">弧度</option>
                        </select>
                      </label>
                    </div>
                  </template>
                </div>

                <div class="kv-row display-row">
                  <div class="mini-note">缩放助手（可选）</div>
                  <div class="grid2">
                    <label class="field">
                      <span>模式</span>
                      <select v-model="activeShapeNode(card).scale.type" class="input">
                        <option value="none">none</option>
                        <option value="linear">linear</option>
                        <option value="bezier">bezier</option>
                      </select>
                    </label>
                    <label class="field">
                      <span>持续</span>
                      <input v-model.number="activeShapeNode(card).scale.duration" class="input" type="number" step="1" min="1" />
                    </label>
                  </div>
                  <template v-if="activeShapeNode(card).scale.type !== 'none'">
                    <div class="grid2">
                      <label class="field">
                        <span>from</span>
                        <input v-model.number="activeShapeNode(card).scale.from" class="input" type="number" step="0.01" />
                      </label>
                      <label class="field">
                        <span>to</span>
                        <input v-model.number="activeShapeNode(card).scale.to" class="input" type="number" step="0.01" />
                      </label>
                    </div>
                  </template>
                  <template v-if="activeShapeNode(card).scale.type === 'bezier'">
                    <div class="grid2">
                      <label class="field">
                        <span>P1</span>
                        <input class="input mono" type="text" :value="`${activeShapeNode(card).scale.p1.x}, ${activeShapeNode(card).scale.p1.y}`" readonly />
                      </label>
                      <label class="field">
                        <span>P2</span>
                        <input class="input mono" type="text" :value="`${activeShapeNode(card).scale.p2.x}, ${activeShapeNode(card).scale.p2.y}`" readonly />
                      </label>
                    </div>
                    <div class="list-tools">
                      <button class="btn small" @click.stop="$emit('open-bezier', { card, node: activeShapeNode(card), treePath: [...(card.viewPath || [])] })">Bezier 工具</button>
                    </div>
                  </template>
                </div>

                <template v-if="activeShapeNode(card).type === 'single'">
                  <div class="kv-row display-row">
                    <div class="mini-note">Particle Init</div>
                    <div class="list-tools">
                      <button class="btn small primary" @click.stop="addTreeNodeParticleInit(activeShapeNode(card))">添加 init</button>
                    </div>
                    <div class="kv-list">
                      <div v-if="!activeShapeNode(card).particleInit.length" class="mini-note">暂无 Particle Init。</div>
                      <div v-for="(item, index) in activeShapeNode(card).particleInit" :key="item.id || index" class="kv-row grid-pinit">
                        <select v-model="item.target" class="input" @change="normalizeParticleInitExpr(item)">
                          <option v-for="target in particleInitTargets" :key="target" :value="target">{{ target }}</option>
                        </select>
                        <input v-model="item.expr" class="input mono" type="text" :placeholder="particleInitPlaceholder(item.target)" @blur="normalizeParticleInitExpr(item)" />
                        <button class="btn small" @click.stop="removeTreeNodeParticleInit(activeShapeNode(card), item.id)">删除</button>
                        <div v-if="isDirectColorParticleInit(item)" class="vector-inputs inline-vector-inputs particle-color-editor">
                          <div class="vector-ctor-label">Vector3f</div>
                          <input class="input" type="number" min="0" max="1" step="0.01" :value="particleInitVectorParts(item).x" @input="updateParticleInitVector(item, 'x', $event.target.value)" />
                          <input class="input" type="number" min="0" max="1" step="0.01" :value="particleInitVectorParts(item).y" @input="updateParticleInitVector(item, 'y', $event.target.value)" />
                          <input class="input" type="number" min="0" max="1" step="0.01" :value="particleInitVectorParts(item).z" @input="updateParticleInitVector(item, 'z', $event.target.value)" />
                          <input class="input vector-color" type="color" :value="particleInitColorHex(item)" title="打开调色板" @input="updateParticleInitColor(item, $event.target.value)" />
                        </div>
                      </div>
                    </div>
                  </div>

                  <div class="kv-row display-row">
                    <div class="mini-note">Controller</div>
                    <div class="list-tools">
                      <button class="btn small primary" @click.stop="addTreeNodeControllerVar(activeShapeNode(card))">添加局部变量</button>
                      <button class="btn small primary" @click.stop="addTreeNodeControllerAction(activeShapeNode(card))">添加 tick action</button>
                    </div>
                    <div class="kv-list">
                      <div v-if="!activeShapeNode(card).controllerVars.length" class="mini-note">暂无局部变量。</div>
                      <div v-for="(item, index) in activeShapeNode(card).controllerVars" :key="item.id || index" class="kv-row grid-var">
                        <div class="grid2">
                          <input v-model="item.name" class="input" type="text" placeholder="name" />
                          <select v-model="item.type" class="input">
                            <option v-for="type in controllerVarTypes" :key="type" :value="type">{{ type }}</option>
                          </select>
                        </div>
                        <input v-model="item.expr" class="input mono" type="text" placeholder="初始值" />
                        <div class="row-actions">
                          <button class="btn small" @click.stop="removeTreeNodeControllerVar(activeShapeNode(card), item.id)">删除</button>
                        </div>
                      </div>
                    </div>
                    <div class="kv-list">
                      <div v-if="!activeShapeNode(card).controllerActions.length" class="mini-note">暂无 tick action。</div>
                      <div v-for="(item, index) in activeShapeNode(card).controllerActions" :key="item.id || index" class="kv-row display-row">
                        <div class="grid2">
                          <select v-model="item.type" class="input">
                            <option v-for="type in controllerActionTypes" :key="type.id" :value="type.id">{{ type.title }}</option>
                          </select>
                          <div class="row-actions">
                            <button class="btn small" @click.stop="removeTreeNodeControllerAction(activeShapeNode(card), item.id)">删除</button>
                          </div>
                        </div>
                        <textarea v-model="item.script" class="input script-area" placeholder="if (...) { ... }
addSingle() / addMultiple(2)"></textarea>
                      </div>
                    </div>
                  </div>
                </template>

                <div v-if="activeShapeNode(card).type === 'sequenced_shape'" class="kv-row display-row">
                  <div class="mini-note">生长动画</div>
                  <div class="list-tools">
                    <button class="btn small primary" @click.stop="addTreeNodeGrowthAnimate(activeShapeNode(card))">添加</button>
                  </div>
                  <div class="kv-list">
                    <div v-if="!activeShapeNode(card).growthAnimates.length" class="mini-note">暂无生长动画。</div>
                    <div v-for="(item, index) in activeShapeNode(card).growthAnimates" :key="item.id || index" class="kv-row grid-animate">
                      <input v-model.number="item.count" class="input" type="number" min="1" step="1" />
                      <input v-model="item.condition" class="input mono" type="text" placeholder="条件表达式" />
                      <button class="btn small" @click.stop="removeTreeNodeGrowthAnimate(activeShapeNode(card), item.id)">删除</button>
                    </div>
                  </div>
                </div>

                <template v-if="activeShapeNode(card).type !== 'single'">
                  <div class="mini-note">并列子节点</div>
                  <div class="children-list">
                    <div v-if="!activeShapeChildren(card).length" class="mini-note">暂无子节点，请添加并列子节点。</div>
                    <div v-for="(child, index) in activeShapeChildren(card)" :key="child.id || index" class="child-row">
                      <input v-model="child.name" class="input child-name-input" type="text" :placeholder="`子节点 ${index + 1}`" />
                      <select v-model="child.type" class="input child-type-select" @change="handleTreeNodeTypeChange(child)">
                        <option v-for="item in dataTypes" :key="item.id" :value="item.id">{{ item.label }}</option>
                      </select>
                      <button class="btn small primary" @click.stop="drillIntoShapeNode(card, index)">进入</button>
                      <button class="btn small" @click.stop="moveShapeChild(card, index, -1)">上移</button>
                      <button class="btn small" @click.stop="moveShapeChild(card, index, 1)">下移</button>
                      <button class="btn small" @click.stop="removeShapeChild(card, index)">删除</button>
                    </div>
                  </div>
                  <div class="list-tools">
                    <button class="btn small primary" @click.stop="addShapeChild(card)">添加并列子节点</button>
                  </div>
                </template>
              </template>

              <template v-else>
                <div class="children-list">
                  <div v-if="!activeShapeChildren(card).length" class="mini-note">暂无子节点，请添加并列子节点。</div>
                  <div v-for="(child, index) in activeShapeChildren(card)" :key="child.id || index" class="child-row">
                    <input v-model="child.name" class="input child-name-input" type="text" :placeholder="`子节点 ${index + 1}`" />
                    <select v-model="child.type" class="input child-type-select" @change="handleTreeNodeTypeChange(child)">
                      <option v-for="item in dataTypes" :key="item.id" :value="item.id">{{ item.label }}</option>
                    </select>
                    <button class="btn small primary" @click.stop="drillIntoShapeNode(card, index)">进入</button>
                    <button class="btn small" @click.stop="moveShapeChild(card, index, -1)">上移</button>
                    <button class="btn small" @click.stop="moveShapeChild(card, index, 1)">下移</button>
                    <button class="btn small" @click.stop="removeShapeChild(card, index)">删除</button>
                  </div>
                </div>
                <div class="list-tools">
                  <button class="btn small primary" @click.stop="addShapeChild(card)">添加并列子节点</button>
                </div>
              </template>
            </div>
          </template>

          <div v-if="card.dataType !== 'single'" class="subgroup" data-section-key="shape_axis">
            <div class="subgroup-title">Axis</div>
            <div class="grid2">
              <label class="field">
                <span>axis 预设</span>
                <select v-model="card.shapeAxisPreset" class="input" @change="card.shapeAxisExpr = card.shapeAxisPreset">
                  <option v-for="preset in relativeTargetPresets" :key="preset.expr" :value="preset.expr">{{ preset.label }}</option>
                </select>
              </label>
              <label class="field">
                <span>axis 输入</span>
                <input v-model="card.shapeAxisExpr" class="input mono" type="text" placeholder="axis 表达式" />
              </label>
            </div>
            <div class="grid5 vector-inputs">
              <select v-model="card.shapeAxisManualCtor" class="input vector-ctor">
                <option value="Vec3">Vec3</option>
                <option value="RelativeLocation">RelativeLocation</option>
                <option value="Vector3f">Vector3f</option>
              </select>
              <input v-model.number="card.shapeAxisManualX" class="input" type="number" step="0.1" placeholder="0" />
              <input v-model.number="card.shapeAxisManualY" class="input" type="number" step="0.1" placeholder="1" />
              <input v-model.number="card.shapeAxisManualZ" class="input" type="number" step="0.1" placeholder="0" />
              <button class="btn small primary" @click.stop="applyCardAxisManual(card)">套用手动输入</button>
            </div>
            <div class="mini-note">保留旧站 Axis 操作方法，卡片级方向将参与形状显示行为计算。</div>
          </div>

          <div v-if="card.dataType !== 'single'" class="subgroup" data-section-key="shape_display">
            <div class="subgroup-head">
              <div class="subgroup-title">Display 行为</div>
              <span class="flex-spacer"></span>
              <button class="btn small" @click.stop="addShapeDisplayAction(card)">添加 display action</button>
            </div>

            <div class="kv-list">
              <div v-if="!card.shapeDisplayActions.length" class="mini-note">当前卡片还没有形状级显示动作。</div>

              <div v-for="(action, actionIndex) in card.shapeDisplayActions" :key="action.id || actionIndex" class="kv-row display-row">
                <div class="grid2">
                  <select v-model="action.type" class="input">
                    <option v-for="item in displayActionTypes" :key="item.id" :value="item.id">{{ item.label }}</option>
                  </select>
                  <div class="row-actions">
                    <button class="btn small" @click.stop="removeShapeDisplayAction(card, action.id)">删除</button>
                  </div>
                </div>

                <template v-if="action.type !== 'rotateAsAxis'">
                  <div class="grid-action">
                    <select v-model="action.toPreset" class="input" @change="syncShapeDisplayPreset(action)">
                      <option v-for="preset in relativeTargetPresets" :key="preset.expr" :value="preset.expr">{{ preset.label }}</option>
                    </select>
                    <input v-model="action.toExpr" class="input mono" type="text" placeholder="to 表达式" />
                    <div class="mini-note">目标方向 / 目标点</div>
                    <div></div>
                  </div>

                  <div class="grid5 vector-inputs">
                    <select v-model="action.toManualCtor" class="input vector-ctor">
                      <option value="Vec3">Vec3</option>
                      <option value="RelativeLocation">RelativeLocation</option>
                      <option value="Vector3f">Vector3f</option>
                    </select>
                    <input v-model.number="action.toManualX" class="input" type="number" step="0.1" placeholder="0" />
                    <input v-model.number="action.toManualY" class="input" type="number" step="0.1" placeholder="1" />
                    <input v-model.number="action.toManualZ" class="input" type="number" step="0.1" placeholder="0" />
                    <button class="btn small primary" @click.stop="applyShapeDisplayManual(action)">套用手动输入</button>
                  </div>
                </template>

                <div class="angle-control">
                  <div class="angle-control-main">
                    <select v-model="action.angleMode" class="input action-mode-select">
                      <option value="numeric">角度输入</option>
                      <option value="expr">表达式</option>
                    </select>
                    <template v-if="action.angleMode === 'numeric'">
                      <input v-model.number="action.angleValue" class="input angle-value" type="number" step="0.01" />
                      <select v-model="action.angleUnit" class="input angle-unit">
                        <option value="deg">度</option>
                        <option value="rad">弧度</option>
                      </select>
                    </template>
                  </div>
                  <template v-if="action.angleMode === 'expr'">
                    <div class="grid2">
                      <select v-model="action.angleExprPreset" class="input" @change="action.angleExpr = action.angleExprPreset">
                        <option v-for="preset in anglePresets" :key="preset" :value="preset">{{ preset }}</option>
                      </select>
                      <input v-model="action.angleExpr" class="input mono" type="text" placeholder="角度表达式" />
                    </div>
                  </template>
                </div>

                <label class="field editor-field">
                  <span>表达式脚本</span>
                  <textarea v-model="action.expression" class="input" placeholder="可选：附加显示动作表达式"></textarea>
                </label>
              </div>
            </div>
          </div>

          <div v-if="card.dataType !== 'single'" class="subgroup" data-section-key="shape_angle_offset">
            <div class="subgroup-title">相对角度偏移（可选）</div>
            <div class="grid3">
              <div class="field">
                <span>启用</span>
                <label class="chk">
                  <input v-model="card.shapeAngleOffset.enabled" type="checkbox" />
                  <span>开启相对角度偏移</span>
                </label>
              </div>
              <label class="field">
                <span>偏移个数</span>
                <input v-model.number="card.shapeAngleOffset.count" class="input" type="number" min="1" step="1" />
              </label>
              <label class="field">
                <span>glowingTick</span>
                <input v-model.number="card.shapeAngleOffset.glowTick" class="input" type="number" min="1" step="1" />
              </label>
            </div>
            <div class="grid3">
              <label class="field">
                <span>缓动</span>
                <select v-model="card.shapeAngleOffset.ease" class="input">
                  <option v-for="item in angleOffsetEaseOptions" :key="item.id" :value="item.id">{{ item.title }}</option>
                </select>
              </label>
              <div class="field">
                <span>消散时反向收回</span>
                <label class="chk">
                  <input v-model="card.shapeAngleOffset.reverseOnDisable" type="checkbox" />
                  <span>启用</span>
                </label>
              </div>
              <label class="field">
                <span>总角度模式</span>
                <select v-model="card.shapeAngleOffset.angleMode" class="input">
                  <option value="numeric">角度输入</option>
                  <option value="expr">表达式</option>
                </select>
              </label>
            </div>
            <template v-if="card.shapeAngleOffset.angleMode === 'expr'">
              <div class="grid2">
                <label class="field">
                  <span>总角度预设</span>
                  <select v-model="card.shapeAngleOffset.angleExprPreset" class="input" @change="card.shapeAngleOffset.angleExpr = card.shapeAngleOffset.angleExprPreset">
                    <option v-for="preset in anglePresets" :key="preset" :value="preset">{{ preset }}</option>
                  </select>
                </label>
                <label class="field">
                  <span>总角度表达式</span>
                  <input v-model="card.shapeAngleOffset.angleExpr" class="input mono" type="text" placeholder="PI * 2" />
                </label>
              </div>
            </template>
            <template v-else>
              <div class="grid2">
                <label class="field">
                  <span>总角度</span>
                  <input v-model.number="card.shapeAngleOffset.angleValue" class="input" type="number" step="0.01" />
                </label>
                <label class="field">
                  <span>单位</span>
                  <select v-model="card.shapeAngleOffset.angleUnit" class="input">
                    <option value="deg">度</option>
                    <option value="rad">弧度</option>
                  </select>
                </label>
              </div>
            </template>
          </div>

          <div v-if="card.dataType !== 'single'" class="subgroup" data-section-key="shape_scale">
            <div class="subgroup-head">
              <div class="subgroup-title">缩放助手</div>
              <span class="flex-spacer"></span>
              <button class="btn small" @click.stop="$emit('open-bezier', card)">Bezier 工具</button>
            </div>

            <div class="kv-list">
              <div class="kv-row display-row">
                <div class="grid2">
                  <label class="field">
                    <span>模式</span>
                    <select v-model="card.scaleHelper.type" class="input">
                      <option value="linear">linear</option>
                      <option value="bezier">bezier</option>
                    </select>
                  </label>
                  <label class="field">
                    <span>持续</span>
                    <input v-model.number="card.scaleHelper.duration" class="input" type="number" step="1" min="1" />
                  </label>
                  <label class="field">
                    <span>from</span>
                    <input v-model.number="card.scaleHelper.from" class="input" type="number" step="0.01" />
                  </label>
                  <label class="field">
                    <span>to</span>
                    <input v-model.number="card.scaleHelper.to" class="input" type="number" step="0.01" />
                  </label>
                </div>
                <template v-if="card.scaleHelper.type === 'bezier'">
                  <div class="grid2">
                    <label class="field">
                      <span>P1</span>
                      <input class="input mono" type="text" :value="`${card.scaleHelper.p1.x}, ${card.scaleHelper.p1.y}`" readonly />
                    </label>
                    <label class="field">
                      <span>P2</span>
                      <input class="input mono" type="text" :value="`${card.scaleHelper.p2.x}, ${card.scaleHelper.p2.y}`" readonly />
                    </label>
                  </div>
                </template>
              </div>
            </div>
          </div>

          <div v-if="card.dataType === 'sequenced_shape'" class="subgroup" data-section-key="growth">
            <div class="subgroup-title">生长动画</div>
            <div class="list-tools">
              <button class="btn small primary" @click.stop="addGrowthAnimate(card)">添加</button>
            </div>
            <div class="kv-list">
              <div v-if="!card.growthAnimates.length" class="mini-note">暂无生长动画。</div>
              <div v-for="(item, index) in card.growthAnimates" :key="item.id || index" class="kv-row grid-animate">
                <input v-model.number="item.count" class="input" type="number" min="1" step="1" />
                <input v-model="item.condition" class="input mono" type="text" placeholder="条件表达式" />
                <button class="btn small" @click.stop="removeGrowthAnimate(card, item.id)">删除</button>
              </div>
            </div>
          </div>
        </div>
      </article>
    </div>
  </div>
</template>

<script setup>
import {
  COMPOSITION_ANGLE_OFFSET_EASE_OPTIONS,
  COMPOSITION_CARD_DATA_TYPES,
  COMPOSITION_CONTROLLER_ACTION_TYPES,
  COMPOSITION_CONTROLLER_VAR_TYPES,
  COMPOSITION_EFFECT_CLASS_OPTIONS,
  COMPOSITION_PARTICLE_INIT_TARGET_OPTIONS,
  createCompositionAnimate,
  createCompositionControllerAction,
  createCompositionControllerVar,
  createCompositionParticleInit,
  createCompositionShapeChild,
  createDisplayAction,
  createScaleHelper
} from '../modules/composition/defaults.js';
import { formatVectorLiteral, parseVectorLiteral } from '../modules/composition/expression-runtime.js';
import { evaluatePointsProject } from '../modules/pointsbuilder/evaluator.js';
import { exportJsonFile, parseJsonFile, sanitizeFileBase } from '../modules/pointsbuilder/io.js';
import { createCompositionPointsBuilderState } from '../modules/composition/defaults.js';
import { normalizeCompositionBuilderState } from '../modules/composition/normalizer.js';

const props = defineProps({
  project: { type: Object, required: true },
  selectedCardId: { type: String, default: '' },
  collapsedCards: { type: Object, default: () => ({}) },
  relativeTargetPresets: { type: Array, default: () => [] },
  anglePresets: { type: Array, default: () => [] },
  displayActionTypes: { type: Array, default: () => [] }
});

defineEmits([
  'collapse-all',
  'expand-all',
  'add-card',
  'set-selected',
  'toggle-card',
  'move-card-up',
  'move-card-down',
  'clone-card',
  'remove-card',
  'open-builder',
  'pull-builder',
  'open-node-builder',
  'pull-node-builder',
  'open-bezier'
]);

const dataTypes = COMPOSITION_CARD_DATA_TYPES;
const effectOptions = COMPOSITION_EFFECT_CLASS_OPTIONS;
const particleInitTargets = COMPOSITION_PARTICLE_INIT_TARGET_OPTIONS;
const controllerVarTypes = COMPOSITION_CONTROLLER_VAR_TYPES;
const controllerActionTypes = COMPOSITION_CONTROLLER_ACTION_TYPES;
const angleOffsetEaseOptions = COMPOSITION_ANGLE_OFFSET_EASE_OPTIONS;
const builderImportInputRefs = new Map();

const CARD_SECTION_KEYS = [
  'base',
  'source',
  'single_particle_init',
  'single_controller_init',
  'shape_child_params',
  'shape_axis',
  'shape_display',
  'shape_angle_offset',
  'shape_scale',
  'growth'
];

function isCollapsed(cardId) {
  return Boolean(props.collapsedCards?.[cardId]);
}

function ensureSectionCollapse(card) {
  if (!card.sectionCollapse || typeof card.sectionCollapse !== 'object') {
    card.sectionCollapse = {};
  }
  return card.sectionCollapse;
}

function isSectionCollapsed(card, key) {
  return Boolean(ensureSectionCollapse(card)[key]);
}

function setAllSectionsCollapsed(card, collapsed) {
  const sectionCollapse = ensureSectionCollapse(card);
  CARD_SECTION_KEYS.forEach((key) => {
    sectionCollapse[key] = collapsed;
  });
}

function builderNodeCount(owner) {
  return owner?.builderState?.state?.root?.children?.length
    || owner?.builderState?.root?.children?.length
    || 0;
}

function builderPointCount(owner) {
  try {
    return evaluatePointsProject(owner?.builderState || {}).length;
  } catch {
    return 0;
  }
}

function setBuilderImportInputRef(cardId, element) {
  if (!cardId) return;
  if (element) {
    builderImportInputRefs.set(cardId, element);
    return;
  }
  builderImportInputRefs.delete(cardId);
}

function openBuilderImportDialog(cardId) {
  builderImportInputRefs.get(cardId)?.click();
}

async function handleBuilderImportFileChange(card, event) {
  const file = event?.target?.files?.[0];
  if (!file || !card) return;
  try {
    const payload = await parseJsonFile(file);
    card.builderState = normalizeCompositionBuilderState(payload);
  } finally {
    if (event?.target) event.target.value = '';
  }
}

function exportBuilderJson(card) {
  if (!card) return;
  const fileBase = sanitizeFileBase(card.name || 'card') || 'card';
  exportJsonFile(`${fileBase}.builder.json`, card.builderState || createCompositionPointsBuilderState());
}

function clearBuilder(card) {
  if (!card) return;
  card.builderState = createCompositionPointsBuilderState();
}

function particleInitPlaceholder(target) {
  if (target === 'color') return 'Vector3f(1F, 1F, 1F)';
  if (target === 'size') return '1.0';
  if (target === 'particleAlpha') return '1.0';
  if (target === 'currentAge') return '0';
  return '0';
}

function isParticleInitDefaultExpr(expr) {
  const text = String(expr || '').trim();
  return [
    '',
    '0',
    '1.0',
    'RelativeLocation(1.0, 1.0, 1.0)',
    'Vector3f(1F, 1F, 1F)'
  ].includes(text);
}

function isVectorCtorExpr(expr) {
  return /^(Vector3f|RelativeLocation|Vec3)\s*\(/.test(String(expr || '').trim());
}

function normalizeParticleInitExpr(item) {
  if (!item) return;
  if (item.target !== 'color') {
    if (!String(item.expr || '').trim() || isVectorCtorExpr(item.expr)) {
      item.expr = particleInitPlaceholder(item.target);
    }
    return;
  }
  const expr = String(item.expr || '').trim();
  if (isParticleInitDefaultExpr(expr)) {
    item.expr = 'Vector3f(1F, 1F, 1F)';
    return;
  }
  if (isVectorCtorExpr(expr)) {
    const parsed = parseVectorLiteral(expr, { x: 1, y: 1, z: 1 });
    item.expr = formatVectorLiteral('Vector3f', parsed.x, parsed.y, parsed.z);
  }
}

function isDirectColorParticleInit(item) {
  return item?.target === 'color' && isVectorCtorExpr(item.expr || 'Vector3f(1F, 1F, 1F)');
}

function particleInitVectorParts(item) {
  return parseVectorLiteral(item?.expr || 'Vector3f(1F, 1F, 1F)', { x: 1, y: 1, z: 1 });
}

function updateParticleInitVector(item, axis, value) {
  if (!item || item.target !== 'color') return;
  const parsed = particleInitVectorParts(item);
  parsed[axis] = toFiniteNumber(value, 0);
  item.expr = formatVectorLiteral('Vector3f', parsed.x, parsed.y, parsed.z);
}

function updateParticleInitColor(item, hex) {
  if (!item || item.target !== 'color') return;
  const color = hexToVector01(hex);
  item.expr = formatVectorLiteral('Vector3f', color.x, color.y, color.z);
}

function particleInitColorHex(item) {
  const parsed = particleInitVectorParts(item);
  return vectorToHex01(parsed.x, parsed.y, parsed.z);
}

function applyCardAxisManual(card) {
  card.shapeAxisExpr = formatVectorLiteral(
    card.shapeAxisManualCtor,
    card.shapeAxisManualX,
    card.shapeAxisManualY,
    card.shapeAxisManualZ
  );
  card.shapeAxisPreset = card.shapeAxisExpr;
}

function syncSingleEffect(card) {
  card.particleEffect = card.singleEffectClass || card.particleEffect;
}

function addParticleInit(card) {
  if (!Array.isArray(card.particleInit)) card.particleInit = [];
  card.particleInit.push(createCompositionParticleInit());
}

function removeParticleInit(card, itemId) {
  if (!Array.isArray(card.particleInit)) return;
  card.particleInit = card.particleInit.filter((item) => item.id !== itemId);
}

function addControllerVar(card) {
  if (!Array.isArray(card.controllerVars)) card.controllerVars = [];
  card.controllerVars.push(createCompositionControllerVar({ name: `temp${card.controllerVars.length + 1}` }));
}

function removeControllerVar(card, itemId) {
  if (!Array.isArray(card.controllerVars)) return;
  card.controllerVars = card.controllerVars.filter((item) => item.id !== itemId);
}

function addControllerAction(card) {
  if (!Array.isArray(card.controllerActions)) card.controllerActions = [];
  card.controllerActions.push(createCompositionControllerAction());
}

function removeControllerAction(card, itemId) {
  if (!Array.isArray(card.controllerActions)) return;
  card.controllerActions = card.controllerActions.filter((item) => item.id !== itemId);
}

function addGrowthAnimate(card) {
  if (!Array.isArray(card.growthAnimates)) card.growthAnimates = [];
  card.growthAnimates.push(createCompositionAnimate());
}

function removeGrowthAnimate(card, itemId) {
  if (!Array.isArray(card.growthAnimates)) return;
  card.growthAnimates = card.growthAnimates.filter((item) => item.id !== itemId);
}

function addShapeDisplayAction(card) {
  if (!Array.isArray(card.shapeDisplayActions)) card.shapeDisplayActions = [];
  card.shapeDisplayActions.push(createDisplayAction());
}

function removeShapeDisplayAction(card, actionId) {
  if (!Array.isArray(card.shapeDisplayActions)) return;
  card.shapeDisplayActions = card.shapeDisplayActions.filter((item) => item.id !== actionId);
}

function syncShapeDisplayPreset(action) {
  action.toUsePreset = true;
  action.toExpr = action.toPreset;
}

function applyShapeDisplayManual(action) {
  action.toExpr = formatVectorLiteral(action.toManualCtor, action.toManualX, action.toManualY, action.toManualZ);
  action.toPreset = action.toExpr;
  action.toUsePreset = false;
}

function getShapeNode(card, path = []) {
  let children = card.shapeChildren || [];
  let node = null;
  for (const rawIndex of path) {
    const index = Number(rawIndex);
    if (!Array.isArray(children) || !children[index]) return null;
    node = children[index];
    children = node.children || [];
  }
  return node;
}

function activeShapeNode(card) {
  return getShapeNode(card, card.viewPath || []);
}

function activeShapeChildren(card) {
  const node = activeShapeNode(card);
  if (node) {
    if (!Array.isArray(node.children)) node.children = [];
    return node.children;
  }
  if (!Array.isArray(card.shapeChildren)) card.shapeChildren = [];
  return card.shapeChildren;
}

function shapeBreadcrumb(card) {
  const names = [];
  let children = card.shapeChildren || [];
  for (const rawIndex of card.viewPath || []) {
    const index = Number(rawIndex);
    const node = Array.isArray(children) ? children[index] : null;
    if (!node) break;
    names.push(String(node.name || `子节点 ${index + 1}`));
    children = node.children || [];
  }
  return names;
}

function navigateShapeBreadcrumb(card, depth) {
  if (!Array.isArray(card.viewPath)) card.viewPath = [];
  if (depth < 0) {
    card.viewPath = [];
    return;
  }
  card.viewPath = card.viewPath.slice(0, depth + 1);
}

function drillIntoShapeNode(card, index) {
  if (!Array.isArray(card.viewPath)) card.viewPath = [];
  card.viewPath = [...card.viewPath, index];
}

function handleTreeNodeTypeChange(node) {
  if (!node) return;
  if (node.type === 'single') {
    node.children = [];
    node.growthAnimates = [];
  } else if (!Array.isArray(node.children)) {
    node.children = [];
  }
  if (!node.scale || typeof node.scale !== 'object') {
    node.scale = createScaleHelper({ type: 'none' });
  }
  if (!node.angleOffset || typeof node.angleOffset !== 'object') {
    node.angleOffset = {
      enabled: false,
      count: 1,
      glowTick: 20,
      ease: 'outCubic',
      reverseOnDisable: false,
      angleMode: 'numeric',
      angleValue: 360,
      angleUnit: 'deg',
      angleExpr: 'PI * 2',
      angleExprPreset: 'PI * 2'
    };
  }
  if (!Array.isArray(node.displayActions)) node.displayActions = [];
  if (!Array.isArray(node.particleInit)) node.particleInit = [];
  if (!Array.isArray(node.controllerVars)) node.controllerVars = [];
  if (!Array.isArray(node.controllerActions)) node.controllerActions = [];
  if (!Array.isArray(node.growthAnimates)) node.growthAnimates = [];
}

function addShapeChild(card) {
  const list = activeShapeChildren(card);
  list.push(createCompositionShapeChild({ name: `子节点 ${list.length + 1}` }));
}

function removeShapeChild(card, index) {
  const list = activeShapeChildren(card);
  list.splice(index, 1);
}

function moveShapeChild(card, index, delta) {
  const list = activeShapeChildren(card);
  const nextIndex = index + delta;
  if (nextIndex < 0 || nextIndex >= list.length) return;
  const [item] = list.splice(index, 1);
  list.splice(nextIndex, 0, item);
}

function applyTreeNodeAxisManual(node) {
  if (!node) return;
  node.axisExpr = formatVectorLiteral(node.axisManualCtor, node.axisManualX, node.axisManualY, node.axisManualZ);
  node.axisPreset = node.axisExpr;
}

function addTreeNodeDisplayAction(node) {
  if (!node) return;
  if (!Array.isArray(node.displayActions)) node.displayActions = [];
  node.displayActions.push(createDisplayAction());
}

function removeTreeNodeDisplayAction(node, actionId) {
  if (!node || !Array.isArray(node.displayActions)) return;
  node.displayActions = node.displayActions.filter((item) => item.id !== actionId);
}

function syncTreeNodeDisplayPreset(action) {
  action.toUsePreset = true;
  action.toExpr = action.toPreset;
}

function applyTreeNodeDisplayManual(action) {
  action.toExpr = formatVectorLiteral(action.toManualCtor, action.toManualX, action.toManualY, action.toManualZ);
  action.toPreset = action.toExpr;
  action.toUsePreset = false;
}

function addTreeNodeParticleInit(node) {
  if (!node) return;
  if (!Array.isArray(node.particleInit)) node.particleInit = [];
  node.particleInit.push(createCompositionParticleInit());
}

function removeTreeNodeParticleInit(node, itemId) {
  if (!node || !Array.isArray(node.particleInit)) return;
  node.particleInit = node.particleInit.filter((item) => item.id !== itemId);
}

function addTreeNodeControllerVar(node) {
  if (!node) return;
  if (!Array.isArray(node.controllerVars)) node.controllerVars = [];
  node.controllerVars.push(createCompositionControllerVar({ name: `temp${node.controllerVars.length + 1}` }));
}

function removeTreeNodeControllerVar(node, itemId) {
  if (!node || !Array.isArray(node.controllerVars)) return;
  node.controllerVars = node.controllerVars.filter((item) => item.id !== itemId);
}

function addTreeNodeControllerAction(node) {
  if (!node) return;
  if (!Array.isArray(node.controllerActions)) node.controllerActions = [];
  node.controllerActions.push(createCompositionControllerAction());
}

function removeTreeNodeControllerAction(node, itemId) {
  if (!node || !Array.isArray(node.controllerActions)) return;
  node.controllerActions = node.controllerActions.filter((item) => item.id !== itemId);
}

function addTreeNodeGrowthAnimate(node) {
  if (!node) return;
  if (!Array.isArray(node.growthAnimates)) node.growthAnimates = [];
  node.growthAnimates.push(createCompositionAnimate());
}

function removeTreeNodeGrowthAnimate(node, itemId) {
  if (!node || !Array.isArray(node.growthAnimates)) return;
  node.growthAnimates = node.growthAnimates.filter((item) => item.id !== itemId);
}
</script>
