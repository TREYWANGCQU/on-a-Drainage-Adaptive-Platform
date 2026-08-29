<!-- frontend/src/components/calculationBook/chapters/Chapter4Mech.vue -->
<template>
  <div class="chapter-block chapter-4">
    <div class="chapter-header">
      <h2 class="chapter-title"><span class="ch-num">第 4 章</span> 原始状态衬砌结构安全验算</h2>
      <div class="ch-line"></div>
    </div>

    <!-- 4.1 围岩压力计算 -->
    <div class="section-block">
      <h3 class="section-title">4.1 围岩压力计算（泰沙基理论）</h3>
      <p class="paragraph">
        根据《公路隧道设计规范 第一册 土建工程》（JTG 3370.1-2018），采用深埋拱形泰沙基理论计算拱顶竖向围岩压力：
      </p>
      <div class="formula-box">
        <div class="formula-content" v-html="renderBlock(FormulaTemplates.terzaghiArchHeight(data.Hq_archHeight / (0.45 * data.liningOuterWidth), data.liningOuterWidth, data.Hq_archHeight))"></div>
        <div class="formula-tag">(4-1)</div>
      </div>
      <p class="paragraph">
        其中隧道开挖总宽度 <span v-html="renderInline(`B = 2r_s = ${data.liningOuterWidth.toFixed(2)}\\ \\text{m}`)"></span>。隧道中心埋深大于围岩压力拱高（深埋隧道），且地下水位高于拱顶，围岩压力按有效浮重度 <span v-html="renderInline(`\\gamma'_s = ${data.gamma_s_effective.toFixed(1)}\\ \\text{kN/m}^3`)"></span> 计算：
      </p>
      <div class="formula-box">
        <div class="formula-content" v-html="renderBlock(FormulaTemplates.terzaghiEarthPressure(data.gamma_s_effective, data.Hq_archHeight, data.p_earthPressure))"></div>
        <div class="formula-tag">(4-2)</div>
      </div>
    </div>

    <!-- 4.2 有限元内力解算 -->
    <div class="section-block">
      <h3 class="section-title">4.2 梁-弹簧有限元结构内力解算</h3>
      <p class="paragraph">
        建立荷载-结构模型（梁-弹簧有限元网格），荷载组合为：<strong>竖向松散土压力 + 侧向梯形分布土压力 + 全断面径向外水压力</strong>。
      </p>
      <div class="fem-results-card">
        <div class="fem-title">最不利截面控制内力（{{ data.criticalSection }}）</div>
        <div class="fem-grid">
          <div class="fem-item">
            <span class="lbl">轴向压力 N：</span>
            <span class="val font-mono">{{ data.axialForce_N.toFixed(1) }} kN</span>
            <span class="remark">（受压为正）</span>
          </div>
          <div class="fem-item">
            <span class="lbl">弯矩 M：</span>
            <span class="val font-mono">{{ data.bendingMoment_M.toFixed(1) }} kN·m</span>
            <span class="remark">（内侧受拉）</span>
          </div>
        </div>
      </div>
    </div>

    <!-- 4.3 截面承载力与安全系数验算 -->
    <div class="section-block">
      <h3 class="section-title">4.3 偏心受压截面强度极限状态验算（JTG 3370.1-2018 附录 N）</h3>
      <p class="paragraph">
        取衬砌每延米构件（截面宽 <span v-html="renderInline('b = 1000\\ \\text{mm}')"></span>，厚度 <span v-html="renderInline(`h = ${data.liningThickness_h}\\ \\text{mm}`)"></span>，有效高度 <span v-html="renderInline(`h_0 = ${data.h0_section}\\ \\text{mm}`)"></span>）按对称配筋矩形截面偏心受压构件进行承载力验算：
      </p>

      <div class="calc-steps">
        <div class="step-item">
          <span class="step-num">1. 界限受压轴力判别：</span>
          <div class="formula-box-mini" v-html="renderBlock(FormulaTemplates.limitAxialForce(data.Rw_concrete, data.sectionWidth_b, data.xi_b, data.h0_section, data.Nb_limitAxial))"></div>
          <p class="step-desc">
            由于实际轴力 <span v-html="renderInline(`N = ${data.axialForce_N.toFixed(1)}\\ \\text{kN} < N_b = ${data.Nb_limitAxial.toFixed(1)}\\ \\text{kN}`)"></span>，判定该截面处于<strong>大偏心受压破坏形态</strong>。
          </p>
        </div>

        <div class="step-item">
          <span class="step-num">2. 轴力作用点偏心距计算：</span>
          <div class="formula-box-mini" v-html="renderBlock(FormulaTemplates.eccentricityDistance(data.bendingMoment_M, data.axialForce_N, data.liningThickness_h, data.as_cover, data.eccentricity_e))"></div>
        </div>

        <div class="step-item">
          <span class="step-num">3. 截面极限抗力矩求解：</span>
          <p class="step-desc">
            受压区高度 <span v-html="renderInline(`x = \\frac{N}{R_w b} = ${(data.compressed_x).toFixed(1)}\\ \\text{mm} < 2a_s = ${2*data.as_cover}\\ \\text{mm}`)"></span>，受压钢筋未屈服，极限抗力矩为：
          </p>
          <div class="formula-box-mini" v-html="renderBlock(FormulaTemplates.limitResistMoment(data.Rg_rebar, data.Ag_rebarArea, data.h0_section, data.as_cover, data.Mu_limitMoment))"></div>
        </div>

        <div class="step-item">
          <span class="step-num">4. 实际截面极限承载安全系数：</span>
          <div class="formula-box" :class="data.isSafe ? 'border-success' : 'border-danger'">
            <div class="formula-content" v-html="renderBlock(FormulaTemplates.actualSafetyFactor(data.Mu_limitMoment, data.axialForce_N, data.eccentricity_e, data.actualSafetyFactor_K))"></div>
            <div class="formula-tag">(4-3)</div>
          </div>
        </div>
      </div>

      <!-- 验算结论判定框 -->
      <div class="judge-box" :class="data.isSafe ? 'is-safe' : 'is-critical'">
        <div class="judge-icon">{{ data.isSafe ? '✅' : '⚠️' }}</div>
        <div class="judge-content">
          <div class="judge-title">
            安全验算判定：{{ data.isSafe ? '结构安全合格' : '结构安全系数超限（需防排水优化）' }}
          </div>
          <div class="judge-desc">
            计算安全系数 <span class="font-mono font-bold">{{ data.actualSafetyFactor_K.toFixed(2) }}</span>，
            规范限值 <span class="font-mono font-bold">[{{ data.allowableSafetyFactor.toFixed(1) }}]</span>。
            {{ data.isSafe 
              ? '当前衬砌截面承载力满足规范允许安全系数要求，可直接进行常规排水系统水力设计。' 
              : '安全系数低于规范允许安全限值 2.00，截面抗力不足，必须通过防排水协同优化与注浆控压加固降低外水压力。' 
            }}
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Chapter4Data } from '../../../utils/calculationBook/bookDataModel';
import { renderBlock, renderInline, FormulaTemplates } from '../../../utils/calculationBook/formulaTemplates';

defineProps<{
  data: Chapter4Data;
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
.paragraph {
  font-size: 9.5pt;
  line-height: 1.6;
  color: #374151;
  margin: 0 0 8px 0;
  text-align: justify;
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
.border-success {
  border-left-color: #10b981 !important;
}
.border-danger {
  border-left-color: #ef4444 !important;
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
.fem-results-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 10px 14px;
  margin: 10px 0;
}
.fem-title {
  font-size: 9.5pt;
  font-weight: 600;
  color: #1e3a8a;
  margin-bottom: 6px;
}
.fem-grid {
  display: flex;
  gap: 24px;
}
.fem-item {
  font-size: 9pt;
  color: #334155;
}
.fem-item .val {
  font-weight: 700;
  color: #1d4ed8;
  margin: 0 4px;
}
.fem-item .remark {
  color: #64748b;
  font-size: 8.5pt;
}
.calc-steps {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin: 10px 0;
}
.step-item {
  background: #fdfefe;
  border: 1px solid #f1f5f9;
  border-radius: 4px;
  padding: 6px 10px;
}
.step-num {
  font-size: 9pt;
  font-weight: 600;
  color: #334155;
  display: block;
  margin-bottom: 4px;
}
.step-desc {
  font-size: 8.5pt;
  color: #475569;
  margin: 4px 0 0 0;
}
.formula-box-mini {
  background: #f8fafc;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 9pt;
}
.judge-box {
  display: flex;
  gap: 12px;
  padding: 10px 14px;
  border-radius: 6px;
  margin-top: 12px;
}
.judge-box.is-safe {
  background-color: #ecfdf5;
  border: 1px solid #a7f3d0;
}
.judge-box.is-critical {
  background-color: #fef2f2;
  border: 1px solid #fecaca;
}
.judge-icon {
  font-size: 16pt;
}
.judge-title {
  font-size: 10pt;
  font-weight: 700;
}
.is-safe .judge-title {
  color: #065f46;
}
.is-critical .judge-title {
  color: #991b1b;
}
.judge-desc {
  font-size: 9pt;
  line-height: 1.5;
  margin-top: 2px;
}
.is-safe .judge-desc {
  color: #047857;
}
.is-critical .judge-desc {
  color: #b91c1c;
}
.font-mono {
  font-family: 'Consolas', 'Courier New', monospace;
}
.font-bold {
  font-weight: 600;
}
</style>
