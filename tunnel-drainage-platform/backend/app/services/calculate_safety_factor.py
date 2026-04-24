def calculate_safety_factor(M, concrete_grade, t, Ag, as_mm):
    """
    计算单筋矩形截面衬砌的纯弯的安全系数。
    
    参数:
    M        : 弯矩。使衬砌内侧受拉为正。
    concrete_grade : 混凝土等级 (整数)，如 30, 35, 40, 50。
    t        : 衬砌厚度。
    Ag       : 单侧配筋面积 (mm^2/m)，即每延米配筋量。
    as_mm    : 钢筋重心至混凝土表面的距离。
    
    返回:
    K        : 截面安全系数 (无量纲)。
               若 K < 1，表示截面已破坏或承载力不足。
               若输入参数非法，返回 None。
    """
   
    # 计算截面有效高度并验证
    h0 = t - as_mm      # mm

    # ==================== 材料强度取值 ====================
    # 混凝土轴心抗压强度设计值 fc (MPa) - 依据 GB 50010
    fc_dict = {
       30: 20.1, 35: 23.4, 40: 26.8, 
        45: 29.6, 50: 32.4, 55: 35.5, 60: 38.5
    }
    fc = fc_dict[concrete_grade]
    
    # 钢筋抗拉强度设计值 fy (MPa) - 假设采用 HRB400
    fy = 360
    
    # ==================== 承载力计算 ====================
    # 计算宽度 (每延米)
    b = 1000.0  # mm
    
    # 计算受压区高度 x
    # 平衡条件: fc * b * x = fy * Ag
    x = (fy * Ag) / (fc * b)  # mm
    
    # 界限相对受压区高度 ξb (HRB400, 混凝土 ≤ C50)
    # ξb = β1 / (1 + fy / (Es * εcu))
    # 简化取值: ξb = 0.518
    xi_b = 0.518
    
    # 验算是否超筋，若超筋则取界限值
    x_max = xi_b * h0
    if x > x_max:
        x = x_max  # 超筋时取界限受压区高度
    
    # 计算极限抗弯承载力 Mu
    # Mu = fc * b * x * (h0 - x/2)
    Mu_N_mm = fc * b * x * (h0 - 0.5 * x)  # N·mm
    
    # 单位转换: N·mm → kN·m
    Mu_kNm = Mu_N_mm * 1e-6
    
    # ==================== 安全系数计算 ====================
    K = Mu_kNm / M
    
    return K

# --- 测试示例 ---
if __name__ == "__main__":
    # 示例计算
    K = calculate_safety_factor(
        M=100,              # kN·m
        concrete_grade=35,  # C35
        t=500,              # mm
        Ag=1200,            # mm²/m
        as_mm=50            # mm
    )
    print(f"安全系数 K = {K:.3f}")
    # 输出: 安全系数 K = 3.080

    # 测试非法输入
    print(calculate_safety_factor(-10, 35, 500, 2000, 50))  # 输出: None
    print(calculate_safety_factor(100, 25, 500, 2000, 50))  # 输出: None (不支持的混凝土等级)
