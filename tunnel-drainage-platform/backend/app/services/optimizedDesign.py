import mechcalc as mc
import hydrocalc as hc
import sys
from types import SimpleNamespace

def optimizedDesign(parMc,parHc):

    # Part1 ##############################
    ######################################
    # 获取使用参数 均需注意单位
    # 隧道断面和材料
    ww = parMc.ww         # 隧道宽
    hh = parMc.hh         # 隧道高
    tt = parMc.tt         # 衬砌厚度
    depth = parMc.depth   # 埋深
    grades = parMc.grades # 围岩级别
    concrete_grade = parMc.concrete_grade     # 混凝土级别
    Ag = parMc.Ag                             # 配筋面积
    as_mm = parMc.as_mm                       # 钢筋保护层厚度
    tol_safety_factor=parMc.tol_safety_factor # 容许安全系数
    
    Ec, vc, mmc = mc.get_concrete_parameters(concrete_grade) #获取混凝土参数
    rockParams = mc.get_rock_parameters(grades)             #获取围岩参数


    Hq = mc.calculate_Hq(depth, ww, grades)                 #获取拱顶竖向荷载计算高度
    
    Ks=rockParams['Ks']*1e6
    lam=rockParams['lams']
    ms=rockParams['ms']
    
    # Part2 #############################
    #####################################
    line = "=" * 70
    thin = "-" * 70

    # 基础计算
    h0 = hc.h0_scs_cn(parHc.H, parHc.p_mm, parHc.CN)
    ratio = parHc.r_0 / parHc.H

    # 工况判别
    is_double = parHc.tunnel_type == "double"
    is_low = ratio >= 0.062
    case = ("double" if is_double else "single") + ("_low" if is_low else "_high")
    case_name = f"{'双洞' if is_double else '单洞'}隧道 + {'低水位' if is_low else '高水位'}工况"

    # print(line)
    # print(f"计算工况：{case_name}")
    # print(f"r₀/H = {ratio:.4f}（阈值 0.062）")
    # print(f"有效水头 h₀ = {h0:.4f} m")
    # print(f"分区长度 L = {parHc.L:.2f} m")
    print(line)

    # 原始状态
    org = hc.calc_state(parHc.r_g, parHc, h0, case)
    print("【原始设计方案】")
    print(f"计算工况：{case_name} （r₀/H = {ratio:.4f}，阈值 0.062）")

    print(f"单位涌水量 q = {org['q']:.5f} m³/(d·m)")
    print(f"分区总涌水量 Q = {org['Q']:.3f} m³/d")
    if is_low:
        print(f"拱顶外水压力 P_crown = {org['P_crown']:.3f} kPa")
        print(f"仰拱外水压力 P_invert = {org['P_invert']:.3f} kPa")
    else:
        print(f"统一外水压力 P = {org['P']:.3f} kPa")
    

    # 内力安全系数计算
    try:
        waterHead=org['P']/10
    except:
        waterHead=org['P_crown']/10    
    if waterHead <= Hq: # 饱和重度计算得到的拱顶竖向围岩压力
        p=(ms-1000)*9.8*waterHead+ms*9.8*(Hq-waterHead)
    else:
        p=(ms-1000)*9.8*Hq
    prw=waterHead*10000  # 由水头高度计算得到的水压力
    res = mc.analyze_tunnel_lining_full(ww, hh, tt, Ec, p, lam, prw, Ks)                  # 计算轴力和弯矩,用的拱顶弯矩控制
    N=res['N_elem']
    M=res['M_elem']
    
    K_list = []
    for i in range(len(N)):
        Ki = mc.get_safety_factor(-N[i]/1000, abs(M[i])/1000, concrete_grade,"HRB400", tt, Ag, as_mm)
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
    
    # print(f"原始水头 = {waterHead:.1f}",f"安全系数 = {nowK:.2f}",f"弯矩 = {control_M:.1f}",f"轴力 = {control_N:.1f}",f"位置 = {control_idx:.0f}")
    if nowK > tol_safety_factor:
        print(f"衬砌结构的安全系数 = {nowK:.2f}（满足规范安全系数2.0要求，不需要堵水设计）")
        print(thin)
        print("【排水设计方案】")
        print(f"环向管推荐管径 = {org['d_ring']*1000:.0f} mm，间距 = {org['S_ring']:.2f} m")
        print(f"纵向管推荐管径 = {org['d_long']*1000:.0f} mm")
        print(f"横向管推荐管径 = {org['d_lat']*1000:.0f} mm")
    else:
        print(f"衬砌结构的安全系数 = {nowK:.2f}（不满足规范安全系数2.0要求，需要堵水设计）")
            
    # Part3 #############################
    #####################################
    # 临界水头
    if nowK > tol_safety_factor:
        return{"parMc":parMc,"parHc":parHc, "hydroOrg":org,"mechanicalBehavior":res}
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
        
            res = mc.analyze_tunnel_lining_full(ww, hh, tt, Ec, p, lam, prw, Ks)                  # 计算轴力和弯矩,用的拱顶弯矩控制
            N=res['N_elem']
            M=res['M_elem']
          
            #######################
            # 按最小安全系数
            # 全环逐点验算，取最小安全系数
            K_list = []
            for i in range(len(N)):
                Ki = mc.get_safety_factor(-N[i]/1000, abs(M[i])/1000, concrete_grade,"HRB400", tt, Ag, as_mm)
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
            pass
        
        # print(f"最终安全系数 = {nowK:.3f}")
        # print(f"最终水头 = {waterHead:.3f}")
        mc.tunnel_force_plt(res)
         
        #####################################
        # 临界注浆
        parHc.P_crit=waterHead*10

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
        
        print(thin)
        print("【注浆堵水方案】")
        print(f"计算工况：{case_name} （r₀/H = {ratio:.4f}，阈值 0.062）")
        
        print(f"控制压力 P_crit = {parHc.P_crit:.2f} kPa")
        print(f"临界注浆半径 r_g_crit = {rg_crit:.4f} m")
        print(f"临界注浆厚度 t_g_crit = {tg_crit:.4f} m")
        print(f"单位涌水量 q = {crit['q']:.5f} m³/(d·m)")
        print(f"分区总涌水量 Q = {crit['Q']:.3f} m³/d")
        if is_low:
            print(f"仰拱外水压力 P_invert = {crit['P_invert']:.3f} kPa")
        else:
            print(f"统一外水压力 P = {crit['P']:.3f} kPa")
        print(thin)    
        print("【排水设计方案】")
        print(f"环向管推荐管径 = {crit['d_ring']*1000:.0f} mm，间距 = {crit['S_ring']:.2f} m")
        print(f"纵向管推荐管径 = {crit['d_long']*1000:.0f} mm")
        print(f"横向管推荐管径 = {crit['d_lat']*1000:.0f} mm")
        print(line)
        
        return{"parMc":parMc,"parHc":parHc, "hydroOrg":org,"mechanicalBehavior":res,"hydroCritical":crit,"hydroRg_crit":rg_crit}

def parConPre(par):

    ####### 水力计算参数
    parHc=hc.TunnelParamsHc()
    # ===== 核心必选（最常修改） =====
    parHc.k_r = par.k_r                      # 围岩渗透系数 m/d
    parHc.H = par.H                          # 初始静水位水头 m
    parHc.r_0 = par.r_0                      # 二衬内半径 m
    parHc.r_s = par.r_s                      # 二衬外半径 m
    parHc.r_p = par.r_p                      # 初支外半径 m
    parHc.r_g = par.r_g                      # 注浆圈外半径 m
    parHc.k_s = par.k_s                      # 二衬渗透系数 m/d
    parHc.k_p = par.k_p                      # 初支渗透系数 m/d
    parHc.k_g = par.k_g                      # 注浆圈渗透系数 m/d
    parHc.start_chainage = par.start_chainage  # 起点里程 m
    parHc.end_chainage = par.end_chainage      # 终点里程 m
    # parHc.P_crit = par.P_crit                # 临界控制水压力 kPa

    # ===== 工况开关 =====
    parHc.tunnel_type = par.tunnel_type      # single / double
    parHc.h_1 = par.h_1                      # 隧道中心埋深 m（低水位用）
    parHc.D_spacing = par.D_spacing          # 双洞中心间距 m（双洞用）

    # ===== 降雨与下垫面 =====
    parHc.p_mm = par.p_mm                    # 年降雨量 mm
    parHc.cn_condition = par.cn_condition
    parHc.land_use = par.land_use

    # ===== 高级默认参数（一般不改） =====
    parHc.gamma = par.gamma
    parHc.double_side = par.double_side
    parHc.S_min = par.S_min
    parHc.S_max = par.S_max

    parHc.n_long = par.n_long
    parHc.i_long = par.i_long
    parHc.n_ring = par.n_ring
    parHc.i_ring = par.i_ring
    parHc.n_lat = par.n_lat
    parHc.i_lat = par.i_lat

    parHc.d_long0 = par.d_long0
    parHc.d_ring0 = par.d_ring0
    parHc.d_lat0 = par.d_lat0

    ####### 结构力学计算参数
    parMc=mc.TunnelParamsMc()

    parMc.ww = parHc.r_s+parHc.r_0                     # 隧道宽 m
    parMc.hh = parHc.r_s+parHc.r_0                     # 隧道高 m
    parMc.tt = parHc.r_s-parHc.r_0                     # 衬砌厚度 m
    parMc.depth = parHc.h_1-(parHc.r_s+parHc.r_0)/2    # 拱顶埋深 m

    parMc.grades = par.grades                # 围岩级别
    parMc.concrete_grade = par.concrete_grade  # 混凝土级别
    parMc.Ag = par.Ag                        # 配筋面积 mm²
    parMc.as_mm = par.as_mm                  # 钢筋保护层厚度 mm
    parMc.tol_safety_factor = par.tol_safety_factor  # 容许安全系数
    
    rs=optimizedDesign(parMc,parHc)
    return rs
    
if __name__ == "__main__":
    # 参数输入
    par = SimpleNamespace()
    
    # ===== 分区起终点桩号（最常修改） =====   
    par.start_chainage = 0    # 起点里程 m
    par.end_chainage = 47     # 终点里程 m
    
    # ===== 隧道类型（d单洞、双洞） =====   
    par.tunnel_type = "single"  # single / double
    
    # ===== 水力学参数（最常修改） =====
    par.p_mm = 1000.0          # 年降雨量 mm
    par.cn_condition = "灌溉良好"
    par.land_use = "居住地"
    par.H = 120               # 初始静水位水头 m
    par.k_r = 0.15            # 围岩渗透系数 m/d
    par.k_s = 0.000864        # 二衬渗透系数 m/d
    par.k_p = 0.00864         # 初支渗透系数 m/d
    par.k_g = 0.00864         # 注浆圈渗透系数 m/d
    par.r_0 = 7.95            # 二衬内半径 m
    par.r_s = 8.35            # 二衬外半径 m
    par.r_p = 8.57            # 初支外半径 m
    par.r_g = 8.57            # 注浆圈外半径 m
    par.D_spacing = 40.0      # 双洞中心间距 m（双洞用）
    
    # ===== 结构力学计算参数 =====
    par.h_1 = 130             # 隧道中心埋深 m
    par.grades = 4            # 围岩级别
    par.concrete_grade = 35   # 混凝土级别
    par.Ag = 1000              # 配筋面积 mm²
    par.as_mm =50             # 钢筋保护层厚度 mm
    par.tol_safety_factor = 2 # 容许安全系数

  
    # ===== 排水管设计参数（一般不改） =====
    par.gamma = 10.0
    par.double_side = True
    par.S_min = 3.0
    par.S_max = 10.0

    par.n_long = 0.012
    par.i_long = 0.02
    par.n_ring = 0.012
    par.i_ring = 0.73
    par.n_lat = 0.012
    par.i_lat = 0.01

    par.d_long0 = 0.10
    par.d_ring0 = 0.05
    par.d_lat0 = 0.10

    rs=parConPre(par)