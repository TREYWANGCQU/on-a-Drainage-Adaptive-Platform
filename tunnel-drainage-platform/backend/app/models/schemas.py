# backend/app/models/schemas.py
from pydantic import BaseModel, Field
from typing import Literal

# ==========================================
# 核心数据模型定义 (Schemas)
# 根据架构设计，显式分离单洞(38个参数)与双洞(41个参数)。
# 统一将12个排水与曼宁常数作为保底默认参数写死，供前端高级设置折叠面板使用。
# ==========================================

class SingleTubeSchema(BaseModel):
    """
    单洞隧道计算入参
    共 38 个参数：2 个标识 + 24个核心/复选参数 + 12 个默认高级参数
    """
    # --- 标识参数 (2个) ---
    tunnel_type: Literal["single"] = Field(..., description="隧道类型：单洞")
    water_level: Literal["low", "high"] = Field(..., description="水位条件：低水位/高水位")

    # --- 核心/复选参数 (24个) ---
    
    K: float = Field(..., description="岩体渗透系数 (m/d)")
    h: float = Field(..., description="初始地下水头 (m)")
    p_mm: float = Field(..., description="年降雨量 (mm)")
    Kg: float = Field(..., description="注浆圈渗透系数 (m/d)")
    K1: float = Field(..., description="初期支护渗透系数 (m/d)")
    K2: float = Field(..., description="二次衬砌渗透系数 (m/d)")
    
    cn_condition: Literal["灌溉良好", "灌溉较差"] = Field(..., description="灌溉条件 (SCS-CN查表)")
    land_use: Literal["工业用地", "商业用地", "居住地", "农业用地", "牧草地", "林地"] = Field(..., description="用地类型 (SCS-CN查表)")
    grades: int = Field(..., description="围岩级别 (1-6级，1为Ⅰ级，6为Ⅵ级)")

    r: float = Field(..., description="隧道等效内半径 (m)")
    R1: float = Field(..., description="初支外半径 (m)")
    R2: float = Field(..., description="二衬外半径 (m)")
    Rg: float = Field(..., description="注浆圈外半径 (m)")
    c: float = Field(..., description="隧道埋深 (m，低水位模型使用)")
    
    start_chainage: float = Field(..., description="分区起点里程 (m)")
    end_chainage: float = Field(..., description="分区终点里程 (m)")
    concrete_grade: Literal["C15", "C20", "C25", "C30", "C35", "C40", "C45", "C50"] = Field(..., description="混凝土等级，例如'C30', 'C40'")
    rebar_type: Literal["HRB300","HRB400", "HRB500"] = Field(..., description="钢筋类型")
    Ag: float = Field(..., description="配筋面积 (m²)")
    

    beta2: float = Field(1.0, description="设计涌水量折减系数 (高水位模型使用)")
    Pcrown_crit: float = Field(50.0, description="临界拱顶水压力 (kPa，低水位模型反算Rg使用)")
    P_crit: float = Field(500.0, description="临界统一外水压力 (kPa，高水位模型反算Rg使用)")
    
    I_long: float = Field(0.02, description="纵向排水管水力坡降")
    double_side: bool = Field(..., description="是否双侧排水")
    
    # --- 默认高级参数 (12个，直接写死保底值) ---
    as_mm: float = Field(50.0, description="钢筋保护层厚度 (mm)")
    gamma: float = Field(10.0, description="水的重度 (kN/m³)")
    n_long: float = Field(0.012, description="纵向排水管曼宁粗糙度")
    n_ring: float = Field(0.012, description="环向排水盲管曼宁粗糙度")
    I_ring: float = Field(0.73, description="环向排水盲管水力坡降")
    n_lat: float = Field(0.012, description="横向排水管曼宁粗糙度")
    I_lat: float = Field(0.01, description="横向排水管水力坡降")
    S_code_max: float = Field(10.0, description="规范最大允许盲管间距 (m)")
    S_min: float = Field(3.0, description="工程实际最小允许间距 (m)")
    d_ring_default: float = Field(0.050, description="环向管默认内径 (m)")
    d_long_default: float = Field(0.100, description="纵向管默认内径 (m)")
    d_lat_default: float = Field(0.080, description="横向管默认内径 (m)")
    tol_safety_factor: float = Field(2.0, description="容许安全系数")
    aspect_ratio: float = Field(0.7, description="隧道高宽比 (h/w)")

class DoubleTubeSchema(BaseModel):
    """
    双洞隧道计算入参
    共 41 个参数：2 个标识 + 27 个核心/复选参数 + 12 个默认高级参数
    """
    # --- 标识参数 (2个) ---
    tunnel_type: Literal["double"] = Field(..., description="隧道类型：双洞")
    water_level: Literal["low", "high"] = Field(..., description="水位条件：低水位/高水位")

    # --- 核心/复选参数 (27个) ---
    K: float = Field(..., description="岩体渗透系数 (m/d)")
    h: float = Field(..., description="初始地下水头 (m)")
    ha: float = Field(0.0, description="下边界水头 (m，低水位模型使用)") # 双洞模型新增参数，低水位模型反算rg使用
    p_mm: float = Field(..., description="年降雨量 (mm)")
    Kg: float = Field(..., description="注浆圈渗透系数 (m/d)")
    K1: float = Field(..., description="初期支护渗透系数 (m/d)")
    K2: float = Field(..., description="二次衬砌渗透系数 (m/d)")
    
    cn_condition: Literal["灌溉良好", "灌溉较差"] = Field(..., description="灌溉条件 (SCS-CN查表)")
    land_use: Literal["工业用地", "商业用地", "居住地", "农业用地", "牧草地", "林地"] = Field(..., description="用地类型 (SCS-CN查表)")
    grades: int = Field(..., description="围岩级别 (1-6级，1为Ⅰ级，6为Ⅵ级)")


    CN: float = Field(61.0, description="径流曲线数 (双洞模型直接接收CN值)") # 双洞模型新增参数，直接接收CN值，前端根据灌溉条件和用地类型查表计算后传入
    
    r: float = Field(..., description="单洞等效内半径 (m)")
    r1: float = Field(..., description="单洞初支外半径 (m)")
    r2: float = Field(..., description="单洞二衬外半径 (m)")
    rg: float = Field(..., description="单洞注浆圈外半径 (m)")
    c: float = Field(..., description="隧道埋深 (m)")
    
    start_chainage: float = Field(..., description="分区起点里程 (m)")
    end_chainage: float = Field(..., description="分区终点里程 (m)")

    concrete_grade: Literal["C15", "C20", "C25", "C30", "C35", "C40", "C45", "C50"] = Field(..., description="混凝土等级，例如'C30', 'C40'")
    rebar_type: Literal["HRB300","HRB400", "HRB500"] = Field(..., description="钢筋类型")
    Ag: float = Field(..., description="配筋面积 (m²)")
    

    
    D_spacing: float = Field(..., description="双洞中心间距 (m)") # 双洞模型新增参数，双洞中心间距，反算rg使用
    beta2: float = Field(1.0, description="设计涌水量折减系数")
    Pcrown_crit: float = Field(100.0, description="临界拱顶水压力 (kPa，低水位反算rg使用)")
    P_crit: float = Field(600.0, description="临界统一外水压力 (kPa，高水位反算rg使用)")
    I_long: float = Field(0.02, description="纵向排水管水力坡降")
    double_side: bool = Field(..., description="是否双侧排水")

    # --- 默认高级参数 (14个，直接写死保底值) ---
    as_mm: float = Field(50.0, description="钢筋保护层厚度 (mm)")
    gamma: float = Field(10.0, description="水的重度 (kN/m³)")
    n_long: float = Field(0.012, description="纵向排水管曼宁粗糙度")
    n_ring: float = Field(0.012, description="环向排水盲管曼宁粗糙度")
    I_ring: float = Field(0.73, description="环向排水盲管水力坡降")
    n_lat: float = Field(0.012, description="横向排水管曼宁粗糙度")
    I_lat: float = Field(0.01, description="横向排水管水力坡降")
    S_code_max: float = Field(10.0, description="规范最大允许盲管间距 (m)")
    S_min: float = Field(5.0, description="工程实际最小允许间距 (m，双洞默认略大)")
    d_ring_default: float = Field(0.050, description="环向管默认内径 (m)")
    d_long_default: float = Field(0.100, description="纵向管默认内径 (m)")
    d_lat_default: float = Field(0.080, description="横向管默认内径 (m)")
    tol_safety_factor: float = Field(2.0, description="容许安全系数")
    aspect_ratio: float = Field(0.7, description="隧道高宽比 (h/w)")