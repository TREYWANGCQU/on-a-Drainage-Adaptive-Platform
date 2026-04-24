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