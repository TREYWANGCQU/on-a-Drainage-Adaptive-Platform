<!-- frontend/src/components/three/Viewer3D.vue -->
<template>
  <div class="viewer-container" ref="containerRef">
    <canvas ref="canvasRef"></canvas>

    <!-- 顶部可折叠计算分段选区控制器 (支持 1~500+ 计算段全景检索与宏观热力色带) -->
    <div 
      v-if="renderedSegments.length > 0" 
      class="segment-selector-bar glass-card"
      :class="{ 'is-collapsed': isSelectorCollapsed }"
      @click.stop
      @pointerdown.stop
    >
      <!-- 1. 顶部状态摘要行 -->
      <div class="selector-header" @click="isSelectorCollapsed = !isSelectorCollapsed">
        <div class="header-left">
          <span class="collapse-toggle-btn" :title="isSelectorCollapsed ? '展开分段选区栏' : '折叠分段选区栏'">
            {{ isSelectorCollapsed ? '▼' : '▲' }}
          </span>
          <span class="selector-title">📌 计算分段总览</span>
          <div class="stats-pills">
            <span class="stat-pill total">共 {{ segmentStats.total }} 段 ({{ segmentStats.totalKm }}km)</span>
            <span v-if="segmentStats.danger > 0" class="stat-pill danger">🔴 {{ segmentStats.danger }} 危险</span>
            <span v-if="segmentStats.warning > 0" class="stat-pill warning">🟡 {{ segmentStats.warning }} 预警</span>
            <span v-if="segmentStats.safe > 0" class="stat-pill safe">🟢 {{ segmentStats.safe }} 安全</span>
          </div>
        </div>

        <div class="header-right" @click.stop>
          <!-- 搜索过滤框 -->
          <div class="search-box">
            <input 
              type="text" 
              v-model="selectorSearch" 
              placeholder="🔍 搜索桩号/备注..." 
              class="selector-search-input"
            />
            <button v-if="selectorSearch" class="clear-search-btn" @click="selectorSearch = ''">✕</button>
          </div>

          <!-- 独占聚焦模式切换 -->
          <button 
            class="focus-mode-btn" 
            :class="{ active: isFocusIsolationMode }"
            @click="toggleFocusIsolation"
            :title="isFocusIsolationMode ? '退出独占聚焦，恢复全线全景' : '开启独占聚焦，虚化其余分段'"
          >
            {{ isFocusIsolationMode ? '🔲 独占聚焦中' : '🌐 全线贯通' }}
          </button>
        </div>
      </div>

      <!-- 2. 展开态主体区 (Mini-map 全线热力色带 + 虚拟化水平胶囊流) -->
      <div v-if="!isSelectorCollapsed" class="selector-body">
        <!-- 2.1 宏观全线安全热力色带 Mini-map -->
        <div class="minimap-wrapper" title="全线安全热力色带 (点击快速定位对应工况)">
          <canvas 
            ref="miniMapCanvasRef" 
            class="minimap-canvas" 
            @click="handleMiniMapClick" 
            @mousemove="handleMiniMapMouseMove" 
            @mouseleave="hoveredMiniMapSnap = null"
          ></canvas>
          <!-- 悬停浮窗 Tooltip -->
          <div 
            v-if="hoveredMiniMapSnap" 
            class="minimap-tooltip" 
            :style="{ left: `${hoveredMiniMapX}px` }"
          >
            <div class="tt-title">#{{ hoveredMiniMapIndex + 1 }} {{ hoveredMiniMapSnap.remark || '分段工况' }}</div>
            <div class="tt-desc">K{{ formatChain(hoveredMiniMapSnap.start_chainage) }} ~ K{{ formatChain(hoveredMiniMapSnap.end_chainage) }}</div>
            <div class="tt-fs" :class="getFsClass(snapFs(hoveredMiniMapSnap))">
              Fs = {{ snapFsText(hoveredMiniMapSnap) }}
            </div>
          </div>
        </div>

        <!-- 2.2 微观分段水平滚动胶囊滑轨 -->
        <div class="pill-slider-container">
          <button class="step-btn step-left" @click="scrollPills('left')" title="向左滚动">◀</button>
          <div class="pill-slider-track" ref="pillTrackRef">
            <!-- 全局不聚焦/全线概览胶囊 -->
            <div 
              class="segment-pill all-overview-pill"
              :class="{ active: !activeSegment }"
              @click="unselectSegment"
              title="点击取消单段聚焦，进入全线贯通无选框状态"
            >
              <span class="pill-icon">🌐</span>
              <span class="pill-chain">全线概览 (不聚焦)</span>
            </div>

            <div 
              v-for="snap in filteredSelectorSegments" 
              :key="snap.id"
              class="segment-pill"
              :class="{ 
                active: activeSegment?.id === snap.id,
                danger: snapFs(snap) != null && snapFs(snap) < 1.0,
                warning: snapFs(snap) != null && snapFs(snap) >= 1.0 && snapFs(snap) < 2.0,
                safe: snapFs(snap) != null && snapFs(snap) >= 2.0
              }"
              @click="onPillClick(snap)"
              :title="activeSegment?.id === snap.id ? '再次点击取消选中' : `点击聚焦 # ${getOriginalSegmentIndex(snap) + 1}: ${snap.remark || ''} (K${formatChain(snap.start_chainage)} ~ K${formatChain(snap.end_chainage)})`"
            >
              <span class="pill-index">#{{ getOriginalSegmentIndex(snap) + 1 }}</span>
              <span class="pill-chain">K{{ formatChain(snap.start_chainage) }}</span>
              <span class="pill-badge" :class="getFsClass(snapFs(snap))">
                K={{ snapFsText(snap) }}
              </span>
            </div>
            <div v-if="filteredSelectorSegments.length === 0" class="no-match-hint">
              未找到匹配分段
            </div>
          </div>
          <button class="step-btn step-right" @click="scrollPills('right')" title="向右滚动">▶</button>
        </div>
      </div>
    </div>

    <!-- 左侧控制面板自适应流动栈容器 -->
    <div class="left-controls-stack">
      <!-- 1. 排水管径全局放大会显控制面板 (置顶呈现，杜绝被遮挡) -->
      <div v-if="layerVisibility.pipes" class="pipe-scale-card glass-card" :class="{ collapsed: isPipeScaleCollapsed }">
        <div class="panel-header" @click="isPipeScaleCollapsed = !isPipeScaleCollapsed" style="cursor: pointer;">
          <span class="panel-title">🔍 全局管径放大会显</span>
          <div style="display: flex; align-items: center; gap: 6px;">
            <span class="scale-badge" :class="{ active: pipeScaleFactor > 1.0 }">
              {{ pipeScaleFactor === 1.0 ? '1.0x 真实' : `${pipeScaleFactor.toFixed(1)}x` }}
            </span>
            <span class="collapse-icon">{{ isPipeScaleCollapsed ? '▼' : '▲' }}</span>
          </div>
        </div>
        <div v-if="!isPipeScaleCollapsed" class="panel-body">
          <!-- 连续倍率滑动条 -->
          <div class="control-row">
            <span class="control-label">管径倍率:</span>
            <input 
              type="range" 
              min="1.0" 
              max="10.0" 
              step="0.5" 
              v-model.number="pipeScaleFactor"
              @input="onPipeScaleInput"
              class="range-slider"
            />
          </div>

          <!-- 预设倍率 Pills 与一键还原按钮 -->
          <div class="scale-action-row">
            <div class="preset-btn-group">
              <button 
                v-for="preset in [1.0, 3.0, 5.0, 8.0]" 
                :key="preset"
                class="preset-pill-btn"
                :class="{ active: pipeScaleFactor === preset }"
                @click="setPipeScale(preset)"
              >
                {{ preset === 1.0 ? '真实' : `${preset}x` }}
              </button>
            </div>
            <button 
              class="reset-scale-btn" 
              :disabled="pipeScaleFactor === 1.0"
              @click="resetPipeScale"
              title="重置为真实物理管径 (1.0x)"
            >
              ↺ 还原
            </button>
          </div>
        </div>
      </div>

      <!-- 2. 受力表达模式切换器 (K | M | N | 综合受力) 及 可折叠数值图例 -->
      <div v-if="layerVisibility.probe" class="force-mode-panel glass-card">
        <div class="panel-header" @click="isLegendPanelCollapsed = !isLegendPanelCollapsed" style="cursor: pointer;">
          <span class="panel-title">受力表达模式</span>
          <span class="collapse-icon">{{ isLegendPanelCollapsed ? '▼' : '▲' }}</span>
        </div>
        <div class="btn-group force-btn-group">
          <button 
            :class="{ active: currentForceMode === 'K' }" 
            @click="setForceMode('K')"
            title="安全系数 K 云图"
          >
            安全系数 K
          </button>
          <button 
            :class="{ active: currentForceMode === 'M' }" 
            @click="setForceMode('M')"
            title="弯矩包络图 M"
          >
            弯矩图 M
          </button>
          <button 
            :class="{ active: currentForceMode === 'N' }" 
            @click="setForceMode('N')"
            title="轴向压力图 N"
          >
            轴力图 N
          </button>
          <button 
            :class="{ active: currentForceMode === 'COMBINED' }" 
            @click="setForceMode('COMBINED')"
            title="综合受力包络"
          >
            综合受力
          </button>
        </div>

        <!-- 数值图例面板 (可折叠打开) -->
        <div v-if="!isLegendPanelCollapsed" class="legend-container">
          <!-- 1. 安全系数 K 图例 -->
          <div v-if="currentForceMode === 'K'" class="legend-section">
            <div class="legend-bar-wrapper">
              <div class="color-bar k-gradient-bar"></div>
              <div class="legend-ticks-row">
                <span class="tick danger">&lt;1.0 危险</span>
                <span class="tick warning">1.0-2.0 预警</span>
                <span class="tick safe">&ge;2.0 安全</span>
              </div>
            </div>
            <div class="legend-range-row">
              <span>最小 K: <strong :class="{ danger: probeInfo?.isCritical }">{{ probeInfo?.minK ? probeInfo.minK.toFixed(2) : '2.00' }}</strong></span>
              <span>截面范围: {{ probeRanges.minK.toFixed(2) }} ~ {{ probeRanges.maxK.toFixed(2) }}</span>
            </div>
          </div>

          <!-- 2. 弯矩图 M 图例 -->
          <div v-if="currentForceMode === 'M'" class="legend-section">
            <div class="legend-bar-wrapper">
              <div class="color-bar m-gradient-bar"></div>
              <div class="legend-scale-row">
                <span>{{ probeRanges.minM.toFixed(1) }}</span>
                <span>{{ ((probeRanges.minM + probeRanges.maxM) / 2).toFixed(1) }}</span>
                <span>{{ probeRanges.maxM.toFixed(1) }} kN·m</span>
              </div>
            </div>
          </div>

          <!-- 3. 轴力图 N 图例 -->
          <div v-if="currentForceMode === 'N'" class="legend-section">
            <div class="legend-bar-wrapper">
              <div class="color-bar n-gradient-bar"></div>
              <div class="legend-scale-row">
                <span>{{ probeRanges.minN.toFixed(1) }}</span>
                <span>{{ ((probeRanges.minN + probeRanges.maxN) / 2).toFixed(1) }}</span>
                <span>{{ probeRanges.maxN.toFixed(1) }} kN</span>
              </div>
            </div>
          </div>

          <!-- 4. 综合受力 COMBINED 图例 -->
          <div v-if="currentForceMode === 'COMBINED'" class="legend-section">
            <div class="legend-bar-wrapper">
              <div class="color-bar combined-gradient-bar"></div>
              <div class="legend-ticks-row">
                <span class="tick safe">低应力</span>
                <span class="tick warning">中等包络</span>
                <span class="tick danger">控制峰值</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <!-- 3. 图层显隐控制 Floating Toolbar -->
      <div class="layer-panel glass-card">
        <div class="panel-header" @click="isLayerPanelOpen = !isLayerPanelOpen">
          <span class="panel-title">图层显隐控制</span>
          <span class="collapse-icon">{{ isLayerPanelOpen ? '▲' : '▼' }}</span>
        </div>
        <div v-if="isLayerPanelOpen" class="panel-body layer-body">
          <div class="layer-action-header">
            <label class="layer-item select-all-item">
              <input 
                ref="selectAllCheckboxRef"
                type="checkbox" 
                :checked="isAllLayersVisible" 
                @change="toggleAllLayersVisibility" 
              />
              <span class="layer-label select-all-title">全选</span>
            </label>
            <div class="quick-btn-group"></div>
          </div>
          <div class="layer-divider"></div>
          <!-- 隧道衬砌图层组 -->
          <div class="layer-group-header">
            <label class="layer-item">
              <input 
                ref="liningParentCheckboxRef"
                type="checkbox" 
                :checked="isLiningParentChecked" 
                @change="toggleLiningParentGroup" 
              />
              <span class="layer-color-dot lining-dot"></span>
              <span class="layer-label">隧道衬砌</span>
            </label>
            <span 
              class="group-toggle-btn" 
              @click.stop="isLiningGroupOpen = !isLiningGroupOpen"
              :title="isLiningGroupOpen ? '折叠次级图层' : '展开次级图层'"
            >
              {{ isLiningGroupOpen ? '▼' : '▶' }}
            </span>
          </div>
          <div v-if="isLiningGroupOpen" class="sub-layer-container">
            <label class="layer-item sub-layer-item">
              <input type="checkbox" v-model="layerVisibility.liningSecondary" @change="onLiningSubLayerChange" />
              <span class="layer-color-dot lining-dot"></span>
              <span class="layer-label">└ 隧道二衬</span>
            </label>
            <label class="layer-item sub-layer-item">
              <input type="checkbox" v-model="layerVisibility.liningPrimary" @change="onLiningSubLayerChange" />
              <span class="layer-color-dot initial-grouting-dot"></span>
              <span class="layer-label">└ 初支</span>
            </label>
            <label class="layer-item sub-layer-item">
              <input type="checkbox" v-model="layerVisibility.liningRoadDitch" @change="onLiningSubLayerChange" />
              <span class="layer-color-dot env-dot"></span>
              <span class="layer-label">└ 路面与排水沟</span>
            </label>
          </div>

          <label class="layer-item">
            <input type="checkbox" v-model="layerVisibility.initialGrouting" @change="updateLayerVisibility" />
            <span class="layer-color-dot initial-grouting-dot"></span>
            <span class="layer-label">初始注浆圈 (rg)</span>
          </label>
          <label class="layer-item">
            <input type="checkbox" v-model="layerVisibility.criticalGrouting" @change="updateLayerVisibility" />
            <span class="layer-color-dot critical-grouting-dot"></span>
            <span class="layer-label">临界注浆加固圈 (tg_crit)</span>
          </label>

          <!-- 排水管网图层组 -->
          <div class="layer-group-header">
            <label class="layer-item">
              <input type="checkbox" v-model="layerVisibility.pipes" @change="updateLayerVisibility" />
              <span class="layer-color-dot pipes-dot"></span>
              <span class="layer-label">排水管网</span>
            </label>
            <span 
              class="group-toggle-btn" 
              @click.stop="isPipesGroupOpen = !isPipesGroupOpen"
              :title="isPipesGroupOpen ? '折叠子图层' : '展开子图层'"
            >
              {{ isPipesGroupOpen ? '▼' : '▶' }}
            </span>
          </div>
          <div v-if="isPipesGroupOpen" class="sub-layer-container">
            <label class="layer-item sub-layer-item">
              <input type="checkbox" v-model="layerVisibility.pipeAnnotations" @change="updateLayerVisibility" />
              <span class="layer-color-dot annotation-dot"></span>
              <span class="layer-label">└ 排水管网参数标注</span>
            </label>
          </div>

          <!-- 水文环境图层组 -->
          <div class="layer-group-header">
            <label class="layer-item">
              <input type="checkbox" v-model="layerVisibility.environment" @change="updateLayerVisibility" />
              <span class="layer-color-dot env-dot"></span>
              <span class="layer-label">水文环境</span>
            </label>
            <span 
              class="group-toggle-btn" 
              @click.stop="isEnvGroupOpen = !isEnvGroupOpen"
              :title="isEnvGroupOpen ? '折叠子图层' : '展开子图层'"
            >
              {{ isEnvGroupOpen ? '▼' : '▶' }}
            </span>
          </div>
          <div v-if="isEnvGroupOpen" class="sub-layer-container">
            <label class="layer-item sub-layer-item">
              <input type="checkbox" v-model="layerVisibility.ground" @change="updateLayerVisibility" />
              <span class="layer-color-dot ground-dot"></span>
              <span class="layer-label">└ 地面/地表</span>
            </label>
            <label class="layer-item sub-layer-item">
              <input type="checkbox" v-model="layerVisibility.flowLines" @change="updateLayerVisibility" />
              <span class="layer-color-dot flowline-dot"></span>
              <span class="layer-label">└ 地下水流线</span>
            </label>
            <label class="layer-item sub-layer-item inline-between">
              <div class="left-group">
                <input type="checkbox" v-model="layerVisibility.waterParticles" @change="updateLayerVisibility" />
                <span class="layer-color-dot particle-dot"></span>
                <span class="layer-label">└ 地下水粒子特效</span>
              </div>
              <button 
                v-if="layerVisibility.environment && layerVisibility.waterParticles"
                class="mini-anim-btn" 
                :class="{ paused: !isWaterParticleAnimated }"
                @click.stop="toggleWaterParticleAnimation"
                :title="isWaterParticleAnimated ? '暂停粒子流动' : '启动粒子流动'"
              >
                {{ isWaterParticleAnimated ? '⏸ 动态' : '▶ 冻结' }}
              </button>
            </label>
          </div>

          <label class="layer-item">
            <input type="checkbox" v-model="layerVisibility.probe" @change="updateLayerVisibility" />
            <span class="layer-color-dot probe-dot"></span>
            <span class="layer-label">最不利探针</span>
          </label>
        </div>
      </div>

      <!-- 4. 剖切交互控制面板 -->
      <div class="clipping-panel glass-card">
        <div class="panel-header">
          <span class="panel-title">3D 剖切分析</span>
          <label class="switch-toggle">
            <input type="checkbox" v-model="isClippingEnabled" @change="updateClipping" />
            <span class="switch-slider"></span>
          </label>
        </div>
        <div v-if="isClippingEnabled" class="panel-body">
          <div class="control-row">
            <span class="control-label">轴向:</span>
            <div class="btn-group">
              <button 
                v-for="axis in (['z', 'x', 'y'] as const)" 
                :key="axis"
                class="axis-btn"
                :class="{ active: clippingAxis === axis }"
                @click="clippingAxis = axis; updateClipping()"
              >
                {{ axis.toUpperCase() }}
              </button>
            </div>
          </div>
          <div class="control-row">
            <span class="control-label">位置: {{ clippingOffset.toFixed(1) }}m</span>
            <input 
              type="range" 
              :min="clippingAxis === 'z' ? 0 : -30" 
              :max="clippingAxis === 'z' ? maxChainageLength : 30" 
              step="0.5" 
              v-model.number="clippingOffset"
              @input="updateClipping"
              class="range-slider"
            />
          </div>
          <div class="control-row">
            <button 
              class="snap-clip-btn"
              @click="snapClippingToActiveSegment"
              title="一键将剖切位置对齐到当前活动分段中心"
            >
              📍 对齐当前段 ({{ activeSegmentChainageText }})
            </button>
          </div>
          <div class="control-row inline-row">
            <span class="control-label">反向剖切:</span>
            <input type="checkbox" v-model="isClippingInverted" @change="updateClipping" />
          </div>
        </div>
      </div>
    </div>
    
    <!-- 右侧控制面板自适应流动栈容器 (杜绝绝对定位硬编码重叠) -->
    <div class="right-controls-stack">
      <!-- 1. 最不利受力单元看板 (默认折叠: isProbeTooltipCollapsed=true) -->
      <div v-if="probeInfo && showOverlay" class="probe-tooltip glass-card" :class="{ collapsed: isProbeTooltipCollapsed }">
        <div class="tooltip-header" @click="isProbeTooltipCollapsed = !isProbeTooltipCollapsed" style="cursor: pointer;">
          <span class="pulse-dot" :class="{ danger: probeInfo.isCritical }"></span>
          <span class="title">最不利受力单元 #{{ probeInfo.controlIdx }} ({{ probeInfo.chainageText }}) <small style="font-size: 11px; opacity: 0.85; margin-left: 4px;">{{ probeInfo.stateTag }}</small></span>
          <span class="collapse-icon">{{ isProbeTooltipCollapsed ? '▲' : '▼' }}</span>
        </div>
        <div v-if="!isProbeTooltipCollapsed" class="tooltip-body">
          <div v-if="props.mode === 'all'" class="state-tab-row">
            <button 
              class="probe-tab-btn" 
              :class="{ active: currentProbeStateTab === 'original' }" 
              @click.stop="currentProbeStateTab = 'original'; renderActiveSegmentProbe()"
            >
              原始超限态
            </button>
            <button 
              class="probe-tab-btn" 
              :class="{ active: currentProbeStateTab === 'critical' }" 
              @click.stop="currentProbeStateTab = 'critical'; renderActiveSegmentProbe()"
            >
              临界加固态
            </button>
          </div>
          <div class="metric-row">
            <span class="label">最小安全系数 K:</span>
            <span class="value" :class="{ danger: probeInfo.isCritical }">{{ probeInfo.minK.toFixed(2) }}</span>
          </div>
          <div class="metric-row">
            <span class="label">控制轴力 N:</span>
            <span class="value">{{ (Math.abs(probeInfo.controlN) > 5000 ? probeInfo.controlN / 1000 : probeInfo.controlN).toFixed(1) }} kN</span>
          </div>
          <div class="metric-row">
            <span class="label">控制弯矩 M:</span>
            <span class="value">{{ (Math.abs(probeInfo.controlM) > 5000 ? probeInfo.controlM / 1000 : probeInfo.controlM).toFixed(1) }} kN·m</span>
          </div>
        </div>
      </div>

      <!-- 2. 当前活动计算段工程指标看板 (仅当有活动段时呈现，支持一键取消聚焦) -->
      <div 
        v-if="activeSegment && showOverlay && renderedSegments.length > 0" 
        class="segment-hud-card glass-card"
        :class="{ collapsed: isSegmentHudCollapsed }"
        @click.stop
        @pointerdown.stop
      >
        <div class="tooltip-header" @click="isSegmentHudCollapsed = !isSegmentHudCollapsed" style="cursor: pointer;">
          <span class="pulse-dot" :class="{ danger: (probeInfo?.minK ?? 2.5) < 2.0 }"></span>
          <span class="title">活动段 #{{ activeSegmentIndex + 1 }} ({{ activeSegmentChainageText }})</span>
          <button class="unselect-hud-btn" @click.stop="unselectSegment" title="取消单段选中，退出聚焦选框">✕</button>
          <span class="collapse-icon">{{ isSegmentHudCollapsed ? '▲' : '▼' }}</span>
        </div>
        <div v-if="!isSegmentHudCollapsed" class="tooltip-body">
          <div class="metric-row">
            <span class="label">里程范围:</span>
            <span class="value">K{{ formatChain(activeSegment.start_chainage) }} ~ K{{ formatChain(activeSegment.end_chainage) }}</span>
          </div>
          <div class="metric-row">
            <span class="label">段长 / 埋深:</span>
            <span class="value">{{ Math.abs(activeSegment.end_chainage - activeSegment.start_chainage).toFixed(1) }}m / {{ extractSnapshotValue(activeSegment, 'h_1', 130) }}m</span>
          </div>
          <div class="metric-row">
            <span class="label">环向盲管:</span>
            <span class="value">φ{{ (extractSnapshotValue(activeSegment, 'ring_diam_recommend', 0.05)*1000).toFixed(0) }} @ {{ extractSnapshotValue(activeSegment, 'ring_spacing_recommend', 10) }}m</span>
          </div>
          <div class="metric-row">
            <span class="label">加固圈厚度:</span>
            <span class="value">tg={{ (extractSnapshotValue(activeSegment, 'tg_crit', 0)).toFixed(2) }}m</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 微观防排水结构放大镜 (PIP Magnifier Window) -->
    <MagnifierPIP 
      :active="isPipActive" 
      :pipe-data="pipPipeData" 
      @close="isPipActive = false" 
    />

    <!-- 标准视角与交互测距 Toolbar -->
    <div class="toolbar-panel glass-card">
      <div class="toolbar-section">
        <span class="section-title">视觉美学范式</span>
        <div class="projection-btn-row">
          <button 
            class="tool-btn proj-btn" 
            :class="{ active: visualParadigm === 'cyber' }" 
            @click="switchVisualParadigm('cyber')"
            title="赛博暗夜风 (数字孪生工程看板)"
          >
            🌙 赛博暗夜
          </button>
          <button 
            class="tool-btn proj-btn" 
            :class="{ active: visualParadigm === 'studio' }" 
            @click="switchVisualParadigm('studio')"
            title="高亮影棚风 (100% 对齐附图透视跑车质感)"
          >
            ☀️ 高亮影棚
          </button>
        </div>
      </div>
      <div class="toolbar-divider"></div>
      <div class="toolbar-section">
        <span class="section-title">相机投影模式</span>
        <div class="projection-btn-row">
          <button 
            class="tool-btn proj-btn" 
            :class="{ active: cameraMode === 'perspective' }" 
            @click="setCameraProjectionMode('perspective')"
            title="透视投影 (3D 真实透视)"
          >
            📷 透视 3D
          </button>
          <button 
            class="tool-btn proj-btn" 
            :class="{ active: cameraMode === 'orthographic' }" 
            @click="setCameraProjectionMode('orthographic')"
            title="正交/等轴投影 (工程无变形测绘)"
          >
            📐 正交/等轴
          </button>
        </div>
      </div>
      <div class="toolbar-divider"></div>
      <div class="toolbar-section">
        <span class="section-title">标准视角</span>
        <div class="view-btn-grid">
          <button class="tool-btn" @click="switchToStandardView('front')" title="正视图">正视 F</button>
          <button class="tool-btn" @click="switchToStandardView('left')" title="左视图">左视 L</button>
          <button class="tool-btn" @click="switchToStandardView('right')" title="右视图">右视 R</button>
          <button class="tool-btn" @click="switchToStandardView('top')" title="俯视图">俯视 T</button>
          <button class="tool-btn" @click="switchToStandardView('bottom')" title="仰视图">仰视 B</button>
          <button class="tool-btn" @click="switchToStandardView('perspective')" title="透视图">透视 P</button>
        </div>
      </div>
      <div class="toolbar-divider"></div>
      <div class="toolbar-section">
        <span class="section-title">交互工具</span>
        <div class="action-btn-row">
          <button 
            class="tool-btn measure-btn" 
            :class="{ active: isMeasuring }" 
            @click="toggleMeasurementMode"
          >
            📏 {{ isMeasuring ? '测距中...' : '距离量测' }}
          </button>
          <button class="tool-btn clear-btn" @click="clearMeasurements" title="清除所有测距标注">
            🗑 清除
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, onBeforeUnmount, watch, nextTick, toRaw } from 'vue';
import * as THREE from 'three';
import { useSnapshotStore, extractSnapshotValue, Snapshot } from '@/store/snapshotStore';
import { useParameterStore } from '@/store/parameterStore';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

import { TunnelGenerator, TunnelType } from './TunnelGenerator';
import { ReinforcementManager } from './Reinforcement';
import { DrainagePipeGenerator } from './DrainagePipeGenerator';
import { Environment } from './Environment';
import { StressProbeManager, ForceDisplayMode } from './PostProcessing';
import MagnifierPIP from './MagnifierPIP.vue';

// 视觉美学范式控制 (Light Studio 影棚风 vs Dark Cyber 赛博暗夜风)
const visualParadigm = ref<'cyber' | 'studio'>('cyber');
const isPipActive = ref(false);
const pipPipeData = ref<any>(null);

// 排水管径放大会显倍率 (1.0x ~ 10.0x)
const pipeScaleFactor = ref<number>(1.0);

const applyPipeScale = (scale: number) => {
  pipeGenInstances.forEach(pg => pg.setPipeScaleFactor(scale));
  scheduleRender();
};

const onPipeScaleInput = () => {
  applyPipeScale(pipeScaleFactor.value);
};

const setPipeScale = (preset: number) => {
  pipeScaleFactor.value = preset;
  applyPipeScale(preset);
};

const resetPipeScale = () => {
  setPipeScale(1.0);
};

const updateEnvironmentMap = (mode: 'cyber' | 'studio') => {
  if (!renderer || !scene) return;
  try {
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    pmremGenerator.compileEquirectangularShader();

    const hdrFile = mode === 'studio' ? '/textures/hdri/studio_bright.hdr' : '/textures/hdri/cyber_night.hdr';
    const rgbeLoader = new RGBELoader();

    rgbeLoader.load(
      hdrFile,
      (texture) => {
        const envMap = pmremGenerator.fromEquirectangular(texture).texture;
        if (scene.environment) {
          scene.environment.dispose();
        }
        scene.environment = envMap;
        if ('environmentIntensity' in scene) {
          (scene as any).environmentIntensity = mode === 'cyber' ? 0.8 : 1.2;
        }
        texture.dispose();
        pmremGenerator.dispose();
        console.log(`[HDRI Pipeline] Successfully loaded & generated PMREM environment map: ${hdrFile}`);
        scheduleRender();
      },
      undefined,
      (err) => {
        console.warn('[HDRI Pipeline] HDR file load failed, falling back to RoomEnvironment:', err);
        const roomEnv = new RoomEnvironment();
        const envMap = pmremGenerator.fromScene(roomEnv).texture;
        if (scene.environment) {
          scene.environment.dispose();
        }
        scene.environment = envMap;
        if ('environmentIntensity' in scene) {
          (scene as any).environmentIntensity = mode === 'cyber' ? 0.8 : 1.2;
        }
        roomEnv.dispose();
        pmremGenerator.dispose();
        scheduleRender();
      }
    );
  } catch (e) {
    console.warn('[HDRI Pipeline] PMREM Environment generation fallback:', e);
  }
};

const switchVisualParadigm = (mode: 'cyber' | 'studio') => {
  visualParadigm.value = mode;
  if (scene) {
    scene.background = new THREE.Color(mode === 'studio' ? 0xf3f4f6 : 0x050b14);
    updateEnvironmentMap(mode);
  }
  tGenInstances.forEach(tg => tg.setVisualParadigm(mode));
  rManagerInstances.forEach(rm => rm.setVisualParadigm(mode));
  pipeGenInstances.forEach(pg => pg.setVisualParadigm(mode));
  envInstances.forEach(env => env.setVisualParadigm(mode));
  scheduleRender();
};

const props = withDefaults(defineProps<{
  mode?: 'all' | 'original' | 'critical';
  snapshotOverride?: Snapshot | null;
  showOverlay?: boolean;
}>(), {
  mode: 'all',
  snapshotOverride: null,
  showOverlay: true
});

const emit = defineEmits<{
  (e: 'cameraChange', cameraState: { position: number[]; target: number[] }): void;
}>();

// DOM 引用
const containerRef = ref<HTMLElement | null>(null);
const canvasRef = ref<HTMLCanvasElement | null>(null);
const miniMapCanvasRef = ref<HTMLCanvasElement | null>(null);
const pillTrackRef = ref<HTMLElement | null>(null);

// 状态库绑定
const snapshotStore = useSnapshotStore();
const parameterStore = useParameterStore();

// Three.js 核心上下文
let renderer: THREE.WebGLRenderer;
let scene: THREE.Scene;
let perspectiveCamera: THREE.PerspectiveCamera;
let orthographicCamera: THREE.OrthographicCamera;
let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
let activeCamera: THREE.Camera;
let controls: OrbitControls;

// 相机投影模式状态
const cameraMode = ref<'perspective' | 'orthographic'>('perspective');

// 粒子动态控制状态 (默认冻结)
const isWaterParticleAnimated = ref(false);
let particleAnimFrameId: number | null = null;

const updateParticleAnimationLoop = () => {
  const shouldAnimate = isWaterParticleAnimated.value && 
                        layerVisibility.environment && 
                        layerVisibility.waterParticles && 
                        envInstances.length > 0;

  if (shouldAnimate) {
    if (particleAnimFrameId === null) {
      const animLoop = () => {
        if (!isWaterParticleAnimated.value || 
            !layerVisibility.environment || 
            !layerVisibility.waterParticles || 
            envInstances.length === 0) {
          particleAnimFrameId = null;
          return;
        }
        envInstances.forEach(env => env.update(0.016));
        if (renderer && scene && camera) {
          renderer.render(scene, camera);
        }
        particleAnimFrameId = requestAnimationFrame(animLoop);
      };
      particleAnimFrameId = requestAnimationFrame(animLoop);
    }
  } else {
    if (particleAnimFrameId !== null) {
      cancelAnimationFrame(particleAnimFrameId);
      particleAnimFrameId = null;
    }
  }
};

const toggleWaterParticleAnimation = () => {
  isWaterParticleAnimated.value = !isWaterParticleAnimated.value;
  envInstances.forEach(env => env.setAnimationEnabled(isWaterParticleAnimated.value));
  updateParticleAnimationLoop();
  scheduleRender();
};

// 追踪已挂载对象与组件实例 (升级为 List 数组管理，解耦多快照组装单例覆盖)
let activeMeshes: THREE.Object3D[] = [];
let probeManager: StressProbeManager | null = null;
const focusHighlightGroup = new THREE.Group();

let tGenInstances: TunnelGenerator[] = [];
let rManagerInstances: ReinforcementManager[] = [];
let pipeGenInstances: DrainagePipeGenerator[] = [];
let envInstances: Environment[] = [];

// 多分段场景状态
const renderedSegments = ref<Snapshot[]>([]);
const isSelectorCollapsed = ref(false);
const selectorSearch = ref('');
const isFocusIsolationMode = ref(false);
const isSegmentHudCollapsed = ref(false);

const hoveredMiniMapSnap = ref<Snapshot | null>(null);
const hoveredMiniMapX = ref(0);
const hoveredMiniMapIndex = ref(0);

// 探针在 mode === 'all' 下的解算态选择 (原始超限态 | 临界加固态)
const currentProbeStateTab = ref<'original' | 'critical'>('original');

// 图层显隐与面板折叠状态
const isPipeScaleCollapsed = ref(false);
const isLayerPanelOpen = ref(true);
const isLiningGroupOpen = ref(false);
const isPipesGroupOpen = ref(false);
const isEnvGroupOpen = ref(false);

const liningParentCheckboxRef = ref<HTMLInputElement | null>(null);

const layerVisibility = reactive({
  lining: true,             // 隧道衬砌 (主图层总控)
  liningSecondary: true,    // └ 隧道二衬 (r -> r1)
  liningPrimary: true,      // └ 初支 (r1 -> r2)
  liningRoadDitch: true,    // └ 路面与排水沟
  initialGrouting: true,
  criticalGrouting: true,
  pipes: true,
  pipeAnnotations: true,
  environment: true,
  ground: true,
  flowLines: true,
  waterParticles: true,
  probe: true
});

const isLiningParentChecked = computed(() => {
  return layerVisibility.liningSecondary && layerVisibility.liningPrimary && layerVisibility.liningRoadDitch;
});

const isLiningParentSomeChecked = computed(() => {
  return layerVisibility.liningSecondary || layerVisibility.liningPrimary || layerVisibility.liningRoadDitch;
});

watch([isLiningParentChecked, isLiningParentSomeChecked, isLiningGroupOpen], () => {
  if (liningParentCheckboxRef.value) {
    liningParentCheckboxRef.value.indeterminate = isLiningParentSomeChecked.value && !isLiningParentChecked.value;
  }
}, { flush: 'post' });

const toggleLiningParentGroup = (e: Event) => {
  const target = e.target as HTMLInputElement;
  const val = target.checked;
  layerVisibility.lining = val;
  layerVisibility.liningSecondary = val;
  layerVisibility.liningPrimary = val;
  layerVisibility.liningRoadDitch = val;
  updateLayerVisibility();
};

const onLiningSubLayerChange = () => {
  layerVisibility.lining = isLiningParentSomeChecked.value;
  updateLayerVisibility();
};

const updateLayerVisibility = () => {
  // 1. 隧道衬砌 (分控二衬、初支、内部路面板与水沟槽)
  const liningParentVisible = layerVisibility.lining;
  tGenInstances.forEach(tGen => {
    // 隧道二衬
    if (tGen.mesh) {
      tGen.mesh.visible = liningParentVisible && layerVisibility.liningSecondary;
    }
    // 隧道初支
    if (tGen.primaryMesh) {
      tGen.primaryMesh.visible = liningParentVisible && layerVisibility.liningPrimary;
    }
    // 路面与排水沟
    if (tGen.roadMesh) {
      tGen.roadMesh.visible = liningParentVisible && layerVisibility.liningRoadDitch;
    }
    if (tGen.ditchMesh) {
      tGen.ditchMesh.visible = liningParentVisible && layerVisibility.liningRoadDitch;
    }
    if (tGen.ditchEdgeMesh) {
      tGen.ditchEdgeMesh.visible = liningParentVisible && layerVisibility.liningRoadDitch;
    }
  });

  // 2. 注浆加固圈（支持原始与临界）
  rManagerInstances.forEach(rManager => {
    if (rManager.groutingMesh) {
      rManager.groutingMesh.visible = layerVisibility.initialGrouting;
    }
    if (rManager.criticalGroutingMesh) {
      rManager.criticalGroutingMesh.visible = 
        props.mode !== 'original' && layerVisibility.criticalGrouting;
    }
  });

  // 3. 排水管网与标注
  pipeGenInstances.forEach(pipeGen => {
    pipeGen.getMeshes().forEach(mesh => {
      mesh.visible = layerVisibility.pipes;
    });
    if (pipeGen.annotationGroup) {
      pipeGen.annotationGroup.visible = layerVisibility.pipes && layerVisibility.pipeAnnotations;
    }
  });

  // 4. 水文环境及其子图层 (地面/地表、埋深标注、地下水流线、地下水粒子特效)
  const envVisible = layerVisibility.environment;
  envInstances.forEach(env => {
    if (env.waterPlane) env.waterPlane.visible = envVisible;
    if (env.groundPlane) env.groundPlane.visible = envVisible && layerVisibility.ground;
    if (env.depthIndicator) env.depthIndicator.visible = envVisible && layerVisibility.ground;
    if (env.flowLines) env.flowLines.visible = envVisible && layerVisibility.flowLines;
    if (env.waterParticles) {
      env.waterParticles.visible = envVisible && layerVisibility.waterParticles;
    }
  });

  // 5. 探针与受力图例
  if (probeManager) {
    probeManager.probeGroup.visible = layerVisibility.probe;
    probeManager.diagramGroup.visible = layerVisibility.probe;
  }

  updateParticleAnimationLoop();
  scheduleRender();
};

// 全选/全不选 计算属性与控制函数
const isAllLayersVisible = computed(() => {
  const keys = Object.keys(layerVisibility) as (keyof typeof layerVisibility)[];
  return keys.every(key => layerVisibility[key]);
});

const isSomeLayersVisible = computed(() => {
  const keys = Object.keys(layerVisibility) as (keyof typeof layerVisibility)[];
  return keys.some(key => layerVisibility[key]);
});

const selectAllCheckboxRef = ref<HTMLInputElement | null>(null);

watch([isAllLayersVisible, isSomeLayersVisible, isLayerPanelOpen], () => {
  if (selectAllCheckboxRef.value) {
    selectAllCheckboxRef.value.indeterminate = isSomeLayersVisible.value && !isAllLayersVisible.value;
  }
}, { flush: 'post' });

const setAllLayersVisibility = (visible: boolean) => {
  const keys = Object.keys(layerVisibility) as (keyof typeof layerVisibility)[];
  keys.forEach(key => {
    layerVisibility[key] = visible;
  });
  updateLayerVisibility();
};

const toggleAllLayersVisibility = (e: Event) => {
  const target = e.target as HTMLInputElement;
  setAllLayersVisibility(target.checked);
};

// 受力表达模式状态与切换器
const currentForceMode = ref<ForceDisplayMode>('K');

// 【最不利受力单元】看板折叠状态 (默认折叠: true)
const isProbeTooltipCollapsed = ref(true);

// 数值图例面板折叠状态 (默认展开: false)
const isLegendPanelCollapsed = ref(false);

// 截面受力范围 (用于数值图例)
const probeRanges = ref<{
  minK: number;
  maxK: number;
  minM: number;
  maxM: number;
  minN: number;
  maxN: number;
}>({ minK: 1.0, maxK: 5.0, minM: 0, maxM: 100, minN: -1000, maxN: 5000 });

const setForceMode = (mode: ForceDisplayMode) => {
  currentForceMode.value = mode;
  if (probeManager) {
    probeManager.setForceMode(mode);
    scheduleRender();
  }
};

// 最不利点浮窗信息
const probeInfo = ref<{
  controlIdx: number;
  controlM: number;
  controlN: number;
  minK: number;
  isCritical: boolean;
  chainageText: string;
  stateTag: string;
} | null>(null);

// 剖切分析交互状态
const isClippingEnabled = ref(false);
const clippingAxis = ref<'x' | 'y' | 'z'>('z');
const clippingOffset = ref(25);
const isClippingInverted = ref(false);
const maxChainageLength = ref(50);
const startChainageVal = ref(0);

const clippingPlane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 25);

const updateClipping = () => {
  if (!isClippingEnabled.value) {
    applyClippingPlanes([]);
    return;
  }

  let normal = new THREE.Vector3(0, 0, -1);
  let constant = 0;

  if (clippingAxis.value === 'x') {
    normal = new THREE.Vector3(isClippingInverted.value ? -1 : 1, 0, 0);
    constant = isClippingInverted.value ? clippingOffset.value : -clippingOffset.value;
  } else if (clippingAxis.value === 'y') {
    normal = new THREE.Vector3(0, isClippingInverted.value ? -1 : 1, 0);
    constant = isClippingInverted.value ? clippingOffset.value : -clippingOffset.value;
  } else {
    // Z轴：沿隧道纵向切割（世界坐标下隧道起始于 -startChainage，延伸至 -endChainage）
    const zCut = -(startChainageVal.value + clippingOffset.value);
    normal = new THREE.Vector3(0, 0, isClippingInverted.value ? 1 : -1);
    constant = isClippingInverted.value ? -zCut : zCut;
  }

  clippingPlane.set(normal, constant);
  applyClippingPlanes([clippingPlane]);
  scheduleRender();
};

const snapClippingToActiveSegment = () => {
  if (!activeSegment.value) return;
  const start = extractSnapshotValue(activeSegment.value, 'start_chainage', 0);
  const end = extractSnapshotValue(activeSegment.value, 'end_chainage', 50);
  const centerOffset = Math.abs((start + end) / 2 - startChainageVal.value);
  clippingAxis.value = 'z';
  clippingOffset.value = Math.max(0, Math.min(maxChainageLength.value, centerOffset));
  isClippingEnabled.value = true;
  updateClipping();
};

const applyClippingPlanes = (planes: THREE.Plane[]) => {
  activeMeshes.forEach(mesh => {
    if (mesh instanceof THREE.Mesh || mesh instanceof THREE.InstancedMesh) {
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach(m => {
          m.clippingPlanes = planes;
          m.needsUpdate = true;
        });
      } else if (mesh.material) {
        mesh.material.clippingPlanes = planes;
        mesh.material.needsUpdate = true;
      }
    }
  });
};

// ==========================================
// 多计算分段计算属性与辅助函数
// ==========================================
const activeSegment = computed<Snapshot | null>(() => {
  if (renderedSegments.value.length === 0) return null;
  if (snapshotStore.activeSegmentId) {
    const found = renderedSegments.value.find(s => s.id === snapshotStore.activeSegmentId);
    if (found) return found;
  }
  return null; // 全部不选状态返回 null
});

const activeSegmentIndex = computed(() => {
  if (!activeSegment.value) return -1;
  return renderedSegments.value.findIndex(s => s.id === activeSegment.value?.id);
});

const activeSegmentChainageText = computed(() => {
  if (!activeSegment.value) return '全线概览 (未聚焦)';
  const start = extractSnapshotValue(activeSegment.value, 'start_chainage', 0);
  const end = extractSnapshotValue(activeSegment.value, 'end_chainage', 50);
  return `K${formatChain(start)} ~ K${formatChain(end)}`;
});

const segmentStats = computed(() => {
  const list = renderedSegments.value;
  let danger = 0;
  let warning = 0;
  let safe = 0;
  let minStart = Infinity;
  let maxEnd = -Infinity;

  list.forEach(s => {
    const fs = snapFs(s);
    if (fs != null) {
      if (fs < 1.0) danger++;
      else if (fs < 2.0) warning++;
      else safe++;
    }
    const start = extractSnapshotValue(s, 'start_chainage', 0);
    const end = extractSnapshotValue(s, 'end_chainage', 50);
    if (start < minStart) minStart = start;
    if (end > maxEnd) maxEnd = end;
  });

  const totalKm = (minStart !== Infinity && maxEnd !== -Infinity)
    ? (Math.abs(maxEnd - minStart) / 1000).toFixed(2)
    : '0.00';

  return {
    total: list.length,
    danger,
    warning,
    safe,
    totalKm
  };
});

const filteredSelectorSegments = computed(() => {
  if (!selectorSearch.value.trim()) return renderedSegments.value;
  const kw = selectorSearch.value.trim().toLowerCase();
  return renderedSegments.value.filter(s => {
    const remark = String(s.remark || '').toLowerCase();
    const start = String(extractSnapshotValue(s, 'start_chainage', 0));
    const end = String(extractSnapshotValue(s, 'end_chainage', 50));
    const chainText = `k${formatChain(Number(start))}~k${formatChain(Number(end))}`.toLowerCase();
    return remark.includes(kw) || chainText.includes(kw) || start.includes(kw) || end.includes(kw);
  });
});

function getOriginalSegmentIndex(snap: Snapshot): number {
  return Math.max(0, renderedSegments.value.findIndex(s => s.id === snap.id));
}

function formatChain(num: number): string {
  const km = Math.floor(num / 1000);
  const m = num % 1000;
  return `${km}+${m.toFixed(0).padStart(3, '0')}`;
}

function snapFs(snap: Snapshot | null): number | null {
  if (!snap || !snap.results) return null;
  return snap.results.original_state?.safety_factor ?? snap.results.critical_state?.final_safety_factor ?? null;
}

function snapFsText(snap: Snapshot | null): string {
  const fs = snapFs(snap);
  if (fs == null) return '--';
  return fs.toFixed(2);
}

function getFsClass(fs: number | null): string {
  if (fs == null) return '';
  if (fs < 1.0) return 'danger';
  if (fs < 2.0) return 'warning';
  return 'safe';
}

const scrollPills = (dir: 'left' | 'right') => {
  if (!pillTrackRef.value) return;
  const offset = dir === 'left' ? -220 : 220;
  pillTrackRef.value.scrollBy({ left: offset, behavior: 'smooth' });
};

// 全部不选 / 取消聚焦状态
const unselectSegment = () => {
  snapshotStore.setActiveSegment(null);
  updateFocusHighlightBox(null);
  if (isFocusIsolationMode.value) {
    isFocusIsolationMode.value = false;
    applyFocusIsolation();
  }
  renderActiveSegmentProbe(null);
  drawMiniMap();
  scheduleRender();
};

// 点击胶囊：已选中则取消，未选中则聚焦
const onPillClick = (snap: Snapshot) => {
  if (activeSegment.value?.id === snap.id) {
    unselectSegment();
  } else {
    selectSegment(snap, true);
  }
};

// 切换选择活动分段
const selectSegment = (snap: Snapshot, shouldFly: boolean = true) => {
  snapshotStore.setActiveSegment(snap.id);
  renderActiveSegmentProbe(snap);
  updateFocusHighlightBox(snap);
  if (shouldFly) {
    flyToSegment(snap);
  }
  drawMiniMap();
  scheduleRender();
};

// 独占聚焦模式切换 (虚化非活动分段)
const toggleFocusIsolation = () => {
  isFocusIsolationMode.value = !isFocusIsolationMode.value;
  applyFocusIsolation();
  scheduleRender();
};

const applyFocusIsolation = () => {
  const activeId = activeSegment.value?.id;
  const isIso = isFocusIsolationMode.value;

  tGenInstances.forEach((tg, idx) => {
    const snap = renderedSegments.value[idx];
    const isCur = snap && snap.id === activeId;
    const meshes = tg.getMeshes();
    meshes.forEach((m: any) => {
      if (m && m.material) {
        if (Array.isArray(m.material)) {
          m.material.forEach((mat: any) => {
            mat.transparent = true;
            mat.opacity = (!isIso || isCur) ? 1.0 : 0.2;
            mat.needsUpdate = true;
          });
        } else {
          m.material.transparent = true;
          m.material.opacity = (!isIso || isCur) ? 1.0 : 0.2;
          m.material.needsUpdate = true;
        }
      }
    });
  });
};

// 绘制宏观全线 Mini-map 安全色带
const drawMiniMap = () => {
  const canvas = miniMapCanvasRef.value;
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width = canvas.parentElement?.clientWidth || 600;
  const h = canvas.height = 14;

  ctx.clearRect(0, 0, w, h);

  const list = renderedSegments.value;
  if (list.length === 0) return;

  let minStart = Infinity;
  let maxEnd = -Infinity;
  list.forEach(s => {
    const start = extractSnapshotValue(s, 'start_chainage', 0);
    const end = extractSnapshotValue(s, 'end_chainage', 50);
    if (start < minStart) minStart = start;
    if (end > maxEnd) maxEnd = end;
  });

  const totalLen = Math.max(1, maxEnd - minStart);

  // 背景底槽
  ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.fillRect(0, 0, w, h);

  list.forEach((s, idx) => {
    const start = extractSnapshotValue(s, 'start_chainage', 0);
    const end = extractSnapshotValue(s, 'end_chainage', 50);
    const segLen = Math.max(1, end - start);

    const x = ((start - minStart) / totalLen) * w;
    const segW = Math.max(3, (segLen / totalLen) * w);

    const fs = snapFs(s);
    let color = '#64748b'; // 待算灰
    if (fs != null) {
      if (fs < 1.0) color = '#ef4444'; // 危险红
      else if (fs < 2.0) color = '#f59e0b'; // 预警黄
      else color = '#10b981'; // 安全绿
    }

    ctx.fillStyle = color;
    ctx.fillRect(x, 2, segW, h - 4);

    // 分隔线
    ctx.strokeStyle = 'rgba(15, 23, 42, 0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x, 2, segW, h - 4);

    // 活动段高亮边框 (仅当有选中段时绘制)
    if (activeSegment.value && activeSegment.value.id === s.id) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 1, 0, segW + 2, h);
    }
  });
};

const handleMiniMapClick = (e: MouseEvent) => {
  const canvas = miniMapCanvasRef.value;
  if (!canvas || renderedSegments.value.length === 0) return;
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));

  let minStart = Infinity;
  let maxEnd = -Infinity;
  renderedSegments.value.forEach(s => {
    const start = extractSnapshotValue(s, 'start_chainage', 0);
    const end = extractSnapshotValue(s, 'end_chainage', 50);
    if (start < minStart) minStart = start;
    if (end > maxEnd) maxEnd = end;
  });

  const totalLen = Math.max(1, maxEnd - minStart);
  const targetChain = minStart + ratio * totalLen;

  const match = renderedSegments.value.find(s => {
    const start = extractSnapshotValue(s, 'start_chainage', 0);
    const end = extractSnapshotValue(s, 'end_chainage', 50);
    return targetChain >= start && targetChain <= end;
  }) || renderedSegments.value[Math.min(renderedSegments.value.length - 1, Math.floor(ratio * renderedSegments.value.length))];

  if (match) {
    if (activeSegment.value?.id === match.id) {
      unselectSegment();
    } else {
      selectSegment(match, true);
    }
  }
};

const handleMiniMapMouseMove = (e: MouseEvent) => {
  const canvas = miniMapCanvasRef.value;
  if (!canvas || renderedSegments.value.length === 0) return;
  const rect = canvas.getBoundingClientRect();
  const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  hoveredMiniMapX.value = Math.max(10, Math.min(rect.width - 160, e.clientX - rect.left));

  let minStart = Infinity;
  let maxEnd = -Infinity;
  renderedSegments.value.forEach(s => {
    const start = extractSnapshotValue(s, 'start_chainage', 0);
    const end = extractSnapshotValue(s, 'end_chainage', 50);
    if (start < minStart) minStart = start;
    if (end > maxEnd) maxEnd = end;
  });

  const totalLen = Math.max(1, maxEnd - minStart);
  const targetChain = minStart + ratio * totalLen;

  const idx = renderedSegments.value.findIndex(s => {
    const start = extractSnapshotValue(s, 'start_chainage', 0);
    const end = extractSnapshotValue(s, 'end_chainage', 50);
    return targetChain >= start && targetChain <= end;
  });

  if (idx !== -1) {
    hoveredMiniMapSnap.value = renderedSegments.value[idx];
    hoveredMiniMapIndex.value = idx;
  } else {
    const fallbackIdx = Math.min(renderedSegments.value.length - 1, Math.floor(ratio * renderedSegments.value.length));
    hoveredMiniMapSnap.value = renderedSegments.value[fallbackIdx];
    hoveredMiniMapIndex.value = fallbackIdx;
  }
};

// 3D 场景活动分段聚焦线框高亮
const updateFocusHighlightBox = (snap: Snapshot | null) => {
  while (focusHighlightGroup.children.length > 0) {
    const child = focusHighlightGroup.children[0];
    focusHighlightGroup.remove(child);
    if ((child as any).geometry) (child as any).geometry.dispose();
    if ((child as any).material) (child as any).material.dispose();
  }

  if (!snap || !scene) return;

  const start = extractSnapshotValue(snap, 'start_chainage', 0);
  const end = extractSnapshotValue(snap, 'end_chainage', 50);
  const r0 = extractSnapshotValue(snap, 'r_0', extractSnapshotValue(snap, 'r', 7.95));
  const tunnelType = extractSnapshotValue<string>(snap, 'tunnel_type', 'single');
  const dSpacing = extractSnapshotValue(snap, 'D_spacing', 30.0);
  const isDouble = tunnelType === 'double';

  const segLen = Math.abs(end - start);
  const totalW = isDouble ? (dSpacing + 2.4 * r0) : (2.4 * r0);
  const totalH = 2.4 * r0;

  const boxGeo = new THREE.BoxGeometry(totalW, totalH, segLen);
  const boxEdges = new THREE.EdgesGeometry(boxGeo);
  const boxMat = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    linewidth: 2,
    transparent: true,
    opacity: 0.85
  });
  const wireframe = new THREE.LineSegments(boxEdges, boxMat);
  wireframe.position.set(0, 0, -(start + end) / 2);
  focusHighlightGroup.add(wireframe);
};

// 节流阀控制状态
let renderFrameId: number | null = null;
let isRendering = false;

// 初始化 WebGL 画布
const initWebGL = () => {
  if (!canvasRef.value || !containerRef.value) return;

  const width = containerRef.value.clientWidth;
  const height = containerRef.value.clientHeight;
  const aspect = width / height;

  renderer = new THREE.WebGLRenderer({
    canvas: canvasRef.value,
    antialias: true,
    logarithmicDepthBuffer: true,
    alpha: true
  });

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(width, height);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  renderer.localClippingEnabled = true;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1d24);

  perspectiveCamera = new THREE.PerspectiveCamera(45, aspect, 0.5, 2000);
  perspectiveCamera.position.set(0, 25, 60);

  const initD = perspectiveCamera.position.distanceTo(new THREE.Vector3(0, 0, -20));
  const halfH = initD * Math.tan((45 * Math.PI) / 360);
  const halfW = halfH * aspect;
  orthographicCamera = new THREE.OrthographicCamera(-halfW, halfW, halfH, -halfH, 0.5, 2000);
  orthographicCamera.position.copy(perspectiveCamera.position);

  activeCamera = cameraMode.value === 'orthographic' ? orthographicCamera : perspectiveCamera;
  camera = activeCamera as any;

  // 影棚级三点光源阵列
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.5);
  keyLight.position.set(50, 80, 50);
  keyLight.castShadow = true;
  keyLight.shadow.bias = -0.0001;
  keyLight.shadow.normalBias = 0.05;
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0x93c5fd, 1.2);
  fillLight.position.set(-50, 40, -50);
  scene.add(fillLight);

  const rimLight = new THREE.DirectionalLight(0xfde047, 2.8);
  rimLight.position.set(0, -20, -100);
  scene.add(rimLight);

  const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
  scene.add(ambientLight);

  updateEnvironmentMap(visualParadigm.value);
  controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 0, -20);
  controls.enableDamping = true;
  controls.dampingFactor = 0.05;

  controls.addEventListener('change', () => {
    emit('cameraChange', {
      position: [camera.position.x, camera.position.y, camera.position.z],
      target: [controls.target.x, controls.target.y, controls.target.z]
    });
    scheduleRender();
  });

  probeManager = new StressProbeManager(scene);
  scene.add(measureGroup);
  scene.add(focusHighlightGroup);
  scheduleRender();
};

/**
 * 悬停 Raycasting 检测
 */
const handleCanvasPointerMove = (event: MouseEvent) => {
  if (!canvasRef.value || !camera) return;

  const rect = canvasRef.value.getBoundingClientRect();
  mouseVec.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouseVec.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouseVec, camera);
  const intersects = raycaster.intersectObjects(activeMeshes, true);

  if (intersects.length > 0) {
    const hit = intersects[0].object;
    if (hit && hit.userData && hit.userData.isAnnotation === true && (hit.userData.pipeCategory || hit.userData.name)) {
      canvasRef.value.style.cursor = 'pointer';
      return;
    }
  }
  if (!isMeasuring.value) {
    canvasRef.value.style.cursor = 'default';
  }
};

/**
 * 键盘按键监听 (ESC 退出 PIP 画中画)
 */
const handleKeyDown = (event: KeyboardEvent) => {
  if (event.key === 'Escape' && isPipActive.value) {
    isPipActive.value = false;
  }
};

/**
 * 切换透视 (Perspective) 与 正交/等轴 (Orthographic) 投影相机
 */
const setCameraProjectionMode = (mode: 'perspective' | 'orthographic') => {
  if (cameraMode.value === mode || !controls || !containerRef.value) return;

  const width = containerRef.value.clientWidth;
  const height = containerRef.value.clientHeight;
  const aspect = width / height;

  const currentPos = camera.position.clone();
  const currentTarget = controls.target.clone();
  const distance = currentPos.distanceTo(currentTarget);

  if (mode === 'orthographic') {
    const halfH = distance * Math.tan((perspectiveCamera.fov * Math.PI) / 360);
    const halfW = halfH * aspect;

    orthographicCamera.left = -halfW;
    orthographicCamera.right = halfW;
    orthographicCamera.top = halfH;
    orthographicCamera.bottom = -halfH;
    orthographicCamera.position.copy(currentPos);
    orthographicCamera.quaternion.copy(perspectiveCamera.quaternion);
    orthographicCamera.updateProjectionMatrix();

    activeCamera = orthographicCamera;
    camera = orthographicCamera as any;
  } else {
    perspectiveCamera.aspect = aspect;
    perspectiveCamera.position.copy(currentPos);
    perspectiveCamera.quaternion.copy(orthographicCamera.quaternion);
    perspectiveCamera.updateProjectionMatrix();

    activeCamera = perspectiveCamera;
    camera = perspectiveCamera as any;
  }

  cameraMode.value = mode;
  controls.object = camera;
  controls.update();
  scheduleRender();
};

// 交互测距与标准视角控制状态
const isMeasuring = ref(false);
const measurePoints = ref<THREE.Vector3[]>([]);
const measureGroup = new THREE.Group();
const raycaster = new THREE.Raycaster();
const mouseVec = new THREE.Vector2();
let cameraAnimFrameId: number | null = null;

/**
 * 相机平滑飞行动画 (Lerp Ease-in-out Tween)
 */
const flyToSegment = (snap: Snapshot) => {
  if (!camera || !controls || !snap) return;
  if (cameraAnimFrameId !== null) cancelAnimationFrame(cameraAnimFrameId);

  const start = extractSnapshotValue(snap, 'start_chainage', 0);
  const end = extractSnapshotValue(snap, 'end_chainage', 50);
  const r0 = extractSnapshotValue(snap, 'r_0', extractSnapshotValue(snap, 'r', 7.95));
  const tunnelType = extractSnapshotValue<string>(snap, 'tunnel_type', 'single');
  const dSpacing = extractSnapshotValue(snap, 'D_spacing', 30.0);
  const isDouble = tunnelType === 'double';

  const segLen = Math.abs(end - start);
  const targetZ = -(start + end) / 2;
  const targetLookAt = new THREE.Vector3(0, r0 * 0.3, targetZ);

  const wEffective = isDouble ? (dSpacing + 2.2 * r0) : (2.2 * r0);
  const fovRad = (perspectiveCamera.fov * Math.PI) / 360;
  const dOptimal = Math.max(
    segLen / (2 * Math.tan(fovRad)),
    wEffective / Math.tan(fovRad),
    25.0
  );

  const targetPos = targetLookAt.clone().add(new THREE.Vector3(
    0.707 * dOptimal,
    0.5 * dOptimal,
    0.5 * dOptimal
  ));

  const startPos = camera.position.clone();
  const startTarget = controls.target.clone();
  const startTime = performance.now();
  const durationMs = 800;

  const animateStep = (now: number) => {
    const elapsed = now - startTime;
    const progress = Math.min(1.0, elapsed / durationMs);
    const ease = progress < 0.5
      ? 4 * progress * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 3) / 2;

    camera.position.lerpVectors(startPos, targetPos, ease);
    controls.target.lerpVectors(startTarget, targetLookAt, ease);

    if (camera instanceof THREE.OrthographicCamera && perspectiveCamera && containerRef.value) {
      const distance = camera.position.distanceTo(controls.target);
      const aspect = containerRef.value.clientWidth / containerRef.value.clientHeight;
      const halfH = distance * Math.tan((perspectiveCamera.fov * Math.PI) / 360);
      const halfW = halfH * aspect;
      camera.left = -halfW;
      camera.right = halfW;
      camera.top = halfH;
      camera.bottom = -halfH;
      camera.updateProjectionMatrix();
    }

    controls.update();
    scheduleRender();

    if (progress < 1.0) {
      cameraAnimFrameId = requestAnimationFrame(animateStep);
    } else {
      cameraAnimFrameId = null;
    }
  };

  cameraAnimFrameId = requestAnimationFrame(animateStep);
};

/**
 * 切换标准工程视角
 */
const switchToStandardView = (viewKey: string) => {
  if (!camera || !controls) return;
  if (cameraAnimFrameId !== null) cancelAnimationFrame(cameraAnimFrameId);

  const L = maxChainageLength.value || 50;
  const startZ = startChainageVal.value || 0;
  const targetZ = -startZ - L / 2;
  const targetLookAt = new THREE.Vector3(0, 0, targetZ);
  const R = 6.0;

  let targetPos = new THREE.Vector3();

  switch (viewKey) {
    case 'front':
      targetPos.set(0, 0, 35);
      break;
    case 'left':
      targetPos.set(-R * 6, 0, targetZ);
      break;
    case 'right':
      targetPos.set(R * 6, 0, targetZ);
      break;
    case 'top':
      targetPos.set(0, R * 6, targetZ);
      break;
    case 'bottom':
      targetPos.set(0, -R * 6, targetZ);
      break;
    case 'perspective':
    default:
      targetPos.set(R * 4, R * 3, 20);
      break;
  }

  const startPos = camera.position.clone();
  const startTarget = controls.target.clone();
  const startTime = performance.now();
  const durationMs = 800;

  const animateStep = (now: number) => {
    const elapsed = now - startTime;
    const progress = Math.min(1.0, elapsed / durationMs);
    const ease = progress < 0.5
      ? 4 * progress * progress * progress
      : 1 - Math.pow(-2 * progress + 2, 3) / 2;

    camera.position.lerpVectors(startPos, targetPos, ease);
    controls.target.lerpVectors(startTarget, targetLookAt, ease);

    if (camera instanceof THREE.OrthographicCamera && perspectiveCamera && containerRef.value) {
      const distance = camera.position.distanceTo(controls.target);
      const aspect = containerRef.value.clientWidth / containerRef.value.clientHeight;
      const halfH = distance * Math.tan((perspectiveCamera.fov * Math.PI) / 360);
      const halfW = halfH * aspect;
      camera.left = -halfW;
      camera.right = halfW;
      camera.top = halfH;
      camera.bottom = -halfH;
      camera.updateProjectionMatrix();
    }

    controls.update();
    scheduleRender();

    if (progress < 1.0) {
      cameraAnimFrameId = requestAnimationFrame(animateStep);
    } else {
      cameraAnimFrameId = null;
    }
  };

  cameraAnimFrameId = requestAnimationFrame(animateStep);
};

const toggleMeasurementMode = () => {
  isMeasuring.value = !isMeasuring.value;
  if (!isMeasuring.value) {
    measurePoints.value = [];
  }
};

const clearMeasurements = () => {
  measurePoints.value = [];
  while (measureGroup.children.length > 0) {
    const child = measureGroup.children[0];
    measureGroup.remove(child);
    if ((child as any).geometry) (child as any).geometry.dispose();
    if ((child as any).material) {
      if (Array.isArray((child as any).material)) {
        (child as any).material.forEach((m: any) => m.dispose());
      } else {
        (child as any).material.dispose();
      }
    }
  }
  scheduleRender();
};

const handleCanvasClick = (event: MouseEvent) => {
  if (!canvasRef.value || !camera || !scene) return;

  const rect = canvasRef.value.getBoundingClientRect();
  mouseVec.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouseVec.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouseVec, camera);
  const intersects = raycaster.intersectObjects(activeMeshes, true);

  if (isMeasuring.value) {
    if (intersects.length > 0) {
      const point = intersects[0].point;
      measurePoints.value.push(point);

      const sphereGeo = new THREE.SphereGeometry(0.15, 16, 16);
      const sphereMat = new THREE.MeshBasicMaterial({ color: 0xffaa00 });
      const sphere = new THREE.Mesh(sphereGeo, sphereMat);
      sphere.position.copy(point);
      measureGroup.add(sphere);

      if (measurePoints.value.length === 2) {
        const p1 = measurePoints.value[0];
        const p2 = measurePoints.value[1];
        const dist = p1.distanceTo(p2);

        const lineGeo = new THREE.BufferGeometry().setFromPoints([p1, p2]);
        const lineMat = new THREE.LineDashedMaterial({
          color: 0xffea00,
          dashSize: 0.3,
          gapSize: 0.15,
          linewidth: 2
        });
        const line = new THREE.Line(lineGeo, lineMat);
        line.computeLineDistances();
        measureGroup.add(line);

        const midPoint = p1.clone().add(p2).multiplyScalar(0.5);
        const canvas = document.createElement('canvas');
        canvas.width = 256;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
          if (typeof (ctx as any).roundRect === 'function') {
            (ctx as any).roundRect(10, 8, 236, 48, 8);
          } else {
            ctx.rect(10, 8, 236, 48);
          }
          ctx.fill();
          ctx.strokeStyle = '#ffea00';
          ctx.lineWidth = 3;
          ctx.stroke();

          ctx.font = 'bold 22px sans-serif';
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(`L = ${dist.toFixed(2)} m`, 128, 32);
        }
        const texture = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: texture, transparent: true });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.scale.set(4.0, 1.0, 1);
        sprite.position.copy(midPoint).add(new THREE.Vector3(0, 0.5, 0));
        measureGroup.add(sprite);

        measurePoints.value = [];
      }
    }

    scheduleRender();
    return;
  }

  if (intersects.length > 0) {
    const hit = intersects[0].object;
    if (hit && hit.userData && hit.userData.isAnnotation === true && (hit.userData.pipeCategory || hit.userData.name)) {
      pipPipeData.value = { ...hit.userData };
      isPipActive.value = true;
      return;
    }
  }

  if (isPipActive.value) {
    isPipActive.value = false;
  }
};

const scheduleRender = () => {
  if (isRendering) return;
  isRendering = true;

  if (renderFrameId !== null) {
    cancelAnimationFrame(renderFrameId);
  }

  renderFrameId = requestAnimationFrame(() => {
    envInstances.forEach(env => env.update(0.016));
    if (controls) controls.update();
    if (renderer && scene && camera) {
      renderer.render(scene, camera);
    }
    isRendering = false;
  });
};

const setCameraState = (state: { position: number[]; target: number[] }) => {
  if (!camera || !controls) return;
  camera.position.set(state.position[0], state.position[1], state.position[2]);
  controls.target.set(state.target[0], state.target[1], state.target[2]);
  controls.update();
  scheduleRender();
};

defineExpose({ setCameraState });

// 仅更新当前活动分段的 3D 最不利探针与云图 (全部不选时自动回退至全线最危险截面)
const renderActiveSegmentProbe = (snapOverride?: Snapshot | null) => {
  if (!probeManager) return;
  let targetSnap: Snapshot | null = null;
  let isGlobalFallback = false;

  if (snapOverride !== undefined) {
    targetSnap = snapOverride;
  } else if (activeSegment.value) {
    targetSnap = activeSegment.value;
  }

  // 全部不选状态时，默认提取全线最危险 (Fs 最小) 的分段展示探针
  if (!targetSnap && renderedSegments.value.length > 0) {
    isGlobalFallback = true;
    let worstSnap = renderedSegments.value[0];
    let minFs = Infinity;
    renderedSegments.value.forEach(s => {
      const fs = snapFs(s);
      if (fs != null && fs < minFs) {
        minFs = fs;
        worstSnap = s;
      }
    });
    targetSnap = worstSnap;
  }

  if (!targetSnap) return;

  const rawData = toRaw(targetSnap);
  const start_chainage = extractSnapshotValue(rawData, 'start_chainage', 0);
  const r = extractSnapshotValue(rawData, 'r_0', extractSnapshotValue(rawData, 'r', 7.95));
  const targetViewMode = props.mode === 'all' ? currentProbeStateTab.value : props.mode;

  const probeRes = probeManager.updateFromSnapshot(rawData, r, -start_chainage, 2.0, targetViewMode);
  probeManager.setForceMode(currentForceMode.value);

  const modeTag = targetViewMode === 'original' ? '原始超限态' : '临界加固态';
  const prefixTag = isGlobalFallback ? '全线最不利·' : '';

  probeInfo.value = {
    controlIdx: probeRes.controlIdx,
    controlM: probeRes.controlM,
    controlN: probeRes.controlN,
    minK: probeRes.minK,
    isCritical: probeRes.minK <= 2.0,
    chainageText: probeRes.chainageText,
    stateTag: `[${prefixTag}${modeTag}]`
  };

  if (probeRes.ranges) {
    probeRanges.value = probeRes.ranges;
  }
};

// 渲染场景全量几何主体
const renderSceneData = () => {
  if (!scene) return;

  // 清理上一轮实体
  activeMeshes.forEach(mesh => scene.remove(mesh));
  activeMeshes = [];
  
  envInstances.forEach(env => env.dispose());
  envInstances = [];

  tGenInstances.forEach(tGen => {
    tGen.getMeshes().forEach(mesh => {
      if ((mesh as any).geometry) (mesh as any).geometry.dispose();
      if ((mesh as any).material) {
        if (Array.isArray((mesh as any).material)) (mesh as any).material.forEach((m: any) => m.dispose());
        else ((mesh as any).material as any).dispose();
      }
    });
  });
  tGenInstances = [];

  rManagerInstances.forEach(rm => rm.dispose());
  rManagerInstances = [];

  pipeGenInstances.forEach(pg => pg.dispose());
  pipeGenInstances = [];

  // 决定数据源快照列表
  let snapshotsToRender: Snapshot[] = [];
  if (props.snapshotOverride) {
    snapshotsToRender = [props.snapshotOverride];
  } else {
    snapshotsToRender = snapshotStore.snapshots.filter((s: any) => s.selectedFor3D);
    if (snapshotsToRender.length === 0) {
      const currentParam = parameterStore.currentPayload;
      snapshotsToRender = [{
        id: 'live_current',
        timestamp: Date.now(),
        remark: '当前实时工况',
        start_chainage: currentParam.start_chainage || 0,
        end_chainage: currentParam.end_chainage || 50,
        params: currentParam,
        results: parameterStore.currentResults
      }];
    }
  }

  renderedSegments.value = snapshotsToRender;

  // 默认折叠单段或对比模式下的选区条
  if (snapshotsToRender.length <= 1 || props.snapshotOverride) {
    isSelectorCollapsed.value = true;
  } else {
    isSelectorCollapsed.value = false;
  }

  let minGlobalStart = Infinity;
  let maxGlobalEnd = -Infinity;

  snapshotsToRender.forEach((snap: Snapshot) => {
    const rawData = toRaw(snap);
    if (!rawData) return;

    const start_chainage = extractSnapshotValue(rawData, 'start_chainage', 0);
    const end_chainage = extractSnapshotValue(rawData, 'end_chainage', 50);
    const r = extractSnapshotValue(rawData, 'r_0', extractSnapshotValue(rawData, 'r', 7.95));
    const r1 = extractSnapshotValue(rawData, 'r_s', extractSnapshotValue(rawData, 'r1', 8.35));
    const r2 = extractSnapshotValue(rawData, 'r_p', extractSnapshotValue(rawData, 'r2', 8.57));
    const rg = extractSnapshotValue(rawData, 'r_g', extractSnapshotValue(rawData, 'rg', 8.57));
    const c = extractSnapshotValue(rawData, 'h_1', extractSnapshotValue(rawData, 'c', 130.0));
    const tunnel_type = extractSnapshotValue<string>(rawData, 'tunnel_type', 'single') as 'single' | 'double';
    const aspect_ratio = extractSnapshotValue(rawData, 'aspect_ratio', 0.7);
    const D_spacing = extractSnapshotValue(rawData, 'D_spacing', 30.0);
    const has_central_ditch = extractSnapshotValue<boolean>(rawData, 'has_central_ditch', true);

    if (start_chainage < minGlobalStart) minGlobalStart = start_chainage;
    if (end_chainage > maxGlobalEnd) maxGlobalEnd = end_chainage;

    const tType = tunnel_type === 'double' ? TunnelType.DOUBLE : TunnelType.SINGLE;

    // 1. 隧道主洞体与路面水沟生成
    const tGen = new TunnelGenerator(tType, start_chainage, end_chainage, r, aspect_ratio, D_spacing, r1, r2, rg, c, 1.0, has_central_ditch);
    tGen.setVisualParadigm(visualParadigm.value);
    tGen.getMeshes().forEach(mesh => {
      mesh.castShadow = false;
      mesh.receiveShadow = false;
      mesh.frustumCulled = false;
    });

    const spacingZ = 1.0;
    const nCurrent = Math.ceil((end_chainage - start_chainage) / spacingZ);
    if (nCurrent > 0) {
      tGen.updateInstanceData(nCurrent, spacingZ, 1.0, r, 0);
    }
    tGen.getMeshes().forEach(mesh => {
      mesh.position.z = -start_chainage;
      scene.add(mesh);
      activeMeshes.push(mesh);
    });
    tGenInstances.push(tGen);

    // 2. 加固注浆圈
    const rManager = new ReinforcementManager({
      rg,
      r2,
      rg_crit: props.mode === 'original' ? undefined : rawData.results?.critical_state?.rg_crit,
      tg_crit: props.mode === 'original' ? undefined : rawData.results?.critical_state?.tg_crit,
      base_r: r,
      start_chainage,
      end_chainage,
      tunnel_type,
      D_spacing
    });
    rManager.setVisualParadigm(visualParadigm.value);
    rManager.updateFromSnapshot(rawData);
    rManager.getMeshes().forEach(mesh => {
      mesh.position.z = -start_chainage;
      mesh.frustumCulled = false;
      scene.add(mesh);
      activeMeshes.push(mesh);
    });
    rManagerInstances.push(rManager);

    // 3. 排水管网生成器
    const pipeGen = new DrainagePipeGenerator({
      ringDiam: extractSnapshotValue(rawData, 'ring_diam_recommend', 0.05),
      ringSpacing: extractSnapshotValue(rawData, 'ring_spacing_recommend', 10.0),
      longDiam: extractSnapshotValue(rawData, 'd_long_default', 0.1),
      latDiam: extractSnapshotValue(rawData, 'd_lat_default', 0.08),
      doubleSide: extractSnapshotValue(rawData, 'double_side', true),
      tunnelType: tunnel_type,
      startChainage: start_chainage,
      endChainage: end_chainage,
      tunnelRadius: r,
      outerRadius: r1,
      dSpacing: D_spacing,
      hasCentralDitch: has_central_ditch
    });
    pipeGen.setVisualParadigm(visualParadigm.value);
    pipeGen.setPipeScaleFactor(pipeScaleFactor.value);
    pipeGen.updateFromSnapshot(rawData, props.mode);
    pipeGen.getMeshes().forEach(mesh => {
      mesh.position.z = -start_chainage;
      mesh.frustumCulled = false;
      scene.add(mesh);
      activeMeshes.push(mesh);
    });
    if (pipeGen.annotationGroup) {
      scene.add(pipeGen.annotationGroup);
      activeMeshes.push(pipeGen.annotationGroup);
    }
    pipeGenInstances.push(pipeGen);

    // 4. 水文环境建模随动
    const envInstance = new Environment(scene, {
      startChainage: start_chainage,
      endChainage: end_chainage,
      tunnelRadius: r,
      burialDepth: c,
      dSpacing: D_spacing,
      tunnelType: tunnel_type
    });
    envInstance.setAnimationEnabled(isWaterParticleAnimated.value);
    envInstance.updateFromSnapshot(rawData);
    envInstance.getMeshes().forEach(mesh => {
      activeMeshes.push(mesh);
    });
    envInstances.push(envInstance);
  });

  if (minGlobalStart !== Infinity && maxGlobalEnd !== -Infinity) {
    maxChainageLength.value = Math.abs(maxGlobalEnd - minGlobalStart);
    startChainageVal.value = minGlobalStart;
  }

  // 渲染当前活动分段的探针与聚焦线框 (解耦单例覆盖)
  renderActiveSegmentProbe();
  updateFocusHighlightBox(activeSegment.value);
  applyFocusIsolation();

  nextTick(() => {
    drawMiniMap();
  });

  switchVisualParadigm(visualParadigm.value);
  updateClipping();
  updateLayerVisibility();
  scheduleRender();
};

watch(
  [() => snapshotStore.refresh3DTrigger, () => props.mode, () => props.snapshotOverride],
  () => renderSceneData()
);

watch(
  () => snapshotStore.activeSegmentId,
  (newId) => {
    if (!newId) return;
    const found = renderedSegments.value.find(s => s.id === newId);
    if (found) {
      renderActiveSegmentProbe(found);
      updateFocusHighlightBox(found);
      drawMiniMap();
      applyFocusIsolation();
      scheduleRender();
    }
  }
);

let resizeObserver: ResizeObserver | null = null;

const handleResize = () => {
  if (!containerRef.value || !camera || !renderer) return;
  const width = containerRef.value.clientWidth;
  const height = containerRef.value.clientHeight;
  if (width <= 0 || height <= 0) return;
  const aspect = width / height;

  if (camera instanceof THREE.PerspectiveCamera) {
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
  } else if (camera instanceof THREE.OrthographicCamera && perspectiveCamera) {
    const distance = camera.position.distanceTo(controls ? controls.target : new THREE.Vector3(0, 0, -20));
    const halfH = distance * Math.tan((perspectiveCamera.fov * Math.PI) / 360);
    const halfW = halfH * aspect;
    camera.left = -halfW;
    camera.right = halfW;
    camera.top = halfH;
    camera.bottom = -halfH;
    camera.updateProjectionMatrix();
  }
  renderer.setSize(width, height);
  drawMiniMap();
  scheduleRender();
};

onMounted(() => {
  initWebGL();
  renderSceneData();
  window.addEventListener('resize', handleResize);
  canvasRef.value?.addEventListener('click', handleCanvasClick);
  canvasRef.value?.addEventListener('mousemove', handleCanvasPointerMove);
  window.addEventListener('keydown', handleKeyDown);

  if (containerRef.value) {
    resizeObserver = new ResizeObserver(() => {
      handleResize();
    });
    resizeObserver.observe(containerRef.value);
  }
});

onBeforeUnmount(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
    resizeObserver = null;
  }
  window.removeEventListener('resize', handleResize);
  canvasRef.value?.removeEventListener('click', handleCanvasClick);
  canvasRef.value?.removeEventListener('mousemove', handleCanvasPointerMove);
  window.removeEventListener('keydown', handleKeyDown);
  if (cameraAnimFrameId !== null) cancelAnimationFrame(cameraAnimFrameId);
  if (renderFrameId !== null) cancelAnimationFrame(renderFrameId);
  if (particleAnimFrameId !== null) cancelAnimationFrame(particleAnimFrameId);
  envInstances.forEach(env => env.dispose());
  envInstances = [];
  pipeGenInstances.forEach(pg => pg.dispose());
  pipeGenInstances = [];
  rManagerInstances.forEach(rm => rm.dispose());
  rManagerInstances = [];
  if (probeManager) probeManager.dispose();
  renderer?.dispose();
});
</script>

<style scoped>
.viewer-container {
  width: 100%;
  height: 100%;
  overflow: hidden;
  position: relative;
  background-color: #1a1d24;
}

canvas {
  display: block;
  width: 100%;
  height: 100%;
}

.glass-card {
  background: rgba(20, 24, 33, 0.85);
  backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
}

/* 顶部可折叠计算分段控制器样式 */
.segment-selector-bar {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  width: calc(100% - 560px);
  max-width: 820px;
  min-width: 320px;
  z-index: 20;
  padding: 8px 14px;
  color: #e0e6ed;
  transition: all 0.25s ease;
}

.segment-selector-bar.is-collapsed {
  padding: 5px 12px;
  max-width: fit-content;
  width: auto;
}

.selector-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.collapse-toggle-btn {
  font-size: 11px;
  color: #38bdf8;
  background: rgba(56, 189, 248, 0.15);
  padding: 2px 6px;
  border-radius: 4px;
  transition: background 0.2s ease;
}

.collapse-toggle-btn:hover {
  background: rgba(56, 189, 248, 0.3);
}

.selector-title {
  font-size: 13px;
  font-weight: 600;
  color: #f8fafc;
  white-space: nowrap;
}

.stats-pills {
  display: flex;
  align-items: center;
  gap: 6px;
}

.stat-pill {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 10px;
  font-weight: 500;
}

.stat-pill.total {
  background: rgba(255, 255, 255, 0.08);
  color: #cbd5e1;
}

.stat-pill.danger {
  background: rgba(239, 68, 68, 0.2);
  color: #f87171;
  border: 1px solid rgba(239, 68, 68, 0.3);
}

.stat-pill.warning {
  background: rgba(245, 158, 11, 0.2);
  color: #fbbf24;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.stat-pill.safe {
  background: rgba(16, 185, 129, 0.2);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.header-right {
  display: flex;
  align-items: center;
  gap: 8px;
}

.search-box {
  position: relative;
  display: flex;
  align-items: center;
}

.selector-search-input {
  background: rgba(15, 23, 42, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  color: #f8fafc;
  font-size: 11px;
  padding: 3px 20px 3px 8px;
  width: 130px;
  outline: none;
  transition: all 0.2s ease;
}

.selector-search-input:focus {
  border-color: #38bdf8;
  width: 160px;
  background: rgba(15, 23, 42, 0.9);
}

.clear-search-btn {
  position: absolute;
  right: 4px;
  background: transparent;
  border: none;
  color: #94a3b8;
  cursor: pointer;
  font-size: 10px;
}

.focus-mode-btn {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #cbd5e1;
  border-radius: 4px;
  font-size: 11px;
  padding: 3px 8px;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s ease;
}

.focus-mode-btn:hover {
  border-color: #38bdf8;
  color: #38bdf8;
}

.focus-mode-btn.active {
  background: rgba(56, 189, 248, 0.2);
  border-color: #38bdf8;
  color: #38bdf8;
  font-weight: 600;
  box-shadow: 0 0 8px rgba(56, 189, 248, 0.4);
}

.selector-body {
  margin-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.minimap-wrapper {
  position: relative;
  width: 100%;
  height: 14px;
  background: rgba(15, 23, 42, 0.5);
  border-radius: 3px;
  overflow: hidden;
  cursor: crosshair;
}

.minimap-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.minimap-tooltip {
  position: absolute;
  top: 18px;
  background: rgba(15, 23, 42, 0.95);
  border: 1px solid rgba(56, 189, 248, 0.4);
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  color: #f8fafc;
  pointer-events: none;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(0,0,0,0.5);
  z-index: 30;
}

.minimap-tooltip .tt-title {
  font-weight: 600;
  color: #38bdf8;
}

.minimap-tooltip .tt-desc {
  font-size: 10px;
  color: #94a3b8;
}

.minimap-tooltip .tt-fs {
  font-size: 11px;
  font-weight: 600;
}

.minimap-tooltip .tt-fs.danger { color: #f87171; }
.minimap-tooltip .tt-fs.warning { color: #fbbf24; }
.minimap-tooltip .tt-fs.safe { color: #34d399; }

.pill-slider-container {
  display: flex;
  align-items: center;
  gap: 4px;
}

.step-btn {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #94a3b8;
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.step-btn:hover {
  background: rgba(56, 189, 248, 0.2);
  border-color: #38bdf8;
  color: #ffffff;
}

.pill-slider-track {
  flex: 1;
  display: flex;
  gap: 6px;
  overflow-x: auto;
  scrollbar-width: none;
  padding: 2px 0;
}

.pill-slider-track::-webkit-scrollbar {
  display: none;
}

.segment-pill {
  display: flex;
  align-items: center;
  gap: 4px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 11px;
  color: #cbd5e1;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s ease;
  user-select: none;
}

.segment-pill:hover {
  background: rgba(56, 189, 248, 0.15);
  border-color: #38bdf8;
  color: #ffffff;
}

.segment-pill.active {
  background: #0284c7;
  border-color: #38bdf8;
  color: #ffffff;
  font-weight: 600;
  box-shadow: 0 0 8px rgba(56, 189, 248, 0.6);
}

.all-overview-pill {
  background: rgba(56, 189, 248, 0.08);
  border-color: rgba(56, 189, 248, 0.3);
  color: #38bdf8;
}

.all-overview-pill:hover {
  background: rgba(56, 189, 248, 0.25);
  color: #ffffff;
}

.all-overview-pill.active {
  background: #0284c7;
  border-color: #38bdf8;
  color: #ffffff;
  box-shadow: 0 0 8px rgba(56, 189, 248, 0.6);
}

.pill-index {
  color: #94a3b8;
  font-size: 10px;
}

.segment-pill.active .pill-index {
  color: #e0f2fe;
}

.pill-chain {
  font-family: 'Monaco', 'Consolas', monospace;
}

.pill-badge {
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 6px;
  background: rgba(0, 0, 0, 0.3);
}

.pill-badge.danger { color: #f87171; }
.pill-badge.warning { color: #fbbf24; }
.pill-badge.safe { color: #34d399; }

.no-match-hint {
  font-size: 11px;
  color: #94a3b8;
  padding: 2px 8px;
}

.snap-clip-btn {
  background: rgba(56, 189, 248, 0.15);
  border: 1px solid rgba(56, 189, 248, 0.4);
  color: #38bdf8;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  cursor: pointer;
  width: 100%;
  text-align: center;
  transition: all 0.2s ease;
}

.snap-clip-btn:hover {
  background: rgba(56, 189, 248, 0.3);
  color: #ffffff;
}

/* 右侧控制面板自适应流动栈容器 (杜绝绝对定位硬编码重叠) */
.right-controls-stack {
  position: absolute;
  top: 200px;
  right: 16px;
  z-index: 15;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: calc(100% - 32px);
  overflow-y: auto;
  pointer-events: none;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
}

.right-controls-stack > .glass-card {
  pointer-events: auto;
  position: static;
  min-width: 230px;
  max-width: 280px;
}

/* 探针受力看板样式 */
.probe-tooltip {
  padding: 12px 16px;
  color: #e0e6ed;
  font-size: 13px;
}

.probe-tooltip.collapsed {
  padding: 8px 12px;
}

/* 活动段工程看板样式 */
.segment-hud-card {
  padding: 12px 16px;
  color: #e0e6ed;
  font-size: 13px;
}

.segment-hud-card.collapsed {
  padding: 8px 12px;
}

.unselect-hud-btn {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #94a3b8;
  border-radius: 3px;
  font-size: 10px;
  padding: 1px 5px;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-left: auto;
  margin-right: 4px;
}

.unselect-hud-btn:hover {
  background: rgba(239, 68, 68, 0.2);
  border-color: #ef4444;
  color: #f87171;
}

.tooltip-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.segment-hud-card.collapsed .tooltip-header,
.probe-tooltip.collapsed .tooltip-header {
  margin-bottom: 0;
  padding-bottom: 0;
  border-bottom: none;
}

.pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: #00ff88;
  box-shadow: 0 0 8px #00ff88;
  flex-shrink: 0;
}

.pulse-dot.danger {
  background-color: #ff3366;
  box-shadow: 0 0 8px #ff3366;
}

.tooltip-body {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.metric-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.label {
  color: #8c9ba5;
}

.value {
  font-family: 'Monaco', 'Consolas', monospace;
  font-weight: 600;
  color: #64b5f6;
}

.value.danger {
  color: #ff5252;
}

/* 左侧控制面板自适应流动栈容器 */
.left-controls-stack {
  position: absolute;
  top: 16px;
  left: 16px;
  z-index: 15;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: calc(100% - 32px);
  overflow-y: auto;
  pointer-events: none;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.2) transparent;
}

.left-controls-stack > .glass-card {
  pointer-events: auto;
  position: static;
}

/* 3D 剖切控制面板样式 */
.clipping-panel {
  padding: 12px 16px;
  color: #e0e6ed;
  font-size: 13px;
  min-width: 220px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.panel-title {
  font-weight: 600;
  color: #ffffff;
}

.switch-toggle {
  position: relative;
  display: inline-block;
  width: 36px;
  height: 20px;
}

.switch-toggle input {
  opacity: 0;
  width: 0;
  height: 0;
}

.switch-slider {
  position: absolute;
  cursor: pointer;
  top: 0; left: 0; right: 0; bottom: 0;
  background-color: #3a4250;
  transition: .3s;
  border-radius: 20px;
}

.switch-slider:before {
  position: absolute;
  content: "";
  height: 14px;
  width: 14px;
  left: 3px;
  bottom: 3px;
  background-color: white;
  transition: .3s;
  border-radius: 50%;
}

input:checked + .switch-slider {
  background-color: #00ff88;
}

input:checked + .switch-slider:before {
  transform: translateX(16px);
}

.panel-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.control-row {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.inline-row {
  flex-direction: row;
  justify-content: space-between;
  align-items: center;
}

.control-label {
  font-size: 12px;
  color: #a0aec0;
}

.btn-group {
  display: flex;
  gap: 4px;
}

.axis-btn {
  flex: 1;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #cfd8dc;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  transition: all 0.2s ease;
}

.axis-btn.active {
  background: #1e88e5;
  color: #ffffff;
  border-color: #42a5f5;
  box-shadow: 0 0 8px rgba(30, 136, 229, 0.5);
}

.range-slider {
  width: 100%;
  accent-color: #64b5f6;
  cursor: pointer;
}

/* 排水管径放大会显控制面板样式 */
.pipe-scale-card {
  padding: 12px 16px;
  color: #e0e6ed;
  font-size: 13px;
  min-width: 220px;
}

.pipe-scale-card.collapsed {
  padding: 8px 12px;
}

.scale-badge {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.08);
  color: #cbd5e1;
  font-family: 'Monaco', 'Consolas', monospace;
}

.scale-badge.active {
  background: rgba(56, 189, 248, 0.2);
  border: 1px solid rgba(56, 189, 248, 0.4);
  color: #38bdf8;
  font-weight: 600;
}

.scale-action-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
  margin-top: 4px;
}

.preset-btn-group {
  display: flex;
  gap: 4px;
}

.preset-pill-btn {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #cbd5e1;
  border-radius: 4px;
  font-size: 11px;
  padding: 2px 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.preset-pill-btn:hover {
  background: rgba(56, 189, 248, 0.2);
  border-color: #38bdf8;
  color: #ffffff;
}

.preset-pill-btn.active {
  background: #0284c7;
  border-color: #38bdf8;
  color: #ffffff;
  font-weight: 600;
}

.reset-scale-btn {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #94a3b8;
  border-radius: 4px;
  font-size: 10px;
  padding: 2px 6px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.reset-scale-btn:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.2);
  border-color: #ef4444;
  color: #f87171;
}

.reset-scale-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

/* 图层控制面板样式 */
.layer-panel {
  padding: 12px 16px;
  color: #e0e6ed;
  font-size: 13px;
  min-width: 220px;
}

.layer-group-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.group-toggle-btn {
  font-size: 10px;
  color: #8c9ba5;
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 3px;
  transition: all 0.2s ease;
  user-select: none;
}

.group-toggle-btn:hover {
  color: #00ff88;
  background: rgba(255, 255, 255, 0.08);
}

.sub-layer-container {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 2px;
  margin-bottom: 2px;
}

.collapse-icon {
  font-size: 10px;
  color: #8c9ba5;
  cursor: pointer;
}

.layer-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}

.layer-action-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 2px;
}

.select-all-item {
  font-weight: 600;
}

.select-all-title {
  font-weight: 600;
  color: #00ff88;
}

.quick-btn-group {
  display: flex;
  gap: 4px;
}

.layer-btn {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #cfd8dc;
  padding: 2px 6px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
  transition: all 0.2s ease;
}

.layer-btn:hover {
  background: rgba(0, 255, 136, 0.2);
  border-color: #00ff88;
  color: #ffffff;
}

.layer-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.12);
  margin: 2px 0 4px 0;
}

.layer-item {
  display: flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  font-size: 12px;
  user-select: none;
}

.layer-item input[type="checkbox"] {
  accent-color: #00ff88;
  cursor: pointer;
}

.layer-color-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.lining-dot { background-color: #808080; }
.initial-grouting-dot { background-color: #00ffff; }
.critical-grouting-dot { background-color: #ff6600; }
.pipes-dot { background-color: #2ecc71; }
.env-dot { background-color: #1a5276; }
.particle-dot { background-color: #38bdf8; }
.annotation-dot { background-color: #38bdf8; }
.probe-dot { background-color: #00ff88; }

.inline-between {
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;
}

.left-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mini-anim-btn {
  background: rgba(56, 189, 248, 0.15);
  border: 1px solid rgba(56, 189, 248, 0.4);
  color: #38bdf8;
  border-radius: 4px;
  padding: 2px 6px;
  font-size: 10px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.mini-anim-btn:hover {
  background: rgba(56, 189, 248, 0.3);
  color: #ffffff;
}

.mini-anim-btn.paused {
  background: rgba(245, 158, 11, 0.2);
  border-color: rgba(245, 158, 11, 0.5);
  color: #f59e0b;
}

.sub-layer-item {
  margin-left: 14px;
  font-size: 11px;
  opacity: 0.9;
}

/* 标准视角与测距工具 Toolbar */
.toolbar-panel {
  position: absolute;
  bottom: 16px;
  right: 16px;
  padding: 10px 14px;
  color: #e0e6ed;
  font-size: 12px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 220px;
}

.toolbar-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.section-title {
  font-size: 11px;
  font-weight: 600;
  color: #8c9ba5;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.view-btn-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 4px;
}

.action-btn-row {
  display: flex;
  gap: 6px;
}

.tool-btn {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #d1d5db;
  border-radius: 4px;
  padding: 5px 8px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.tool-btn:hover {
  background: rgba(0, 229, 255, 0.2);
  border-color: #00e5ff;
  color: #ffffff;
}

.tool-btn.active {
  background: #0284c7;
  border-color: #38bdf8;
  color: #ffffff;
  font-weight: 600;
}

.measure-btn.active {
  background: #d97706;
  border-color: #f59e0b;
}

.clear-btn:hover {
  background: rgba(239, 68, 68, 0.3);
  border-color: #ef4444;
}

.toolbar-divider {
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
}

.projection-btn-row {
  display: flex;
  gap: 6px;
}

.proj-btn {
  flex: 1;
  text-align: center;
}

/* 受力表达模式面板样式 */
.force-mode-panel {
  padding: 10px 14px;
  color: #e0e6ed;
  font-size: 12px;
  min-width: 220px;
}

.force-btn-group {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 6px;
  margin-top: 6px;
}

.force-btn-group button {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #cfd8dc;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 600;
  transition: all 0.2s ease;
}

.force-btn-group button:hover {
  background: rgba(0, 229, 255, 0.2);
  border-color: #00e5ff;
  color: #ffffff;
}

.force-btn-group button.active {
  background: #1e88e5;
  color: #ffffff;
  border-color: #42a5f5;
  box-shadow: 0 0 10px rgba(30, 136, 229, 0.6);
}

/* 数值图例与折叠面板扩展样式 */
.legend-container {
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.legend-section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.legend-bar-wrapper {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.color-bar {
  height: 8px;
  border-radius: 4px;
  width: 100%;
}

.k-gradient-bar {
  background: linear-gradient(to right, #ff4d4f 0%, #ff4d4f 33%, #faad14 33%, #faad14 66%, #52c41a 66%, #52c41a 100%);
}

.m-gradient-bar {
  background: linear-gradient(to right, #1890ff, #faad14, #ff5533);
}

.n-gradient-bar {
  background: linear-gradient(to right, #0050b3, #13c2c2, #fa8c16, #f5222d);
}

.combined-gradient-bar {
  background: linear-gradient(to right, #00aaff, #38ef7d, #f12711);
}

.legend-ticks-row, .legend-scale-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 10px;
  color: #a0aec0;
}

.legend-ticks-row .tick.danger { color: #ff4d4f; }
.legend-ticks-row .tick.warning { color: #faad14; }
.legend-ticks-row .tick.safe { color: #52c41a; }

.legend-range-row {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
  color: #cbd5e1;
  margin-top: 2px;
}

.probe-tooltip.collapsed {
  padding: 8px 12px;
}

.state-tab-row {
  display: flex;
  gap: 4px;
  margin-bottom: 6px;
}

.probe-tab-btn {
  flex: 1;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #cfd8dc;
  padding: 3px 6px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
  transition: all 0.2s ease;
}

.probe-tab-btn:hover {
  background: rgba(0, 229, 255, 0.2);
  border-color: #00e5ff;
  color: #ffffff;
}

.probe-tab-btn.active {
  background: #1e88e5;
  color: #ffffff;
  border-color: #42a5f5;
}

/* 排水管径放大会显卡片样式 */
.pipe-scale-card {
  padding: 12px 16px;
  color: #e0e6ed;
  font-size: 13px;
  min-width: 220px;
}

.scale-badge {
  font-size: 11px;
  padding: 2px 6px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.1);
  color: #a0aec0;
  font-weight: 600;
  transition: all 0.2s ease;
}

.scale-badge.active {
  background: rgba(245, 158, 11, 0.2);
  color: #f59e0b;
  border: 1px solid rgba(245, 158, 11, 0.4);
}

.scale-action-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 6px;
  margin-top: 6px;
}

.preset-btn-group {
  display: flex;
  gap: 4px;
  flex: 1;
}

.preset-pill-btn {
  flex: 1;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #cfd8dc;
  padding: 3px 0;
  border-radius: 12px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
  text-align: center;
  transition: all 0.2s ease;
}

.preset-pill-btn:hover {
  background: rgba(245, 158, 11, 0.2);
  border-color: #f59e0b;
  color: #ffffff;
}

.preset-pill-btn.active {
  background: #d97706;
  border-color: #f59e0b;
  color: #ffffff;
  font-weight: 600;
  box-shadow: 0 0 8px rgba(245, 158, 11, 0.5);
}

.reset-scale-btn {
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #e2e8f0;
  padding: 3px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
  transition: all 0.2s ease;
}

.reset-scale-btn:hover:not(:disabled) {
  background: rgba(239, 68, 68, 0.2);
  border-color: #ef4444;
  color: #ffffff;
}

.reset-scale-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
  border-color: transparent;
}
</style>