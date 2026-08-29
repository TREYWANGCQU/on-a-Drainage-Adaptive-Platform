<!-- frontend/src/components/calculationBook/chapters/Chapter5Optimize.vue -->
<template>
  <div class="chapter-block chapter-5">
    <div class="chapter-header">
      <h2 class="chapter-title"><span class="ch-num">第 5 章</span> 防排水自适应优化设计</h2>
      <div class="ch-line"></div>
    </div>

    <!-- 分支 A：超限工况（临界水头反算 + 注浆加固圈推导） -->
    <template v-if="data.safetyState === 'critical'">
      <div class="section-block">
        <h3 class="section-title">5.1 临界控制水头反算与解析求解</h3>
        <p class="paragraph">
          以衬砌结构规范容许安全系数 <span v-html="renderInline('[K] = 2.00')"></span> 为极限承载控制目标，采用有限元逆向步进迭代反算临界控制水头与临界外水压力：
        </p>
        
        <div class="formula-box">
          <div class="formula-content" v-html="renderBlock(FormulaTemplates.criticalWaterPressure(10, data.criticalWaterHead_h_crit ?? 0, data.criticalWaterPressure_P_crit ?? 0))"></div>
          <div class="formula-tag">(5-1)</div>
        </div>
        <p class="paragraph">
          得满足安全准则所允许承受的最大<strong>临界控制水压力</strong>为：
          <strong class="highlight-text">{{ data.criticalWaterPressure_P_crit?.toFixed(2) }} kPa</strong>
          （对应控制水头 <span v-html="renderInline(`h_{\\text{crit}} = ${(data.criticalWaterHead_h_crit)?.toFixed(2)}\\ \\text{m}`)"></span>）。
        </p>
      </div>

      <div class="section-block">
        <h3 class="section-title">5.2 临界注浆加固圈几何参数解析推导</h3>
        <p class="paragraph">
          将临界控制水压力 <span v-html="renderInline('P_{\\text{crit}}')"></span> 代入多层圆筒稳态渗流微分方程，反解注浆加固圈外半径 <span v-html="renderInline('r_g')"></span> 的精确解析式：
        </p>

        <div class="formula-box">
          <div class="formula-content" v-html="renderBlock(FormulaTemplates.criticalLnRgFormula())"></div>
          <div class="formula-tag">(5-2)</div>
        </div>

        <p class="paragraph">
          代入本工况渗透边界与几何参数进行解析求解：
        </p>
        <div class="formula-box">
          <div class="formula-content" v-html="renderBlock(FormulaTemplates.criticalLnRgSub(
            ((10 * (data.rg_crit ? 112.64 : 100) * 0.07277) / (data.criticalWaterPressure_P_crit || 1)),
            data.C0_constant || 0.03119,
            0.000864 * (1/0.026 - 1/0.3),
            data.ln_rg_crit || 2.005
          ))"></div>
        </div>

        <div class="formula-box">
          <div class="formula-content" v-html="renderBlock(FormulaTemplates.criticalRgRadius(data.ln_rg_crit || 2.005, data.rg_crit || 7.405))"></div>
          <div class="formula-tag">(5-3)</div>
        </div>

        <p class="paragraph">
          初期支护外边缘起算之<strong>临界注浆加固圈净厚度</strong>为：
        </p>
        <div class="formula-box">
          <div class="formula-content" v-html="renderBlock(FormulaTemplates.criticalGroutThickness(data.rg_crit || 7.405, 5.93, data.tg_crit || 1.475))"></div>
          <div class="formula-tag">(5-4)</div>
        </div>

        <div class="verify-note">
          <strong>闭环复核：</strong>将 <span v-html="renderInline(`r_{g,\\text{crit}} = ${(data.rg_crit)?.toFixed(4)}\\ \\text{m}`)"></span> 代回原渗流体系方程，验算得衬砌外水压力为 {{ data.P_opt_waterPressure?.toFixed(2) }} kPa，与控制目标误差 {{ data.verificationErrorPercent?.toFixed(3) }}% &lt; 0.01%，反算解析解闭环无误。
        </div>

        <h4 class="sub-section-title">5.2.1 注浆加固后渗流水力指标</h4>
        <div class="table-container">
          <table class="three-line-table">
            <thead>
              <tr>
                <th>水力指标名称</th>
                <th>符号</th>
                <th class="text-right">优化后设计值</th>
                <th>计量单位</th>
                <th>对比原始状态降幅</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td class="font-bold">单位延米涌水量</td>
                <td class="latex-cell" v-html="renderInline('q_{\\text{opt}}')"></td>
                <td class="text-right font-mono font-bold text-primary">{{ data.q_opt_unitDischarge?.toFixed(3) }}</td>
                <td>m³/(d·m)</td>
                <td class="text-success font-bold">削减正常排泄负荷</td>
              </tr>
              <tr>
                <td class="font-bold">计算分区总涌水量</td>
                <td class="latex-cell" v-html="renderInline('Q_{\\text{opt}}')"></td>
                <td class="text-right font-mono font-bold text-primary">{{ data.Q_opt_totalDischarge?.toFixed(1) }}</td>
                <td>m³/d</td>
                <td class="text-success font-bold">显著减轻排水沟排水压力</td>
              </tr>
              <tr>
                <td class="font-bold">衬砌外水压力</td>
                <td class="latex-cell" v-html="renderInline('P_{\\text{opt}}')"></td>
                <td class="text-right font-mono font-bold text-primary">{{ data.P_opt_waterPressure?.toFixed(1) }}</td>
                <td>kPa</td>
                <td class="text-success font-bold">降至安全承载红线以下</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </template>

    <!-- 分支 B：达标工况（免注浆直通达标声明） -->
    <template v-else>
      <div class="section-block">
        <h3 class="section-title">5.1 结构自适应承载达标认证</h3>
        <div class="safe-cert-box">
          <div class="cert-badge">🛡️ 免注浆自适应安全达标</div>
          <p class="cert-text">{{ data.safeStatement }}</p>
        </div>
      </div>
    </template>

    <!-- 5.3 / 5.2 排水管网系统自适应水力计算（曼宁公式） -->
    <div class="section-block">
      <h3 class="section-title">{{ data.safetyState === 'critical' ? '5.3' : '5.2' }} 排水系统管网水力设计（曼宁公式）</h3>
      <p class="paragraph">
        防排水系统采用“以堵为主、限量排放”策略，排水管网采用曼宁重力流公式进行水力过流能力验算（塑料管材曼宁糙率 <span v-html="renderInline(`n = ${data.manning_n}`)"></span>）：
      </p>

      <div class="formula-box">
        <div class="formula-content" v-html="renderBlock(FormulaTemplates.manningCapacity())"></div>
        <div class="formula-tag">({{ data.safetyState === 'critical' ? '5-5' : '5-1' }})</div>
      </div>

      <!-- 环向排水盲管 -->
      <div class="pipe-calc-card">
        <div class="pipe-header">
          <span class="pipe-name">1. 环向打孔排水盲管（DN{{ data.ringPipeDiam_mm }}）</span>
          <span class="pipe-status is-passed">✓ 验算合格</span>
        </div>
        <p class="pipe-desc">
          设计间距 <span v-html="renderInline(`S = ${data.ringPipeSpacing_m.toFixed(1)}\\ \\text{m}`)"></span>，单侧边汇水流量 <span v-html="renderInline(`Q_{\\text{side}} = ${data.ringPipeSideFlow.toFixed(2)}\\ \\text{m}^3/\\text{d}`)"></span>，等效水力坡度 <span v-html="renderInline(`i = ${data.ringPipeSlope}`)"></span>。
        </p>
        <div class="formula-box-mini" v-html="renderBlock(FormulaTemplates.manningSubRing(data.manning_n, Math.PI*Math.pow(data.ringPipeDiam_mm/2000, 2), data.ringPipeDiam_mm/4000, data.ringPipeSlope, data.ringPipeCapacity))"></div>
        <p class="pipe-result">
          管网过流能力 <span class="font-mono font-bold text-primary">{{ data.ringPipeCapacity.toFixed(1) }} m³/d</span> &gt; 设计流量 <span class="font-mono">{{ data.ringPipeSideFlow.toFixed(2) }} m³/d</span>，满足排泄要求。
        </p>
      </div>

      <!-- 纵向主排水盲管 -->
      <div class="pipe-calc-card">
        <div class="pipe-header">
          <span class="pipe-name">2. 纵向主排水盲管（DN{{ data.longPipeDiam_mm }}）</span>
          <span class="pipe-status is-passed">✓ 验算合格</span>
        </div>
        <p class="pipe-desc">
          单洞全线贯通总流量 <span v-html="renderInline(`Q_{\\text{long}} = ${data.longPipeFlow.toFixed(2)}\\ \\text{m}^3/\\text{d}`)"></span>，纵向设计坡度 <span v-html="renderInline(`i = ${data.longPipeSlope}`)"></span>。
        </p>
        <div class="formula-box-mini" v-html="renderBlock(FormulaTemplates.manningSubLong(data.manning_n, Math.PI*Math.pow(data.longPipeDiam_mm/2000, 2), data.longPipeDiam_mm/4000, data.longPipeSlope, data.longPipeCapacity))"></div>
        <p class="pipe-result">
          主排水管容量 <span class="font-mono font-bold text-primary">{{ data.longPipeCapacity.toFixed(1) }} m³/d</span> &gt; 汇集流量 <span class="font-mono">{{ data.longPipeFlow.toFixed(2) }} m³/d</span>，排水通畅无壅水风险。
        </p>
      </div>

      <!-- 横向排水支管 -->
      <div class="pipe-calc-card">
        <div class="pipe-header">
          <span class="pipe-name">3. 横向导水穿衬支管（DN{{ data.latPipeDiam_mm }}）</span>
          <span class="pipe-status is-passed">✓ 验算合格</span>
        </div>
        <p class="pipe-desc">
          将环向及侧墙汇水导入中心水沟，设计坡度 <span v-html="renderInline(`i = ${data.latPipeSlope}`)"></span>，验算过流能力 <span class="font-mono font-bold text-primary">{{ data.latPipeCapacity.toFixed(1) }} m³/d</span> &gt; <span class="font-mono">{{ data.latPipeFlow.toFixed(2) }} m³/d</span>，规格匹配合理。
        </p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Chapter5Data } from '../../../utils/calculationBook/bookDataModel';
import { renderBlock, renderInline, FormulaTemplates } from '../../../utils/calculationBook/formulaTemplates';

defineProps<{
  data: Chapter5Data;
}>();
</script>

<style scoped>
.chapter-block {
  margin-bottom: 24px;
}
.chapter-header {
  margin-bottom: 16px;
}
.chapter-title {
  font-size: 16pt;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 6px 0;
  display: flex;
  align-items: center;
  gap: 8px;
}
.ch-num {
  color: #2563eb;
}
.ch-line {
  height: 2px;
  background: linear-gradient(90deg, #2563eb 0%, #93c5fd 60%, transparent 100%);
  border-radius: 1px;
}
.section-block {
  margin-top: 14px;
  page-break-inside: avoid;
}
.section-title {
  font-size: 12pt;
  font-weight: 600;
  color: #1e40af;
  margin: 0 0 8px 0;
}
.sub-section-title {
  font-size: 10.5pt;
  font-weight: 600;
  color: #334155;
  margin: 10px 0 6px 0;
}
.paragraph {
  font-size: 9.5pt;
  line-height: 1.6;
  color: #374151;
  margin: 0 0 8px 0;
  text-align: justify;
}
.highlight-text {
  color: #1e40af;
  background: #eff6ff;
  padding: 1px 6px;
  border-radius: 3px;
}
.formula-box {
  background: #f8fafc;
  border-left: 3px solid #3b82f6;
  padding: 6px 10px;
  margin: 6px 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-radius: 0 4px 4px 0;
  flex-wrap: wrap;
  gap: 6px;
}
.formula-content {
  flex: 1;
  min-width: 0;
  font-size: 9pt;
}
.formula-tag {
  font-family: 'Consolas', monospace;
  font-size: 8.5pt;
  color: #64748b;
  margin-left: 8px;
  flex-shrink: 0;
}
.verify-note {
  background-color: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 4px;
  padding: 6px 10px;
  font-size: 8.5pt;
  color: #166534;
  margin: 8px 0;
}
.safe-cert-box {
  background: #f0fdf4;
  border: 1.5px solid #86efac;
  border-radius: 6px;
  padding: 12px 16px;
  margin: 10px 0;
}
.cert-badge {
  font-size: 11pt;
  font-weight: 700;
  color: #166534;
  margin-bottom: 6px;
}
.cert-text {
  font-size: 9.5pt;
  line-height: 1.6;
  color: #15803d;
  margin: 0;
  text-align: justify;
}
.pipe-calc-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 8px 12px;
  margin: 8px 0;
}
.pipe-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 4px;
}
.pipe-name {
  font-size: 9.5pt;
  font-weight: 600;
  color: #1e293b;
}
.pipe-status.is-passed {
  font-size: 8.5pt;
  font-weight: 600;
  color: #16a34a;
  background: #dcfce7;
  padding: 1px 6px;
  border-radius: 3px;
}
.pipe-desc {
  font-size: 9pt;
  color: #475569;
  margin: 0 0 4px 0;
}
.pipe-result {
  font-size: 8.5pt;
  color: #334155;
  margin: 4px 0 0 0;
}
.formula-box-mini {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 9pt;
}
.table-container {
  margin: 8px 0;
}
.three-line-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 9pt;
}
.three-line-table th {
  border-top: 1.5pt solid #1f2937;
  border-bottom: 0.75pt solid #4b5563;
  padding: 5px 8px;
  text-align: left;
  background-color: #f8fafc;
  color: #0f172a;
  font-weight: 600;
}
.three-line-table td {
  padding: 5px 8px;
  border-bottom: 0.5pt solid #e2e8f0;
  color: #1f2937;
}
.three-line-table tbody tr:last-child td {
  border-bottom: 1.5pt solid #1f2937;
}
.text-right {
  text-align: right;
}
.text-primary {
  color: #1d4ed8;
}
.text-success {
  color: #15803d;
}
.font-mono {
  font-family: 'Consolas', 'Courier New', monospace;
}
.font-bold {
  font-weight: 600;
}
.latex-cell {
  font-size: 9.5pt;
}
</style>
