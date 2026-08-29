<!-- frontend/src/components/calculationBook/chapters/Chapter3Seepage.vue -->
<template>
  <div class="chapter-block chapter-3">
    <div class="chapter-header">
      <h2 class="chapter-title"><span class="ch-num">第 3 章</span> 原始状态渗流水力计算</h2>
      <div class="ch-line"></div>
    </div>

    <!-- 3.1 工况判别 -->
    <div class="section-block">
      <h3 class="section-title">3.1 计算工况与边界判别</h3>
      <p class="paragraph">
        依据隧道二次衬砌内半径 <span v-html="renderInline('r_0')"></span> 与勘察初始静水头 <span v-html="renderInline('H')"></span> 之比值进行水力工况划分（规范阈值 0.062）：
      </p>
      <div class="formula-box">
        <div class="formula-content" v-html="renderBlock(FormulaTemplates.waterLevelJudge(data.ratio_r0_H * data.h0_effectiveWaterHead, data.h0_effectiveWaterHead, data.ratio_r0_H))"></div>
        <div class="formula-tag">(3-1)</div>
      </div>
      <p class="paragraph">
        综合隧道空间拓扑布置与水文特征，本设计计算认定为：<strong class="highlight-text">{{ data.caseDescription }}</strong>。
      </p>
    </div>

    <!-- 3.2 SCS-CN 降雨入渗模型 -->
    <div class="section-block">
      <h3 class="section-title">3.2 降雨补给有效水头计算（SCS-CN 水文模型）</h3>
      <p class="paragraph">
        为考虑地表降雨入渗对地下水位的季节性补给效应，采用美国农业部水土保持局 SCS-CN 经验入渗模型：
      </p>
      
      <div class="formula-list">
        <div class="formula-row">
          <span class="sub-label">1. 潜在最大蓄水滞留量：</span>
          <div class="formula-box-mini" v-html="renderBlock(FormulaTemplates.scsRetention(data.cn, data.S_retention))"></div>
        </div>
        <div class="formula-row">
          <span class="sub-label">2. 地表截留初损量：</span>
          <div class="formula-box-mini" v-html="renderBlock(FormulaTemplates.scsInitialLoss(data.S_retention, data.Ia_initialLoss))"></div>
        </div>
        <div class="formula-row">
          <span class="sub-label">3. 年地表总径流量：</span>
          <div class="formula-box-mini" v-html="renderBlock(FormulaTemplates.scsRunoff(data.p_annual, data.Ia_initialLoss, data.S_retention, data.hs_runoff))"></div>
        </div>
      </div>

      <p class="paragraph">
        折算后作用于隧道围岩渗流场的<strong>最终降雨入渗折算有效设计水头</strong>为：
      </p>
      <div class="formula-box">
        <div class="formula-content" v-html="renderBlock(FormulaTemplates.scsEffectiveHead(data.h0_effectiveWaterHead - (data.p_annual - data.hs_runoff)/1000, data.p_annual, data.hs_runoff, data.h0_effectiveWaterHead))"></div>
        <div class="formula-tag">(3-2)</div>
      </div>
    </div>

    <!-- 3.3 渗流影响半径与双洞映射 -->
    <div class="section-block">
      <h3 class="section-title">3.3 渗流影响半径与双洞保角映射计算</h3>
      <p class="paragraph">
        单洞基准影响半径由围岩渗透系数与有效水头联合决定，影响半径折减系数 <span v-html="renderInline('\\beta_1')"></span> 求解如下：
      </p>
      <div class="formula-box">
        <div class="formula-content" v-html="renderBlock(FormulaTemplates.beta1Factor(data.beta1, data.beta1))"></div>
        <div class="formula-tag">(3-3)</div>
      </div>
      <div class="formula-box">
        <div class="formula-content" v-html="renderBlock(FormulaTemplates.singleRadiusInf(data.beta1, data.h0_effectiveWaterHead, data.R_inf))"></div>
        <div class="formula-tag">(3-4)</div>
      </div>

      <!-- 双洞分支 -->
      <template v-if="data.isDoubleTube && data.D_spacing != null && data.phi_deg != null && data.R_map != null">
        <p class="paragraph">
          本工程为双洞平行隧道，中心间距 <span v-html="renderInline(`D = ${data.D_spacing.toFixed(1)}\\ \\text{m}`)"></span>。由于半间距 <span v-html="renderInline(`D/2 = ${(data.D_spacing/2).toFixed(1)}\\ \\text{m} < R_{\\text{inf}}`)"></span>，两洞渗流降落漏斗发生空间干涉重叠，需采用保角映射法折减为等效单洞渗流半径：
        </p>
        <div class="formula-box">
          <div class="formula-content" v-html="renderBlock(FormulaTemplates.doublePhiAngle(data.D_spacing, data.R_inf, data.phi_deg))"></div>
          <div class="formula-tag">(3-5)</div>
        </div>
        <div class="formula-box">
          <div class="formula-content" v-html="renderBlock(FormulaTemplates.doubleMappingRadius(data.phi_deg, data.R_inf, data.R_map))"></div>
          <div class="formula-tag">(3-6)</div>
        </div>
      </template>
      <template v-else>
        <p class="paragraph">
          本工程为单洞隧道，渗流场无相邻洞室水力干扰，有效渗流影响半径取 <span v-html="renderInline(`R = R_{\\text{inf}} = ${data.R_effective.toFixed(2)}\\ \\text{m}`)"></span>。
        </p>
      </template>
    </div>

    <!-- 3.4 多层圆筒渗流计算 -->
    <div class="section-block">
      <h3 class="section-title">3.4 多层圆筒串联介质水力计算</h3>
      <p class="paragraph">
        隧道由「围岩-初始注浆圈-初支-二衬」构成四层串联径向稳态渗流体系。在初始未加固状态下（<span v-html="renderInline('r_g = r_p')"></span>），各层连续渗流平衡方程如下：
      </p>

      <h4 class="sub-section-title">3.4.1 二次衬砌外水压力解析解</h4>
      <div class="formula-box">
        <div class="formula-content" v-html="renderBlock(FormulaTemplates.liningPressureHighWater())"></div>
        <div class="formula-tag">(3-7)</div>
      </div>
      <p class="paragraph">
        代入基础几何与水文参数求解得初始衬砌外水压力：
      </p>
      <div class="formula-box">
        <div class="formula-content" v-html="renderBlock(FormulaTemplates.liningPressureCalcSub(10, data.R_effective, data.rs_r0_ln, data.sum_resistance, data.P_waterPressure))"></div>
      </div>

      <h4 class="sub-section-title">3.4.2 隧道正常涌水量解析解</h4>
      <div class="formula-box">
        <div class="formula-content" v-html="renderBlock(FormulaTemplates.unitDischargeCalc())"></div>
        <div class="formula-tag">(3-8)</div>
      </div>
      <p class="paragraph">
        延米单位涌水量及全计算分区总涌水量计算如下：
      </p>
      <div class="formula-box">
        <div class="formula-content" v-html="renderBlock(FormulaTemplates.unitDischargeSub(0.3, data.R_effective, (2*Math.PI*0.3*data.R_effective)/data.q_unitDischarge, data.q_unitDischarge))"></div>
      </div>
      <div class="formula-box">
        <div class="formula-content" v-html="renderBlock(FormulaTemplates.totalDischargeCalc(data.q_unitDischarge, data.Q_totalDischarge / data.q_unitDischarge, data.Q_totalDischarge))"></div>
        <div class="formula-tag">(3-9)</div>
      </div>
    </div>

    <!-- 3.5 汇总三线表 -->
    <div class="section-block">
      <h3 class="section-title">3.5 原始渗流水力指标汇总</h3>
      <div class="table-container">
        <table class="three-line-table">
          <thead>
            <tr>
              <th style="width: 220px;">水力指标名称</th>
              <th style="width: 140px;">公式符号</th>
              <th style="width: 130px;" class="text-right">数值</th>
              <th style="width: 110px;">计量单位</th>
              <th>水力学评价</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="row in data.summaryTable" :key="row.metric">
              <td class="font-bold">{{ row.metric }}</td>
              <td class="latex-cell" v-html="renderInline(row.symbol)"></td>
              <td class="text-right font-mono font-bold text-primary">{{ row.value }}</td>
              <td>{{ row.unit }}</td>
              <td class="text-muted">基准设计荷载</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Chapter3Data } from '../../../utils/calculationBook/bookDataModel';
import { renderBlock, renderInline, FormulaTemplates } from '../../../utils/calculationBook/formulaTemplates';

defineProps<{
  data: Chapter3Data;
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
  padding: 6px 12px;
  margin: 8px 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-radius: 0 4px 4px 0;
}
.formula-content {
  flex: 1;
  overflow-x: auto;
  font-size: 9.5pt;
}
.formula-tag {
  font-family: 'Consolas', monospace;
  font-size: 8.5pt;
  color: #64748b;
  margin-left: 12px;
}
.formula-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin: 8px 0;
}
.formula-row {
  display: flex;
  align-items: center;
  gap: 10px;
}
.sub-label {
  font-size: 9pt;
  color: #475569;
  width: 180px;
  flex-shrink: 0;
}
.formula-box-mini {
  flex: 1;
  background: #f8fafc;
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
.text-muted {
  color: #64748b;
  font-size: 8.5pt;
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
