<!-- frontend/src/components/ui/SnapshotSidebar.vue -->
<template>
  <div class="snapshot-sidebar">
    <!-- 1. 顶部操作与全局动作 -->
    <div class="header">
      <div class="header-title-bar">
        <div class="title-with-badge">
          <h4>工况快照与序列库</h4>
          <span class="count-pill">{{ totalCount }}</span>
        </div>
        <div class="header-actions-row">
          <el-button 
            type="warning" 
            size="small" 
            plain 
            class="header-btn" 
            @click="handleRefresh3D"
            title="重新将已勾选工况装配至 3D 空间隧道"
          >
            <el-icon><Refresh /></el-icon>
            <span class="btn-label">刷新3D</span>
          </el-button>
          <el-button 
            :type="scheduler.isRunning.value ? (scheduler.isPaused.value ? 'warning' : 'danger') : 'success'" 
            size="small" 
            plain 
            class="header-btn"
            :loading="scheduler.isRunning.value && !scheduler.isPaused.value"
            @click="handleToggleBatchCalc"
            :title="scheduler.isRunning.value ? (scheduler.isPaused.value ? '点击继续未完计算' : '点击临时暂停计算') : '启动批量并发计算'"
          >
            <el-icon v-if="!scheduler.isRunning.value"><Opportunity /></el-icon>
            <el-icon v-else-if="scheduler.isPaused.value"><VideoPlay /></el-icon>
            <span class="btn-label">{{ scheduler.isRunning.value ? (scheduler.isPaused.value ? '继续计算' : '暂停计算') : '批量计算' }}</span>
          </el-button>
          <el-button 
            type="primary" 
            size="small" 
            class="header-btn" 
            @click="handleSaveSnapshot"
            title="保存当前输入参数为新工况快照"
          >
            <el-icon><Plus /></el-icon>
            <span class="btn-label">保存快照</span>
          </el-button>
          <el-button 
            type="info" 
            size="small" 
            plain 
            class="header-btn" 
            @click="openBatchArchiveModal(false)"
            title="将当前快照全量批量持久化入库至工程数据库"
          >
            <el-icon><FolderAdd /></el-icon>
            <span class="btn-label">批量入库</span>
          </el-button>
        </div>
      </div>

      <!-- 2. 统计指示栏（Badges）与一键快速过滤 -->
      <div class="stats-bar">
        <div 
          class="stat-chip" 
          :class="{ active: filterStatus === 'all' && filterRisk === 'all' }" 
          @click="resetFilter"
        >
          <span class="chip-dot dot-all"></span>
          <span class="chip-label">总计</span>
          <span class="chip-num">{{ totalCount }}</span>
        </div>
        <div 
          class="stat-chip chip-success" 
          :class="{ active: filterStatus === 'done' }" 
          @click="toggleStatusFilter('done')"
        >
          <span class="chip-dot dot-success"></span>
          <span class="chip-label">已算</span>
          <span class="chip-num">{{ doneCount }}</span>
        </div>
        <div 
          class="stat-chip chip-warning" 
          :class="{ active: filterStatus === 'pending' }" 
          @click="toggleStatusFilter('pending')"
        >
          <span class="chip-dot dot-warning"></span>
          <span class="chip-label">待算</span>
          <span class="chip-num">{{ pendingCount }}</span>
        </div>
        <div 
          class="stat-chip chip-danger" 
          :class="{ active: filterRisk === 'risk' }" 
          @click="toggleRiskFilter('risk')"
        >
          <span class="chip-dot dot-danger"></span>
          <span class="chip-label">预警</span>
          <span class="chip-num">{{ riskCount }}</span>
        </div>
        <div class="stat-chip chip-3d" title="当前参与 3D 空间拼装的区间数">
          <span class="chip-dot dot-3d"></span>
          <span class="chip-label">3D已选</span>
          <span class="chip-num">{{ selected3DCount }}/{{ totalCount }}</span>
        </div>
      </div>

      <!-- 批处理智能监控看板 (Batch Monitor Banner) -->
      <div 
        class="batch-monitor-banner" 
        v-if="scheduler.isRunning.value || scheduler.isPaused.value || hasFailedTasks"
        :class="{ 
          'is-running': scheduler.isRunning.value && !scheduler.isPaused.value, 
          'is-paused': scheduler.isPaused.value,
          'has-failed': hasFailedTasks && !scheduler.isRunning.value
        }"
      >
        <div class="monitor-header">
          <div class="monitor-status">
            <span class="status-indicator">
              <span class="pulse-ring" v-if="scheduler.isRunning.value && !scheduler.isPaused.value"></span>
              <span class="status-dot"></span>
            </span>
            <span class="monitor-title">{{ scheduler.statusText.value }}</span>
          </div>
          <div class="monitor-speed" v-if="scheduler.isRunning.value">
            <el-icon><Clock /></el-icon>
            <span>速度: {{ scheduler.speedText.value }}</span>
          </div>
        </div>

        <div class="monitor-progress-row">
          <el-progress 
            :percentage="scheduler.progressPercent.value" 
            :status="scheduler.progressPercent.value === 100 ? 'success' : scheduler.failedCount.value > 0 ? 'warning' : ''" 
            :stroke-width="6" 
            :show-text="false" 
          />
        </div>

        <div class="monitor-details-row">
          <div class="monitor-counts">
            <span class="count-tag count-done">已完成 {{ scheduler.completedCount.value }}/{{ scheduler.totalTasks.value }}</span>
            <span class="count-tag count-calc" v-if="scheduler.calculatingCount.value > 0">计算中 {{ scheduler.calculatingCount.value }}</span>
            <span class="count-tag count-paused" v-if="scheduler.pausedCount.value > 0">暂停 {{ scheduler.pausedCount.value }}</span>
            <span class="count-tag count-err" v-if="scheduler.failedCount.value > 0">失败 {{ scheduler.failedCount.value }}</span>
          </div>
          <div class="monitor-eta" v-if="scheduler.isRunning.value && !scheduler.isPaused.value">
            <span>预计剩余: <b>{{ scheduler.etaText.value }}</b></span>
          </div>
        </div>

        <!-- 调度控制台操作按钮 -->
        <div class="monitor-actions-row">
          <template v-if="scheduler.isRunning.value && !scheduler.isPaused.value">
            <el-button size="small" type="warning" plain @click="handlePauseBatch">
              <el-icon><VideoPause /></el-icon> 临时暂停
            </el-button>
            <el-button size="small" type="danger" plain @click="handleCancelBatch">
              <el-icon><SwitchButton /></el-icon> 终止计算
            </el-button>
          </template>
          <template v-else-if="scheduler.isPaused.value">
            <el-button size="small" type="success" @click="handleResumeBatch">
              <el-icon><VideoPlay /></el-icon> 继续计算
            </el-button>
            <el-button size="small" type="danger" plain @click="handleCancelBatch">
              <el-icon><SwitchButton /></el-icon> 结束并保留
            </el-button>
          </template>
          <template v-else-if="hasFailedTasks">
            <el-button size="small" type="danger" @click="handleRetryFailed">
              <el-icon><RefreshRight /></el-icon> 重试失败项 ({{ failedCount }})
            </el-button>
            <el-button size="small" type="primary" plain @click="handleStartAllPending">
              <el-icon><Opportunity /></el-icon> 继续计算
            </el-button>
          </template>
        </div>
      </div>


      <!-- 批量导出进度指示条 -->
      <div class="batch-export-box" v-if="isBatchExporting">
        <div class="progress-info">
          <span><el-icon class="is-loading"><Loading /></el-icon> {{ batchExportStatusText }}</span>
          <span class="progress-val">{{ batchExportProgress }}%</span>
        </div>
        <el-progress :percentage="batchExportProgress" status="warning" :stroke-width="5" :show-text="false" />
      </div>

      <!-- 3. 复合搜索与过滤工具栏 -->
      <div class="filter-toolbar">
        <el-input 
          v-model="searchKeyword" 
          placeholder="搜索桩号(如150/K1)或工况备注..." 
          prefix-icon="Search" 
          size="small" 
          clearable 
          class="search-input"
        />

        <div class="filter-controls-row">
          <el-select v-model="filterStatus" placeholder="计算状态" size="small" class="filter-select">
            <el-option label="全部状态" value="all" />
            <el-option label="🟢 已计算" value="done" />
            <el-option label="🟡 待计算" value="pending" />
            <el-option label="🔴 失败" value="error" />
          </el-select>

          <el-select v-model="filterRisk" placeholder="安全风险" size="small" class="filter-select">
            <el-option label="全部风险" value="all" />
            <el-option label="🔴 临界预警 (Fs<2.0)" value="risk" />
            <el-option label="🟢 结构安全 (Fs≥2.0)" value="safe" />
          </el-select>

          <!-- 一键全量折叠/展开开关 -->
          <el-button 
            size="small" 
            :icon="isAllExpanded ? 'Fold' : 'Expand'" 
            @click="toggleAllCollapse"
            class="action-icon-btn"
            :title="isAllExpanded ? '一键折叠全部' : '一键展开全部'"
          >
            {{ isAllExpanded ? '全折叠' : '全展开' }}
          </el-button>

          <!-- 3D 勾选控制菜单 -->
          <el-dropdown trigger="click" @command="handle3DDropdownCommand">
            <el-button size="small" class="action-icon-btn">
              <el-icon><Checked /></el-icon> 3D勾选<el-icon class="el-icon--right"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="select_filtered">勾选当前筛选结果 ({{ filteredSnapshots.length }})</el-dropdown-item>
                <el-dropdown-item command="unselect_filtered">取消筛选结果勾选</el-dropdown-item>
                <el-dropdown-item command="select_all" divided>全选全线所有工况 ({{ snapshots.length }})</el-dropdown-item>
                <el-dropdown-item command="clear_all">清空所有 3D 勾选</el-dropdown-item>
                <el-dropdown-item command="delete_filtered" divided class="danger-menu-item">🗑️ 批量删除当前筛选工况 ({{ filteredSnapshots.length }})</el-dropdown-item>
                <el-dropdown-item command="clear_all_snapshots" class="danger-menu-item">⚠️ 清空全线所有快照</el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>

          <!-- 批量导出功能菜单 -->
          <el-dropdown trigger="click" @command="handleBatchExportCommand">
            <el-button type="primary" plain size="small" class="action-icon-btn batch-export-btn">
              <el-icon><Download /></el-icon> 批量下载<el-icon class="el-icon--right"><ArrowDown /></el-icon>
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="export_blueprints_pdf">
                  📑 批量下载选中施工图 (A3 PDF)
                </el-dropdown-item>
                <el-dropdown-item command="export_blueprints_png">
                  🖼️ 批量下载选中施工图 (PNG)
                </el-dropdown-item>
                <el-dropdown-item command="export_calc_books" divided>
                  📚 批量导出选中计算书
                </el-dropdown-item>
                <el-dropdown-item command="export_all_filtered_calc_books">
                  ⚡ 一键导出当前筛选全部计算书
                </el-dropdown-item>
                <el-dropdown-item command="export_json_raw" divided>
                  💾 批量导出选中计算结果 (JSON)
                </el-dropdown-item>
                <el-dropdown-item command="export_all_filtered_blueprints">
                  ⚡ 一键导出当前筛选全部施工图 (PDF)
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </div>

      <!-- 4. 选中卡片快捷批量操作栏 (当有选中项时自动高亮提示，多级响应式防挤压) -->
      <div class="selected-batch-bar" v-if="selectedCount > 0">
        <div class="batch-bar-left">
          <span class="batch-count-tag">
            <el-icon><CircleCheckFilled /></el-icon>
            已选中 <b>{{ selectedCount }}</b> 个工况
          </span>
          <el-button link type="info" size="small" class="batch-clear-btn" @click="clearSelectedCards">清空</el-button>
        </div>
        <div class="batch-bar-actions">
          <el-button 
            type="success" 
            size="small" 
            plain
            class="batch-quick-btn" 
            @click="openBatchArchiveModal(true)"
            title="将当前已勾选工况批量持久化入库至参数工程库"
          >
            <el-icon><Upload /></el-icon>
            <span class="batch-btn-text">
              <span class="text-full">批量入库</span>
              <span class="text-compact">入库</span>
            </span>
          </el-button>
          <el-button 
            type="warning" 
            size="small" 
            class="batch-quick-btn" 
            :loading="isBatchExporting"
            @click="batchDownloadBlueprints('pdf')"
            title="一键批量下载选中工况的标准 A3 施工设计图 (PDF)"
          >
            <el-icon><PictureFilled /></el-icon>
            <span class="batch-btn-text">
              <span class="text-full">施工图(A3)</span>
              <span class="text-compact">施工图</span>
            </span>
          </el-button>
          <el-button 
            type="primary" 
            size="small" 
            class="batch-quick-btn"
            :loading="isBatchExporting"
            @click="batchExportCalcBooks()"
            title="一键批量并发编译导出选中工况的 A4 标准计算书"
          >
            <el-icon v-if="!isBatchExporting"><DocumentCopy /></el-icon>
            <span class="batch-btn-text">
              <span class="text-full">计算书</span>
              <span class="text-compact">计算书</span>
            </span>
          </el-button>
          <el-button 
            type="danger" 
            size="small" 
            class="batch-quick-btn batch-delete-btn"
            @click="handleBatchDeleteSelected"
            title="一键批量删除当前已勾选的工况快照"
          >
            <el-icon><Delete /></el-icon>
            <span class="batch-btn-text">
              <span class="text-full">批量删除</span>
              <span class="text-compact">删除</span>
            </span>
          </el-button>
        </div>
      </div>
    </div>

    <!-- 5. 快照卡片列表（支持手风琴双态折叠与分页） -->
    <div class="snapshot-list" ref="snapshotListRef">
      <template v-if="filteredSnapshots.length > 0">
        <div 
          v-for="snap in pagedSnapshots" 
          :key="snap.id" 
          class="snapshot-card" 
          :class="{ 
            'is-risk': isRiskSnapshot(snap), 
            'is-active': selectedSnapshotId === snap.id,
            'is-expanded': isCardExpanded(snap.id),
            'is-checked': snap.selectedFor3D
          }"
        >
          <!-- 5.1 紧凑顶栏（折叠态：高度均衡，视觉层次清晰，点击整行支持切换折叠与回溯工况） -->
          <div class="card-compact-header" @click="handleCardHeaderClick(snap.id)">
            <!-- 状态色带/左指示条 -->
            <div class="card-status-stripe" :class="getCardStripeClass(snap)"></div>

            <div class="compact-left">
              <el-checkbox 
                v-model="snap.selectedFor3D" 
                @click.stop="handleCheckboxChange" 
                class="snap-checkbox"
                title="勾选用于批量导出或 3D 空间装配"
              />
              <div class="chainage-capsule">
                <span class="chainage-icon">📏</span>
                <span class="chainage-text">K{{ getChainage(snap, 'start') }} ~ K{{ getChainage(snap, 'end') }}</span>
              </div>
              <span class="snap-remark-text" :title="getSnapRemark(snap)">
                {{ getSnapRemark(snap) }}
              </span>
            </div>

            <div class="compact-right" @click.stop>
              <!-- 安全系数微标 -->
              <div 
                class="fs-pill" 
                :class="getFsClass(getSnapshotFs(snap))" 
                v-if="getSnapshotFs(snap) != null"
                :title="`安全系数 Fs = ${getSnapshotFs(snap)?.toFixed(2)} (${isRiskSnapshot(snap) ? '临界预警' : '结构安全'})`"
              >
                <span class="fs-dot"></span>
                <span class="fs-num"><span class="fs-text-prefix">Fs </span>{{ getSnapshotFs(snap)?.toFixed(2) }}</span>
              </div>

              <!-- 状态标签 -->
              <span class="status-chip" :class="getStatusChipClass(snap)">
                <el-icon v-if="snap.status === 'calculating'" class="is-loading"><Loading /></el-icon>
                {{ snap.status === 'calculating' ? '计算中' : snap.status === 'paused' ? '暂停' : snap.status === 'done' || snap.results ? '已算' : snap.status === 'error' ? '失败' : '待算' }}
              </span>

              <!-- 快速操作图标按钮组 (自适应宽屏直列 / 窄屏收纳) -->
              <div class="compact-quick-actions">
                <!-- 宽屏快捷导出施工图 -->
                <el-dropdown trigger="click" @command="(cmd: any) => handleExportBlueprint(snap, cmd)" class="action-btn-desktop">
                  <button 
                    type="button"
                    class="icon-action-btn blueprint-btn" 
                    title="导出标准 A3 施工设计图 (PDF/PNG)"
                    @click.stop
                  >
                    <el-icon><PictureFilled /></el-icon>
                  </button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="pdf">📑 导出 A3 矢量施工图 (PDF)</el-dropdown-item>
                      <el-dropdown-item command="png">🖼️ 导出高清设计图 (PNG)</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>

                <!-- 宽屏快捷计算书预览与导出 -->
                <el-dropdown trigger="click" @command="(cmd: any) => handleCalcBookAction(snap, cmd)" class="action-btn-desktop">
                  <button 
                    type="button"
                    class="icon-action-btn book-btn" 
                    title="A4 标准防排水设计计算书"
                    @click.stop
                  >
                    <el-icon><Notebook /></el-icon>
                  </button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="preview">👁️ 预览 A4 标准计算书</el-dropdown-item>
                      <el-dropdown-item command="pdf">📥 导出 A4 矢量计算书</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>

                <!-- 窄屏更多操作聚合下拉菜单 -->
                <el-dropdown trigger="click" @command="(cmd: any) => handleCardMoreCommand(snap, cmd)" class="action-btn-mobile">
                  <button 
                    type="button"
                    class="icon-action-btn more-btn" 
                    title="更多操作"
                    @click.stop
                  >
                    <el-icon><MoreFilled /></el-icon>
                  </button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="blueprint_pdf">📑 导出 A3 施工图 (PDF)</el-dropdown-item>
                      <el-dropdown-item command="calcbook_preview">📚 预览 A4 计算书</el-dropdown-item>
                      <el-dropdown-item command="recalc" divided>⚡ 重新计算当前段</el-dropdown-item>
                      <el-dropdown-item command="delete" class="text-danger" divided>🗑️ 删除此快照</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>

                <!-- 手风琴展开/收起切换按钮 -->
                <button 
                  type="button"
                  class="icon-action-btn expand-btn" 
                  :class="{ 'expanded': isCardExpanded(snap.id) }"
                  @click.stop="toggleCardExpand(snap.id)" 
                  :title="isCardExpanded(snap.id) ? '收起详细指标' : '展开详细指标'"
                >
                  <el-icon><ArrowDown /></el-icon>
                </button>

                <!-- 快捷删除 (宽屏常驻) -->
                <button 
                  type="button"
                  class="icon-action-btn delete-btn action-btn-desktop" 
                  @click.stop="handleDeleteSnapshot(snap.id)"
                  title="删除此工况快照"
                >
                  <el-icon><Delete /></el-icon>
                </button>
              </div>
            </div>
          </div>

          <!-- 5.2 深度展开态（详细指标网格与现代化操作胶囊） -->
          <div class="card-expanded-body" v-show="isCardExpanded(snap.id)">
            <div class="results-dashboard" v-if="snap.results">
              <!-- 顶部核心水力安全指标双卡 -->
              <div class="headline-metrics-row">
                <div class="headline-card head-water">
                  <div class="headline-label">💧 原始设计水头</div>
                  <div class="headline-val">{{ snap.results.original_state?.waterHead?.toFixed(2) ?? '-' }} <span class="unit">m</span></div>
                </div>
                <div class="headline-card head-fs" :class="isRiskSnapshot(snap) ? 'is-danger' : 'is-safe'">
                  <div class="headline-label">🛡️ 分区安全系数</div>
                  <div class="headline-val">{{ snap.results.original_state?.safety_factor?.toFixed(2) ?? '-' }}</div>
                </div>
              </div>

              <!-- 4 宫格推荐设计参数卡片 -->
              <div class="metrics-grid">
                <div class="metric-tile">
                  <span class="m-label">环向管间距</span>
                  <div class="m-val">{{ getOrigMetric(snap, 'ring_spacing_recommend')?.toFixed(2) || '-' }} <span class="m-unit">m</span></div>
                </div>
                <div class="metric-tile">
                  <span class="m-label">环向管孔径</span>
                  <div class="m-val">{{ getOrigMetric(snap, 'ring_diam_recommend') != null ? (getOrigMetric(snap, 'ring_diam_recommend') * 1000).toFixed(0) : '-' }} <span class="m-unit">mm</span></div>
                </div>
                <div class="metric-tile">
                  <span class="m-label">横向导水管径</span>
                  <div class="m-val">{{ getOrigMetric(snap, 'lateral_diam_recommend') != null ? (getOrigMetric(snap, 'lateral_diam_recommend') * 1000).toFixed(0) : '-' }} <span class="m-unit">mm</span></div>
                </div>
                <div class="metric-tile">
                  <span class="m-label">分区总涌水量 Q</span>
                  <div class="m-val">{{ (getOrigMetric(snap, 'Q') ?? snap.results.original_state?.q_drain)?.toFixed(2) || '-' }} <span class="m-unit">m³/d</span></div>
                </div>
              </div>

              <!-- 临界超限加固指标卡片（如有） -->
              <div class="critical-reinforce-panel" v-if="snap.results.critical_state">
                <div class="critical-header">
                  <span class="critical-title">⚡ 临界工况加固设计参数</span>
                  <span class="critical-fs-tag">
                    临界 Fs: <b>{{ snap.results.critical_state?.final_safety_factor?.toFixed(2) ?? '-' }}</b>
                  </span>
                </div>
                <div class="metrics-grid critical-grid">
                  <div class="metric-tile crit-tile">
                    <span class="m-label">加固水头</span>
                    <div class="m-val text-crit">{{ snap.results.critical_state?.final_waterHead?.toFixed(2) }} <span class="m-unit">m</span></div>
                  </div>
                  <div class="metric-tile crit-tile">
                    <span class="m-label">临界环向间距</span>
                    <div class="m-val text-crit">{{ getCritMetric(snap, 'ring_spacing_recommend')?.toFixed(2) || '-' }} <span class="m-unit">m</span></div>
                  </div>
                  <div class="metric-tile crit-tile">
                    <span class="m-label">临界环向孔径</span>
                    <div class="m-val text-crit">{{ getCritMetric(snap, 'ring_diam_recommend') != null ? (getCritMetric(snap, 'ring_diam_recommend') * 1000).toFixed(0) : '-' }} <span class="m-unit">mm</span></div>
                  </div>
                  <div class="metric-tile crit-tile">
                    <span class="m-label">临界排涌量 Q</span>
                    <div class="m-val text-crit">{{ (getCritMetric(snap, 'Q') ?? snap.results.critical_state?.final_Q)?.toFixed(2) || '-' }} <span class="m-unit">m³/d</span></div>
                  </div>
                </div>
              </div>
            </div>
            
            <div class="results-dashboard pending-dashboard" v-else>
              <el-icon class="pending-icon"><InfoFilled /></el-icon>
              <span>该工况尚未执行计算引擎，请点击右下角重算或批量计算</span>
            </div>

            <!-- 卡片底部元信息与精美胶囊动作按钮栏 -->
            <div class="card-bottom-bar">
              <div class="time-meta">
                <el-icon><Clock /></el-icon>
                <span>{{ formatTime(snap.timestamp) }}</span>
              </div>

              <!-- 展开态功能胶囊按钮组 -->
              <div class="action-capsules-group">
                <!-- 1. 施工图 -->
                <el-dropdown trigger="click" @command="(cmd: any) => handleExportBlueprint(snap, cmd)">
                  <button 
                    type="button"
                    class="capsule-btn capsule-blueprint" 
                    :disabled="exportingId === snap.id"
                    title="导出标准 A3 施工设计图纸"
                  >
                    <el-icon v-if="exportingId !== snap.id"><PictureFilled /></el-icon>
                    <el-icon v-else class="is-loading"><Loading /></el-icon>
                    <span>施工图</span>
                    <el-icon class="arrow-tiny"><ArrowDown /></el-icon>
                  </button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="pdf">📑 导出 A3 矢量施工图 (PDF)</el-dropdown-item>
                      <el-dropdown-item command="png">🖼️ 导出高清设计图 (PNG)</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>

                <!-- 2. 计算书 -->
                <el-dropdown trigger="click" @command="(cmd: any) => handleCalcBookAction(snap, cmd)">
                  <button 
                    type="button"
                    class="capsule-btn capsule-book" 
                    title="查看与导出 A4 标准工程计算书"
                  >
                    <el-icon><DocumentCopy /></el-icon>
                    <span>计算书</span>
                    <el-icon class="arrow-tiny"><ArrowDown /></el-icon>
                  </button>
                  <template #dropdown>
                    <el-dropdown-menu>
                      <el-dropdown-item command="preview">👁️ 预览标准计算书 </el-dropdown-item>
                      <el-dropdown-item command="pdf">📥 导出标准计算书</el-dropdown-item>
                    </el-dropdown-menu>
                  </template>
                </el-dropdown>

                <!-- 3. 结果JSON -->
                <button 
                  type="button"
                  class="capsule-btn capsule-json" 
                  :disabled="!snap.results?.original_state"
                  title="下载原始计算 JSON 结构体"
                  @click.stop="handleDownloadRaw(snap)"
                >
                  <el-icon><Download /></el-icon>
                  <span>JSON</span>
                </button>

                <!-- 4. 单段重算 -->
                <button 
                  type="button"
                  class="capsule-btn capsule-recalc" 
                  :disabled="isRecalculatingSingle === snap.id"
                  title="重新计算当前工况参数"
                  @click.stop="recalculateSingle(snap)"
                >
                  <el-icon :class="{ 'is-loading': isRecalculatingSingle === snap.id }"><Refresh /></el-icon>
                  <span>重算</span>
                </button>
              </div>
            </div>
          </div>
        </div>

      </template>

      <!-- 空数据状态提示 -->
      <div class="empty-wrap" v-else>
        <el-empty 
          :description="snapshots.length === 0 ? '暂无快照记录，请先在左侧输入参数并保存' : '未找到符合筛选条件的工况快照'" 
          :image-size="70" 
        />
      </div>
    </div>

    <!-- 6. 常驻吸底分页栏 (Sticky Footer, 动态每页条数选择器) -->
    <div class="pagination-footer" v-if="filteredSnapshots.length > 0">
      <el-pagination
        v-model:current-page="currentPage"
        v-model:page-size="pageSize"
        :page-sizes="[5, 10, 15, 20, 50, 100]"
        :total="filteredSnapshots.length"
        layout="total, sizes, prev, pager, next"
        small
        background
        class="compact-pagination"
        @size-change="handlePageSizeChange"
      />
    </div>

    <!-- 7. 计算书 A4 预览与导出模态框 -->
    <CalculationBookModal
      v-model="showCalcBookModal"
      :snapshot="currentCalcBookSnap"
    />

    <!-- 8. 批量入库至工程数据库沉浸式模态弹窗 -->
    <el-dialog
      v-model="batchArchiveModalVisible"
      title="📦 批量入库至参数工程库"
      width="580px"
      destroy-on-close
      class="batch-archive-dialog"
      @open="onBatchArchiveModalOpen"
    >
      <div class="archive-modal-content">
        <!-- 未计算工况入库自适应友好提示 -->
        <el-alert
          v-if="pendingArchiveCount > 0"
          type="warning"
          :closable="false"
          show-icon
          class="archive-pending-alert"
        >
          <template #title>
            <span>包含未计算工况 ({{ pendingArchiveCount }} 项)</span>
          </template>
          <template #default>
            <span>所选工况中包含 {{ pendingArchiveCount }} 项尚未完成计算，将以纯参数工况入库，回载后可随时启动批量计算补齐成果。</span>
          </template>
        </el-alert>

        <el-form :model="archiveForm" label-width="110px" size="default" class="archive-form">
          <el-form-item label="入库范围">
            <el-radio-group v-model="archiveTargetIsSelectedOnly">
              <el-radio :label="false">全量当前快照 ({{ totalCount }} 段)</el-radio>
              <el-radio :label="true" :disabled="selectedCount === 0">仅已勾选快照 ({{ selectedCount }} 段)</el-radio>
            </el-radio-group>
          </el-form-item>

          <el-form-item label="工程组名" required>
            <el-select
              v-model="archiveForm.groupName"
              filterable
              allow-create
              default-first-option
              placeholder="选择既有工程组或输入新工程组名"
              style="width: 100%"
              @change="handleArchiveGroupSelect"
            >
              <el-option
                v-for="grp in existingProjectGroups"
                :key="grp.id"
                :label="`${grp.group_name} (${grp.tunnel_type} · ${grp.segment_count}段)`"
                :value="grp.group_name"
              />
            </el-select>
          </el-form-item>

          <el-form-item label="工程分类" required>
            <el-select 
              v-model="archiveForm.engineeringCategory" 
              placeholder="选择工程交通行业分类" 
              style="width: 100%"
              :disabled="isExistingGroupSelected"
            >
              <el-option label="公路" value="公路" />
              <el-option label="铁路" value="铁路" />
              <el-option label="城市道路" value="城市道路" />
              <el-option label="城市轨道" value="城市轨道" />
              <el-option label="水工" value="水工" />
              <el-option label="综合管廊" value="综合管廊" />
              <el-option label="其他" value="其他" />
            </el-select>
            <span v-if="isExistingGroupSelected" class="cascade-lock-tip">
              🔒 继承自所选工程组分类，不可单独修改
            </span>
          </el-form-item>

          <el-form-item label="重名冲突策略" v-if="isExistingGroupSelected">
            <el-radio-group v-model="archiveForm.conflictMode">
              <el-radio label="overwrite">覆盖更新已有分段</el-radio>
              <el-radio label="append">追加至该工程组</el-radio>
              <el-radio label="create_new">新建独立副本</el-radio>
            </el-radio-group>
          </el-form-item>

          <el-form-item label="分段命名规则">
            <el-select v-model="archiveForm.namingPattern" style="width: 100%">
              <el-option label="标准工程桩号 (推荐: 组名_K0+000~K0+100)" value="standard_station" />
              <el-option label="米制区间紧凑型 (组名 [0m~100m])" value="metric_range" />
              <el-option label="带序号复合型 (组名_#01_K0+000)" value="indexed_station" />
            </el-select>
          </el-form-item>

          <el-form-item label="工程详细描述">
            <el-input 
              v-model="archiveForm.description" 
              type="textarea" 
              :rows="2" 
              placeholder="选填：记录工程地质水文特点、围岩分级与关键设计工况说明..." 
              maxlength="500" 
              show-word-limit 
            />
          </el-form-item>

          <el-form-item label="轻量化脱敏">
            <el-switch v-model="archiveForm.stripCharts" active-text="剔除冗余图表点阵，仅保留物理水力学关键成果 (推荐)" />
          </el-form-item>
        </el-form>

        <!-- 命名实时映射预览列表 -->
        <div class="naming-preview-box">
          <div class="preview-title">
            <span>🏷️ 分段自动序列化命名实时预览 (前 5 段及尾段):</span>
          </div>
          <div class="preview-chips">
            <el-tag 
              v-for="(name, idx) in namingPreviewList" 
              :key="idx" 
              size="small" 
              type="info" 
              effect="plain" 
              class="preview-tag"
            >
              {{ name }}
            </el-tag>
          </div>
        </div>
      </div>

      <template #footer>
        <el-button @click="batchArchiveModalVisible = false">取消</el-button>
        <el-button type="primary" :loading="isArchiving" @click="submitBatchArchive">
          确认入库 (共 {{ targetArchiveSnapshots.length }} 段)
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { useSnapshotStore, type Snapshot } from '@/store/snapshotStore';
import apiClient from '@/api/index';
import { calculateDrainage } from '@/api/index';
import { ElMessage, ElMessageBox, ElNotification } from 'element-plus';
import { 
  Refresh, 
  Download, 
  Search, 
  Checked, 
  Fold, 
  Expand, 
  Delete, 
  ArrowDown, 
  Loading,
  Opportunity,
  Plus,
  CircleCheckFilled,
  PictureFilled,
  DocumentCopy,
  InfoFilled,
  Clock,
  Notebook,
  VideoPlay,
  VideoPause,
  SwitchButton,
  RefreshRight,
  MoreFilled,
  Upload,
  FolderAdd
} from '@element-plus/icons-vue';
import { useParameterStore } from '@/store/parameterStore';
import { exportSnapshotBlueprint } from '@/utils/blueprintGenerator';
import { 
  exportBatchCalculationBooksZip, 
  exportCalculationBookPdf 
} from '@/utils/calculationBook/bookExporter';
import CalculationBookModal from '../calculationBook/CalculationBookModal.vue';
import { globalBatchScheduler } from '@/utils/batchScheduler';

const snapshotStore = useSnapshotStore();
const parameterStore = useParameterStore();
const snapshots = computed(() => snapshotStore.snapshots);
const scheduler = globalBatchScheduler;

// ==========================================
// 1. 过滤与检索状态机
// ==========================================
const searchKeyword = ref('');
const filterStatus = ref<'all' | 'done' | 'pending' | 'error'>('all');
const filterRisk = ref<'all' | 'risk' | 'safe'>('all');
const selectedSnapshotId = ref<string | null>(null);

// 统计指示器
const totalCount = computed(() => snapshots.value.length);
const doneCount = computed(() => snapshots.value.filter(s => s.status === 'done' || s.results).length);
const pendingCount = computed(() => snapshots.value.filter(s => (!s.results && s.status !== 'done') || s.status === 'pending' || s.status === 'paused').length);
const failedCount = computed(() => snapshots.value.filter(s => s.status === 'error').length);
const hasFailedTasks = computed(() => failedCount.value > 0);
const riskCount = computed(() => snapshots.value.filter(s => {
  const fs = getSnapshotFs(s);
  return fs != null && fs < 2.0;
}).length);
const selected3DCount = computed(() => snapshots.value.filter(s => s.selectedFor3D).length);
const selectedCount = computed(() => snapshots.value.filter(s => s.selectedFor3D).length);


// 快捷切换过滤
const resetFilter = () => {
  filterStatus.value = 'all';
  filterRisk.value = 'all';
  searchKeyword.value = '';
};

const toggleStatusFilter = (status: 'done' | 'pending' | 'error') => {
  filterStatus.value = filterStatus.value === status ? 'all' : status;
};

const toggleRiskFilter = (risk: 'risk' | 'safe') => {
  filterRisk.value = filterRisk.value === risk ? 'all' : risk;
};

// 提取安全系数 Fs
function getSnapshotFs(snap: any): number | null {
  if (!snap.results) return null;
  return snap.results.original_state?.safety_factor ?? snap.results.critical_state?.final_safety_factor ?? null;
}

function isRiskSnapshot(snap: any): boolean {
  const fs = getSnapshotFs(snap);
  return fs != null && fs < 2.0;
}

// 核心多维复合过滤管道
const filteredSnapshots = computed(() => {
  return snapshots.value.filter((snap: any) => {
    // 1. 状态匹配
    if (filterStatus.value === 'done' && !(snap.status === 'done' || snap.results)) return false;
    if (filterStatus.value === 'pending' && (snap.results || snap.status === 'error')) return false;
    if (filterStatus.value === 'error' && snap.status !== 'error') return false;

    // 2. 风险匹配
    if (filterRisk.value !== 'all') {
      const fs = getSnapshotFs(snap);
      if (filterRisk.value === 'risk' && (fs == null || fs >= 2.0)) return false;
      if (filterRisk.value === 'safe' && (fs == null || fs < 2.0)) return false;
    }

    // 3. 关键字/桩号搜索匹配
    if (searchKeyword.value.trim()) {
      const kw = searchKeyword.value.trim().toLowerCase();
      const remark = String(snap.remark || '').toLowerCase();
      const startChain = String(getChainage(snap, 'start'));
      const endChain = String(getChainage(snap, 'end'));
      const chainText = `k${startChain}~k${endChain}`.toLowerCase();

      // 数字纯数值桩号区间模糊匹配
      const kwNum = parseFloat(kw.replace(/[^\d.]/g, ''));
      let matchNumber = false;
      if (!isNaN(kwNum)) {
        const sNum = parseFloat(startChain);
        const eNum = parseFloat(endChain);
        if (!isNaN(sNum) && !isNaN(eNum)) {
          matchNumber = kwNum >= sNum && kwNum <= eNum;
        }
      }

      const matchText = remark.includes(kw) || chainText.includes(kw) || startChain.includes(kw) || endChain.includes(kw);
      if (!matchText && !matchNumber) return false;
    }

    return true;
  });
});

// ==========================================
// 2. 分页控制 (支持个性化每页条数持久化与动态调节)
// ==========================================
const PAGE_SIZE_KEY = 'tunnel_snapshot_sidebar_page_size';
const getStoredPageSize = (): number => {
  try {
    const v = localStorage.getItem(PAGE_SIZE_KEY);
    if (v) {
      const parsed = parseInt(v, 10);
      if (!isNaN(parsed) && parsed > 0) return parsed;
    }
  } catch (_) {}
  return 10; // 默认 10 条，避免屏幕高度受限时过度纵向堆叠
};

const currentPage = ref(1);
const pageSize = ref(getStoredPageSize());

const handlePageSizeChange = (size: number) => {
  pageSize.value = size;
  try {
    localStorage.setItem(PAGE_SIZE_KEY, String(size));
  } catch (_) {}
  currentPage.value = 1;
};

// 过滤条件变动时自动重置至第一页
watch([searchKeyword, filterStatus, filterRisk], () => {
  currentPage.value = 1;
});

const pagedSnapshots = computed(() => {
  const start = (currentPage.value - 1) * pageSize.value;
  return filteredSnapshots.value.slice(start, start + pageSize.value);
});

// ==========================================
// 3. 单卡片折叠与全量折叠状态机
// ==========================================
const expandedMap = ref<Record<string, boolean>>({});

// 是否处于全展开状态
const isAllExpanded = computed(() => {
  if (filteredSnapshots.value.length === 0) return false;
  return filteredSnapshots.value.every((s: any) => Boolean(expandedMap.value[s.id]));
});

// 判断单卡片是否展开
const isCardExpanded = (id: string): boolean => {
  return Boolean(expandedMap.value[id]);
};

// 单卡片切换展开/折叠
const toggleCardExpand = (id: string) => {
  expandedMap.value = {
    ...expandedMap.value,
    [id]: !expandedMap.value[id]
  };
};

// 点击卡片头部：同时触发回溯与切换展开并同步 3D 聚焦段
const handleCardHeaderClick = (id: string) => {
  snapshotStore.setActiveSegment(id);
  restoreSnapshot(id);
  toggleCardExpand(id);
};

// 监听 3D 视图发起的活动分段切换，同步侧边栏选中态
watch(
  () => snapshotStore.activeSegmentId,
  (newId) => {
    if (newId && newId !== selectedSnapshotId.value) {
      selectedSnapshotId.value = newId;
    }
  }
);

// 全量展开/折叠切换
const toggleAllCollapse = () => {
  const targetState = !isAllExpanded.value;
  const nextMap: Record<string, boolean> = { ...expandedMap.value };
  filteredSnapshots.value.forEach((s: any) => {
    nextMap[s.id] = targetState;
  });
  expandedMap.value = nextMap;
};

// 清空所有卡片选中
const clearSelectedCards = () => {
  snapshots.value.forEach((s: any) => s.selectedFor3D = false);
  snapshotStore.saveToLocal();
  ElMessage.info('已清空所选工况卡片');
};

// ==========================================
// 4. 批量 3D 勾选控制
// ==========================================
const handleCheckboxChange = () => {
  snapshotStore.saveToLocal();
};

const handle3DDropdownCommand = (cmd: string) => {
  if (cmd === 'select_filtered') {
    filteredSnapshots.value.forEach((s: any) => s.selectedFor3D = true);
    ElMessage.success(`已勾选当前筛选的 ${filteredSnapshots.value.length} 个工况`);
    snapshotStore.saveToLocal();
  } else if (cmd === 'unselect_filtered') {
    filteredSnapshots.value.forEach((s: any) => s.selectedFor3D = false);
    ElMessage.info(`已取消当前筛选工况勾选`);
    snapshotStore.saveToLocal();
  } else if (cmd === 'select_all') {
    snapshots.value.forEach((s: any) => s.selectedFor3D = true);
    ElMessage.success(`已全选所有 ${snapshots.value.length} 个工况`);
    snapshotStore.saveToLocal();
  } else if (cmd === 'clear_all') {
    snapshots.value.forEach((s: any) => s.selectedFor3D = false);
    ElMessage.info('已清空全部工况勾选');
    snapshotStore.saveToLocal();
  } else if (cmd === 'delete_filtered') {
    const ids = filteredSnapshots.value.map((s: any) => s.id);
    if (ids.length === 0) {
      ElMessage.warning('当前筛选结果为空，无可删除工况');
      return;
    }
    ElMessageBox.confirm(
      `确定要删除当前筛选出的 ${ids.length} 个工况快照吗？删除后数据不可恢复。`,
      '批量删除当前筛选工况',
      {
        confirmButtonText: '确定删除',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger'
      }
    ).then(() => {
      snapshotStore.batchDeleteSnapshots(ids);
      ElMessage.success(`已批量删除筛选出的 ${ids.length} 个工况快照`);
      currentPage.value = 1;
    }).catch(() => { });
  } else if (cmd === 'clear_all_snapshots') {
    if (snapshots.value.length === 0) {
      ElMessage.info('当前快照库已为空');
      return;
    }
    ElMessageBox.confirm(
      `【高危警告】确定要清空全线所有 ${snapshots.value.length} 个工况快照吗？删除后所有历史计算结果与 3D 拼装数据将被彻底清除！`,
      '清空全线快照',
      {
        confirmButtonText: '彻底清空',
        cancelButtonText: '取消',
        type: 'error',
        confirmButtonClass: 'el-button--danger'
      }
    ).then(() => {
      snapshotStore.clearAllSnapshots();
      ElMessage.success('全线快照已全部清空');
      currentPage.value = 1;
    }).catch(() => { });
  }
};

// ==========================================
// 5. 批处理调度与多态断点控制
// ==========================================
const handleToggleBatchCalc = () => {
  if (scheduler.isRunning.value && !scheduler.isPaused.value) {
    scheduler.pause();
    ElMessage.info('已临时暂停批量计算，网络请求已取消并保留已有成果');
  } else if (scheduler.isPaused.value) {
    scheduler.resume();
    ElMessage.success('正在接续未完成工况计算...');
  } else {
    handleStartBatch();
  }
};

const handleStartBatch = () => {
  const pendingSnaps = snapshots.value.filter(
    (s: any) => s.status === 'pending' || s.status === 'paused' || (!s.results && s.status !== 'done')
  );
  if (pendingSnaps.length === 0) {
    ElMessage.success('序列库中所有工况均已计算完成，无需重复计算');
    return;
  }
  ElMessage.info(`启动多核并发批量计算，待计算工况共 ${pendingSnaps.length} 项...`);
  scheduler.start();
};

const handlePauseBatch = () => {
  scheduler.pause();
  ElMessage.warning('批量计算已暂停，网络请求已取消并保留已有成果');
};

const handleResumeBatch = () => {
  scheduler.resume();
  ElMessage.success('正在继续批量计算...');
};

const handleCancelBatch = () => {
  scheduler.cancel();
  ElMessage.info('已终止批量计算任务');
};

const handleRetryFailed = () => {
  const failList = snapshots.value.filter((s: any) => s.status === 'error');
  if (failList.length === 0) {
    ElMessage.info('当前没有失败工况');
    return;
  }
  ElMessage.info(`开始重试 ${failList.length} 项失败工况...`);
  scheduler.retryFailed();
};

const handleStartAllPending = () => {
  scheduler.start();
};

const isRecalculatingSingle = ref<string | null>(null);

// 单段重新计算
const recalculateSingle = async (snap: any) => {
  try {
    isRecalculatingSingle.value = snap.id;
    snap.status = 'calculating';
    ElMessage.info(`开始重新计算区间 ${getSnapRemark(snap)}...`);
    const payload = snap.params || {};
    const res = await calculateDrainage(payload, { timeout: 120000 });
    snap.results = res;
    snap.status = 'done';
    snap.hasCriticalState = Boolean(res?.critical_state && Object.keys(res.critical_state).length > 0);
    snapshotStore.saveToLocal();
    ElMessage.success(`区间 ${getSnapRemark(snap)} 重算完成`);
  } catch (err: any) {
    ElMessage.error(`重算失败: ${err.message || err}`);
    snap.status = 'error';
  } finally {
    isRecalculatingSingle.value = null;
  }
};


// ==========================================
// 6. 批量下载施工图与计算书功能
// ==========================================
const isBatchExporting = ref(false);
const batchExportProgress = ref(0);
const batchExportStatusText = ref('');

// 批量下载选中施工图 (PDF / PNG)
const batchDownloadBlueprints = async (format: 'pdf' | 'png' = 'pdf', targetSnaps?: any[]) => {
  const selected = targetSnaps || snapshots.value.filter((s: any) => s.selectedFor3D);
  if (selected.length === 0) {
    ElMessage.warning('请先勾选需要导出施工图的工况卡片');
    return;
  }

  // 下游报告导出安全状态门禁
  const validSnaps = selected.filter((s: any) => s.results || s.status === 'done');
  if (validSnaps.length === 0) {
    ElMessageBox.alert(
      '所选工况均尚未完成水力与结构计算，缺乏涌水量 Q 与衬砌安全系数 Fs 等核心指标，无法生成合规工程图纸。请在侧边栏点击“开始计算”或“批量计算”后再行导出。',
      '导出受限提示',
      { type: 'warning', confirmButtonText: '知道了' }
    );
    return;
  }

  isBatchExporting.value = true;
  batchExportProgress.value = 0;
  let successCount = 0;
  let failCount = 0;

  try {
    for (let i = 0; i < selected.length; i++) {
      const snap = selected[i];
      batchExportStatusText.value = `正在生成 A3 施工图 (${i + 1}/${selected.length}): ${getSnapRemark(snap)}...`;
      batchExportProgress.value = Math.round(((i + 1) / selected.length) * 100);

      try {
        await exportSnapshotBlueprint(snap, format);
        successCount++;
        // 间隔 250ms 释放事件循环并避免多文件并发触发浏览器弹窗阻塞
        await new Promise(r => setTimeout(r, 250));
      } catch (e) {
        console.error(`导出快照 ${snap.id} 施工图失败:`, e);
        failCount++;
      }
    }

    if (failCount === 0) {
      ElNotification({
        title: '批量导出成功',
        message: `已成功导出 ${successCount} 份 A3 标准施工设计图 (${format.toUpperCase()})`,
        type: 'success',
        duration: 3500
      });
    } else {
      ElNotification({
        title: '批量导出完成',
        message: `成功导出 ${successCount} 份，失败 ${failCount} 份`,
        type: 'warning',
        duration: 4000
      });
    }
  } finally {
    isBatchExporting.value = false;
    batchExportProgress.value = 0;
    batchExportStatusText.value = '';
  }
};

// 批量导出计算书 (基于 Typst 编译引擎生成 ZIP 或单份 PDF)
const batchExportCalcBooks = async (targetSnaps?: any[]) => {
  const selected = targetSnaps || snapshots.value.filter((s: any) => s.selectedFor3D);
  if (selected.length === 0) {
    ElMessage.warning('请先勾选需要导出计算书的工况卡片');
    return;
  }

  // 下游报告导出安全状态门禁
  const validSnaps = selected.filter((s: any) => s.results || s.status === 'done');
  if (validSnaps.length === 0) {
    ElMessageBox.alert(
      '所选工况均尚未完成水力与结构计算，缺乏涌水量 Q 与衬砌安全系数 Fs 等核心指标，无法生成合规计算书。请在侧边栏点击“开始计算”或“批量计算”后再行导出。',
      '导出受限提示',
      { type: 'warning', confirmButtonText: '知道了' }
    );
    return;
  }

  // 单份工况：直接调用 Typst 引擎极速下载单个 PDF
  if (validSnaps.length === 1) {
    try {
      isBatchExporting.value = true;
      batchExportStatusText.value = `正在调用 Typst 引擎编译计算书: ${getSnapRemark(validSnaps[0])}...`;
      batchExportProgress.value = 50;
      const pdfName = await exportCalculationBookPdf(validSnaps[0]);
      batchExportProgress.value = 100;
      ElNotification({
        title: '计算书导出成功',
        message: `已通过 Typst 引擎成功编译并下载: ${pdfName}`,
        type: 'success',
        duration: 3500
      });
    } catch (err: any) {
      console.error('导出计算书 PDF 失败:', err);
      ElMessage.error(`导出计算书失败: ${err.message || err}`);
    } finally {
      isBatchExporting.value = false;
      batchExportProgress.value = 0;
      batchExportStatusText.value = '';
    }
    return;
  }

  // 多工况批量导出：并发编译并直接打包下载 ZIP
  try {
    isBatchExporting.value = true;
    batchExportStatusText.value = `正在并发调度 Typst 引擎编译 ${validSnaps.length} 份计算书并打包 ZIP...`;
    batchExportProgress.value = 40;

    const zipFilename = await exportBatchCalculationBooksZip(validSnaps);
    batchExportProgress.value = 100;
    
    ElNotification({
      title: '批量计算书导出成功',
      message: `已成功生成包含 ${validSnaps.length} 份 A4 独立计算书的 ZIP 压缩包: ${zipFilename}`,
      type: 'success',
      duration: 4500
    });
  } catch (err: any) {
    console.error('批量导出计算书 ZIP 失败:', err);
    ElMessage.error(`批量导出计算书失败: ${err.message || err}`);
  } finally {
    isBatchExporting.value = false;
    batchExportProgress.value = 0;
    batchExportStatusText.value = '';
  }
};

// 批量导出全部选中 JSON
const batchDownloadRawJson = () => {
  const selected = snapshots.value.filter((s: any) => s.selectedFor3D && s.results);
  if (selected.length === 0) {
    ElMessage.warning('请先勾选包含有效计算成果的工况卡片');
    return;
  }

  const bundleData = selected.map((s: any) => ({
    id: s.id,
    remark: s.remark,
    start_chainage: getChainage(s, 'start'),
    end_chainage: getChainage(s, 'end'),
    params: s.params,
    results: s.results,
    timestamp: s.timestamp
  }));

  const dataStr = JSON.stringify(bundleData, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Batch_Drainage_Results_${selected.length}Segments_${Date.now().toString().slice(-6)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  ElMessage.success(`已打包下载 ${selected.length} 个工况的完整计算结果 JSON`);
};

// 处理批量菜单命令
const handleBatchExportCommand = (cmd: string) => {
  if (cmd === 'export_blueprints_pdf') {
    batchDownloadBlueprints('pdf');
  } else if (cmd === 'export_blueprints_png') {
    batchDownloadBlueprints('png');
  } else if (cmd === 'export_calc_books') {
    batchExportCalcBooks();
  } else if (cmd === 'export_all_filtered_calc_books') {
    if (filteredSnapshots.value.length === 0) {
      ElMessage.warning('当前筛选结果为空');
      return;
    }
    batchExportCalcBooks(filteredSnapshots.value);
  } else if (cmd === 'export_json_raw') {
    batchDownloadRawJson();
  } else if (cmd === 'export_all_filtered_blueprints') {
    if (filteredSnapshots.value.length === 0) {
      ElMessage.warning('当前筛选结果为空');
      return;
    }
    batchDownloadBlueprints('pdf', filteredSnapshots.value);
  }
};

// ==========================================
// 7. 辅助工具与指标提取
// ==========================================
const getChainage = (snap: any, type: 'start' | 'end') => {
  const key = type === 'start' ? 'start_chainage' : 'end_chainage';
  return snap.results?.input_parameter?.[key] ?? snap.params?.[key] ?? snap[key] ?? '0';
};

const getSnapRemark = (snap: any) => {
  return (snap.remark && typeof snap.remark === 'string') ? snap.remark : '计算快照工况';
};

const getOrigMetric = (snap: any, key: string) => {
  if (!snap.results) return null;
  const orig = snap.results.original_state;
  return orig?.[key] ?? snap.results?.input_parameter?.[key] ?? null;
};

const getCritMetric = (snap: any, key: string) => {
  if (!snap.results || !snap.results.critical_state) return null;
  const crit = snap.results.critical_state;
  return crit?.[key] ?? null;
};

const getFsClass = (fs: number | null) => {
  if (fs == null) return '';
  return fs < 2.0 ? 'fs-danger' : 'fs-safe';
};

const getCardStripeClass = (snap: any) => {
  if (snap.status === 'calculating') return 'stripe-calculating';
  if (snap.status === 'paused') return 'stripe-paused';
  if (snap.status === 'error') return 'stripe-error';
  const fs = getSnapshotFs(snap);
  if (fs != null && fs < 2.0) return 'stripe-risk';
  if (snap.status === 'done' || snap.results) return 'stripe-done';
  return 'stripe-pending';
};

const getStatusChipClass = (snap: any) => {
  if (snap.status === 'calculating') return 'chip-tag-calculating';
  if (snap.status === 'paused') return 'chip-tag-paused';
  if (snap.status === 'error') return 'chip-tag-error';
  if (snap.status === 'done' || snap.results) return 'chip-tag-done';
  return 'chip-tag-pending';
};


const handleRefresh3D = () => {
  parameterStore.isDirty = false;
  snapshotStore.refresh3DTrigger = (snapshotStore.refresh3DTrigger || 0) + 1;
  ElMessage.success('3D 空间隧道计算结果已重新装配');
};

const restoreSnapshot = (id: string) => {
  selectedSnapshotId.value = id;
  snapshotStore.applySnapshot(id);
  parameterStore.isDirty = false; 
  const snap = snapshots.value.find((s: any) => s.id === id);
  if (!snap || !snap.results) {
    ElMessage.warning('已加载历史参数，但该工况暂无计算成果，请执行云计算');
  } else {
    ElMessage.info('已回溯至选定工况，参数与三维结果已同步');
  }
};

const formatTime = (ts: number) => {
  return new Date(ts).toLocaleString('zh-CN', { 
    month: '2-digit', 
    day: '2-digit', 
    hour: '2-digit', 
    minute: '2-digit', 
    second: '2-digit',
    hour12: false 
  });
};

const exportingId = ref<string | null>(null);

// 计算书预览模态框控制
const showCalcBookModal = ref(false);
const currentCalcBookSnap = ref<any>(null);

const handleOpenCalcBook = (snap: any) => {
  if (!snap.results && snap.status !== 'done') {
    ElMessage.warning('该工况尚未完成计算，请先执行计算后再查看计算书');
    return;
  }
  currentCalcBookSnap.value = snap;
  showCalcBookModal.value = true;
};

const handleCalcBookAction = async (snap: any, cmd: 'preview' | 'pdf' = 'preview') => {
  // 下游报告导出安全状态门禁
  if (snap.status === 'pending' || !snap.results) {
    ElMessageBox.alert(
      `工况 [${getSnapRemark(snap)}] 尚未执行水力与结构计算，缺乏涌水量 Q 与衬砌安全系数 Fs 等核心验算指标，无法生成合规工程计算书。请在侧边栏点击“开始计算”或“批量计算”后再行导出。`,
      '导出受限提示',
      { type: 'warning', confirmButtonText: '知道了' }
    );
    return;
  }
  if (cmd === 'preview') {
    handleOpenCalcBook(snap);
  } else if (cmd === 'pdf') {
    try {
      isBatchExporting.value = true;
      batchExportStatusText.value = `正在调用 Typst 引擎编译 ${getSnapRemark(snap)} A4 计算书...`;
      batchExportProgress.value = 50;
      const pdfName = await exportCalculationBookPdf(snap);
      batchExportProgress.value = 100;
      ElNotification({
        title: '计算书导出成功',
        message: `已成功生成高保真矢量计算书: ${pdfName}`,
        type: 'success',
        duration: 3500
      });
    } catch (err: any) {
      console.error('导出计算书 PDF 失败:', err);
      ElMessage.error(`导出计算书失败: ${err.message || err}`);
    } finally {
      isBatchExporting.value = false;
      batchExportProgress.value = 0;
      batchExportStatusText.value = '';
    }
  }
};

const handleExportBlueprint = async (snap: any, format: 'pdf' | 'png' = 'pdf') => {
  // 下游报告导出安全状态门禁
  if (snap.status === 'pending' || !snap.results) {
    ElMessageBox.alert(
      `工况 [${getSnapRemark(snap)}] 尚未执行水力与结构计算，缺乏涌水量 Q 与衬砌安全系数 Fs 等核心验算指标，无法生成合规工程图纸。请在侧边栏点击“开始计算”或“批量计算”后再行导出。`,
      '导出受限提示',
      { type: 'warning', confirmButtonText: '知道了' }
    );
    return;
  }
  try {
    exportingId.value = snap.id;
    ElMessage.info(`正在生成 ${format.toUpperCase()} 标准 A3 施工设计图，请稍候...`);
    await new Promise((resolve) => setTimeout(resolve, 50));
    await exportSnapshotBlueprint(snap, format);
    ElMessage.success(`施工设计图已成功导出 (${format.toUpperCase()})`);
  } catch (err: any) {
    console.error('导出施工设计图失败:', err);
    ElMessage.error(`导出施工图失败: ${err.message || err}`);
  } finally {
    exportingId.value = null;
  }
};

// ==========================================
// 8. 批量入库至参数工程库弹窗状态机
// ==========================================
const batchArchiveModalVisible = ref(false);
const isArchiving = ref(false);
const archiveTargetIsSelectedOnly = ref(false);
const existingProjectGroups = ref<any[]>([]);

const archiveForm = ref<{
  groupName: string;
  engineeringCategory: "公路" | "铁路" | "城市道路" | "城市轨道" | "水工" | "综合管廊" | "其他";
  description: string;
  namingPattern: "standard_station" | "metric_range" | "indexed_station";
  conflictMode: "append" | "overwrite" | "create_new";
  stripCharts: boolean;
}>({
  groupName: '晏家隧道',
  engineeringCategory: '公路',
  description: '',
  namingPattern: 'standard_station',
  conflictMode: 'overwrite',
  stripCharts: true
});

const isExistingGroupSelected = computed(() => {
  return existingProjectGroups.value.some(g => g.group_name === archiveForm.value.groupName);
});

const targetArchiveSnapshots = computed(() => {
  return archiveTargetIsSelectedOnly.value
    ? snapshots.value.filter(s => s.selectedFor3D)
    : snapshots.value;
});

const pendingArchiveCount = computed(() => {
  return targetArchiveSnapshots.value.filter(s => s.status === 'pending' || !s.results).length;
});

const onBatchArchiveModalOpen = async () => {
  try {
    const res: any = await apiClient.get('/database/projects');
    existingProjectGroups.value = res || [];
  } catch (e) {
    existingProjectGroups.value = [];
  }
};

const openBatchArchiveModal = (isSelectedOnly = false) => {
  if (isSelectedOnly && selectedCount.value === 0) {
    ElMessage.warning('请先勾选需要入库的工况卡片');
    return;
  }
  if (!isSelectedOnly && snapshots.value.length === 0) {
    ElMessage.warning('当前快照库为空，无可入库工况');
    return;
  }
  archiveTargetIsSelectedOnly.value = isSelectedOnly;
  batchArchiveModalVisible.value = true;
};

const handleArchiveGroupSelect = (val: string) => {
  const matched = existingProjectGroups.value.find(g => g.group_name === val);
  if (matched) {
    archiveForm.value.engineeringCategory = matched.tunnel_type;
    archiveForm.value.description = matched.description || '';
  }
};

const formatStationStr = (length_m: number): string => {
  const km = Math.floor(length_m / 1000);
  const m = Math.round(length_m % 1000);
  return `K${km}+${String(m).padStart(3, '0')}`;
};

const namingPreviewList = computed(() => {
  const list = targetArchiveSnapshots.value;
  if (!list || list.length === 0) return ['暂无分段'];
  const grp = archiveForm.value.groupName || '未命名工程';
  const pattern = archiveForm.value.namingPattern;

  const formatOne = (snap: any, idx: number) => {
    const s = Number(getChainage(snap, 'start')) || 0;
    const e = Number(getChainage(snap, 'end')) || (s + 10);
    if (pattern === 'metric_range') {
      return `${grp} [${s.toFixed(1)}m~${e.toFixed(1)}m]`;
    } else if (pattern === 'indexed_station') {
      return `${grp}_#${String(idx + 1).padStart(2, '0')}_${formatStationStr(s)}`;
    } else {
      return `${grp}_${formatStationStr(s)}~${formatStationStr(e)}`;
    }
  };

  if (list.length <= 6) {
    return list.map((s, i) => formatOne(s, i));
  }
  const head = list.slice(0, 5).map((s, i) => formatOne(s, i));
  const tail = formatOne(list[list.length - 1], list.length - 1);
  return [...head, `... (省略中间 ${list.length - 6} 段) ...`, tail];
});

const submitBatchArchive = async () => {
  if (!archiveForm.value.groupName.trim()) {
    ElMessage.warning('工程组名不能为空');
    return;
  }
  const targets = targetArchiveSnapshots.value;
  if (targets.length === 0) {
    ElMessage.warning('入库分段集合为空');
    return;
  }

  isArchiving.value = true;
  try {
    const res: any = await snapshotStore.batchArchiveToDatabase({
      groupName: archiveForm.value.groupName.trim(),
      engineeringCategory: archiveForm.value.engineeringCategory,
      description: archiveForm.value.description,
      namingPattern: archiveForm.value.namingPattern,
      conflictMode: archiveForm.value.conflictMode,
      stripCharts: archiveForm.value.stripCharts
    }, targets);

    ElNotification({
      title: '批量入库成功',
      message: `已成功将 ${res.segment_count} 个分段写入工程组 [${res.group_name}]（已算: ${res.calculated_count}，待算: ${res.segment_count - res.calculated_count}）`,
      type: 'success',
      duration: 4500
    });
    batchArchiveModalVisible.value = false;
  } catch (err: any) {
    const detail = err.response?.data?.detail || err.message || '未知错误';
    ElMessage.error(`批量入库失败: ${detail}`);
  } finally {
    isArchiving.value = false;
  }
};

const handleDownloadRaw = (snap: any) => {
  if (!snap.results || !snap.results.original_state) {
    ElMessage.warning('无有效计算数据可供下载');
    return;
  }
  const dataStr = JSON.stringify(snap.results, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Result_${snap.remark || 'Export'}_${snap.id.slice(0, 5)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
  ElMessage.success('原始计算数据已准备下载');
};

const handleSaveSnapshot = () => {
  ElMessageBox.prompt('请输入该工况快照的备注说明', '保存快照', {
    confirmButtonText: '确定',
    cancelButtonText: '取消',
    inputPlaceholder: '例如：DK100~DK200 富水断层注浆段'
  }).then(({ value }) => {
    snapshotStore.createSnapshot(value);
    ElMessage.success('工况参数快照保存成功');
  }).catch(() => { });
};

const handleDeleteSnapshot = (id: string) => {
  ElMessageBox.confirm('确定要删除该工况快照吗？删除后不可恢复。', '删除工况确认', {
    confirmButtonText: '确定删除',
    cancelButtonText: '取消',
    type: 'warning',
  }).then(() => {
    snapshotStore.deleteSnapshot(id);
    ElMessage.success('快照已删除');
  }).catch(() => { });
};

// 批量删除已选快照
const handleBatchDeleteSelected = () => {
  const selectedIds = snapshots.value.filter((s: any) => s.selectedFor3D).map((s: any) => s.id);
  if (selectedIds.length === 0) {
    ElMessage.warning('请先勾选需要删除的工况快照');
    return;
  }
  ElMessageBox.confirm(
    `确定要批量删除已选中的 ${selectedIds.length} 个工况快照吗？删除后对应桩号分段与计算数据将不可恢复。`,
    '批量删除确认',
    {
      confirmButtonText: '确定删除',
      cancelButtonText: '取消',
      type: 'warning',
      confirmButtonClass: 'el-button--danger'
    }
  ).then(() => {
    snapshotStore.batchDeleteSnapshots(selectedIds);
    ElMessage.success(`已批量删除 ${selectedIds.length} 个工况快照`);
    if (currentPage.value > Math.ceil(filteredSnapshots.value.length / pageSize.value)) {
      currentPage.value = Math.max(1, Math.ceil(filteredSnapshots.value.length / pageSize.value));
    }
  }).catch(() => { });
};

// 卡片紧凑态收敛菜单操作
const handleCardMoreCommand = (snap: any, cmd: string) => {
  if (cmd === 'blueprint_pdf') {
    handleExportBlueprint(snap, 'pdf');
  } else if (cmd === 'calcbook_preview') {
    handleCalcBookAction(snap, 'preview');
  } else if (cmd === 'recalc') {
    recalculateSingle(snap);
  } else if (cmd === 'delete') {
    handleDeleteSnapshot(snap.id);
  }
};
</script>

<style scoped>
.snapshot-sidebar {
  padding: 10px 12px;
  height: 100%;
  border-left: 1px solid var(--sys-border, #e2e8f0);
  background: var(--sys-bg-panel, #ffffff);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-sizing: border-box;
  container-type: inline-size;
  container-name: snapshotSidebar;
}

.header {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-bottom: 8px;
  flex-shrink: 0;
}

.header-title-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.title-with-badge {
  display: flex;
  align-items: center;
  gap: 6px;
}

.title-with-badge h4 {
  margin: 0;
  font-size: 13.5px;
  font-weight: 700;
  color: var(--el-text-color-primary, #1e293b);
  letter-spacing: 0.2px;
  white-space: nowrap;
}

.count-pill {
  font-size: 12px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 10px;
  background: rgba(64, 158, 255, 0.12);
  color: #409eff;
  font-family: 'JetBrains Mono', 'Consolas', monospace;
}

.header-actions-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 6px;
  width: 100%;
}

.header-btn {
  width: 100%;
  justify-content: center;
  padding: 6px 4px;
  font-size: 12px;
  border-radius: 6px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
  box-sizing: border-box;
}

/* 统计指示栏 */
.stats-bar {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding: 5px 6px;
  background: var(--el-fill-color-light, #f8fafc);
  border-radius: 6px;
  border: 1px solid var(--sys-border, #e2e8f0);
}

.stat-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  padding: 2px 7px;
  border-radius: 4px;
  cursor: pointer;
  background: var(--el-bg-color, #ffffff);
  border: 1px solid var(--el-border-color-lighter, #e2e8f0);
  color: var(--el-text-color-regular, #64748b);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  user-select: none;
}

.stat-chip:hover {
  border-color: #409eff;
  color: #409eff;
  transform: translateY(-1px);
}

.stat-chip.active {
  background: #409eff;
  color: #ffffff;
  border-color: #409eff;
  box-shadow: 0 2px 6px rgba(64, 158, 255, 0.35);
}

.stat-chip.active .chip-dot {
  background: #ffffff !important;
}

.chip-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dot-all { background: #94a3b8; }
.dot-success { background: #10b981; }
.dot-warning { background: #f59e0b; }
.dot-danger { background: #ef4444; }
.dot-3d { background: #6366f1; }

.chip-success.active {
  background: #10b981;
  border-color: #10b981;
  box-shadow: 0 2px 6px rgba(16, 185, 129, 0.35);
}

.chip-warning.active {
  background: #f59e0b;
  border-color: #f59e0b;
  box-shadow: 0 2px 6px rgba(245, 158, 11, 0.35);
}

.chip-danger.active {
  background: #ef4444;
  border-color: #ef4444;
  box-shadow: 0 2px 6px rgba(239, 68, 68, 0.35);
}

.chip-3d {
  background: rgba(99, 102, 241, 0.08);
  color: #6366f1;
  border-color: rgba(99, 102, 241, 0.2);
  cursor: default;
}

.chip-num {
  font-weight: 700;
  font-family: 'JetBrains Mono', 'Consolas', monospace;
}

/* ===================================================
   批处理监控看板 (Batch Monitor Banner)
   所有文字均严格遵循 font-size >= 12px 底线规范
   =================================================== */
.batch-monitor-banner {
  padding: 10px 12px;
  background: var(--sys-bg-active, #f0fdf4);
  border: 1px solid var(--sys-border-active, #bbf7d0);
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.batch-monitor-banner.is-running {
  background: #f0f9ff;
  border-color: #bae6fd;
}

.batch-monitor-banner.is-paused {
  background: #fffbeb;
  border-color: #fde68a;
}

.batch-monitor-banner.has-failed {
  background: #fef2f2;
  border-color: #fecaca;
}

.monitor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
}

.monitor-status {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  color: var(--sys-text-primary, #1e293b);
  font-size: 12px;
}

.status-indicator {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 10px;
  height: 10px;
}

.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #10b981;
}

.is-running .status-dot {
  background: #0284c7;
}

.is-paused .status-dot {
  background: #f59e0b;
}

.has-failed .status-dot {
  background: #ef4444;
}

.pulse-ring {
  position: absolute;
  top: -2px;
  left: -2px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid #0284c7;
  animation: pulse-ring 1.5s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;
}

@keyframes pulse-ring {
  0% { transform: scale(0.8); opacity: 0.8; }
  100% { transform: scale(2.0); opacity: 0; }
}

.monitor-speed {
  display: flex;
  align-items: center;
  gap: 4px;
  color: var(--sys-text-secondary, #64748b);
  font-size: 12px;
}

.monitor-progress-row {
  margin-top: 2px;
}

.monitor-details-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 12px;
  flex-wrap: wrap;
  gap: 6px;
}

.monitor-counts {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  flex-wrap: wrap;
}

.count-tag {
  padding: 1px 6px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 500;
}

.count-done {
  background: #dcfce7;
  color: #166534;
}

.count-calc {
  background: #e0f2fe;
  color: #0369a1;
}

.count-paused {
  background: #fef3c7;
  color: #92400e;
}

.count-err {
  background: #fee2e2;
  color: #991b1b;
}

.monitor-eta {
  font-size: 12px;
  color: var(--sys-text-secondary, #64748b);
}

.monitor-eta b {
  color: #0284c7;
}

.monitor-actions-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 2px;
}

/* 批量导出进度条 */
.batch-export-box {
  background: var(--el-fill-color-lighter, #f1f5f9);
  padding: 6px 10px;
  border-radius: 6px;
  border: 1px solid var(--sys-border, #e2e8f0);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 12px;
  color: var(--el-text-color-regular, #475569);
}

.progress-val {
  font-weight: 700;
  color: #409eff;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
}


/* 过滤工具栏 */
.filter-toolbar {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.filter-controls-row {
  display: flex;
  gap: 5px;
  align-items: center;
  flex-wrap: wrap;
}

.filter-select {
  flex: 1;
  min-width: 90px;
}

.action-icon-btn {
  padding: 5px 7px;
  font-size: 11.5px;
  flex-shrink: 0;
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.batch-export-btn {
  background: rgba(64, 158, 255, 0.08);
}

/* 4. 选中卡片快捷批量操作条 (自适应双态防挤压) */
.selected-batch-bar {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
  padding: 6px 10px;
  border-radius: 6px;
  background: linear-gradient(135deg, rgba(64, 158, 255, 0.12), rgba(99, 102, 241, 0.1));
  border: 1px solid rgba(64, 158, 255, 0.3);
  animation: fadeInBatch 0.25s ease-out;
}

@keyframes fadeInBatch {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}

.batch-bar-left {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  width: 100%;
}

.batch-count-tag {
  font-size: 12px;
  color: #1e293b;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

.batch-count-tag .el-icon {
  color: #409eff;
}

.batch-count-tag b {
  color: #2563eb;
  font-family: 'JetBrains Mono', monospace;
}

.batch-clear-btn {
  font-size: 12px;
  padding: 0 4px;
}

.batch-bar-actions {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 5px;
  width: 100%;
}

.batch-bar-actions :deep(.el-button + .el-button) {
  margin-left: 0 !important;
}

.batch-quick-btn {
  width: 100%;
  padding: 4px 4px;
  font-size: 12px;
  border-radius: 4px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 3px;
  font-weight: 600;
  box-sizing: border-box;
  white-space: nowrap;
}

.batch-btn-text .text-compact {
  display: none;
}

.batch-btn-text .text-full {
  display: inline;
}

.batch-delete-btn {
  color: #dc2626;
  border-color: rgba(220, 38, 38, 0.4);
  background: rgba(220, 38, 38, 0.08);
}

.batch-delete-btn:hover {
  color: #ffffff;
  background: #dc2626;
  border-color: #dc2626;
}

/* 5. 快照卡片列表 */
.snapshot-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 2px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.snapshot-card {
  position: relative;
  background: var(--el-bg-color-overlay, #ffffff);
  border: 1px solid var(--el-border-color-light, #e2e8f0);
  border-radius: 8px;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  overflow: hidden;
  flex-shrink: 0;
  min-height: 42px;
  box-sizing: border-box;
}

.snapshot-card:hover {
  border-color: #93c5fd;
  box-shadow: 0 3px 10px rgba(64, 158, 255, 0.12);
  transform: translateY(-1px);
}

.snapshot-card.is-checked {
  background: rgba(64, 158, 255, 0.02);
  border-color: #bfdbfe;
}

.snapshot-card.is-active {
  border-color: #3b82f6;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.snapshot-card.is-risk {
  border-color: rgba(239, 68, 68, 0.35);
  background: rgba(254, 242, 242, 0.3);
}

/* 状态色带/指示条 */
.card-status-stripe {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 3.5px;
  border-top-left-radius: 8px;
  border-bottom-left-radius: 8px;
  transition: background 0.2s;
}

.stripe-done { background: #10b981; }
.stripe-pending { background: #f59e0b; }
.stripe-risk { background: linear-gradient(180deg, #ef4444, #f97316); }
.stripe-error { background: #dc2626; }
.stripe-calculating {
  background: #0284c7;
  box-shadow: 0 0 6px rgba(2, 132, 199, 0.6);
  animation: stripePulse 1.2s infinite alternate;
}
.stripe-paused { background: #f59e0b; }

@keyframes stripePulse {
  from { opacity: 0.6; }
  to { opacity: 1; }
}


/* 5.1 紧凑顶栏 */
.card-compact-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  min-height: 40px;
  padding: 6px 10px 6px 12px;
  cursor: pointer;
  user-select: none;
  gap: 6px 8px;
}

.compact-left {
  display: flex;
  align-items: center;
  gap: 6px;
  overflow: hidden;
  flex: 1;
  min-width: 140px;
}

.snap-checkbox {
  margin-right: 1px;
}

.chainage-capsule {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  font-weight: 700;
  font-family: 'JetBrains Mono', 'Consolas', monospace;
  color: #1e3a8a;
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(99, 102, 241, 0.06));
  border: 1px solid rgba(59, 130, 246, 0.25);
  padding: 1.5px 6px;
  border-radius: 4px;
  white-space: nowrap;
  flex-shrink: 0;
}

.chainage-icon {
  font-size: 12px;
}

.snap-remark-text {
  font-size: 12px;
  font-weight: 500;
  color: var(--el-text-color-regular, #334155);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.compact-right {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-shrink: 0;
}

/* 安全系数微标 */
.fs-pill {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 12px;
  font-weight: 700;
  font-family: 'JetBrains Mono', monospace;
  padding: 1.5px 6px;
  border-radius: 4px;
  white-space: nowrap;
}

.fs-pill .fs-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
}

.fs-safe {
  background: rgba(16, 185, 129, 0.12);
  color: #059669;
  border: 1px solid rgba(16, 185, 129, 0.25);
}

.fs-safe .fs-dot { background: #10b981; }

.fs-danger {
  background: rgba(239, 68, 68, 0.12);
  color: #dc2626;
  border: 1px solid rgba(239, 68, 68, 0.3);
  animation: pulseRisk 2s infinite ease-in-out;
}

@keyframes pulseRisk {
  0%, 100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.2); }
  50% { box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.2); }
}

.fs-danger .fs-dot { background: #ef4444; }

/* 状态 Chip */
.status-chip {
  font-size: 12px;
  font-weight: 600;
  padding: 1px 6px;
  border-radius: 4px;
  line-height: 1.4;
  white-space: nowrap;
  display: inline-flex;
  align-items: center;
  gap: 3px;
}

.chip-tag-done {
  background: rgba(16, 185, 129, 0.1);
  color: #10b981;
}

.chip-tag-pending {
  background: rgba(245, 158, 11, 0.1);
  color: #d97706;
}

.chip-tag-error {
  background: rgba(239, 68, 68, 0.1);
  color: #ef4444;
}

.chip-tag-calculating {
  background: rgba(2, 132, 199, 0.12);
  color: #0284c7;
  border: 1px solid rgba(2, 132, 199, 0.3);
}

.chip-tag-paused {
  background: rgba(245, 158, 11, 0.15);
  color: #b45309;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

/* 紧凑顶栏快速动作按钮 */
.compact-quick-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}

.action-btn-desktop {
  display: inline-flex;
}

.action-btn-mobile {
  display: none;
}

.danger-menu-item {
  color: #dc2626 !important;
}

.text-danger {
  color: #dc2626 !important;
}

.icon-action-btn {
  width: 24px;
  height: 24px;
  border-radius: 4px;
  border: none;
  background: transparent;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--el-text-color-secondary, #94a3b8);
  transition: all 0.15s ease;
  font-size: 13px;
  padding: 0;
}

.icon-action-btn:hover {
  background: var(--el-fill-color, #f1f5f9);
  color: var(--el-text-color-primary, #1e293b);
  transform: scale(1.08);
}

.blueprint-btn:hover {
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.12);
}

.book-btn:hover {
  color: #3b82f6;
  background: rgba(59, 130, 246, 0.12);
}

.expand-btn {
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.expand-btn.expanded {
  transform: rotate(180deg);
  color: #3b82f6;
}

.delete-btn:hover {
  color: #ef4444;
  background: rgba(239, 68, 68, 0.12);
}

/* 5.2 深度展开态 */
.card-expanded-body {
  padding: 0 10px 10px 12px;
  border-top: 1px dashed var(--el-border-color-lighter, #e2e8f0);
  animation: fadeInBody 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

@keyframes fadeInBody {
  from {
    opacity: 0;
    transform: translateY(-5px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.results-dashboard {
  padding-top: 8px;
  display: flex;
  flex-direction: column;
  gap: 7px;
}

.pending-dashboard {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 12px 10px;
  font-size: 11.5px;
  color: #94a3b8;
  background: var(--el-fill-color-lighter, #f8fafc);
  border-radius: 6px;
  border: 1px dashed var(--sys-border, #e2e8f0);
  margin-top: 8px;
}

.pending-icon {
  font-size: 14px;
  color: #f59e0b;
}

/* 顶部水头与安全系数双卡片 */
.headline-metrics-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px;
}

.headline-card {
  padding: 5px 8px;
  border-radius: 6px;
  border: 1px solid var(--sys-border, #e2e8f0);
  background: var(--el-fill-color-light, #f8fafc);
}

.headline-card.head-water {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.06), rgba(6, 182, 212, 0.04));
  border-color: rgba(59, 130, 246, 0.2);
}

.headline-card.head-fs.is-safe {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(5, 150, 105, 0.04));
  border-color: rgba(16, 185, 129, 0.25);
}

.headline-card.head-fs.is-danger {
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.08), rgba(249, 115, 22, 0.05));
  border-color: rgba(239, 68, 68, 0.3);
}

.headline-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--el-text-color-secondary, #64748b);
  margin-bottom: 2px;
}

.headline-val {
  font-size: 14px;
  font-weight: 800;
  font-family: 'JetBrains Mono', 'Consolas', monospace;
  color: #1e293b;
}

.head-fs.is-safe .headline-val { color: #059669; }
.head-fs.is-danger .headline-val { color: #dc2626; }

.headline-val .unit {
  font-size: 10.5px;
  font-weight: 500;
  color: #64748b;
}

/* 4 宫格指标 */
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 5px;
}

.metric-tile {
  background: var(--el-fill-color-light, #f8fafc);
  border: 1px solid var(--sys-border, #e2e8f0);
  border-radius: 5px;
  padding: 4px 7px;
  display: flex;
  flex-direction: column;
}

.m-label {
  font-size: 9.5px;
  color: var(--el-text-color-secondary, #64748b);
}

.m-val {
  font-size: 12px;
  font-weight: 700;
  color: #2563eb;
  font-family: 'JetBrains Mono', monospace;
  margin-top: 1px;
}

.m-unit {
  font-size: 9.5px;
  font-weight: normal;
  color: #94a3b8;
}

/* 临界加固面板 */
.critical-reinforce-panel {
  margin-top: 2px;
  padding: 6px 8px;
  border-radius: 6px;
  background: linear-gradient(135deg, rgba(239, 68, 68, 0.05), rgba(249, 115, 22, 0.05));
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-left: 3px solid #ef4444;
}

.critical-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 5px;
}

.critical-title {
  font-size: 10.5px;
  font-weight: 700;
  color: #dc2626;
}

.critical-fs-tag {
  font-size: 10px;
  color: #dc2626;
  font-family: 'JetBrains Mono', monospace;
}

.crit-tile {
  background: rgba(255, 255, 255, 0.8);
  border-color: rgba(239, 68, 68, 0.15);
}

.text-crit {
  color: #dc2626 !important;
}

/* 卡片底部操作栏 */
.card-bottom-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-top: 8px;
  margin-top: 6px;
  border-top: 1px solid var(--el-border-color-lighter, #f1f5f9);
  flex-wrap: wrap;
  gap: 6px;
}

.time-meta {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  font-size: 10.5px;
  color: #94a3b8;
  font-family: 'JetBrains Mono', monospace;
}

/* 展开态精美胶囊动作按钮 */
.action-capsules-group {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-wrap: wrap;
}

.capsule-btn {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 8px;
  font-size: 11px;
  font-weight: 600;
  border-radius: 5px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.18s cubic-bezier(0.4, 0, 0.2, 1);
  outline: none;
  user-select: none;
}

.capsule-btn:hover {
  transform: translateY(-1px);
}

.capsule-btn:active {
  transform: translateY(0);
}

.capsule-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.capsule-btn .arrow-tiny {
  font-size: 9px;
  margin-left: -1px;
}

/* 1. 施工图：琥珀金微质感 */
.capsule-blueprint {
  background: linear-gradient(135deg, rgba(245, 158, 11, 0.12), rgba(217, 119, 6, 0.08));
  color: #d97706;
  border-color: rgba(245, 158, 11, 0.3);
}

.capsule-blueprint:hover {
  background: linear-gradient(135deg, #f59e0b, #d97706);
  color: #ffffff;
  border-color: #d97706;
  box-shadow: 0 2px 6px rgba(217, 119, 6, 0.3);
}

/* 2. 计算书：科技蓝微质感 */
.capsule-book {
  background: linear-gradient(135deg, rgba(59, 130, 246, 0.12), rgba(37, 99, 235, 0.08));
  color: #2563eb;
  border-color: rgba(59, 130, 246, 0.3);
}

.capsule-book:hover {
  background: linear-gradient(135deg, #3b82f6, #2563eb);
  color: #ffffff;
  border-color: #2563eb;
  box-shadow: 0 2px 6px rgba(37, 99, 235, 0.3);
}

/* 3. 结果JSON：石墨灰微质感 */
.capsule-json {
  background: var(--el-fill-color-light, #f1f5f9);
  color: var(--el-text-color-regular, #475569);
  border-color: var(--el-border-color-light, #e2e8f0);
}

.capsule-json:hover:not(:disabled) {
  background: #475569;
  color: #ffffff;
  border-color: #475569;
  box-shadow: 0 2px 6px rgba(71, 85, 105, 0.25);
}

/* 4. 单段重算：祖母绿微质感 */
.capsule-recalc {
  background: linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(5, 150, 105, 0.08));
  color: #059669;
  border-color: rgba(16, 185, 129, 0.3);
}

.capsule-recalc:hover:not(:disabled) {
  background: linear-gradient(135deg, #10b981, #059669);
  color: #ffffff;
  border-color: #059669;
  box-shadow: 0 2px 6px rgba(5, 150, 105, 0.3);
}

/* 6. 常驻吸底分页栏 */
.pagination-footer {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 8px 4px 4px 4px;
  border-top: 1px solid var(--sys-border, #e2e8f0);
  background: var(--sys-bg-panel, #ffffff);
  flex-shrink: 0;
  box-sizing: border-box;
}

.pagination-footer :deep(.el-pagination) {
  font-size: 12px;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px;
}

.pagination-footer :deep(.el-pagination__total),
.pagination-footer :deep(.el-pagination__sizes),
.pagination-footer :deep(.el-select .el-input__inner),
.pagination-footer :deep(.btn-prev),
.pagination-footer :deep(.btn-next),
.pagination-footer :deep(.el-pager li) {
  font-size: 12px;
}

.empty-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1;
}

/* ===================================================
   响应式容器查询适配 (Container Queries)
   根据侧边栏自身的实际拖拽宽度动态切换形态
   =================================================== */
@container snapshotSidebar (min-width: 450px) {
  .header-title-bar {
    flex-wrap: nowrap;
  }
  .header-actions-row {
    width: auto;
    display: flex;
    gap: 6px;
  }
  .header-btn {
    width: auto;
  }
  .selected-batch-bar {
    flex-direction: row;
    flex-wrap: nowrap;
    justify-content: space-between;
    align-items: center;
  }
  .batch-bar-left {
    width: auto;
    justify-content: flex-start;
  }
  .batch-bar-actions {
    width: auto;
    display: flex;
    gap: 5px;
  }
  .batch-quick-btn {
    width: auto;
    padding: 3px 8px;
  }
}

@container snapshotSidebar (min-width: 420px) and (max-width: 449px) {
  .header-title-bar {
    flex-wrap: nowrap;
  }
  .header-actions-row {
    width: auto;
    display: flex;
    gap: 6px;
  }
  .header-btn {
    width: auto;
  }
}

@container snapshotSidebar (max-width: 380px) {
  .action-btn-desktop {
    display: none !important;
  }
  .action-btn-mobile {
    display: inline-flex !important;
  }
  .header-actions-row {
    grid-template-columns: repeat(3, 1fr) !important;
    width: 100% !important;
  }
  .header-title-bar {
    flex-wrap: wrap !important;
  }
  .batch-btn-text .text-full {
    display: none !important;
  }
  .batch-btn-text .text-compact {
    display: inline !important;
  }
  .batch-quick-btn {
    padding: 4px 2px !important;
  }
}

@container snapshotSidebar (max-width: 330px) {
  .header-btn .btn-label {
    display: none !important;
  }
  .header-btn {
    padding: 6px 0 !important;
  }
  .fs-pill .fs-text-prefix {
    display: none !important;
  }
  .chainage-capsule {
    font-size: 12px;
    padding: 1px 4px;
  }
  .batch-btn-text {
    display: none !important;
  }
  .batch-quick-btn {
    padding: 6px 0 !important;
  }
}

/* 批量入库弹窗样式 */
.archive-pending-alert {
  margin-bottom: 16px;
  font-size: 13px;
}
.archive-form {
  margin-top: 10px;
}
.naming-preview-box {
  background: var(--el-fill-color-light);
  border: 1px dashed var(--el-border-color);
  border-radius: 6px;
  padding: 12px;
  margin-top: 10px;
}
.naming-preview-box .preview-title {
  font-size: 12px;
  font-weight: 600;
  color: var(--el-text-color-primary);
  margin-bottom: 8px;
}
.preview-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.preview-tag {
  font-size: 12px;
}
</style>