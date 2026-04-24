# Output Fields
## 完善后的drainage_engine.py
*提示*:
- 基于[原始计算模型](#原始计算模型的mainpy)/backend/services/main.py, 考虑双洞高水位[pdh],双洞低水位[pdl],单洞高水位[psh],单洞低水位[psl]，加入分发逻辑
- 尽量规范化变量命名
- 支持传递原始计算模型中所有计算结果数据的透传，以便echart绑定作图，包括:
    - 原始main.py的输出值
    ```python
    print(f"原始水头 = {waterHead:.1f}",f"安全系数 = {nowK:.2f}",f"弯矩 = {control_M:.1f}",f"轴力 = {control_N:.1f}",f"位置 = {control_idx:.0f}")
    print(f"最终安全系数 = {nowK:.3f}")
    print(f"最终水头 = {waterHead:.3f}")
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


    ```
    - [analyze_tunnel_lining_full]
    ```python
    def analyze_tunnel_lining_full(width: float, height: float, t: float, Ec: float, 
                               p: float, lam: float, prw: float, Ks: float):
    #---省略计算过程---      
    res= {
        'x': x, 'y': y,
        'N_elem': N_elem, 'M_elem': M_elem,
        'F_earth_x': F_earth[0::3], 'F_earth_y': F_earth[1::3],
        'F_water_x': F_water[0::3], 'F_water_y': F_water[1::3],
        'F_spring_x': F_spring_x, 'F_spring_y': F_spring_y,
        'active_springs': active_springs,
        'top_node': top_node, 'bottom_node': bottom_node,
        'R_top_x': R_top_x, 'R_bottom_x': R_bottom_x,
        'nx': nx_node, 'ny': ny_node
    }

    return res
    ```
    - [calculate_Hq]
     ```python
    def calculate_Hq(depth, width, grades):
    #---省略计算过程---      
    Hq = 0.45 * (2 ** ((6 - grades) / 6)) * width

    # 判断浅埋或深埋 未使用2.5为分界
    if depth <= Hq:
        # 浅埋：Hq 等于实际埋深
        Hq = depth
      
    
    return Hq
    ```
    - [calculate_safety_factor]
     ```python
    def calculate_safety_factor(M, concrete_grade, t, Ag, as_mm):
    #---省略计算过程---      
    # ==================== 安全系数计算 ====================
    K = Mu_kNm / M
    
    return K
    ```

## 匹配的calculate.py
*提示*:
- 严格匹配drainage_engine.py,实现POST API 路由
# Constraints
- 严格最小化修改
- 给出必要注释

# SourceData
## 已确定的Pydantic 数据验证模型
```python
# backend/app/models/schemas.py
from pydantic import BaseModel, Field
from typing import Literal

# ==========================================
# 核心数据模型定义 (Schemas)
# 根据架构设计，显式分离单洞(33个参数)与双洞(34个参数)。
# 统一将12个排水与曼宁常数作为保底默认参数写死，供前端高级设置折叠面板使用。
# ==========================================

class SingleTubeSchema(BaseModel):
    """
    单洞隧道计算入参
    共 33 个参数：2 个标识 + 19 个核心/复选参数 + 12 个默认高级参数
    """
    # --- 标识参数 (2个) ---
    tunnel_type: Literal["single"] = Field(..., description="隧道类型：单洞")
    water_level: Literal["low", "high"] = Field(..., description="水位条件：低水位/高水位")

    # --- 核心/复选参数 (19个) ---
    K: float = Field(..., description="岩体渗透系数 (m/d)")
    h: float = Field(..., description="初始地下水头 (m)")
    p_mm: float = Field(..., description="年降雨量 (mm)")
    Kg: float = Field(..., description="注浆圈渗透系数 (m/d)")
    K1: float = Field(..., description="初期支护渗透系数 (m/d)")
    K2: float = Field(..., description="二次衬砌渗透系数 (m/d)")
    
    cn_condition: Literal["灌溉良好", "灌溉较差"] = Field(..., description="灌溉条件 (SCS-CN查表)")
    land_use: Literal["工业用地", "商业用地", "居住地", "农业用地", "牧草地", "林地"] = Field(..., description="用地类型 (SCS-CN查表)")
    
    r: float = Field(..., description="隧道等效内半径 (m)")
    R1: float = Field(..., description="初支外半径 (m)")
    R2: float = Field(..., description="二衬外半径 (m)")
    Rg: float = Field(..., description="注浆圈外半径 (m)")
    c: float = Field(..., description="隧道埋深 (m，低水位模型使用)")
    
    start_chainage: float = Field(..., description="分区起点里程 (m)")
    end_chainage: float = Field(..., description="分区终点里程 (m)")
    
    beta2: float = Field(1.0, description="设计涌水量折减系数 (高水位模型使用)")
    Pcrown_crit: float = Field(50.0, description="临界拱顶水压力 (kPa，低水位模型反算Rg使用)")
    P_crit: float = Field(500.0, description="临界统一外水压力 (kPa，高水位模型反算Rg使用)")
    
    double_side: bool = Field(True, description="是否双侧排水")

    # --- 默认高级参数 (12个，直接写死保底值) ---
    gamma: float = Field(10.0, description="水的重度 (kN/m³)")
    n_long: float = Field(0.012, description="纵向排水管曼宁粗糙度")
    I_long: float = Field(0.02, description="纵向排水管水力坡降")
    n_ring: float = Field(0.012, description="环向排水盲管曼宁粗糙度")
    I_ring: float = Field(0.73, description="环向排水盲管水力坡降")
    n_lat: float = Field(0.012, description="横向排水管曼宁粗糙度")
    I_lat: float = Field(0.01, description="横向排水管水力坡降")
    S_code_max: float = Field(10.0, description="规范最大允许盲管间距 (m)")
    S_min: float = Field(3.0, description="工程实际最小允许间距 (m)")
    d_ring_default: float = Field(0.050, description="环向管默认内径 (m)")
    d_long_default: float = Field(0.100, description="纵向管默认内径 (m)")
    d_lat_default: float = Field(0.080, description="横向管默认内径 (m)")


class DoubleTubeSchema(BaseModel):
    """
    双洞隧道计算入参
    共 34 个参数：2 个标识 + 20 个核心/复选参数 + 12 个默认高级参数
    """
    # --- 标识参数 (2个) ---
    tunnel_type: Literal["double"] = Field(..., description="隧道类型：双洞")
    water_level: Literal["low", "high"] = Field(..., description="水位条件：低水位/高水位")

    # --- 核心/复选参数 (20个) ---
    K: float = Field(..., description="岩体渗透系数 (m/d)")
    h: float = Field(..., description="初始地下水头 (m)")
    ha: float = Field(0.0, description="下边界水头 (m，低水位模型使用)")
    p_mm: float = Field(..., description="年降雨量 (mm)")
    Kg: float = Field(..., description="注浆圈渗透系数 (m/d)")
    K1: float = Field(..., description="初期支护渗透系数 (m/d)")
    K2: float = Field(..., description="二次衬砌渗透系数 (m/d)")
    
    CN: float = Field(61.0, description="径流曲线数 (双洞模型直接接收CN值)")
    
    r: float = Field(..., description="单洞等效内半径 (m)")
    r1: float = Field(..., description="单洞初支外半径 (m)")
    r2: float = Field(..., description="单洞二衬外半径 (m)")
    rg: float = Field(..., description="单洞注浆圈外半径 (m)")
    c: float = Field(..., description="隧道埋深 (m)")
    
    start_chainage: float = Field(..., description="分区起点里程 (m)")
    end_chainage: float = Field(..., description="分区终点里程 (m)")
    
    D_spacing: float = Field(..., description="双洞中心间距 (m)")
    beta2: float = Field(1.0, description="设计涌水量折减系数")
    Pcrown_crit: float = Field(100.0, description="临界拱顶水压力 (kPa，低水位反算rg使用)")
    P_crit: float = Field(600.0, description="临界统一外水压力 (kPa，高水位反算rg使用)")
    
    double_side: bool = Field(True, description="是否双侧排水")

    # --- 默认高级参数 (12个，直接写死保底值) ---
    gamma: float = Field(10.0, description="水的重度 (kN/m³)")
    n_long: float = Field(0.012, description="纵向排水管曼宁粗糙度")
    I_long: float = Field(0.02, description="纵向排水管水力坡降")
    n_ring: float = Field(0.012, description="环向排水盲管曼宁粗糙度")
    I_ring: float = Field(0.73, description="环向排水盲管水力坡降")
    n_lat: float = Field(0.012, description="横向排水管曼宁粗糙度")
    I_lat: float = Field(0.01, description="横向排水管水力坡降")
    S_code_max: float = Field(10.0, description="规范最大允许盲管间距 (m)")
    S_min: float = Field(5.0, description="工程实际最小允许间距 (m，双洞默认略大)")
    d_ring_default: float = Field(0.050, description="环向管默认内径 (m)")
    d_long_default: float = Field(0.100, description="纵向管默认内径 (m)")
    d_lat_default: float = Field(0.080, description="横向管默认内径 (m)")
```
## 原始calculate.py
```python
from fastapi import APIRouter, HTTPException
from typing import Union
# 严格引用 SourceData 中定义的 Schemas
from app.models.schemas import SingleTubeSchema, DoubleTubeSchema

# 若需对接核心计算逻辑，请取消下行注释
# from app.services.drainage_engine import run_calculation 

router = APIRouter()

@router.post("/drainage", summary="执行隧道排水优化计算")
async def calculate_drainage(data: Union[SingleTubeSchema, DoubleTubeSchema]):
    """
    排水计算核心接口：
    1. 接收单洞(33参数)或双洞(34参数)模型数据。
    2. 自动校验参数有效性与默认高级设置。
    3. 调用 Python 排水引擎返回间距、孔径及水力参数。
    """
    try:
        # 此处封装调用 drainage_engine.py 的逻辑
        # 传入 data.dict() 进行结构化计算
        
        # 模拟计算返回结果（需替换为实际 service 返回值）
        result = {
            "tunnel_type": data.tunnel_type,
            "water_level": data.water_level,
            "optimized_parameters": {
                "S_ring": 5.2,          # 推荐环向间距 (m)
                "d_ring": 0.05,         # 推荐环向管径 (m)
                "P_max": 120.5,         # 最大外水压力 (kPa)
                "drainage_efficiency": 0.85
            },
            "status": "calculated"
        }
        return result
    except Exception as e:
        # 异常捕获并上报
        raise HTTPException(status_code=500, detail=f"计算引擎内部错误: {str(e)}")
```

## 原始计算模型的main.py

原始matplotlib画图已注释

```python



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



````

    