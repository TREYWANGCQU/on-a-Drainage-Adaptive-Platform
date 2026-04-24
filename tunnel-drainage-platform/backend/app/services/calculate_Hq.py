def calculate_Hq(depth, width, grades):
    """
    计算隧道拱顶的竖向荷载计算高度 Hq。
    
    参数:
    depth (float): 隧道埋深（米）
    width (float): 隧道洞宽（米）
    grades (int): 围岩级别（1-6级，1为Ⅰ级，6为Ⅵ级）
    
    返回:
    float: 拱顶的竖向荷载计算高度 Hq（米）
    """
    # 检查输入参数有效性
    if not (1 <= grades <= 6):
        raise ValueError("围岩级别必须在1到6之间（1表示Ⅰ级，6表示Ⅵ级）")
    if width <= 0 or depth < 0:
        raise ValueError("洞宽必须为正数，埋深必须为非负数")
    
    # 深埋：根据围岩级别计算 Hq
    # 公式：Hq = 0.45 * 2^((6 - grades)/6) * width
    Hq = 0.45 * (2 ** ((6 - grades) / 6)) * width

    # 判断浅埋或深埋 未使用2.5为分界
    if depth <= Hq:
        # 浅埋：Hq 等于实际埋深
        Hq = depth
      
    
    return Hq
