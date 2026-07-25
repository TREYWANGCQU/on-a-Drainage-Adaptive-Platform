# -*- coding: utf-8 -*-
"""
隧道防排水统一计算程序（精简版）
单洞/双洞 + 高水位/低水位 自动判别
"""

import math
from dataclasses import dataclass
from typing import Optional, Tuple


# =========================================================
# 0. 公共工具
# =========================================================
CN_TABLE = {
    "灌溉良好": {"工业用地": 81, "商业用地": 80, "居住地": 61, "农业用地": 65, "牧草地": 39, "林地": 25},
    "灌溉较差": {"工业用地": 93, "商业用地": 95, "居住地": 87, "农业用地": 86, "牧草地": 80, "林地": 77},
}


def get_cn(cn_condition: str, land_use: str) -> float:
    if cn_condition not in CN_TABLE or land_use not in CN_TABLE[cn_condition]:
        raise ValueError(f"CN查表参数不合法：{cn_condition} / {land_use}")
    return CN_TABLE[cn_condition][land_use]


def h0_scs_cn(H: float, p_mm: float, CN: float) -> float:
    """SCS-CN 降雨补给后有效水头 h0 (m)"""
    S_mm = 25400.0 / CN - 254.0
    Ia_mm = 0.2 * S_mm
    if p_mm <= Ia_mm:
        hs_mm = 0.0
    else:
        hs_mm = (p_mm - Ia_mm) ** 2 / (p_mm - Ia_mm + S_mm)
    return H + (p_mm - hs_mm) / 1000.0


# =========================================================
# 1. 双洞辅助
# =========================================================
def beta1_empirical(k_r: float) -> float:
    """β1 经验公式（固定折减系数为1）"""
    log10K = math.log10(k_r)
    return 1.635 + 0.43 * log10K + 0.029 * (log10K ** 2)


def mapped_R2(R_inf: float, half_D: float) -> float:
    phi_rad = 2.0 * math.acos(half_D / R_inf)
    phi_deg = phi_rad * 180.0 / math.pi
    return (1.0 - phi_deg / 360.0) * R_inf + (R_inf / math.pi) * math.sin(phi_rad / 2.0)


# =========================================================
# 2. 四种工况核心公式
# =========================================================
def single_low(k_r, h0, gamma, k_g, k_s, k_p, r0, rs, rp, rg, yc, h1):
    ln = math.log
    root = math.sqrt(h1 * h1 - r0 * r0)
    R = r0 * r0 / (h1 - root)
    a = (h1 - root) / r0

    q0 = (2 * math.pi * k_r * h0 - math.pi * k_r * r0 * a / 2) / ln(R / r0)

    den_betap = ln(h0 / rg) + (k_r / k_g) * ln(rg / rp) + (k_r / k_p) * ln(rp / rs) + (k_r / k_s) * ln(rs / r0)
    betap = ln(h0 / r0) / den_betap

    den_beta = ln(rs / r0) + (k_s / k_p) * ln(rp / rs) + (k_s / k_g) * ln(rg / rp) + (k_s / k_r) * ln(h0 / rg)
    beta = ln(rs / r0) / den_beta

    return q0 * betap, gamma * (beta * h0 - yc)


def single_high(k_r, h0, gamma, k_g, k_s, k_p, r0, rs, rp, rg):
    if not (r0 < rs < rp <= rg < h0):
        raise ValueError("参数不满足 r0 < rs < rp <= rg < h0")
    ln = math.log
    den_q = ln(h0 / rg) + (k_r / k_g) * ln(rg / rp) + (k_r / k_p) * ln(rp / rs) + (k_r / k_s) * ln(rs / r0)
    q_in = 2 * math.pi * k_r * h0 / den_q
    den_p = (k_s / k_r) * ln(h0 / rg) + (k_s / k_g) * ln(rg / rp) + (k_s / k_p) * ln(rp / rs) + ln(rs / r0)
    return q_in, gamma * h0 * ln(rs / r0) / den_p


def double_low(h0, k_r, gamma, k_g, k_s, k_p, r0, rs, rp, rg, half_D, yc, h1):
    ln = math.log
    b1 = beta1_empirical(k_r)
    R_inf = b1 * h0
    R_map = mapped_R2(R_inf, half_D)

    root = math.sqrt(h1 * h1 - r0 * r0)
    R = r0 * r0 / (h1 - root)
    a = (h1 - root) / r0

    def den_q(Rx):
        return ln(Rx / rg) + (k_r / k_g) * ln(rg / rp) + (k_r / k_p) * ln(rp / rs) + (k_r / k_s) * ln(rs / r0)

    X1 = (R_map / R_inf) * (den_q(R_inf) / den_q(R_map))
    den_main = den_q(R)
    term = (2 * math.pi * k_r * h0 - math.pi * k_r * r0 * a / 2) / ln(R / r0)
    q = X1 * (ln(R / r0) / den_main) * term

    def den_p(Rx):
        return ln(rs / r0) + (k_s / k_r) * ln(Rx / rg) + (k_s / k_g) * ln(rg / rp) + (k_s / k_p) * ln(rp / rs)

    X2 = (R_map / R_inf) * (den_p(R_inf) / den_p(R_map))
    P1 = X2 * gamma * (ln(rs / r0) / den_p(R) * h0 - yc)
    return q, P1


def double_high(k_r, h0, gamma, k_g, k_s, k_p, r0, rs, rp, rg, half_D):
    b1 = beta1_empirical(k_r)
    R_inf = b1 * h0
    if half_D >= R_inf:
        raise ValueError("半间距 >= 影响半径，双洞映射失效")
    R_map = mapped_R2(R_inf, half_D)
    ln = math.log

    if not (r0 < rs < rp <= rg < R_map):
        raise ValueError("参数不满足 r0 < rs < rp <= rg < R_map")

    den_q = ln(R_map / rg) + (k_r / k_g) * ln(rg / rp) + (k_r / k_p) * ln(rp / rs) + (k_r / k_s) * ln(rs / r0)
    q = 2 * math.pi * k_r * R_map / den_q

    den_p = ln(rs / r0) + (k_s / k_r) * ln(R_map / rg) + (k_s / k_g) * ln(rg / rp) + (k_s / k_p) * ln(rp / rs)
    P = gamma * R_map * ln(rs / r0) / den_p
    return q, P


# =========================================================
# 3. 临界注浆反算
# =========================================================
def solve_rg_single_low(p, h0):
    ln = math.log
    beta_t = (p.P_crit / p.gamma + p.r_s) / h0
    if beta_t <= 0:
        raise ValueError("P_crit 过小，无解")

    ln_rs_r0 = ln(p.r_s / p.r_0)
    inner = ln_rs_r0 + (p.k_s / p.k_p) * ln(p.r_p / p.r_s)
    A, B = p.k_s / p.k_g, p.k_s / p.k_r
    if abs(A - B) < 1e-12:
        raise ValueError("k_g == k_r，r_g 无法唯一反算")

    den_t = ln_rs_r0 / beta_t
    ln_rg = (den_t - inner + A * ln(p.r_p) - B * ln(h0)) / (A - B)
    rg = math.exp(ln_rg)

    if not (p.r_p < rg < h0):
        raise ValueError(f"反算 rg={rg:.4f} 不满足约束")
    return rg


def solve_rg_single_high(p, h0):
    ln = math.log
    A, B = p.k_s / p.k_g, p.k_s / p.k_r
    if abs(A - B) < 1e-12:
        raise ValueError("k_g == k_r，无法反算")

    ln_rs_r0 = ln(p.r_s / p.r_0)
    inner = (p.k_s / p.k_p) * ln(p.r_p / p.r_s) + ln_rs_r0

    den_max = B * ln(h0 / p.r_p) + inner
    P_max = p.gamma * h0 * ln_rs_r0 / den_max
    den_min = A * ln(h0 / p.r_p) + inner
    P_min = p.gamma * h0 * ln_rs_r0 / den_min

    if p.P_crit >= P_max - 1e-4:
        return p.r_p
    if p.P_crit < P_min - 1e-4:
        raise ValueError(f"P_crit 小于极限压力 {P_min:.4f} kPa")

    den_t = p.gamma * h0 * ln_rs_r0 / p.P_crit
    ln_rg = (den_t - B * ln(h0) + A * ln(p.r_p) - inner) / (A - B)
    rg = math.exp(ln_rg)
    return max(p.r_p, min(rg, h0 * (1 - 1e-10)))


def _bisect_rg(f, P_crit, lo, hi, tol=1e-6):
    """通用二分法反算 rg"""
    f_lo = f(lo) - P_crit
    f_hi = f(hi) - P_crit
    if f_lo * f_hi > 0:
        raise ValueError("区间内无解")
    for _ in range(100):
        mid = 0.5 * (lo + hi)
        f_mid = f(mid) - P_crit
        if abs(f_mid) < 1e-8 or abs(hi - lo) < tol:
            return mid
        if f_lo * f_mid <= 0:
            hi, f_hi = mid, f_mid
        else:
            lo, f_lo = mid, f_mid
    return 0.5 * (lo + hi)


def solve_rg_double_low(p, h0):
    half_D = p.D_spacing / 2
    root = math.sqrt(p.h_1 * p.h_1 - p.r_0 * p.r_0)
    R = p.r_0 ** 2 / (p.h_1 - root)

    def P_of_rg(rg):
        _, Pc = double_low(
            h0, p.k_r, p.gamma, p.k_g, p.k_s, p.k_p,
            p.r_0, p.r_s, p.r_p, rg, half_D, p.r_s, p.h_1
        )
        return Pc

    P_max = P_of_rg(p.r_p)
    if p.P_crit >= P_max - 1e-4:
        return p.r_p
    return _bisect_rg(P_of_rg, p.P_crit, p.r_p, R * (1 - 1e-8))


def solve_rg_double_high(p, h0):
    half_D = p.D_spacing / 2
    R_map = mapped_R2(beta1_empirical(p.k_r) * h0, half_D)
    ln = math.log
    A, B = p.k_s / p.k_g, p.k_s / p.k_r
    ln_rs_r0 = ln(p.r_s / p.r_0)
    inner = (p.k_s / p.k_p) * ln(p.r_p / p.r_s) + ln_rs_r0

    den_max = B * ln(R_map / p.r_p) + inner
    P_max = p.gamma * R_map * ln_rs_r0 / den_max

    if p.P_crit >= P_max - 1e-4:
        return p.r_p

    C0 = ln_rs_r0 + B * ln(R_map) - A * ln(p.r_p) + inner
    den_t = p.gamma * R_map * ln_rs_r0 / p.P_crit
    ln_rg = (den_t - C0) / (A - B)
    rg = math.exp(ln_rg)
    return max(p.r_p, min(rg, R_map * (1 - 1e-10)))


# =========================================================
# 4. 排水管计算
# =========================================================
_STD_DIAM = [0.05, 0.063, 0.075, 0.08, 0.09, 0.1, 0.11, 0.125, 0.16, 0.2, 0.225, 0.25, 0.3, 0.315, 0.355, 0.4]


def manning_Q(d, n, I):
    A = math.pi * d * d / 4
    Rh = d / 4
    return A * (Rh ** (2/3)) * (I ** 0.5) / n * 86400


def _std_diam(d_req):
    for d in _STD_DIAM:
        if d >= d_req - 1e-12:
            return d
    return _STD_DIAM[-1]


def _inv_d(Q_target, n, I, d_min):
    lo, hi = max(d_min, 1e-4), max(d_min + 0.1, 1.0)
    for _ in range(80):
        mid = 0.5 * (lo + hi)
        if manning_Q(mid, n, I) >= Q_target:
            hi = mid
        else:
            lo = mid
        if abs(hi - lo) < 1e-6:
            break
    return hi


def drain_design(q, Q_total, p):
    side = 2.0 if p.double_side else 1.0

    Q_ring = manning_Q(p.d_ring0, p.n_ring, p.i_ring)
    Q_lat = manning_Q(p.d_lat0, p.n_lat, p.i_lat)

    S_cap = min(side * Q_ring / q, side * Q_lat / q) if q > 0 else float("inf")
    S_max = p.S_max if p.S_max else float("inf")
    S_rec = max(p.S_min, min(S_cap, S_max))
    Q_side = q * S_rec / side

    # 环向管
    d_ring = p.d_ring0
    if manning_Q(d_ring, p.n_ring, p.i_ring) < Q_side - 1e-9:
        d_ring = _std_diam(_inv_d(Q_side, p.n_ring, p.i_ring, d_ring))

    # 横向管
    d_lat = p.d_lat0
    if manning_Q(d_lat, p.n_lat, p.i_lat) < Q_side - 1e-9:
        d_lat = _std_diam(_inv_d(Q_side, p.n_lat, p.i_lat, d_lat))

    # 纵向管
    d_long = p.d_long0
    Q_long = Q_total / side
    if manning_Q(d_long, p.n_long, p.i_long) < Q_long - 1e-9:
        d_long = _std_diam(_inv_d(Q_long, p.n_long, p.i_long, d_long))

    return d_ring, S_rec, d_long, d_lat


# =========================================================
# 5. 统一入口
# =========================================================
def calc_state(rg, p, h0, case):
    if case == "single_low":
        q, Pc = single_low(p.k_r, h0, p.gamma, p.k_g, p.k_s, p.k_p, p.r_0, p.r_s, p.r_p, rg, p.r_s, p.h_1)
        _, Pi = single_low(p.k_r, h0, p.gamma, p.k_g, p.k_s, p.k_p, p.r_0, p.r_s, p.r_p, rg, -p.r_s, p.h_1)
        Q = q * p.L
        dr, Sr, dl, dlat = drain_design(q, Q, p)
        return dict(q=q, Q=Q, P_crown=Pc, P_invert=Pi, d_ring=dr, S_ring=Sr, d_long=dl, d_lat=dlat)

    elif case == "single_high":
        q, P = single_high(p.k_r, h0, p.gamma, p.k_g, p.k_s, p.k_p, p.r_0, p.r_s, p.r_p, rg)
        Q = q * p.L
        dr, Sr, dl, dlat = drain_design(q, Q, p)
        return dict(q=q, Q=Q, P=P, d_ring=dr, S_ring=Sr, d_long=dl, d_lat=dlat)

    elif case == "double_low":
        half_D = p.D_spacing / 2
        q, Pc = double_low(h0, p.k_r, p.gamma, p.k_g, p.k_s, p.k_p, p.r_0, p.r_s, p.r_p, rg, half_D, p.r_s, p.h_1)
        _, Pi = double_low(h0, p.k_r, p.gamma, p.k_g, p.k_s, p.k_p, p.r_0, p.r_s, p.r_p, rg, half_D, -p.r_s, p.h_1)
        Q = q * p.L
        dr, Sr, dl, dlat = drain_design(q, Q, p)
        return dict(q=q, Q=Q, P_crown=Pc, P_invert=Pi, d_ring=dr, S_ring=Sr, d_long=dl, d_lat=dlat)

    elif case == "double_high":
        half_D = p.D_spacing / 2
        q, P = double_high(p.k_r, h0, p.gamma, p.k_g, p.k_s, p.k_p, p.r_0, p.r_s, p.r_p, rg, half_D)
        Q = q * p.L
        dr, Sr, dl, dlat = drain_design(q, Q, p)
        return dict(q=q, Q=Q, P=P, d_ring=dr, S_ring=Sr, d_long=dl, d_lat=dlat)

    else:
        raise ValueError(f"未知工况 {case}")


# =========================================================
# 6. 参数类（精简，无beta2）
# =========================================================
@dataclass
class TunnelParamsHc:
    # ===== 核心必选（最常修改） =====
    k_r: float = 0.15              # 围岩渗透系数 m/d
    H: float = 100                 # 初始静水位水头 m
    r_0: float = 7.95              # 二衬内半径 m
    r_s: float = 8.35              # 二衬外半径 m
    r_p: float = 8.57              # 初支外半径 m
    r_g: float = 8.57              # 注浆圈外半径 m
    k_s: float = 0.000864          # 二衬渗透系数 m/d
    k_p: float = 0.00864           # 初支渗透系数 m/d
    k_g: float = 0.00864           # 注浆圈渗透系数 m/d
    start_chainage: float = 0      # 起点里程 m
    end_chainage: float = 47       # 终点里程 m
    P_crit: float = 500            # 临界控制水压力 kPa

    # ===== 工况开关 =====
    tunnel_type: str = "single"   # single / double
    h_1: float = 110              # 隧道中心埋深 m（低水位用）
    D_spacing: float = 40.0       # 双洞中心间距 m（双洞用）

    # ===== 降雨与下垫面 =====
    p_mm: float = 1000.0          # 年降雨量 mm
    cn_condition: str = "灌溉良好"
    land_use: str = "居住地"

    # ===== 高级默认参数（一般不改） =====
    gamma: float = 10.0
    double_side: bool = True
    S_min: float = 3.0
    S_max: Optional[float] = 10.0

    n_long: float = 0.012
    i_long: float = 0.02
    n_ring: float = 0.012
    i_ring: float = 0.73
    n_lat: float = 0.012
    i_lat: float = 0.01

    d_long0: float = 0.10
    d_ring0: float = 0.05
    d_lat0: float = 0.08

    @property
    def L(self) -> float:
        Lv = self.end_chainage - self.start_chainage
        if Lv <= 0:
            raise ValueError("终点里程必须大于起点")
        return Lv

    @property
    def CN(self) -> float:
        return get_cn(self.cn_condition, self.land_use)


# =========================================================
# 7. 主流程
# =========================================================
def main(parHc: TunnelParamsHc):
    line = "=" * 60
    thin = "-" * 60

    # 基础计算
    h0 = h0_scs_cn(parHc.H, parHc.p_mm, parHc.CN)
    ratio = parHc.r_0 / parHc.H

    # 工况判别
    is_double = parHc.tunnel_type == "double"
    is_low = ratio >= 0.062
    case = ("double" if is_double else "single") + ("_low" if is_low else "_high")
    case_name = f"{'双洞' if is_double else '单洞'}隧道 + {'低水位' if is_low else '高水位'}工况"

    print(line)
    print(f"计算工况：{case_name}")
    print(f"r₀/H = {ratio:.4f}（阈值 0.062）")
    print(f"有效水头 h₀ = {h0:.4f} m")
    print(f"分区长度 L = {parHc.L:.2f} m")
    print(line)

    # 原始状态
    org = calc_state(parHc.r_g, parHc, h0, case)
    print("【原始设计状态】")
    print(f"单位涌水量 q = {org['q']:.5f} m³/(d·m)")
    print(f"分区总涌水量 Q = {org['Q']:.3f} m³/d")
    if is_low:
        print(f"拱顶外水压力 P_crown = {org['P_crown']:.3f} kPa")
        print(f"仰拱外水压力 P_invert = {org['P_invert']:.3f} kPa")
    else:
        print(f"统一外水压力 P = {org['P']:.3f} kPa")
    print(f"环向管推荐管径 = {org['d_ring']*1000:.0f} mm，间距 = {org['S_ring']:.2f} m")
    print(f"纵向管推荐管径 = {org['d_long']*1000:.0f} mm")
    print(f"横向管推荐管径 = {org['d_lat']*1000:.0f} mm")
    print(thin)

    # 临界注浆
    if case == "single_low":
        rg_crit = solve_rg_single_low(parHc, h0)
    elif case == "single_high":
        rg_crit = solve_rg_single_high(parHc, h0)
    elif case == "double_low":
        rg_crit = solve_rg_double_low(parHc, h0)
    else:  # double_high
        rg_crit = solve_rg_double_high(parHc, h0)

    tg_crit = max(0.0, rg_crit - parHc.r_p)
    crit = calc_state(rg_crit, parHc, h0, case)

    print("【临界注浆状态】")
    print(f"控制压力 P_crit = {parHc.P_crit:.2f} kPa")
    print(f"临界注浆半径 r_g_crit = {rg_crit:.4f} m")
    print(f"临界注浆厚度 t_g_crit = {tg_crit:.4f} m")
    print(f"单位涌水量 q = {crit['q']:.5f} m³/(d·m)")
    print(f"分区总涌水量 Q = {crit['Q']:.3f} m³/d")
    if is_low:
        print(f"仰拱外水压力 P_invert = {crit['P_invert']:.3f} kPa")
    else:
        print(f"统一外水压力 P = {crit['P']:.3f} kPa")
    print(f"环向管推荐管径 = {crit['d_ring']*1000:.0f} mm，间距 = {crit['S_ring']:.2f} m")
    print(f"纵向管推荐管径 = {crit['d_long']*1000:.0f} mm")
    print(f"横向管推荐管径 = {crit['d_lat']*1000:.0f} mm")
    print(line)

    rg_res={
        'org':org, 'rg_crit':rg_crit, 'crit':crit
    }

    return rg_res


if __name__ == "__main__":
    # 使用示例：只需填写核心参数
    p = TunnelParamsHc(
        k_r=0.15,
        H=100,
        r_0=7.95,
        r_s=8.35,
        r_p=8.57,
        r_g=8.57,
        k_s=0.000864,
        k_p=0.00864,
        k_g=0.00864,
        start_chainage=0,
        end_chainage=47,
        P_crit=500,
        tunnel_type="single",
        h_1=32,
    )
    rg_res=main(p)
