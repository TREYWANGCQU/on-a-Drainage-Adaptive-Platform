# tunnel-drainage-platform/backend/app/services/drainage_engine.py

import sys
import numpy as np

from app.services import hydrocalc as hc
from app.services import mechcalc as mc


def make_serializable(obj):
    """
    递归遍历对象，将所有 NumPy 数据类型转换为 Python 原生类型
    """
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    elif isinstance(obj, np.generic):  # 涵盖 np.float64, np.int32 等所有 NumPy 标量
        return obj.item()
    elif isinstance(obj, dict):
        return {k: make_serializable(v) for k, v in obj.items()}
    elif isinstance(obj, (list, tuple)):
        return [make_serializable(v) for v in obj]
    return obj


def run_calculation(data):
    """
    根据 optimizedDesign.py 标准逻辑进行隧道智能排水与防排水联动优化计算。
    自动判别单洞/双洞及高/低水位工况，输出透传字典供前端 Echarts 与快照库使用。
    """
    # 提取输入数据字典（兼容 Pydantic v2 与 v1 及 dict）
    if hasattr(data, "model_dump"):
        input_data = data.model_dump()
    elif hasattr(data, "dict"):
        input_data = data.dict()
    elif isinstance(data, dict):
        input_data = data
    else:
        input_data = dict(data)

    def get_val(key, default=None):
        if isinstance(input_data, dict) and key in input_data and input_data[key] is not None:
            return input_data[key]
        if hasattr(data, key) and getattr(data, key) is not None:
            return getattr(data, key)
        return default

    # 实例化并配置 TunnelParamsHc (与 optimizedDesign 保持一致)
    parHc = hc.TunnelParamsHc()

    # 映射入参到 TunnelParamsHc (兼容新标准字段与旧别名)
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
    parHc.P_crit = get_val('P_crit', parHc.P_crit)

    # 隧道中心埋深 h_1
    parHc.tunnel_type = get_val('tunnel_type', parHc.tunnel_type)
    c_val = get_val('h_1', get_val('c', get_val('depth', get_val('ha', 130.0))))
    parHc.h_1 = c_val
    parHc.D_spacing = get_val('D_spacing', parHc.D_spacing)

    # 降雨与下垫面
    parHc.p_mm = get_val('p_mm', parHc.p_mm)
    parHc.cn_condition = get_val('cn_condition', parHc.cn_condition)
    parHc.land_use = get_val('land_use', parHc.land_use)

    # 高级默认参数
    parHc.gamma = get_val('gamma', parHc.gamma)
    parHc.double_side = get_val('double_side', parHc.double_side)
    parHc.S_min = get_val('S_min', parHc.S_min)
    s_max_val = get_val('S_code_max', get_val('S_max', parHc.S_max))
    if s_max_val is not None:
        parHc.S_max = s_max_val

    parHc.n_long = get_val('n_long', parHc.n_long)
    parHc.i_long = get_val('I_long', get_val('i_long', parHc.i_long))
    parHc.n_ring = get_val('n_ring', parHc.n_ring)
    parHc.i_ring = get_val('I_ring', get_val('i_ring', parHc.i_ring))
    parHc.n_lat = get_val('n_lat', parHc.n_lat)
    parHc.i_lat = get_val('I_lat', get_val('i_lat', parHc.i_lat))

    parHc.d_long0 = get_val('d_long_default', get_val('d_long0', parHc.d_long0))
    parHc.d_ring0 = get_val('d_ring_default', get_val('d_ring0', parHc.d_ring0))
    parHc.d_lat0 = get_val('d_lat_default', get_val('d_lat0', parHc.d_lat0))

    # 实例化并配置 TunnelParamsMc (严格与 parConPre 推导机制对齐)
    parMc = mc.TunnelParamsMc()
    parMc.ww = parHc.r_s + parHc.r_0
    parMc.hh = parHc.r_s + parHc.r_0  # 彻底去除 aspect_ratio 改变 hh 的物理力学计算分支
    parMc.tt = parHc.r_s - parHc.r_0
    parMc.depth = parHc.h_1 - (parHc.r_s + parHc.r_0) / 2.0  # 拱顶埋深由中心埋深 h_1 自动导出
    parMc.grades = get_val('grades', parMc.grades)
    parMc.concrete_grade = get_val('concrete_grade', parMc.concrete_grade)
    
    # 提取 Ag 并处理 m² 与 mm² 单位转换
    raw_ag = get_val('Ag', parMc.Ag)
    if raw_ag is not None:
        if raw_ag < 1.0:
            parMc.Ag = raw_ag * 1e6
        else:
            parMc.Ag = raw_ag

    parMc.as_mm = get_val('as_mm', parMc.as_mm)
    parMc.tol_safety_factor = get_val('tol_safety_factor', parMc.tol_safety_factor)
    rebar_type = "HRB400"  # 硬编码固定为 HRB400 钢筋

    # ===== Part1: 材料与围岩/结构参数计算 =====
    Ec, vc, mmc = mc.get_concrete_parameters(parMc.concrete_grade)
    rockParams = mc.get_rock_parameters(parMc.grades)

    Hq = mc.calculate_Hq(parMc.depth, parMc.ww, parMc.grades)

    Ks = rockParams['Ks'] * 1e6
    lam = rockParams['lams']
    ms = rockParams['ms']

    # ===== Part2: 水力计算与原始状态受力分析 =====
    h0 = hc.h0_scs_cn(parHc.H, parHc.p_mm, parHc.CN)
    ratio = parHc.r_0 / parHc.H

    is_double = (parHc.tunnel_type == "double")
    is_low = (ratio >= 0.062)
    case = ("double" if is_double else "single") + ("_low" if is_low else "_high")

    org = hc.calc_state(parHc.r_g, parHc, h0, case)

    try:
        waterHead = org['P'] / 10
    except KeyError:
        waterHead = org['P_crown'] / 10

    if waterHead <= Hq:
        p = (ms - 1000) * 9.8 * waterHead + ms * 9.8 * (Hq - waterHead)
    else:
        p = (ms - 1000) * 9.8 * Hq
    prw = waterHead * 10000

    res = mc.analyze_tunnel_lining_full(parMc.ww, parMc.hh, parMc.tt, Ec, p, lam, prw, Ks)
    N = res['N_elem']
    M = res['M_elem']

    K_list = []
    for i in range(len(N)):
        Ki = mc.get_safety_factor(-N[i] / 1000, abs(M[i]) / 1000, parMc.concrete_grade, rebar_type, parMc.tt, parMc.Ag, parMc.as_mm)
        K_list.append(Ki)

    nowK = min(K_list)
    control_idx = K_list.index(nowK)
    control_N = N[control_idx] / 1000.0  # 转换为 kN
    control_M = M[control_idx] / 1000.0  # 转换为 kN·m

    res['K_list'] = K_list
    res['nowK'] = nowK
    res['control_idx'] = control_idx
    res['control_N'] = control_N
    res['control_M'] = control_M

    deprecated_keys = {'c', 'depth', 'ha', 'K', 'h', 'r', 'r1', 'r2', 'rg', 'K1', 'K2', 'Kg', 'beta2', 'rebar_type', 'double_side', 'P_crit'}
    clean_input_data = {k: v for k, v in input_data.items() if k not in deprecated_keys}

    # ===== Part3: 临界水头与反算判断 =====
    if nowK > parMc.tol_safety_factor:
        raw_result = {
            "input_parameter": clean_input_data,
            "original_state": {
                "waterHead": waterHead,
                "safety_factor": nowK,
                "control_M": control_M,
                "control_N": control_N,
                "control_idx": control_idx,
                "q": org.get('q', 0.0),
                "Q": org.get('Q', 0.0),
                "P": org.get('P'),
                "P_crown": org.get('P_crown'),
                "P_invert": org.get('P_invert'),
                "d_ring": org.get('d_ring', 0.0),
                "S_ring": org.get('S_ring', 0.0),
                "d_long": org.get('d_long', 0.0),
                "d_lat": org.get('d_lat', 0.0),
                "ring_diam_recommend": org.get('d_ring', 0.0),
                "ring_spacing_recommend": org.get('S_ring', 0.0),
                "long_diam_recommend": org.get('d_long', 0.0),
                "lateral_diam_recommend": org.get('d_lat', 0.0),
                "lateral_spacing_recommend": 0.0
            },
            "echart_data": {
                "Hq": Hq,
                "lining_res_original": res
            }
        }
        return make_serializable(raw_result)
    else:
        # 保存原始计算结果
        res_original = res.copy() if isinstance(res, dict) else res
        water_head_original = waterHead
        original_safety_factor = nowK
        original_control_idx = control_idx
        original_control_N = control_N
        original_control_M = control_M

        # 容许水头运算
        waterHead = Hq
        waterHeadStep = 0.05
        maxHead = parMc.depth

        nowK = 10000
        nowi = 0
        while (nowK > parMc.tol_safety_factor + 0.001) and (maxHead > waterHead) and (nowi < 5000):
            waterHead += waterHeadStep
            if waterHead <= Hq:
                p = (ms - 1000) * 9.8 * waterHead + ms * 9.8 * (Hq - waterHead)
            else:
                p = (ms - 1000) * 9.8 * Hq
            prw = waterHead * 10000

            res = mc.analyze_tunnel_lining_full(parMc.ww, parMc.hh, parMc.tt, Ec, p, lam, prw, Ks)
            N = res['N_elem']
            M = res['M_elem']

            K_list = []
            for i in range(len(N)):
                Ki = mc.get_safety_factor(-N[i] / 1000, abs(M[i]) / 1000, parMc.concrete_grade, rebar_type, parMc.tt, parMc.Ag, parMc.as_mm)
                K_list.append(Ki)

            nowK = min(K_list)
            control_idx = K_list.index(nowK)
            control_N = N[control_idx] / 1000.0  # 转换为 kN
            control_M = M[control_idx] / 1000.0  # 转换为 kN·m
            res['K_list'] = K_list
            res['nowK'] = nowK
            res['control_idx'] = control_idx
            res['control_N'] = control_N
            res['control_M'] = control_M

            nowi += 1

        final_num_iterations = nowi
        final_water_head = waterHead
        final_safety_factor = nowK
        final_control_idx = control_idx
        final_control_N = control_N
        final_control_M = control_M

        # 临界注浆反算
        parHc.P_crit = waterHead * 10

        if case == "single_low":
            rg_crit = hc.solve_rg_single_low(parHc, h0)
        elif case == "single_high":
            rg_crit = hc.solve_rg_single_high(parHc, h0)
        elif case == "double_low":
            rg_crit = hc.solve_rg_double_low(parHc, h0)
        else:  # double_high
            rg_crit = hc.solve_rg_double_high(parHc, h0)

        tg_crit = max(0.0, rg_crit - parHc.r_p)
        crit = hc.calc_state(rg_crit, parHc, h0, case)
        P_crit_input = parHc.P_crit

        raw_result = {
            "input_parameter": clean_input_data,
            "original_state": {
                "waterHead": water_head_original,
                "safety_factor": original_safety_factor,
                "control_M": original_control_M,
                "control_N": original_control_N,
                "control_idx": original_control_idx,
                "q": org.get('q', 0.0),
                "Q": org.get('Q', 0.0),
                "P": org.get('P'),
                "P_crown": org.get('P_crown'),
                "P_invert": org.get('P_invert'),
                "d_ring": org.get('d_ring', 0.0),
                "S_ring": org.get('S_ring', 0.0),
                "d_long": org.get('d_long', 0.0),
                "d_lat": org.get('d_lat', 0.0),
                "ring_diam_recommend": org.get('d_ring', 0.0),
                "ring_spacing_recommend": org.get('S_ring', 0.0),
                "long_diam_recommend": org.get('d_long', 0.0),
                "lateral_diam_recommend": org.get('d_lat', 0.0),
                "lateral_spacing_recommend": 0.0
            },
            "critical_state": {
                "final_safety_factor": final_safety_factor,
                "final_waterHead": final_water_head,
                "final_control_M": final_control_M,
                "final_control_N": final_control_N,
                "final_control_idx": final_control_idx,
                "num_iterations": final_num_iterations,
                "P_crit_input": P_crit_input,
                "rg_crit": rg_crit,
                "tg_crit": tg_crit,
                "q": crit.get('q', 0.0),
                "Q": crit.get('Q', 0.0),
                "P": crit.get('P'),
                "P_crown": crit.get('P_crown'),
                "P_invert": crit.get('P_invert'),
                "d_ring": crit.get('d_ring', 0.0),
                "S_ring": crit.get('S_ring', 0.0),
                "d_long": crit.get('d_long', 0.0),
                "d_lat": crit.get('d_lat', 0.0),
                "ring_diam_recommend": crit.get('d_ring', 0.0),
                "ring_spacing_recommend": crit.get('S_ring', 0.0),
                "long_diam_recommend": crit.get('d_long', 0.0),
                "lateral_diam_recommend": crit.get('d_lat', 0.0),
                "lateral_spacing_recommend": 0.0
            },
            "echart_data": {
                "Hq": Hq,
                "lining_res_original": res_original,
                "lining_res_critical": res
            }
        }

        return make_serializable(raw_result)
