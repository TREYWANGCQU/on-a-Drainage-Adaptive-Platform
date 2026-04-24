# Output

## Schemas 定义

提示：

- 在 `backend/app/models/schemas.py` 中，使用 Pydantic 严格定义入参。必须显式区分单洞（33个参数）和双洞（34个参数），并将 12 个默认参数直接写死在模型定义中作为保底值。

- [计算模型](#计算模型)包括4个：单洞低水位/单洞高水位/双洞低水位/双洞高水位。

# Costraints

- 严格依据SourceData

- 直接给出schemas.py, 结出必要注释



# SourceData

## 计算模型

### 单洞低水位

```python

# -*- coding: utf-8 -*-
"""
单洞低水位（以 h 为初始水头）：

修改说明：
1）长度 L 不再直接输入，而是由：
   L = end_chainage - start_chainage
2）CN 不再直接输入，而是由：
   CN = CN_TABLE[cn_condition][land_use]
"""

import math
from dataclasses import dataclass
from typing import Optional, Tuple


# =========================================================
# 0) CN 查表
# =========================================================
CN_TABLE = {
    "灌溉良好": {
        "工业用地": 81,
        "商业用地": 80,
        "居住地": 61,
        "农业用地": 65,
        "牧草地": 39,
        "林地": 25,
    },
    "灌溉较差": {
        "工业用地": 93,
        "商业用地": 95,
        "居住地": 87,
        "农业用地": 86,
        "牧草地": 80,
        "林地": 77,
    }
}


def get_cn_value(cn_condition: str, land_use: str) -> float:
    """
    根据灌溉条件和用地类型查表获取 CN 值
    """
    if cn_condition not in CN_TABLE:
        valid_conditions = list(CN_TABLE.keys())
        raise ValueError(
            f"cn_condition='{cn_condition}' 不在允许范围内。"
            f"可选值为：{valid_conditions}"
        )

    if land_use not in CN_TABLE[cn_condition]:
        valid_land_use = list(CN_TABLE[cn_condition].keys())
        raise ValueError(
            f"land_use='{land_use}' 不在允许范围内。"
            f"在 cn_condition='{cn_condition}' 下可选值为：{valid_land_use}"
        )

    return CN_TABLE[cn_condition][land_use]


# -------- 1) SCS-CN：由 h → h0 --------
def h0_scs_cn(h_m: float, p_mm: float, CN: float) -> float:
    """
    计算有效水头 h0（m）:
      S = 25400/CN - 254     (mm)
      Ia = 0.2*S             (mm)
      hs = (p - Ia)^2/(p - Ia + S)  (mm), 若 p<=Ia 则 hs=0
      h0 = h + (p - hs)/1000 (m)
    """
    S_mm = 25400.0 / CN - 254.0
    Ia_mm = 0.2 * S_mm
    if p_mm <= Ia_mm:
        hs_mm = 0.0
    else:
        hs_mm = (p_mm - Ia_mm) * (p_mm - Ia_mm) / (p_mm - Ia_mm + S_mm)
    return h_m + (p_mm - hs_mm) / 1000.0


# -------- 2) 低水位公式：q2、P2 --------
def lowwater_qP(K, h0, gamma, Kg, K1, K2,
                r, R1, R2, Rg, yc, c) -> Tuple[float, float]:
    """
    返回：
      q2 [m^3/(d·m)]：单位长度涌水量
      P2 [kPa]      ：指定 yc 位置处的二衬外水压力
    """
    ln = math.log
    root = math.sqrt(c * c - r * r)
    R = (r * r) / (c - root)
    a = (c - root) / r

    q0 = (2.0 * math.pi * K * h0 - (math.pi * K * r * a / 2.0)) / ln(R / r)

    denom_betap = (
        ln(h0 / Rg)
        + (K / Kg) * ln(Rg / R2)
        + (K / K2) * ln(R2 / R1)
        + (K / K1) * ln(R1 / r)
    )
    betap = ln(h0 / r) / denom_betap

    denom_beta = (
        ln(R1 / r)
        + (K1 / K2) * ln(R2 / R1)
        + (K1 / Kg) * ln(Rg / R2)
        + (K1 / K)  * ln(h0 / Rg)
    )
    beta = ln(R1 / r) / denom_beta

    q2 = q0 * betap
    P2 = gamma * (beta * h0 - yc)
    return q2, P2


# -------- 3) 由临界 Pcrown 解析反算临界 Rg --------
def solve_Rg_from_Pcrown_crit(Pcrown_crit: float,
                              h0: float,
                              gamma: float,
                              K: float, Kg: float, K1: float, K2: float,
                              r: float, R1: float, R2: float) -> float:
    """
    根据拱顶位置临界外水压力 Pcrown_crit，按原解析关系反算临界注浆圈外半径 Rg_crit
    """
    ln = math.log

    if Pcrown_crit is None:
        raise ValueError("Pcrown_crit 未输入，无法反算临界 Rg。")

    if h0 <= R2:
        raise ValueError("h0 必须大于 R2，否则原公式中 ln(h0/Rg) 不成立。")

    beta_target = (Pcrown_crit / gamma + R1) / h0
    if beta_target <= 0:
        raise ValueError("输入的 Pcrown_crit 过小，导致 beta_target <= 0，无法反算。")

    L1 = ln(R1 / r)
    C0 = L1 + (K1 / K2) * ln(R2 / R1)
    A = K1 / Kg
    B = K1 / K

    if abs(A - B) < 1e-12:
        raise ValueError("当前参数满足 K = Kg，解析式中 Rg 消失，无法唯一反算 Rg。")

    denom_target = L1 / beta_target

    ln_Rg = (denom_target - C0 + A * ln(R2) - B * ln(h0)) / (A - B)
    Rg_crit = math.exp(ln_Rg)

    eps = 1e-7
    if not (R2 + eps < Rg_crit < h0 - eps):
        raise ValueError(
            f"反算得到的 Rg_crit = {Rg_crit:.6f} m 不满足物理约束 R2 < Rg < h0，"
            f"请检查输入的 Pcrown_crit 是否合理。"
        )

    return Rg_crit


# -------- 4) 曼宁满流与反算直径 --------
def manning_Q(d: float, n: float, I: float) -> float:
    """圆管满流量 Q [m^3/d]，d 为内径 [m]"""
    A = math.pi * d**2 / 4.0
    R0 = d / 4.0
    v = (R0 ** (2.0 / 3.0)) * (I ** 0.5) / n
    return A * v * 86400.0


def inv_manning_d_for_Q(Q_target: float, n: float, I: float, d_min: float,
                        d_max: float = 1.0, tol: float = 1e-6,
                        itmax: int = 80) -> float:
    """反算满足 Q_target 的最小内径 d（m），二分法"""
    lo, hi = max(d_min, 1e-4), max(d_min + 1e-4, d_max)
    for _ in range(itmax):
        mid = 0.5 * (lo + hi)
        if manning_Q(mid, n, I) >= Q_target:
            hi = mid
        else:
            lo = mid
        if abs(hi - lo) < tol:
            break
    return hi


def pick_standard_d(d_req: float) -> float:
    """就近取不小于 d_req 的常用标准内径[m]"""
    std = [
        0.050, 0.063, 0.075, 0.080, 0.090, 0.100, 0.110, 0.125,
        0.160, 0.200, 0.225, 0.250, 0.300, 0.315, 0.355, 0.400
    ]
    for d in std:
        if d >= d_req - 1e-12:
            return d
    return std[-1]


# -------- 5) 排水管参数计算 --------
def calc_drain_params(q2: float, Q: float, p) -> Tuple[float, float, float, float, float]:
    """
    根据 q2 和 Q 计算排水管推荐参数：
    返回：
      d_ring_rec, S_ring_rec, d_long_rec, d_lat_rec, S_lat_rec
    """
    divider = 2.0 if p.double_side else 1.0

    Q_ring_def = manning_Q(p.d_ring_default, p.n_ring, p.I_ring)
    Q_lat_def = manning_Q(p.d_lat_default, p.n_lat, p.I_lat)

    S_cap_ring = (divider * Q_ring_def) / q2 if q2 > 0 else float('inf')
    S_cap_lat = (divider * Q_lat_def) / q2 if q2 > 0 else float('inf')
    S_cap = min(S_cap_ring, S_cap_lat)

    S_upper = p.S_code_max if p.S_code_max else float('inf')
    S0 = min(S_cap, S_upper)
    S_rec = max(p.S_min, S0)

    Q_req_side = q2 * S_rec / divider

    d_ring_rec = p.d_ring_default
    d_lat_rec = p.d_lat_default
    d_long_rec = p.d_long_default

    # 环向
    if manning_Q(d_ring_rec, p.n_ring, p.I_ring) + 1e-9 < Q_req_side:
        d_ring_req = inv_manning_d_for_Q(
            Q_req_side, p.n_ring, p.I_ring, d_min=p.d_ring_default
        )
        d_ring_rec = pick_standard_d(d_ring_req)

    # 横向
    if manning_Q(d_lat_rec, p.n_lat, p.I_lat) + 1e-9 < Q_req_side:
        d_lat_req = inv_manning_d_for_Q(
            Q_req_side, p.n_lat, p.I_lat, d_min=p.d_lat_default
        )
        d_lat_rec = pick_standard_d(d_lat_req)

    # 纵向（每侧承担 Q/divider）
    Q_side_need = Q / divider
    if manning_Q(d_long_rec, p.n_long, p.I_long) + 1e-9 < Q_side_need:
        d_long_req = inv_manning_d_for_Q(
            Q_side_need, p.n_long, p.I_long, d_min=p.d_long_default
        )
        d_long_rec = pick_standard_d(d_long_req)

    return d_ring_rec, S_rec, d_long_rec, d_lat_rec, S_rec


# -------- 6) 统一状态计算 --------
def calc_state_by_Rg(Rg_use: float, p, h0: float):
    """
    给定 Rg，统一计算该状态下的：
    q, Q, P_crown, P_invert, 排水管参数
    """
    yc_crown = +p.R1
    yc_invert = -p.R1

    q2, P_crown = lowwater_qP(
        p.K, h0, p.gamma, p.Kg, p.K1, p.K2,
        p.r, p.R1, p.R2, Rg_use, yc_crown, p.c
    )
    _, P_invert = lowwater_qP(
        p.K, h0, p.gamma, p.Kg, p.K1, p.K2,
        p.r, p.R1, p.R2, Rg_use, yc_invert, p.c
    )

    # 这里的 L 已经由起终点里程自动计算
    Q = q2 * p.L

    d_ring_rec, S_ring_rec, d_long_rec, d_lat_rec, S_lat_rec = calc_drain_params(q2, Q, p)

    return {
        "q": q2,
        "Q": Q,
        "P_crown": P_crown,
        "P_invert": P_invert,
        "ring_diam_recommend": d_ring_rec,
        "ring_spacing_recommend": S_ring_rec,
        "long_diam_recommend": d_long_rec,
        "lateral_diam_recommend": d_lat_rec,
        "lateral_spacing_recommend": S_lat_rec,
    }


# -------- 7) 参数 --------
@dataclass
class Params:
    # 水文地质（以 h 为初始水头）
    K: float = 0.15
    h: float = 29.0
    gamma: float = 10.0
    p_mm: float = 1025.2
    Kg: float = 0.00864
    K1: float = 0.000864
    K2: float = 0.00864

    # CN 查表输入
    cn_condition: str = "灌溉良好"
    land_use: str = "居住地"

    # 衬砌/几何
    r: float = 7.95
    R1: float = 8.35
    R2: float = 8.57
    Rg: float = 10.57
    c: float = 32.0

    # 分区起终点里程
    start_chainage: float = 0.0
    end_chainage: float = 47.0

    # 曼宁参数：纵 / 环 / 横
    n_long: float = 0.012
    I_long: float = 0.02
    n_ring: float = 0.012
    I_ring: float = 0.73
    n_lat: float = 0.012
    I_lat: float = 0.01

    # 排水设计控制
    double_side: bool = True
    S_code_max: Optional[float] = 10.0
    S_min: float = 3.0

    # 默认口径
    d_ring_default: float = 0.050
    d_long_default: float = 0.100
    d_lat_default: float = 0.080

    # 临界拱顶水压力输入值
    Pcrown_crit: float = 50
    @property
    def L(self) -> float:
        """
        分区长度 = 终点里程 - 起点里程
        """
        L_val = self.end_chainage - self.start_chainage
        if L_val <= 0:
            raise ValueError(
                f"分区长度 L = {L_val:.6f} m，不合法。"
                f"请检查 start_chainage={self.start_chainage} 和 "
                f"end_chainage={self.end_chainage}，要求终点 > 起点。"
            )
        return L_val

    @property
    def CN(self) -> float:
        """
        由 cn_condition + land_use 查表得到 CN
        """
        return get_cn_value(self.cn_condition, self.land_use)


# -------- 8) 主流程 --------
def main(p: Params):
    # 自动查表得到 CN
    cn_value = p.CN

    # 有效水头
    h0 = h0_scs_cn(p.h, p.p_mm, cn_value)

    # -------- 原始条件 --------
    original = calc_state_by_Rg(p.Rg, p, h0)

    # -------- 临界状态 --------
    Rg_crit = solve_Rg_from_Pcrown_crit(
        Pcrown_crit=p.Pcrown_crit,
        h0=h0,
        gamma=p.gamma,
        K=p.K, Kg=p.Kg, K1=p.K1, K2=p.K2,
        r=p.r, R1=p.R1, R2=p.R2
    )
    tg_crit = Rg_crit - p.R2

    critical = calc_state_by_Rg(Rg_crit, p, h0)

    # 输出
    line = "-" * 60

    print("输入参数自动计算结果：")
    print(f"start_chainage = {p.start_chainage:.3f} m")
    print(f"end_chainage   = {p.end_chainage:.3f} m")
    print(f"L              = {p.L:.3f} m")
    print(f"cn_condition   = {p.cn_condition}")
    print(f"land_use       = {p.land_use}")
    print(f"CN             = {cn_value:.3f}")
    print(line)

    print("原始条件：")
    print(f"q = {original['q']:.5f} m^3/(d·m)")
    print(f"Q = {original['Q']:.5f} m^3/d")
    print(f"P_crown = {original['P_crown']:.4f} kPa")
    print(f"P_invert = {original['P_invert']:.4f} kPa")
    print(f"ring_diam_recommend = {original['ring_diam_recommend']:.3f} m")
    print(f"ring_spacing_recommend = {original['ring_spacing_recommend']:.3f} m")
    print(f"long_diam_recommend = {original['long_diam_recommend']:.3f} m")
    print(f"lateral_diam_recommend = {original['lateral_diam_recommend']:.3f} m")
    print(f"lateral_spacing_recommend = {original['lateral_spacing_recommend']:.3f} m")
    print(line)

    print("临界状态：")
    print(f"Pcrown_crit_input = {p.Pcrown_crit:.4f} kPa")
    print(f"Rg_crit = {Rg_crit:.5f} m")
    print(f"tg_crit = {tg_crit:.5f} m")
    print(f"q = {critical['q']:.5f} m^3/(d·m)")
    print(f"Q = {critical['Q']:.5f} m^3/d")
    print(f"P_invert = {critical['P_invert']:.4f} kPa")
    print(f"ring_diam_recommend = {critical['ring_diam_recommend']:.3f} m")
    print(f"ring_spacing_recommend = {critical['ring_spacing_recommend']:.3f} m")
    print(f"long_diam_recommend = {critical['long_diam_recommend']:.3f} m")
    print(f"lateral_diam_recommend = {critical['lateral_diam_recommend']:.3f} m")
    print(f"lateral_spacing_recommend = {critical['lateral_spacing_recommend']:.3f} m")
    print(line)


if __name__ == "__main__":
    p = Params(
        start_chainage=0.0,
        end_chainage=47.0,
        cn_condition="灌溉良好",
        land_use="居住地"
    )
    main(p)

```

### 单洞高水位

```python

# -*- coding: utf-8 -*-
"""
单洞高水位（以 h 为初始水头）：

修改说明：
1）长度 L 不再直接输入，而是由：
   L = end_chainage - start_chainage
2）CN 不再直接输入，而是由：
   CN = CN_TABLE[cn_condition][land_use]

输出两部分结果：

1）原始条件：
   直接基于输入 Rg 计算
   q, Q, P,
   ring_diam_recommend, ring_spacing_recommend,
   long_diam_recommend, lateral_diam_recommend, lateral_spacing_recommend

2）临界状态：
   由输入 P_crit 反算 Rg_crit，
   再基于 Rg_crit 重新计算
   P_crit_input, Rg_crit, tg_crit,
   q, Q, P,
   ring_diam_recommend, ring_spacing_recommend,
   long_diam_recommend, lateral_diam_recommend, lateral_spacing_recommend

说明：
- P 为高水位条件下统一外水压力，不区分拱顶和仰拱
- q 为设计单位长度涌水量，即 q = beta2 * q_in
- 当 P_crit >= P_max（或在容差内接近 P_max）时，按边界状态处理：Rg_crit = R2，tg_crit = 0
"""

import math
from dataclasses import dataclass
from typing import Optional, Tuple


# =========================================================
# 0) CN 查表
# =========================================================
CN_TABLE = {
    "灌溉良好": {
        "工业用地": 81,
        "商业用地": 80,
        "居住地": 61,
        "农业用地": 65,
        "牧草地": 39,
        "林地": 25,
    },
    "灌溉较差": {
        "工业用地": 93,
        "商业用地": 95,
        "居住地": 87,
        "农业用地": 86,
        "牧草地": 80,
        "林地": 77,
    }
}


def get_cn_value(cn_condition: str, land_use: str) -> float:
    """
    根据灌溉条件和用地类型查表获取 CN 值
    """
    if cn_condition not in CN_TABLE:
        valid_conditions = list(CN_TABLE.keys())
        raise ValueError(
            f"cn_condition='{cn_condition}' 不在允许范围内。"
            f"可选值为：{valid_conditions}"
        )

    if land_use not in CN_TABLE[cn_condition]:
        valid_land_use = list(CN_TABLE[cn_condition].keys())
        raise ValueError(
            f"land_use='{land_use}' 不在允许范围内。"
            f"在 cn_condition='{cn_condition}' 下可选值为：{valid_land_use}"
        )

    return CN_TABLE[cn_condition][land_use]


# ---------- 1) SCS-CN 有效水头 ----------
def h0_scs_cn(h_m: float, p_mm: float, CN: float) -> float:
    """
    计算有效水头 h0（m）
    S = 25400/CN - 254     (mm)
    Ia = 0.2*S             (mm)
    hs = (p - Ia)^2/(p - Ia + S) (mm)，若 p<=Ia 则 hs=0
    h0 = h + (p - hs)/1000 (m)
    """
    S_mm = 25400.0 / CN - 254.0
    Ia_mm = 0.2 * S_mm
    if p_mm <= Ia_mm:
        hs_mm = 0.0
    else:
        hs_mm = (p_mm - Ia_mm) * (p_mm - Ia_mm) / (p_mm - Ia_mm + S_mm)
    return h_m + (p_mm - hs_mm) / 1000.0


# ---------- 2) 高水位渗流与压力（给定 h0 与 Rg） ----------
def seepage_q_and_pressure_given_h0(
    K: float, h0: float, gamma: float, Kg: float, K1: float, K2: float,
    r: float, R1: float, R2: float, Rg: float
) -> Tuple[float, float]:
    """
    返回：
      q_in [m^3/(d·m)]：单位长度隧道涌水量（原始计算值）
      P    [kPa]      ：高水位条件下统一外水压力
    """
    if not (r < R1 < R2 <= Rg < h0):
        raise ValueError("参数不满足 r < R1 < R2 <= Rg < h0，无法进行高水位解析计算。")

    denom_q = (
        math.log(h0 / Rg)
        + (K / Kg) * math.log(Rg / R2)
        + (K / K2) * math.log(R2 / R1)
        + (K / K1) * math.log(R1 / r)
    )
    q_in = (2.0 * math.pi * K * h0) / denom_q  # m^3/(d·m)

    denom_p = (
        (K1 / K) * math.log(h0 / Rg)
        + (K1 / Kg) * math.log(Rg / R2)
        + (K1 / K2) * math.log(R2 / R1)
        + math.log(R1 / r)
    )
    P = gamma * (h0 * math.log(R1 / r) / denom_p)  # kPa

    return q_in, P


# ---------- 3) 由临界压力解析反算临界 Rg ----------
def solve_Rg_from_P_crit(
    P_crit: float,
    h0: float,
    gamma: float,
    K: float, Kg: float, K1: float, K2: float,
    r: float, R1: float, R2: float
) -> float:
    """
    根据高水位统一外水压力临界值 P_crit，按解析关系反算临界注浆圈外半径 Rg_crit。

    特别约定：
    - 当 P_crit >= P_max（或在容差内接近 P_max）时，不报错，
      直接取边界解 Rg_crit = R2。
    """
    if P_crit is None:
        raise ValueError("P_crit 未输入，无法反算临界 Rg。")
    if P_crit <= 0:
        raise ValueError("P_crit 必须大于 0。")
    if h0 <= R2:
        raise ValueError("必须满足 h0 > R2，否则解析式不成立。")

    A = K1 / Kg
    B = K1 / K
    if abs(A - B) < 1e-12:
        raise ValueError("当前参数满足 Kg = K，Rg 在公式中消失，无法唯一反算临界 Rg。")

    ln = math.log
    L1 = ln(R1 / r)
    C0 = (K1 / K2) * ln(R2 / R1) + L1

    # 最大压力：Rg = R2
    denom_p_max = B * ln(h0 / R2) + C0
    P_max = gamma * h0 * L1 / denom_p_max

    # 最小极限压力：Rg -> h0
    denom_p_min = A * ln(h0 / R2) + C0
    P_min = gamma * h0 * L1 / denom_p_min

    P_tol = 1e-4
    Rg_tol = 1e-6

    # 若输入压力达到或略超过最大可实现压力，直接按边界状态处理
    if P_crit >= P_max - P_tol:
        return R2

    # 若小于最小极限压力，仍视为无解
    if P_crit < P_min - P_tol:
        raise ValueError(
            f"P_crit = {P_crit:.6f} kPa 小于该模型可实现的最小极限压力 "
            f"P_min = {P_min:.6f} kPa，因此不存在可行的 Rg_crit。"
        )

    # 解析反算
    denom_target = gamma * h0 * L1 / P_crit

    # denom_target = B*ln(h0/Rg) + A*ln(Rg/R2) + C0
    #              = (A-B)*ln(Rg) + B*ln(h0) - A*ln(R2) + C0
    ln_Rg = (denom_target - B * ln(h0) + A * ln(R2) - C0) / (A - B)
    Rg_crit = math.exp(ln_Rg)

    # 浮点误差修正
    if Rg_crit < R2 and (R2 - Rg_crit) <= Rg_tol:
        Rg_crit = R2

    if Rg_crit >= h0 and (Rg_crit - h0) <= Rg_tol:
        Rg_crit = h0 * (1.0 - 1e-10)

    if not (R2 <= Rg_crit < h0):
        raise ValueError(
            f"反算得到的 Rg_crit = {Rg_crit:.6f} m 不满足物理约束 R2 <= Rg < h0，"
            f"请检查输入的 P_crit 是否合理。"
        )

    return Rg_crit


# ---------- 4) 曼宁(满流) ----------
def manning_Q(d: float, n: float, I: float) -> float:
    """圆管满流量 Q [m^3/d]，d 为内径 [m]"""
    A = math.pi * d**2 / 4.0
    R0 = d / 4.0
    v = (R0 ** (2.0 / 3.0)) * (I ** 0.5) / n  # m/s
    return A * v * 86400.0  # m^3/d


def inv_manning_d_for_Q(
    Q_target: float, n: float, I: float,
    d_min: float, d_max: float = 1.0,
    tol: float = 1e-6, itmax: int = 80
) -> float:
    """反算满足 Q_target 的最小内径 d（m），二分法"""
    lo, hi = max(d_min, 1e-4), max(d_min + 1e-4, d_max)
    for _ in range(itmax):
        mid = 0.5 * (lo + hi)
        if manning_Q(mid, n, I) >= Q_target:
            hi = mid
        else:
            lo = mid
        if abs(hi - lo) < tol:
            break
    return hi


def pick_standard_d(d_req: float) -> float:
    """就近取不小于 d_req 的常用标准内径 [m]"""
    std = [
        0.050, 0.063, 0.075, 0.080, 0.090, 0.100, 0.110, 0.125,
        0.160, 0.200, 0.225, 0.250, 0.300, 0.315, 0.355, 0.400
    ]
    for d in std:
        if d >= d_req - 1e-12:
            return d
    return std[-1]


# ---------- 5) 排水管参数计算 ----------
def calc_drain_params(q_des: float, Q: float, p) -> Tuple[float, float, float, float, float]:
    """
    根据 q_des 和 Q 计算排水管推荐参数：
    返回：
      d_ring_rec, S_ring_rec, d_long_rec, d_lat_rec, S_lat_rec
    """
    divider = 2.0 if p.double_side else 1.0

    Q_ring_def = manning_Q(p.d_ring_default, p.n_ring, p.I_ring)
    Q_lat_def = manning_Q(p.d_lat_default, p.n_lat, p.I_lat)

    S_cap_ring = (divider * Q_ring_def) / q_des if q_des > 0 else float("inf")
    S_cap_lat = (divider * Q_lat_def) / q_des if q_des > 0 else float("inf")
    S_cap = min(S_cap_ring, S_cap_lat)

    S_upper = p.S_code_max if p.S_code_max else float("inf")
    S0 = min(S_cap, S_upper)
    S_rec = max(p.S_min, S0)

    Q_req_side = q_des * S_rec / divider

    d_ring_rec = p.d_ring_default
    d_lat_rec = p.d_lat_default
    d_long_rec = p.d_long_default

    # 环向盲管
    if manning_Q(d_ring_rec, p.n_ring, p.I_ring) + 1e-9 < Q_req_side:
        d_ring_req = inv_manning_d_for_Q(
            Q_req_side, p.n_ring, p.I_ring, d_min=p.d_ring_default
        )
        d_ring_rec = pick_standard_d(d_ring_req)

    # 横向盲管
    if manning_Q(d_lat_rec, p.n_lat, p.I_lat) + 1e-9 < Q_req_side:
        d_lat_req = inv_manning_d_for_Q(
            Q_req_side, p.n_lat, p.I_lat, d_min=p.d_lat_default
        )
        d_lat_rec = pick_standard_d(d_lat_req)

    # 纵向盲管：每侧承担 Q/divider
    Q_side_need = Q / divider
    if manning_Q(d_long_rec, p.n_long, p.I_long) + 1e-9 < Q_side_need:
        d_long_req = inv_manning_d_for_Q(
            Q_side_need, p.n_long, p.I_long, d_min=p.d_long_default
        )
        d_long_rec = pick_standard_d(d_long_req)

    return d_ring_rec, S_rec, d_long_rec, d_lat_rec, S_rec


# ---------- 6) 统一状态计算 ----------
def calc_state_by_Rg(Rg_use: float, p, h0: float):
    """
    给定 Rg，统一计算该状态下的：
    q, Q, P, 排水管参数
    """
    q_in, P = seepage_q_and_pressure_given_h0(
        p.K, h0, p.gamma, p.Kg, p.K1, p.K2,
        p.r, p.R1, p.R2, Rg_use
    )

    q = p.beta2 * q_in
    Q = q * p.L

    d_ring_rec, S_ring_rec, d_long_rec, d_lat_rec, S_lat_rec = calc_drain_params(q, Q, p)

    return {
        "q": q,
        "Q": Q,
        "P": P,
        "ring_diam_recommend": d_ring_rec,
        "ring_spacing_recommend": S_ring_rec,
        "long_diam_recommend": d_long_rec,
        "lateral_diam_recommend": d_lat_rec,
        "lateral_spacing_recommend": S_lat_rec,
    }


# ---------- 7) 输入参数 ----------
@dataclass
class Params:
    # 水文地质
    K: float = 0.15
    h: float = 103.0
    gamma: float = 10.0
    p_mm: float = 1025.2
    Kg: float = 0.00864
    K1: float = 0.000864
    K2: float = 0.00864

    # CN 查表输入
    cn_condition: str = "灌溉良好"
    land_use: str = "居住地"

    # 几何
    r: float = 7.95
    R1: float = 8.35
    R2: float = 8.57
    Rg: float = 8.57

    # 分区起终点里程
    start_chainage: float = 0.0
    end_chainage: float = 47.0

    # 曼宁参数：纵 / 环 / 横
    n_long: float = 0.012
    I_long: float = 0.02
    n_ring: float = 0.012
    I_ring: float = 0.73
    n_lat: float = 0.012
    I_lat: float = 0.01

    # 设计控制
    beta2: float = 1.0
    double_side: bool = True
    S_code_max: Optional[float] = 10.0
    S_min: float = 3.0

    # 默认口径
    d_ring_default: float = 0.050
    d_long_default: float = 0.100
    d_lat_default: float = 0.080

    # 临界压力输入值
    P_crit: float = 500.0

    @property
    def L(self) -> float:
        """
        分区长度 = 终点里程 - 起点里程
        """
        L_val = self.end_chainage - self.start_chainage
        if L_val <= 0:
            raise ValueError(
                f"分区长度 L = {L_val:.6f} m，不合法。"
                f"请检查 start_chainage={self.start_chainage} 和 "
                f"end_chainage={self.end_chainage}，要求终点 > 起点。"
            )
        return L_val

    @property
    def CN(self) -> float:
        """
        由 cn_condition + land_use 查表得到 CN
        """
        return get_cn_value(self.cn_condition, self.land_use)


# ---------- 8) 主流程 ----------
def main(p: Params):
    cn_value = p.CN
    h0 = h0_scs_cn(p.h, p.p_mm, cn_value)

    original = calc_state_by_Rg(p.Rg, p, h0)

    Rg_crit = solve_Rg_from_P_crit(
        P_crit=p.P_crit,
        h0=h0,
        gamma=p.gamma,
        K=p.K, Kg=p.Kg, K1=p.K1, K2=p.K2,
        r=p.r, R1=p.R1, R2=p.R2
    )
    tg_crit = max(0.0, Rg_crit - p.R2)

    critical = calc_state_by_Rg(Rg_crit, p, h0)

    line = "-" * 60

    print("输入参数自动计算结果：")
    print(f"start_chainage = {p.start_chainage:.3f} m")
    print(f"end_chainage   = {p.end_chainage:.3f} m")
    print(f"L              = {p.L:.3f} m")
    print(f"cn_condition   = {p.cn_condition}")
    print(f"land_use       = {p.land_use}")
    print(f"CN             = {cn_value:.3f}")
    print(line)

    print("原始条件：")
    print(f"q = {original['q']:.5f} m^3/(d·m)")
    print(f"Q = {original['Q']:.5f} m^3/d")
    print(f"P = {original['P']:.4f} kPa")
    print(f"ring_diam_recommend = {original['ring_diam_recommend']:.3f} m")
    print(f"ring_spacing_recommend = {original['ring_spacing_recommend']:.3f} m")
    print(f"long_diam_recommend = {original['long_diam_recommend']:.3f} m")
    print(f"lateral_diam_recommend = {original['lateral_diam_recommend']:.3f} m")
    print(f"lateral_spacing_recommend = {original['lateral_spacing_recommend']:.3f} m")
    print(line)

    print("临界状态：")
    print(f"P_crit_input = {p.P_crit:.4f} kPa")
    print(f"Rg_crit = {Rg_crit:.5f} m")
    print(f"tg_crit = {tg_crit:.5f} m")
    print(f"q = {critical['q']:.5f} m^3/(d·m)")
    print(f"Q = {critical['Q']:.5f} m^3/d")
    print(f"P = {critical['P']:.4f} kPa")
    print(f"ring_diam_recommend = {critical['ring_diam_recommend']:.3f} m")
    print(f"ring_spacing_recommend = {critical['ring_spacing_recommend']:.3f} m")
    print(f"long_diam_recommend = {critical['long_diam_recommend']:.3f} m")
    print(f"lateral_diam_recommend = {critical['lateral_diam_recommend']:.3f} m")
    print(f"lateral_spacing_recommend = {critical['lateral_spacing_recommend']:.3f} m")
    print(line)


if __name__ == "__main__":
    p = Params(
        start_chainage=0.0,
        end_chainage=47.0,
        cn_condition="灌溉良好",
        land_use="居住地"
    )
    main(p)
```

### 双洞低水位

```python

# -*- coding: utf-8 -*-
"""
双洞低地下水位：

输出两部分结果：

1）原始条件：
   直接基于输入 rg 计算
   q, Q, P_crown, P_invert,
   ring_diam_recommend, ring_spacing_recommend,
   long_diam_recommend, lateral_diam_recommend, lateral_spacing_recommend

2）临界状态：
   由输入 Pcrown_crit 反算 rg_crit，
   再基于 rg_crit 重新计算
   Pcrown_crit_input, rg_crit, tg_crit,
   q, Q, P_invert,
   ring_diam_recommend, ring_spacing_recommend,
   long_diam_recommend, lateral_diam_recommend, lateral_spacing_recommend

说明：
- 该代码沿用双洞低水位自己的解析式与 X1/X2 修正
- 输出结构、计算流程按单洞低水位那版统一
- 为了能够唯一反算 rg_crit，需要 Kg != K
"""

import math
from dataclasses import dataclass
from typing import Optional, Tuple


# ---------- 0) 工具 ----------
def ln(x: float) -> float:
    return math.log(x)


# ---------- 1) SCS-CN：由 h 得 h0 ----------
def h0_scs_cn(h_m: float, p_mm: float, CN: float) -> float:
    S = 25400.0 / CN - 254.0  # mm
    Ia = 0.2 * S              # mm
    if p_mm <= Ia:
        hs = 0.0
    else:
        hs = (p_mm - Ia) ** 2 / (p_mm - Ia + S)  # mm
    return h_m + (p_mm - hs) / 1000.0           # m


# ---------- 2) β1（log10） & 双洞映射 R_map ----------
def beta1_empirical(K: float, beta2: float) -> float:
    log10K = math.log10(K)
    return 1.6 + 0.44 * log10K + 0.035 * beta2 + 0.029 * (log10K ** 2) - 0.01 * beta2 * log10K


def mapped_R2(R: float, a: float) -> Tuple[float, float, float]:
    """
    a = D / 2
    要求 a / R <= 1
    返回：
      R_map, phi_rad, phi_deg
    """
    phi_rad = 2.0 * math.acos(a / R)
    phi_deg = phi_rad * 180.0 / math.pi
    R_map = (1.0 - phi_deg / 360.0) * R + (R / math.pi) * math.sin(phi_rad / 2.0)
    return R_map, phi_rad, phi_deg


# ---------- 3) 双洞低水位 q2、P2（含 X1 / X2 修正） ----------
def compute_q2_P2_with_X(
    h0: float, ha: float, K: float, gamma: float, Kg: float, K1: float, K2: float,
    r: float, r1: float, r2: float, rg: float,
    a: float, beta2: float, yc: float, c: float
) -> Tuple[float, float]:
    """
    返回：
      q2 [m^3/(d·m)]：单位长度涌水量
      P2 [kPa]      ：给定 yc 位置处外水压力
    """
    # 影响范围
    b1 = beta1_empirical(K, beta2)
    R = b1 * h0
    R_map, _, _ = mapped_R2(R, a)

    # 几何量 R0, A
    root = math.sqrt(c * c - r * r)
    R0 = (r * r) / (c - root)
    A = (c - root) / r

    # --- X1 ---
    def den_q_at(Rx: float) -> float:
        return (
            ln(Rx / rg)
            + (K / Kg) * ln(rg / r2)
            + (K / K2) * ln(r2 / r1)
            + (K / K1) * ln(r1 / r)
        )

    den_R = den_q_at(R)
    den_Rmap = den_q_at(R_map)
    X1 = (R_map / R) * (den_R / den_Rmap)

    den_main_R0 = (
        ln(R0 / rg)
        + (K / Kg) * ln(rg / r2)
        + (K / K2) * ln(r2 / r1)
        + (K / K1) * ln(r1 / r)
    )

    ln_R0_r = ln(R0 / r)
    term_bracket = (
        2.0 * math.pi * K * (h0 - ha) / ln_R0_r
        - (math.pi * K * r * A / 2.0) / ln_R0_r
    )

    q2 = X1 * (ln_R0_r / den_main_R0) * term_bracket

    # --- X2 ---
    def den_p_at_Rx(Rx: float) -> float:
        return (
            ln(r1 / r)
            + (K1 / K) * ln(Rx / rg)
            + (K1 / Kg) * ln(rg / r2)
            + (K1 / K2) * ln(r2 / r1)
        )

    X2 = (R_map / R) * (den_p_at_Rx(R) / den_p_at_Rx(R_map))

    denP_R0 = (
        ln(r1 / r)
        + (K1 / K2) * ln(r2 / r1)
        + (K1 / Kg) * ln(rg / r2)
        + (K1 / K) * ln(R0 / rg)
    )

    P2 = X2 * gamma * (ln(r1 / r) / denP_R0 * h0 - yc)
    return q2, P2


# ---------- 4) 由临界拱顶水压力数值反算临界 rg ----------
def solve_rg_from_Pcrown_crit(
    Pcrown_crit: float,
    h0: float,
    p
) -> float:
    """
    根据临界拱顶水压力 Pcrown_crit 数值反算临界 rg_crit

    说明：
    - 双洞低水位这套公式较复杂，这里采用数值二分法
    - 当 Pcrown_crit >= 当前模型最大可实现拱顶压力时，直接取边界解 rg_crit = r2
    """
    if Pcrown_crit is None:
        raise ValueError("Pcrown_crit 未输入，无法反算临界 rg。")
    if Pcrown_crit <= 0:
        raise ValueError("Pcrown_crit 必须大于 0。")
    if abs(p.Kg - p.K) < 1e-12:
        raise ValueError("当前参数满足 Kg = K，拱顶水压力对 rg 不敏感，无法唯一反算 rg_crit。")

    a = 0.5 * p.D_spacing
    yc_crown = +p.r1

    # 计算几何上限：rg 必须小于 R0
    root = math.sqrt(p.c * p.c - p.r * p.r)
    R0 = (p.r * p.r) / (p.c - root)

    rg_low = p.r2
    rg_high = R0 * (1.0 - 1e-8)

    def Pcrown_of_rg(rg_val: float) -> float:
        _, P_crown = compute_q2_P2_with_X(
            h0, p.ha, p.K, p.gamma, p.Kg, p.K1, p.K2,
            p.r, p.r1, p.r2, rg_val,
            a, p.beta2, yc_crown, p.c
        )
        return P_crown

    P_max = Pcrown_of_rg(rg_low)
    P_min = Pcrown_of_rg(rg_high)

    P_tol = 1e-4
    rg_tol = 1e-6

    # 边界状态：临界压力达到或略超最大可实现值
    if Pcrown_crit >= P_max - P_tol:
        return p.r2

    # 若过小，则认为超出当前模型可实现范围
    if Pcrown_crit < P_min - P_tol:
        raise ValueError(
            f"Pcrown_crit = {Pcrown_crit:.6f} kPa 小于该模型可实现的最小极限拱顶压力 "
            f"P_min = {P_min:.6f} kPa，因此不存在可行的 rg_crit。"
        )

    # 二分法
    f_low = Pcrown_of_rg(rg_low) - Pcrown_crit
    f_high = Pcrown_of_rg(rg_high) - Pcrown_crit

    if f_low * f_high > 0:
        raise ValueError("rg_crit 未能形成有效包络区间，请检查参数组合是否合理。")

    lo, hi = rg_low, rg_high
    for _ in range(100):
        mid = 0.5 * (lo + hi)
        f_mid = Pcrown_of_rg(mid) - Pcrown_crit

        if abs(f_mid) < 1e-8 or abs(hi - lo) < rg_tol:
            rg_crit = mid
            break

        if f_low * f_mid <= 0:
            hi = mid
            f_high = f_mid
        else:
            lo = mid
            f_low = f_mid
    else:
        rg_crit = 0.5 * (lo + hi)

    if rg_crit < p.r2 and (p.r2 - rg_crit) <= rg_tol:
        rg_crit = p.r2

    if not (p.r2 <= rg_crit < R0):
        raise ValueError(
            f"反算得到的 rg_crit = {rg_crit:.6f} m 不满足物理约束 r2 <= rg < R0。"
        )

    return rg_crit


# ---------- 5) 曼宁满流与口径反推 ----------
def manning_Q(d: float, n: float, I: float) -> float:
    A = math.pi * d ** 2 / 4.0
    R0 = d / 4.0
    v = (R0 ** (2.0 / 3.0)) * (I ** 0.5) / n
    return A * v * 86400.0


def inv_manning_d_for_Q(
    Q_target: float, n: float, I: float, d_min: float,
    d_max: float = 1.0, tol: float = 1e-6, itmax: int = 80
) -> float:
    lo, hi = max(d_min, 1e-4), max(d_min + 1e-4, d_max)
    for _ in range(itmax):
        mid = 0.5 * (lo + hi)
        if manning_Q(mid, n, I) >= Q_target:
            hi = mid
        else:
            lo = mid
        if abs(hi - lo) < tol:
            break
    return hi


def pick_standard_d(d_req: float) -> float:
    std = [
        0.050, 0.063, 0.075, 0.080, 0.090, 0.100, 0.110, 0.125,
        0.160, 0.200, 0.225, 0.250, 0.300, 0.315, 0.355, 0.400
    ]
    for d in std:
        if d >= d_req - 1e-12:
            return d
    return std[-1]


# ---------- 6) 排水参数 ----------
def calc_drain_params(q2: float, Q: float, p) -> Tuple[float, float, float, float, float]:
    """
    根据 q2、Q 计算排水参数
    说明：
    - 排水设计仍按 q_des = beta2 * q2
    """
    q_des = p.beta2 * q2
    divider = 2.0 if p.double_side else 1.0

    Q_ring_def = manning_Q(p.d_ring_default, p.n_ring, p.I_ring)
    Q_lat_def = manning_Q(p.d_lat_default, p.n_lat, p.I_lat)

    if q_des > 0:
        S_cap = min(
            (divider * Q_ring_def) / q_des,
            (divider * Q_lat_def) / q_des
        )
    else:
        S_cap = float("inf")

    S_upper = p.S_code_max if p.S_code_max else float("inf")
    S_rec = max(p.S_min, min(S_cap, S_upper))

    Q_req_side = q_des * S_rec / divider

    d_ring_rec = p.d_ring_default
    if manning_Q(d_ring_rec, p.n_ring, p.I_ring) + 1e-9 < Q_req_side:
        d_req = inv_manning_d_for_Q(Q_req_side, p.n_ring, p.I_ring, d_min=d_ring_rec)
        d_ring_rec = pick_standard_d(d_req)

    d_lat_rec = p.d_lat_default
    if manning_Q(d_lat_rec, p.n_lat, p.I_lat) + 1e-9 < Q_req_side:
        d_req = inv_manning_d_for_Q(Q_req_side, p.n_lat, p.I_lat, d_min=d_lat_rec)
        d_lat_rec = pick_standard_d(d_req)

    d_long_rec = p.d_long_default
    Q_side_need = Q / 2.0
    if manning_Q(d_long_rec, p.n_long, p.I_long) + 1e-9 < Q_side_need:
        d_req = inv_manning_d_for_Q(Q_side_need, p.n_long, p.I_long, d_min=d_long_rec)
        d_long_rec = pick_standard_d(d_req)

    return d_ring_rec, S_rec, d_long_rec, d_lat_rec, S_rec


# ---------- 7) 统一状态计算 ----------
def calc_state_by_rg(rg_use: float, p, h0: float):
    a = 0.5 * p.D_spacing

    yc_crown = +p.r1
    yc_invert = -p.r1

    q2, P_crown = compute_q2_P2_with_X(
        h0, p.ha, p.K, p.gamma, p.Kg, p.K1, p.K2,
        p.r, p.r1, p.r2, rg_use,
        a, p.beta2, yc_crown, p.c
    )
    _, P_invert = compute_q2_P2_with_X(
        h0, p.ha, p.K, p.gamma, p.Kg, p.K1, p.K2,
        p.r, p.r1, p.r2, rg_use,
        a, p.beta2, yc_invert, p.c
    )

    Q = q2 * p.L

    d_ring_rec, S_ring_rec, d_long_rec, d_lat_rec, S_lat_rec = calc_drain_params(q2, Q, p)

    return {
        "q": q2,
        "Q": Q,
        "P_crown": P_crown,
        "P_invert": P_invert,
        "ring_diam_recommend": d_ring_rec,
        "ring_spacing_recommend": S_ring_rec,
        "long_diam_recommend": d_long_rec,
        "lateral_diam_recommend": d_lat_rec,
        "lateral_spacing_recommend": S_lat_rec,
    }


# ---------- 8) 参数 ----------
@dataclass
class Params:
    # 1) 水文地质
    K: float = 0.15
    h: float = 29.0
    ha: float = 0.0
    gamma: float = 10.0
    p_mm: float = 1025.2
    CN: float = 61.0

    # 2) 衬砌
    r: float = 7.95
    r1: float = 8.35
    r2: float = 8.57
    rg: float = 8.57

    K1: float = 0.000864
    K2: float = 0.00864
    Kg: float = 0.00864   # 为了能反算临界 rg，默认设为不等于 K

    # 3) 隧道（双洞）
    L: float = 2076.0 - 2029.0
    D_spacing: float = 43.0
    beta2: float = 1.0
    c: float = 32.0

    # 4) 曼宁参数：纵 / 环 / 横
    n_long: float = 0.012
    I_long: float = 0.02

    n_ring: float = 0.012
    I_ring: float = 0.73

    n_lat: float = 0.012
    I_lat: float = 0.73

    # 5) 设计控制
    double_side: bool = True
    S_code_max: Optional[float] = 10.0
    S_min: float = 5.0

    # 6) 默认最小口径
    d_ring_default: float = 0.050
    d_long_default: float = 0.100
    d_lat_default: float = 0.080

    # 7) 临界拱顶压力输入值
    Pcrown_crit: float = 100


# ---------- 9) 主流程 ----------
def main(p: Params):
    h0 = h0_scs_cn(p.h, p.p_mm, p.CN)

    original = calc_state_by_rg(p.rg, p, h0)

    rg_crit = solve_rg_from_Pcrown_crit(
        Pcrown_crit=p.Pcrown_crit,
        h0=h0,
        p=p
    )
    tg_crit = max(0.0, rg_crit - p.r2)

    critical = calc_state_by_rg(rg_crit, p, h0)

    line = "-" * 50

    print("原始条件：")
    print(f"q = {original['q']:.5f} m^3/(d·m)")
    print(f"Q = {original['Q']:.5f} m^3/d")
    print(f"P_crown = {original['P_crown']:.4f} kPa")
    print(f"P_invert = {original['P_invert']:.4f} kPa")
    print(f"ring_diam_recommend = {original['ring_diam_recommend']:.3f} m")
    print(f"ring_spacing_recommend = {original['ring_spacing_recommend']:.3f} m")
    print(f"long_diam_recommend = {original['long_diam_recommend']:.3f} m")
    print(f"lateral_diam_recommend = {original['lateral_diam_recommend']:.3f} m")
    print(f"lateral_spacing_recommend = {original['lateral_spacing_recommend']:.3f} m")
    print(line)

    print("临界状态：")
    print(f"Pcrown_crit_input = {p.Pcrown_crit:.4f} kPa")
    print(f"rg_crit = {rg_crit:.5f} m")
    print(f"tg_crit = {tg_crit:.5f} m")
    print(f"q = {critical['q']:.5f} m^3/(d·m)")
    print(f"Q = {critical['Q']:.5f} m^3/d")
    print(f"P_invert = {critical['P_invert']:.4f} kPa")
    print(f"ring_diam_recommend = {critical['ring_diam_recommend']:.3f} m")
    print(f"ring_spacing_recommend = {critical['ring_spacing_recommend']:.3f} m")
    print(f"long_diam_recommend = {critical['long_diam_recommend']:.3f} m")
    print(f"lateral_diam_recommend = {critical['lateral_diam_recommend']:.3f} m")
    print(f"lateral_spacing_recommend = {critical['lateral_spacing_recommend']:.3f} m")
    print(line)


if __name__ == "__main__":
    main(Params())

```

### 双洞高水位

```python

# -*- coding: utf-8 -*-
"""
双洞高地下水位：

输出两部分结果：

1）原始条件：
   直接基于输入 rg 计算
   q, Q, P,
   ring_diam_recommend, ring_spacing_recommend,
   long_diam_recommend, lateral_diam_recommend, lateral_spacing_recommend

2）临界状态：
   由输入 P_crit 反算 rg_crit，
   再基于 rg_crit 重新计算
   P_crit_input, rg_crit, tg_crit,
   q, Q, P,
   ring_diam_recommend, ring_spacing_recommend,
   long_diam_recommend, lateral_diam_recommend, lateral_spacing_recommend

说明：
- P 为双洞高水位条件下统一外水压力
- q 为单位长度涌水量（解析值）
- 排水设计仍按 q_des = beta2 * q
- 当 P_crit >= P_max（或在容差内接近 P_max）时，按边界状态处理：rg_crit = r2，tg_crit = 0
"""

import math
from dataclasses import dataclass
from typing import Optional, Tuple


# ---------- 1) SCS-CN：由 h 得 h0 ----------
def h0_scs_cn(h_m: float, p_mm: float, CN: float) -> float:
    S = 25400.0 / CN - 254.0          # mm
    Ia = 0.2 * S                      # mm
    if p_mm <= Ia:
        hs = 0.0
    else:
        hs = (p_mm - Ia) ** 2 / (p_mm - Ia + S)  # mm
    return h_m + (p_mm - hs) / 1000.0            # m


# ---------- 2) β1 经验式（log10） ----------
def beta1_empirical(K: float, beta2: float) -> float:
    log10K = math.log10(K)
    return (
        1.6
        + 0.44 * log10K
        + 0.035 * beta2
        + 0.029 * (log10K ** 2)
        - 0.01 * beta2 * log10K
    )


# ---------- 3) 双洞映射 R_map ----------
def mapped_R2(R: float, a: float) -> Tuple[float, float, float]:
    """
    a = D / 2
    要求 a / R <= 1
    返回：
      R_map, phi_rad, phi_deg
    """
    phi_rad = 2.0 * math.acos(a / R)
    phi_deg = phi_rad * 180.0 / math.pi
    R_map = (1.0 - phi_deg / 360.0) * R + (R / math.pi) * math.sin(phi_rad / 2.0)
    return R_map, phi_rad, phi_deg


# ---------- 4) 双洞高水位：q、P ----------
def highwater_double_qP(
    K: float, h0: float, gamma: float, Kg: float, K1: float, K2: float,
    r: float, r1: float, r2: float, rg: float, a: float, beta2: float
) -> Tuple[float, float]:
    """
    返回：
      q [m^3/(d·m)]：单位长度涌水量
      P [kPa]      ：统一外水压力
    """
    b1 = beta1_empirical(K, beta2)
    R = b1 * h0
    if a >= R:
        raise ValueError("当前参数导致 a/R >= 1，无法进行双洞映射计算。")

    R_map, _, _ = mapped_R2(R, a)
    ln = math.log

    # 物理约束：r < r1 < r2 <= rg < R_map
    if not (r < r1 < r2 <= rg < R_map):
        raise ValueError("参数不满足 r < r1 < r2 <= rg < R_map，无法进行双洞高水位解析计算。")

    # 单位长度涌水量 q
    den_q = (
        ln(R_map / rg)
        + (K / Kg) * ln(rg / r2)
        + (K / K2) * ln(r2 / r1)
        + (K / K1) * ln(r1 / r)
    )
    q = 2.0 * math.pi * K * R_map / den_q  # m³/(d·m)

    # 统一外水压力 P
    den_p = (
        ln(r1 / r)
        + (K1 / K) * ln(R_map / rg)
        + (K1 / Kg) * ln(rg / r2)
        + (K1 / K2) * ln(r2 / r1)
    )
    P = gamma * (R_map * ln(r1 / r) / den_p)  # kPa

    return q, P


# ---------- 5) 由临界压力解析反算临界 rg ----------
def solve_rg_from_Pcrit(
    P_crit: float,
    h0: float,
    p
) -> float:
    """
    根据双洞高水位统一外水压力临界值 P_crit，按解析关系反算临界注浆圈外半径 rg_crit。

    特别约定：
    - 当 P_crit >= P_max（或在容差内接近 P_max）时，不报错，
      直接取边界解 rg_crit = r2。
    """
    if P_crit is None:
        raise ValueError("P_crit 未输入，无法反算临界 rg。")
    if P_crit <= 0:
        raise ValueError("P_crit 必须大于 0。")
    if abs(p.Kg - p.K) < 1e-12:
        raise ValueError("当前参数满足 Kg = K，P 对 rg 不敏感，无法唯一反算 rg_crit。")

    a = 0.5 * p.D_spacing
    b1 = beta1_empirical(p.K, p.beta2)
    R = b1 * h0
    if a >= R:
        raise ValueError("当前参数导致 a/R >= 1，无法进行双洞映射计算。")

    R_map, _, _ = mapped_R2(R, a)

    A = p.K1 / p.Kg
    B = p.K1 / p.K
    if abs(A - B) < 1e-12:
        raise ValueError("当前参数满足 Kg = K，解析式中 rg 消失，无法唯一反算 rg_crit。")

    ln = math.log
    L1 = ln(p.r1 / p.r)
    C2 = (p.K1 / p.K2) * ln(p.r2 / p.r1)

    # den_p = L1 + B*ln(R_map/rg) + A*ln(rg/r2) + C2
    #       = L1 + B*ln(R_map) - A*ln(r2) + C2 + (A-B)*ln(rg)
    C0 = L1 + B * ln(R_map) - A * ln(p.r2) + C2

    # 最大压力：rg = r2
    den_p_max = L1 + B * ln(R_map / p.r2) + C2
    P_max = p.gamma * (R_map * L1 / den_p_max)

    # 最小极限压力：rg -> R_map
    rg_upper = R_map * (1.0 - 1e-10)
    den_p_min = (
        L1
        + B * ln(R_map / rg_upper)
        + A * ln(rg_upper / p.r2)
        + C2
    )
    P_min = p.gamma * (R_map * L1 / den_p_min)

    P_tol = 1e-4
    rg_tol = 1e-6

    # 若输入压力达到或略超过最大可实现压力，直接按边界状态处理
    if P_crit >= P_max - P_tol:
        return p.r2

    # 若小于最小极限压力，则认为无解
    if P_crit < P_min - P_tol:
        raise ValueError(
            f"P_crit = {P_crit:.6f} kPa 小于该模型可实现的最小极限压力 "
            f"P_min = {P_min:.6f} kPa，因此不存在可行的 rg_crit。"
        )

    # 解析反算
    denom_target = p.gamma * R_map * L1 / P_crit

    # denom_target = C0 + (A-B)*ln(rg)
    ln_rg = (denom_target - C0) / (A - B)
    rg_crit = math.exp(ln_rg)

    # 浮点误差修正
    if rg_crit < p.r2 and (p.r2 - rg_crit) <= rg_tol:
        rg_crit = p.r2

    if rg_crit >= R_map and (rg_crit - R_map) <= rg_tol:
        rg_crit = R_map * (1.0 - 1e-10)

    if not (p.r2 <= rg_crit < R_map):
        raise ValueError(
            f"反算得到的 rg_crit = {rg_crit:.6f} m 不满足物理约束 r2 <= rg < R_map，"
            f"请检查输入的 P_crit 是否合理。"
        )

    return rg_crit


# ---------- 6) 曼宁满流 ----------
def manning_Q(d: float, n: float, I: float) -> float:
    A = math.pi * d**2 / 4.0
    R0 = d / 4.0
    v = (R0 ** (2.0 / 3.0)) * (I ** 0.5) / n
    return A * v * 86400.0   # m³/d


def inv_manning_d_for_Q(
    Q_target: float, n: float, I: float, d_min: float,
    d_max: float = 1.0, tol: float = 1e-6, itmax: int = 80
) -> float:
    lo, hi = max(d_min, 1e-4), max(d_min + 1e-4, d_max)
    for _ in range(itmax):
        mid = 0.5 * (lo + hi)
        if manning_Q(mid, n, I) >= Q_target:
            hi = mid
        else:
            lo = mid
        if abs(hi - lo) < tol:
            break
    return hi


def pick_standard_d(d_req: float) -> float:
    std = [
        0.050, 0.063, 0.075, 0.080,
        0.090, 0.100, 0.110, 0.125,
        0.160, 0.200, 0.225, 0.250,
        0.300, 0.315, 0.355, 0.400
    ]
    for d in std:
        if d >= d_req - 1e-12:
            return d
    return std[-1]


# ---------- 7) 排水参数 ----------
def calc_drain_params(q: float, Q: float, p) -> Tuple[float, float, float, float, float]:
    """
    根据 q、Q 计算排水参数
    说明：
    - 排水设计按 q_des = beta2 * q
    """
    q_des = p.beta2 * q
    divider = 2.0 if p.double_side else 1.0

    Q_ring = manning_Q(p.d_ring_default, p.n_ring, p.I_ring)
    Q_lat = manning_Q(p.d_lat_default, p.n_lat, p.I_lat)

    if q_des > 0:
        S_cap = min(
            (divider * Q_ring) / q_des,
            (divider * Q_lat) / q_des
        )
    else:
        S_cap = float("inf")

    S_upper = p.S_code_max if p.S_code_max else float("inf")
    S_rec = max(p.S_min, min(S_cap, S_upper))

    Q_req = q_des * S_rec / divider

    d_ring = p.d_ring_default
    if manning_Q(d_ring, p.n_ring, p.I_ring) + 1e-9 < Q_req:
        d_ring = pick_standard_d(
            inv_manning_d_for_Q(Q_req, p.n_ring, p.I_ring, d_ring)
        )

    d_lat = p.d_lat_default
    if manning_Q(d_lat, p.n_lat, p.I_lat) + 1e-9 < Q_req:
        d_lat = pick_standard_d(
            inv_manning_d_for_Q(Q_req, p.n_lat, p.I_lat, d_lat)
        )

    d_long = p.d_long_default
    Q_side_need = Q / 2.0
    if manning_Q(d_long, p.n_long, p.I_long) + 1e-9 < Q_side_need:
        d_long = pick_standard_d(
            inv_manning_d_for_Q(Q_side_need, p.n_long, p.I_long, d_long)
        )

    return d_ring, S_rec, d_long, d_lat, S_rec


# ---------- 8) 统一状态计算 ----------
def calc_state_by_rg(rg_use: float, p, h0: float):
    a = 0.5 * p.D_spacing

    q, P = highwater_double_qP(
        p.K, h0, p.gamma, p.Kg, p.K1, p.K2,
        p.r, p.r1, p.r2, rg_use, a, p.beta2
    )
    Q = q * p.L

    d_ring, S_ring, d_long, d_lat, S_lat = calc_drain_params(q, Q, p)

    return {
        "q": q,
        "Q": Q,
        "P": P,
        "ring_diam_recommend": d_ring,
        "ring_spacing_recommend": S_ring,
        "long_diam_recommend": d_long,
        "lateral_diam_recommend": d_lat,
        "lateral_spacing_recommend": S_lat,
    }


# ---------- 9) 输入参数 ----------
@dataclass
class Params:
    # 水文地质
    K: float = 0.3
    h: float = 90.5
    gamma: float = 10.0
    p_mm: float = 1002.5
    CN: float = 61.0

    # 衬砌
    r: float = 8.3
    r1: float = 8.8
    r2: float = 9.0
    rg: float = 9.0

    K1: float = 0.000864
    K2: float = 0.00864
    Kg: float = 0.00864

    # 隧道（双洞）
    L: float = 405.0 - 310.0
    D_spacing: float = 40.0
    beta2: float = 0.5

    # 曼宁参数
    n_long: float = 0.012
    I_long: float = 0.02
    n_ring: float = 0.012
    I_ring: float = 0.75
    n_lat: float = 0.012
    I_lat: float = 0.01

    # 设计控制
    double_side: bool = True
    S_code_max: Optional[float] = 10.0
    S_min: float = 3.0

    # 默认最小管径
    d_ring_default: float = 0.050
    d_long_default: float = 0.100
    d_lat_default: float = 0.080

    # 临界压力输入值
    P_crit: float = 600
# ---------- 10) 主流程 ----------
def main(p: Params):
    h0 = h0_scs_cn(p.h, p.p_mm, p.CN)

    original = calc_state_by_rg(p.rg, p, h0)

    rg_crit = solve_rg_from_Pcrit(
        P_crit=p.P_crit,
        h0=h0,
        p=p
    )
    tg_crit = max(0.0, rg_crit - p.r2)

    critical = calc_state_by_rg(rg_crit, p, h0)

    line = "-" * 50

    print("原始条件：")
    print(f"q = {original['q']:.5f} m^3/(d·m)")
    print(f"Q = {original['Q']:.5f} m^3/d")
    print(f"P = {original['P']:.4f} kPa")
    print(f"ring_diam_recommend = {original['ring_diam_recommend']:.3f} m")
    print(f"ring_spacing_recommend = {original['ring_spacing_recommend']:.3f} m")
    print(f"long_diam_recommend = {original['long_diam_recommend']:.3f} m")
    print(f"lateral_diam_recommend = {original['lateral_diam_recommend']:.3f} m")
    print(f"lateral_spacing_recommend = {original['lateral_spacing_recommend']:.3f} m")
    print(line)

    print("临界状态：")
    print(f"P_crit_input = {p.P_crit:.4f} kPa")
    print(f"rg_crit = {rg_crit:.5f} m")
    print(f"tg_crit = {tg_crit:.5f} m")
    print(f"q = {critical['q']:.5f} m^3/(d·m)")
    print(f"Q = {critical['Q']:.5f} m^3/d")
    print(f"P = {critical['P']:.4f} kPa")
    print(f"ring_diam_recommend = {critical['ring_diam_recommend']:.3f} m")
    print(f"ring_spacing_recommend = {critical['ring_spacing_recommend']:.3f} m")
    print(f"long_diam_recommend = {critical['long_diam_recommend']:.3f} m")
    print(f"lateral_diam_recommend = {critical['lateral_diam_recommend']:.3f} m")
    print(f"lateral_spacing_recommend = {critical['lateral_spacing_recommend']:.3f} m")
    print(line)


if __name__ == "__main__":
    main(Params())

```



## 整体技术架构

````md

{### 一、 总体系统架构



平台采用前后端分离架构，确保计算逻辑与表现层解耦，支持跨端部署。



* **前端渲染层 (Web & 3D)**：采用 Vue 3 + TypeScript 框架。2D UI 组件库选用 Element Plus 或 Ant Design Vue，保障表单重负载场景下的性能；3D 渲染引擎选用 Three.js，支持轻量化且高定制化的 WebGL 图形展示。

* **桌面端容器 (客户端套壳)**：选用 Tauri 或 Electron。Tauri 基于 Rust 开发，打包体积更小、内存占用更低，符合轻量化客户端需求；Electron 生态更为成熟。两者均可完美封装 HTML5 前端页面。

* **后端 API 服务层**：采用 Python FastAPI 框架。由于底层计算模型已完全由 Python 函数构建，FastAPI 可实现原生无缝集成。FastAPI 具备极高的并发性能，且自动生成 OpenAPI (Swagger) 接口文档，直接满足向第三方输出 POST API 请求的要求。



### 二、 核心模块技术实现



#### 1. API 接口与数据流转 

* **请求规范**：计算请求统一通过 `POST /api/v1/calculate/drainage` 触发。

* **报文结构**：采用 JSON 格式。请求体包含 `tunnel_type` (单洞/双洞) 及对应的参数字典。

* **第三方调用**：通过标准 RESTful API 及 Bearer Token 鉴权，支持外部系统（如综合管廊平台、BIM 平台）直接 POST 传参并获取间距、孔径等优化布置结果。



#### 2. 参数输入与 UI 交互设计 

针对前端 33/34 个高密度参数，核心设计逻辑为“分区分级、逐步披露”，降低用户的认知负荷。



* **分模块折叠面板 (Accordion)**：将参数按工程逻辑物理隔离。例如分为“地质水文参数”、“结构尺寸参数”、“材料属性参数”。

* **参数分级与默认值封装**：

    * **核心输入区**：直接展示 15/16 个核心输入参数及 6 个复选参数。

    * **高级设置区**：将其余 12 个默认参数折叠隐藏，默认填入规范推荐值或经验值。用户如需修改，展开“高级设置”面板即可干预。

* **典型案例库 (一键赋值)**：开发“预设模板”功能。内置如“标准岩溶发育区双洞”、“高水压富水断层单洞”等工程案例。用户下拉选择对应案例后，表单 33 个参数瞬间完成自动赋值。

* **批量数据 IO**：依托前端 `xlsx` 库或后端 Pandas 解析，支持下载标准 Excel 模板，用户在本地填好参数后一键导入；同样支持将当前表单的参数组合导出为 `.json` 或 `.xlsx` 存档。



#### 3. 3D 模型构建与可视化交互 

3D 模块的核心是**参数化生成**与**数据双向绑定**，无需导入外部庞大的 BIM 模型。



* **低参数隧道构建 (逐环生成)**：

    * 在 Three.js 中定义基础“计算单元（一环）”的几何体（如圆柱壳体或马蹄形截面）。

    * 基于传入的隧道总长度和单环长度，使用 `THREE.InstancedMesh` (实例化网格) 技术进行线性阵列复制。这能确保在生成数百环隧道时，依然保持 60FPS 的渲染帧率。

* **3D 交互控制 (旋转/剖切/隐藏)**：

    * **旋转与缩放**：引入 `OrbitControls` 实现鼠标拖拽旋转、滚轮缩放。

    * **剖切功能**：利用 Three.js 的 `ClippingPlanes` 特性，设置横向或纵向的剪裁平面，通过 UI 滑块实时调整剖切深度，查看隧道内部。

    * **局部隐藏**：将隧道衬砌、初支、围岩、排水管分为不同的 `Group` 或 `Layer`。通过 UI 树形图（图层管理器）控制各图层的 `visible` 属性，实现局部隐藏。

* **计算结果映射与拾取 (参数反显)**：

    * 后端计算返回间距、孔径数据后，前端根据这些数据，在 3D 空间内的特定坐标点生成排水管网格模型。

    * 引入 `Raycaster` (射线拾取)。用户在 3D 模型中点击某段排水管时，高亮该管段，并在鼠标位置弹出 HTML 浮窗 (Tooltip)，精准显示该管段的“间距：XX m，孔径：XX mm”。

* **多方案 3D 对比机制**：

    * 支持“分屏对比 (Split Screen)”模式。在一个 WebGL Canvas 中设置两个独立的 Camera 和 Viewport，左侧显示方案 A 的 3D 结果，右侧显示方案 B 的结果。

    * 两侧视角支持联动（同步旋转/缩放），直观暴露不同计算参数下，排水管网空间布置密度的视觉差异。



#### 4. 3D模型美化

- 注浆圈 (Grouting Ring)：



几何生成：无需创建复杂的实体模型。基于隧道断面曲线，通过 THREE.RingGeometry 或 THREE.CylinderGeometry 的半径差（内径=隧道外径，外径=隧道外径+注浆厚度）进行程序化生成。



视觉美化：采用半透明材质（Transparent: true, Opacity: 0.4~0.6），并配合噪点贴图或简单的着色器（Shader）模拟注浆后的非均匀扩散效果。



- 锚杆 (Anchors)：



几何生成：将锚杆简化为具有长度和直径的线段或极细的圆柱体（THREE.CylinderGeometry）。



参数化排布：基于极坐标计算。给定锚杆环向间距（角度间隔）和纵向间距，利用 sin 和 cos 函数自动定位锚杆的起点（隧道内表面）与终点（指向围岩深处）。



性能优化：由于锚杆数量众多，必须使用 THREE.InstancedMesh（实例化网格）技术，只需一次渲染调用即可绘制成千上万根锚杆，确保低性能设备下依然流畅。



针对 WebGL (Three.js) 渲染的工程类轻量化模型，在不增加外部模型体积的前提下，可以从**材质表现、光影后期、工程风格**三个维度进行低开销的视觉升级：



**1. PBR 材质与程序化纹理（消除塑料感）**

* **表面微观细节：** 放弃纯色材质，采用 `MeshStandardMaterial`。通过向着色器中注入轻量级的程序化噪声（如 Perlin Noise），动态生成围岩或混凝土衬砌的凹凸感（法线）与粗糙度，完全不需要加载外部高清贴图。

* **潮湿/水流物理模拟：** 作为排水平台，在底部中央排水沟或盲管位置，降低材质的粗糙度（Roughness）以增强高光反射。配合 UV 坐标的简单平移循环动画，能够以极低的性能开销模拟出“潮湿表面”和“水流滑动”的视觉特征。



**2. 后期处理管道（增强空间与交互质感）**

* **SSAO（屏幕空间环境光遮蔽）：** 隧道内部结构紧凑，开启 SSAO 后，排水管与隧道壁的接合处、多层注浆圈的交界处会自动产生真实的接触暗部阴影，大幅增强 3D 场景的厚重感和空间层次。

* **Outline/Bloom Pass（泛光描边）：** 优化鼠标拾取（Hover/Click）交互。当用户选中某段排水管查看间距、孔径参数时，停用生硬的整体变色，改用边缘发光描边（Outline）或局部泛光（Bloom），UI 反馈更具现代感。



**3. 引入“科技蓝图 / X光”着色器（契合专业审美）**

* **菲涅尔透视（Fresnel Shader）：** 原生的半透明材质在叠加多层结构（隧道壁、注浆圈、内部管网）时易产生深度排序冲突。通过自定义菲涅尔着色器，使几何体边缘发亮、中心高透。

* **线框叠加融合：** 结合 `WireframeGeometry`，让外围结构呈现“科技线框 + 边缘发光”的透视状态。视觉焦点将自然收束在内部实体的排水管网上，呈现出类似 CAD 或 BIM 软件的专业高级感。



**4. 粒子轨迹演示（动态数据可视化）**

* **轻量级水流示意：** 在得出最优排水管孔径和间距后，沿排水管网的空间路径实例化生成少量 `THREE.Points`（粒子）。通过简单的循环动画演示水滴汇集并沿管道排出的轨迹，让静态的计算结果具备直观的动态验证效果。



### 三、工程文件目录架构



基于前述确定的 Vue 3 + Three.js (前端)、FastAPI (后端) 及 Tauri (桌面端) 技术栈，以下为面向落地的标准 Monorepo (单体仓库) 工程目录结构。该结构物理隔离了计算逻辑、UI 交互与 3D 渲染模块，确保代码的可维护性。

```text

tunnel-drainage-platform/

├── backend/                              # Python FastAPI 后端服务

│   ├── app/

│   │   ├── api/

│   │   │   └── v1/

│   │   │       └── endpoints/

│   │   │           └── calculate.py      # POST API 路由 (/api/v1/calculate/drainage)

│   │   ├── core/

│   │   │   └── config.py                 # 全局配置 (CORS, 环境变量)

│   │   ├── models/

│   │   │   └── schemas.py                # Pydantic 数据验证模型 (严格定义33/34个参数及默认值)

│   │   └── services/

│   │       └── drainage_engine.py        # 核心：封装已有的 Python 排水计算模型函数

│   ├── requirements.txt                  # 后端依赖声明

│   └── main.py                           # FastAPI 启动入口

│

├── frontend/                             # Vue 3 + TS + Three.js 前端应用

│   ├── src/

│   │   ├── api/

│   │   │   └── index.ts                  # Axios 请求封装，对接后端计算 API

│   │   ├── assets/

│   │   │   └── shaders/                  # 自定义着色器代码 (菲涅尔透视、水流模拟)

│   │   ├── components/

│   │   │   ├── ui/                       # 2D 交互组件库

│   │   │   │   ├── ParameterForm.vue     # 高密度参数表单 (分区分级折叠面板)

│   │   │   │   └── CaseSelector.vue      # 典型案例一键赋值组件

│   │   │   └── three/                    # 3D 渲染核心模块

│   │   │       ├── Viewer3D.vue          # 3D 画布容器

│   │   │       ├── TunnelGenerator.ts    # 隧道主体及管网参数化生成逻辑 (InstancedMesh)

│   │   │       ├── Reinforcement.ts      # 注浆圈与锚杆生成逻辑

│   │   │       └── PostProcessing.ts     # 后期处理管道 (SSAO, OutlinePass)

│   │   ├── store/

│   │   │   └── parameterStore.ts         # Pinia 状态管理 (集中维护33/34个参数及响应式联动)

│   │   ├── utils/

│   │   │   ├── excelIO.ts                # 封装 SheetJS，支持参数批量导入/导出

│   │   │   └── math.ts                   # 前端辅助计算工具

│   │   ├── views/

│   │   │   ├── Dashboard.vue             # 主控工作台界面

│   │   │   └── CompareView.vue           # 3D 分屏对比视图

│   │   ├── App.vue

│   │   └── main.ts                       # Vue 启动入口

│   ├── package.json                      # 前端依赖 (vue, three, element-plus 等)

│   └── vite.config.ts                    # 构建配置

│

└── desktop/                              # Tauri 桌面端套壳容器 (轻量级)

    ├── src-tauri/

    │   ├── src/

    │   │   └── main.rs                   # Rust 入口，管理原生系统级 API 和窗口

    │   ├── tauri.conf.json               # Tauri 配置文件 (定义窗口尺寸、打包配置)

    │   └── Cargo.toml                    # Rust 依赖声明

    └── build.rs                          # Tauri 构建脚本

```



### 关键目录设计说明



1. **`backend/app/models/schemas.py`**: 利用 Pydantic 构建严格的输入验证层。在此处定义 15/16 个必填输入参数，6 个复选参数的枚举值，并直接写入 12 个默认参数的基础值。拦截前端的异常请求。

2. **`backend/app/services/drainage_engine.py`**: 原有 Python 排水计算函数直接作为 Service 层接入，无需重构核心代码。

3. **`frontend/src/store/parameterStore.ts`**: 前端唯一的数据真相源。管理海量表单状态，当用户选择“典型案例”或上传 Excel 时，直接覆写此 Store，触发 Vue 响应式更新 UI 与 3D 模型。

4. **`frontend/src/components/three/`**: 将 Three.js 逻辑彻底组件化。UI 层仅负责传递参数字典给 3D 容器，`TunnelGenerator` 与 `Reinforcement` 接收到参数变化后，在底层重新计算几何体或更新材质，避免与 DOM 逻辑耦合。
````
