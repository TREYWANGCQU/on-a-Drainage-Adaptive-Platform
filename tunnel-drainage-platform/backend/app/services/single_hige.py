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
def calc_state_by_rg(Rg_use: float, p, h0: float):
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