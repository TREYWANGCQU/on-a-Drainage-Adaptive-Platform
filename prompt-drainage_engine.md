发现问题了，单双洞、高低水位有4种main函数，现在drainage_engine.py 分发机制和函数引用有错，修改完善原始drainage_engine.py

# 原始drainage_engine.py

```python

# backend/app/services/drainage_engine.py

# 修改前：
# import double_hige as pdh

# 修改后：

from app.services import double_hige as pdh #绝对路径引入模块，避免相对路径引入的混乱
from app.services import double_low as pdl
from app.services import single_hige as psh
from app.services import single_low as psl

from app.services.analyze_tunnel_lining_full import analyze_tunnel_lining_full #精确导入函数本身,避免 from module import * 导入导致的命名空间混乱
from app.services.get_concrete_parameters import get_concrete_parameters
from app.services.get_rock_parameters import get_rock_parameters
from app.services.calculate_Hq import calculate_Hq
from app.services import highway_safety_factor as hw

def run_calculation(data):
    """
    分发计算逻辑，支持单洞/双洞及高/低水位。
    透传原始计算结果用于 Echarts 渲染。
    """
    # ================= 分发逻辑 =================
    if data.tunnel_type == "double" and data.water_level == "high":
        calc_module = pdh
    elif data.tunnel_type == "double" and data.water_level == "low":
        calc_module = pdl
    elif data.tunnel_type == "single" and data.water_level == "high":
        calc_module = psh
    else:  # single & low
        calc_module = psl

    # 实例化参数类（确保 Params 在各个模块中是 Class）
    try:
        par = calc_module.Params()
    except TypeError:
        raise Exception(f"模块 {calc_module.__name__} 中的 Params 无法实例化，请检查其定义")
    
    # ================= 变量命名规范化与映射 =================
    input_data=data.model_dump() if hasattr(data, "model_dump") else data.dict() # 兼容 Pydantic v2 和 v1 的数据访问方式
    for key, value in input_data.items():
        if hasattr(par, key):
            setattr(par, key, value)
            
    # 抹平单双洞 Schema 中大小写或别名差异
    if data.tunnel_type == "single":
        par.r1 = data.R1 # 单洞 Schema 中 R1 对应 par.r1，初支外半径
        par.r2 = data.R2# 单洞 Schema 中 R2 对应 par.r2，二衬外半径
        par.rg = data.Rg# 单洞 Schema 中 Rg 对应 par.rg，注浆圈外半径
    
    
    # 补充内部计算用隐式参数 (与原 main.py 保持一致)
    aspect_ratio = data.aspect_ratio  # 隧道高宽比
    depth = data.c  # Schema 中 c 为埋深
    grades = data.grades # 围岩级别
    concrete_grade = data.concrete_grade# 混凝土等级
    Ag = data.Ag# 配筋面积
    as_mm = data.as_mm# 钢筋保护层厚度
    tol_safety_factor = data.tol_safety_factor# 容许安全系数
    w = par.r
    h_tunnel = w * aspect_ratio
    t = par.r1 - par.r

    Ec, vc, mc = get_concrete_parameters(concrete_grade)
    rock_params = get_rock_parameters(grades)
    Ks = rock_params['Ks'] * 1e6
    lam = rock_params['lams']
    ms = rock_params['ms']

    Hq = calculate_Hq(depth, w, grades)

    # ================= 原始状态计算 =================
    current_CN = getattr(data, "CN", 61.0) 
    h0 = calc_module.h0_scs_cn(par.h, par.p_mm, current_CN)
    original = calc_module.calc_state_by_rg(par.rg, par, h0)

    water_head_original = original['P'] / 10
    if water_head_original <= Hq:
        p_load = (ms - 1000) * 9.8 * water_head_original + ms * 9.8 * (Hq - water_head_original)
    else:
        p_load = (ms - 1000) * 9.8 * Hq
        
    prw_original = water_head_original * 10000
    res_original = analyze_tunnel_lining_full(w, h_tunnel, t, Ec, p_load, lam, prw_original, Ks)
    
    N_orig, M_orig = res_original['N_elem'], res_original['M_elem']
    k_list_orig = [hw.get_safety_factor(-n/1000, abs(m)/1000, concrete_grade, "HRB400", t, Ag, as_mm) for n, m in zip(N_orig, M_orig)]
    now_k = min(k_list_orig)
    control_idx = k_list_orig.index(now_k)

    # ================= 临界水头迭代 =================
    water_head_crit = water_head_original
    res_crit = res_original
    max_iterations = 200 # 防止死循环
    iteration = 0
    if now_k <= tol_safety_factor:
        water_head_crit = Hq
        water_head_step = 0.05
        max_head = depth
        
        while (now_k > tol_safety_factor + 0.001) and (max_head > water_head_crit) and (iteration < max_iterations):
            water_head_crit += water_head_step
            p_load = (ms - 1000) * 9.8 * water_head_crit + ms * 9.8 * (Hq - water_head_crit) if water_head_crit <= Hq else (ms - 1000) * 9.8 * Hq
            prw_crit = water_head_crit * 10000
            iteration += 1
            res_crit = analyze_tunnel_lining_full(w, h_tunnel, t, Ec, p_load, lam, prw_crit, Ks)
            N_crit, M_crit = res_crit['N_elem'], res_crit['M_elem']
            k_list_crit = [hw.get_safety_factor(-n/1000, abs(m)/1000, concrete_grade, "HRB400", t, Ag, as_mm) for n, m in zip(N_crit, M_crit)]
            now_k = min(k_list_crit)

    par.P_crit = water_head_crit * 10
    rg_crit = calc_module.solve_rg_from_Pcrit(P_crit=par.P_crit, h0=h0, p=par)
    tg_crit = max(0.0, rg_crit - par.r2)
    critical = calc_module.calc_state_by_rg(rg_crit, par, h0)

    # ================= Echart作图数据透传组装 =================
    return {
        "tunnel_type": data.tunnel_type,
        "water_level": data.water_level,
        "original_state": {
            "waterHead": water_head_original,
            "safety_factor": min(k_list_orig),
            "control_M": M_orig[control_idx],
            "control_N": N_orig[control_idx],
            "control_idx": control_idx,
            "q": original['q'], # 透传原始状态的排水流量
            "Q": original['Q'],# 透传原始状态的排水总量
            "P": original['P'], # 透传原始状态的水压力
            "ring_diam_recommend": original['ring_diam_recommend'],# 透传原始状态的环向管推荐直径
            "ring_spacing_recommend": original['ring_spacing_recommend'],# 透传原始状态的环向管推荐间距
            "long_diam_recommend": original['long_diam_recommend'],# 透传原始状态的纵向管推荐直径
            "lateral_diam_recommend": original['lateral_diam_recommend'],# 透传原始状态的横向管推荐直径
            "lateral_spacing_recommend": original['lateral_spacing_recommend']# 透传原始状态的横向管推荐间距
        },
        "critical_state": {
            "final_safety_factor": now_k,
            "final_waterHead": water_head_crit,
            "P_crit_input": par.P_crit,
            "rg_crit": rg_crit,
            "tg_crit": tg_crit,
            "q": critical['q'], # 透传临界状态的排水流量
            "Q": critical['Q'],# 透传临界状态的排水总量
            "P": critical['P'],# 透传临界状态的水压力
            "ring_diam_recommend": critical['ring_diam_recommend'],# 透传临界状态的环向管推荐直径
            "ring_spacing_recommend": critical['ring_spacing_recommend'],# 透传临界状态的环向管推荐间距
            "long_diam_recommend": critical['long_diam_recommend'],# 透传临界状态的纵向管推荐直径
            "lateral_diam_recommend": critical['lateral_diam_recommend'],# 透传临界状态的横向管推荐直径
            "lateral_spacing_recommend": critical['lateral_spacing_recommend']# 透传临界状态的横向管推荐间距
        },
        "echart_data": {
            "Hq": Hq, # 透传拱顶水头 Hq 用于 Echarts 水头线图
            "lining_res_original": res_original, # 包含全部原状态力学响应和节点坐标：N_elem, M_elem, 以及节点坐标等，用于 Echarts 力学响应云图和变形云图
            "lining_res_critical": res_crit      # 包含全部临界状态力学响应和节点坐标：N_elem, M_elem, 以及节点坐标等，用于 Echarts 力学响应云图和变形云图
        }
    }

```

# dobule_high.py

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

# dobule_low.py

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

# single_high.py

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

```

# sing_low.py

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
def calc_state_by_rg(Rg_use: float, p, h0: float):
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