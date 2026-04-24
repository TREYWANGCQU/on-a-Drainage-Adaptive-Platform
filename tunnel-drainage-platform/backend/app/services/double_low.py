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