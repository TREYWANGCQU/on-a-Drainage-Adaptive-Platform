# backend/app/models/schemas.py
from pydantic import BaseModel, Field, ConfigDict, AliasChoices
from typing import Literal, Optional

# ==========================================
# 核心数据模型定义 (Schemas)
# 根据架构设计文档，区分单洞和双洞模型的入参结构，支持 extra 属性向上兼容。
# ==========================================

class SingleTubeSchema(BaseModel):
    """
    单洞隧道计算入参
    """
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    # --- 标识参数 ---
    tunnel_type: Literal["single"] = Field(..., description="隧道类型：单洞")

    # --- 核心水力与结构参数 (使用标准 Key，AliasChoices 兼容解析旧别名) ---
    k_r: float = Field(..., validation_alias=AliasChoices('k_r', 'K'), description="围岩渗透系数 (m/d)")
    H: float = Field(..., validation_alias=AliasChoices('H', 'h'), description="初始地下水头 (m)")
    p_mm: float = Field(..., description="年降雨量 (mm)")
    k_g: float = Field(..., validation_alias=AliasChoices('k_g', 'Kg'), description="注浆圈渗透系数 (m/d)")
    k_p: float = Field(..., validation_alias=AliasChoices('k_p', 'K1'), description="初支渗透系数 (m/d)")
    k_s: float = Field(..., validation_alias=AliasChoices('k_s', 'K2'), description="二衬渗透系数 (m/d)")
    
    cn_condition: Literal["灌溉良好", "灌溉较差"] = Field(..., description="灌溉条件 (SCS-CN查表)")
    land_use: Literal["工业用地", "商业用地", "居住地", "农业用地", "牧草地", "林地"] = Field(..., description="用地类型 (SCS-CN查表)")
    grades: int = Field(..., description="围岩级别 (1-6级)")

    r_0: float = Field(..., validation_alias=AliasChoices('r_0', 'r'), description="二衬内半径 (m)")
    aspect_ratio: float = Field(0.7, description="隧道高宽比 (h/w)，仅3D建模使用")
    r_s: float = Field(..., validation_alias=AliasChoices('r_s', 'r1'), description="二衬外半径 (m)")
    r_p: float = Field(..., validation_alias=AliasChoices('r_p', 'r2'), description="初支外半径 (m)")
    r_g: float = Field(..., validation_alias=AliasChoices('r_g', 'rg'), description="注浆圈外半径 (m)")
    h_1: float = Field(130.0, validation_alias=AliasChoices('h_1', 'c', 'depth', 'ha'), description="隧道中心埋深 (m)")
    
    start_chainage: float = Field(..., description="分区起点里程 (m)")
    end_chainage: float = Field(..., description="分区终点里程 (m)")
    concrete_grade: Literal["C15", "C20", "C25", "C30", "C35", "C40", "C45", "C50"] = Field(..., description="混凝土等级")
    Ag: float = Field(..., description="配筋面积 (mm² 或 m²)")

    I_long: float = Field(0.02, description="纵向排水管水力坡降")
    
    # --- 默认高级参数 ---
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


class DoubleTubeSchema(BaseModel):
    """
    双洞隧道计算入参
    """
    model_config = ConfigDict(extra="ignore", populate_by_name=True)

    # --- 标识参数 ---
    tunnel_type: Literal["double"] = Field(..., description="隧道类型：双洞")

    # --- 核心水力与结构参数 (使用标准 Key，AliasChoices 兼容解析旧别名) ---
    k_r: float = Field(..., validation_alias=AliasChoices('k_r', 'K'), description="围岩渗透系数 (m/d)")
    H: float = Field(..., validation_alias=AliasChoices('H', 'h'), description="初始地下水头 (m)")
    p_mm: float = Field(..., description="年降雨量 (mm)")
    k_g: float = Field(..., validation_alias=AliasChoices('k_g', 'Kg'), description="注浆圈渗透系数 (m/d)")
    k_p: float = Field(..., validation_alias=AliasChoices('k_p', 'K1'), description="初支渗透系数 (m/d)")
    k_s: float = Field(..., validation_alias=AliasChoices('k_s', 'K2'), description="二衬渗透系数 (m/d)")
    
    cn_condition: Literal["灌溉良好", "灌溉较差"] = Field(..., description="灌溉条件 (SCS-CN查表)")
    land_use: Literal["工业用地", "商业用地", "居住地", "农业用地", "牧草地", "林地"] = Field(..., description="用地类型 (SCS-CN查表)")
    grades: int = Field(..., description="围岩级别 (1-6级)")

    r_0: float = Field(..., validation_alias=AliasChoices('r_0', 'r'), description="二衬内半径 (m)")
    aspect_ratio: float = Field(0.7, description="隧道高宽比 (h/w)，仅3D建模使用")
    r_s: float = Field(..., validation_alias=AliasChoices('r_s', 'r1'), description="二衬外半径 (m)")
    r_p: float = Field(..., validation_alias=AliasChoices('r_p', 'r2'), description="初支外半径 (m)")
    r_g: float = Field(..., validation_alias=AliasChoices('r_g', 'rg'), description="注浆圈外半径 (m)")
    h_1: float = Field(130.0, validation_alias=AliasChoices('h_1', 'c', 'depth', 'ha'), description="隧道中心埋深 (m)")
    
    start_chainage: float = Field(..., description="分区起点里程 (m)")
    end_chainage: float = Field(..., description="分区终点里程 (m)")
    concrete_grade: Literal["C15", "C20", "C25", "C30", "C35", "C40", "C45", "C50"] = Field(..., description="混凝土等级")
    Ag: float = Field(..., description="配筋面积 (mm² 或 m²)")
    D_spacing: float = Field(40.0, description="双洞中心间距 (m)")

    I_long: float = Field(0.02, description="纵向排水管水力坡降")
    
    # --- 默认高级参数 ---
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

    

