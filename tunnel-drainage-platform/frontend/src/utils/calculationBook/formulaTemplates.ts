// tunnel-drainage-platform/frontend/src/utils/calculationBook/formulaTemplates.ts

import katex from 'katex';

/**
 * 安全渲染 LaTeX 公式至 HTML 字符串
 * @param tex LaTeX 源码
 * @param displayMode 是否为块级独立居中公式
 */
export function renderLatex(tex: string, displayMode: boolean = false): string {
  try {
    return katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
      output: 'htmlAndMathml',
      strict: false
    });
  } catch (err) {
    console.warn('[KaTeX Render Warning]:', err, 'in tex:', tex);
    return `<span class="katex-fallback">${tex}</span>`;
  }
}

/**
 * 渲染行内公式快捷函数
 */
export function renderInline(tex: string): string {
  return renderLatex(tex, false);
}

/**
 * 渲染块级居中公式快捷函数
 */
export function renderBlock(tex: string): string {
  return renderLatex(tex, true);
}

/**
 * 规范化数学公式模板库（支持多行对齐与自动换行，杜绝 A4 页面溢出截断）
 */
export const FormulaTemplates = {
  // --- 第 3 章 渗流水力计算 ---
  waterLevelJudge: (r0: number, H: number, ratio: number) => 
    `\\frac{r_0}{H} = \\frac{${r0.toFixed(2)}}{${H.toFixed(2)}} \\approx ${ratio.toFixed(4)} ${ratio < 0.062 ? '< 0.062' : '\\ge 0.062'}`,

  scsRetention: (cn: number, S: number) =>
    `S = \\frac{25400}{CN} - 254 = \\frac{25400}{${cn}} - 254 = ${S.toFixed(2)}\\ \\text{mm}`,

  scsInitialLoss: (S: number, Ia: number) =>
    `I_a = 0.2 S = 0.2 \\times ${S.toFixed(2)} = ${Ia.toFixed(2)}\\ \\text{mm}`,

  scsRunoff: (p: number, Ia: number, S: number, hs: number) =>
    `\\begin{aligned}
      h_s &= \\frac{(p - I_a)^2}{p - I_a + S} \\\\
          &= \\frac{(${p.toFixed(1)} - ${Ia.toFixed(2)})^2}{${p.toFixed(1)} - ${Ia.toFixed(2)} + ${S.toFixed(2)}} = ${hs.toFixed(2)}\\ \\text{mm}
    \\end{aligned}`,

  scsEffectiveHead: (H: number, p: number, hs: number, h0: number) =>
    `\\begin{aligned}
      h_0 &= H + \\frac{p - h_s}{1000} \\\\
          &= ${H.toFixed(2)} + \\frac{${p.toFixed(1)} - ${hs.toFixed(2)}}{1000} = ${h0.toFixed(4)}\\ \\text{m}
    \\end{aligned}`,

  beta1Factor: (kr: number, beta1: number) =>
    `\\begin{aligned}
      \\beta_1 &= 1.635 + 0.43\\lg k_r + 0.029(\\lg k_r)^2 \\\\
               &= 1.635 + 0.43\\lg(${kr}) + 0.029(\\lg(${kr}))^2 = ${beta1.toFixed(4)}
    \\end{aligned}`,

  singleRadiusInf: (beta1: number, h0: number, R_inf: number) =>
    `R_{\\text{inf}} = \\beta_1 \\cdot h_0 = ${beta1.toFixed(4)} \\times ${h0.toFixed(2)} = ${R_inf.toFixed(2)}\\ \\text{m}`,

  doublePhiAngle: (D: number, R_inf: number, phiDeg: number) =>
    `\\phi = 2\\arccos\\left(\\frac{D/2}{R_{\\text{inf}}}\\right) = 2\\arccos\\left(\\frac{${(D/2).toFixed(2)}}{${R_inf.toFixed(2)}}\\right) = ${phiDeg.toFixed(2)}^\\circ`,

  doubleMappingRadius: (phiDeg: number, R_inf: number, R_map: number) =>
    `\\begin{aligned}
      R_{\\text{map}} &= \\left(1 - \\frac{\\phi}{360^\\circ}\\right) R_{\\text{inf}} + \\frac{R_{\\text{inf}}}{\\pi}\\sin\\frac{\\phi}{2} \\\\
                     &= \\left(1 - \\frac{${phiDeg.toFixed(2)}^\\circ}{360^\\circ}\\right) \\times ${R_inf.toFixed(2)} + \\frac{${R_inf.toFixed(2)}}{\\pi}\\sin\\frac{${phiDeg.toFixed(2)}^\\circ}{2} = ${R_map.toFixed(2)}\\ \\text{m}
    \\end{aligned}`,

  liningPressureHighWater: () =>
    `P = \\frac{\\gamma R \\ln(r_s / r_0)}{\\ln\\frac{r_s}{r_0} + \\frac{k_s}{k_r}\\ln\\frac{R}{r_g} + \\frac{k_s}{k_g}\\ln\\frac{r_g}{r_p} + \\frac{k_s}{k_p}\\ln\\frac{r_p}{r_s}}`,

  liningPressureCalcSub: (gamma: number, R: number, ln_rs_r0: number, denominator: number, P: number) =>
    `P = \\frac{${gamma} \\times ${R.toFixed(2)} \\times ${ln_rs_r0.toFixed(5)}}{${denominator.toFixed(5)}} = ${P.toFixed(2)}\\ \\text{kPa}`,

  unitDischargeCalc: () =>
    `q = \\frac{2\\pi k_r R}{\\ln\\frac{R}{r_g} + \\frac{k_r}{k_g}\\ln\\frac{r_g}{r_p} + \\frac{k_r}{k_p}\\ln\\frac{r_p}{r_s} + \\frac{k_r}{k_s}\\ln\\frac{r_s}{r_0}}`,

  unitDischargeSub: (kr: number, R: number, denomSum: number, q: number) =>
    `\\begin{aligned}
      q &= \\frac{2\\pi \\times ${kr} \\times ${R.toFixed(2)}}{${denomSum.toFixed(4)}} \\\\
        &= ${q.toFixed(4)}\\ \\text{m}^3/(\\text{d}\\cdot\\text{m})
    \\end{aligned}`,

  totalDischargeCalc: (q: number, L: number, Q: number) =>
    `Q = q \\cdot L = ${q.toFixed(4)} \\times ${L.toFixed(2)} = ${Q.toFixed(2)}\\ \\text{m}^3/\\text{d}`,

  // --- 第 4 章 结构力学与偏心受压安全验算 ---
  terzaghiArchHeight: (gradeFactor: number, B: number, Hq: number) =>
    `\\begin{aligned}
      H_q &= 0.45 \\times 2^{\\frac{6 - \\text{grade}}{6}} \\cdot B \\\\
          &= 0.45 \\times 2^{${gradeFactor.toFixed(2)}} \\times ${B.toFixed(2)} = ${Hq.toFixed(2)}\\ \\text{m}
    \\end{aligned}`,

  terzaghiEarthPressure: (gamma_s_eff: number, Hq: number, p: number) =>
    `p = \\gamma'_s \\cdot H_q = ${gamma_s_eff.toFixed(1)} \\times ${Hq.toFixed(2)} = ${p.toFixed(2)}\\ \\text{kPa}`,

  limitAxialForce: (Rw: number, b: number, xi_b: number, h0_sec: number, Nb: number) =>
    `\\begin{aligned}
      N_b &= R_w \\cdot b \\cdot \\xi_b \\cdot h_0 \\\\
          &= ${Rw.toFixed(1)} \\times ${b} \\times ${xi_b} \\times ${h0_sec} \\times 10^{-3} = ${Nb.toFixed(1)}\\ \\text{kN}
    \\end{aligned}`,

  eccentricityDistance: (M: number, N: number, h: number, as_cov: number, e: number) =>
    `\\begin{aligned}
      e &= \\frac{M}{N} + \\frac{h}{2} - a_s \\\\
        &= \\frac{${M.toFixed(1)}}{${N.toFixed(1)}} + \\frac{${h}}{2000} - \\frac{${as_cov}}{1000} = ${e.toFixed(4)}\\ \\text{m}
    \\end{aligned}`,

  limitResistMoment: (Rg: number, Ag: number, h0_sec: number, as_cov: number, Mu: number) =>
    `\\begin{aligned}
      M_u &= R_g \\cdot A_g \\cdot (h_0 - a_s) \\\\
          &= ${Rg} \\times ${Ag} \\times (${h0_sec} - ${as_cov}) \\times 10^{-6} = ${Mu.toFixed(2)}\\ \\text{kN}\\cdot\\text{m}
    \\end{aligned}`,

  actualSafetyFactor: (Mu: number, N: number, e: number, K: number) =>
    `K = \\frac{M_u}{N \\cdot e} = \\frac{${Mu.toFixed(2)}}{${N.toFixed(1)} \\times ${e.toFixed(4)}} = ${K.toFixed(2)}`,

  // --- 第 5 章 临界反算与排水水力 ---
  criticalWaterPressure: (gamma: number, h_crit: number, P_crit: number) =>
    `P_{\\text{crit}} = \\gamma \\cdot h_{\\text{crit}} = ${gamma} \\times ${h_crit.toFixed(2)} = ${P_crit.toFixed(2)}\\ \\text{kPa}`,

  criticalLnRgFormula: () =>
    `\\ln r_g = \\frac{\\frac{\\gamma R \\ln(r_s / r_0)}{P_{\\text{crit}}} - C_0}{k_s \\left( \\frac{1}{k_g} - \\frac{1}{k_r} \\right)}`,

  criticalLnRgSub: (term1: number, C0: number, denom: number, ln_rg: number) =>
    `\\begin{aligned}
      \\ln r_g &= \\frac{${term1.toFixed(5)} - ${C0.toFixed(5)}}{${denom.toFixed(5)}} \\\\
               &= ${ln_rg.toFixed(4)}
    \\end{aligned}`,

  criticalRgRadius: (ln_rg: number, rg_crit: number) =>
    `r_{g,\\text{crit}} = e^{${ln_rg.toFixed(4)}} = ${rg_crit.toFixed(4)}\\ \\text{m}`,

  criticalGroutThickness: (rg_crit: number, rp: number, tg_crit: number) =>
    `t_{g,\\text{crit}} = r_{g,\\text{crit}} - r_p = ${rg_crit.toFixed(4)} - ${rp.toFixed(2)} = ${tg_crit.toFixed(4)}\\ \\text{m}`,

  manningCapacity: () =>
    `Q_{\\text{cap}} = \\frac{86400}{n} A R_h^{2/3} i^{1/2}`,

  manningSubRing: (n: number, A: number, Rh: number, i: number, Q_cap: number) =>
    `\\begin{aligned}
      Q_{\\text{cap}} &= \\frac{86400}{${n}} \\times ${A.toFixed(5)} \\times ${Rh.toFixed(4)}^{2/3} \\times ${i.toFixed(4)}^{1/2} \\\\
                      &= ${Q_cap.toFixed(2)}\\ \\text{m}^3/\\text{d}
    \\end{aligned}`,

  manningSubLong: (n: number, A: number, Rh: number, i: number, Q_cap: number) =>
    `\\begin{aligned}
      Q_{\\text{cap}} &= \\frac{86400}{${n}} \\times ${A.toFixed(5)} \\times ${Rh.toFixed(4)}^{2/3} \\times ${i.toFixed(4)}^{1/2} \\\\
                      &= ${Q_cap.toFixed(2)}\\ \\text{m}^3/\\text{d}
    \\end{aligned}`
};
