<template>
  <div
    v-if="projectReady"
    class="generator-page"
    :class="{ 'generator-page--skybox-off': project.settings.showSkybox === false }"
    :data-theme="appTheme"
  >
    <header class="generator-topbar">
      <div class="generator-brand">
        <RouterLink class="btn small" :to="{ name: 'workbench' }">项目</RouterLink>
        <div>
          <h1>粒子发射器</h1>
          <p>生成 Kotlin：<code>class {{ project.kotlin.className }}(pos: {{ project.kotlin.mapping === 'yarn' ? 'Vec3d' : 'Vec3' }}, world: {{ project.kotlin.mapping === 'yarn' ? 'World' : 'Level' }}?) : {{ project.kotlin.baseClass }}(pos, world)</code></p>
        </div>
      </div>
      <div class="generator-actions">
        <button class="btn small" :class="{ primary: project.pageMode === 'editor' }" @click="project.pageMode = 'editor'">编辑</button>
        <button class="btn small" :class="{ primary: project.pageMode === 'code' }" @click="project.pageMode = 'code'">代码</button>
        <button class="btn small" @click="togglePreviewPlayback">{{ project.playing ? '暂停' : '继续' }}</button>
        <button class="btn small" @click="restartPreview">重播</button>
        <button
          class="btn small"
          :class="{ primary: settingsOpen }"
          :title="`设置（${formatHotkey(project.settings.hotkeys?.toggleSettings)}）`"
          @click="toggleGeneratorSettings"
        >设置</button>
        <button class="btn small danger" @click="resetProject">重置</button>
      </div>
    </header>

    <main
      v-if="project.pageMode === 'editor'"
      class="generator-workspace"
      :style="workspaceStyle"
    >
      <aside class="generator-panel generator-left">
        <div class="panel-title-row">
          <strong>粒子发射器</strong>
          <button class="btn small primary" @click="addEmitter">增加发射器</button>
        </div>

        <nav class="left-tabs" aria-label="页面切换">
          <section v-for="group in leftTabGroups" :key="group.id" class="left-tab-group">
            <div class="left-tab-group-title">{{ group.label }}</div>
            <div class="left-tab-grid">
              <button v-for="tab in group.tabs" :key="tab.id" type="button" :class="{ active: project.leftTab === tab.id }" @click="selectGeneratorTab(tab.id)">
                {{ tab.label }}
              </button>
            </div>
          </section>
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
                  <div class="sub emitter-card-meta">
                    <span>{{ emitterTypeLabel(card.emitter.type) }}</span>
                    <span v-if="card.useGPU" class="chip">GPU</span>
                    <span v-if="!card.useGPU && duplicateEmitterSignCount(card)" class="duplicate-sign-badge">sign 重复</span>
                  </div>
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
            <span class="block-title">CPU 粒子处理力</span>
            <button class="btn small" @click="addQueue">增加一个处理力</button>
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

        <section v-else-if="project.leftTab === 'force_commands'" class="left-block">
          <div class="panel-title-row compact">
            <span class="block-title">GPU 粒子处理力</span>
            <button class="btn small" :disabled="enabledCParticleForceCount >= cparticleForceLimit" @click="addForceCommandFromSidebar">增加一个处理力</button>
          </div>
          <div class="sub">{{ enabledCParticleForceCount }} / {{ cparticleForceLimit }}</div>
          <div class="compatibility-note">为 CParticle GPU compute 定义粒子处理力与 Selector。</div>
          <div v-if="!project.forceCommands.length" class="empty-state">当前没有 GPU 粒子处理力。</div>
        </section>

        <section v-else-if="project.leftTab === 'resources'" class="left-block">
          <div class="panel-title-row compact">
            <span class="block-title">Force 资源声明</span>
            <button class="btn small" type="button" @click="addForceResourceFromSidebar">增加资源</button>
          </div>
          <div class="sub">Texture：{{ textureForceResourceCount }}</div>
          <div class="sub">FluidFlow：{{ fluidForceResourceCount }}</div>
          <div class="compatibility-note">Texture 上传用于 Web 预览；Kotlin 根据 ResourceLocation 绑定资源包纹理。</div>
          <div class="compatibility-note">Texture 使用 CParticleTextureResource 的默认资源包绑定，不填写 OpenGL texture id。FluidFlow 仍需客户端注册 CParticleForceResourceBinding。</div>
          <div v-if="!project.forceResources.length" class="empty-state">暂无 Force 资源。</div>
        </section>

        <section v-else-if="project.leftTab === 'cparticle_masks'" class="left-block">
          <div class="panel-title-row compact">
            <span class="block-title">CParticle 标记与掩码</span>
            <div class="inline-actions">
              <button class="btn small" type="button" @click="addCParticleSignFromSidebar">增加一个 sign</button>
              <button class="btn small" type="button" :disabled="nextCParticleCommandMaskValue === null" @click="addCParticleCommandMaskFromSidebar">增加一个 commandMask</button>
            </div>
          </div>
          <div class="compatibility-note">
            sign 是用户定义的逻辑标签，例如火焰、烟雾或碎片；commandMask 是粒子参与 Command 类别的 32-bit 位掩码。
          </div>
          <div class="sub">sign：{{ project.signs.length }}</div>
          <div class="sub">commandMask：{{ project.commandMasks.length }}</div>
        </section>

        <section v-else-if="project.leftTab === 'project'" class="left-block">
          <div class="block-title">项目设置</div>
          <label class="field"><span>类名</span><input v-model="project.kotlin.className" class="input" type="text" /></label>
          <label class="field"><span>包名</span><input v-model="project.kotlin.packageName" class="input" type="text" placeholder="cn.coostack.generated.emitters" /></label>
          <label class="field"><span>Tick/秒</span><NumericInput v-model="project.ticksPerSecond" :min="1" :max="200" :step="1" integer /></label>
          <label class="field"><span>预览 Tick</span><NumericInput v-model="project.previewTicks" :min="1" :max="2000" :step="1" integer @commit="restartPreview" /></label>
          <label class="field"><span>映射</span><select v-model="project.kotlin.mapping" class="input"><option value="yarn">Yarn (Fabric)</option><option value="mojmap">Mojang / Mojmap</option></select></label>
          <label class="field"><span>发射器运行模式</span><select v-model="project.rootLifecycle.mode" class="input" @change="restartPreviewAfterRootLifecycleChange"><option value="once">只运行一次</option><option value="interval">持续运行</option><option value="interval_n_tick">按总 Tick 运行</option></select></label>
          <div class="grid2">
            <label class="field"><span>发射间隔 Tick</span><NumericInput v-model="project.rootLifecycle.intervalTick" :min="1" :step="1" integer @commit="restartPreviewAfterRootLifecycleChange" /></label>
            <label class="field"><span>运行时长 Tick</span><NumericInput v-model="project.rootLifecycle.maxTick" :min="1" :step="1" integer @commit="restartPreviewAfterRootLifecycleChange" /></label>
          </div>
        </section>

        <section v-else-if="project.leftTab === 'tick'" class="left-block">
          <div class="block-title">每 Tick 表达式</div>
          <GeneratorExpressionEditor
            v-model="project.doTick.source"
            :completions="doTickCompletions"
            :validation-message="doTickValidationMessage"
            :placeholder="'phase += speed\nvalue = sin(phase)'"
          />
        </section>

        <section v-else-if="project.leftTab === 'death'" class="left-block">
          <div class="block-title">死亡行为</div>
          <label class="field"><span>启用</span><select v-model="project.deathBehavior.enabled" class="input"><option :value="true">开启</option><option :value="false">关闭</option></select></label>
          <label class="field"><span>模式</span><select v-model="project.deathBehavior.mode" class="input"><option value="dissipate">直接消散</option><option value="respawn">重生粒子</option></select></label>
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
            <button class="btn small" @click="previewCanvasRef?.alignCameraToPoints()">对齐画面</button>
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
        <div v-if="previewErrors.length && !hasVisibleAutocomplete" class="preview-error-overlay" role="status">
          <strong>配置错误</strong>
          <ul>
            <li v-for="item in previewErrors" :key="item.key || item.message">{{ item.message }}</li>
          </ul>
        </div>
        <div v-if="previewWarnings.length && !hasVisibleAutocomplete" class="preview-warning-overlay" role="status">
          <strong>预览提示</strong>
          <ul>
            <li v-for="item in previewWarnings" :key="item.key || item.message">{{ item.message }}</li>
          </ul>
        </div>
      </section>

      <div class="panel-resizer panel-resizer--right" role="separator" aria-label="调整右侧面板宽度" @pointerdown="startPanelResize('right', $event)"></div>

      <aside class="generator-panel generator-right">
        <template v-if="project.leftTab === 'queues' && selectedQueue">
          <div class="panel-title-row">
            <strong>CPU 粒子处理力</strong>
            <div class="inline-actions">
              <span class="chip">{{ selectedQueue.name }}</span>
              <button class="btn small danger" :disabled="project.commandQueues.length <= 1" @click="removeQueue(selectedQueue.id)">删除队列</button>
            </div>
          </div>
          <label class="field"><span>队列名称</span><input v-model="selectedQueue.name" class="input" type="text" /></label>
          <label class="field"><span>标记列表</span><input class="input" type="text" :value="selectedQueue.signs.join(', ')" placeholder="例如：0, 1, 2；留空表示全部" @input="updateQueueSigns($event.target.value)" /></label>
          <section class="editor-section">
            <div class="panel-title-row compact">
              <span class="section-title">处理力</span>
              <button class="btn small primary" @click="addQueueCommandToSelected">增加一个处理力</button>
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

        <CParticleForceEditor v-else-if="project.leftTab === 'force_commands'" :project="project" />

        <CParticleResourceEditor v-else-if="project.leftTab === 'resources'" :project="project" @preview-change="restartPreview" />

        <CParticleMaskEditor v-else-if="project.leftTab === 'cparticle_masks'" :project="project" />

        <template v-else-if="project.leftTab === 'project'">
          <div class="panel-title-row">
            <strong>项目变量与常量</strong>
          </div>

          <section class="editor-section">
            <div class="panel-title-row compact">
              <span class="section-title">变量</span>
              <button class="btn small primary" type="button" @click="addProjectVariable">增加变量</button>
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
              <details v-if="isNumericVariable(item)" class="variable-automation">
                <summary>
                  <span>变量变化</span>
                  <label class="check-row" @click.stop><input v-model="item.automation.enabled" type="checkbox" />启用</label>
                </summary>
                <div v-if="item.automation.enabled" class="variable-automation-body">
                  <div class="grid2">
                    <label class="field"><span>自变量</span><select v-model="item.automation.source" class="input"><option value="lifecycle">Emitter 生命周期</option><option value="variable">指定变量</option></select></label>
                    <label v-if="item.automation.source === 'variable'" class="field"><span>来源变量</span><select v-model="item.automation.sourceVariable" class="input"><option value="">请选择</option><option v-for="source in automationSourceVariables(item)" :key="source.name" :value="source.name">{{ source.name }}</option></select></label>
                  </div>
                  <div v-if="item.automation.source === 'variable'" class="grid2">
                    <label class="field"><span>来源最小值</span><input v-model.number="item.automation.sourceMin" class="input" type="number" step="any" /></label>
                    <label class="field"><span>来源最大值</span><input v-model.number="item.automation.sourceMax" class="input" type="number" step="any" /></label>
                  </div>
                  <div class="grid2">
                    <label class="field"><span>变量最小值</span><input v-model.number="item.automation.targetMin" class="input" type="number" step="any" /></label>
                    <label class="field"><span>变量最大值</span><input v-model.number="item.automation.targetMax" class="input" type="number" step="any" /></label>
                  </div>
                  <LifecycleCurveEditor title="Progress 采样" :curve="item.automation.curve" :hard-min="0" :hard-max="1" />
                </div>
              </details>
            </div>
          </section>

          <section class="editor-section">
            <div class="panel-title-row compact">
              <span class="section-title">常量</span>
              <button class="btn small primary" type="button" @click="addProjectConstant">增加常量</button>
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

            <div class="gpu-parameter-panel">
              <label class="check-row gpu-enable-control"><input v-model="selectedEmitter.useGPU" type="checkbox" @change="restartPreview" />使用 CParticle (GPU)</label>
              <div v-if="selectedEmitter.useGPU" class="gpu-parameter-options">
                <label class="field"><span>更新模式</span><select v-model="selectedEmitter.gpu.updateMode" class="input"><option value="static">STATIC</option><option value="dynamic">DYNAMIC</option></select></label>
                <label class="field"><span>随机种子</span><input v-model.number="selectedEmitter.gpu.randomSeed" class="input" type="number" step="1" placeholder="自动" /></label>
                <label class="field"><span>sign 逻辑标签</span><select v-model="selectedEmitter.gpu.signRef" class="input"><option value="">未设置</option><option v-for="sign in project.signs" :key="sign.id" :value="sign.id">{{ sign.name }} = {{ sign.value }}</option></select></label>
                <label class="field"><span>metadataFlags</span><input v-model.number="selectedEmitter.gpu.metadataFlags" class="input" type="number" step="1" /></label>
                <label class="field"><span>charge</span><input v-model.number="selectedEmitter.gpu.charge" class="input" type="number" step="any" placeholder="留空 = Float.NaN" /></label>
                <label class="field"><span>粒子物理半径（Lennard-Jones）</span><input v-model.number="selectedEmitter.gpu.radius" class="input" type="number" min="0" step="any" /></label>
                <div class="field gpu-command-mask-field">
                  <span>commandMask 类别</span>
                  <div v-if="!project.commandMasks.length" class="sub">请先在 CParticle 掩码页创建命名类别。</div>
                  <label v-for="mask in project.commandMasks" :key="mask.id" class="check-row"><input type="checkbox" :checked="selectedEmitter.gpu.commandMaskRefs.includes(mask.id)" @change="toggleGpuCommandMask(selectedEmitter, mask.id, $event.target.checked)" />{{ mask.name }} = {{ mask.value }}</label>
                </div>
              </div>
            </div>

            <div class="grid2 external-parameter-grid">
              <div class="field-pack external-parameter-option">
                <label class="check-row"><input v-model="selectedEmitter.externalData" type="checkbox" />外放粒子数值数据</label>
                <label v-if="selectedEmitter.externalData" class="field"><span>粒子数值数据变量名</span><input v-model="selectedEmitter.vars.data" class="input" type="text" placeholder="data1" /></label>
              </div>
              <div class="field-pack external-parameter-option">
                <label class="check-row"><input v-model="selectedEmitter.externalTemplate" type="checkbox" />外放粒子数据</label>
                <label v-if="selectedEmitter.externalTemplate" class="field"><span>粒子数据变量名</span><input v-model="selectedEmitter.vars.template" class="input" type="text" placeholder="template1" /></label>
              </div>
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
              <BindableField :card="selectedEmitter" path="particle.visibleRange" label="可见距离" value-type="float" min="1" step="1" />
            </div>
            <div class="curve-option-row">
              <label class="check-row"><input v-model="selectedEmitter.particle.colorGradientEnabled" type="checkbox" />颜色渐变</label>
              <label
                v-if="selectedEmitter.useGPU && selectedEmitter.externalData && selectedEmitter.externalTemplate && selectedEmitter.particle.colorGradientEnabled && selectedEmitter.curves.color.enabled"
                class="check-row"
              >
                <input v-model="selectedEmitter.gpu.useDataColorCurve" type="checkbox" />引用 simpleData 颜色
              </label>
            </div>
            <div
              v-if="selectedEmitter.useGPU && selectedEmitter.externalData && selectedEmitter.externalTemplate && selectedEmitter.particle.colorGradientEnabled && selectedEmitter.curves.color.enabled && selectedEmitter.gpu.useDataColorCurve"
              class="compatibility-note"
            >每个粒子生成时都会从 simpleData 创建颜色曲线。外部修改会生效，但会增加对象分配。</div>
            <BindableColorVector :card="selectedEmitter" path="particle.colorStart" label="起始颜色" />
            <BindableColorVector v-if="selectedEmitter.particle.colorGradientEnabled" :card="selectedEmitter" path="particle.colorEnd" label="最终颜色" />
            <BindableVector :card="selectedEmitter" path="particle.velocity" label="速度方向" value-type="vec3" step="0.01" />
            <BindableVector :card="selectedEmitter" path="particle.velocityRandom" label="速度随机量" value-type="vec3" min="0" step="0.01" />
            <div class="grid3">
              <BindableField :card="selectedEmitter" path="particle.speedMin" label="最小速度" min="0" step="0.01" />
              <BindableField :card="selectedEmitter" path="particle.speedMax" label="最大速度" min="0" step="0.01" />
              <label class="field"><span>速度模式</span><select v-model="selectedEmitter.particle.velocityMode" class="input"><option value="fixed">固定方向</option><option value="spawn_relative">从发射点向外</option><option value="spawn_inward">从发射点朝内</option></select></label>
            </div>
          </section>

          <section class="editor-section">
            <div class="section-title">物理</div>
            <div class="grid3 physics-grid">
              <BindableField v-if="!selectedEmitter.useGPU" :card="selectedEmitter" path="physics.gravity" label="重力强度（0=关闭）" min="0" step="0.01" />
              <label class="field"><span>{{ selectedEmitter.useGPU ? 'GPU 方块碰撞' : '粒子物理碰撞' }}</span><select v-model="selectedEmitter.physics.collision" class="input"><option :value="false">关闭</option><option :value="true">开启</option></select></label>
              <label v-if="!selectedEmitter.useGPU" class="field">
                <span>粒子碰撞目标</span>
                <input
                  class="input"
                  type="text"
                  :disabled="!selectedEmitter.physics.collision"
                  :value="selectedEmitter.physics.collisionTargets.join(', ')"
                  placeholder="留空表示所有 sign"
                  @input="updateCollisionTargets(selectedEmitter, $event.target.value)"
                />
              </label>
            </div>
            <div v-if="selectedEmitter.useGPU" class="compatibility-note">GPU 碰撞写入 ControlableCParticleData.blockCollision；碰撞目标仅用于 CPU 粒子的 sign 筛选。CParticle 运动使用独立的 Force Commands。</div>
          </section>

          <section class="editor-section">
            <div class="section-title">渲染与姿态</div>
            <div class="grid3">
              <label class="field"><span>相机模式</span><select v-model="selectedEmitter.render.billboardMode" class="input" @change="syncBillboardScaleMode(selectedEmitter)"><option v-for="mode in billboardModes" :key="mode.id" :value="mode.id">{{ mode.label }}</option></select></label>
              <BindableField :card="selectedEmitter" path="render.alpha" label="不透明度 %" min="0" max="100" step="1" />
              <BindableField :card="selectedEmitter" path="render.light" label="亮度" value-type="int" min="-1" max="15" step="1" />
            </div>
            <div class="grid3">
              <BindableField :card="selectedEmitter" path="render.roll" :label="selectedEmitter.render.billboardMode === 'none' && selectedEmitter.render.relativeRotation ? '滚转基础偏移 °' : '滚转角 °'" step="1" />
              <template v-if="selectedEmitter.render.billboardMode === 'axis_billboard'">
                <label class="field"><span>轴向偏航角 °</span><input class="input" type="number" step="1" :value="axisYaw(selectedEmitter)" @input="updateAxisAngle(selectedEmitter, 'yaw', $event.target.value)" /></label>
                <label class="field"><span>轴向俯仰角 °</span><input class="input" type="number" step="1" :value="axisPitch(selectedEmitter)" @input="updateAxisAngle(selectedEmitter, 'pitch', $event.target.value)" /></label>
              </template>
              <template v-else-if="selectedEmitter.render.billboardMode === 'none'">
                <BindableField :card="selectedEmitter" path="render.yaw" :label="selectedEmitter.render.relativeRotation ? '偏航基础偏移 °' : '偏航角 °'" step="1" />
                <BindableField :card="selectedEmitter" path="render.pitch" :label="selectedEmitter.render.relativeRotation ? '俯仰基础偏移 °' : '俯仰角 °'" step="1" />
              </template>
            </div>
            <label v-if="selectedEmitter.render.billboardMode === 'none'" class="check-row">
              <input v-model="selectedEmitter.render.relativeRotation" type="checkbox" />相对出生位置旋转
            </label>
            <div class="grid3">
              <label class="field"><span>缩放模式</span><select v-model="selectedEmitter.render.scaleMode" class="input"><option v-for="mode in scaleModeOptions(selectedEmitter)" :key="mode.id" :value="mode.id">{{ mode.label }}</option></select></label>
              <BindableField :card="selectedEmitter" path="render.baseScale.x" label="宽度倍率" value-type="float" min="0" step="0.01" />
              <BindableField :card="selectedEmitter" path="render.baseScale.y" label="高度倍率" value-type="float" min="0" step="0.01" />
            </div>
            <div class="grid3 sign-grid-row">
              <div v-if="!selectedEmitter.useGPU" class="field-pack sign-field-wrap" :class="{ 'duplicate-sign-field': duplicateEmitterSignCount(selectedEmitter) }">
                <BindableField :card="selectedEmitter" path="render.sign" label="标记值" value-type="int" step="1" />
                <small v-if="duplicateEmitterSignCount(selectedEmitter)" class="duplicate-sign-message">
                  与 {{ duplicateEmitterSignCount(selectedEmitter) }} 个启用发射器 sign 重复
                </small>
              </div>
              <BindableField :card="selectedEmitter" path="render.speedLimit" label="速度上限" min="0" step="1" />
            </div>
          </section>

          <section class="editor-section">
            <div class="section-title">生命周期曲线</div>
            <div v-if="selectedEmitter.useGPU" class="compatibility-note">GPU 开启大小同步时使用等比缩放曲线；关闭后分别使用 X/Y 缩放曲线。亮度与姿态曲线仅用于 CPU 粒子。</div>
            <div class="curve-stack">
              <div class="curve-option-row">
                <label class="check-row"><input v-model="selectedEmitter.curves.size.syncAxes" type="checkbox" />大小同步</label>
              </div>
              <LifecycleCurveEditor v-if="selectedEmitter.curves.size.syncAxes" title="大小 / 缩放" :curve="selectedEmitter.curves.size.x" toggleable />
              <details v-else class="axis-curve-box" open>
                <summary>缩放轴向曲线</summary>
                <div class="axis-curve-content">
                  <LifecycleCurveEditor title="大小 X / 宽度" :curve="selectedEmitter.curves.size.x" toggleable />
                  <LifecycleCurveEditor title="大小 Y / 高度" :curve="selectedEmitter.curves.size.y" toggleable />
                </div>
              </details>
              <LifecycleCurveEditor v-if="!selectedEmitter.useGPU" title="亮度" :curve="selectedEmitter.curves.light" :hard-min="-1" :hard-max="15" toggleable />
              <div v-if="!selectedEmitter.useGPU" class="curve-option-row">
                <label class="check-row"><input v-model="selectedEmitter.curves.rotation.syncAxes" type="checkbox" />旋转同步</label>
              </div>
              <LifecycleCurveEditor v-if="!selectedEmitter.useGPU && (selectedEmitter.curves.rotation.syncAxes || !showRotationAxisCurves(selectedEmitter))" title="滚转角" :curve="selectedEmitter.curves.rotation.roll" toggleable />
              <details v-else-if="!selectedEmitter.useGPU" class="axis-curve-box" open>
                <summary>旋转轴向曲线</summary>
                <div class="axis-curve-content">
                  <LifecycleCurveEditor title="滚转角" :curve="selectedEmitter.curves.rotation.roll" toggleable />
                  <LifecycleCurveEditor title="偏航角" :curve="selectedEmitter.curves.rotation.yaw" toggleable />
                  <LifecycleCurveEditor title="俯仰角" :curve="selectedEmitter.curves.rotation.pitch" toggleable />
                </div>
              </details>
              <LifecycleCurveEditor title="不透明度" :curve="selectedEmitter.curves.opacity" :hard-min="0" :hard-max="100" value-suffix="%" toggleable />
              <LifecycleCurveEditor
                v-if="selectedEmitter.particle.colorGradientEnabled"
                title="颜色渐变进度"
                :curve="selectedEmitter.curves.color"
                :hard-min="0"
                :hard-max="1"
                :color-low="selectedEmitter.particle.colorStart"
                :color-high="selectedEmitter.particle.colorEnd"
                :max-frames="selectedEmitter.useGPU ? 8 : null"
                toggleable
              />
            </div>
          </section>
        </template>

        <div v-else class="empty-state">在左侧选择发射器或粒子处理力。</div>
      </aside>
    </main>

    <section v-else class="generator-code-page">
      <div class="generator-panel code-panel-wide">
        <div class="panel-title-row">
          <strong>Kotlin 输出</strong>
          <button class="btn small primary" @click="copyKotlin">复制代码</button>
        </div>
        <div v-if="hasEnabledFluidFlowForce" class="compatibility-note">FluidFlow 还需要客户端通过 CParticleForceResourceRegistry 注册 CParticleForceResourceBinding；这里仅生成声明式资源引用。</div>
        <pre class="kotlin-output"><code v-html="highlightedKotlinOutput"></code></pre>
      </div>
    </section>
    <GeneratorSettingsModal
      :open="settingsOpen"
      :project="project"
      :theme-options="generatorThemeOptions"
      :active-theme="appTheme"
      :message="settingsMessage"
      :message-is-error="settingsMessageIsError"
      @close="closeGeneratorSettings"
      @lifecycle-change="restartPreviewAfterRootLifecycleChange"
      @open-hotkeys="openGeneratorHotkeys"
      @export-settings="exportGeneratorSettings"
      @import-settings="importGeneratorSettings"
      @update-theme="appTheme = $event"
    />
    <GeneratorHotkeysModal
      :open="hotkeysOpen"
      :hotkeys="project.settings.hotkeys"
      :hotkey-defs="hotkeyDefs"
      :capturing-key="hotkeyCaptureKey"
      :hint="hotkeyHint"
      @close="closeGeneratorHotkeys"
      @start-capture="startHotkeyCapture"
      @clear-hotkey="clearHotkey"
      @reset-hotkeys="resetAllHotkeys"
    />
  </div>
  <div v-else class="generator-loading" role="status">正在打开项目...</div>
</template>

<script setup>
import { RouterLink } from 'vue-router';
import { computed, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, Teleport, watch } from 'vue';
import { onBeforeRouteLeave, onBeforeRouteUpdate, useRoute, useRouter } from 'vue-router';
import PreviewCanvas from '../components/PreviewCanvas.vue';
import LifecycleCurveEditor from '../components/LifecycleCurveEditor.vue';
import GeneratorParameterValueEditor from '../components/GeneratorParameterValueEditor.vue';
import NumericInput from '../components/NumericInput.vue';
import GeneratorExpressionEditor from '../components/GeneratorExpressionEditor.vue';
import GeneratorSettingsModal from '../components/GeneratorSettingsModal.vue';
import GeneratorHotkeysModal from '../components/GeneratorHotkeysModal.vue';
import CParticleForceEditor from '../components/CParticleForceEditor.vue';
import CParticleResourceEditor from '../components/CParticleResourceEditor.vue';
import CParticleMaskEditor from '../components/CParticleMaskEditor.vue';
import { highlightKotlin } from '../utils/legacy-code-highlight.js';
import { readAppTheme, watchAppTheme, writeAppTheme } from '../modules/theme/app-theme.js';
import { refreshShellCustomSelects } from '../modules/theme/custom-select.js';
import {
  BILLBOARD_MODES,
  CPARTICLE_FORCE_MAX_COMMANDS,
  COMMAND_TYPE_OPTIONS,
  EFFECT_OPTIONS,
  EMITTER_TYPES,
  GENERATOR_VALUE_TYPES,
  GENERATOR_HOTKEY_DEFAULTS,
  GENERATOR_THEME_OPTIONS,
  TEXTURE_SHEET_OPTIONS,
  createCParticleForceCommand,
  createCParticleForceResource,
  createCommandQueue,
  createDefaultCommandParams,
  createEmitterCard,
  createGeneratorConstant,
  createGeneratorProject,
  createGeneratorVariable,
  createQueueCommand,
  countDuplicateEmitterSigns,
  nextAvailableCParticleCommandMaskValue,
  nextAvailableCParticleDefinitionName,
  nextAvailableCParticleSignValue,
  normalizeCollisionTargets,
  normalizeGeneratorProject
} from '../modules/generator/defaults.js';
import { generateEmitterKotlin } from '../modules/generator/codegen.js';
import { createGeneratorPreviewRuntime } from '../modules/generator/preview-simulation.js';
import { hydrateCParticleTexturePreviews } from '../modules/generator/cparticle-texture-preview.js';
import {
  consumePendingGeneratorProject,
  getElectronShell,
  openProjectResult,
  sanitizeFileBase
} from '../services/shell/electron-shell.js';
import { readAutoSaveIntervals, readCurrentBackupEnabled } from '../modules/preferences/auto-save.js';
import { classifyProjectData, parseProjectText } from '../modules/projects/project-types.js';
import { getProjectRepository } from '../services/repositories/project-repository.js';
import { evaluatePointsProject } from '../modules/pointsbuilder/evaluator.js';
import {
  calculateGeneratorNumericScrubValue,
  filterGeneratorBindingsByType,
  filterGeneratorValueNameInput
} from '../modules/generator/parameter-values.js';
import {
  collectGeneratorValueEntries,
  createGeneratorBindingResolver,
  generatorBindingType
} from '../modules/generator/bindings.js';
import {
  analyzeGeneratorDoTick,
  applyGeneratorExpressionCompletion,
  buildGeneratorExpressionCompletions,
  isLikelyIncompleteGeneratorExpression,
  validateGeneratorExpression
} from '../modules/generator/expression-runtime.js';
import {
  getProjectNodes
} from '../modules/pointsbuilder/defaults.js';
import {
  eventToHotkey,
  hotkeyMatchEvent,
  hotkeyToHuman
} from '../modules/pointsbuilder/hotkeys.js';

const STORAGE_KEY = 'vue_emitter_generator_state_v2';
const AUTO_SAVE_DELAY_MS = 350;
const MAX_PREVIEW_UPDATES_PER_SECOND = 60;
const LEFT_PANEL_MIN_WIDTH = 220;
const RIGHT_PANEL_MIN_WIDTH = 260;
const PREVIEW_MIN_WIDTH = 160;
const PANEL_RESIZER_WIDTH = 8;
const PANEL_WIDTH_MAX_FALLBACK = 2400;
const previewCanvasRef = ref(null);
const route = useRoute();
const router = useRouter();
const projectRepository = getProjectRepository();
const fpsText = ref('--');
const previewTick = ref(0);
const previewPoints = shallowRef([]);
const previewErrors = ref([]);
const previewWarnings = ref([]);
const visibleAutocompleteIds = ref(new Set());
const settingsOpen = ref(false);
const hotkeysOpen = ref(false);
const hotkeyCaptureKey = ref('');
const settingsMessage = ref('');
const settingsMessageIsError = ref(false);
const HOTKEY_HINT_IDLE = '点击“设置”后按下按键（Esc 取消，Backspace 清空）。';
const hotkeyHint = computed(() => {
  if (!hotkeyCaptureKey.value) return HOTKEY_HINT_IDLE;
  const def = hotkeyDefs.find((item) => item.key === hotkeyCaptureKey.value);
  return `正在设置：${def?.label || hotkeyCaptureKey.value}（Esc 取消，Backspace 清空）`;
});
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
let textureHydrationGeneration = 0;
let indexedSaveQueue = Promise.resolve();
let historyApplying = false;
let suppressNextProjectAutoSave = false;
let savedFileSnapshot = JSON.stringify(project.value);
const undoStack = [];
const redoStack = [];

const leftTabGroups = [
  {
    id: 'particle_commands',
    label: '粒子与命令',
    tabs: [
      { id: 'emitters', label: '发射器' },
      { id: 'queues', label: 'CPU 粒子处理力' },
      { id: 'force_commands', label: 'GPU 粒子处理力' },
      { id: 'death', label: '死亡行为' }
    ]
  },
  {
    id: 'project_declarations',
    label: '项目声明与变量',
    tabs: [
      { id: 'resources', label: '资源声明' },
      { id: 'cparticle_masks', label: 'CParticle 掩码' },
      { id: 'tick', label: '每 Tick' },
      { id: 'project', label: '项目与变量' }
    ]
  },
];

const emitterTypes = EMITTER_TYPES;
const billboardModes = BILLBOARD_MODES;
const effectOptions = EFFECT_OPTIONS;
const textureSheetOptions = TEXTURE_SHEET_OPTIONS;
const effectAutocompleteOptions = EFFECT_OPTIONS.map((item) => ({ value: item.className, label: item.label }));
const renderTypeAutocompleteOptions = TEXTURE_SHEET_OPTIONS.map((item) => ({ value: item.id, label: item.label }));
const generatorValueTypes = GENERATOR_VALUE_TYPES;
const commandTypeOptions = COMMAND_TYPE_OPTIONS;
const cparticleForceLimit = CPARTICLE_FORCE_MAX_COMMANDS;
const enabledCParticleForceCount = computed(() => project.value.forceCommands.filter((command) => command.enabled !== false).length);
const textureForceResourceCount = computed(() => project.value.forceResources.filter((resource) => resource.kind === 'texture').length);
const fluidForceResourceCount = computed(() => project.value.forceResources.filter((resource) => resource.kind === 'fluid').length);
const nextCParticleCommandMaskValue = computed(() => nextAvailableCParticleCommandMaskValue(project.value.commandMasks));
const generatorThemeOptions = GENERATOR_THEME_OPTIONS;
const hotkeyFields = [
  { key: 'toggleSettings', label: '设置' },
  { key: 'playPause', label: '播放 / 暂停' },
  { key: 'clearParticles', label: '清理粒子' },
  { key: 'resetCamera', label: '重置镜头' },
  { key: 'fullscreen', label: '全屏预览' },
  { key: 'deleteEmitter', label: '删除发射器' },
  { key: 'undo', label: '撤销' },
  { key: 'redo', label: '重做' }
];
const hotkeyDefs = hotkeyFields.map((item) => ({
  ...item,
  desc: `默认 ${hotkeyToHuman(GENERATOR_HOTKEY_DEFAULTS[item.key]) || '未设置'}`
}));

const selectedEmitter = computed(() => project.value.emitters.find((card) => card.id === project.value.selectedEmitterId) || project.value.emitters[0] || null);
const selectedQueue = computed(() => project.value.commandQueues.find((queue) => queue.id === project.value.selectedQueueId) || project.value.commandQueues[0] || null);
const kotlinOutput = computed(() => {
  try {
    return generateEmitterKotlin(project.value);
  } catch (error) {
    const message = String(error?.message || error || '未知错误');
    return `// Kotlin 代码生成失败\n${message.split('\n').map((line) => `// ${line}`).join('\n')}`;
  }
});
const highlightedKotlinOutput = computed(() => highlightKotlin(kotlinOutput.value));
const hasEnabledFluidFlowForce = computed(() => project.value.forceCommands.some((command) => (
  command?.enabled !== false && command.force?.type === 'FluidFlow'
)));
const previewInterpolationMs = computed(() => {
  const ticksPerSecond = Math.max(1, Number(project.value.ticksPerSecond || 20));
  const updateRate = Math.min(ticksPerSecond, MAX_PREVIEW_UPDATES_PER_SECOND);
  return Math.max(16, 1000 / updateRate);
});
const workspaceStyle = computed(() => ({
  '--left-panel-width': `${project.value.settings.leftPanelWidth || 340}px`,
  '--right-panel-width': `${project.value.settings.rightPanelWidth || 480}px`
}));
const hasVisibleAutocomplete = computed(() => visibleAutocompleteIds.value.size > 0);

function setGeneratorAutocompleteVisibility(id, visible) {
  const current = visibleAutocompleteIds.value;
  if (current.has(id) === visible) return;
  const next = new Set(current);
  if (visible) next.add(id);
  else next.delete(id);
  visibleAutocompleteIds.value = next;
}
const bindableRefs = computed(() => collectGeneratorValueEntries(project.value.parameters).map(({ scope, value: item }) => ({
  name: item.name,
  type: item.type,
  kind: scope === 'constant' ? 'constant' : 'variable',
  label: `${item.name} : ${item.type}${scope === 'constant' ? ' const' : ''}`,
  detail: `${item.type}${scope === 'constant' ? ' const' : ''}`
})));
const bindingResolver = computed(() => createGeneratorBindingResolver(project.value.parameters));
const doTickCompletions = computed(() => buildGeneratorExpressionCompletions(project.value.parameters, { statements: true }));
const doTickValidationMessage = computed(() => {
  const source = project.value.doTick?.source || '';
  if (isLikelyIncompleteGeneratorExpression(source)) return '';
  const typed = analyzeGeneratorDoTick(source, project.value.parameters, {
    context: { tick: 0, progress: 0 }
  });
  if (typed.handled) return typed.valid ? '' : typed.message;
  if (typed.fallbackSafe !== true) {
    return typed.message || '复杂 doTick 无法可靠转换为 Kotlin';
  }
  return validateGeneratorExpression(
    source,
    [...bindableRefs.value.map((item) => item.name), 'progress'],
    {
      statements: true,
      mutableNames: project.value.parameters.variables.map((item) => item.name)
    }
  ).message;
});
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
    const draftValue = ref(null);
    watch(
      () => [props.card, props.path, props.valueType],
      () => { draftValue.value = null; },
      { flush: 'sync' }
    );

    function updateValue(next) {
      if (isBindableNumericValueType(props.valueType)) {
        draftValue.value = String(next ?? '');
        return;
      }
      applyBindableSingleInput(props.card, props.path, next, props.valueType);
    }

    function commitValue(next) {
      const value = draftValue.value ?? next;
      applyBindableSingleInput(props.card, props.path, value, props.valueType);
      draftValue.value = null;
    }

    return () => h('label', { class: ['field', 'bindable-field', { compact: props.compact }] }, [
      h('span', props.label),
      renderBindableSingleInput(props.card, props.path, props, {
        draftValue: draftValue.value,
        onUpdate: updateValue,
        onCommit: commitValue
      })
    ]);
  }
});

let autocompleteSequence = 0;

const MinecraftAutocomplete = defineComponent({
  name: 'MinecraftAutocomplete',
  props: {
    modelValue: { type: String, default: '' },
    options: { type: Array, default: () => [] },
    maxItems: { type: Number, default: 10 },
    placeholder: { type: String, default: '' },
    title: { type: String, default: '' },
    expression: { type: Boolean, default: false },
    validationMessage: { type: String, default: '' },
    scrub: { type: Boolean, default: false },
    scrubStep: { type: [String, Number], default: 0.01 },
    scrubMin: { type: [String, Number], default: undefined },
    scrubMax: { type: [String, Number], default: undefined }
  },
  emits: ['update:modelValue', 'commit'],
  setup(props, { emit }) {
    const instanceId = `generator-autocomplete-${++autocompleteSequence}`;
    const listboxId = `${instanceId}-listbox`;
    const validationId = `${instanceId}-validation`;
    const inputRef = ref(null);
    const suggestionRef = ref(null);
    const open = ref(false);
    const composing = ref(false);
    const activeIndex = ref(0);
    const hasExplicitSelection = ref(false);
    const selectionStart = ref(0);
    const selectionEnd = ref(0);
    const suggestionStyle = ref({});
    let trackingSuggestions = false;
    let scrubState = null;
    let suppressScrubClick = false;
    const activeQuery = computed(() => {
      const value = String(props.modelValue || '');
      if (!props.expression) return value.trim().toLowerCase();
      const cursor = Math.min(value.length, Math.max(0, selectionStart.value));
      return (value.slice(0, cursor).match(/[A-Za-z_][A-Za-z0-9_]*$/)?.[0] || '').toLowerCase();
    });
    const matches = computed(() => {
      const query = activeQuery.value;
      const normalized = props.options
        .map((item) => ({
          id: String(item?.id || `${item?.kind || 'option'}:${item?.value || item?.label || ''}`),
          value: String(item?.value || ''),
          insertText: String(item?.insertText || item?.value || ''),
          label: String(item?.label || item?.value || ''),
          displayText: String(item?.displayText || item?.value || ''),
          detail: String(item?.detail ?? (item?.label !== item?.value ? item?.label || '' : '')),
          kind: String(item?.kind || ''),
          type: String(item?.type || ''),
          cursorOffset: item?.cursorOffset,
          selectionLength: item?.selectionLength,
          memberInsertText: item?.memberInsertText
        }))
        .filter((item) => item.value);
      const filtered = query
        ? normalized.filter((item) => [item.value, item.label, item.displayText, item.detail]
          .some((text) => text.toLowerCase().includes(query)))
        : normalized;
      return filtered
        .sort((a, b) => scoreAutocomplete(a, query) - scoreAutocomplete(b, query) || a.value.localeCompare(b.value))
        .slice(0, Math.min(8, Math.max(1, props.maxItems)));
    });
    const menuVisible = computed(() => open.value && matches.value.length > 0);
    const showValidation = computed(() => Boolean(props.validationMessage) && !menuVisible.value);

    watch(menuVisible, (visible) => {
      setGeneratorAutocompleteVisibility(instanceId, visible);
    }, { immediate: true });

    watch(matches, (items) => {
      if (activeIndex.value >= items.length) activeIndex.value = 0;
      if (open.value) nextTick(updateSuggestionPosition);
    });

    function updateSuggestionPosition() {
      const input = inputRef.value;
      if (!input || typeof window === 'undefined') return;
      const rect = input.getBoundingClientRect();
      const gap = 4;
      const viewportGap = 8;
      const desiredHeight = Math.min(328, Math.max(48, matches.value.length * 40 + 8));
      const availableBelow = window.innerHeight - rect.bottom - viewportGap - gap;
      const availableAbove = rect.top - viewportGap - gap;
      const placeAbove = availableBelow < desiredHeight && availableAbove > availableBelow;
      const maxHeight = Math.max(48, Math.min(desiredHeight, placeAbove ? availableAbove : availableBelow));
      const width = Math.min(
        Math.max(rect.width, 360),
        480,
        window.innerWidth - viewportGap * 2
      );
      const left = Math.min(Math.max(viewportGap, rect.left), window.innerWidth - width - viewportGap);
      suggestionStyle.value = {
        position: 'fixed',
        left: `${left}px`,
        top: `${placeAbove ? Math.max(viewportGap, rect.top - maxHeight - gap) : rect.bottom + gap}px`,
        width: `${width}px`,
        maxWidth: `${window.innerWidth - viewportGap * 2}px`,
        maxHeight: `${maxHeight}px`
      };
    }

    function scrollActiveSuggestion() {
      nextTick(() => {
        const active = suggestionRef.value?.querySelector(`[data-completion-index="${activeIndex.value}"]`);
        active?.scrollIntoView({ block: 'nearest' });
      });
    }

    function startSuggestionTracking() {
      if (trackingSuggestions || typeof window === 'undefined') return;
      trackingSuggestions = true;
      window.addEventListener('resize', updateSuggestionPosition);
      window.addEventListener('scroll', updateSuggestionPosition, true);
    }

    function stopSuggestionTracking() {
      if (!trackingSuggestions || typeof window === 'undefined') return;
      trackingSuggestions = false;
      window.removeEventListener('resize', updateSuggestionPosition);
      window.removeEventListener('scroll', updateSuggestionPosition, true);
    }

    onBeforeUnmount(() => {
      stopNumericScrubTracking();
      stopSuggestionTracking();
      setGeneratorAutocompleteVisibility(instanceId, false);
    });

    function startNumericScrub(event) {
      const startValue = Number(props.modelValue);
      if (!props.scrub || event.button !== 0 || !Number.isFinite(startValue)) return;
      event.preventDefault();
      event.currentTarget?.setPointerCapture?.(event.pointerId);
      scrubState = {
        startY: event.clientY,
        startValue,
        lastValue: String(props.modelValue),
        active: false
      };
      open.value = false;
      window.addEventListener('pointermove', moveNumericScrub);
      window.addEventListener('pointerup', finishNumericScrub, { once: true });
      window.addEventListener('pointercancel', finishNumericScrub, { once: true });
    }

    function moveNumericScrub(event) {
      if (!scrubState) return;
      const verticalPixels = scrubState.startY - event.clientY;
      if (!scrubState.active && Math.abs(verticalPixels) < 3) return;
      scrubState.active = true;
      event.preventDefault();
      document.documentElement.classList.add('generator-numeric-scrubbing');
      const scale = event.shiftKey ? 0.1 : (event.ctrlKey || event.metaKey) ? 10 : 1;
      const next = calculateGeneratorNumericScrubValue(scrubState.startValue, verticalPixels, {
        step: props.scrubStep,
        min: props.scrubMin,
        max: props.scrubMax,
        scale
      });
      scrubState.lastValue = String(next);
      emit('update:modelValue', scrubState.lastValue);
    }

    function finishNumericScrub(event) {
      if (!scrubState) return;
      const state = scrubState;
      stopNumericScrubTracking();
      if (!state.active) return;
      event?.preventDefault?.();
      suppressScrubClick = true;
      emit('commit', state.lastValue);
      open.value = false;
    }

    function stopNumericScrubTracking() {
      scrubState = null;
      document.documentElement.classList.remove('generator-numeric-scrubbing');
      window.removeEventListener('pointermove', moveNumericScrub);
      window.removeEventListener('pointerup', finishNumericScrub);
      window.removeEventListener('pointercancel', finishNumericScrub);
    }

    function update(event) {
      const target = event.target;
      selectionStart.value = Number(target.selectionStart) || 0;
      selectionEnd.value = Number(target.selectionEnd) || selectionStart.value;
      emit('update:modelValue', target.value);
      if (composing.value) {
        open.value = false;
        return;
      }
      activeIndex.value = 0;
      hasExplicitSelection.value = false;
      open.value = true;
      nextTick(updateSuggestionPosition);
    }

    function syncSelection(event) {
      const target = event?.target;
      if (!target) return;
      const nextStart = Number(target.selectionStart) || 0;
      const nextEnd = Number(target.selectionEnd) || nextStart;
      const selectionChanged = nextStart !== selectionStart.value || nextEnd !== selectionEnd.value;
      selectionStart.value = nextStart;
      selectionEnd.value = nextEnd;
      if (event?.type === 'keyup' && ['ArrowDown', 'ArrowUp'].includes(event.key)) return;
      if (selectionChanged) {
        activeIndex.value = 0;
        hasExplicitSelection.value = false;
      }
    }

    function accept(index = activeIndex.value) {
      const item = matches.value[index];
      if (!item) return;
      if (!props.expression) {
        emit('update:modelValue', item.value);
        selectionStart.value = item.value.length;
        selectionEnd.value = item.value.length;
      } else {
        const next = applyGeneratorExpressionCompletion(
          props.modelValue,
          selectionStart.value,
          selectionEnd.value,
          item
        );
        emit('update:modelValue', next.value);
        selectionStart.value = next.selectionStart;
        selectionEnd.value = next.selectionEnd;
        nextTick(() => {
          inputRef.value?.focus();
          inputRef.value?.setSelectionRange(next.selectionStart, next.selectionEnd);
        });
      }
      open.value = false;
      hasExplicitSelection.value = false;
    }

    function move(delta) {
      if (!matches.value.length) return;
      open.value = true;
      activeIndex.value = (activeIndex.value + delta + matches.value.length) % matches.value.length;
      hasExplicitSelection.value = true;
      scrollActiveSuggestion();
    }

    function onKeydown(event) {
      if (composing.value || event.isComposing || event.keyCode === 229) return;
      if ((event.ctrlKey || event.metaKey) && event.code === 'Space') {
        event.preventDefault();
        open.value = true;
        activeIndex.value = 0;
        hasExplicitSelection.value = false;
        nextTick(updateSuggestionPosition);
        return;
      }
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
      if ((event.key === 'Tab' || event.key === 'Enter')
        && open.value
        && matches.value.length
        && (activeQuery.value || hasExplicitSelection.value)) {
        if (!matches.value[activeIndex.value]) return;
        event.preventDefault();
        accept();
        return;
      }
      if (event.key === 'Escape') {
        if (open.value) event.preventDefault();
        open.value = false;
        return;
      }
      if (event.key === 'Enter') {
        emit('commit', event.target.value);
        open.value = false;
      }
    }

    function onCompositionStart() {
      composing.value = true;
      open.value = false;
    }

    function onCompositionEnd(event) {
      composing.value = false;
      update(event);
    }

    return () => h('div', {
      class: ['mc-autocomplete', {
        'mc-autocomplete--invalid': showValidation.value,
        'mc-autocomplete--scrubbable': props.scrub
      }]
    }, [
      h('input', {
        ref: inputRef,
        class: ['input', { invalid: showValidation.value }],
        type: 'text',
        value: props.modelValue,
        placeholder: props.placeholder,
        title: props.title || undefined,
        role: 'combobox',
        'aria-autocomplete': 'list',
        'aria-expanded': String(menuVisible.value),
        'aria-controls': listboxId,
        'aria-activedescendant': menuVisible.value ? `${listboxId}-option-${activeIndex.value}` : undefined,
        'aria-invalid': showValidation.value ? 'true' : undefined,
        'aria-describedby': showValidation.value ? validationId : undefined,
        autocomplete: 'off',
        spellcheck: 'false',
        onInput: update,
        onClick: (event) => {
          if (suppressScrubClick) {
            suppressScrubClick = false;
            event.preventDefault();
            return;
          }
          syncSelection(event);
          if (!composing.value) {
            open.value = true;
            nextTick(updateSuggestionPosition);
          }
        },
        onSelect: syncSelection,
        onKeyup: syncSelection,
        onFocus: (event) => {
          syncSelection(event);
          open.value = true;
          startSuggestionTracking();
          nextTick(updateSuggestionPosition);
        },
        onBlur: (event) => {
          emit('commit', event.target.value);
          window.setTimeout(() => {
            open.value = false;
            stopSuggestionTracking();
          }, 100);
        },
        onCompositionstart: onCompositionStart,
        onCompositionend: onCompositionEnd,
        onDragstart: (event) => props.scrub && event.preventDefault(),
        onKeydown
      }),
      props.scrub
        ? h('div', {
          class: 'mc-autocomplete-stepper',
          role: 'presentation',
          'aria-hidden': 'true',
          onPointerdown: startNumericScrub,
          onPointerup: finishNumericScrub,
          onPointercancel: finishNumericScrub,
          onContextmenu: (event) => event.preventDefault()
        }, [
          h('span', { class: 'mc-autocomplete-step mc-autocomplete-step--up' }, [
            h('svg', { viewBox: '0 0 12 12', 'aria-hidden': 'true' }, [h('path', { d: 'm2.2 7.6 3.8-3.8 3.8 3.8' })])
          ]),
          h('span', { class: 'mc-autocomplete-step mc-autocomplete-step--down' }, [
            h('svg', { viewBox: '0 0 12 12', 'aria-hidden': 'true' }, [h('path', { d: 'm2.2 4.4 3.8 3.8 3.8-3.8' })])
          ])
        ])
        : null,
      menuVisible.value
        ? h(Teleport, { to: 'body' }, [h('div', {
          ref: suggestionRef,
          id: listboxId,
          class: ['mc-suggestions', 'generator-autocomplete-listbox'],
          role: 'listbox',
          'aria-label': '代码补全',
          style: suggestionStyle.value
        }, matches.value.map((item, index) => h('button', {
          key: `${item.id}:${index}`,
          id: `${listboxId}-option-${index}`,
          type: 'button',
          class: ['mc-suggestion', { active: index === activeIndex.value }],
          role: 'option',
          tabindex: '-1',
          'aria-selected': String(index === activeIndex.value),
          'data-completion-index': String(index),
          onMouseenter: () => {
            activeIndex.value = index;
            hasExplicitSelection.value = true;
          },
          onMousedown: (event) => {
            event.preventDefault();
            accept(index);
          }
        }, [
          h('span', { class: 'mc-suggestion-main' }, item.displayText),
          item.detail || item.type || item.kind
            ? h('span', { class: 'mc-suggestion-meta' }, [
              item.type || item.kind
                ? h('span', { class: 'mc-suggestion-kind' }, item.type || item.kind)
                : null,
              item.detail ? h('span', { class: 'mc-suggestion-label' }, item.detail) : null
            ])
            : null
        ])))])
        : null,
      showValidation.value
        ? h('div', { id: validationId, class: 'binding-validation', role: 'alert' }, props.validationMessage)
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
    const drafts = ref({});
    watch(
      () => [props.card, props.path, getBindingMode(props.card, props.path)],
      () => { drafts.value = {}; },
      { flush: 'sync' }
    );

    function updateAxisDraft(axis, value) {
      drafts.value = { ...drafts.value, [axis]: String(value ?? '') };
    }

    function commitAxisDraft(axis, value) {
      const draft = Object.prototype.hasOwnProperty.call(drafts.value, axis)
        ? drafts.value[axis]
        : value;
      setPath(props.card, `${props.path}.${axis}`, coerceBindableNumericInput(draft, 'number'));
      const nextDrafts = { ...drafts.value };
      delete nextDrafts[axis];
      drafts.value = nextDrafts;
    }

    return () => {
      const mode = getBindingMode(props.card, props.path);
      const axisGridStyle = {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: '8px',
        minWidth: '0'
      };
      const controls = mode === 'constant'
        ? h('div', { class: 'bindable-axis-grid', style: axisGridStyle }, axes.map((axis) => renderAxisNumberInput(props.card, props.path, axis, {
          step: props.step,
          min: props.min
        }, {
          hasDraft: Object.prototype.hasOwnProperty.call(drafts.value, axis.key),
          draftValue: drafts.value[axis.key],
          onUpdate: (value) => updateAxisDraft(axis.key, value),
          onCommit: (value) => commitAxisDraft(axis.key, value)
        })))
        : mode === 'independent'
          ? h('div', { class: 'bindable-axis-grid', style: axisGridStyle }, axes.map((axis) => renderAxisExpressionInput(
            props.card,
            `${props.path}.${axis.key}`,
            axis
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
    const draftColorHex = ref('');
    const axes = [
      { key: 'r', label: 'R' },
      { key: 'g', label: 'G' },
      { key: 'b', label: 'B' }
    ];
    watch(
      () => [props.card, props.path, getBindingMode(props.card, props.path)],
      () => { draftColorHex.value = ''; },
      { flush: 'sync' }
    );

    function updateColorDraft(value) {
      draftColorHex.value = colorHexValueFromInput(value);
    }

    function commitColorDraft(value) {
      const next = colorHexValueFromInput(draftColorHex.value || value);
      draftColorHex.value = '';
      if (next !== colorHexValue(props.card, props.path)) setPath(props.card, props.path, next);
    }

    return () => {
      const mode = getBindingMode(props.card, props.path);
      const axisGridStyle = {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: '8px',
        minWidth: '0'
      };
      const controls = mode === 'constant'
        ? h('div', { class: 'bindable-color-constant' }, [
          h('div', { class: 'color-main-row' }, [
            h('input', {
              class: 'input color-picker-input',
              type: 'color',
              value: draftColorHex.value || colorHexValue(props.card, props.path),
              title: '调色板',
              onInput: (event) => updateColorDraft(event.target.value),
              onChange: (event) => commitColorDraft(event.target.value),
              onBlur: (event) => commitColorDraft(event.target.value)
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
            h(NumericInput, {
              modelValue: colorChannelValue(props.card, props.path, axis.key),
              min: 0,
              max: 255,
              step: 1,
              integer: true,
              scrub: !getBinding(props.card, `${props.path}.${axis.key}`),
              'onUpdate:modelValue': (next) => updateColorChannel(props.card, props.path, axis.key, next),
              onCommit: (next) => updateColorChannel(props.card, props.path, axis.key, next)
            })
          ])))
        ])
        : mode === 'independent'
          ? h('div', { class: 'bindable-axis-grid', style: axisGridStyle }, axes.map((axis) => renderAxisExpressionInput(
            props.card,
            `${props.path}.${axis.key}`,
            axis
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

function renderBindableSingleInput(card, path, props, inputState = {}) {
  if (props.valueType === 'none' || props.options?.length) {
    return renderValueInput(card, path, props);
  }
  const storedValue = getBinding(card, path) || formatBindableSingleValue(getPath(card, path), props.valueType);
  const value = inputState.draftValue ?? storedValue;
  const scrub = isBindableNumericValueType(props.valueType)
    && !getBinding(card, path)
    && Number.isFinite(Number(value));
  const options = [
    ...(props.autocompleteOptions || []),
    ...bindingOptions(props.valueType).map((item) => ({
      id: `${item.kind}:${item.name}`,
      kind: item.kind,
      type: item.type,
      value: item.name,
      label: item.name,
      displayText: item.name,
      detail: item.detail
    })),
    ...(['number', 'int', 'long', 'float'].includes(props.valueType)
      ? buildGeneratorExpressionCompletions(project.value.parameters, {
        expectedType: generatorBindingType(props.valueType)
      }).map(toExpressionAutocompleteOption)
      : [])
  ];
  const scrubStep = ['int', 'long'].includes(props.valueType)
    ? Math.max(Number(props.step) || 1, 1)
    : props.step;
  return h(MinecraftAutocomplete, {
    class: 'bindable-single-input',
    modelValue: value,
    options,
    maxItems: 10,
    placeholder: props.valueType === 'string' ? '值 / 变量' : '数值 / 表达式',
    title: '输入常量、变量或表达式',
    expression: ['number', 'int', 'long', 'float'].includes(props.valueType),
    validationMessage: bindingValidationMessage(card, path, props.valueType),
    scrub,
    scrubStep,
    scrubMin: props.min,
    scrubMax: props.max,
    'onUpdate:modelValue': inputState.onUpdate
      || ((next) => applyBindableSingleInput(card, path, next, props.valueType)),
    onCommit: inputState.onCommit
      || ((next) => applyBindableSingleInput(card, path, next, props.valueType))
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
      setPath(card, path, coerceBindableNumericInput(text, valueType));
    } else {
      setBinding(card, path, text);
    }
    return;
  }
  setBinding(card, path, text);
}

function isBindableNumericValueType(valueType) {
  return ['number', 'int', 'long', 'float'].includes(valueType);
}

function coerceBindableNumericInput(value, valueType = 'number') {
  const text = String(value ?? '').trim();
  const numeric = Number(text);
  return valueType === 'int' || valueType === 'long' ? Math.trunc(numeric) : numeric;
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
  if (['number', 'int', 'long', 'float'].includes(props.valueType) && inputType !== 'color') {
    const numericStep = ['int', 'long'].includes(props.valueType)
      ? Math.max(Number(props.step) || 1, 1)
      : (props.step || 0.01);
    return h(NumericInput, {
      class: 'bindable-number-input',
      modelValue: value,
      step: numericStep,
      min: props.min,
      max: props.max,
      integer: props.valueType === 'int' || props.valueType === 'long',
      long: props.valueType === 'long',
      scrub: true,
      'onUpdate:modelValue': (next) => setPath(card, path, coerceBindableInputValue(next, props.valueType)),
      onCommit: (next) => setPath(card, path, coerceBindableInputValue(next, props.valueType))
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

function expressionBindingOptions(card, path, valueType = 'number') {
  const expectedType = generatorBindingType(valueType);
  const raw = getBinding(card, path);
  const numericTypes = new Set(['Int', 'Long', 'Float', 'Double']);
  const vectorTypes = new Set(['Vec3', 'RelativeLocation', 'Vector3f']);
  const activeDelimiter = String(raw).match(/([,(+\-*/])\s*[A-Za-z_0-9.]*$/)?.[1] || '';
  const vectorNumericOperand = vectorTypes.has(expectedType) && ['(', ',', '*', '/'].includes(activeDelimiter);
  const allowedTypes = vectorNumericOperand
    ? numericTypes
    : numericTypes.has(expectedType) && activeDelimiter
      ? numericOperandTypes(expectedType)
      : new Set([expectedType]);
  const refs = bindableRefs.value
    .filter((item) => allowedTypes.has(item.type))
    .map((item) => ({
      id: `${item.kind}:${item.name}`,
      kind: item.kind,
      type: item.type,
      value: item.name,
      insertText: item.name,
      displayText: item.name,
      detail: item.detail
    }));
  const startsNewExpression = /^\s*[A-Za-z_][A-Za-z0-9_]*\s*$/.test(raw) || !String(raw).trim();
  const relativeConversions = expectedType === 'Vec3' && startsNewExpression
    ? buildRelativeVec3Completions(bindableRefs.value)
    : [];
  const snippets = [
    ...buildGeneratorExpressionCompletions(project.value.parameters, {
      expectedType: vectorNumericOperand ? 'Double' : expectedType
    })
  ]
    .filter((item) => startsNewExpression || !item.label.startsWith('RelativeLocation('))
    .map(toExpressionAutocompleteOption);
  const seen = new Set();
  return [...refs, ...relativeConversions, ...snippets].filter((item) => {
    const key = `${item.value}|${item.insertText || item.value}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function numericOperandTypes(expectedType) {
  if (expectedType === 'Int') return new Set(['Int']);
  if (expectedType === 'Long') return new Set(['Long']);
  if (expectedType === 'Float') return new Set(['Float']);
  return new Set(['Int', 'Double']);
}

function buildRelativeVec3Completions(refs) {
  const relatives = refs.filter((item) => item.type === 'RelativeLocation');
  const vectors = refs.filter((item) => item.type === 'Vec3');
  return relatives.flatMap((relative) => {
    const targets = vectors.length ? vectors : [{ name: 'Vec3(0.0, 0.0, 0.0)' }];
    return targets.map((vector) => ({
      id: `conversion:${relative.name}:${vector.name}`,
      kind: 'conversion',
      type: 'Vec3',
      value: `${relative.name} + ${vector.name}`,
      insertText: `${relative.name} + ${vector.name}`,
      displayText: `${relative.name} + ${vector.name}`,
      detail: 'RelativeLocation -> Vec3',
      cursorOffset: vectors.length ? undefined : relative.name.length + 8,
      selectionLength: vectors.length ? undefined : 3
    }));
  });
}

function toExpressionAutocompleteOption(item) {
  return {
    id: item.id,
    kind: item.kind,
    type: item.type,
    signature: item.signature,
    value: item.insertText || item.label,
    insertText: item.insertText || item.label,
    label: item.label,
    displayText: item.label,
    detail: item.detail || '',
    cursorOffset: item.cursorOffset,
    selectionLength: item.selectionLength,
    memberInsertText: item.memberInsertText
  };
}

function bindingValidationMessage(card, path, valueType) {
  const raw = getBinding(card, path);
  if (!raw || isLikelyIncompleteGeneratorExpression(raw)) return '';
  const expectedType = generatorBindingType(valueType);
  if (!expectedType) return '';
  const binding = bindingResolver.value.resolve(card?.bindings, path, expectedType);
  if (binding.status === 'missing') return `未找到变量 ${binding.name}`;
  if (binding.status === 'type_mismatch') {
    return binding.message || `${binding.name} 类型是 ${binding.type || '未知'}，需要 ${expectedType}`;
  }
  if (binding.status === 'invalid_expression') return binding.message || '表达式无效';
  return '';
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
    options: expressionBindingOptions(card, path, valueType),
    maxItems: 10,
    placeholder,
    title: '绑定变量或常量',
    expression: true,
    validationMessage: bindingValidationMessage(card, path, valueType),
    'onUpdate:modelValue': (next) => setBinding(card, path, next)
  });
}

function renderAxisExpressionInput(card, path, axis) {
  return h('label', { key: axis.key, class: 'axis-expression' }, [
    h('span', { class: 'axis-chip' }, axis.label),
    h(MinecraftAutocomplete, {
      class: 'binding-expression',
      modelValue: getBinding(card, path),
      options: expressionBindingOptions(card, path, 'number'),
      maxItems: 10,
      placeholder: axis.label,
      title: '绑定变量或常量',
      expression: true,
      validationMessage: bindingValidationMessage(card, path, 'number'),
      'onUpdate:modelValue': (next) => setBinding(card, path, next)
    })
  ]);
}

function renderAxisNumberInput(card, basePath, axis, attrs = {}, inputState = {}) {
  const path = `${basePath}.${axis.key}`;
  const currentValue = inputState.hasDraft ? inputState.draftValue : getPath(card, path);
  /* Compatibility note for the pre-component input contract:
   * value: inputState.hasDraft ? inputState.draftValue : getPath(card, path), onInput: (event) => inputState.onUpdate?.(event.target.value), onBlur: commit, onKeydown: (event) => { if (event.key !== 'Enter') return; }
   */
  return h('label', { key: axis.key, class: 'axis-number' }, [
    h('span', { class: 'axis-chip' }, axis.label),
    h(NumericInput, {
      modelValue: currentValue,
      step: attrs.step || '0.01',
      min: attrs.min,
      scrub: !getBinding(card, path),
      'onUpdate:modelValue': (next) => {
        if (inputState.onUpdate) inputState.onUpdate(next);
        else if (next !== '' && Number.isFinite(Number(next))) setPath(card, path, Number(next));
      },
      onCommit: (next) => {
        if (inputState.onCommit) inputState.onCommit(next);
        else setPath(card, path, coerceBindableInputValue(next, 'number'));
      }
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
  const displayText = item.displayText.toLowerCase();
  if (value === query) return 0;
  if (value.startsWith(query)) return 1;
  if (displayText.startsWith(query) || label.startsWith(query)) return 2;
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
  if (item.automation) {
    item.automation.enabled = false;
    item.automation.targetMin = Number(item.value) || 0;
    item.automation.targetMax = Number(item.value) || 0;
  }
  if (item.type !== 'Vector3f') delete item.colorMode;
}

function isNumericVariable(item) {
  return ['Int', 'Long', 'Float', 'Double'].includes(item?.type);
}

function automationSourceVariables(target) {
  return project.value.parameters.variables.filter((item) => item !== target && isNumericVariable(item));
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
  if (type === 'Vector3f') return 'Vector3f(1.0F, 1.0F, 1.0F)';
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
  const suppressAutoSave = suppressNextProjectAutoSave;
  suppressNextProjectAutoSave = false;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore storage quota errors
  }
  syncPreviewPoints();
  scheduleHistorySnapshot();
  if (!suppressAutoSave) scheduleIndexedProjectSave();
  nextTick(() => refreshShellCustomSelects());
}, { deep: true });

/*
 * Theme is a per-machine preference shared with every other tool, not a property
 * of the emitter project. Reading it from project.settings.theme is what made the
 * emitter keep a different look from the builders and the shell.
 */
const appTheme = ref(readAppTheme());
watch(appTheme, (theme) => {
  document.documentElement.dataset.generatorTheme = theme;
  writeAppTheme(theme);
}, { immediate: true });
const disposeAppThemeWatch = watchAppTheme((next) => {
  if (next !== appTheme.value) appTheme.value = next;
});
onBeforeUnmount(() => disposeAppThemeWatch());

onMounted(async () => {
  await consumeShellRouteState();
  await hydrateCurrentProjectTextures();
  previewRuntime.step(project.value, 1);
  previewTick.value = previewRuntime.getTick();
  syncPreviewPoints();
  refreshShellCustomSelects();
  pushHistorySnapshot();
  startTickTimer();
  window.addEventListener('keydown', handleGeneratorHotkey, true);
  window.addEventListener('coo-shell-command', handleShellCommand);
  window.addEventListener('coo-project-close-request', handleProjectCloseRequest);
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
  projectLoadToken += 1;
  textureHydrationGeneration += 1;
  delete document.documentElement.dataset.generatorTheme;
  window.clearInterval(tickTimer);
  window.clearTimeout(historyTimer);
  window.clearTimeout(indexedSaveTimer);
  window.removeEventListener('keydown', handleGeneratorHotkey, true);
  window.removeEventListener('coo-shell-command', handleShellCommand);
  window.removeEventListener('coo-project-close-request', handleProjectCloseRequest);
  window.removeEventListener('pointermove', handlePanelResize);
  window.removeEventListener('pointerup', stopPanelResize);
});

function indexedProjectId() {
  return String(route.query.projectId || '');
}

async function saveIndexedProject() {
  const projectId = loadedProjectId.value;
  const filePath = currentProjectPath.value;
  if ((!projectId && !filePath) || !projectReady.value) return true;
  const fileSnapshot = serializeProject();
  const snapshot = JSON.parse(fileSnapshot);
  const operation = indexedSaveQueue.then(async () => {
    const shell = getElectronShell();
    if (filePath && !shell?.saveProjectFile) {
      throw new Error('当前环境无法自动保存这个项目文件。');
    }
    if (filePath) {
      const text = JSON.stringify(snapshot, null, 2);
      if (shell.autoSaveProjectFile) {
        const backup = await shell.autoSaveProjectFile({
          filePath,
          text,
          intervals: readAutoSaveIntervals(),
          currentBackupEnabled: readCurrentBackupEnabled()
        });
        if (!backup?.ok) {
          throw new Error(backup?.message || 'Generator 项目自动备份失败。');
        }
      }
      const result = await shell.saveProjectFile({
        title: '自动保存 Generator 项目',
        filePath,
        addToRecent: false,
        text
      });
      if (!result?.ok) {
        throw new Error(result?.message || '项目自动保存失败。');
      }
    }
    if (projectId) {
      await projectRepository.save({
        id: projectId,
        tool: 'generator',
        name: snapshot.name || snapshot.kotlin?.className || 'EmitterGenerator',
        description: snapshot.description || '',
        filePath,
        payload: snapshot
      });
    }
    savedFileSnapshot = fileSnapshot;
  });
  indexedSaveQueue = operation.catch(() => {});
  await operation;
  return true;
}

function scheduleIndexedProjectSave() {
  window.clearTimeout(indexedSaveTimer);
  if (!loadedProjectId.value && !currentProjectPath.value) return;
  indexedSaveTimer = window.setTimeout(() => {
    indexedSaveTimer = 0;
    saveIndexedProject().catch(showShellError);
  }, AUTO_SAVE_DELAY_MS);
}

onBeforeRouteLeave(async () => {
  projectLoadToken += 1;
  window.clearTimeout(indexedSaveTimer);
  try {
    await saveIndexedProject();
  } catch (error) {
    showShellError(error);
    return false;
  }
});

onBeforeRouteUpdate(async () => {
  projectLoadToken += 1;
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

async function hydrateCurrentProjectTextures({ restartOnComplete = false } = {}) {
  textureHydrationGeneration += 1;
  const generation = textureHydrationGeneration;
  const targetProject = project.value;
  await hydrateCParticleTexturePreviews(targetProject.forceResources);
  if (generation !== textureHydrationGeneration || project.value !== targetProject) return false;
  if (restartOnComplete) restartPreview();
  return true;
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
  previewWarnings.value = Array.isArray(data?.warnings) ? data.warnings : [];
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
    const scaleXs = data.scaleXs ? new Float32Array(data.scaleXs) : null;
    const scaleYs = data.scaleYs ? new Float32Array(data.scaleYs) : null;
    const count = Math.max(0, Math.trunc(Number(data.count || 0)));
    for (let index = 0; index < count; index += 1) {
      sizes[index] *= factor;
      if (scaleXs) scaleXs[index] *= factor;
      if (scaleYs) scaleYs[index] *= factor;
    }
    return { ...data, sizes, ...(scaleXs ? { scaleXs } : {}), ...(scaleYs ? { scaleYs } : {}) };
  }
  if (!Array.isArray(data)) return data;
  const scaled = data.map((point) => ({
    ...point,
    scaleX: multiplyPositive(point.scaleX, factor),
    scaleY: multiplyPositive(point.scaleY, factor),
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
  const queue = createCommandQueue({ name: `CPU 粒子处理力 ${project.value.commandQueues.length + 1}` });
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

function addForceCommandFromSidebar() {
  if (enabledCParticleForceCount.value >= cparticleForceLimit) return;
  project.value.forceCommands.push(createCParticleForceCommand({
    label: `Force Command ${project.value.forceCommands.length + 1}`
  }));
}

function addForceResourceFromSidebar() {
  project.value.forceResources.push(createCParticleForceResource({
    name: `resource_${project.value.forceResources.length + 1}`
  }));
}

function makeCParticleNamedValueId(prefix) {
  const uuid = globalThis.crypto?.randomUUID?.();
  return uuid
    ? `${prefix}_${uuid}`
    : `${prefix}_${Date.now().toString(16)}_${Math.random().toString(16).slice(2)}`;
}

function addCParticleSignFromSidebar() {
  project.value.signs.push({
    id: makeCParticleNamedValueId('sign'),
    name: nextAvailableCParticleDefinitionName(project.value.signs, 'sign', 'SIGN'),
    value: nextAvailableCParticleSignValue(project.value.signs)
  });
}

function addCParticleCommandMaskFromSidebar() {
  const value = nextCParticleCommandMaskValue.value;
  if (value === null) return;
  project.value.commandMasks.push({
    id: makeCParticleNamedValueId('mask'),
    name: nextAvailableCParticleDefinitionName(project.value.commandMasks, 'command', 'COMMAND_MASK'),
    value
  });
}

function toggleGpuCommandMask(card, maskId, checked) {
  const refs = card.gpu.commandMaskRefs;
  const index = refs.indexOf(maskId);
  if (checked && index < 0) refs.push(maskId);
  if (!checked && index >= 0) refs.splice(index, 1);
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

function updateCollisionTargets(card, text) {
  if (!card?.physics) return;
  card.physics.collisionTargets = normalizeCollisionTargets(text);
}

function syncBillboardScaleMode(card) {
  if (!card?.render) return;
  if (card.render.billboardMode !== 'none') {
    card.curves.rotation.syncAxes = false;
  }
}

function scaleModeOptions() {
  return [
    { id: 'uniform_xy', label: 'XY 等比' },
    { id: 'xyz', label: '宽高独立' }
  ];
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

function duplicateEmitterSignCount(card) {
  return countDuplicateEmitterSigns(project.value.emitters, card, bindingResolver.value);
}

function formatFps(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? String(Math.max(0, Math.round(numeric))) : '--';
}

function recordHotkey(key, event) {
  if (!event || event.key === 'Tab' || event.key === 'Escape') return;
  const hotkey = event.key === 'Backspace' ? '' : eventToHotkey(event);
  if (!hotkey && event.key !== 'Backspace') return;
  const hotkeys = project.value.settings.hotkeys || (project.value.settings.hotkeys = {});
  Object.keys(GENERATOR_HOTKEY_DEFAULTS).forEach((otherKey) => {
    if (otherKey !== key && hotkeys[otherKey] === hotkey) hotkeys[otherKey] = '';
  });
  hotkeys[key] = hotkey;
}

function formatHotkey(code) {
  return hotkeyToHuman(code);
}

function commandParamFields(command) {
  return COMMAND_TYPE_OPTIONS.find((item) => item.id === command.type)?.params || [];
}

function syncCommandType(command) {
  const option = COMMAND_TYPE_OPTIONS.find((item) => item.id === command.type);
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
  const nextProject = normalizeGeneratorProject(JSON.parse(text));
  suppressNextProjectAutoSave = true;
  project.value = nextProject;
  currentProjectPath.value = filePath || '';
  savedFileSnapshot = JSON.stringify(project.value);
  resetPreviewAfterProjectChange();
  void hydrateCurrentProjectTextures({ restartOnComplete: true });
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
    let filePath = String(record.filePath || '');
    const shell = getElectronShell();
    let projectData = classifyProjectData(record);
    if (filePath && shell?.readTextFile) {
      const result = await shell.readTextFile(filePath, { addToRecent: false });
      if (token !== projectLoadToken) return false;
      if (!result?.ok) throw new Error(result?.message || '无法读取 Generator 项目文件。');
      projectData = parseProjectText(result.text, filePath);
      filePath = String(result.writableFilePath || filePath);
    }
    const { type, payload } = projectData;
    if (type !== 'generator') {
      throw new Error(`项目类型不匹配：当前页面需要 generator，项目内容为 ${type}。`);
    }
    loadProjectText(JSON.stringify(payload), shell?.saveProjectFile ? filePath : '');
    loadedProjectId.value = projectId;
    return true;
  } finally {
    if (token === projectLoadToken) projectReady.value = true;
  }
}

async function consumeShellRouteState() {
  const pending = consumePendingGeneratorProject();
  if (pending?.text) {
    projectLoadToken += 1;
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
  projectLoadToken += 1;
  loadedProjectId.value = '';
  projectReady.value = true;
}

async function openProjectWithShell() {
  const shell = getElectronShell();
  if (!shell?.openProjectFile) {
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
  if (!forceDialog && (loadedProjectId.value || currentProjectPath.value)) {
    try {
      await saveIndexedProject();
      return { ok: true };
    } catch (error) {
      showShellError(error);
      return { ok: false, message: error?.message || String(error) };
    }
  }
  const shell = getElectronShell();
  if (!shell?.saveProjectFile) {
    downloadJsonInBrowser();
    return { ok: true };
  }
  const fileSnapshot = serializeProject();
  const result = await shell.saveProjectFile({
    title: 'Save Generator Project',
    filePath: forceDialog ? '' : currentProjectPath.value,
    forceDialog,
    defaultPath: `${defaultProjectFileBase()}.json`,
    text: JSON.stringify(JSON.parse(fileSnapshot), null, 2)
  });
  if (result?.ok) {
    currentProjectPath.value = result.filePath || currentProjectPath.value;
    savedFileSnapshot = fileSnapshot;
    if (loadedProjectId.value) await saveIndexedProject();
    return result;
  }
  showShellError(result);
  return result || { ok: false, message: '项目保存失败。' };
}

async function inspectProjectBeforeClose() {
  if (loadedProjectId.value || currentProjectPath.value) {
    window.clearTimeout(indexedSaveTimer);
    try {
      await saveIndexedProject();
      return { handled: true, dirty: false, autoSaved: true };
    } catch (error) {
      return {
        handled: true,
        dirty: true,
        autoSaved: false,
        projectName: project.value.name || 'Generator 项目',
        message: error?.message || String(error)
      };
    }
  }
  return {
    handled: true,
    dirty: serializeProject() !== savedFileSnapshot,
    autoSaved: false,
    projectName: project.value.name || 'Generator 项目',
    filePath: currentProjectPath.value
  };
}

async function saveProjectBeforeClose() {
  return saveProjectWithShell(false);
}

function handleProjectCloseRequest(event) {
  const request = event?.detail;
  if (!request?.respondWith) return;
  if (request.action === 'inspect') {
    request.respondWith(inspectProjectBeforeClose());
  } else if (request.action === 'save') {
    request.respondWith(saveProjectBeforeClose());
  }
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

function resetProject() {
  textureHydrationGeneration += 1;
  project.value = createGeneratorProject();
  loadedProjectId.value = indexedProjectId();
  savedFileSnapshot = serializeProject();
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
  void hydrateCurrentProjectTextures({ restartOnComplete: true });
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

function selectGeneratorTab(tabId) {
  project.value.leftTab = tabId;
}

function toggleGeneratorSettings() {
  settingsOpen.value = !settingsOpen.value;
  if (settingsOpen.value) setSettingsMessage('');
}

function closeGeneratorSettings() {
  settingsOpen.value = false;
  setSettingsMessage('');
}

function openGeneratorHotkeys() {
  hotkeyCaptureKey.value = '';
  hotkeysOpen.value = true;
}

function closeGeneratorHotkeys() {
  hotkeyCaptureKey.value = '';
  hotkeysOpen.value = false;
}

function startHotkeyCapture(key) {
  hotkeyCaptureKey.value = String(key || '');
}

function clearHotkey(key) {
  const hotkeys = project.value.settings.hotkeys || (project.value.settings.hotkeys = {});
  hotkeys[key] = '';
  hotkeyCaptureKey.value = '';
}

function setSettingsMessage(text, isError = false) {
  settingsMessage.value = String(text || '');
  settingsMessageIsError.value = Boolean(isError);
}

function exportGeneratorSettings() {
  try {
    const payload = {
      settings: JSON.parse(JSON.stringify(project.value.settings || {})),
      kotlin: JSON.parse(JSON.stringify(project.value.kotlin || {})),
      ticksPerSecond: project.value.ticksPerSecond,
      previewTicks: project.value.previewTicks,
      ts: Date.now()
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'emitter_generator.settings.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setSettingsMessage('设置已导出');
  } catch (error) {
    setSettingsMessage(`设置导出失败：${error?.message || error}`, true);
  }
}

async function importGeneratorSettings(file) {
  try {
    const parsed = JSON.parse(await file.text()) || {};
    const incoming = parsed.settings && typeof parsed.settings === 'object'
      ? parsed.settings
      : (parsed.hotkeys || parsed.kotlin ? {} : parsed);
    project.value.settings = { ...project.value.settings, ...incoming };
    if (parsed.hotkeys && typeof parsed.hotkeys === 'object') {
      project.value.settings.hotkeys = { ...project.value.settings.hotkeys, ...parsed.hotkeys };
    }
    if (parsed.kotlin && typeof parsed.kotlin === 'object') {
      project.value.kotlin = { ...project.value.kotlin, ...parsed.kotlin };
    }
    if (Number.isFinite(Number(parsed.ticksPerSecond))) project.value.ticksPerSecond = Number(parsed.ticksPerSecond);
    if (Number.isFinite(Number(parsed.previewTicks))) project.value.previewTicks = Number(parsed.previewTicks);
    project.value = normalizeGeneratorProject(project.value);
    void hydrateCurrentProjectTextures({ restartOnComplete: true });
    setSettingsMessage('设置已导入');
  } catch (error) {
    setSettingsMessage(`设置导入失败：${error?.message || error}`, true);
  }
}

function resetAllHotkeys() {
  project.value.settings.hotkeys = { ...GENERATOR_HOTKEY_DEFAULTS };
  hotkeyCaptureKey.value = '';
}

function handleGeneratorHotkey(event) {
  // While the hotkeys modal is capturing, every key belongs to the binding
  // being recorded — swallow it before any shortcut can fire.
  if (hotkeyCaptureKey.value) {
    if (event.key === 'Tab') return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      hotkeyCaptureKey.value = '';
      return;
    }
    if (event.key === 'Backspace') {
      clearHotkey(hotkeyCaptureKey.value);
      return;
    }
    recordHotkey(hotkeyCaptureKey.value, event);
    hotkeyCaptureKey.value = '';
    return;
  }
  if (event.key === 'Escape' && hotkeysOpen.value) {
    event.preventDefault();
    closeGeneratorHotkeys();
    return;
  }
  if (hotkeysOpen.value) return;
  if (event.repeat && matchesHotkey(event, 'toggleSettings')) return;
  if (event.key === 'Escape' && settingsOpen.value) {
    event.preventDefault();
    closeGeneratorSettings();
    return;
  }
  if (isEditableHotkeyTarget(event.target)) return;
  if (matchesHotkey(event, 'toggleSettings')) {
    event.preventDefault();
    toggleGeneratorSettings();
    return;
  }
  if (settingsOpen.value) return;
  if (matchesHotkey(event, 'undo')) {
    event.preventDefault();
    undoProject();
    return;
  }
  if (matchesHotkey(event, 'redo') || matchesRedoAlias(event)) {
    event.preventDefault();
    redoProject();
    return;
  }
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
  return hotkeyMatchEvent(event, configuredHotkey(key));
}

function configuredHotkey(key) {
  const hotkeys = project.value.settings.hotkeys || {};
  return Object.prototype.hasOwnProperty.call(hotkeys, key)
    ? hotkeys[key]
    : GENERATOR_HOTKEY_DEFAULTS[key];
}

function matchesRedoAlias(event) {
  const redoHotkey = configuredHotkey('redo');
  if (redoHotkey === 'Mod+Shift+KeyZ') return hotkeyMatchEvent(event, 'Mod+KeyY');
  if (redoHotkey === 'Mod+KeyY') return hotkeyMatchEvent(event, 'Mod+Shift+KeyZ');
  return false;
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
  const baseScale = card.render.scaleMode === 'xyz'
    ? {
      x: Math.max(0, Number(card.render.baseScale.x || 0)),
      y: Math.max(0, Number(card.render.baseScale.y || card.render.baseScale.x || 0))
    }
    : {
      x: Math.max(0, Number(card.render.baseScale.x || 0)),
      y: Math.max(0, Number(card.render.baseScale.x || 0))
    };
  const alpha = clamp01((Number(card.render.alpha ?? 100) / 100) * (samplePreviewCurve(card.curves.opacity, agePercent) / 100));
  const light = card.curves.light?.enabled
    ? clampNumber(samplePreviewCurve(card.curves.light, agePercent), -1, 15, Number(card.render.light ?? 15))
    : Number(card.render.light ?? 15);
  const colorProgress = card.curves.color?.enabled
    ? clamp01(samplePreviewCurve(card.curves.color, agePercent))
    : 0;
  const color = interpolateHex(card.particle.colorStart, card.particle.colorEnd, colorProgress, light);
  const rotation = samplePreviewRotation(card, agePercent);
  const base = sampleEmitterPoint(card, rand);
  const velocity = sampleVelocity(card, rand);
  const scale = {
    x: baseScale.x * sizeX,
    y: baseScale.y * sizeY
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
    size: Math.max(0.01, (scale.x + scale.y) / 2),
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
  min-height: var(--app-vh);
  display: grid;
  place-items: center;
  align-content: center;
  gap: 14px;
  color: var(--muted);
  background:
    radial-gradient(1100px 760px at 6% -6%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 56%),
    var(--bg);
  font-size: 13px;
  font-weight: 600;
}

.generator-loading::before {
  content: "";
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow:
    -18px 0 0 color-mix(in srgb, var(--accent) 28%, transparent),
    18px 0 0 color-mix(in srgb, var(--accent) 28%, transparent);
  animation: generator-loading-pulse 900ms ease-in-out infinite;
}

@keyframes generator-loading-pulse {
  50% {
    background: color-mix(in srgb, var(--accent) 28%, transparent);
    box-shadow: -18px 0 0 var(--accent), 18px 0 0 var(--accent);
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
  height: var(--app-vh);
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

.generator-page[data-theme='light-1'] {
  --bg-panel: #f7f8fa;
  --bg-panel-strong: #eef1f4;
  --bg-soft: #eef2f5;
  --border: rgba(79, 93, 109, 0.12);
  --text-soft: rgba(92, 103, 118, 0.64);
  --brand: #70879b;
  --brand-2: #a07f52;
  --scrim: rgba(38, 50, 66, 0.38);
  --generator-page-bg: #edf1f4;
  --generator-text: rgba(34, 42, 52, 0.92);
  --input-bg: rgba(255, 255, 255, 0.85);
  color-scheme: light;
}

/*
 * Glass variants: the tokens themselves live in the shared
 * legacy/assets/shared/css/glass-theme.css (linked from index.html). These
 * scoped rules only bridge the generator page's own variable names onto them —
 * scoped selectors carry a [data-v-*] attribute and would otherwise outrank the
 * shared sheet, including for the page backdrop.
 */
.generator-page[data-theme^='glass-'] {
  --generator-text: var(--text);
  --generator-page-bg:
    radial-gradient(1250px 900px at 10% -10%, color-mix(in srgb, var(--glass-hue) 40%, transparent), transparent 60%),
    radial-gradient(1050px 820px at 90% 2%, color-mix(in srgb, var(--glass-hue-2) 32%, transparent), transparent 58%),
    radial-gradient(950px 760px at 46% 112%, color-mix(in srgb, var(--glass-hue) 24%, transparent), transparent 62%),
    var(--glass-base);
  --bg-panel: var(--panel);
  --bg-panel-strong: var(--panel2);
  --bg-soft: var(--card2);
  --border: var(--line);
  --text-soft: var(--muted);
  --brand: var(--accent);
  --brand-2: var(--ok);
  --input-bg: var(--glass-sunken);
  background-repeat: no-repeat;
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

.generator-page :deep(.cp-select) {
  min-width: 0;
}

.generator-page :deep(.cp-select-trigger) {
  height: 40px;
  min-height: 40px;
  border-radius: var(--radius2, 12px);
  font-size: 13px;
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
  border-radius: var(--radius, 16px);
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
  border-radius: var(--radius, 16px);
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
  overscroll-behavior: contain;
}

.generator-page :deep(.mc-autocomplete--scrubbable) {
  position: relative;
  display: flex;
  min-width: 0;
  width: 100%;
}

.generator-page :deep(.mc-autocomplete--scrubbable > .input) {
  padding-right: 27px;
}

.generator-page :deep(.mc-autocomplete-stepper) {
  position: absolute;
  inset: 1px 1px 1px auto;
  display: grid;
  grid-template-rows: 1fr 1fr;
  width: 24px;
  overflow: hidden;
  border-left: 1px solid var(--line, rgba(255, 255, 255, 0.1));
  border-radius: 0 var(--radius3, 10px) var(--radius3, 10px) 0;
  color: var(--muted, #808b99);
  cursor: ns-resize;
  touch-action: none;
  user-select: none;
}

.generator-page :deep(.mc-autocomplete-step) {
  display: grid;
  place-items: center;
  min-height: 0;
  background: color-mix(in srgb, var(--card2, #181f26) 82%, transparent);
}

.generator-page :deep(.mc-autocomplete-step + .mc-autocomplete-step) {
  border-top: 1px solid var(--line, rgba(255, 255, 255, 0.08));
}

.generator-page :deep(.mc-autocomplete-stepper:hover) {
  color: var(--text, #ecf0f5);
}

.generator-page :deep(.mc-autocomplete-stepper:hover .mc-autocomplete-step) {
  background: color-mix(in srgb, var(--accent, #8fa7b8) 14%, var(--card2, #181f26));
}

.generator-page :deep(.mc-autocomplete-step svg) {
  width: 11px;
  height: 11px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.5;
  stroke-linecap: round;
  stroke-linejoin: round;
}

:global(html.generator-numeric-scrubbing),
:global(html.generator-numeric-scrubbing *) {
  cursor: ns-resize !important;
  user-select: none !important;
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
  border-radius: var(--radius2, 12px);
  background: var(--bg-soft);
  padding: 12px;
}

.block-title,
.section-title {
  font-weight: 700;
}

.left-tabs {
  display: grid;
  gap: 12px;
}

.left-tab-group {
  display: grid;
  gap: 6px;
}

.left-tab-group-title {
  color: var(--text-soft);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.left-tab-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.left-tabs button {
  min-height: 34px;
  border-radius: var(--radius3, 10px);
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

.curve-stack,
.axis-curve-box,
.axis-curve-content {
  min-width: 0;
  max-width: 100%;
}

.emitter-list {
  container-type: inline-size;
}

.emitter-list-card,
.queue-card,
.command-card {
  border: 1px solid var(--border);
  border-radius: var(--radius2, 10px);
  background: var(--bg-soft);
  padding: 8px 9px;
  display: grid;
  gap: 6px;
  transition: background var(--speed, 140ms) ease, border-color var(--speed, 140ms) ease,
    box-shadow var(--speed, 140ms) ease;
}

.emitter-list-card {
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  min-height: 58px;
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

.emitter-list-card:hover,
.queue-card:hover {
  border-color: var(--line2, rgba(255, 255, 255, 0.14));
  background: color-mix(in srgb, var(--bg-soft) 90%, var(--hover-veil, rgba(255, 255, 255, 0.04)));
}

.emitter-list-card.selected,
.queue-card.selected {
  border-color: color-mix(in srgb, var(--brand) 70%, transparent);
  box-shadow:
    inset 2px 0 0 var(--brand),
    0 0 0 1px color-mix(in srgb, var(--brand) 30%, transparent);
}

.emitter-list-card.disabled {
  opacity: 0.55;
}

.card-main {
  align-items: center;
  gap: 7px;
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
  padding: 1px 0;
  line-height: 1.2;
  text-overflow: ellipsis;
  overflow: hidden;
  white-space: nowrap;
}

.emitter-card-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  margin-top: 3px;
  line-height: 1.15;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.sub,
.empty-state {
  color: var(--text-soft);
  font-size: 12px;
}

.compatibility-note {
  padding: 8px 10px;
  border-left: 3px solid #d6a94b;
  border-radius: var(--radius3, 10px);
  color: var(--text-soft);
  background: rgb(214 169 75 / 10%);
  font-size: 12px;
  line-height: 1.5;
}

.compatibility-note--error {
  border-left-color: #dc5f6d;
  color: #ffb1ba;
  background: rgb(220 95 109 / 12%);
}

.row-actions {
  justify-content: flex-end;
  gap: 6px;
  flex-wrap: nowrap;
}

.icon-btn {
  width: 26px;
  height: 26px;
  min-width: 26px;
  min-height: 26px;
  border-radius: var(--radius3, 10px);
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
  border-radius: var(--radius3, 10px);
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
.generator-page :deep(.bindable-field > span) {
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

.emitter-card-meta {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.duplicate-sign-badge {
  border: 1px solid rgba(251, 146, 60, 0.72);
  border-radius: var(--radius3, 10px);
  background: rgba(251, 146, 60, 0.14);
  color: #fdba74;
  padding: 1px 4px;
  font-size: 10px;
  font-weight: 700;
  line-height: 1.2;
}

.external-parameter-grid {
  align-items: start;
}

.gpu-parameter-panel {
  display: grid;
  gap: 10px;
  padding: 12px 2px;
  border-top: 1px solid var(--line);
  border-bottom: 1px solid var(--line);
}

.gpu-enable-control {
  min-height: 24px;
  font-weight: 700;
}

.gpu-parameter-options {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr));
  gap: 10px 12px;
  align-items: end;
}

.generator-right .gpu-parameter-options .field > span {
  min-height: auto;
}

.external-parameter-option .check-row {
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.duplicate-sign-field :deep(.input) {
  border-color: rgba(251, 146, 60, 0.86);
  box-shadow: 0 0 0 1px rgba(251, 146, 60, 0.2);
}

.duplicate-sign-message {
  color: #fdba74;
  font-size: 11px;
  line-height: 1.3;
}

.generator-right .grid3.sign-grid-row {
  align-items: start;
}

.generator-right .grid2 {
  grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr));
}

.generator-right .grid3 {
  grid-template-columns: repeat(auto-fit, minmax(min(120px, 100%), 1fr));
}

.generator-right .grid4 {
  grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr));
}

.generator-right .grid2,
.generator-right .grid3,
.generator-right .grid4 {
  align-items: end;
}

.generator-right .field > span,
.generator-right :deep(.bindable-field > span),
.generator-right .mini-field > span {
  min-height: 30px;
  display: flex;
  align-items: flex-end;
}

.generator-right .physics-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(120px, 100%), 1fr));
}

.generator-right .field .input,
.generator-right .bindable-field .input,
.generator-right .mini-field .input {
  align-self: start;
}

.generator-right .base-param-grid {
  grid-template-columns: repeat(auto-fit, minmax(min(180px, 100%), 1fr));
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
  border-radius: var(--radius2, 12px);
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

.generator-page :deep(.mc-autocomplete--invalid > .input),
.generator-page :deep(.mc-autocomplete > .input.invalid) {
  border-color: rgba(255, 112, 130, 0.92);
  box-shadow: 0 0 0 1px rgba(255, 112, 130, 0.22);
}

.generator-page :deep(.binding-validation) {
  margin-top: 4px;
  color: #ff9da9;
  font-size: 11px;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

:global(.generator-autocomplete-listbox.mc-suggestions) {
  position: fixed;
  z-index: 100000;
  max-width: calc(100vw - 16px);
  overflow-x: hidden;
  overflow-y: auto;
  border: 1px solid var(--line2, rgba(255, 255, 255, 0.14));
  border-radius: var(--radius2, 10px);
  background: var(--panel, #171d23);
  color: var(--text, #ecf0f5);
  box-shadow: 0 16px 36px rgba(0, 0, 0, 0.48);
  padding: 3px;
  font-family: inherit;
}

:global(.generator-autocomplete-listbox .mc-suggestion) {
  appearance: none;
  width: 100%;
  height: 40px;
  min-height: 40px;
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  border: 0;
  border-radius: var(--radius3, 10px);
  background: transparent;
  color: #f8fafc;
  font: inherit;
  font-size: 12px;
  text-align: left;
  padding: 6px 9px;
  margin: 0;
  box-shadow: none;
  transform: none;
  cursor: pointer;
}

:global(.generator-autocomplete-listbox .mc-suggestion.active),
:global(.generator-autocomplete-listbox .mc-suggestion:hover) {
  background: rgba(85, 170, 255, 0.42);
  color: #ffffff;
}

:global(.generator-autocomplete-listbox .mc-suggestion-main),
:global(.generator-autocomplete-listbox .mc-suggestion-kind),
:global(.generator-autocomplete-listbox .mc-suggestion-label) {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:global(.generator-autocomplete-listbox .mc-suggestion-meta) {
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}

:global(.generator-autocomplete-listbox .mc-suggestion-kind) {
  color: rgba(142, 231, 239, 0.82);
  font-size: 10px;
}

:global(.generator-autocomplete-listbox .mc-suggestion-label) {
  color: rgba(226, 232, 240, 0.58);
  font-size: 11px;
}

:global(html[data-generator-theme='light-1'] .generator-autocomplete-listbox.mc-suggestions) {
  border-color: rgba(79, 93, 109, 0.18);
  background: #fbfcfd;
  color: rgba(34, 42, 52, 0.92);
  box-shadow: 0 16px 36px rgba(38, 50, 66, 0.14);
}

:global(html[data-generator-theme='light-1'] .generator-autocomplete-listbox .mc-suggestion) {
  color: rgba(34, 42, 52, 0.92);
}

:global(html[data-generator-theme='light-1'] .generator-autocomplete-listbox .mc-suggestion.active),
:global(html[data-generator-theme='light-1'] .generator-autocomplete-listbox .mc-suggestion:hover) {
  background: rgba(112, 135, 155, 0.18);
  color: rgba(34, 42, 52, 0.92);
}

:global(html[data-generator-theme='light-1'] .generator-autocomplete-listbox .mc-suggestion-kind) {
  color: #70879b;
}

:global(html[data-generator-theme='light-1'] .generator-autocomplete-listbox .mc-suggestion-label) {
  color: rgba(92, 103, 118, 0.68);
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

.bindable-vector-row :deep(.cp-select:has(.mode-select)) {
  grid-column: 1;
  grid-row: 2;
  width: 132px;
  max-width: 100%;
  min-width: 0;
}

.bindable-vector-row :deep(.bindable-axis-grid) {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
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

.axis-curve-content {
  display: grid;
  gap: 10px;
}

.variable-automation {
  margin-top: 10px;
  border-top: 1px solid var(--line);
  padding-top: 8px;
}

.variable-automation > summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  cursor: pointer;
  color: var(--text-soft);
  font-size: 12px;
}

.variable-automation-body {
  display: grid;
  gap: 9px;
  margin-top: 10px;
}


.axis-curve-box {
  border: 1px solid var(--border);
  border-radius: var(--radius2, 12px);
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
  border-radius: var(--radius2, 12px);
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

.preview-warning-overlay {
  position: absolute;
  top: 64px;
  right: 14px;
  z-index: 19;
  display: grid;
  gap: 6px;
  width: min(360px, calc(100% - 28px));
  max-height: 35%;
  overflow: auto;
  border: 1px solid rgba(148, 163, 184, 0.42);
  border-radius: var(--radius2, 12px);
  background: rgba(15, 23, 42, 0.86);
  color: #e2e8f0;
  padding: 9px 10px;
  font-size: 12px;
  box-shadow: 0 12px 28px rgba(0, 0, 0, 0.24);
}

.preview-warning-overlay ul {
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
  border-radius: var(--radius2, 12px);
}

.generator-code-page {
  min-width: 0;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.code-panel-wide {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  padding: 14px;
  flex-direction: column;
  gap: 12px;
}

.kotlin-output {
  flex: 1 1 auto;
  min-width: 0;
  min-height: 0;
  max-height: none;
  overflow: auto;
  border-radius: var(--radius2, 12px);
  border: 1px solid var(--border);
  background: var(--bg-panel-strong);
  padding: 14px;
  font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre;
}

.kotlin-output :deep(.tok-kw) {
  color: #ffc37a;
}

.kotlin-output :deep(.tok-str) {
  color: #8fe3c0;
}

.kotlin-output :deep(.tok-com) {
  color: #8da0bd;
}

.kotlin-output :deep(.tok-num) {
  color: #9ac6ff;
}

.kotlin-output :deep(.tok-fn) {
  color: #ff9ccd;
}

.kotlin-output :deep(.tok-type) {
  color: #90e1ff;
}

.generator-page[data-theme='light-1'] .kotlin-output :deep(.tok-kw) {
  color: #7c6147;
}

.generator-page[data-theme='light-1'] .kotlin-output :deep(.tok-str) {
  color: #5f7868;
}

.generator-page[data-theme='light-1'] .kotlin-output :deep(.tok-com) {
  color: #7c8793;
}

.generator-page[data-theme='light-1'] .kotlin-output :deep(.tok-num) {
  color: #6c7f90;
}

.generator-page[data-theme='light-1'] .kotlin-output :deep(.tok-fn) {
  color: #96655d;
}

.generator-page[data-theme='light-1'] .kotlin-output :deep(.tok-type) {
  color: #6e817a;
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
    min-height: var(--app-vh);
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

  .generator-topbar,
  .generator-brand,
  .generator-actions,
  .generator-workspace,
  .generator-left,
  .generator-preview,
  .generator-right {
    width: 100%;
    min-width: 0;
    max-width: 100%;
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
  .generator-right .bindable-vector-row {
    grid-template-columns: 1fr;
  }

  .generator-actions {
    justify-content: flex-start;
  }

  .bindable-vector-row :deep(.bindable-axis-grid),
  .bindable-vector-row :deep(.color-channel-grid) {
    grid-template-columns: repeat(3, minmax(0, 1fr)) !important;
  }

  .vector-row {
    grid-template-columns: 86px repeat(3, minmax(0, 1fr));
  }

  .generator-canvas :deep(.preview-host),
  .generator-canvas :deep(.preview-host--bare),
  .generator-canvas :deep(.preview-canvas) {
    height: 420px;
    min-height: 420px;
  }
}
</style>
