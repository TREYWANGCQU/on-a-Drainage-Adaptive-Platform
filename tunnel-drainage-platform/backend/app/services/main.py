
from analyze_tunnel_lining_full import *
from get_concrete_parameters import *
from get_rock_parameters import *
from calculate_Hq import *
from calculate_safety_factor import *
from tunnel_force_plt import *
import highway_safety_factor as hw

import double_hige as pdh
import double_low as pdl
import single_hige as psh
import single_low as psl

import sys
# Part1 ##############################
######################################
# 参数输入
par=pdh.Params()

# 水文地质
par.K: float = 0.3
par.h: float = 90.5
par.gamma: float = 10.0
par.p_mm: float = 1002.5
par.CN: float = 61.0

# 衬砌
par.r: float = 8.3
par.r1: float = 8.8
par.r2: float = 9.0
par.rg: float = 9.0
par.aspectRatio=0.7

par.K1: float = 0.000864
par.K2: float = 0.00864
par.Kg: float = 0.00864

# 隧道（双洞）
par.L: float = 405.0 - 310.0
par.D_spacing: float = 40.0
par.beta2: float = 0.5

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

# 默认最小管径
par.d_ring_default: float = 0.050
par.d_long_default: float = 0.100
par.d_lat_default: float = 0.080

# 临界压力输入值
par.P_crit: float = 600

# Part2 #############################
#####################################
# 获取使用参数 均需注意单位
# 隧道断面和材料
w=par.r        # 隧道宽
h=w*par.aspectRatio       # 隧道高
t=par.r1-par.r         # 衬砌厚度
depth=1000    # 埋深
grades=5     # 围岩级别
concrete_grade=40     # 混凝土级别
Ag=22**2/4*3.14*4     # 配筋面积
as_mm=50              # 钢筋保护层厚度
tol_safety_factor=2.0 # 容许安全系数

Ec, vc, mc = get_concrete_parameters(concrete_grade) #获取混凝土参数
rockParams = get_rock_parameters(grades)             #获取围岩参数
Hq = calculate_Hq(depth, w, grades)                 #获取拱顶竖向荷载计算高度

Ks=rockParams['Ks']*1e6
lam=rockParams['lams']
ms=rockParams['ms']

# Part3 #############################
#####################################
# 原始
h0 = pdh.h0_scs_cn(par.h, par.p_mm, par.CN)

original = pdh.calc_state_by_rg(par.rg, par, h0)

waterHead=original['P']/10
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

print(f"原始水头 = {waterHead:.1f}",f"安全系数 = {nowK:.2f}",f"弯矩 = {control_M:.1f}",f"轴力 = {control_N:.1f}",f"位置 = {control_idx:.0f}")
# Part4 #############################
#####################################
# 临界水头
if nowK<=tol_safety_factor:
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
    #tunnel_force_plt(res)
     
    
    #####################################
    # 临界
    par.P_crit=waterHead*10
    
    rg_crit = pdh.solve_rg_from_Pcrit(
        P_crit=par.P_crit,
        h0=h0,
        p=par
    )
    tg_crit = max(0.0, rg_crit - par.r2)
    
    critical = pdh.calc_state_by_rg(rg_crit, par, h0)
    
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
    print(f"P_crit_input = {par.P_crit:.4f} kPa")
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


    