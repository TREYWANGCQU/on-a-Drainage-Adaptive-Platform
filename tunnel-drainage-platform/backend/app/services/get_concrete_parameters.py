def get_concrete_parameters(Cc):
    """
    根据混凝土强度等级获取物理力学参数。
    
    参数:
    Cc : int 或 str
        混凝土等级，例如 30, 40, 50 或 'C30', 'C40'。
        
    返回:
    tuple : (Ec, vc, mc)
        Ec  : 弹性模量
        vc  : 泊松比 (无量纲)
        mc  : 密度 (kg/m³，钢筋混凝土标准重度)
    """
    
    # --- 1. 输入标准化处理 ---
    if isinstance(Cc, str):
        # 去除 'C' 或 'c' 前缀
        grade_str = Cc.upper().replace('C', '')
        try:
            grade_val = int(grade_str)
        except ValueError:
            raise ValueError(f"输入的混凝土等级 '{Cc}' 格式错误，请输入如 30 或 'C30'")
    else:
        grade_val = int(Cc)

    # --- 2. 弹性模量数据库 (GB 50010-2010 表 4.1.5) ---
    # 规范中弹性模量单位为 10^4 MPa = GPa
    # 这里转换为 MPa 以便计算
    Ec_map = {
        15: 2.20e4,  # C15
        20: 2.55e4,  # C20
        25: 2.80e4,  # C25
        30: 3.00e4,  # C30
        35: 3.15e4,  # C35
        40: 3.25e4,  # C40
        45: 3.35e4,  # C45
        50: 3.45e4,  # C50
        55: 3.55e4,  # C55
        60: 3.60e4,  # C60
        65: 3.65e4,  # C65
        70: 3.70e4,  # C70
        75: 3.75e4,  # C75
        80: 3.80e4   # C80
    }
    
    if grade_val not in Ec_map:
        raise ValueError(f"不支持的混凝土等级: C{grade_val} (支持范围 C15~C80)")
    
    Ec = Ec_map[grade_val]  # MPa
    
    # --- 3. 泊松比 (GB 50010-2010 第4.1.8条) ---
    # 混凝土泊松比一般取 0.2
    vc = 0.2
    
    # --- 4. 密度 (GB 50010-2010 第4.1.7条及工程习惯) ---
    # 素混凝土约为 2300~2400 kg/m³
    # 隧道衬砌为钢筋混凝土，重度标准值为 25 kN/m³
    mc = 2500  # kg/m³
    
    return Ec*1e6, vc, mc

# --- 测试示例 ---
if __name__ == "__main__":
    # 测试整数输入
    print("--- 测试输入: 40 ---")
    Ec, vc, mc = get_concrete_parameters(40)
    print(f"弹性模量 Ec = {Ec} MPa")
    print(f"泊松比 vc   = {vc}")
    print(f"密度 mc     = {mc} kg/m³")
    
    # 测试字符串输入
    print("\n--- 测试输入: 'C50' ---")
    Ec, vc, mc = get_concrete_parameters('C50')
    print(f"弹性模量 Ec = {Ec} MPa")
    print(f"密度 mc     = {mc} kg/m³")
