# backend/app/services/drainage_engine.py

# 修改前：
# import double_high as pdh

# 修改后：

import sys

from app.services import double_high as pdh #绝对路径引入模块，避免相对路径引入的混乱
from app.services import double_low as pdl
from app.services import single_high as psh
from app.services import single_low as psl

from app.services.analyze_tunnel_lining_full import analyze_tunnel_lining_full #精确导入函数本身,避免 from module import * 导入导致的命名空间混乱
from app.services.get_concrete_parameters import get_concrete_parameters
from app.services.get_rock_parameters import get_rock_parameters
from app.services.calculate_Hq import calculate_Hq
#from app.services.calculate_safety_factor import calculate_safety_factor
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
    HIGH_WATER_RATIO_THRESHOLD = 0.062  # 水位高低的判断阈值，实际项目中可能需要根据经验或规范调整
    is_double = (data.tunnel_type == "double")
    is_high = (data.r/data.c < HIGH_WATER_RATIO_THRESHOLD)  # 假设高水位的判断条件 是 r/d < 0.062，根据实际情况调整

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
            

    
    # 补充内部计算用隐式参数
    w=data.r        # 隧道宽
    h=w*data.aspect_ratio       # 隧道高
    t=data.r1-data.r         # 衬砌厚度
    depth=data.c    # 埋深
    grades=data.grades     # 围岩级别
    concrete_grade=data.concrete_grade     # 混凝土级别
    Ag=data.Ag     # 配筋面积
    as_mm=data.as_mm              # 钢筋保护层厚度
    tol_safety_factor=data.tol_safety_factor # 容许安全系数
    rebar_type=data.rebar_type # 钢筋类型

    Ec, vc, mc = get_concrete_parameters(concrete_grade)
    rock_params = get_rock_parameters(grades)
    Ks = rock_params['Ks'] * 1e6
    lam = rock_params['lams']
    ms = rock_params['ms']

    Hq = calculate_Hq(depth, w, grades)

    # ================= 原始状态计算 =================
    
    h0 = calc_module.h0_scs_cn(par.h, par.p_mm, par.CN)
    original = calc_module.calc_state_by_rg(par.rg, par, h0)
    
    try:
        waterHead=original['P']/10
    except:
        waterHead=original['P_crown']/10    
    if waterHead <= Hq: # 饱和重度计算得到的拱顶竖向围岩压力
        p=(ms-1000)*9.8*waterHead+ms*9.8*(Hq-waterHead)
    else:
        p=(ms-1000)*9.8*Hq
    prw=waterHead*10000  # 由水头高度计算得到的水压力
    res = analyze_tunnel_lining_full(w, h, t, Ec, p, lam, prw, Ks)                  # 计算轴力和弯矩,用的拱顶弯矩控制
    N=res['N_elem']
    M=res['M_elem']
    
    K_list = []
    for i in range(len(N)):
        Ki = hw.get_safety_factor(-N[i]/1000, abs(M[i])/1000, concrete_grade,rebar_type, t, Ag, as_mm)
        K_list.append(Ki)
    
    # 取全环最不利点
    nowK = min(K_list)
    control_idx = K_list.index(nowK)
    control_N = N[control_idx]
    control_M = M[control_idx]
    res['K_list']=K_list
    res['nowK']=nowK
    res['control_idx']=control_idx
    res['control_N']=control_N
    res['control_M']=control_M
    
    #print(f"原始水头 = {waterHead:.1f}",f"安全系数 = {nowK:.2f}",f"弯矩 = {control_M:.1f}",f"轴力 = {control_N:.1f}",f"位置 = {control_idx:.0f}")
    # Part4 #############################
    #####################################
    # 临界水头
    if nowK>tol_safety_factor:
        #return{"par":par, "original":original,"mechanicalBehavior":res}
    
        raw_result = {
        "input_parameter": input_data,
        "original_state": {
            "waterHead": waterHead,
            "safety_factor": nowK,
            "control_M": control_M,
            "control_N": control_N,
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
        "echart_data": {
            "Hq": Hq, 
            "lining_res_original": res # 这里的巨量 NumPy 数组将被安全转化为 list
            }
        }
        return make_serializable(raw_result) # 确保所有数据类型都可序列化为 JSON，特别是 NumPy 数据类型
    else:
        #####################################
        # 在进入试算循环前，先保存真实的原始状态数据，避免被循环体覆盖
        res_original = res.copy() if isinstance(res, dict) else res
        water_head_original = waterHead
        original_safety_factor = nowK
        original_control_idx = control_idx
        original_control_N = control_N
        original_control_M = control_M
        # 容许水头运算参数（一般不需要动）
        waterHead=Hq        # 起始拱顶水头,至少大于拱顶竖向荷载计算高度Hq
        waterHeadStep=0.05  # 水头试算步进
        maxHead=depth       # 容许的最大水头
        
        # 容许水头运算
        nowK=10000          # 较大的起始安全系数
        nowi=0
        while (nowK > tol_safety_factor+0.001) and (maxHead>waterHead) and (nowi<500): # 加入迭代次数限制，防止死循环
            waterHead=waterHead+waterHeadStep
            if waterHead <= Hq: # 饱和重度计算得到的拱顶竖向围岩压力
                p=(ms-1000)*9.8*waterHead+ms*9.8*(Hq-waterHead)
            else:
                p=(ms-1000)*9.8*Hq 
            prw=waterHead*10000  # 由水头高度计算得到的水压力
        
            res = analyze_tunnel_lining_full(w, h, t, Ec, p, lam, prw, Ks)                  # 计算轴力和弯矩,用的拱顶弯矩控制
            N=res['N_elem']
            M=res['M_elem']
          
            #######################
            # 按最小安全系数
            # 全环逐点验算，取最小安全系数
            K_list = []
            for i in range(len(N)):
                Ki = hw.get_safety_factor(-N[i]/1000, abs(M[i])/1000, concrete_grade,rebar_type, t, Ag, as_mm)
                K_list.append(Ki)
        
            # 取全环最不利点
            nowK = min(K_list)
            control_idx = K_list.index(nowK)
            control_N = N[control_idx]
            control_M = M[control_idx]
            res['K_list']=K_list
            res['nowK']=nowK
            res['control_idx']=control_idx
            res['control_N']=control_N
            res['control_M']=control_M
            #######################
        
            nowi=nowi+1
            # sys.stdout.write(
            #     f"\r计算次数 = {nowi:.0f} "
            #     f"水头 = {waterHead:.1f} "
            #     f"安全系数 = {nowK:.2f} "
            #     f"弯矩 = {control_M:.1f} "
            #     f"轴力 = {control_N:.1f} "
            #     f"位置 = {control_idx:.0f}    "
            # )
            # sys.stdout.flush()
           
        
        final_num_iterations=nowi
        final_water_head=waterHead
        final_safety_factor=nowK
        final_control_idx=control_idx
        final_control_N=control_N
        final_control_M=control_M

        #print(f"最终安全系数 = {nowK:.3f}")
        #print(f"最终水头 = {waterHead:.3f}")
        # tunnel_force_plt(res)
         
        
        #####################################
        # 临界
        par.P_crit=waterHead*10
        try:
            rg_crit = calc_module.solve_rg_from_Pcrit(
                P_crit=par.P_crit,
                h0=h0,
                p=par
            )
        except:
            rg_crit = calc_module.solve_rg_from_Pcrit(
                P_crit=par.P_crit,
                h0=h0,
                gamma=par.gamma,
                K=par.K, Kg=par.Kg, K1=par.K1, K2=par.K2,
                r=par.r, r1=par.r1, r2=par.r2
            )
    
        tg_crit = max(0.0, rg_crit - par.r2)
        
        critical = calc_module.calc_state_by_rg(rg_crit, par, h0)
        
        # line = "-" * 50
        
        # print("原始条件：")
        # print(f"q = {original['q']:.5f} m^3/(d·m)")
        # print(f"Q = {original['Q']:.5f} m^3/d")
        # try:
        #     print(f"P = {original['P']:.4f} kPa")
        # except:
        #     print(f"P_invert = {original['P_invert']:.4f} kPa")
        # print(f"ring_diam_recommend = {original['ring_diam_recommend']:.3f} m")
        # print(f"ring_spacing_recommend = {original['ring_spacing_recommend']:.3f} m")
        # print(f"long_diam_recommend = {original['long_diam_recommend']:.3f} m")
        # print(f"lateral_diam_recommend = {original['lateral_diam_recommend']:.3f} m")
        # print(f"lateral_spacing_recommend = {original['lateral_spacing_recommend']:.3f} m")
        # print(line)
        
        P_crit_input=par.P_crit

        # print("临界状态：")
        # print(f"P_crit_input = {par.P_crit:.4f} kPa")
        # print(f"rg_crit = {rg_crit:.5f} m")
        # print(f"tg_crit = {tg_crit:.5f} m")
        # print(f"q = {critical['q']:.5f} m^3/(d·m)")
        # print(f"Q = {critical['Q']:.5f} m^3/d")
        # try:
        #     print(f"P = {critical['P']:.4f} kPa")
        # except:
        #     print(f"P_invert = {critical['P_invert']:.4f} kPa")
        # print(f"ring_diam_recommend = {critical['ring_diam_recommend']:.3f} m")
        # print(f"ring_spacing_recommend = {critical['ring_spacing_recommend']:.3f} m")
        # print(f"long_diam_recommend = {critical['long_diam_recommend']:.3f} m")
        # print(f"lateral_diam_recommend = {critical['lateral_diam_recommend']:.3f} m")
        # print(f"lateral_spacing_recommend = {critical['lateral_spacing_recommend']:.3f} m")
        # print(line)
        
        critical['rg_crit']=rg_crit
        critical['tg_crit']=tg_crit
        
    
    
        #return{"original":original,"mechanicalBehavior":res,"critical":critical}    
        raw_result = {
            "input_parameter": input_data,
            "original_state": {
                "waterHead": water_head_original,
                "safety_factor": original_safety_factor,
                "control_M": original_control_M,
                "control_N": original_control_N,
                "control_idx": original_control_idx,
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
                "final_safety_factor": final_safety_factor,
                "final_waterHead": final_water_head,
                "final_control_M": final_control_M,
                "final_control_N": final_control_N,
                "final_control_idx": final_control_idx,
                "num_iterations": final_num_iterations,
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
                "lining_res_original": res_original,
                "lining_res_critical": res # 这里的巨量 NumPy 数组将被安全转化为 list
                
            }
        }
    
        return make_serializable(raw_result) # 确保所有数据类型都可序列化为 JSON，特别是 NumPy 数据类型