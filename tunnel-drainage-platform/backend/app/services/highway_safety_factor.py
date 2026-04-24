# -*- coding: utf-8 -*-
import math


# =========================================================
# 材料参数表（按你给的规范表）
# =========================================================

CONCRETE_TABLE = {
    "C15": {"Ra": 12.0, "Rw": 15.0, "Rl": 1.4},
    "C20": {"Ra": 15.5, "Rw": 19.4, "Rl": 1.7},
    "C25": {"Ra": 19.0, "Rw": 23.6, "Rl": 2.0},
    "C30": {"Ra": 22.5, "Rw": 28.1, "Rl": 2.2},
    "C35": {"Ra": 26.3, "Rw": 32.9, "Rl": 2.5},
    "C40": {"Ra": 29.5, "Rw": 36.9, "Rl": 2.7},
    "C45": {"Ra": 33.6, "Rw": 42.0, "Rl": 2.9},
    "C50": {"Ra": 36.5, "Rw": 45.6, "Rl": 3.1},
}

REBAR_TABLE = {
    "HPB300": {"fyk": 300.0, "fstk": 420.0, "Rg": 300.0},
    "HRB400": {"fyk": 400.0, "fstk": 540.0, "Rg": 400.0},
    "HRB500": {"fyk": 500.0, "fstk": 630.0, "Rg": 500.0},
}


# =========================================================
# 工具函数
# =========================================================

def _normalize_concrete_grade(concrete_grade):
    """
    支持输入：
    40 / "40" / "C40"
    """
    if isinstance(concrete_grade, int):
        concrete_grade = f"C{concrete_grade}"
    else:
        concrete_grade = str(concrete_grade).strip().upper()
        if not concrete_grade.startswith("C"):
            concrete_grade = f"C{concrete_grade}"

    if concrete_grade not in CONCRETE_TABLE:
        raise ValueError(f"不支持的混凝土标号: {concrete_grade}")

    return concrete_grade


def _normalize_rebar_type(rebar_type):
    """
    支持输入：
    "hrb400" / "HRB400"
    """
    rebar_type = str(rebar_type).strip().upper()
    if rebar_type not in REBAR_TABLE:
        raise ValueError(f"不支持的钢筋类型: {rebar_type}")

    return rebar_type


def _get_material_parameters(concrete_grade=40, rebar_type="HRB400"):
    concrete_grade = _normalize_concrete_grade(concrete_grade)
    rebar_type = _normalize_rebar_type(rebar_type)

    concrete = CONCRETE_TABLE[concrete_grade]
    rebar = REBAR_TABLE[rebar_type]

    return {
        "concrete_grade": concrete_grade,
        "rebar_type": rebar_type,
        "Ra": concrete["Ra"],
        "Rw": concrete["Rw"],
        "Rl": concrete["Rl"],
        "fyk": rebar["fyk"],
        "fstk": rebar["fstk"],
        "Rg": rebar["Rg"],
    }


def _positive_root(A, B, C):
    """
    解 A*x^2 + B*x + C = 0，返回正根中的较小者
    """
    if abs(A) < 1e-14:
        if abs(B) < 1e-14:
            raise ValueError("方程退化，无有效解。")
        x = -C / B
        if x > 0:
            return x
        raise ValueError("方程无正根。")

    D = B * B - 4.0 * A * C
    if D < 0:
        raise ValueError("判别式小于0，无实根。")

    sqrtD = math.sqrt(D)
    x1 = (-B + sqrtD) / (2.0 * A)
    x2 = (-B - sqrtD) / (2.0 * A)

    roots = [r for r in (x1, x2) if r > 0]
    if not roots:
        raise ValueError("方程无正根。")

    return min(roots)


def _prepare_inputs(N, M, concrete_grade, rebar_type, t, Ag, as_mm):
    """
    统一内部单位：
    长度 mm；力 N；弯矩 N·mm；强度 MPa=N/mm2
    """
    mat = _get_material_parameters(concrete_grade, rebar_type)

    # 截面按每延米宽度计算
    b = 1000.0                # mm
    h = float(t) * 1000.0     # m -> mm

    # 双层对称配筋
    Ag = float(Ag)            # 受拉钢筋面积 mm2
    Agp = float(Ag)           # 受压钢筋面积 mm2
    a = float(as_mm)          # mm
    ap = float(as_mm)         # mm

    # 材料强度
    Rw = mat["Rw"]            # MPa = N/mm2
    Rg = mat["Rg"]            # MPa = N/mm2

    # 内力
    Nn = float(N) * 1e3       # kN -> N
    Mn = abs(float(M)) * 1e6  # kN·m -> N·mm

    h0 = h - a
    h0p = h - ap

    return {
        "b": b, "h": h,
        "Ag": Ag, "Agp": Agp,
        "a": a, "ap": ap,
        "Rw": Rw, "Rg": Rg,
        "N": Nn, "M": Mn,
        "h0": h0, "h0p": h0p,
        "mat": mat
    }


# =========================================================
# 受弯验算（N.0.1）
# =========================================================

def _pure_bending_detail(N, M, concrete_grade, rebar_type, t, Ag, as_mm):
    d = _prepare_inputs(N, M, concrete_grade, rebar_type, t, Ag, as_mm)

    b = d["b"]
    h0 = d["h0"]
    Ag = d["Ag"]
    Agp = d["Agp"]
    ap = d["ap"]
    Rw = d["Rw"]
    Rg = d["Rg"]
    Mn = d["M"]

    if Mn <= 0:
        return {
            "mode": "受弯",
            "K": float("inf"),
            "x_mm": 0.0,
            "Mu_kNm": 0.0,
            "material": d["mat"]
        }

    # 先按“考虑受压钢筋”试算
    # N.0.1-2: Rg(Ag - Ag') = Rw*b*x
    x_try = Rg * (Ag - Agp) / (Rw * b)

    # 对称配筋时 Ag = Ag'，通常 x_try = 0，不满足，自动转为不考虑受压钢筋
    if x_try > 0 and x_try <= 0.55 * h0 and x_try >= 2.0 * ap:
        Mu = Rw * b * x_try * (h0 - x_try / 2.0) + Rg * Agp * (h0 - ap)
        K = Mu / Mn
        return {
            "mode": "受弯-考虑受压钢筋",
            "K": K,
            "x_mm": x_try,
            "Mu_kNm": Mu / 1e6,
            "material": d["mat"]
        }

    # 不考虑受压钢筋
    x = Rg * Ag / (Rw * b)

    if x <= 0.55 * h0:
        Mu = Rw * b * x * (h0 - x / 2.0)
        mode = "受弯-不考虑受压钢筋"
    else:
        # 超过受压区限值时，按 N.0.1-7 控制
        x = 0.55 * h0
        Mu = 0.5 * Rw * b * h0 * h0
        mode = "受弯-按 x=0.55h0 控制"

    K = Mu / Mn
    return {
        "mode": mode,
        "K": K,
        "x_mm": x,
        "Mu_kNm": Mu / 1e6,
        "material": d["mat"]
    }


# =========================================================
# 大偏心受压时，不考虑受压钢筋的辅助计算
# =========================================================

def _large_ecc_no_comp(N, M, concrete_grade, rebar_type, t, Ag, as_mm):
    d = _prepare_inputs(N, M, concrete_grade, rebar_type, t, Ag, as_mm)

    b = d["b"]
    h = d["h"]
    h0 = d["h0"]
    a = d["a"]
    Ag = d["Ag"]
    Rw = d["Rw"]
    Rg = d["Rg"]
    Nn = d["N"]
    Mn = d["M"]

    if Nn <= 0:
        raise ValueError("该分支仅适用于 N > 0 的受压情况。")

    e0 = Mn / Nn
    e = e0 + h / 2.0 - a

    # Rg*Ag*e = Rw*b*x*(e-h0+x/2)
    A = 0.5 * Rw * b
    B = Rw * b * (e - h0)
    C = -Rg * Ag * e

    x = _positive_root(A, B, C)

    if x <= 0.55 * h0:
        Mu = Rw * b * x * (h0 - x / 2.0)
    else:
        Mu = 0.5 * Rw * b * h0 * h0

    K = Mu / (Nn * e)
    return K, x


# =========================================================
# 偏心受压验算（N.0.8 / N.0.9）
# =========================================================

def _eccentric_compression_detail(N, M, concrete_grade, rebar_type, t, Ag, as_mm):
    d = _prepare_inputs(N, M, concrete_grade, rebar_type, t, Ag, as_mm)

    b = d["b"]
    h = d["h"]
    h0 = d["h0"]
    h0p = d["h0p"]
    Ag = d["Ag"]
    Agp = d["Agp"]
    a = d["a"]
    ap = d["ap"]
    Rw = d["Rw"]
    Rg = d["Rg"]
    Nn = d["N"]
    Mn = d["M"]

    if Nn <= 0:
        raise ValueError("本函数仅适用于 N > 0 的偏心受压构件。")

    e0 = Mn / Nn
    e = e0 + h / 2.0 - a
    ep = e0 - h / 2.0 + ap

    # 按 N.0.8-3 求 x
    # Rg(Ag*e + Ag'*e') = Rw*b*x*(e - h0 + x/2)
    A = 0.5 * Rw * b
    B = Rw * b * (e - h0)
    C = -Rg * (Ag * e + Agp * ep)

    x = _positive_root(A, B, C)

    # ----------------------
    # 大偏心受压：x <= 0.55h0
    # ----------------------
    if x <= 0.55 * h0:
        if x >= 2.0 * ap:
            # N.0.8-1
            Rn = Rw * b * x + Rg * (Agp - Ag)
            # N.0.8-2
            Rm = Rw * b * x * (h0 - x / 2.0) + Rg * Agp * (h0 - ap)

            K1 = Rn / Nn
            K2 = Rm / (Nn * e)
            K = min(K1, K2)

            return {
                "mode": "大偏心受压-考虑受压钢筋",
                "K": K,
                "K_from_N": K1,
                "K_from_M": K2,
                "x_mm": x,
                "e_mm": e,
                "ep_mm": ep,
                "material": d["mat"]
            }

        else:
            # x < 2a'，按 N.0.8-4 与“不考虑受压钢筋”比较
            K_no, x_no = _large_ecc_no_comp(N, M, concrete_grade, rebar_type, t, Ag, as_mm)

            if abs(ep) < 1e-12:
                return {
                    "mode": "大偏心受压-x<2a'，忽略受压钢筋",
                    "K": K_no,
                    "K_without_comp": K_no,
                    "x_mm": x,
                    "x_no_comp_mm": x_no,
                    "e_mm": e,
                    "ep_mm": ep,
                    "material": d["mat"]
                }

            # N.0.8-4
            K_comp = Rg * Agp * (h0 - ap) / (Nn * abs(ep))

            # 若考虑受压钢筋反而更小，则不应考虑受压钢筋
            K = max(K_comp, K_no)

            return {
                "mode": "大偏心受压-x<2a'，按规范比较是否计入受压钢筋",
                "K": K,
                "K_with_comp_by_N0_8_4": K_comp,
                "K_without_comp": K_no,
                "x_mm": x,
                "x_no_comp_mm": x_no,
                "e_mm": e,
                "ep_mm": ep,
                "material": d["mat"]
            }

    # ----------------------
    # 小偏心受压：x > 0.55h0
    # ----------------------
    else:
        # N.0.9-1
        R1 = 0.5 * Rw * b * h0 * h0 + Rg * Agp * (h0 - ap)
        K1 = R1 / (Nn * e)

        # N.0.9-2 仅当轴力作用点位于两层钢筋之间时使用
        if ep > 0:
            R2 = 0.5 * Rw * b * h0p * h0p + Rg * Ag * (h0p - a)
            K2 = R2 / (Nn * ep)
            K = min(K1, K2)
        else:
            K2 = None
            K = K1

        return {
            "mode": "小偏心受压",
            "K": K,
            "K_from_N0_9_1": K1,
            "K_from_N0_9_2": K2,
            "x_mm": x,
            "e_mm": e,
            "ep_mm": ep,
            "material": d["mat"]
        }


# =========================================================
# 对外接口
# =========================================================

def get_safety_factor_detail(
    N,
    M,
    concrete_grade=40,
    rebar_type="HRB400",
    t=0.5,
    Ag=2000.0,
    as_mm=50.0
):
    """
    按 JTG 3370.1-2018 附录N 计算矩形截面安全系数详细结果

    参数
    ----
    N : 轴力(kN)，受压为正，受拉为负
    M : 弯矩(kN·m)
    concrete_grade : 混凝土标号，可输入 40 / "40" / "C40"
    rebar_type : 钢筋类型，默认 "HRB400"
    t : 截面厚度(m)
    Ag : 单侧钢筋面积(mm2/m)。本函数按双层对称配筋处理
    as_mm : 钢筋重心到边缘距离(mm)

    返回
    ----
    dict
    """
    tol_N = 1e-9

    if abs(N) <= tol_N:
        return _pure_bending_detail(N, M, concrete_grade, rebar_type, t, Ag, as_mm)
    elif N > 0:
        return _eccentric_compression_detail(N, M, concrete_grade, rebar_type, t, Ag, as_mm)
    else:
        raise ValueError("当前版本仅实现受弯和偏心受压，未实现偏心受拉。")


def get_safety_factor(
    N,
    M,
    concrete_grade=40,
    rebar_type="HRB400",
    t=0.5,
    Ag=2000.0,
    as_mm=50.0
):
    """
    与现有主程序兼容的简洁接口：仅返回安全系数 K
    """
    result = get_safety_factor_detail(
        N=N,
        M=M,
        concrete_grade=concrete_grade,
        rebar_type=rebar_type,
        t=t,
        Ag=Ag,
        as_mm=as_mm
    )
    return result["K"]


# =========================================================
# 测试
# =========================================================

if __name__ == "__main__":
    print("=== 默认 HRB400 + C40 ===")

    K1 = get_safety_factor(
        N=2067,
        M=465,
        concrete_grade=40,
        rebar_type="HRB400",
        t=0.5,
        Ag=1900.0,
        as_mm=50.0
    )
    print("受弯 K =", K1)

    K2 = get_safety_factor(
        N=1200.0,
        M=180.0,
        concrete_grade=40,
        rebar_type="HRB400",
        t=0.5,
        Ag=1900.0,
        as_mm=50.0
    )
    print("偏心受压 K =", K2)

    detail = get_safety_factor_detail(
        N=1200.0,
        M=180.0,
        concrete_grade=40,
        rebar_type="HRB400",
        t=0.5,
        Ag=1900.0,
        as_mm=50.0
    )
    print("详细结果：", detail)