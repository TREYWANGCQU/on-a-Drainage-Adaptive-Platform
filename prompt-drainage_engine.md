根据最新更新的main.py，最小化修改完善原始drainage_engine.py，要点：
- 仔细检查输入参数是否与main.py 一致
- 仔细检查计算结果输出是否是有遗落

# 原始drainage_engine.py
```python
# backend/app/services/drainage_engine.py

# 修改前：
# import double_high as pdh

# 修改后：

from app.services import double_high as pdh #绝对路径引入模块，避免相对路径引入的混乱
from app.services import double_low as pdl
from app.services import single_high as psh
from app.services import single_low as psl

from app.services.analyze_tunnel_lining_full import analyze_tunnel_lining_full #精确导入函数本身,避免 from module import * 导入导致的命名空间混乱
from app.services.get_concrete_parameters import get_concrete_parameters
from app.services.get_rock_parameters import get_rock_parameters
from app.services.calculate_Hq import calculate_Hq
from app.services.calculate_safety_factor import calculate_safety_factor
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
    is_high = (data.r/data.depth < 0.062)  # 假设高水位的判断条件 是 r/d < 0.062，根据实际情况调整

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
```
# 更新的main.py
```python
from analyze_tunnel_lining_full import *
from get_concrete_parameters import *
from get_rock_parameters import *
from calculate_Hq import *
from calculate_safety_factor import *
#from tunnel_force_plt import *
import highway_safety_factor as hw

import double_high as pdh

import sys
def optimizedDesign(par):

    # Part1 ##############################
    ######################################
    if par.duOrsi==1 and par.r/par.depth<0.062:
        import single_high as pds
    elif par.duOrsi==1 and par.r/par.depth>=0.062:
        import single_low as pds
    elif par.duOrsi==2 and par.r/par.depth<0.062:
        import double_high as pds
    elif par.duOrsi==2 and par.r/par.depth>=0.062:
        import double_low as pds     
    # Part2 #############################
    #####################################
    # 获取使用参数 均需注意单位
    # 隧道断面和材料
    w=par.r        # 隧道宽
    h=w*par.aspectRatio       # 隧道高
    t=par.r1-par.r         # 衬砌厚度
    depth=par.depth    # 埋深
    grades=par.grades     # 围岩级别
    concrete_grade=par.concrete_grade     # 混凝土级别
    Ag=par.Ag     # 配筋面积
    as_mm=par.as_mm              # 钢筋保护层厚度
    tol_safety_factor=par.tol_safety_factor # 容许安全系数
    
    Ec, vc, mc = get_concrete_parameters(concrete_grade) #获取混凝土参数
    rockParams = get_rock_parameters(grades)             #获取围岩参数
    Hq = calculate_Hq(depth, w, grades)                 #获取拱顶竖向荷载计算高度
    
    Ks=rockParams['Ks']*1e6
    lam=rockParams['lams']
    ms=rockParams['ms']
    
    # Part3 #############################
    #####################################
    # 原始
    h0 = pds.h0_scs_cn(par.h, par.p_mm, par.CN)
    
    original = pds.calc_state_by_rg(par.rg, par, h0)
    
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
        Ki = hw.get_safety_factor(-N[i]/1000, abs(M[i])/1000, concrete_grade,"HRB400", t, Ag, as_mm)
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
    
    print(f"原始水头 = {waterHead:.1f}",f"安全系数 = {nowK:.2f}",f"弯矩 = {control_M:.1f}",f"轴力 = {control_N:.1f}",f"位置 = {control_idx:.0f}")
    # Part4 #############################
    #####################################
    # 临界水头
    if nowK>tol_safety_factor:
        return{"par":par, "original":original,"mechanicalBehavior":res}
    else:
        #####################################
        # 容许水头运算参数（一般不需要动）
        waterHead=Hq        # 起始拱顶水头,至少大于拱顶竖向荷载计算高度Hq
        waterHeadStep=0.05  # 水头试算步进
        maxHead=depth       # 容许的最大水头
        
        # 容许水头运算
        nowK=10000          # 较大的起始安全系数
        nowi=0
        while (nowK > tol_safety_factor+0.001) & (maxHead>waterHead):
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
                Ki = hw.get_safety_factor(-N[i]/1000, abs(M[i])/1000, concrete_grade,"HRB400", t, Ag, as_mm)
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
            sys.stdout.write(
                f"\r计算次数 = {nowi:.0f} "
                f"水头 = {waterHead:.1f} "
                f"安全系数 = {nowK:.2f} "
                f"弯矩 = {control_M:.1f} "
                f"轴力 = {control_N:.1f} "
                f"位置 = {control_idx:.0f}    "
            )
            sys.stdout.flush()
            pass
        
        print(f"最终安全系数 = {nowK:.3f}")
        print(f"最终水头 = {waterHead:.3f}")
        # tunnel_force_plt(res)
         
        
        #####################################
        # 临界
        par.P_crit=waterHead*10
        try:
            rg_crit = pds.solve_rg_from_Pcrit(
                P_crit=par.P_crit,
                h0=h0,
                p=par
            )
        except:
            rg_crit = pds.solve_rg_from_Pcrit(
                P_crit=par.P_crit,
                h0=h0,
                gamma=par.gamma,
                K=par.K, Kg=par.Kg, K1=par.K1, K2=par.K2,
                r=par.r, r1=par.r1, r2=par.r2
            )
    
        tg_crit = max(0.0, rg_crit - par.r2)
        
        critical = pds.calc_state_by_rg(rg_crit, par, h0)
        
        line = "-" * 50
        
        print("原始条件：")
        print(f"q = {original['q']:.5f} m^3/(d·m)")
        print(f"Q = {original['Q']:.5f} m^3/d")
        try:
            print(f"P = {original['P']:.4f} kPa")
        except:
            print(f"P_invert = {original['P_invert']:.4f} kPa")
        print(f"ring_diam_recommend = {original['ring_diam_recommend']:.3f} m")
        print(f"ring_spacing_recommend = {original['ring_spacing_recommend']:.3f} m")
        print(f"long_diam_recommend = {original['long_diam_recommend']:.3f} m")
        print(f"lateral_diam_recommend = {original['lateral_diam_recommend']:.3f} m")
        print(f"lateral_spacing_recommend = {original['lateral_spacing_recommend']:.3f} m")
        print(line)
        
        print("临界状态：")
        print(f"P_crit_input = {par.P_crit:.4f} kPa")
        print(f"rg_crit = {rg_crit:.5f} m")
        print(f"tg_crit = {tg_crit:.5f} m")
        print(f"q = {critical['q']:.5f} m^3/(d·m)")
        print(f"Q = {critical['Q']:.5f} m^3/d")
        try:
            print(f"P = {critical['P']:.4f} kPa")
        except:
            print(f"P_invert = {critical['P_invert']:.4f} kPa")
        print(f"ring_diam_recommend = {critical['ring_diam_recommend']:.3f} m")
        print(f"ring_spacing_recommend = {critical['ring_spacing_recommend']:.3f} m")
        print(f"long_diam_recommend = {critical['long_diam_recommend']:.3f} m")
        print(f"lateral_diam_recommend = {critical['lateral_diam_recommend']:.3f} m")
        print(f"lateral_spacing_recommend = {critical['lateral_spacing_recommend']:.3f} m")
        print(line)
        
        critical['rg_crit']=rg_crit
        critical['tg_crit']=tg_crit
        
    return{"par":par, "original":original,"mechanicalBehavior":res,"critical":critical}

if __name__ == "__main__":
    # 参数输入
    par=pdh.Params()

    # 水文地质
    par.K: float = 0.3
    par.h: float = 90.5
    par.gamma: float = 10.0
    par.p_mm: float = 1002.5
    par.CN: float = 61.0
    par.ha: float = 0.0   #双线低水位

    # 衬砌
    par.r: float = 8.3
    par.r1: float = 8.8
    par.r2: float = 9.0
    par.rg: float = 9.0

    par.K1: float = 0.000864
    par.K2: float = 0.00864
    par.Kg: float = 0.00864

    # 隧道（双洞）
    par.L: float = 405.0 - 310.0
    par.D_spacing: float = 40.0
    par.beta2: float = 0.5
    par.c: float = 32.0  #隧道中心埋深，双线低水位

    # 曼宁参数
    par.n_long: float = 0.012
    par.I_long: float = 0.02
    par.n_ring: float = 0.012
    par.I_ring: float = 0.75
    par.n_lat: float = 0.012
    par.I_lat: float = 0.01

    # 设计控制
    par.double_side: bool = True
    par.S_code_max: float = 10.0
    par.S_min: float = 3.0
    par.beta2: float = 1.0 #单线高水位

    # 默认最小管径
    par.d_ring_default: float = 0.050
    par.d_long_default: float = 0.100
    par.d_lat_default: float = 0.080

    # 临界压力输入值
    par.P_crit: float = 600

    # 安全系数计算用参数
    par.depth: float = 100
    par.aspectRatio: float =0.7
    par.grades: float = 5
    par.concrete_grade: float = 40
    par.Ag: float = 22**2/4*3.14*4
    par.as_mm: float = 50
    par.tol_safety_factor: float =2.0
    par.duOrsi: float =1.0 # 1单线 2双线；
    
    rs=optimizedDesign(par)
```