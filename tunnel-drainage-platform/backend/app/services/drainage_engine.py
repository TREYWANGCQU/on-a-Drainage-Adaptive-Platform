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