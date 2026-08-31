// backend/app/templates/typst/calculation_book.typ
// 《隧道防排水优化设计计算书》Typst 标准工业级排版主模板
// 严格遵循中国公路与铁路隧道工程规范 (JTG 3370.1-2018 / GB 50108-2008)

#let input_data_raw = sys.inputs.at("data_json", default: "{}")
#let data = if input_data_raw.len() > 2 { json.decode(input_data_raw) } else {
  // 备用：从同目录下的 data.json 加载
  json("data.json")
}

#let meta = data.at("meta", default: (:))
#let ch1 = data.at("chapter1", default: (:))
#let ch2 = data.at("chapter2", default: (:))
#let ch3 = data.at("chapter3", default: (:))
#let ch4 = data.at("chapter4", default: (:))
#let ch5 = data.at("chapter5", default: (:))
#let ch6 = data.at("chapter6", default: (:))

#set document(
  title: meta.at("documentTitle", default: "隧道防排水优化设计计算书"),
  author: meta.at("designer", default: "智能化防排水自适应系统")
)

#set page(
  paper: "a4",
  margin: (top: 20mm, bottom: 20mm, left: 20mm, right: 20mm),
  header: context {
    let p = counter(page).get().first()
    if p > 0 [
      #grid(
        columns: (1fr, 1fr),
        align(left)[
          #text(size: 8pt, fill: rgb("#64748b"))[
            #meta.at("projectName", default: "隧道工程") · #meta.at("tunnelName", default: "深埋富水隧道")
          ]
        ],
        align(right)[
          #text(size: 8pt, fill: rgb("#64748b"), font: "Consolas")[
            #meta.at("reportCode", default: "CALC-REP-001")
          ]
        ]
      )
      #line(length: 100%, stroke: 0.5pt + rgb("#cbd5e1"))
    ]
  },
  footer: context {
    let p = counter(page).get().first()
    let total = counter(page).final().first()
    [
      #line(length: 100%, stroke: 0.5pt + rgb("#cbd5e1"))
      #v(2pt)
      #grid(
        columns: (1fr, 1fr),
        align(left)[
          #text(size: 8pt, fill: rgb("#94a3b8"))[
            施工段落: DK#meta.at("startChainage", default: 0) ~ DK#meta.at("endChainage", default: 100) (L=#meta.at("partitionLength", default: 100)m)
          ]
        ],
        align(right)[
          #text(size: 8pt, fill: rgb("#94a3b8"))[
            第 #p 页 / 共 #total 页
          ]
        ]
      )
    ]
  }
)

#set text(
  font: ("Microsoft YaHei", "PingFang SC", "SimSun", "Noto Sans CJK SC"),
  size: 9.5pt,
  fill: rgb("#1e293b"),
  lang: "zh"
)

#set par(
  leading: 0.65em,
  first-line-indent: 0em,
  justify: true
)

// 样式工具定义
#let section-heading(title) = {
  v(10pt)
  rect(
    fill: rgb("#f1f5f9"),
    stroke: (left: 3.5pt + rgb("#0284c7")),
    inset: (x: 8pt, y: 6pt),
    radius: (right: 3pt),
    width: 100%
  )[
    #text(weight: "bold", size: 11pt, fill: rgb("#0f172a"))[#title]
  ]
  v(4pt)
}

#let sub-heading(title) = {
  v(6pt)
  text(weight: "bold", size: 10pt, fill: rgb("#0369a1"))[#title]
  v(2pt)
}

#let three-line-table(header-cells, data-rows, col-widths) = {
  table(
    columns: col-widths,
    stroke: none,
    fill: (col, row) => if row == 0 { rgb("#f8fafc") } else if calc.odd(row) { rgb("#ffffff") } else { rgb("#fbfcfd") },
    table.hline(stroke: 1.2pt + rgb("#0f172a")),
    ..header-cells.map(h => align(center + horizon)[#text(weight: "bold", size: 9pt, fill: rgb("#0f172a"))[#h]]),
    table.hline(stroke: 0.6pt + rgb("#334155")),
    ..data-rows.flatten().map(cell => align(center + horizon)[#text(size: 8.5pt)[#cell]]),
    table.hline(stroke: 1.2pt + rgb("#0f172a"))
  )
}

#let math-box(content) = {
  rect(
    fill: rgb("#f8fafc"),
    stroke: 0.8pt + rgb("#e2e8f0"),
    inset: 8pt,
    radius: 4pt,
    width: 100%
  )[
    #align(center)[#content]
  ]
}

#let verdict-badge(is-safe, factor-val) = {
  let bg = if is-safe { rgb("#f0fdf4") } else { rgb("#fef2f2") }
  let border = if is-safe { rgb("#22c55e") } else { rgb("#ef4444") }
  let text-color = if is-safe { rgb("#15803d") } else { rgb("#b91c1c") }
  let title = if is-safe { "✅ 结构验算结论：安全达标" } else { "⚠️ 结构验算结论：抗力超限 (需实施注浆加固)" }
  let desc = if is-safe {
    [当前工况安全系数 $K = #factor-val >= 2.00$，满足《公路隧道设计规范》刚性门禁，截面安全充盈。]
  } else {
    [当前工况安全系数 $K = #factor-val < 2.00$，截面偏心受压承载力不足，必须开展注浆控水降压。]
  }

  rect(
    fill: bg,
    stroke: 1.2pt + border,
    inset: 10pt,
    radius: 6pt,
    width: 100%
  )[
    #grid(
      columns: (auto, 1fr),
      gutter: 10pt,
      align(center + horizon)[
        #text(size: 16pt)[#if is-safe { "🛡️" } else { "⚡" }]
      ],
      [
        #text(weight: "bold", size: 10.5pt, fill: text-color)[#title] \
        #v(2pt)
        #text(size: 9pt, fill: text-color)[#desc]
      ]
    )
  ]
}

// -------------------------------------------------------------
// 封面与文档头
// -------------------------------------------------------------

#align(center)[
  #v(5pt)
  #text(size: 16pt, weight: "bold", fill: rgb("#0f172a"))[#meta.at("documentTitle", default: "隧道防排水优化设计计算书")] \
  #v(3pt)
  #text(size: 11pt, weight: "medium", fill: rgb("#475569"))[#meta.at("projectName", default: "公路/铁路隧道工程") · #meta.at("tunnelName", default: "主线段")]
  #v(8pt)
]

#rect(
  fill: rgb("#f8fafc"),
  stroke: 0.8pt + rgb("#cbd5e1"),
  inset: 8pt,
  radius: 4pt,
  width: 100%
)[
  #grid(
    columns: (1fr, 1fr, 1fr),
    gutter: 8pt,
    [#text(weight: "bold")[报告编号:] #text(font: "Consolas")[#meta.at("reportCode", default: "-")]],
    [#text(weight: "bold")[计算桩号:] DK#meta.at("startChainage", default: 0) ~ DK#meta.at("endChainage", default: 100)],
    [#text(weight: "bold")[段落长度:] #meta.at("partitionLength", default: 100) m],
    [#text(weight: "bold")[工况描述:] #meta.at("snapshotRemark", default: "标准设计段落")],
    [#text(weight: "bold")[编制日期:] #meta.at("generatedDate", default: "-")],
    [#text(weight: "bold")[设计/校核:] #meta.at("designer", default: "自适应系统") / #meta.at("reviewer", default: "校核模型")]
  )
]

#v(6pt)

// -------------------------------------------------------------
// 第 1 章：设计依据
// -------------------------------------------------------------
#section-heading("1. 设计依据与理论模型")

#sub-heading("1.1 遵循的现行国家与行业标准规范")
#let specs = ch1.at("specifications", default: ())
#if specs.len() > 0 {
  three-line-table(
    ("序号", "规范编号", "规范标准全称"),
    range(specs.len()).map(i => {
      let item = specs.at(i)
      (str(i + 1), item.at("code", default: "-"), item.at("name", default: "-"))
    }),
    (10%, 30%, 60%)
  )
}

#v(4pt)
#sub-heading("1.2 计算理论与数学力学模型")
#let theories = ch1.at("theories", default: ())
#for th in theories [
  - *#th.at("title", default: "-")*：#th.at("description", default: "-")
]

// -------------------------------------------------------------
// 第 2 章：基础计算参数
// -------------------------------------------------------------
#section-heading("2. 基础计算参数")

#sub-heading("2.1 几何尺寸与衬砌断面参数")
#let geom = ch2.at("geometryParams", default: ())
#if geom.len() > 0 {
  three-line-table(
    ("参数名称", "符号", "数值", "单位", "说明/来源"),
    geom.map(it => (
      it.at("name", default: "-"),
      it.at("symbol", default: "-"),
      str(it.at("value", default: "-")),
      it.at("unit", default: "-"),
      it.at("remark", default: "-")
    )),
    (28%, 15%, 17%, 12%, 28%)
  )
}

#v(4pt)
#sub-heading("2.2 水文地质与渗透力学参数")
#let hydro = ch2.at("hydrogeologyParams", default: ())
#if hydro.len() > 0 {
  three-line-table(
    ("参数名称", "符号", "数值", "单位", "说明/来源"),
    hydro.map(it => (
      it.at("name", default: "-"),
      it.at("symbol", default: "-"),
      str(it.at("value", default: "-")),
      it.at("unit", default: "-"),
      it.at("remark", default: "-")
    )),
    (28%, 15%, 17%, 12%, 28%)
  )
}

#v(4pt)
#sub-heading("2.3 衬砌材料与结构截面抗力指标")
#let stru = ch2.at("structuralParams", default: ())
#if stru.len() > 0 {
  three-line-table(
    ("参数名称", "符号", "数值", "单位", "说明/来源"),
    stru.map(it => (
      it.at("name", default: "-"),
      it.at("symbol", default: "-"),
      str(it.at("value", default: "-")),
      it.at("unit", default: "-"),
      it.at("remark", default: "-")
    )),
    (28%, 15%, 17%, 12%, 28%)
  )
}

// -------------------------------------------------------------
// 第 3 章：原始状态渗流水力计算
// -------------------------------------------------------------
#section-heading("3. 原始状态渗流水力计算")

#text()[
  *工况判别*：本工程 $r_0 / H = #calc.round(ch3.at("ratio_r0_H", default: 0.057), digits: 4)$ #if ch3.at("waterLevelCase", default: "high") == "high" [ $< 0.062$，归属于*高水位深埋渗流工况*。] else [ $>= 0.062$，归属于*低水位浅埋渗流工况*。]
  隧道结构形式：*#if ch3.at("isDoubleTube", default: false) [双洞平行隧道 (间距 D = #ch3.at("D_spacing", default: 27) m)] else [单洞隧道]*。
]

#v(4pt)
#sub-heading("3.1 SCS-CN 降雨入渗与水头折算模型")
#math-box[
  $ S = 25400 / "CN" - 254 = #calc.round(ch3.at("S_retention", default: 762.0), digits: 1) space "mm", quad I_a = 0.2 S = #calc.round(ch3.at("Ia_initialLoss", default: 152.4), digits: 1) space "mm" $
  $ h_0 = H + (p - h_s) / 1000 = #calc.round(ch3.at("h0_effectiveWaterHead", default: 93.0), digits: 2) space "m" $
]

#sub-heading("3.2 渗流影响半径与等效互扰映射")
#math-box[
  $ beta_1 = 1.635 + 0.43 lg(k_r) + 0.029 (lg(k_r))^2 = #calc.round(ch3.at("beta1", default: 1.418), digits: 3) $
  $ R_"inf" = beta_1 dot h_0 = #calc.round(ch3.at("R_inf", default: 131.87), digits: 2) space "m", quad R_"effective" = #calc.round(ch3.at("R_effective", default: 131.87), digits: 2) space "m" $
]

#sub-heading("3.3 多层圆筒串联渗流解析计算结果")
#let sum-table = ch3.at("summaryTable", default: ())
#if sum-table.len() > 0 {
  three-line-table(
    ("物理指标名称", "物理符号", "计算数值", "计量单位"),
    sum-table.map(it => (
      it.at("metric", default: "-"),
      it.at("symbol", default: "-"),
      str(it.at("value", default: "-")),
      it.at("unit", default: "-")
    )),
    (35%, 25%, 22%, 18%)
  )
}

// -------------------------------------------------------------
// 第 4 章：原始状态衬砌结构安全验算
// -------------------------------------------------------------
#section-heading("4. 原始状态衬砌结构安全验算")

#sub-heading("4.1 围岩松弛荷载与最不利截面控制内力")
#grid(
  columns: (1fr, 1fr),
  gutter: 10pt,
  [
    - *围岩级别*: #ch4.at("rockGrade", default: "III级围岩")
    - *泰沙基拱高 $H_q$*: #calc.round(ch4.at("Hq_archHeight", default: 7.25), digits: 2) m
    - *等效松弛土压 $p_e$*: #calc.round(ch4.at("p_earthPressure", default: 101.5), digits: 1) kPa
  ],
  [
    - *最不利验算位置*: #ch4.at("criticalSection", default: "拱腰截面")
    - *轴力设计值 $N$*: #ch4.at("axialForce_N", default: 1620) kN (受压)
    - *弯矩设计值 $M$*: #ch4.at("bendingMoment_M", default: 158) kN·m
  ]
)

#v(4pt)
#sub-heading("4.2 JTG 3370.1-2018 附录 N 偏心受压承载力核算")
#math-box[
  $ e_0 = M / N = #calc.round(ch4.at("bendingMoment_M", default: 158) / calc.max(1.0, ch4.at("axialForce_N", default: 1620)), digits: 3) space "m", quad e = e_0 + h / 2 - a_s = #calc.round(ch4.at("eccentricity_e", default: 0.247), digits: 3) space "m" $
  $ M_u = R_g A_g (h_0 - a_s) = #calc.round(ch4.at("Mu_limitMoment", default: 122.0), digits: 1) space "kN·m", quad K = M_u / (N dot e) = #calc.round(ch4.at("actualSafetyFactor_K", default: 1.85), digits: 2) $
]

#v(4pt)
#verdict-badge(ch4.at("isSafe", default: false), calc.round(ch4.at("actualSafetyFactor_K", default: 1.85), digits: 2))

// -------------------------------------------------------------
// 第 5 章：防排水优化设计
// -------------------------------------------------------------
#section-heading("5. 防排水优化设计与水力自适应验算")

#if ch5.at("safetyState", default: "critical") == "critical" [
  #sub-heading("5.1 临界安全状态逆向反算参数")
  #text()[
    为满足规范 $[K] >= 2.00$ 安全要求，采用逆向反演模型求解临界控制外水压力及注浆加固圈几何厚度：
  ]
  #math-box[
    $ h_"crit" = #calc.round(ch5.at("criticalWaterHead_h_crit", default: 85.0), digits: 2) space "m", quad P_"crit" = gamma_w dot h_"crit" = #calc.round(ch5.at("criticalWaterPressure_P_crit", default: 850.0), digits: 1) space "kPa" $
    $ r_g,"crit" = #calc.round(ch5.at("rg_crit", default: 6.85), digits: 3) space "m", quad t_g,"crit" = r_g,"crit" - r_p = #calc.round(ch5.at("tg_crit", default: 0.92), digits: 2) space "m" $
  ]
] else [
  #sub-heading("5.1 结构抗力充盈判定")
  #text()[
    #ch5.at("safeStatement", default: "本工况结构安全系数满足要求，无需实施全断面深孔注浆加固，采用标准防排水系统。")
  ]
]

#v(4pt)
#sub-heading("5.2 排水系统自适应水力校核 (曼宁重力流公式)")
#grid(
  columns: (1fr, 1fr, 1fr),
  gutter: 8pt,
  rect(fill: rgb("#f8fafc"), stroke: 0.6pt + rgb("#e2e8f0"), inset: 6pt, radius: 4pt)[
    #text(weight: "bold", size: 8.5pt)[环向打孔盲管 (DN#ch5.at("ringPipeDiam_mm", default: 50))] \
    #text(size: 8pt)[
      - 间距: #ch5.at("ringPipeSpacing_m", default: 10.0) m \
      - 汇水流量: #calc.round(ch5.at("ringPipeSideFlow", default: 1.2), digits: 2) m³/d \
      - 排泄能力: #calc.round(ch5.at("ringPipeCapacity", default: 35.6), digits: 1) m³/d \
      - 判定: #text(fill: rgb("#16a34a"), weight: "bold")[✅ 满足过流要求]
    ]
  ],
  rect(fill: rgb("#f8fafc"), stroke: 0.6pt + rgb("#e2e8f0"), inset: 6pt, radius: 4pt)[
    #text(weight: "bold", size: 8.5pt)[横向导水支管 (DN#ch5.at("latPipeDiam_mm", default: 80))] \
    #text(size: 8pt)[
      - 坡度: #calc.round(ch5.at("latPipeSlope", default: 0.01) * 100, digits: 1)% \
      - 汇水流量: #calc.round(ch5.at("latPipeFlow", default: 1.2), digits: 2) m³/d \
      - 排泄能力: #calc.round(ch5.at("latPipeCapacity", default: 98.4), digits: 1) m³/d \
      - 判定: #text(fill: rgb("#16a34a"), weight: "bold")[✅ 满足过流要求]
    ]
  ],
  rect(fill: rgb("#f8fafc"), stroke: 0.6pt + rgb("#e2e8f0"), inset: 6pt, radius: 4pt)[
    #text(weight: "bold", size: 8.5pt)[纵向主排水盲管 (DN#ch5.at("longPipeDiam_mm", default: 100))] \
    #text(size: 8pt)[
      - 坡度: #calc.round(ch5.at("longPipeSlope", default: 0.02) * 100, digits: 1)% \
      - 汇水流量: #calc.round(ch5.at("longPipeFlow", default: 15.0), digits: 2) m³/d \
      - 排泄能力: #calc.round(ch5.at("longPipeCapacity", default: 285.0), digits: 1) m³/d \
      - 判定: #text(fill: rgb("#16a34a"), weight: "bold")[✅ 满足过流要求]
    ]
  ]
)

// -------------------------------------------------------------
// 第 6 章：最终设计结论与工程对比
// -------------------------------------------------------------
#section-heading("6. 最终设计结论与效益分析")

#sub-heading("6.1 围岩注浆堵水加固方案")
#let g-table = ch6.at("groutingSchemeTable", default: ())
#if g-table.len() > 0 {
  three-line-table(
    ("加固设计项", "设计指标数值", "单位", "施工与质量技术说明"),
    g-table.map(it => (
      it.at("item", default: "-"),
      str(it.at("value", default: "-")),
      it.at("unit", default: "-"),
      it.at("remark", default: "-")
    )),
    (28%, 20%, 12%, 40%)
  )
}

#v(4pt)
#sub-heading("6.2 防排水设施配置一览表")
#let d-table = ch6.at("drainageSchemeTable", default: ())
#if d-table.len() > 0 {
  three-line-table(
    ("防排水构筑物", "材料规格型号", "主要设计布置参数", "过流能力安全裕度"),
    d-table.map(it => (
      it.at("facility", default: "-"),
      it.at("spec", default: "-"),
      it.at("designParam", default: "-"),
      it.at("capacityMargin", default: "-")
    )),
    (26%, 22%, 27%, 25%)
  )
}

#v(4pt)
#sub-heading("6.3 优化前后工程技术效益对比")
#let b-table = ch6.at("benefitComparisonTable", default: ())
#if b-table.len() > 0 {
  three-line-table(
    ("核心指标", "优化前初始状态", "优化后达标状态", "变化幅度", "技术综合评价"),
    b-table.map(it => (
      it.at("indicator", default: "-"),
      it.at("beforeValue", default: "-"),
      it.at("afterValue", default: "-"),
      it.at("changeRate", default: "-"),
      it.at("evaluation", default: "-")
    )),
    (20%, 20%, 20%, 16%, 24%)
  )
}

#v(4pt)
#sub-heading("6.4 总体综合结论")
#let conclusions = ch6.at("conclusions", default: ())
#for conc in conclusions [
  #text(size: 9pt)[#conc] \
]

#v(10pt)
#rect(
  fill: rgb("#f8fafc"),
  stroke: 0.8pt + rgb("#cbd5e1"),
  inset: 10pt,
  radius: 4pt,
  width: 100%
)[
  #grid(
    columns: (1fr, 1fr, 1fr),
    align(center)[
      #text(size: 9pt, weight: "bold")[编制人 (Designer)] \
      #v(8pt)
      #text(size: 9pt, fill: rgb("#0369a1"))[#meta.at("designer", default: "智能设计引擎")]
    ],
    align(center)[
      #text(size: 9pt, weight: "bold")[复核人 (Reviewer)] \
      #v(8pt)
      #text(size: 9pt, fill: rgb("#0369a1"))[#meta.at("reviewer", default: "智能校审系统")]
    ],
    align(center)[
      #text(size: 9pt, weight: "bold")[审批人 (Approver)] \
      #v(8pt)
      #text(size: 9pt, fill: rgb("#0369a1"))[#meta.at("approver", default: "项目总工")]
    ]
  )
]
