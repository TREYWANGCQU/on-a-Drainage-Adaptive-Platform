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

import numpy as np  
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
    分发计算逻辑，支持单洞/双洞及高/低水位。
    透传原始计算结果用于 Echarts 渲染。
    """
    # ================= 状态标识 =================
    is_double = (data.tunnel_type == "double")
    is_high = (data.water_level == "high")

    # ================= 分发逻辑 =================
    if is_double and is_high:
        calc_module = pdh
    elif is_double and not is_high:
        calc_module = pdl
    elif not is_double and is_high:
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
    
    
    # 动态匹配单双洞的半径变量名
    r1_val = par.R1 if not is_double else par.r1
    r2_val = par.R2 if not is_double else par.r2
    rg_init = par.Rg if not is_double else par.rg
    
    # 补充内部计算用隐式参数
    aspect_ratio = data.aspect_ratio  
    depth = data.c  
    grades = data.grades 
    concrete_grade = data.concrete_grade
    Ag = data.Ag
    as_mm = data.as_mm
    tol_safety_factor = data.tol_safety_factor
    
    w = par.r
    h_tunnel = w * aspect_ratio
    t = r1_val - par.r  # 修正：单洞用 R1，双洞用 r1

    Ec, vc, mc = get_concrete_parameters(concrete_grade)
    rock_params = get_rock_parameters(grades)
    Ks = rock_params['Ks'] * 1e6
    lam = rock_params['lams']
    ms = rock_params['ms']

    Hq = calculate_Hq(depth, w, grades)

    # ================= 原始状态计算 =================
    # 优先使用内部模型计算出的 CN 值 (单洞逻辑)，否则降级取 data 传入值
    current_CN = getattr(par, "CN", getattr(data, "CN", 61.0)) 
    h0 = calc_module.h0_scs_cn(par.h, par.p_mm, current_CN)
    
    # 抹平底层函数名大小写差异 (单洞 calc_state_by_Rg vs 双洞 calc_state_by_rg)
    calc_state_func = getattr(calc_module, "calc_state_by_rg", getattr(calc_module, "calc_state_by_Rg", None))
    original = calc_state_func(rg_init, par, h0)

    # 提取压力用于迭代：高水位取 'P'，低水位取 'P_crown'
    water_head_original = original.get('P', original.get('P_crown', 0)) / 10
    
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
    max_iterations = 500 # 迭代上限，防止死循环
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

    # ================= 反算临界 Rg =================
    # 根据单/双洞和高/低水位，动态调用反算函数及入参装配
    if is_double:
        if is_high:
            P_crit_input = par.P_crit = water_head_crit * 10
            rg_crit = calc_module.solve_rg_from_Pcrit(P_crit=P_crit_input, h0=h0, p=par)
        else:
            P_crit_input = par.Pcrown_crit = water_head_crit * 10
            rg_crit = calc_module.solve_rg_from_Pcrown_crit(Pcrown_crit=P_crit_input, h0=h0, p=par)
    else:
        if is_high:
            P_crit_input = par.P_crit = water_head_crit * 10
            rg_crit = calc_module.solve_Rg_from_P_crit(P_crit=P_crit_input, h0=h0, gamma=par.gamma, K=par.K, Kg=par.Kg, K1=par.K1, K2=par.K2, r=par.r, R1=par.R1, R2=par.R2)
        else:
            P_crit_input = par.Pcrown_crit = water_head_crit * 10
            rg_crit = calc_module.solve_Rg_from_Pcrown_crit(Pcrown_crit=P_crit_input, h0=h0, gamma=par.gamma, K=par.K, Kg=par.Kg, K1=par.K1, K2=par.K2, r=par.r, R1=par.R1, R2=par.R2)

    tg_crit = max(0.0, rg_crit - r2_val)
    critical = calc_state_func(rg_crit, par, h0)

    # ================= Echart作图数据透传组装 =================
    raw_result = {
        "tunnel_type": data.tunnel_type,
        "water_level": data.water_level,
        "original_state": {
            "waterHead": water_head_original,
            "safety_factor": min(k_list_orig),
            "control_M": M_orig[control_idx],
            "control_N": N_orig[control_idx],
            "control_idx": control_idx,
            # 使用 .get() 确保高低水位切换时不会触发 KeyError
            "q": original.get('q', 0.0), 
            "Q": original.get('Q', 0.0),
            "P": original.get('P'),
            "P_crown": original.get('P_crown'),
            "P_invert": original.get('P_invert'),
            "ring_diam_recommend": original.get('ring_diam_recommend', 0),
            "ring_spacing_recommend": original.get('ring_spacing_recommend', 0),
            "long_diam_recommend": original.get('long_diam_recommend', 0),
            "lateral_diam_recommend": original.get('lateral_diam_recommend', 0),
            "lateral_spacing_recommend": original.get('lateral_spacing_recommend', 0)
        },
        "critical_state": {
            "final_safety_factor": now_k,
            "final_waterHead": water_head_crit,
            "P_crit_input": P_crit_input,
            "rg_crit": rg_crit,
            "tg_crit": tg_crit,
            "q": critical.get('q', 0.0), 
            "Q": critical.get('Q', 0.0),
            "P": critical.get('P'),
            "P_crown": critical.get('P_crown'),
            "P_invert": critical.get('P_invert'),
            "ring_diam_recommend": critical.get('ring_diam_recommend', 0),
            "ring_spacing_recommend": critical.get('ring_spacing_recommend', 0),
            "long_diam_recommend": critical.get('long_diam_recommend', 0),
            "lateral_diam_recommend": critical.get('lateral_diam_recommend', 0),
            "lateral_spacing_recommend": critical.get('lateral_spacing_recommend', 0)
        },
        "echart_data": {
            "Hq": Hq, 
            "lining_res_original": res_original, # 这里的巨量 NumPy 数组将被安全转化为 list
            "lining_res_critical": res_crit      
        }
    }
    return make_serializable(raw_result) # 确保所有数据类型都可序列化为 JSON，特别是 NumPy 数据类型