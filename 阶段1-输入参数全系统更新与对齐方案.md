# 隧道防排水智能自适应平台 阶段1-输入参数全系统更新与对齐方案

> **文件路径**: `阶段1-输入参数全系统更新与对齐方案.md`  
> **更新基准**: 严格匹配最新计算引擎 [optimizedDesign.py](file:///d:/offices/Github/%E9%9A%A7%E9%81%93%E5%B7%A5%E7%A8%8B%E5%A4%9A%E7%BB%B4%E5%8D%8F%E5%90%8C%E6%99%BA%E8%83%BD%E6%8E%92%E6%B0%B4%E8%87%AA%E9%80%82%E5%BA%94%E5%B9%B3%E5%8F%B0/tunnel-drainage-platform/backend/app/services/optimizedDesign.py)  
> **分析框架**: `/analyzer` 系统分析师标准化规范  

---

## 1. 目标与使命 (Objectives & Mission)

本方案旨在针对平台核心适配层 [drainage_engine.py](file:///d:/offices/Github/%E9%9A%A7%E9%81%93%E5%B7%A5%E7%A8%8B%E5%A4%9A%E7%BB%B4%E5%8D%8F%E5%90%8C%E6%99%BA%E8%83%BD%E6%8E%92%E6%B0%B4%E8%87%AA%E9%80%82%E5%BA%94%E5%B9%B3%E5%8F%B0/tunnel-drainage-platform/backend/app/services/drainage_engine.py) 进行全系统级的参数规范化升级与契约对齐，确保平台水力学与结构力学计算逻辑 100% 严密继承自最新的物理计算引擎 [optimizedDesign.py](file:///d:/offices/Github/%E9%9A%A7%E9%81%93%E5%B7%A5%E7%A8%8B%E5%A4%9A%E7%BB%B4%E5%8D%8F%E5%90%8C%E6%99%BA%E8%83%BD%E6%8E%92%E6%B0%B4%E8%87%AA%E9%80%82%E5%BA%94%E5%B9%B3%E5%8F%B0/tunnel-drainage-platform/backend/app/services/optimizedDesign.py)。

核心目标拆解如下：
1. **计算引擎契约无缝对齐**：厘清并重构 `drainage_engine.py` 的参数转换逻辑，确保其与 `optimizedDesign.py` 内 `parConPre(par)` 的衍生推导机制（如衬砌几何尺寸、拱顶埋深推导等）完全吻合。
2. **输入参数标准化分类**：明确“参与计算参数”、“弃用计算参数”及“特别说明参数”，彻底消除计算层与 UI / 3D 渲染层之间的概念混淆。
3. **全系统闭环协同**：指导后端 API 数据模型 ([schemas.py](file:///d:/offices/Github/%E9%9A%A7%E9%81%93%E5%B7%A5%E7%A8%8B%E5%A4%9A%E7%BB%B4%E5%8D%8F%E5%90%8C%E6%99%BA%E8%83%BD%E6%8E%92%E6%B0%B4%E8%87%AA%E9%80%82%E5%BA%94%E5%B9%B3%E5%8F%B0/tunnel-drainage-platform/backend/app/models/schemas.py))、数据库种子 ([init_db.py](file:///d:/offices/Github/%E9%9A%A7%E9%81%93%E5%B7%A5%E7%A8%8B%E5%A4%9A%E7%BB%B4%E5%8D%8F%E5%90%8C%E6%99%BA%E8%83%BD%E6%8E%92%E6%B0%B4%E8%87%AA%E9%80%82%E5%BA%94%E5%B9%B3%E5%8F%B0/tunnel-drainage-platform/backend/app/db/init_db.py))、前端 Pinia Store ([parameterStore.ts](file:///d:/offices/Github/%E9%9A%A7%E9%81%93%E5%B7%A5%E7%A8%8B%E5%A4%9A%E7%BB%B4%E5%8D%8F%E5%90%8C%E6%99%BA%E8%83%BD%E6%8E%92%E6%B0%B4%E8%87%AA%E9%80%82%E5%BA%94%E5%B9%B3%E5%8F%B0/tunnel-drainage-platform/frontend/src/store/parameterStore.ts))、表单 ([ParameterForm.vue](file:///d:/offices/Github/%E9%9A%A7%E9%81%93%E5%B7%A5%E7%A8%8B%E5%A4%9A%E7%BB%B4%E5%8D%8F%E5%90%8C%E6%99%BA%E8%83%BD%E6%8E%92%E6%B0%B4%E8%87%AA%E9%80%82%E5%BA%94%E5%B9%B3%E5%8F%B0/tunnel-drainage-platform/frontend/src/components/ui/ParameterForm.vue))、Excel 工具与 3D 渲染器的同步更新。

---

## 2. 约束条件 (Constraints)

1. **计算物理算法不可变**：必须严格遵循 `hydrocalc.py` 与 `mechcalc.py` 的物理与力学有限元解算算法，不得擅自篡改中间计算公式与算法常数。
2. **计算引擎几何推导强绑定**：
   - 隧道宽度 $ww = r_s + r_0$
   - 隧道高度 $hh = r_s + r_0$ （力学计算中保持 1:1，高宽比不干预）
   - 衬砌厚度 $tt = r_s - r_0$
   - 拱顶埋深 $depth = h_1 - \frac{r_s + r_0}{2}$ （由隧道中心埋深 $h_1$ 及平均半径自动导出）
3. **接口向下兼容**：后端 `drainage_engine.py` 的 `get_val()` 必须兼容前端提交的历史别名（如 `K` $\rightarrow$ `k_r`, `h` $\rightarrow$ `H`, `r` $\rightarrow$ `r_0`, `r1` $\rightarrow$ `r_s`, `r2` $\rightarrow$ `r_p`, `rg` $\rightarrow$ `r_g`, `c`/`depth` $\rightarrow$ `h_1`）。
4. **功能职责彻底分离**：
   - 弃用参数不得传入 `hydrocalc` / `mechcalc` 进行运算。
   - 标注为“3D 建模专用”的参数仅留在前端 / Three.js 视口渲染使用。

---

## 3. 系统架构与计算参数对齐规范 (Architecture & Parameter Specifications)

### 3.1 核心计算引擎 (`optimizedDesign.py`) 输入参数全量对齐

最新后端求解器 `optimizedDesign.py` 接收的标准输入参数如下：

```python
# ===== 分区起终点桩号（最常修改） =====   
par.start_chainage = 0      # 起点里程 m
par.end_chainage = 47       # 终点里程 m

# ===== 隧道类型（单洞、双洞） =====   
par.tunnel_type = "single"  # single / double

# ===== 水力学参数（最常修改） =====
par.p_mm = 1000.0           # 年降雨量 mm
par.cn_condition = "灌溉良好"
par.land_use = "居住地"
par.H = 120                 # 初始静水位水头 m
par.k_r = 0.15              # 围岩渗透系数 m/d
par.k_s = 0.000864          # 二衬渗透系数 m/d
par.k_p = 0.00864           # 初支渗透系数 m/d
par.k_g = 0.00864           # 注浆圈渗透系数 m/d
par.r_0 = 7.95              # 二衬内半径 m
par.r_s = 8.35              # 二衬外半径 m
par.r_p = 8.57              # 初支外半径 m
par.r_g = 8.57              # 注浆圈外半径 m
par.D_spacing = 40.0        # 双洞中心间距 m（双洞用）

# ===== 结构力学计算参数 =====
par.h_1 = 130               # 隧道中心埋深 m
par.grades = 4              # 围岩级别 (1-6)
par.concrete_grade = 35     # 混凝土级别 (如 30, 35)
par.Ag = 1000                # 配筋面积 mm²
par.as_mm = 50              # 钢筋保护层厚度 mm
par.tol_safety_factor = 2   # 容许安全系数

# ===== 排水管设计参数（一般不改） =====
par.gamma = 10.0            # 水重度 kN/m³
par.double_side = True      # 排水布置形式
par.S_min = 3.0             # 环向管最小间距 m
par.S_max = 10.0            # 环向管最大间距 m

par.n_long = 0.012          # 纵向管糙率
par.i_long = 0.02           # 纵向管坡降
par.n_ring = 0.012          # 环向管糙率
par.i_ring = 0.73           # 环向管坡降
par.n_lat = 0.012           # 横向管糙率
par.i_lat = 0.01            # 横向管坡降

par.d_long0 = 0.10          # 纵向管初始管径 m
par.d_ring0 = 0.05          # 环向管初始管径 m
par.d_lat0 = 0.10           # 横向管初始管径 m
```

### 3.2 全系统输入参数状态分类矩阵

根据最新 `optimizedDesign.py` 逻辑，全系统参数状态划分为三类：

#### 1. 参与计算的输入参数矩阵 (Active Parameters)

| 类别 | 参数 Key | 标准名称 / 归一化键 | 中文名称 | 物理单位 | 默认值 | 作用与推导规则 |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **空间分区** | `start_chainage` | `start_chainage` | 分区起点里程 | m | `0.0` | 计算分区长度 $L = \text{end\_chainage} - \text{start\_chainage}$ |
| | `end_chainage` | `end_chainage` | 分区终点里程 | m | `47.0` | 约束 $\text{end\_chainage} > \text{start\_chainage}$ |
| **拓扑工况** | `tunnel_type` | `tunnel_type` | 隧道洞型 | - | `'single'` | `'single'` / `'double'` 枚举 |
| | `D_spacing` | `D_spacing` | 双洞中心间距 | m | `40.0` | 仅当 `tunnel_type == 'double'` 时参与双洞地下水流场影响计算 |
| **水力学** | `p_mm` | `p_mm` | 年降雨量 | mm | `1000.0` | SCS-CN 降雨下垫面补给计算 |
| | `cn_condition` | `cn_condition` | 灌溉条件 | - | `'灌溉良好'` | 选取 CN 曲线值 |
| | `land_use` | `land_use` | 用地类型 | - | `'居住地'` | 选取 CN 曲线值 |
| | `H` | `H` | 初始静水位水头 | m | `120.0` | 算例水头与工况判别（$r_0 / H \ge 0.062$ 为低水位），清理废弃别名 `h` |
| | `k_r` | `k_r` | 围岩渗透系数 | m/d | `0.15` | 水文地质传导参数，清理废弃别名 `K` |
| | `k_s` | `k_s` | 二衬渗透系数 | m/d | `0.000864` | 防水衬砌渗透参数，清理废弃别名 `K2` |
| | `k_p` | `k_p` | 初支渗透系数 | m/d | `0.00864` | 支护透水参数，清理废弃别名 `K1` |
| | `k_g` | `k_g` | 注浆圈渗透系数 | m/d | `0.00864` | 注浆堵水圈渗透参数，清理废弃别名 `Kg` |
| | `r_0` | `r_0` | 二衬内半径 | m | `7.95` | 衬砌内边界，参与推导 $ww, hh, tt, depth$，清理废弃别名 `r` |
| | `r_s` | `r_s` | 二衬外半径 | m | `8.35` | 衬砌外边界，清理废弃别名 `r1` |
| | `r_p` | `r_p` | 初支外半径 | m | `8.57` | 初支外边界，清理废弃别名 `r2` |
| | `r_g` | `r_g` | 注浆圈外半径 | m | `8.57` | 堵水圈外边界，解算临界注浆半径 $r_{g\_crit}$，清理废弃别名 `rg` |
| **结构力学** | `h_1` | `h_1` | 隧道中心埋深 | m | `130.0` | 导出力学拱顶埋深 $depth = h_1 - (r_s+r_0)/2$，彻底清理历史别名 `c`/`depth`/`ha` |
| | `grades` | `grades` | 围岩级别 | - | `4` | 支持数值 (1-6) 或罗马数字 ('I'-'VI') |
| | `concrete_grade`| `concrete_grade` | 混凝土级别 | - | `'C35'` | 支持 `'C35'` 字符串或数值 `35` |
| | `Ag` | `Ag` | 配筋面积 | mm² | `1000.0` | 引擎自动换算：若 $< 1.0$ 视作 m² 并乘 $10^6$ 转成 mm² |
| | `as_mm` | `as_mm` | 保护层厚度 | mm | `50.0` | 截面受力安全系数验算参数 |
| | `tol_safety_factor`| `tol_safety_factor`| 容许安全系数 | - | `2.0` | 决定是否触发临界注浆堵水反算的阈值 |
| **排水管设计**| `gamma` | `gamma` | 水重度 | kN/m³| `10.0` | 水压力换算 |
| | `S_min` | `S_min` | 环向管最小间距 | m | `3.0` | 排水管选型建议约束 |
| | `S_code_max` | `S_code_max` | 环向管最大间距 | m | `10.0` | 排水管选型建议约束 |
| | `n_long` / `I_long` | `n_long` / `I_long` | 纵向管糙率/坡降 | - | `0.012`/`0.02`| 水力排水过流能力计算 |
| | `n_ring` / `I_ring` | `n_ring` / `I_ring` | 环向管糙率/坡降 | - | `0.012`/`0.73`| 水力排水过流能力计算 |
| | `n_lat` / `I_lat` | `n_lat` / `I_lat` | 横向管糙率/坡降 | - | `0.012`/`0.01`| 水力排水过流能力计算 |
| | `d_long_default`/`d_ring_default`/`d_lat_default` | `default` | 各管初始管径 | m | `0.10`/`0.05`/`0.08` | 排水选型起始迭代基线 |

#### 2. 彻底清理与废弃的历史别称与废弃入参矩阵 (Removed Legacy Aliases & Deprecated Parameters)

| 参数类别 | 历史别称 / 原字段 Key | 归一化标准 Key | 处置说明与清理动作 |
| :--- | :--- | :--- | :--- |
| **埋深别称** | `c`, `depth`, `ha` | `h_1` | **全系统去除**。统一集中为 `h_1`（隧道中心埋深），全系统 Pinia Store、API Schema、UI 表单、数据库种子及 Excel 字典中彻底移除 `c`/`depth`/`ha`。 |
| **单字母水文别名**| `K`, `h` | `k_r`, `H` | **全系统去除**。围岩渗透系数统一采用 `k_r`，初始水头统一采用 `H`。 |
| **衬砌半径别称** | `r`, `r1`, `r2`, `rg` | `r_0`, `r_s`, `r_p`, `r_g` | **全系统去除**。二衬内半径 `r_0`、二衬外半径 `r_s`、初支外半径 `r_p`、注浆圈外半径 `r_g`。 |
| **衬砌渗透别称** | `K1`, `K2`, `Kg` | `k_p`, `k_s`, `k_g` | **全系统去除**。初支渗透 `k_p`、二衬渗透 `k_s`、注浆圈渗透 `k_g`。 |
| **下边界水头** | `ha` | - | **物理水力计算彻底弃用**。从 UI 表单、Pinia Store、Excel 工具与 API Schema 中移除。 |
| **隧道高宽比** | `aspect_ratio` | - | **物理力学计算层彻底弃用**。仅保留前端 Three.js 3D 视口网格建模渲染。 |
| **钢筋类型** | `rebar_type` | - | **物理力学计算层弃用**。`optimizedDesign.py` 内部硬编码 `"HRB400"`，全系统 UI 与 Schema 剔除该字段。 |
| **是否双侧排水** | `double_side` | - | **排水计算逻辑弃用**。全系统 UI 与 Schema 剔除该字段。 |
| **设计涌水量折减**| `beta2`, `q_reduction` | - | **物理计算层彻底废弃**。算法逻辑中无任何调用点，全系统清理相关字段。 |
| **控制水压力输出**| `P_crit` | - | **自变量输入中剥离**。`P_crit` 为计算输出项，从所有输入表单与模板中彻底剥离。 |

#### 3. 特别说明的参数 (Special Remarks)

> [!IMPORTANT]
> **1. 隧道高宽比 `aspect_ratio` (h/w) 特别说明**:  
> - **后端引擎**: 仅作为通用字典接收项，**不参与任何水力学与结构力学计算**（`ww = r_s + r_0`, `hh = r_s + r_0`）。  
> - **前端 3D 可视化**: **仅作为 Three.js 三维几何建模与视口渲染参数**。前端 3D 网格生成器（`DrainagePipeGenerator.ts` / `Viewer3D.vue`）可根据 `aspect_ratio` 调整三维隧道洞身的横向/纵向拉伸比例。  
> 
> **2. 临界控制水压力 `P_crit` 特别说明**:  
> - **属性判定**: `P_crit` 是后端求解器由临界安全系数反算出的**计算输出结果**（`parHc.P_crit = final_water_head * 10`），**不属于用户自变量输入参数**。从输入表单与模板中剥离。  

---

## 4. 后端服务逻辑重构架构 (`drainage_engine.py`)

在 `drainage_engine.py` 中，重构 `run_calculation(data)` 函数，使其执行流程与 `optimizedDesign.py` 保持 100% 对齐：

```mermaid
flowchart TD
    A[接收前端/API 请求数据 data] --> B[解析 get_val 别名映射]
    B --> C[构建 parHc 对象 TunnelParamsHc]
    C --> D[构建 parMc 对象 TunnelParamsMc]
    
    subgraph 几何与埋深推导 (严格对齐 parConPre)
        D --> E1["parMc.ww = parHc.r_s + parHc.r_0"]
        D --> E2["parMc.hh = parHc.r_s + parHc.r_0 (高宽比 1:1)"]
        D --> E3["parMc.tt = parHc.r_s - parHc.r_0"]
        D --> E4["parMc.depth = parHc.h_1 - (parHc.r_s + parHc.r_0)/2"]
    end

    E4 --> F["调用 mc.get_safety_factor(..., 'HRB400', ...) 固定HRB400"]
    F --> G{原始安全系数 nowK > tol_safety_factor?}
    G -- 满足 (无需堵水) --> H[输出原始排水方案 results]
    G -- 不满足 (需注浆堵水) --> I[步进迭代求解容许水头 waterHead]
    I --> J["反算临界注浆半径 rg_crit 与临界方案"]
    J --> K[格式化为 JSON 可序列化字典]
```

### 关键代码改造要点

```python
# tunnel-drainage-platform/backend/app/services/drainage_engine.py

def run_calculation(data):
    # ... 入参字典提取 ...
    
    parHc = hc.TunnelParamsHc()
    # 水力学参数映射
    parHc.k_r = get_val('k_r', get_val('K', parHc.k_r))
    parHc.H = get_val('H', get_val('h', parHc.H))
    parHc.r_0 = get_val('r_0', get_val('r', parHc.r_0))
    parHc.r_s = get_val('r_s', get_val('r1', parHc.r_s))
    parHc.r_p = get_val('r_p', get_val('r2', parHc.r_p))
    parHc.r_g = get_val('r_g', get_val('rg', parHc.r_g))
    parHc.k_s = get_val('k_s', get_val('K2', parHc.k_s))
    parHc.k_p = get_val('k_p', get_val('K1', parHc.k_p))
    parHc.k_g = get_val('k_g', get_val('Kg', parHc.k_g))
    parHc.start_chainage = get_val('start_chainage', parHc.start_chainage)
    parHc.end_chainage = get_val('end_chainage', parHc.end_chainage)
    
    # 隧道中心埋深 h_1
    c_val = get_val('h_1', get_val('c', get_val('depth', get_val('ha', 130.0))))
    parHc.h_1 = c_val
    parHc.tunnel_type = get_val('tunnel_type', parHc.tunnel_type)
    parHc.D_spacing = get_val('D_spacing', parHc.D_spacing)
    
    # 降雨与下垫面及管道参数
    parHc.p_mm = get_val('p_mm', parHc.p_mm)
    parHc.cn_condition = get_val('cn_condition', parHc.cn_condition)
    parHc.land_use = get_val('land_use', parHc.land_use)
    # ... 其他排水管参数 ...

    # 力学参数映射 (严格对齐 parConPre)
    parMc = mc.TunnelParamsMc()
    parMc.ww = parHc.r_s + parHc.r_0
    parMc.hh = parHc.r_s + parHc.r_0  # 彻底去除 aspect_ratio 改变 hh 的分支！
    parMc.tt = parHc.r_s - parHc.r_0
    parMc.depth = parHc.h_1 - (parHc.r_s + parHc.r_0) / 2.0  # 由中心埋深自动推导拱顶埋深
    
    parMc.grades = get_val('grades', parMc.grades)
    parMc.concrete_grade = get_val('concrete_grade', parMc.concrete_grade)
    
    # 配筋面积单位自动纠偏 (< 1.0 时换算成 mm²)
    raw_ag = get_val('Ag', parMc.Ag)
    parMc.Ag = raw_ag * 1e6 if raw_ag < 1.0 else raw_ag
    
    parMc.as_mm = get_val('as_mm', parMc.as_mm)
    parMc.tol_safety_factor = get_val('tol_safety_factor', parMc.tol_safety_factor)

    # 结构安全系数计算 (固定硬编码 HRB400 钢筋)
    # for i in range(len(N)):
    #     Ki = mc.get_safety_factor(-N[i]/1000, abs(M[i])/1000, parMc.concrete_grade, "HRB400", parMc.tt, parMc.Ag, parMc.as_mm)

    # ===== 深度清理 input_parameter 中的废弃旧别名 =====
    deprecated_keys = {'c', 'depth', 'ha', 'K', 'h', 'r', 'r1', 'r2', 'rg', 'K1', 'K2', 'Kg', 'beta2', 'rebar_type', 'double_side', 'P_crit'}
    clean_input_data = {k: v for k, v in input_data.items() if k not in deprecated_keys}
```

---

## 5. 工作分解结构 (Work Breakdown Structure, WBS)

| 阶段 | 任务 ID | 对应文件 | 核心重构与对齐内容 | 依赖项 |
| :--- | :--- | :--- | :--- | :--- |
| **一、后端引擎对齐** | `TSK-BE-01` | `backend/app/services/drainage_engine.py` | 1. 对齐 `parConPre` 几何推导与中心埋深推导；<br>2. 移除 `aspect_ratio` 修改 `hh` 逻辑；<br>3. 钢筋类型硬编码 `"HRB400"`；<br>4. 彻底清理 `beta2` 废弃代码；<br>5. 增加 `clean_input_data` 二次清洗，剔除 `c` 等残留旧别名。 | 无 |
| | `TSK-BE-02` | `backend/app/models/schemas.py` | 清理 Pydantic Schema 中的废弃字段，同步最新字段默认值与校验范式；设置 `extra="ignore"` 隔绝多余别名。 | `TSK-BE-01` |
| | `TSK-BE-03` | `backend/app/db/init_db.py` | 校准种子数据库存储的案例参数 JSON。 | `TSK-BE-02` |
| **二、前端状态机与表单**| `TSK-FE-01` | `frontend/src/store/parameterStore.ts` | 更新 Pinia 默认参数为规范物理数值（`r_0:7.95, r_s:8.35, r_p:8.57, r_g:8.57, h_1:130`），移除废弃属性。 | `TSK-BE-01` |
| | `TSK-FE-02` | `frontend/src/components/ui/ParameterForm.vue` | 1. 移除废弃参数 UI 控件；<br>2. 增加几何梯级防呆校验（$r_0 < r_s < r_p \le r_g$）；<br>3. 明确标注 `aspect_ratio` 为“3D 建模专用”。 | `TSK-FE-01` |
| | `TSK-FE-03` | `frontend/src/components/ui/CaseSelector.vue` | 预设工程案例 JSON 参数 100% 对齐最新输入规范。 | `TSK-FE-01` |
| **三、工具与台账交互** | `TSK-FE-04` | `frontend/src/utils/excelIO.ts` | 调整 Excel 导入导出 `fieldMapping` 字典，更新模板示例行与兼容解析；快照导出自动过滤旧别名。 | `TSK-FE-01` |
| | `TSK-FE-05` | `frontend/src/views/ParameterDatabase.vue` | 优化参数数据库对标抽屉与载入逻辑。 | `TSK-FE-01` |
| **四、3D 渲染与对比** | `TSK-FE-06` | `frontend/src/components/three/*` & `Viewer3D.vue` | 1. 保持 `aspect_ratio` 仅作用于 3D 几何建模网格拉伸，不向后端力学引擎透传；<br>2. 全面校准 `Environment.ts`, `Reinforcement.ts`, `PostProcessing.ts` 优先读取 `h_1`, `H`, `r_0`, `r_p`, `r_g` 标准归一化键。 | `TSK-FE-02` |
| | `TSK-FE-07` | `frontend/src/views/Dashboard.vue` & `CompareView.vue` | 校验快照发送 payload，确保云计算请求数据 100% 契合 `drainage_engine.py`；校准 CompareView 优先读取标准键。 | `TSK-BE-01` |

---

## 6. 验收标准 (Acceptance Criteria)

1. **计算数值 100% 吻合**：
   - 采用标准测试参数（单洞，`start_chainage=0, end_chainage=47, H=120, h_1=130, r_0=7.95, r_s=8.35, r_p=8.57, r_g=8.57, K=0.15` 等），调用 `drainage_engine.py` 得到的原始涌水量 $q = 7.59167 \text{ m}^3/(\text{d}\cdot\text{m})$、分区总涌水量 $Q = 356.809 \text{ m}^3/\text{d}$、拱顶外水压力 $P_{crown} = 798.285 \text{ kPa}$ 及临界注浆半径 $r_{g\_crit} = 9.4613 \text{ m}$ 与 `optimizedDesign.py` 官方基准输出完全一致。
2. **废弃参数彻底隔绝**：
   - 结构力学计算不再依赖 `aspect_ratio` 与 `rebar_type`；
   - 彻底删除 `beta2` 涌水量折减系数，系统运行与导入导出无任何报错；
   - **快照及 API 下载结果 JSON 中彻底消除 `c`, `ha`, `K` 等重复/旧别名键**。
3. **特别参数职责清晰**：
   - 修改 `aspect_ratio` 时，前端 3D 视口内隧道断面呈现相应高宽拉伸，但发往后端计算的结构力学弯矩/轴力和安全系数保持不变。
4. **前端防呆与 3D 链路映射完整**：
   - 用户在表单输入违反 $r_0 < r_s < r_p \le r_g$ 或 $\text{start\_chainage} \ge \text{end\_chainage}$ 的数值时，表单即时拦截并给出精准的物理约束提示。
   - 3D 场景与对比视图 100% 优先读取 `h_1`, `H`, `r_0`, `r_p`, `r_g` 标准键。

