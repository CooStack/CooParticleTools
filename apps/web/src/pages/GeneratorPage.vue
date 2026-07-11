<template>
  <div
    v-if="projectReady"
    class="generator-page"
    :class="{ 'generator-page--skybox-off': project.settings.showSkybox === false }"
    :data-theme="project.settings.theme"
  >
    <header class="generator-topbar">
      <div class="generator-brand">
        <RouterLink class="btn small" :to="{ name: 'workbench' }">项目</RouterLink>
        <div>
          <h1>粒子发射器</h1>
          <p>生成 Kotlin：<code>class {{ project.kotlin.className }}(pos: Vec3, world: Level?) : {{ project.kotlin.baseClass }}(pos, world)</code></p>
        </div>
      </div>
      <div class="generator-actions">
        <button class="btn small" :class="{ primary: project.pageMode === 'editor' }" @click="project.pageMode = 'editor'">编辑</button>
        <button class="btn small" :class="{ primary: project.pageMode === 'code' }" @click="project.pageMode = 'code'">代码</button>
        <button class="btn small" @click="togglePreviewPlayback">{{ project.playing ? '暂停' : '继续' }}</button>
        <button class="btn small" @click="restartPreview">重播</button>
        <button class="btn small" @click="exportJson">导出 JSON</button>
        <button class="btn small" @click="openProjectWithShell">导入 JSON</button>
        <button class="btn small danger" @click="resetProject">重置</button>
        <input ref="fileInputRef" type="file" accept="application/json,.json" hidden @change="importJson" />
      </div>
    </header>

    <main v-if="project.pageMode === 'editor'" class="generator-workspace" :style="workspaceStyle">
      <aside class="generator-panel generator-left">
        <div class="panel-title-row">
          <strong>粒子发射器</strong>
          <button class="btn small primary" @click="addEmitter">+ 发射器</button>
        </div>

        <section class="left-block">
          <div class="block-title">预览</div>
          <label class="field">
            <span>Tick/秒</span>
            <input v-model.number="project.ticksPerSecond" class="input" type="number" min="1" max="200" step="1" />
          </label>
        </section>

        <nav class="left-tabs" aria-label="页面切换">
          <button v-for="tab in leftTabs" :key="tab.id" type="button" :class="{ active: project.leftTab === tab.id }" @click="project.leftTab = tab.id">
            {{ tab.label }}
          </button>
        </nav>

        <section v-if="project.leftTab === 'emitters'" class="left-block">
          <div class="emitter-list">
            <article
              v-for="(card, index) in project.emitters"
              :key="card.id"
              class="emitter-list-card"
              :class="{ selected: card.id === project.selectedEmitterId, disabled: !card.enabled }"
              @click="project.selectedEmitterId = card.id"
            >
              <div class="card-main">
                <button class="icon-btn emitter-toggle" @click.stop="card.enabled = !card.enabled">{{ card.enabled ? '●' : '○' }}</button>
                <div>
                  <input v-model="card.name" class="plain-input" @click.stop />
                  <div class="sub">{{ emitterTypeLabel(card.emitter.type) }}</div>
                </div>
              </div>
              <div class="row-actions">
                <button class="icon-btn" :disabled="index === 0" @click.stop="moveEmitter(index, -1)">↑</button>
                <button class="icon-btn" :disabled="index === project.emitters.length - 1" @click.stop="moveEmitter(index, 1)">↓</button>
                <button class="icon-btn" @click.stop="cloneEmitter(card)">⧉</button>
                <button class="icon-btn" :disabled="project.emitters.length <= 1" @click.stop="removeEmitter(card.id)">×</button>
              </div>
            </article>
          </div>
        </section>

        <section v-else-if="project.leftTab === 'queues'" class="left-block">
          <div class="panel-title-row compact">
            <span class="block-title">命令队列</span>
            <button class="btn small" @click="addQueue">+ 队列</button>
          </div>
          <article
            v-for="queue in project.commandQueues"
            :key="queue.id"
            class="queue-card"
            :class="{ selected: queue.id === project.selectedQueueId }"
            @click="project.selectedQueueId = queue.id"
          >
            <input v-model="queue.name" class="plain-input" @click.stop />
            <div class="sub">标记：{{ queue.signs.length ? queue.signs.join(', ') : '全部' }}</div>
          </article>
        </section>

        <section v-else-if="project.leftTab === 'project'" class="left-block">
          <div class="block-title">项目设置</div>
          <label class="field"><span>类名</span><input v-model="project.kotlin.className" class="input" type="text" /></label>
          <label class="field"><span>包名</span><input v-model="project.kotlin.packageName" class="input" type="text" placeholder="cn.coostack.generated.emitters" /></label>
          <label class="field"><span>发射器运行模式</span><select v-model="project.rootLifecycle.mode" class="input" @change="restartPreviewAfterRootLifecycleChange"><option value="once">只运行一次</option><option value="interval">持续运行</option><option value="interval_n_tick">按总 Tick 运行</option></select></label>
          <div class="grid2">
            <label class="field"><span>发射间隔 Tick</span><input v-model.number="project.rootLifecycle.intervalTick" class="input" type="number" min="1" step="1" @change="restartPreviewAfterRootLifecycleChange" /></label>
            <label class="field"><span>运行时长 Tick</span><input v-model.number="project.rootLifecycle.maxTick" class="input" type="number" min="1" step="1" @change="restartPreviewAfterRootLifecycleChange" /></label>
          </div>
          <div class="panel-title-row compact">
            <span class="block-title">变量</span>
            <button class="btn small" type="button" @click="addProjectVariable">+ 变量</button>
          </div>
          <div v-if="!project.parameters.variables.length" class="empty-state">暂无 @CodecField 变量。</div>
          <div v-for="item in project.parameters.variables" :key="item.id" class="parameter-editor">
            <div class="parameter-editor-head">
              <label class="field parameter-name-field"><span>变量名</span><input :value="item.name" class="input" type="text" placeholder="变量名" @input="updateParameterName(item, $event)" /></label>
              <button class="btn small danger parameter-delete" type="button" @click="removeProjectVariable(item.id)">删除变量</button>
            </div>
            <div class="parameter-field-grid">
              <label class="field">
                <span>类型</span>
                <select v-model="item.type" class="input" @change="syncParameterType(item)">
                  <option v-for="type in generatorValueTypes" :key="type" :value="type">{{ type }}</option>
                </select>
              </label>
              <GeneratorParameterValueEditor :item="item" label="默认值" />
            </div>
            <label class="check-row parameter-codec"><input v-model="item.codec" type="checkbox" />生成 @CodecField</label>
          </div>
          <div class="panel-title-row compact">
            <span class="block-title">常量</span>
            <button class="btn small" type="button" @click="addProjectConstant">+ 常量</button>
          </div>
          <div v-if="!project.parameters.constants.length" class="empty-state">暂无常量。</div>
          <div v-for="item in project.parameters.constants" :key="item.id" class="parameter-editor">
            <div class="parameter-editor-head">
              <label class="field parameter-name-field"><span>常量名</span><input :value="item.name" class="input" type="text" placeholder="常量名" @input="updateParameterName(item, $event)" /></label>
              <button class="btn small danger parameter-delete" type="button" @click="removeProjectConstant(item.id)">删除常量</button>
            </div>
            <div class="parameter-field-grid">
              <label class="field">
                <span>类型</span>
                <select v-model="item.type" class="input" @change="syncParameterType(item)">
                  <option v-for="type in generatorValueTypes" :key="type" :value="type">{{ type }}</option>
                </select>
              </label>
              <GeneratorParameterValueEditor :item="item" label="值" />
            </div>
          </div>
        </section>

        <section v-else-if="project.leftTab === 'tick'" class="left-block">
          <div class="block-title">每 Tick 表达式</div>
          <textarea v-model="doTickText" class="input code-textarea" placeholder="在这里填写每 tick 执行的表达式"></textarea>
        </section>

        <section v-else-if="project.leftTab === 'death'" class="left-block">
          <div class="block-title">死亡行为</div>
          <label class="field"><span>启用</span><select v-model="project.deathBehavior.enabled" class="input"><option :value="true">开启</option><option :value="false">关闭</option></select></label>
          <label class="field"><span>模式</span><select v-model="project.deathBehavior.mode" class="input"><option value="dissipate">直接消散</option><option value="respawn">重生粒子</option></select></label>
        </section>

        <section v-else class="left-block">
          <div class="block-title">设置</div>
          <div class="settings-summary">
            <span>主题：{{ themeLabel(project.settings.theme) }}</span>
            <span>倍率：{{ formatScale(project.settings.particleRenderScale) }}</span>
          </div>
        </section>
      </aside>

      <div class="panel-resizer panel-resizer--left" role="separator" aria-label="调整左侧面板宽度" @pointerdown="startPanelResize('left', $event)"></div>

      <section class="generator-panel generator-preview">
        <div class="preview-title">
          <strong>预览</strong>
          <div class="preview-chips">
            <span class="chip">粒子数：{{ previewPoints.length }}</span>
            <span class="chip">已运行：{{ previewTick }} Tick</span>
            <span class="chip">帧率：{{ fpsText }}</span>
            <button class="btn small" title="R" @click="previewCanvasRef?.resetCamera()">重置镜头</button>
            <button class="btn small" title="C" @click="clearPreviewParticles">清理粒子</button>
            <button class="btn small" title="F" @click="previewCanvasRef?.toggleFullscreen()">全屏</button>
          </div>
        </div>
        <PreviewCanvas
          ref="previewCanvasRef"
          class="generator-canvas"
          :bare="true"
          :points="previewPoints"
          :show-grid="project.settings.showGrid"
          :show-axes="project.settings.showAxes"
          :show-skybox="project.settings.showSkybox !== false"
          :point-size="project.settings.pointSize"
          :interpolation-ms="previewInterpolationMs"
          @fps="fpsText = formatFps($event)"
        />
        <div v-if="previewErrors.length" class="preview-error-overlay" role="status">
          <strong>配置错误</strong>
          <ul>
            <li v-for="item in previewErrors" :key="item.key || item.message">{{ item.message }}</li>
          </ul>
        </div>
      </section>

      <div class="panel-resizer panel-resizer--right" role="separator" aria-label="调整右侧面板宽度" @pointerdown="startPanelResize('right', $event)"></div>

      <aside class="generator-panel generator-right">
        <template v-if="project.leftTab === 'settings'">
          <div class="panel-title-row">
            <strong>设置</strong>
            <span class="chip">{{ themeLabel(project.settings.theme) }}</span>
          </div>

          <section class="editor-section">
            <div class="section-title">预览渲染</div>
            <div class="settings-grid">
              <label class="field"><span>粒子基本倍率</span><input v-model.number="project.settings.particleRenderScale" class="input" type="number" min="0.05" max="20" step="0.05" /></label>
              <label class="check-row"><input v-model="project.settings.showSkybox" type="checkbox" />显示天空盒</label>
              <label class="check-row"><input v-model="project.settings.showGrid" type="checkbox" />显示网格</label>
              <label class="check-row"><input v-model="project.settings.showAxes" type="checkbox" />显示坐标轴</label>
            </div>
          </section>

          <section class="editor-section">
            <div class="section-title">主题样式</div>
            <div class="theme-choice-grid">
              <button
                v-for="theme in generatorThemeOptions"
                :key="theme.id"
                type="button"
                class="theme-choice"
                :class="{ selected: project.settings.theme === theme.id }"
                :data-theme-option="theme.id"
                @click="project.settings.theme = theme.id"
              >
                <span class="theme-swatch"></span>
                <span>{{ theme.label }}</span>
              </button>
            </div>
          </section>

          <section class="editor-section">
            <div class="section-title">快捷键</div>
            <div class="hotkey-grid">
              <label v-for="item in hotkeyFields" :key="item.key" class="hotkey-row">
                <span>{{ item.label }}</span>
                <input
                  class="input hotkey-input"
                  type="text"
                  readonly
                  :value="formatHotkey(project.settings.hotkeys[item.key])"
                  @keydown.stop.prevent="recordHotkey(item.key, $event)"
                />
                <button class="btn small" type="button" @click="resetHotkey(item.key)">默认</button>
              </label>
            </div>
          </section>
        </template>

        <template v-else-if="project.leftTab === 'queues' && selectedQueue">
          <div class="panel-title-row">
            <strong>参数编辑</strong>
            <div class="inline-actions">
              <span class="chip">{{ selectedQueue.name }}</span>
              <button class="btn small danger" :disabled="project.commandQueues.length <= 1" @click="removeQueue(selectedQueue.id)">删除队列</button>
            </div>
          </div>
          <label class="field"><span>队列名称</span><input v-model="selectedQueue.name" class="input" type="text" /></label>
          <label class="field"><span>标记列表</span><input class="input" type="text" :value="selectedQueue.signs.join(', ')" placeholder="例如：0, 1, 2；留空表示全部" @input="updateQueueSigns($event.target.value)" /></label>
          <section class="editor-section">
            <div class="panel-title-row compact">
              <span class="section-title">命令</span>
              <button class="btn small primary" @click="addQueueCommandToSelected">+ 添加命令</button>
            </div>
            <div v-if="!selectedQueue.commands.length" class="empty-state">当前队列没有命令。</div>
            <article v-for="(command, index) in selectedQueue.commands" :key="command.id" class="command-card">
              <div class="panel-title-row compact">
                <label class="check-row"><input v-model="command.enabled" type="checkbox" />启用</label>
                <button class="icon-btn" @click="removeQueueCommand(selectedQueue, command.id)">×</button>
              </div>
              <div class="grid3">
                <label class="field"><span>名称</span><input v-model="command.label" class="input" type="text" /></label>
                <label class="field"><span>执行 Tick</span><input v-model.number="command.tick" class="input" type="number" min="0" step="1" /></label>
                <label class="field"><span>类型</span><select v-model="command.type" class="input" @change="syncCommandType(command)"><option v-for="item in commandTypeOptions" :key="item.id" :value="item.id">{{ item.label }}</option></select></label>
              </div>
              <div v-if="commandParamFields(command).length" class="command-param-grid">
                <label v-for="field in commandParamFields(command)" :key="field.key" class="mini-field">
                  <span>{{ field.label }}</span>
                  <select v-if="field.type === 'select'" v-model="command.params[field.key]" class="input">
                    <option v-for="option in field.options" :key="option.value" :value="option.value">{{ option.label }}</option>
                  </select>
                  <select
                    v-else-if="field.type === 'boolean'"
                    class="input"
                    :value="String(command.params[field.key])"
                    @change="command.params[field.key] = $event.target.value === 'true'"
                  >
                    <option value="true">开启</option>
                    <option value="false">关闭</option>
                  </select>
                  <input
                    v-else
                    v-model.number="command.params[field.key]"
                    class="input"
                    type="number"
                    :step="field.step || '0.01'"
                    :min="field.min"
                    :max="field.max"
                  />
                </label>
              </div>
            </article>
          </section>
        </template>

        <template v-else-if="selectedEmitter">
          <div class="panel-title-row">
            <strong>参数编辑</strong>
            <span class="chip">{{ selectedEmitter.name }}</span>
          </div>

          <section class="editor-section">
            <div class="section-title">基础参数</div>
            <div class="grid3 base-param-grid">
              <label class="field"><span>发射器类型</span><select v-model="selectedEmitter.emitter.type" class="input"><option v-for="type in emitterTypes" :key="type.id" :value="type.id">{{ type.label }}</option></select></label>
              <BindableField :card="selectedEmitter" path="render.effectClass" label="Effect" value-type="none" input-type="text" :autocomplete-options="effectAutocompleteOptions" />
              <BindableField :card="selectedEmitter" path="render.textureSheet" label="RenderType" value-type="string" input-type="text" :autocomplete-options="renderTypeAutocompleteOptions" />
            </div>

            <BindableVector :card="selectedEmitter" path="emitter.offset" label="世界偏移" value-type="relative" step="0.1" />

            <EmitterSpecificFields :card="selectedEmitter" />

            <div class="grid3">
              <label class="field" title="相对于父发射器生命周期，包含该 Tick"><span>生效起点 Tick（含）</span><input v-model.number="selectedEmitter.emission.startTick" class="input" type="number" min="0" step="1" @change="restartPreviewAfterEmissionChange(selectedEmitter)" /></label>
              <label class="field" title="相对于父发射器生命周期，包含该 Tick；-1 表示不限制"><span>生效终点 Tick（-1=不限）</span><input v-model.number="selectedEmitter.emission.endTick" class="input" type="number" min="-1" step="1" @change="restartPreviewAfterEmissionChange(selectedEmitter)" /></label>
              <label class="field"><span>发射模式</span><select v-model="selectedEmitter.emission.mode" class="input" @change="restartPreviewAfterEmissionChange(selectedEmitter)"><option value="continuous">连续 / 每 Tick</option><option value="burst">脉冲 / 按间隔</option><option value="once">单次 / 仅一次</option></select></label>
              <label v-if="selectedEmitter.emission.mode === 'burst'" class="field"><span>脉冲间隔 Tick</span><input v-model.number="selectedEmitter.emission.burstInterval" class="input" type="number" min="1" step="1" @change="restartPreviewAfterEmissionChange(selectedEmitter)" /></label>
            </div>
          </section>

          <section class="editor-section">
            <div class="section-title">粒子参数</div>
            <div class="grid4">
              <BindableField :card="selectedEmitter" path="particle.countMin" label="最少数量" value-type="int" min="1" step="1" />
              <BindableField :card="selectedEmitter" path="particle.countMax" label="最多数量" value-type="int" min="1" step="1" />
              <BindableField :card="selectedEmitter" path="particle.lifeMin" label="最短寿命 Tick" value-type="int" min="1" step="1" />
              <BindableField :card="selectedEmitter" path="particle.lifeMax" label="最长寿命 Tick" value-type="int" min="1" step="1" />
            </div>
            <div class="grid4">
              <BindableField :card="selectedEmitter" path="particle.sizeMin" label="最小大小" min="0" step="0.01" />
              <BindableField :card="selectedEmitter" path="particle.sizeMax" label="最大大小" min="0" step="0.01" />
              <label class="field"><span>颜色过渡</span><select v-model="selectedEmitter.particle.colorOverLifeEnabled" class="input"><option :value="true">开启</option><option :value="false">关闭</option></select></label>
              <BindableField :card="selectedEmitter" path="particle.visibleRange" label="可见距离" value-type="float" min="1" step="1" />
            </div>
            <BindableColorVector :card="selectedEmitter" path="particle.colorStart" label="颜色 0%" />
            <BindableColorVector :card="selectedEmitter" path="particle.colorEnd" label="颜色 100%" />
            <BindableVector :card="selectedEmitter" path="particle.velocity" label="速度方向" value-type="vec3" step="0.01" />
            <BindableVector :card="selectedEmitter" path="particle.velocityRandom" label="速度随机量" value-type="vec3" min="0" step="0.01" />
            <div class="grid3">
              <BindableField :card="selectedEmitter" path="particle.speedMin" label="最小速度" min="0" step="0.01" />
              <BindableField :card="selectedEmitter" path="particle.speedMax" label="最大速度" min="0" step="0.01" />
              <label class="field"><span>速度模式</span><select v-model="selectedEmitter.particle.velocityMode" class="input"><option value="fixed">固定方向</option><option value="spawn_relative">从发射点向外</option></select></label>
            </div>
          </section>

          <section class="editor-section">
            <div class="section-title">渲染与姿态</div>
            <div class="grid3">
              <label class="field"><span>相机模式</span><select v-model="selectedEmitter.render.billboardMode" class="input" @change="syncBillboardScaleMode(selectedEmitter)"><option v-for="mode in billboardModes" :key="mode.id" :value="mode.id">{{ mode.label }}</option></select></label>
              <BindableField :card="selectedEmitter" path="render.alpha" label="不透明度 %" min="0" max="100" step="1" />
              <BindableField :card="selectedEmitter" path="render.light" label="亮度" value-type="int" min="-1" max="15" step="1" />
            </div>
            <div class="grid3">
              <BindableField :card="selectedEmitter" path="render.roll" label="滚转角 °" step="1" />
              <template v-if="selectedEmitter.render.billboardMode === 'axis_billboard'">
                <label class="field"><span>轴向偏航角 °</span><input class="input" type="number" step="1" :value="axisYaw(selectedEmitter)" @input="updateAxisAngle(selectedEmitter, 'yaw', $event.target.value)" /></label>
                <label class="field"><span>轴向俯仰角 °</span><input class="input" type="number" step="1" :value="axisPitch(selectedEmitter)" @input="updateAxisAngle(selectedEmitter, 'pitch', $event.target.value)" /></label>
              </template>
              <template v-else-if="selectedEmitter.render.billboardMode === 'none'">
                <BindableField :card="selectedEmitter" path="render.yaw" label="偏航角 °" step="1" />
                <BindableField :card="selectedEmitter" path="render.pitch" label="俯仰角 °" step="1" />
              </template>
            </div>
            <div class="grid3">
              <label class="field"><span>缩放模式</span><select v-model="selectedEmitter.render.scaleMode" class="input"><option v-for="mode in scaleModeOptions(selectedEmitter)" :key="mode.id" :value="mode.id">{{ mode.label }}</option></select></label>
              <BindableField :card="selectedEmitter" path="render.baseScale.x" label="宽度倍率" value-type="float" min="0" step="0.01" />
              <BindableField :card="selectedEmitter" path="render.baseScale.y" label="高度倍率" value-type="float" min="0" step="0.01" />
            </div>
            <div class="grid3">
              <BindableField v-if="usesDepthScale(selectedEmitter)" :card="selectedEmitter" path="render.baseScale.z" label="深度倍率" value-type="float" min="0" step="0.01" />
              <BindableField :card="selectedEmitter" path="render.sign" label="标记值" value-type="int" step="1" />
              <BindableField :card="selectedEmitter" path="render.speedLimit" label="速度上限" min="0" step="1" />
            </div>
          </section>

          <section class="editor-section">
            <div class="section-title">生命周期曲线</div>
            <div class="curve-stack">
              <div class="curve-option-row">
                <label class="check-row"><input v-model="selectedEmitter.curves.size.syncAxes" type="checkbox" />大小同步</label>
              </div>
              <LifecycleCurveEditor v-if="selectedEmitter.curves.size.syncAxes" title="大小 / 缩放" :curve="selectedEmitter.curves.size.x" />
              <details v-else class="axis-curve-box" open>
                <summary>缩放轴向曲线</summary>
                <div class="axis-curve-content">
                  <LifecycleCurveEditor title="大小 X / 宽度" :curve="selectedEmitter.curves.size.x" />
                  <LifecycleCurveEditor title="大小 Y / 高度" :curve="selectedEmitter.curves.size.y" />
                  <LifecycleCurveEditor v-if="usesDepthScale(selectedEmitter)" title="大小 Z / 深度" :curve="selectedEmitter.curves.size.z" />
                </div>
              </details>
              <LifecycleCurveEditor title="亮度" :curve="selectedEmitter.curves.brightness" :hard-min="-1" :hard-max="15" />
              <div class="curve-option-row">
                <label class="check-row"><input v-model="selectedEmitter.curves.rotation.syncAxes" type="checkbox" />旋转同步</label>
              </div>
              <LifecycleCurveEditor v-if="selectedEmitter.curves.rotation.syncAxes || !showRotationAxisCurves(selectedEmitter)" title="滚转角" :curve="selectedEmitter.curves.rotation.roll" />
              <details v-else class="axis-curve-box" open>
                <summary>旋转轴向曲线</summary>
                <div class="axis-curve-content">
                  <LifecycleCurveEditor title="滚转角" :curve="selectedEmitter.curves.rotation.roll" />
                  <LifecycleCurveEditor title="偏航角" :curve="selectedEmitter.curves.rotation.yaw" />
                  <LifecycleCurveEditor title="俯仰角" :curve="selectedEmitter.curves.rotation.pitch" />
                </div>
              </details>
              <LifecycleCurveEditor title="不透明度" :curve="selectedEmitter.curves.opacity" :hard-min="0" :hard-max="100" value-suffix="%" />
            </div>
          </section>
        </template>

        <div v-else class="empty-state">在左侧选择发射器或命令队列。</div>
      </aside>
    </main>

    <section v-else class="generator-code-page">
      <div class="generator-panel code-panel-wide">
        <div class="panel-title-row">
          <strong>Kotlin 输出</strong>
          <button class="btn small primary" @click="copyKotlin">复制代码</button>
        </div>
        <pre class="kotlin-output">{{ kotlinOutput }}</pre>
      </div>
    </section>
  </div>
  <div v-else class="generator-loading" role="status">正在打开项目...</div>
</template>

<script setup>
import { RouterLink } from 'vue-router';
import { computed, defineComponent, h, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router';
import PreviewCanvas from '../components/PreviewCanvas.vue';
import LifecycleCurveEditor from '../components/LifecycleCurveEditor.vue';
import GeneratorParameterValueEditor from '../components/GeneratorParameterValueEditor.vue';
import {
  BILLBOARD_MODES,
  COMMAND_TYPE_OPTIONS,
  EFFECT_OPTIONS,
  EMITTER_TYPES,
  GENERATOR_VALUE_TYPES,
  GENERATOR_HOTKEY_DEFAULTS,
  GENERATOR_THEME_OPTIONS,
  TEXTURE_SHEET_OPTIONS,
  createCommandQueue,
  createDefaultCommandParams,
  createEmitterCard,
  createGeneratorConstant,
  createGeneratorProject,
  createGeneratorVariable,
  createQueueCommand,
  normalizeGeneratorProject
} from '../modules/generator/defaults.js';
import { generateEmitterKotlin } from '../modules/generator/codegen.js';
import { createGeneratorPreviewRuntime } from '../modules/generator/preview-simulation.js';
import {
  consumePendingGeneratorProject,
  getElectronShell,
  isElectronShell,
  openProjectResult,
  sanitizeFileBase
} from '../services/shell/electron-shell.js';
import { classifyProjectData } from '../modules/projects/project-types.js';
import { getProjectRepository } from '../services/repositories/project-repository.js';
import { evaluatePointsProject } from '../modules/pointsbuilder/evaluator.js';
import {
  filterGeneratorBindingsByType,
  filterGeneratorValueNameInput,
  isGeneratorValueName
} from '../modules/generator/parameter-values.js';
import {
  getProjectNodes
} from '../modules/pointsbuilder/defaults.js';

const STORAGE_KEY = 'vue_emitter_generator_state_v2';
const MAX_PREVIEW_UPDATES_PER_SECOND = 60;
const LEFT_PANEL_MIN_WIDTH = 220;
const RIGHT_PANEL_MIN_WIDTH = 260;
const PREVIEW_MIN_WIDTH = 160;
const PANEL_RESIZER_WIDTH = 8;
const PANEL_WIDTH_MAX_FALLBACK = 2400;
const fileInputRef = ref(null);
const previewCanvasRef = ref(null);
const route = useRoute();
const router = useRouter();
const projectRepository = getProjectRepository();
const fpsText = ref('--');
const previewTick = ref(0);
const previewPoints = shallowRef([]);
const previewErrors = ref([]);
const doTickText = ref('');
const project = ref(createGeneratorProject(loadSavedProject()));
const currentProjectPath = ref('');
const projectReady = ref(!String(route.query.projectId || ''));
const loadedProjectId = ref('');
const previewRuntime = createGeneratorPreviewRuntime();
let tickTimer = 0;
let panelResize = null;
let historyTimer = 0;
let indexedSaveTimer = 0;
let projectLoadToken = 0;
let indexedSaveQueue = Promise.resolve();
let historyApplying = false;
const undoStack = [];
const redoStack = [];

const leftTabs = [
  { id: 'emitters', label: '发射器' },
  { id: 'queues', label: '命令队列' },
  { id: 'project', label: '项目设置' },
  { id: 'tick', label: '每 Tick' },
  { id: 'death', label: '死亡行为' },
  { id: 'settings', label: '设置' }
];

const emitterTypes = EMITTER_TYPES;
const billboardModes = BILLBOARD_MODES;
const effectOptions = EFFECT_OPTIONS;
const textureSheetOptions = TEXTURE_SHEET_OPTIONS;
const effectAutocompleteOptions = EFFECT_OPTIONS.map((item) => ({ value: item.className, label: item.label }));
const renderTypeAutocompleteOptions = TEXTURE_SHEET_OPTIONS.map((item) => ({ value: item.id, label: item.label }));
const generatorValueTypes = GENERATOR_VALUE_TYPES;
const commandTypeOptions = COMMAND_TYPE_OPTIONS;
const generatorThemeOptions = GENERATOR_THEME_OPTIONS;
const hotkeyFields = [
  { key: 'playPause', label: '播放 / 暂停' },
  { key: 'clearParticles', label: '清理粒子' },
  { key: 'resetCamera', label: '重置镜头' },
  { key: 'fullscreen', label: '全屏预览' },
  { key: 'deleteEmitter', label: '删除发射器' },
  { key: 'undo', label: '撤销（Ctrl）' },
  { key: 'redo', label: '重做（Ctrl）' }
];

const selectedEmitter = computed(() => project.value.emitters.find((card) => card.id === project.value.selectedEmitterId) || project.value.emitters[0] || null);
const selectedQueue = computed(() => project.value.commandQueues.find((queue) => queue.id === project.value.selectedQueueId) || project.value.commandQueues[0] || null);
const kotlinOutput = computed(() => generateEmitterKotlin(project.value));
const previewInterpolationMs = computed(() => {
  const ticksPerSecond = Math.max(1, Number(project.value.ticksPerSecond || 20));
  const updateRate = Math.min(ticksPerSecond, MAX_PREVIEW_UPDATES_PER_SECOND);
  return Math.max(16, 1000 / updateRate);
});
const workspaceStyle = computed(() => ({
  '--left-panel-width': `${project.value.settings.leftPanelWidth || 340}px`,
  '--right-panel-width': `${project.value.settings.rightPanelWidth || 480}px`
}));
const bindableRefs = computed(() => [
  ...(project.value.parameters?.variables || []),
  ...(project.value.parameters?.constants || [])
].filter((item) => isGeneratorValueName(item?.name)).map((item) => ({
  name: item.name,
  type: item.type,
  label: `${item.name} : ${item.type}${item.codec === false ? ' const' : ''}`
})));
const vectorBindingModes = [
  { id: 'constant', label: '常量' },
  { id: 'independent', label: '独立变量' },
  { id: 'vector', label: '向量变量' }
];

const BindableField = defineComponent({
  name: 'BindableField',
  props: {
    card: { type: Object, required: true },
    path: { type: String, required: true },
    label: { type: String, required: true },
    valueType: { type: String, default: 'number' },
    inputType: { type: String, default: '' },
    step: { type: [String, Number], default: '0.01' },
    min: { type: [String, Number], default: undefined },
    max: { type: [String, Number], default: undefined },
    list: { type: String, default: '' },
    options: { type: Array, default: () => [] },
    autocompleteOptions: { type: Array, default: () => [] },
    compact: { type: Boolean, default: false }
  },
  setup(props) {
    return () => h('label', { class: ['field', 'bindable-field', { compact: props.compact }] }, [
      h('span', props.label),
      renderBindableSingleInput(props.card, props.path, props)
    ]);
  }
});

const MinecraftAutocomplete = defineComponent({
  name: 'MinecraftAutocomplete',
  props: {
    modelValue: { type: String, default: '' },
    options: { type: Array, default: () => [] },
    maxItems: { type: Number, default: 10 },
    placeholder: { type: String, default: '' },
    title: { type: String, default: '' }
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    const open = ref(false);
    const activeIndex = ref(0);
    const matches = computed(() => {
      const query = String(props.modelValue || '').trim().toLowerCase();
      const normalized = props.options
        .map((item) => ({
          value: String(item?.value || ''),
          label: String(item?.label || item?.value || '')
        }))
        .filter((item) => item.value);
      const filtered = query
        ? normalized.filter((item) => item.value.toLowerCase().includes(query) || item.label.toLowerCase().includes(query))
        : normalized;
      return filtered
        .sort((a, b) => scoreAutocomplete(a, query) - scoreAutocomplete(b, query) || a.value.localeCompare(b.value))
        .slice(0, Math.max(1, props.maxItems));
    });

    function update(value) {
      emit('update:modelValue', value);
      activeIndex.value = 0;
      open.value = true;
    }

    function accept(index = activeIndex.value) {
      const item = matches.value[index];
      if (!item) return;
      emit('update:modelValue', item.value);
      open.value = false;
    }

    function move(delta) {
      if (!matches.value.length) return;
      open.value = true;
      activeIndex.value = (activeIndex.value + delta + matches.value.length) % matches.value.length;
    }

    function onKeydown(event) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        move(1);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        move(-1);
        return;
      }
      if ((event.key === 'Tab' || event.key === 'Enter') && open.value && matches.value.length) {
        event.preventDefault();
        accept();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        open.value = false;
      }
    }

    return () => h('div', { class: 'mc-autocomplete' }, [
      h('input', {
        class: 'input',
        type: 'text',
        value: props.modelValue,
        placeholder: props.placeholder,
        title: props.title || undefined,
        autocomplete: 'off',
        spellcheck: 'false',
        onInput: (event) => update(event.target.value),
        onFocus: () => { open.value = true; },
        onBlur: () => { window.setTimeout(() => { open.value = false; }, 100); },
        onKeydown
      }),
      open.value && matches.value.length
        ? h('div', { class: 'mc-suggestions' }, matches.value.map((item, index) => h('button', {
          key: item.value,
          type: 'button',
          class: ['mc-suggestion', { active: index === activeIndex.value }],
          onMouseenter: () => { activeIndex.value = index; },
          onMousedown: (event) => {
            event.preventDefault();
            accept(index);
          }
        }, [
          h('span', { class: 'mc-suggestion-main' }, item.value),
          item.label !== item.value ? h('span', { class: 'mc-suggestion-label' }, item.label) : null
        ])))
        : null
    ]);
  }
});

const BindableVector = defineComponent({
  name: 'BindableVector',
  props: {
    card: { type: Object, required: true },
    path: { type: String, required: true },
    label: { type: String, required: true },
    valueType: { type: String, default: 'vector' },
    step: { type: [String, Number], default: '0.01' },
    min: { type: [String, Number], default: undefined }
  },
  setup(props) {
    const axes = [
      { key: 'x', label: 'X' },
      { key: 'y', label: 'Y' },
      { key: 'z', label: 'Z' }
    ];
    return () => {
      const mode = getBindingMode(props.card, props.path);
      const controls = mode === 'constant'
        ? h('div', { class: 'bindable-axis-grid' }, axes.map((axis) => renderAxisNumberInput(props.card, props.path, axis, {
          step: props.step,
          min: props.min
        })))
        : mode === 'independent'
          ? h('div', { class: 'bindable-axis-grid' }, axes.map((axis) => renderAxisExpressionInput(
            props.card,
            `${props.path}.${axis.key}`,
            axis,
            bindingOptions('number')
          )))
          : h('div', { class: 'bindable-single-expression' }, [
            renderBindingExpressionInput(props.card, props.path, props.valueType, '整体变量')
          ]);
      return h('div', { class: ['bindable-vector-row', `bindable-vector-row--${mode}`] }, [
        h('span', { class: 'vector-label' }, props.label),
        h('div', { class: 'bindable-vector-grid' }, [
          h('div', { class: 'bindable-vector-head' }, [
            h('span', { class: 'vector-kind' }, props.valueType === 'relative' ? '空间点' : 'Vec3'),
            renderModeSegment(props.card, props.path, mode)
          ]),
          controls
        ])
      ]);
    };
  }
});

const BindableColorVector = defineComponent({
  name: 'BindableColorVector',
  props: {
    card: { type: Object, required: true },
    path: { type: String, required: true },
    label: { type: String, required: true }
  },
  setup(props) {
    const axes = [
      { key: 'r', label: 'R' },
      { key: 'g', label: 'G' },
      { key: 'b', label: 'B' }
    ];
    return () => {
      const mode = getBindingMode(props.card, props.path);
      const controls = mode === 'constant'
        ? h('div', { class: 'bindable-color-constant' }, [
          h('div', { class: 'color-main-row' }, [
            h('input', {
              class: 'input color-picker-input',
              type: 'color',
              value: colorHexValue(props.card, props.path),
              title: '调色板',
              onInput: (event) => setPath(props.card, props.path, colorHexValueFromInput(event.target.value))
            }),
            h('input', {
              class: 'input color-text-input',
              type: 'text',
              value: colorTextValue(props.card, props.path),
              placeholder: '255, 128, 0 / 0xFF8000',
              spellcheck: 'false',
              onChange: (event) => applyColorText(props.card, props.path, event.target.value)
            })
          ]),
          h('div', { class: 'color-channel-grid' }, axes.map((axis) => h('label', { key: axis.key, class: 'axis-number color-channel-number' }, [
            h('span', { class: 'axis-chip' }, axis.label),
            h('input', {
              class: 'input',
              type: 'number',
              min: '0',
              max: '255',
              step: '1',
              value: colorChannelValue(props.card, props.path, axis.key),
              onInput: (event) => updateColorChannel(props.card, props.path, axis.key, event.target.value)
            })
          ])))
        ])
        : mode === 'independent'
          ? h('div', { class: 'bindable-axis-grid' }, axes.map((axis) => renderAxisExpressionInput(
            props.card,
            `${props.path}.${axis.key}`,
            axis,
            bindingOptions('number')
          )))
          : h('div', { class: 'bindable-single-expression' }, [
            renderBindingExpressionInput(props.card, props.path, 'color', 'RGB 向量变量')
          ]);
      return h('div', { class: ['bindable-vector-row', 'bindable-color-vector-row', `bindable-vector-row--${mode}`] }, [
        h('span', { class: 'vector-label' }, props.label),
        h('div', { class: 'bindable-vector-grid' }, [
          h('div', { class: 'bindable-vector-head' }, [
            h('span', { class: 'vector-kind' }, '颜色'),
            renderModeSegment(props.card, props.path, mode)
          ]),
          controls
        ])
      ]);
    };
  }
});

const EmitterSpecificFields = defineComponent({
  name: 'EmitterSpecificFields',
  props: { card: { type: Object, required: true } },
  setup(props) {
    const field = (label, path, attrs = {}) => h(BindableField, {
      card: props.card,
      label,
      path,
      valueType: attrs.valueType || 'number',
      step: attrs.step || '0.1',
      min: attrs.min,
      compact: true
    });
    const vector = (label, base, attrs = {}) => h(BindableVector, {
      card: props.card,
      label,
      path: base,
      valueType: attrs.valueType || 'relative',
      step: attrs.step || '0.1',
      min: attrs.min
    });
    return () => {
      const type = props.card.emitter.type;
      if (type === 'points_builder') {
        const pointCount = pointsBuilderCount(props.card);
        return h('div', { class: 'field-pack builder-link' }, [
          h('div', { class: 'panel-title-row compact' }, [
            h('span', { class: 'section-title' }, 'PointsBuilder'),
            h('span', { class: 'chip' }, `点数：${pointCount}`)
          ]),
          h('div', { class: 'kv-list' }, [
            h('div', { class: 'kv-row display-row' }, [
              h('div', { class: 'builder-actions' }, [
                h('button', {
                  class: 'btn small primary',
                  type: 'button',
                  onClick: () => openEmitterPointsBuilder(props.card)
                }, '编辑 PointsBuilder')
              ])
            ]),
            h('div', { class: 'kv-row display-row' }, [
              h('div', { class: 'builder-meta' }, `节点 ${pointsBuilderNodeCount(props.card)} / 预览点 ${pointCount}`)
            ])
          ])
        ]);
      }
      if (type === 'box') {
        return h('div', { class: 'field-pack' }, [
          h('div', { class: 'grid4' }, [
            field('盒体 X', 'emitter.box.x'),
            field('盒体 Y', 'emitter.box.y'),
            field('盒体 Z', 'emitter.box.z'),
            h('label', { class: 'field' }, [
              h('span', '仅表面'),
              h('select', {
                class: 'input',
                value: String(props.card.emitter.box.surface),
                onChange: (event) => { props.card.emitter.box.surface = event.target.value === 'true'; }
              }, [h('option', { value: 'false' }, '否'), h('option', { value: 'true' }, '是')])
            ])
          ])
        ]);
      }
      if (type === 'sphere') return h('div', { class: 'compact-field-grid' }, [field('半径', 'emitter.sphere.r')]);
      if (type === 'sphere_surface') return h('div', { class: 'compact-field-grid' }, [field('球面半径', 'emitter.sphereSurface.r')]);
      if (type === 'line') return h('div', { class: 'field-pack' }, [field('步长', 'emitter.line.step'), vector('方向', 'emitter.line.dir')]);
      if (type === 'circle') return h('div', { class: 'field-pack' }, [field('半径', 'emitter.circle.r'), vector('法线轴', 'emitter.circle.axis')]);
      if (type === 'ring') return h('div', { class: 'field-pack' }, [h('div', { class: 'grid2' }, [field('半径', 'emitter.ring.r'), field('厚度', 'emitter.ring.thickness')]), vector('法线轴', 'emitter.ring.axis')]);
      if (type === 'arc') return h('div', { class: 'field-pack' }, [h('div', { class: 'grid4' }, [field('半径', 'emitter.arc.r'), field('起始角', 'emitter.arc.start'), field('结束角', 'emitter.arc.end'), field('整体旋转', 'emitter.arc.rotate')]), vector('法线轴', 'emitter.arc.axis')]);
      if (type === 'spiral') return h('div', { class: 'field-pack' }, [h('div', { class: 'grid4' }, [field('起始半径', 'emitter.spiral.startR'), field('结束半径', 'emitter.spiral.endR'), field('高度', 'emitter.spiral.height'), field('旋转速度', 'emitter.spiral.rotateSpeed')]), h('div', { class: 'grid2' }, [field('半径偏置', 'emitter.spiral.rBias'), field('高度偏置', 'emitter.spiral.hBias')]), vector('轴', 'emitter.spiral.axis')]);
      return h('div', { class: 'field-pack empty-state' }, '点发射器只使用世界偏移。');
    };
  }
});

function getPath(target, path) {
  return String(path).split('.').reduce((obj, key) => obj?.[key], target);
}

function setPath(target, path, value) {
  const parts = String(path).split('.');
  const last = parts.pop();
  const parent = parts.reduce((obj, key) => obj?.[key], target);
  if (parent && last) parent[last] = value;
}

function renderBindableSingleInput(card, path, props) {
  if (props.valueType === 'none' || props.options?.length) {
    return renderValueInput(card, path, props);
  }
  const value = getBinding(card, path) || formatBindableSingleValue(getPath(card, path), props.valueType);
  const options = [
    ...(props.autocompleteOptions || []),
    ...bindingOptions(props.valueType).map((item) => ({
      value: item.name,
      label: item.label
    }))
  ];
  return h(MinecraftAutocomplete, {
    class: 'bindable-single-input',
    modelValue: value,
    options,
    maxItems: 10,
    placeholder: props.valueType === 'string' ? '值 / 变量' : '数值 / 变量',
    title: '输入常量或变量名',
    'onUpdate:modelValue': (next) => applyBindableSingleInput(card, path, next, props.valueType)
  });
}

function formatBindableSingleValue(value, valueType = 'number') {
  if (valueType === 'boolean') return value === true ? 'true' : 'false';
  return String(value ?? '');
}

function applyBindableSingleInput(card, path, value, valueType = 'number') {
  const text = String(value ?? '').trim();
  if (!text) {
    setBinding(card, path, '');
    if (valueType === 'string') setPath(card, path, '');
    return;
  }
  if (valueType === 'string') {
    const matchedBinding = bindingOptions('string').find((item) => item.name === text);
    if (matchedBinding) {
      setBinding(card, path, text);
    } else {
      setBinding(card, path, '');
      setPath(card, path, text);
    }
    return;
  }
  if (valueType === 'boolean') {
    if (/^(true|false)$/i.test(text)) {
      setBinding(card, path, '');
      setPath(card, path, /^true$/i.test(text));
    } else {
      setBinding(card, path, text);
    }
    return;
  }
  if (['number', 'int', 'long', 'float'].includes(valueType)) {
    const numeric = Number(text);
    if (Number.isFinite(numeric)) {
      setBinding(card, path, '');
      setPath(card, path, valueType === 'int' || valueType === 'long' ? Math.trunc(numeric) : numeric);
    } else {
      setBinding(card, path, text);
    }
    return;
  }
  setBinding(card, path, text);
}

function renderValueInput(card, path, props) {
  const value = getPath(card, path);
  if (props.options?.length) {
    return h('select', {
      class: 'input',
      value,
      onChange: (event) => setPath(card, path, coerceBindableInputValue(event.target.value, props.valueType))
    }, props.options.map((option) => h('option', { value: option.value }, option.label)));
  }
  const inputType = props.inputType || (props.valueType === 'color' ? 'color' : props.valueType === 'string' ? 'text' : 'number');
  if (inputType === 'text' && props.autocompleteOptions?.length) {
    return h(MinecraftAutocomplete, {
      modelValue: String(value || ''),
      options: props.autocompleteOptions,
      maxItems: 10,
      'onUpdate:modelValue': (next) => setPath(card, path, coerceBindableInputValue(next, props.valueType))
    });
  }
  return h('input', {
    class: ['input', { 'color-input': inputType === 'color' }],
    type: inputType,
    inputmode: props.valueType === 'number' || props.valueType === 'int' ? 'decimal' : undefined,
    step: props.step,
    min: props.min,
    max: props.max,
    list: props.list || undefined,
    value,
    onInput: (event) => setPath(card, path, coerceBindableInputValue(event.target.value, props.valueType))
  });
}

function renderBindingSelect(card, path, valueType, emptyLabel = '变量') {
  return renderBindingExpressionInput(card, path, valueType, emptyLabel);
}

function bindingOptions(valueType = 'number') {
  return filterGeneratorBindingsByType(bindableRefs.value, valueType);
}

function getBinding(card, path) {
  return String(card?.bindings?.[path] || '');
}

function setBinding(card, path, value) {
  if (!card.bindings || typeof card.bindings !== 'object') card.bindings = {};
  const next = String(value || '').trim();
  if (next) card.bindings[path] = next;
  else delete card.bindings[path];
}

function renderBindingExpressionInput(card, path, valueType, placeholder = '变量') {
  if (valueType === 'none') return null;
  return h(MinecraftAutocomplete, {
    class: 'binding-expression',
    modelValue: getBinding(card, path),
    options: bindingOptions(valueType),
    maxItems: 10,
    placeholder,
    title: '绑定变量或常量',
    'onUpdate:modelValue': (next) => setBinding(card, path, next)
  });
}

function renderAxisExpressionInput(card, path, axis, options) {
  return h('label', { key: axis.key, class: 'axis-expression' }, [
    h('span', { class: 'axis-chip' }, axis.label),
    h(MinecraftAutocomplete, {
      class: 'binding-expression',
      modelValue: getBinding(card, path),
      options,
      maxItems: 10,
      placeholder: axis.label,
      title: '绑定变量或常量',
      'onUpdate:modelValue': (next) => setBinding(card, path, next)
    })
  ]);
}

function renderAxisNumberInput(card, basePath, axis, attrs = {}) {
  return h('label', { key: axis.key, class: 'axis-number' }, [
    h('span', { class: 'axis-chip' }, axis.label),
    h('input', {
      class: 'input',
      type: 'number',
      step: attrs.step || '0.01',
      min: attrs.min,
      value: getPath(card, `${basePath}.${axis.key}`),
      onInput: (event) => setPath(card, `${basePath}.${axis.key}`, coerceBindableInputValue(event.target.value, 'number'))
    })
  ]);
}

function renderModeSegment(card, path, currentMode) {
  return h('select', {
    class: 'input mode-select',
    value: currentMode,
    'aria-label': '参数类型',
    onChange: (event) => setBindingMode(card, path, event.target.value)
  }, vectorBindingModes.map((mode) => h('option', {
    key: mode.id,
    value: mode.id
  }, mode.label)));
}

function getBindingMode(card, path) {
  const explicit = String(card?.bindingModes?.[path] || '').trim();
  if (vectorBindingModes.some((mode) => mode.id === explicit)) return explicit;
  if (getBinding(card, path)) return 'vector';
  if (['x', 'y', 'z', 'r', 'g', 'b'].some((axis) => getBinding(card, `${path}.${axis}`))) return 'independent';
  return 'constant';
}

function setBindingMode(card, path, mode) {
  if (!card.bindingModes || typeof card.bindingModes !== 'object') card.bindingModes = {};
  if (mode === 'constant') delete card.bindingModes[path];
  else card.bindingModes[path] = mode;
  if (mode === 'constant') {
    clearBindings(card, [path, ...['x', 'y', 'z', 'r', 'g', 'b'].map((axis) => `${path}.${axis}`)]);
  } else if (mode === 'independent') {
    clearBindings(card, [path]);
  } else if (mode === 'vector') {
    clearBindings(card, ['x', 'y', 'z', 'r', 'g', 'b'].map((axis) => `${path}.${axis}`));
  }
}

function clearBindings(card, paths) {
  if (!card?.bindings || typeof card.bindings !== 'object') return;
  paths.forEach((path) => { delete card.bindings[path]; });
}

function colorHexValue(card, path) {
  const value = String(getPath(card, path) || '');
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value;
  const rgb = hexToRgb(value);
  return rgbToHex(rgb.r, rgb.g, rgb.b);
}

function colorHexValueFromInput(value) {
  const text = String(value || '').trim();
  return /^#[0-9a-fA-F]{6}$/.test(text) ? text : '#ffffff';
}

function colorTextValue(card, path) {
  const rgb = hexToRgb(getPath(card, path));
  return `${Math.round(rgb.r)}, ${Math.round(rgb.g)}, ${Math.round(rgb.b)}`;
}

function colorChannelValue(card, path, channel) {
  return Math.round(hexToRgb(getPath(card, path))[channel] || 0);
}

function updateColorChannel(card, path, channel, value) {
  const rgb = hexToRgb(getPath(card, path));
  rgb[channel] = clampNumber(value, 0, 255, rgb[channel] || 0);
  setPath(card, path, rgbToHex(rgb.r, rgb.g, rgb.b));
}

function applyColorText(card, path, value) {
  const parsed = parseColorInput(value);
  if (!parsed) return;
  setPath(card, path, rgbToHex(parsed.r, parsed.g, parsed.b));
}

function parseColorInput(value) {
  const text = String(value || '').trim();
  const hex = text.match(/^(?:#|0x)?([0-9a-fA-F]{6})$/);
  if (hex) return hexToRgb(`#${hex[1]}`);
  const numbers = text
    .replace(/^rgba?\(/i, '')
    .replace(/\)$/g, '')
    .split(/[,\s]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (numbers.length < 3) return null;
  return {
    r: clampNumber(numbers[0], 0, 255, 255),
    g: clampNumber(numbers[1], 0, 255, 255),
    b: clampNumber(numbers[2], 0, 255, 255)
  };
}

function coerceBindableInputValue(value, valueType = 'number') {
  if (valueType === 'string' || valueType === 'color') return String(value || '');
  if (valueType === 'boolean') return value === true || value === 'true';
  if (valueType === 'int') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.trunc(numeric) : 0;
  }
  if (valueType === 'number') {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }
  return value;
}

function scoreAutocomplete(item, query) {
  if (!query) return 0;
  const value = item.value.toLowerCase();
  const label = item.label.toLowerCase();
  if (value === query) return 0;
  if (value.startsWith(query)) return 1;
  if (label.startsWith(query)) return 2;
  if (value.includes(query)) return 3;
  return 4;
}

function addProjectVariable() {
  project.value.parameters.variables.push(createGeneratorVariable({
    name: `var${project.value.parameters.variables.length + 1}`,
    type: 'Double',
    value: 0
  }));
}

function removeProjectVariable(id) {
  removeProjectParameter(project.value.parameters.variables, id);
}

function addProjectConstant() {
  project.value.parameters.constants.push(createGeneratorConstant({
    name: `const${project.value.parameters.constants.length + 1}`,
    type: 'Double',
    value: 0
  }));
}

function removeProjectConstant(id) {
  removeProjectParameter(project.value.parameters.constants, id);
}

function removeProjectParameter(list, id) {
  const index = list.findIndex((item) => item.id === id);
  if (index >= 0) list.splice(index, 1);
}

function syncParameterType(item) {
  if (!item) return;
  item.value = defaultParameterValue(item.type);
  if (item.type !== 'Vector3f') delete item.colorMode;
}

function updateParameterName(item, event) {
  if (!item) return;
  const next = filterGeneratorValueNameInput(event?.target?.value);
  item.name = next;
  if (event?.target && event.target.value !== next) event.target.value = next;
}

function defaultParameterValue(type) {
  if (type === 'Boolean') return false;
  if (type === 'String') return '';
  if (type === 'Vec3') return 'Vec3(0.0, 0.0, 0.0)';
  if (type === 'RelativeLocation') return 'RelativeLocation(0.0, 0.0, 0.0)';
  if (type === 'Vector3f') return 'Vector3f(1.0f, 1.0f, 1.0f)';
  if (type === 'Long') return '0';
  return 0;
}

function ensureBuilderState(card) {
  if (!card.emitter.builderState) card.emitter.builderState = createGeneratorProject().emitters[0].emitter.builderState;
  return card.emitter.builderState;
}

function pointsBuilderCount(card) {
  try {
    return evaluatePointsProject(ensureBuilderState(card), { parameters: project.value.parameters }).length;
  } catch {
    return 0;
  }
}

function pointsBuilderNodeCount(card) {
  const nodes = getProjectNodes(ensureBuilderState(card));
  let total = 0;
  const walk = (list) => {
    (list || []).forEach((node) => {
      if (!node) return;
      total += 1;
      if (Array.isArray(node.children)) walk(node.children);
    });
  };
  walk(nodes);
  return total;
}

function openEmitterPointsBuilder(card) {
  if (!card) return;
  project.value.selectedEmitterId = card.id;
  ensureBuilderState(card);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(project.value));
  } catch {
    // ignore storage quota errors
  }
  router.push({
    name: 'generator-pointsbuilder',
    query: {
      emitterId: card.id,
      projectId: indexedProjectId(),
      projectType: route.query.projectType || 'generator'
    }
  });
}

function loadSavedProject() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

watch(project, (next) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage quota errors
  }
  syncPreviewPoints();
  scheduleHistorySnapshot();
  scheduleIndexedProjectSave();
}, { deep: true });

watch(() => project.value.settings.theme, (theme) => {
  document.documentElement.dataset.generatorTheme = theme;
}, { immediate: true });

onMounted(async () => {
  await consumeShellRouteState();
  previewRuntime.step(project.value, 1);
  previewTick.value = previewRuntime.getTick();
  syncPreviewPoints();
  pushHistorySnapshot();
  startTickTimer();
  window.addEventListener('keydown', handleGeneratorHotkey, true);
  window.addEventListener('coo-shell-command', handleShellCommand);
});

watch(() => [route.query.shellOpen, route.query.shellNew, route.query.projectId], () => {
  void consumeShellRouteState();
});

watch(() => project.value.ticksPerSecond, () => {
  startTickTimer();
});

function startTickTimer() {
  window.clearInterval(tickTimer);
  const ticksPerSecond = Math.max(1, Number(project.value.ticksPerSecond || 20));
  const updateRate = Math.min(ticksPerSecond, MAX_PREVIEW_UPDATES_PER_SECOND);
  const tickStep = Math.max(1, Math.round(ticksPerSecond / updateRate));
  tickTimer = window.setInterval(() => {
    if (!project.value.playing) return;
    previewRuntime.step(project.value, tickStep);
    previewTick.value = previewRuntime.getTick();
    syncPreviewPoints();
  }, Math.max(16, 1000 / updateRate));
}

onBeforeUnmount(() => {
  delete document.documentElement.dataset.generatorTheme;
  window.clearInterval(tickTimer);
  window.clearTimeout(historyTimer);
  window.clearTimeout(indexedSaveTimer);
  window.removeEventListener('keydown', handleGeneratorHotkey, true);
  window.removeEventListener('coo-shell-command', handleShellCommand);
  window.removeEventListener('pointermove', handlePanelResize);
  window.removeEventListener('pointerup', stopPanelResize);
});

function indexedProjectId() {
  return String(route.query.projectId || '');
}

async function saveIndexedProject() {
  const projectId = loadedProjectId.value;
  if (!projectId || !projectReady.value) return true;
  const snapshot = JSON.parse(JSON.stringify(project.value));
  const operation = indexedSaveQueue.then(() => projectRepository.save({
    id: projectId,
    tool: 'generator',
    name: snapshot.name || snapshot.kotlin?.className || 'EmitterGenerator',
    description: snapshot.description || '',
    payload: snapshot
  }));
  indexedSaveQueue = operation.catch(() => {});
  await operation;
  return true;
}

function scheduleIndexedProjectSave() {
  window.clearTimeout(indexedSaveTimer);
  if (!loadedProjectId.value) return;
  indexedSaveTimer = window.setTimeout(() => {
    indexedSaveTimer = 0;
    saveIndexedProject().catch(showShellError);
  }, 500);
}

onBeforeRouteLeave(async () => {
  window.clearTimeout(indexedSaveTimer);
  try {
    await saveIndexedProject();
  } catch (error) {
    showShellError(error);
    return false;
  }
});

onBeforeRouteUpdate(async () => {
  window.clearTimeout(indexedSaveTimer);
  try {
    await saveIndexedProject();
  } catch (error) {
    showShellError(error);
    return false;
  }
});

function restartPreview() {
  previewRuntime.reset();
  project.value.playing = true;
  previewRuntime.step(project.value, 1);
  previewTick.value = previewRuntime.getTick();
  syncPreviewPoints();
}

function togglePreviewPlayback() {
  project.value.playing = !project.value.playing;
}

function restartPreviewAfterRootLifecycleChange() {
  const lifecycle = project.value.rootLifecycle;
  lifecycle.intervalTick = Math.max(1, Math.trunc(Number(lifecycle.intervalTick) || 1));
  lifecycle.maxTick = Math.max(1, Math.trunc(Number(lifecycle.maxTick) || 1));
  restartPreview();
}

function restartPreviewAfterEmissionChange(card) {
  const emission = card?.emission;
  if (!emission) return;
  emission.startTick = Math.max(0, Math.trunc(Number(emission.startTick) || 0));
  const endTick = Math.trunc(Number(emission.endTick));
  emission.endTick = Number.isFinite(endTick) && endTick >= 0
    ? Math.max(emission.startTick, endTick)
    : -1;
  emission.burstInterval = Math.max(1, Math.trunc(Number(emission.burstInterval) || 1));
  restartPreview();
}

function clearPreviewParticles() {
  previewRuntime.clearParticles();
  syncPreviewPoints();
}

function syncPreviewPoints() {
  const data = previewRuntime.snapshotRenderData(project.value);
  previewErrors.value = Array.isArray(data?.errors) ? data.errors : [];
  previewPoints.value = applyPreviewRenderScale(
    data,
    project.value.settings.particleRenderScale
  );
}

function applyPreviewRenderScale(data, scale) {
  const factor = clampNumber(scale, 0.05, 20, 1);
  if (Math.abs(factor - 1) < 0.0001) return data;
  if (data?.kind === 'preview-buffers') {
    const sizes = new Float32Array(data.sizes);
    const count = Math.max(0, Math.trunc(Number(data.count || 0)));
    for (let index = 0; index < count; index += 1) sizes[index] *= factor;
    return { ...data, sizes };
  }
  if (!Array.isArray(data)) return data;
  const scaled = data.map((point) => ({
    ...point,
    scaleX: multiplyPositive(point.scaleX, factor),
    scaleY: multiplyPositive(point.scaleY, factor),
    scaleZ: multiplyPositive(point.scaleZ, factor),
    size: multiplyPositive(point.size, factor)
  }));
  if (Object.prototype.hasOwnProperty.call(data, 'effectSignature')) {
    Object.defineProperty(scaled, 'effectSignature', {
      value: data.effectSignature,
      configurable: true,
      writable: true,
      enumerable: false
    });
  }
  return scaled;
}

function multiplyPositive(value, factor) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric * factor : value;
}

function addEmitter() {
  const card = createEmitterCard({ name: `发射器 #${project.value.emitters.length + 1}` });
  project.value.emitters.push(card);
  project.value.selectedEmitterId = card.id;
  project.value.leftTab = 'emitters';
}

function cloneEmitter(card) {
  const clone = createEmitterCard(JSON.parse(JSON.stringify({
    ...card,
    id: undefined,
    name: `${card.name} 副本`
  })));
  project.value.emitters.push(clone);
  project.value.selectedEmitterId = clone.id;
}

function removeEmitter(id) {
  if (project.value.emitters.length <= 1) return;
  const index = project.value.emitters.findIndex((card) => card.id === id);
  if (index < 0) return;
  project.value.emitters.splice(index, 1);
  project.value.selectedEmitterId = project.value.emitters[Math.max(0, index - 1)]?.id || project.value.emitters[0]?.id || '';
}

function moveEmitter(index, delta) {
  const next = index + delta;
  if (next < 0 || next >= project.value.emitters.length) return;
  const [item] = project.value.emitters.splice(index, 1);
  project.value.emitters.splice(next, 0, item);
}

function addQueue() {
  const queue = createCommandQueue({ name: `命令队列 ${project.value.commandQueues.length + 1}` });
  project.value.commandQueues.push(queue);
  project.value.selectedQueueId = queue.id;
}

function removeQueue(id) {
  if (project.value.commandQueues.length <= 1) return;
  const index = project.value.commandQueues.findIndex((queue) => queue.id === id);
  if (index < 0) return;
  project.value.commandQueues.splice(index, 1);
  project.value.selectedQueueId = project.value.commandQueues[Math.max(0, index - 1)]?.id || project.value.commandQueues[0]?.id || '';
}

function addQueueCommandToSelected() {
  if (!selectedQueue.value) return;
  selectedQueue.value.commands.push(createQueueCommand({ label: `命令 ${selectedQueue.value.commands.length + 1}` }));
}

function removeQueueCommand(queue, commandId) {
  const index = queue.commands.findIndex((command) => command.id === commandId);
  if (index >= 0) queue.commands.splice(index, 1);
}

function updateQueueSigns(text) {
  if (!selectedQueue.value) return;
  selectedQueue.value.signs = String(text || '')
    .split(',')
    .map((item) => Number(item.trim()))
    .filter((item) => Number.isFinite(item))
    .map((item) => Math.trunc(item));
}

function syncBillboardScaleMode(card) {
  if (!card?.render) return;
  if (card.render.billboardMode !== 'none') {
    card.curves.rotation.syncAxes = false;
    card.render.baseScale.z = card.render.baseScale.y || card.render.baseScale.x || 1;
  }
}

function scaleModeOptions(card) {
  return usesDepthScale(card)
    ? [
      { id: 'uniform_xy', label: 'XY 等比' },
      { id: 'xyz', label: 'XYZ 独立' }
    ]
    : [
      { id: 'uniform_xy', label: 'XY 等比' },
      { id: 'xyz', label: '宽高独立' }
    ];
}

function usesDepthScale(card) {
  return card?.render?.billboardMode === 'none';
}

function showRotationAxisCurves(card) {
  return card?.render?.billboardMode === 'none' && card.curves.rotation.syncAxes === false;
}

function axisYaw(card) {
  const axis = normalizeVector(card?.render?.axis || { x: 0, y: 1, z: 0 });
  return formatAngle(Math.atan2(axis.x, axis.z) * 180 / Math.PI);
}

function axisPitch(card) {
  const axis = normalizeVector(card?.render?.axis || { x: 0, y: 1, z: 0 });
  return formatAngle(Math.asin(clampNumber(axis.y, -1, 1, 1)) * 180 / Math.PI);
}

function updateAxisAngle(card, key, value) {
  if (!card?.render) return;
  const yaw = key === 'yaw' ? Number(value) : Number(axisYaw(card));
  const pitch = key === 'pitch' ? Number(value) : Number(axisPitch(card));
  const yawRad = (Number.isFinite(yaw) ? yaw : 0) * Math.PI / 180;
  const pitchRad = (Number.isFinite(pitch) ? pitch : 90) * Math.PI / 180;
  const horizontal = Math.cos(pitchRad);
  card.render.axis = {
    x: Number((Math.sin(yawRad) * horizontal).toFixed(6)),
    y: Number(Math.sin(pitchRad).toFixed(6)),
    z: Number((Math.cos(yawRad) * horizontal).toFixed(6))
  };
}

function formatAngle(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Number(numeric.toFixed(3)).toString() : '0';
}

function emitterTypeLabel(type) {
  return emitterTypes.find((item) => item.id === type)?.label || type;
}

function themeLabel(theme) {
  return generatorThemeOptions.find((item) => item.id === theme)?.label || '深粉';
}

function formatScale(scale) {
  const numeric = clampNumber(scale, 0.05, 20, 1);
  return `${Number(numeric.toFixed(2))}x`;
}

function formatFps(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(Math.max(0, Math.round(numeric))) : '--';
}

function recordHotkey(key, event) {
  const code = event.code || event.key;
  if (!code || code === 'Tab') return;
  project.value.settings.hotkeys[key] = code;
}

function resetHotkey(key) {
  project.value.settings.hotkeys[key] = GENERATOR_HOTKEY_DEFAULTS[key];
}

function formatHotkey(code) {
  const labels = {
    Space: 'Space',
    Delete: 'Delete',
    Backspace: 'Backspace',
    Escape: 'Esc',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→'
  };
  const text = String(code || '');
  if (labels[text]) return labels[text];
  if (/^Key[A-Z]$/.test(text)) return text.slice(3);
  if (/^Digit[0-9]$/.test(text)) return text.slice(5);
  return text || '未设置';
}

function commandParamFields(command) {
  return commandTypeOptions.find((item) => item.id === command.type)?.params || [];
}

function syncCommandType(command) {
  const option = commandTypeOptions.find((item) => item.id === command.type);
  command.params = createDefaultCommandParams(command.type);
  if (option) command.label = option.label;
}

function startPanelResize(side, event) {
  if (event.button !== 0) return;
  const settings = project.value.settings;
  const workspaceRect = event.currentTarget?.parentElement?.getBoundingClientRect?.();
  const workspaceWidth = Number(workspaceRect?.width);
  panelResize = {
    side,
    startX: event.clientX,
    startWidth: Number(side === 'left' ? settings.leftPanelWidth : settings.rightPanelWidth) || (side === 'left' ? 340 : 480),
    otherWidth: Number(side === 'left' ? settings.rightPanelWidth : settings.leftPanelWidth) || (side === 'left' ? 480 : 340),
    workspaceWidth: Number.isFinite(workspaceWidth) && workspaceWidth > 0 ? workspaceWidth : window.innerWidth
  };
  event.currentTarget?.setPointerCapture?.(event.pointerId);
  window.addEventListener('pointermove', handlePanelResize);
  window.addEventListener('pointerup', stopPanelResize, { once: true });
}

function handlePanelResize(event) {
  if (!panelResize) return;
  const delta = event.clientX - panelResize.startX;
  if (panelResize.side === 'left') {
    project.value.settings.leftPanelWidth = clampNumber(
      panelResize.startWidth + delta,
      LEFT_PANEL_MIN_WIDTH,
      getPanelResizeMaxWidth('left'),
      340
    );
  } else {
    project.value.settings.rightPanelWidth = clampNumber(
      panelResize.startWidth - delta,
      RIGHT_PANEL_MIN_WIDTH,
      getPanelResizeMaxWidth('right'),
      480
    );
  }
}

function getPanelResizeMaxWidth(side) {
  const minWidth = side === 'left' ? LEFT_PANEL_MIN_WIDTH : RIGHT_PANEL_MIN_WIDTH;
  const workspaceWidth = Number(panelResize?.workspaceWidth);
  const otherWidth = Number(panelResize?.otherWidth);
  const maxWidth = workspaceWidth - otherWidth - PREVIEW_MIN_WIDTH - PANEL_RESIZER_WIDTH * 2;
  return Number.isFinite(maxWidth) ? Math.max(minWidth, maxWidth) : PANEL_WIDTH_MAX_FALLBACK;
}

function stopPanelResize() {
  panelResize = null;
  window.removeEventListener('pointermove', handlePanelResize);
}

function resetPreviewAfterProjectChange() {
  previewRuntime.reset();
  previewRuntime.step(project.value, 1);
  previewTick.value = previewRuntime.getTick();
  syncPreviewPoints();
  pushHistorySnapshot();
}

function loadProjectText(text, filePath = '') {
  project.value = normalizeGeneratorProject(JSON.parse(text));
  currentProjectPath.value = filePath || '';
  resetPreviewAfterProjectChange();
}

function defaultProjectFileBase() {
  return sanitizeFileBase(project.value.name || project.value.kotlin?.className || 'EmitterGenerator', 'EmitterGenerator');
}

function showShellError(resultOrError) {
  if (!resultOrError || resultOrError.ok || resultOrError.canceled) {
    return;
  }
  const message = resultOrError.message || String(resultOrError);
  if (message) {
    window.alert(message);
  }
}

function clearShellQuery() {
  const query = { ...route.query };
  const hadShellQuery = Object.prototype.hasOwnProperty.call(query, 'shellOpen')
    || Object.prototype.hasOwnProperty.call(query, 'shellNew');
  if (!hadShellQuery) {
    return;
  }
  delete query.shellOpen;
  delete query.shellNew;
  router.replace({ name: 'generator', query }).catch(() => {});
}

async function loadIndexedProject(projectId) {
  const token = ++projectLoadToken;
  projectReady.value = false;
  try {
    const record = await projectRepository.get('generator', projectId);
    if (token !== projectLoadToken) return false;
    if (!record?.payload) {
      throw new Error('找不到该 Generator 项目，请返回项目页重新打开。');
    }
    const { type, payload } = classifyProjectData(record);
    if (type !== 'generator') {
      throw new Error(`项目类型不匹配：当前页面需要 generator，项目内容为 ${type}。`);
    }
    loadProjectText(JSON.stringify(payload));
    loadedProjectId.value = projectId;
    return true;
  } finally {
    if (token === projectLoadToken) projectReady.value = true;
  }
}

async function consumeShellRouteState() {
  const pending = consumePendingGeneratorProject();
  if (pending?.text) {
    try {
      loadProjectText(pending.text, pending.filePath || '');
      loadedProjectId.value = String(pending.projectId || '');
      projectReady.value = true;
    } catch (error) {
      showShellError(error);
    }
    clearShellQuery();
    return;
  }

  if (route.query.shellNew) {
    resetProject();
    projectReady.value = true;
    clearShellQuery();
  } else if (route.query.shellOpen) {
    clearShellQuery();
  }

  const projectId = indexedProjectId();
  if (projectId) {
    if (loadedProjectId.value === projectId && projectReady.value) return;
    try {
      await loadIndexedProject(projectId);
    } catch (error) {
      showShellError(error);
      await router.replace({ name: 'workbench', query: { projectError: error?.message || String(error) } });
    }
    return;
  }
  loadedProjectId.value = '';
  projectReady.value = true;
}

async function openProjectWithShell() {
  const shell = getElectronShell();
  if (!shell?.openProjectFile) {
    fileInputRef.value?.click();
    return;
  }
  const result = await shell.openProjectFile();
  if (result?.ok) {
    try {
      await openProjectResult(router, result);
    } catch (error) {
      showShellError(error);
    }
    return;
  }
  showShellError(result);
}

async function openRecentProjectWithShell(filePath) {
  const shell = getElectronShell();
  if (!shell?.readTextFile) {
    return;
  }
  const result = await shell.readTextFile(filePath);
  if (result?.ok) {
    try {
      await openProjectResult(router, result);
    } catch (error) {
      showShellError(error);
    }
    return;
  }
  showShellError(result);
}

async function saveProjectWithShell(forceDialog = false) {
  if (loadedProjectId.value && forceDialog) {
    try {
      await saveIndexedProject();
    } catch (error) {
      showShellError(error);
      return;
    }
  }
  if (loadedProjectId.value && !forceDialog) {
    try {
      await saveIndexedProject();
    } catch (error) {
      showShellError(error);
    }
    return;
  }
  const shell = getElectronShell();
  if (!shell?.saveProjectFile) {
    downloadJsonInBrowser();
    return;
  }
  const result = await shell.saveProjectFile({
    title: 'Save Generator Project',
    filePath: forceDialog ? '' : currentProjectPath.value,
    forceDialog,
    defaultPath: `${defaultProjectFileBase()}.json`,
    text: JSON.stringify(project.value, null, 2)
  });
  if (result?.ok) {
    if (!loadedProjectId.value) {
      currentProjectPath.value = result.filePath || currentProjectPath.value;
    }
    return;
  }
  showShellError(result);
}

async function exportKotlinWithShell() {
  const shell = getElectronShell();
  if (!shell?.saveTextFile) {
    await copyKotlin();
    return;
  }
  const result = await shell.saveTextFile({
    title: 'Export Kotlin',
    defaultPath: `${sanitizeFileBase(project.value.kotlin?.className || project.value.name || 'EmitterGenerator', 'EmitterGenerator')}.kt`,
    filters: [
      { name: 'Kotlin Source', extensions: ['kt'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    addToRecent: false,
    text: kotlinOutput.value
  });
  showShellError(result);
}

async function handleShellCommand(event) {
  const command = event?.detail || {};
  if (command.type === 'new-project') {
    event.preventDefault();
    await router.push({ name: 'workbench', query: { create: String(Date.now()) } });
    return;
  }
  if (command.type === 'open-project') {
    event.preventDefault();
    await openProjectWithShell();
    return;
  }
  if (command.type === 'open-recent-project') {
    event.preventDefault();
    await openRecentProjectWithShell(command.filePath);
    return;
  }
  if (command.type === 'save-project') {
    event.preventDefault();
    await saveProjectWithShell(false);
    return;
  }
  if (command.type === 'save-as-project') {
    event.preventDefault();
    await saveProjectWithShell(true);
    return;
  }
  if (command.type === 'export-kotlin') {
    event.preventDefault();
    exportKotlinWithShell();
  }
}

function downloadJsonInBrowser() {
  const blob = new Blob([JSON.stringify(project.value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `${project.value.name || 'EmitterGenerator'}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

async function exportJson() {
  if (isElectronShell()) {
    await saveProjectWithShell(true);
    return;
  }
  downloadJsonInBrowser();
}

async function importJson(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  try {
    await openProjectResult(router, {
      ok: true,
      filePath: file.name,
      name: file.name,
      text: await file.text()
    });
  } catch (error) {
    showShellError(error);
  }
}

function resetProject() {
  project.value = createGeneratorProject();
  currentProjectPath.value = '';
  loadedProjectId.value = indexedProjectId();
  resetPreviewAfterProjectChange();
}

async function copyKotlin() {
  await navigator.clipboard?.writeText(kotlinOutput.value);
}

function serializeProject() {
  return JSON.stringify(project.value);
}

function pushHistorySnapshot() {
  if (historyApplying) return;
  const snapshot = serializeProject();
  if (undoStack[undoStack.length - 1] === snapshot) return;
  undoStack.push(snapshot);
  if (undoStack.length > 80) undoStack.shift();
  redoStack.length = 0;
}

function scheduleHistorySnapshot() {
  if (historyApplying) return;
  window.clearTimeout(historyTimer);
  historyTimer = window.setTimeout(pushHistorySnapshot, 250);
}

function restoreProjectSnapshot(snapshot) {
  historyApplying = true;
  project.value = normalizeGeneratorProject(JSON.parse(snapshot));
  previewRuntime.reset();
  previewRuntime.step(project.value, 1);
  previewTick.value = previewRuntime.getTick();
  syncPreviewPoints();
  window.setTimeout(() => {
    historyApplying = false;
  }, 0);
}

function undoProject() {
  pushHistorySnapshot();
  if (undoStack.length <= 1) return;
  const current = undoStack.pop();
  redoStack.push(current);
  restoreProjectSnapshot(undoStack[undoStack.length - 1]);
}

function redoProject() {
  if (!redoStack.length) return;
  const snapshot = redoStack.pop();
  undoStack.push(snapshot);
  restoreProjectSnapshot(snapshot);
}

function removeSelectedEmitter() {
  if (!selectedEmitter.value || project.value.emitters.length <= 1) return;
  removeEmitter(selectedEmitter.value.id);
}

function handleGeneratorHotkey(event) {
  if (isEditableHotkeyTarget(event.target)) return;
  const isMod = event.ctrlKey || event.metaKey;
  if (isMod && matchesHotkey(event, 'undo')) {
    event.preventDefault();
    if (event.shiftKey) redoProject();
    else undoProject();
    return;
  }
  if (isMod && matchesHotkey(event, 'redo')) {
    event.preventDefault();
    redoProject();
    return;
  }
  if (isMod || event.altKey || event.shiftKey) return;
  if (matchesHotkey(event, 'playPause')) {
    event.preventDefault();
    togglePreviewPlayback();
    return;
  }
  if (matchesHotkey(event, 'clearParticles')) {
    event.preventDefault();
    clearPreviewParticles();
    return;
  }
  if (matchesHotkey(event, 'deleteEmitter')) {
    event.preventDefault();
    removeSelectedEmitter();
    return;
  }
  if (matchesHotkey(event, 'resetCamera')) {
    event.preventDefault();
    previewCanvasRef.value?.resetCamera();
    return;
  }
  if (matchesHotkey(event, 'fullscreen')) {
    event.preventDefault();
    previewCanvasRef.value?.toggleFullscreen();
  }
}

function matchesHotkey(event, key) {
  const code = project.value.settings.hotkeys?.[key] || GENERATOR_HOTKEY_DEFAULTS[key];
  return event.code === code;
}

function isEditableHotkeyTarget(target) {
  if (!(target instanceof Element)) return false;
  const tag = target.tagName?.toUpperCase();
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable;
}

function resolvePreviewCycle(rawProject) {
  const normalized = normalizeGeneratorProject(rawProject);
  const maxParticleLife = Math.max(1, ...normalized.emitters.map((card) => Number(card.particle.lifeMax || 1)));
  const configured = Number(normalized.previewTicks || 0);
  const rootMax = normalized.rootLifecycle.mode === 'interval_n_tick' ? Number(normalized.rootLifecycle.maxTick || 0) : 0;
  return Math.max(60, configured, rootMax, maxParticleLife + 40);
}

function buildPreviewPoints(rawProject, tick) {
  const normalized = rawProject;
  const points = [];
  const emitters = Array.isArray(normalized.emitters) ? normalized.emitters : [];
  const maxLife = Math.max(1, ...emitters.map((card) => Number(card.particle?.lifeMax || 1)));
  const fromTick = Math.max(0, tick - maxLife);
  const maxPreviewPoints = 2600;
  emitters.forEach((card, cardIndex) => {
    if (!card.enabled) return;
    for (let spawnTick = fromTick; spawnTick <= tick; spawnTick += 1) {
      if (points.length >= maxPreviewPoints) return;
      if (!isEmitterActive(card, spawnTick)) continue;
      const countRand = seededRandom(cardIndex * 173 + spawnTick * 101);
      const countMin = Math.max(1, Number(card.particle.countMin || 1));
      const countMax = Math.max(countMin, Number(card.particle.countMax || countMin));
      const count = Math.min(128, Math.max(1, Math.round(countMin + (countMax - countMin) * countRand())));
      for (let i = 0; i < count; i += 1) {
        if (points.length >= maxPreviewPoints) return;
        const rand = seededRandom(cardIndex * 100000 + i * 9176 + spawnTick * 37);
        const life = sampleParticleLife(card, rand);
        const age = tick - spawnTick;
        if (age < 0 || age >= life) continue;
        const agePercent = clampNumber((age / Math.max(1, life)) * 100, 0, 100, 0);
        points.push(buildPreviewParticle(card, cardIndex, i, age, agePercent, life, rand));
      }
    }
  });
  return points;
}

function buildPreviewParticle(card, cardIndex, particleIndex, age, agePercent, life, rand) {
  const lifeAlpha = clamp01(agePercent / 100);
  const sizeX = Math.max(0, samplePreviewCurve(card.curves.size.x, agePercent));
  const sizeY = card.render.scaleMode === 'xyz' && !card.curves.size.syncAxes
    ? Math.max(0, samplePreviewCurve(card.curves.size.y, agePercent))
    : sizeX;
  const sizeZ = card.render.scaleMode === 'xyz' && !card.curves.size.syncAxes
    ? Math.max(0, samplePreviewCurve(card.curves.size.z, agePercent))
    : sizeX;
  const baseScale = card.render.scaleMode === 'xyz'
    ? {
      x: Math.max(0, Number(card.render.baseScale.x || 0)),
      y: Math.max(0, Number(card.render.baseScale.y || card.render.baseScale.x || 0)),
      z: Math.max(0, Number(card.render.baseScale.z || card.render.baseScale.x || 0))
    }
    : {
      x: Math.max(0, Number(card.render.baseScale.x || 0)),
      y: Math.max(0, Number(card.render.baseScale.x || 0)),
      z: Math.max(0, Number(card.render.baseScale.x || 0))
    };
  const alpha = clamp01((Number(card.render.alpha ?? 100) / 100) * (samplePreviewCurve(card.curves.opacity, agePercent) / 100));
  const light = clampNumber(samplePreviewCurve(card.curves.brightness, agePercent), -1, 15, Number(card.render.light ?? 15));
  const color = interpolateHex(card.particle.colorStart, card.particle.colorOverLifeEnabled ? card.particle.colorEnd : card.particle.colorStart, lifeAlpha, light);
  const rotation = samplePreviewRotation(card, agePercent);
  const base = sampleEmitterPoint(card, rand);
  const velocity = sampleVelocity(card, rand);
  const scale = {
    x: baseScale.x * sizeX,
    y: baseScale.y * sizeY,
    z: baseScale.z * sizeZ
  };
  return {
    x: base.x + velocity.x * age * 0.18,
    y: base.y + velocity.y * age * 0.18,
    z: base.z + velocity.z * age * 0.18,
    color,
    alpha,
    light,
    effectClass: card.render.effectClass,
    textureSheet: card.render.textureSheet,
    billboardMode: card.render.billboardMode,
    axis: { ...card.render.axis },
    roll: rotation.roll,
    yaw: rotation.yaw,
    pitch: rotation.pitch,
    scaleX: scale.x,
    scaleY: scale.y,
    scaleZ: scale.z,
    size: Math.max(0.01, (scale.x + scale.y + scale.z) / 3),
    age,
    life,
    seed: cardIndex * 100000 + particleIndex
  };
}

function sampleParticleLife(card, rand) {
  const min = Math.max(1, Number(card.particle.lifeMin || 1));
  const max = Math.max(min, Number(card.particle.lifeMax || min));
  return Math.max(1, Math.round(min + (max - min) * rand()));
}

function isEmitterActive(card, tick) {
  const start = Number(card.emission.startTick || 0);
  const end = Number(card.emission.endTick ?? -1);
  if (tick < start) return false;
  if (end >= 0 && tick > end) return false;
  if (card.emission.mode === 'once') return tick === start;
  if (card.emission.mode === 'burst') return ((tick - start) % Math.max(1, Number(card.emission.burstInterval || 1))) === 0;
  return true;
}

function samplePreviewRotation(card, agePercent) {
  const rollCurve = samplePreviewCurve(card.curves.rotation.roll, agePercent);
  const yawCurve = card.curves.rotation.syncAxes
    ? rollCurve
    : samplePreviewCurve(card.curves.rotation.yaw, agePercent);
  const pitchCurve = card.curves.rotation.syncAxes
    ? rollCurve
    : samplePreviewCurve(card.curves.rotation.pitch, agePercent);
  return {
    roll: Number(card.render.roll || 0) + rollCurve,
    yaw: card.render.billboardMode === 'none' ? Number(card.render.yaw || 0) + yawCurve : 0,
    pitch: card.render.billboardMode === 'none' ? Number(card.render.pitch || 0) + pitchCurve : 0
  };
}

function samplePreviewCurve(curve, percent) {
  const frames = Array.isArray(curve?.keyframes) ? curve.keyframes : [];
  if (!frames.length) return Number(curve?.defaultValue || 0);
  if (frames.length === 1) return Number(frames[0].value || 0);
  const t = clampNumber(percent, 0, 100, 0);
  if (t <= Number(frames[0].time || 0)) return Number(frames[0].value || 0);
  const last = frames[frames.length - 1];
  if (t >= Number(last.time || 0)) return Number(last.value || 0);
  for (let i = 1; i < frames.length; i += 1) {
    const prev = frames[i - 1];
    const next = frames[i];
    if (t <= Number(next.time || 0)) {
      if (curve?.mode === 'bezier') return samplePreviewBezier(prev, next, t);
      const start = Number(prev.time || 0);
      const span = Math.max(0.0001, Number(next.time || 0) - start);
      const alpha = (t - start) / span;
      return Number(prev.value || 0) + (Number(next.value || 0) - Number(prev.value || 0)) * alpha;
    }
  }
  return Number(last.value || 0);
}

function samplePreviewBezier(a, b, percent) {
  const x0 = Number(a.time || 0);
  const y0 = Number(a.value || 0);
  const x3 = Number(b.time || 0);
  const y3 = Number(b.value || 0);
  const x1 = clampNumber(x0 + Number(a.out?.x || 0), 0, 100, x0);
  const y1 = y0 + Number(a.out?.y || 0);
  const x2 = clampNumber(x3 + Number(b.in?.x || 0), 0, 100, x3);
  const y2 = y3 + Number(b.in?.y || 0);
  let bestDistance = Infinity;
  let bestValue = y0;
  for (let i = 0; i <= 24; i += 1) {
    const t = i / 24;
    const x = cubic1d(x0, x1, x2, x3, t);
    const distance = Math.abs(x - percent);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestValue = cubic1d(y0, y1, y2, y3, t);
    }
  }
  return bestValue;
}

function cubic1d(p0, p1, p2, p3, t) {
  const mt = 1 - t;
  return mt * mt * mt * p0 + 3 * mt * mt * t * p1 + 3 * mt * t * t * p2 + t * t * t * p3;
}

function clamp01(value, fallback = 1) {
  return clampNumber(value, 0, 1, fallback);
}

function clampNumber(value, min, max, fallback = 0) {
  const numeric = Number(value);
  const safe = Number.isFinite(numeric) ? numeric : fallback;
  return Math.max(min, Math.min(max, safe));
}

function interpolateHex(startHex, endHex, alpha, light = 15) {
  const start = hexToRgb(startHex);
  const end = hexToRgb(endHex);
  const factor = light < 0 ? 0.62 : 0.5 + clampNumber(light, 0, 15, 15) / 30;
  const r = clampNumber(start.r + (end.r - start.r) * alpha, 0, 255) * factor;
  const g = clampNumber(start.g + (end.g - start.g) * alpha, 0, 255) * factor;
  const b = clampNumber(start.b + (end.b - start.b) * alpha, 0, 255) * factor;
  return rgbToHex(r, g, b);
}

function hexToRgb(hex) {
  const text = /^#[0-9a-fA-F]{6}$/.test(String(hex || '')) ? String(hex).slice(1) : 'ffffff';
  const value = Number.parseInt(text, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255
  };
}

function rgbToHex(r, g, b) {
  const toHex = (value) => Math.round(clampNumber(value, 0, 255)).toString(16).padStart(2, '0');
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function seededRandom(seed) {
  let value = (Math.imul(Math.trunc(seed) || 1, 1664525) + 1013904223) >>> 0;
  return () => {
    value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
    return value / 4294967296;
  };
}

function sampleEmitterPoint(card, rand) {
  const type = card.emitter.type;
  const offset = card.emitter.offset;
  if (type === 'point') return { ...offset };
  if (type === 'box') {
    const box = card.emitter.box;
    return {
      x: offset.x + (rand() - 0.5) * box.x,
      y: offset.y + (rand() - 0.5) * box.y,
      z: offset.z + (rand() - 0.5) * box.z
    };
  }
  if (type === 'sphere' || type === 'sphere_surface') {
    const radius = type === 'sphere' ? card.emitter.sphere.r : card.emitter.sphereSurface.r;
    const theta = rand() * Math.PI * 2;
    const phi = Math.acos(2 * rand() - 1);
    const r = type === 'sphere' ? radius * Math.cbrt(rand()) : radius;
    return {
      x: offset.x + Math.sin(phi) * Math.cos(theta) * r,
      y: offset.y + Math.cos(phi) * r,
      z: offset.z + Math.sin(phi) * Math.sin(theta) * r
    };
  }
  if (type === 'line') {
    const dir = normalizeVector(card.emitter.line.dir);
    const t = (rand() - 0.5) * card.particle.countMax * card.emitter.line.step;
    return { x: offset.x + dir.x * t, y: offset.y + dir.y * t, z: offset.z + dir.z * t };
  }
  if (type === 'circle' || type === 'ring') {
    const radius = type === 'circle' ? card.emitter.circle.r : card.emitter.ring.r + (rand() - 0.5) * card.emitter.ring.thickness;
    const angle = rand() * Math.PI * 2;
    return { x: offset.x + Math.cos(angle) * radius, y: offset.y, z: offset.z + Math.sin(angle) * radius };
  }
  if (type === 'arc') {
    const arc = card.emitter.arc;
    const start = Math.min(arc.start, arc.end) * Math.PI / 180;
    const end = Math.max(arc.start, arc.end) * Math.PI / 180;
    const angle = start + (end - start) * rand() + arc.rotate * Math.PI / 180;
    return { x: offset.x + Math.cos(angle) * arc.r, y: offset.y, z: offset.z + Math.sin(angle) * arc.r };
  }
  if (type === 'spiral') {
    const spiral = card.emitter.spiral;
    const t = rand();
    const radius = spiral.startR + (spiral.endR - spiral.startR) * Math.pow(t, spiral.rBias);
    const angle = t * spiral.rotateSpeed * Math.PI * 8;
    return { x: offset.x + Math.cos(angle) * radius, y: offset.y + Math.pow(t, spiral.hBias) * spiral.height, z: offset.z + Math.sin(angle) * radius };
  }
  return { ...offset };
}

function sampleVelocity(card, rand) {
  const v = card.particle.velocity;
  const r = card.particle.velocityRandom;
  const speed = card.particle.speedMin + (card.particle.speedMax - card.particle.speedMin) * rand();
  return {
    x: (v.x + (rand() * 2 - 1) * r.x) * speed,
    y: (v.y + (rand() * 2 - 1) * r.y) * speed,
    z: (v.z + (rand() * 2 - 1) * r.z) * speed
  };
}

function normalizeVector(vector) {
  const length = Math.hypot(Number(vector.x || 0), Number(vector.y || 0), Number(vector.z || 0)) || 1;
  return { x: Number(vector.x || 0) / length, y: Number(vector.y || 0) / length, z: Number(vector.z || 0) / length };
}
</script>

<style scoped>
.generator-loading {
  min-height: 100vh;
  display: grid;
  place-items: center;
  align-content: center;
  gap: 14px;
  color: #dec0cf;
  background:
    linear-gradient(180deg, rgba(255, 116, 176, 0.08), transparent 34%),
    linear-gradient(180deg, #1b0a15 0%, #12070e 60%, #080408 100%);
  font-size: 13px;
  font-weight: 700;
}

.generator-loading::before {
  content: "";
  width: 10px;
  height: 10px;
  background: #f06aa7;
  box-shadow: -18px 0 0 rgba(240, 106, 167, 0.28), 18px 0 0 rgba(240, 106, 167, 0.28);
  animation: generator-loading-pulse 900ms steps(2, end) infinite;
}

@keyframes generator-loading-pulse {
  50% {
    background: rgba(240, 106, 167, 0.28);
    box-shadow: -18px 0 0 #f06aa7, 18px 0 0 #f06aa7;
  }
}

@media (prefers-reduced-motion: reduce) {
  .generator-loading::before {
    animation: none;
  }
}

.generator-page {
  --generator-page-bg: rgba(2, 8, 23, 0.22);
  --generator-text: #e2e8f0;
  --input-bg: rgba(15, 23, 42, 0.7);
  height: 100vh;
  min-height: 0;
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 14px;
  overflow: hidden;
  color: var(--generator-text);
  background: var(--generator-page-bg);
}

.generator-page,
.generator-page * {
  box-sizing: border-box;
}

.generator-page[data-theme='light-pink'] {
  --bg-panel: rgba(248, 250, 252, 0.92);
  --bg-panel-strong: rgba(255, 255, 255, 0.98);
  --bg-soft: rgba(213, 116, 150, 0.1);
  --border: rgba(118, 81, 97, 0.28);
  --text-soft: #765161;
  --brand: #d86f9d;
  --brand-2: #ef9ebe;
  --generator-page-bg: rgba(255, 239, 245, 0.86);
  --generator-text: #372630;
  --input-bg: rgba(255, 247, 250, 0.9);
  color-scheme: light;
}

.generator-page :deep(.input),
.generator-page .input,
.generator-page select {
  width: 100%;
  min-width: 0;
  height: 40px;
  min-height: 40px;
  padding: 8px 10px;
  font-size: 13px;
  line-height: 1.25;
  background: var(--input-bg);
  border-color: var(--border);
  color: inherit;
}

.generator-page input[type='checkbox'],
.generator-page input[type='radio'] {
  width: 16px;
  height: 16px;
  min-width: 16px;
  min-height: 16px;
  margin: 0;
  padding: 0;
  accent-color: var(--brand);
}

.generator-page textarea {
  width: 100%;
  min-width: 0;
  min-height: 40px;
  padding: 8px 10px;
  font-size: 13px;
  line-height: 1.25;
  background: var(--input-bg);
  border-color: var(--border);
  color: inherit;
}

.generator-page input[type='checkbox'] {
  width: 16px;
  height: 16px;
  min-height: 0;
  padding: 0;
  flex: 0 0 auto;
}

.generator-topbar,
.generator-workspace,
.generator-panel,
.panel-title-row,
.generator-actions,
.generator-brand,
.preview-title,
.preview-chips,
.row-actions,
.card-main {
  display: flex;
}

.generator-topbar {
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-panel);
}

.generator-brand {
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.generator-brand > div {
  min-width: 0;
}

.generator-brand h1 {
  margin: 0;
  font-size: 18px;
}

.generator-brand p {
  margin: 3px 0 0;
  color: var(--text-soft);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.generator-brand code {
  white-space: normal;
  overflow-wrap: anywhere;
}

.generator-actions {
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.generator-workspace {
  display: grid;
  grid-template-columns: minmax(220px, var(--left-panel-width, 340px)) 8px minmax(160px, 1fr) 8px minmax(260px, var(--right-panel-width, 480px));
  height: auto;
  min-height: 0;
  gap: 0;
  align-items: stretch;
  overflow: hidden;
}

.generator-panel {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-panel);
  min-height: 0;
}

.generator-left,
.generator-right {
  width: auto;
  flex: none;
  flex-direction: column;
  gap: 12px;
  overflow: auto;
  padding: 14px;
}

.generator-right {
  width: auto;
  gap: 16px;
  padding: 16px;
  scrollbar-gutter: stable;
}

.generator-preview {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
  flex-direction: column;
  padding: 12px;
}

.panel-resizer {
  width: 8px;
  cursor: col-resize;
  position: relative;
}

.panel-resizer::before {
  content: '';
  position: absolute;
  top: 12px;
  bottom: 12px;
  left: 3px;
  width: 2px;
  border-radius: 999px;
  background: var(--border);
}

.panel-resizer:hover::before {
  background: var(--brand);
}

.panel-title-row,
.preview-title {
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.panel-title-row.compact {
  align-items: baseline;
}

.preview-chips {
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.left-block,
.editor-section {
  display: grid;
  gap: 10px;
  border-top: 1px solid var(--border);
  padding-top: 12px;
}

.generator-right .editor-section {
  gap: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-soft);
  padding: 12px;
}

.block-title,
.section-title {
  font-weight: 700;
}

.left-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.left-tabs button {
  min-height: 34px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-soft);
  color: inherit;
}

.left-tabs button.active {
  border-color: rgba(56, 189, 248, 0.58);
  background: rgba(56, 189, 248, 0.14);
}

.emitter-list,
.curve-stack {
  display: grid;
  gap: 10px;
}

.emitter-list {
  container-type: inline-size;
}

.emitter-list-card,
.queue-card,
.command-card {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-soft);
  padding: 10px;
  display: grid;
  gap: 8px;
}

.emitter-list-card {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
}

.emitter-list-card .row-actions {
  grid-column: 2;
  grid-row: 1;
  align-self: center;
}

.emitter-list-card,
.queue-card {
  cursor: pointer;
}

.emitter-list-card.selected,
.queue-card.selected {
  border-color: rgba(245, 158, 11, 0.66);
}

.emitter-list-card.disabled {
  opacity: 0.55;
}

.card-main {
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.card-main > div {
  min-width: 0;
}

.plain-input {
  width: 100%;
  height: auto;
  min-height: 0;
  border: 0;
  background: transparent;
  color: inherit;
  font-weight: 700;
  padding: 0;
  line-height: 1.25;
}

.sub,
.empty-state {
  color: var(--text-soft);
  font-size: 12px;
}

.row-actions {
  justify-content: flex-end;
  gap: 6px;
  flex-wrap: nowrap;
}

.icon-btn {
  width: 28px;
  height: 28px;
  min-width: 28px;
  min-height: 28px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-soft);
  color: inherit;
  display: inline-grid;
  place-items: center;
  padding: 0;
  line-height: 1;
}

.emitter-toggle {
  width: 18px;
  height: 18px;
  min-width: 18px;
  min-height: 18px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border-radius: 3px;
  font-size: 10px;
  line-height: 1;
}

.icon-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

.field,
.field-pack,
.mini-field {
  display: grid;
  gap: 6px;
  min-width: 0;
}

.field span,
.vector-row > span,
.mini-field span,
.bindable-field > span {
  color: var(--text-soft);
  font-size: 12px;
  line-height: 1.25;
}

.grid2,
.grid3,
.grid4 {
  display: grid;
  gap: 8px;
}

.grid2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.grid3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.grid4 {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.base-param-grid {
  align-items: end;
}

.generator-right .grid2 {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.generator-right .grid3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.generator-right .grid4 {
  grid-template-columns: repeat(2, minmax(150px, 1fr));
}

.generator-right .base-param-grid {
  grid-template-columns: minmax(140px, 0.8fr) minmax(220px, 1.2fr);
}

.generator-right .base-param-grid > :last-child {
  grid-column: 1 / -1;
}

.command-param-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 8px;
}

.parameter-editor {
  display: grid;
  gap: 10px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--bg-soft);
}

.parameter-editor-head {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: end;
}

.parameter-name-field {
  min-width: 0;
}

.parameter-delete {
  white-space: nowrap;
}

.parameter-field-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.parameter-codec {
  width: fit-content;
}

.bindable-field {
  min-width: 0;
  position: relative;
}

.bindable-field:focus-within {
  z-index: 400;
}

.bindable-field :deep(.bindable-single-input) {
  width: 100%;
  min-width: 0;
}

.bindable-control {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(92px, 116px);
  gap: 6px;
  align-items: center;
}

.bindable-control.no-binding {
  grid-template-columns: minmax(0, 1fr);
}

.binding-select {
  min-width: 0;
  font-size: 12px;
}

.generator-page :deep(.mc-autocomplete) {
  position: relative;
  min-width: 0;
  z-index: 1;
}

.generator-page :deep(.mc-autocomplete:focus-within) {
  z-index: 500;
}

.generator-page :deep(.mc-autocomplete > .input) {
  width: 100%;
}

.generator-page :deep(.mc-suggestions) {
  position: absolute;
  z-index: 9999;
  top: calc(100% + 4px);
  left: 0;
  width: max(100%, 300px);
  max-width: min(520px, calc(100vw - 32px));
  max-height: 284px;
  overflow: hidden;
  border: 1px solid rgba(120, 144, 176, 0.78);
  border-radius: 4px;
  background: #070b16;
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.62);
  padding: 3px;
}

.generator-page :deep(.mc-suggestion) {
  width: 100%;
  min-height: 28px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  border: 0;
  border-radius: 2px;
  background: transparent;
  color: #f8fafc;
  font: inherit;
  font-size: 12px;
  text-align: left;
  padding: 4px 8px;
}

.generator-page :deep(.mc-suggestion.active) {
  background: rgba(85, 170, 255, 0.42);
  color: #ffffff;
}

.generator-page :deep(.mc-suggestion-main),
.generator-page :deep(.mc-suggestion-label) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.generator-page :deep(.mc-suggestion-label) {
  color: rgba(226, 232, 240, 0.58);
  font-size: 11px;
}

.bindable-vector-row {
  display: grid;
  grid-template-columns: 86px minmax(0, 1fr);
  gap: 8px;
  align-items: start;
}

.bindable-vector-row :deep(.bindable-vector-grid) {
  display: grid;
  gap: 8px;
  min-width: 0;
}

.generator-right .bindable-vector-row {
  grid-template-columns: 1fr;
  gap: 6px;
}

.bindable-vector-row :deep(.vector-label) {
  color: var(--text-soft);
  font-size: 12px;
  line-height: 1.25;
  padding-top: 4px;
}

.bindable-vector-row :deep(.bindable-vector-head) {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px 8px;
  align-items: end;
  justify-content: stretch;
}

.bindable-vector-row :deep(.vector-kind) {
  grid-column: 1;
  grid-row: 1;
  color: var(--text-soft);
  font-size: 12px;
  line-height: 1.2;
  justify-self: start;
  white-space: nowrap;
}

.bindable-vector-row :deep(.mode-select) {
  grid-column: 1;
  grid-row: 2;
  width: 132px;
  max-width: 100%;
  min-width: 0;
  font-size: 12px;
}

.bindable-vector-row :deep(.bindable-axis-grid) {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  min-width: 0;
}

.bindable-vector-row :deep(.axis-number),
.bindable-vector-row :deep(.axis-expression) {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 4px;
  align-items: end;
  min-width: 0;
}

.bindable-vector-row :deep(.axis-chip) {
  color: var(--text-soft);
  font-size: 12px;
  line-height: 1.2;
  text-align: left;
}

.bindable-vector-row :deep(.bindable-single-expression) {
  display: grid;
  grid-template-columns: minmax(180px, 1fr);
  min-width: 0;
}

.bindable-vector-row :deep(.bindable-color-constant) {
  display: grid;
  gap: 8px;
  align-items: end;
  min-width: 0;
  width: 100%;
  max-width: 100%;
}

.bindable-vector-row :deep(.color-main-row) {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: 8px;
  align-items: end;
  min-width: 0;
}

.bindable-vector-row :deep(.color-channel-grid) {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  min-width: 0;
}

.bindable-vector-row :deep(.color-picker-input) {
  width: 44px;
  min-width: 44px;
  height: 40px;
  min-height: 40px;
  padding: 3px;
}

.bindable-vector-row :deep(.color-text-input) {
  min-width: 0;
}

.bindable-color-vector-row :deep(.color-channel-number) {
  grid-template-columns: minmax(0, 1fr);
  gap: 4px;
}

.bindable-color-vector-row :deep(.color-channel-number .input) {
  min-width: 0;
  padding-left: 4px;
  padding-right: 4px;
  text-align: center;
}

.compact-field-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.vector-row {
  display: grid;
  grid-template-columns: 86px repeat(3, minmax(0, 1fr));
  gap: 8px;
  align-items: end;
}

.color-input {
  min-height: 42px;
  padding: 4px;
}

.check-row,
.curve-option-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.inline-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
  min-width: 0;
}

.settings-summary,
.settings-grid,
.hotkey-grid,
.axis-curve-content {
  display: grid;
  gap: 10px;
}

.settings-summary {
  color: var(--text-soft);
  font-size: 12px;
}

.settings-grid {
  grid-template-columns: minmax(150px, 1fr) repeat(3, max-content);
  align-items: end;
}

.theme-choice-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.theme-choice {
  min-height: 42px;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-soft);
  color: inherit;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
}

.theme-choice.selected {
  border-color: var(--brand);
}

.theme-swatch {
  width: 18px;
  height: 18px;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: linear-gradient(135deg, var(--brand), var(--brand-2));
  flex: 0 0 auto;
}

.theme-choice[data-theme-option='light-pink'] .theme-swatch {
  background: linear-gradient(135deg, #fff7fa, #ef9ebe);
}

.hotkey-row {
  display: grid;
  grid-template-columns: minmax(110px, 1fr) minmax(100px, 150px) auto;
  gap: 8px;
  align-items: center;
}

.hotkey-row > span {
  color: var(--text-soft);
  font-size: 12px;
}

.hotkey-input {
  cursor: pointer;
}

.axis-curve-box {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg-soft);
  padding: 8px;
}

.axis-curve-box > summary {
  cursor: pointer;
  color: var(--text-soft);
  font-size: 12px;
  font-weight: 700;
}

.axis-curve-content {
  margin-top: 10px;
}

.chip {
  border-radius: 999px;
  border: 1px solid var(--border);
  background: rgba(148, 163, 184, 0.12);
  color: var(--text-soft);
  padding: 6px 10px;
  font-size: 12px;
}

.generator-canvas {
  flex: 1 1 auto;
  min-height: 0;
  margin-top: 10px;
}

.preview-error-overlay {
  position: absolute;
  right: 14px;
  bottom: 14px;
  z-index: 20;
  display: grid;
  gap: 6px;
  width: min(360px, calc(100% - 28px));
  max-height: 35%;
  overflow: auto;
  border: 1px solid rgba(244, 63, 94, 0.42);
  border-radius: 6px;
  background: rgba(69, 10, 10, 0.86);
  color: #fee2e2;
  padding: 9px 10px;
  font-size: 12px;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.32);
}

.preview-error-overlay ul {
  display: grid;
  gap: 4px;
  margin: 0;
  padding-left: 16px;
}

.generator-canvas :deep(.preview-host),
.generator-canvas :deep(.preview-host--bare),
.generator-canvas :deep(.preview-canvas) {
  width: 100%;
  height: 100%;
  min-height: 0;
  border-radius: 8px;
}

.generator-code-page {
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.code-panel-wide {
  flex: 1 1 auto;
  min-height: 0;
  padding: 14px;
  flex-direction: column;
  gap: 12px;
}

.kotlin-output {
  flex: 1 1 auto;
  min-height: 0;
  max-height: none;
  overflow: auto;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg-panel-strong);
  padding: 14px;
  font-size: 12px;
}

.code-textarea {
  min-height: 180px;
  resize: vertical;
}

.code-textarea.compact {
  min-height: 84px;
}

.danger {
  color: #fca5a5;
}

@media (max-width: 1180px) {
  .generator-page {
    height: auto;
    min-height: 100vh;
    grid-template-rows: auto;
    overflow: visible;
  }

  .generator-workspace {
    display: flex;
    height: auto;
    flex-direction: column;
    min-height: auto;
    overflow: visible;
    gap: 12px;
  }

  .panel-resizer {
    display: none;
  }

  .generator-left,
  .generator-right {
    width: 100%;
    flex-basis: auto;
  }

  .generator-preview {
    min-height: 560px;
    flex: 0 0 auto;
  }

  .generator-canvas :deep(.preview-host),
  .generator-canvas :deep(.preview-host--bare),
  .generator-canvas :deep(.preview-canvas) {
    height: 500px;
    min-height: 500px;
  }
}

@container (max-width: 280px) {
  .emitter-list-card {
    grid-template-columns: minmax(0, 1fr);
    align-items: stretch;
  }

  .emitter-list-card .row-actions {
    grid-column: 1;
    grid-row: 2;
  }
}

@media (max-width: 720px) {
  .generator-topbar,
  .generator-brand,
  .preview-title {
    align-items: flex-start;
    flex-direction: column;
  }

  .grid2,
  .grid3,
  .grid4,
  .generator-right .grid2,
  .generator-right .grid3,
  .generator-right .grid4,
  .generator-right .base-param-grid,
  .compact-field-grid,
  .command-param-grid,
  .parameter-field-grid,
  .bindable-vector-row,
  .generator-right .bindable-vector-row,
  .settings-grid,
  .theme-choice-grid,
  .hotkey-row {
    grid-template-columns: 1fr;
  }

  .generator-actions {
    justify-content: flex-start;
  }

  .bindable-vector-row :deep(.bindable-vector-head),
  .bindable-vector-row :deep(.bindable-axis-grid),
  .bindable-vector-row :deep(.color-channel-grid) {
    grid-template-columns: 1fr;
  }

  .vector-row {
    grid-template-columns: 1fr;
  }

  .generator-canvas :deep(.preview-host),
  .generator-canvas :deep(.preview-host--bare),
  .generator-canvas :deep(.preview-canvas) {
    height: 420px;
    min-height: 420px;
  }
}
</style>
