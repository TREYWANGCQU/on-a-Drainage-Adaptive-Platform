def get_rock_parameters(grade):
    """
    根据围岩级别获取典型物理力学参数。
    
    参数:
    grade : int 或 str
        围岩级别，输入范围 1-6 或 'I'-'VI'。
        
    返回:
    dict : 包含围岩参数的字典
        Es   : 弹性模量
        vs   : 泊松比 (无量纲)
        ms   : 密度 (kg/m³)
        Ks   : 地基系数/抗力系数
        phis : 内摩擦角 (度)
        cs   : 粘聚力
        lams : 侧压力系数 (无量纲)
    """
    
    # --- 1. 输入标准化处理 ---
    # 将罗马数字字符串转换为整数
    roman_map = {'I': 1, 'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6, 'i': 1, 'ii': 2, 'iii': 3, 'iv': 4, 'v': 5, 'vi': 6}
    
    if isinstance(grade, str):
        grade_val = roman_map.get(grade.upper())
        if grade_val is None:
            raise ValueError(f"输入的围岩级别 '{grade}' 无效，请输入 1-6 或 'I'-'VI'")
    else:
        grade_val = int(grade)

    if grade_val < 1 or grade_val > 6:
        raise ValueError("围岩级别必须在 1-6 之间")

    # --- 2. 参数数据库 (取规范推荐范围的中值或典型值) ---
    # 数据来源参考：公路/铁路隧道设计规范
    # 格式: [Es(GPa), vs, ms(kg/m³), Ks(MPa/m), phis(°), cs(MPa), lams]
    
    # 注：
    # 1. Es 为变形模量。
    # 2. Ks 为弹性抗力系数，这里取值参考了常见设计手册的单宽值。
    # 3. lams 为侧压力系数，通常根据经验公式 λ = 1-sin(φ) 或规范建议范围取值。
    
    rock_data = {
        1: [40.0, 0.15, 2700, 2500, 65, 4.0, 0.10],  # I级：极硬岩，完整
        2: [25.0, 0.20, 2600, 1500, 55, 2.5, 0.15],  # II级：硬岩，较完整
        3: [12.0, 0.25, 2400, 850,  45, 1.2, 0.25],  # III级：较硬岩，较破碎
        4: [4.0,  0.32, 2200, 400,  33, 0.4, 0.40],  # IV级：较软岩，破碎
        5: [1.5,  0.40, 2000, 180,  23, 0.12, 0.60], # V级：软岩，极破碎
        6: [0.5,  0.45, 1700, 60,   18, 0.03, 0.85]  # VI级：极软岩/土，松散
    }
    
    # --- 3. 提取数据 ---
    data = rock_data[grade_val]
    
    params = {
        'grade_desc': f"{grade_val}级围岩", # 描述
        'Es':   data[0] * 1000*1e6,            # 弹性模量 -> MPa
        'vs':   data[1],                   # 泊松比
        'ms':   data[2],                   # 密度 -> kg/m³
        'Ks':   data[3],                   # 地基系数 -> MPa/m
        'phis': data[4],                   # 内摩擦角 -> 度
        'cs':   data[5] * 1000,            # 粘聚力 -> kPa
        'lams': data[6]                    # 侧压力系数
    }
    
    return params

# --- 测试示例 ---
if __name__ == "__main__":
    # 测试整数输入
    print("--- 测试输入: 3 ---")
    p3 = get_rock_parameters(3)
    for k, v in p3.items():
        print(f"{k}: {v}")

    print("\n--- 测试输入: 'V' ---")
    p5 = get_rock_parameters('V')
    # 格式化打印
    print(f"围岩级别: {p5['grade_desc']}")
    print(f"弹性模量: {p5['Es']} MPa")
    print(f"泊松比: {p5['vs']}")
    print(f"密度: {p5['ms']} kg/m³")
    print(f"地基系数: {p5['Ks']} MPa/m")
    print(f"内摩擦角: {p5['phis']} 度")
    print(f"粘聚力: {p5['cs']} kPa")
    print(f"侧压力系数: {p5['lams']}")
