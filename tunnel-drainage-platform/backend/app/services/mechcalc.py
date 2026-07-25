import numpy as np
from dataclasses import dataclass


def analyze_tunnel_lining_full(width: float, height: float, t: float, Ec: float, 
                               p: float, lam: float, prw: float, Ks: float):
    # ================= 1. 建立几何模型与节点 =================
    N_nodes = 100
    theta = np.linspace(np.pi/2, np.pi/2 + 2*np.pi, N_nodes, endpoint=False)
    
    R_top = width / 2.0
    H_bottom = height - R_top # 起拱线高度
    
    x = np.zeros(N_nodes)
    y = np.zeros(N_nodes)
    
    for i, th in enumerate(theta):
        th_norm = th % (2*np.pi)
        if 0 <= th_norm <= np.pi:
            x[i] = R_top * np.cos(th_norm)
            y[i] = H_bottom + R_top * np.sin(th_norm)
        else:
            x[i] = R_top * np.cos(th_norm)
            y[i] = H_bottom * (1 + np.sin(th_norm)) 

    # ================= 2. 准备有限元矩阵 =================
    A = t * 1.0
    I = (1.0 * t**3) / 12.0
    Total_DOF = 3 * N_nodes
    K_beam = np.zeros((Total_DOF, Total_DOF))
    
    F_earth = np.zeros(Total_DOF)
    F_water = np.zeros(Total_DOF)
    
    nx_node = np.zeros(N_nodes)
    ny_node = np.zeros(N_nodes)
    L_trib = np.zeros(N_nodes)
    
    iS_arc = np.zeros(N_nodes)
    
    def get_k_local(L):
        k = np.zeros((6, 6))
        EA_L = Ec * A / L
        EI_L = Ec * I / L
        k[0, 0] = k[3, 3] = EA_L
        k[0, 3] = k[3, 0] = -EA_L
        k[1, 1] = k[4, 4] = 12 * EI_L / L**2
        k[1, 4] = k[4, 1] = -12 * EI_L / L**2
        k[2, 2] = k[5, 5] = 4 * EI_L
        k[2, 5] = k[5, 2] = 2 * EI_L
        k[1, 2] = k[2, 1] = k[1, 5] = k[5, 1] = 6 * EI_L / L
        k[4, 2] = k[2, 4] = k[4, 5] = k[5, 4] = -6 * EI_L / L
        return k

    # ================= 3. 组装整体刚度矩阵与外荷载 =================
    for i in range(N_nodes):
        n1 = i
        n2 = (i + 1) % N_nodes
        dx = x[n2] - x[n1]
        dy = y[n2] - y[n1]
        L = np.hypot(dx, dy)
        
        c, s = dx / L, dy / L
        T = np.array([
            [ c,  s,  0,  0,  0,  0],
            [-s,  c,  0,  0,  0,  0],
            [ 0,  0,  1,  0,  0,  0],
            [ 0,  0,  0,  c,  s,  0],
            [ 0,  0,  0, -s,  c,  0],
            [ 0,  0,  0,  0,  0,  1]
        ])
        
        k_glob = T.T @ get_k_local(L) @ T
        idx = [3*n1, 3*n1+1, 3*n1+2, 3*n2, 3*n2+1, 3*n2+2]
        for row in range(6):
            for col in range(6):
                K_beam[idx[row], idx[col]] += k_glob[row, col]
                
        nx_elem, ny_elem = dy / L, -dx / L
        
        nx_node[n1] += nx_elem * (L / 2)
        ny_node[n1] += ny_elem * (L / 2)
        nx_node[n2] += nx_elem * (L / 2)
        ny_node[n2] += ny_elem * (L / 2)
        L_trib[n1] += L / 2
        L_trib[n2] += L / 2
        
        # 计算单元的中心高度
        y_center = (y[n1] + y[n2]) / 2.0
        
        # 【修改核心】：竖向土压力仅作用在起拱线 (H_bottom) 以上的部分
        if y_center >= H_bottom - 1e-5: 
            F_v = -p * abs(dx)
            F_earth[3*n1+1] += F_v / 2
            F_earth[3*n2+1] += F_v / 2
            iS_arc[i]=1
            
        # 侧向土压力依然作用于全高
        pii=p+10e3*(height-y_center)  #按一般的浮容重考虑地层容重为10e3kn/m3
        
        sign_x = 1 if (x[n1]+x[n2])/2 > 0 else -1
        F_h = -lam * pii * abs(dy) * sign_x
        F_earth[3*n1] += F_h / 2
        F_earth[3*n2] += F_h / 2
        
        # 水压力作用于全断面外法线向内
        prwi=prw+10e3*(height-y_center)
        # prwi=prw
        F_water[3*n1]   += (-prwi * L * nx_elem) / 2
        F_water[3*n1+1] += (-prwi * L * ny_elem) / 2
        F_water[3*n2]   += (-prwi * L * nx_elem) / 2
        F_water[3*n2+1] += (-prwi * L * ny_elem) / 2

    F_load = F_earth + F_water

    for i in range(N_nodes):
        norm = np.hypot(nx_node[i], ny_node[i])
        if norm > 0:
            nx_node[i] /= norm
            ny_node[i] /= norm

    # ================= 4. 定义地层弹簧与求解器 =================
    def build_spring_matrix(active_nodes):
        K_spring = np.zeros_like(K_beam)
        for i in range(N_nodes):
            if active_nodes[i]:
                ks_val = Ks * L_trib[i]
                nx, ny = nx_node[i], ny_node[i]
                K_spring[3*i, 3*i]     += ks_val * nx**2
                K_spring[3*i, 3*i+1]   += ks_val * nx * ny
                K_spring[3*i+1, 3*i]   += ks_val * nx * ny
                K_spring[3*i+1, 3*i+1] += ks_val * ny**2
        return K_spring

    top_node = 0
    bottom_node = N_nodes // 2

    def solve_system(K_total, F_total):
        K_mod = K_total.copy()
        F_mod = F_total.copy()
        for dof in [3*top_node, 3*bottom_node]:
            K_mod[dof, :] = 0
            K_mod[:, dof] = 0
            K_mod[dof, dof] = 1.0
            F_mod[dof] = 0.0
        return np.linalg.solve(K_mod, F_mod)

    # ================= 5. 迭代求解 (去除非受压弹簧) =================
    active_springs = np.ones(N_nodes, dtype=bool) 
    
    K_sys = K_beam + build_spring_matrix(active_springs)
    U1 = solve_system(K_sys, F_load)
    
    for i in range(N_nodes):
        un = U1[3*i]*nx_node[i] + U1[3*i+1]*ny_node[i]
        if un < 0 and iS_arc[i]==1:  
            active_springs[i] = False
            
    K_sys_iter = K_beam + build_spring_matrix(active_springs)
    U_final = solve_system(K_sys_iter, F_load)

    # ================= 6. 提取所有结果 =================
    N_elem = np.zeros(N_nodes)
    M_elem = np.zeros(N_nodes)
    
    for i in range(N_nodes):
        n1 = i
        n2 = (i + 1) % N_nodes
        dx = x[n2] - x[n1]
        dy = y[n2] - y[n1]
        L = np.hypot(dx, dy)
        c, s = dx / L, dy / L
        T = np.array([
            [ c,  s,  0,  0,  0,  0],
            [-s,  c,  0,  0,  0,  0],
            [ 0,  0,  1,  0,  0,  0],
            [ 0,  0,  0,  c,  s,  0],
            [ 0,  0,  0, -s,  c,  0],
            [ 0,  0,  0,  0,  0,  1]
        ])
        u_elem = np.array([U_final[3*n1], U_final[3*n1+1], U_final[3*n1+2], 
                           U_final[3*n2], U_final[3*n2+1], U_final[3*n2+2]])
        f_loc = get_k_local(L) @ T @ u_elem
        N_elem[i] = -f_loc[0]  
        M_elem[i] = f_loc[2]   

    F_spring_x = np.zeros(N_nodes)
    F_spring_y = np.zeros(N_nodes)
    for i in range(N_nodes):
        if active_springs[i]:
            ks_val = Ks * L_trib[i]
            un = U_final[3*i]*nx_node[i] + U_final[3*i+1]*ny_node[i]
            F_spring_x[i] = -ks_val * un * nx_node[i]
            F_spring_y[i] = -ks_val * un * ny_node[i]

    R_total = K_sys_iter @ U_final - F_load
    R_top_x = R_total[3*top_node]
    R_bottom_x = R_total[3*bottom_node]


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

#######################################################################################
#######################################################################################

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

#######################################################################################
#######################################################################################

def get_safety_factor(
    N,
    M,
    concrete_grade=40,
    rebar_type="HRB400",
    t=0.5,
    Ag=2000.0,
    as_mm=50.0,
    return_detail=False,
):
    """
    按 JTG 3370.1-2018 附录 N 计算矩形截面安全系数。

    这是一个可独立复制的函数，材料表和辅助函数均包含在函数内部。

    参数：
        N: 轴力，kN；受压为正，受拉为负
        M: 弯矩，kN·m（函数内部按绝对值计算）
        concrete_grade: 混凝土标号，如 40、"40" 或 "C40"
        rebar_type: 钢筋类型，如 "HRB400"
        t: 截面厚度，m
        Ag: 单侧钢筋面积，mm²/m；按双层对称配筋处理
        as_mm: 钢筋重心到截面边缘的距离，mm
        return_detail: False 时只返回 K；True 时返回详细结果字典

    返回：
        float，或在 return_detail=True 时返回 dict

    说明：
        当前实现支持纯受弯（N≈0）和偏心受压（N>0），
        尚不支持偏心受拉（N<0）。
    """
    import math

    concrete_table = {
        "C15": {"Ra": 12.0, "Rw": 15.0, "Rl": 1.4},
        "C20": {"Ra": 15.5, "Rw": 19.4, "Rl": 1.7},
        "C25": {"Ra": 19.0, "Rw": 23.6, "Rl": 2.0},
        "C30": {"Ra": 22.5, "Rw": 28.1, "Rl": 2.2},
        "C35": {"Ra": 26.3, "Rw": 32.9, "Rl": 2.5},
        "C40": {"Ra": 29.5, "Rw": 36.9, "Rl": 2.7},
        "C45": {"Ra": 33.6, "Rw": 42.0, "Rl": 2.9},
        "C50": {"Ra": 36.5, "Rw": 45.6, "Rl": 3.1},
    }
    rebar_table = {
        "HPB300": {"fyk": 300.0, "fstk": 420.0, "Rg": 300.0},
        "HRB400": {"fyk": 400.0, "fstk": 540.0, "Rg": 400.0},
        "HRB500": {"fyk": 500.0, "fstk": 630.0, "Rg": 500.0},
    }

    def normalize_concrete_grade(value):
        if isinstance(value, (int, float)) and float(value).is_integer():
            value = f"C{int(value)}"
        else:
            value = str(value).strip().upper()
            if not value.startswith("C"):
                value = f"C{value}"
        if value not in concrete_table:
            raise ValueError(f"不支持的混凝土标号: {value}")
        return value

    def normalize_rebar_type(value):
        value = str(value).strip().upper()
        if value not in rebar_table:
            raise ValueError(f"不支持的钢筋类型: {value}")
        return value

    def positive_root(A, B, C):
        """解 A*x²+B*x+C=0，返回较小的正根。"""
        if abs(A) < 1e-14:
            if abs(B) < 1e-14:
                raise ValueError("方程退化，无有效解。")
            x = -C / B
            if x > 0:
                return x
            raise ValueError("方程无正根。")

        discriminant = B * B - 4.0 * A * C
        if discriminant < 0:
            raise ValueError("判别式小于 0，无实根。")

        sqrt_d = math.sqrt(discriminant)
        roots = (
            (-B + sqrt_d) / (2.0 * A),
            (-B - sqrt_d) / (2.0 * A),
        )
        positive_roots = [root for root in roots if root > 0]
        if not positive_roots:
            raise ValueError("方程无正根。")
        return min(positive_roots)

    def prepare_inputs():
        grade = normalize_concrete_grade(concrete_grade)
        steel_type = normalize_rebar_type(rebar_type)
        concrete = concrete_table[grade]
        rebar = rebar_table[steel_type]

        h = float(t) * 1000.0
        steel_area = float(Ag)
        edge_distance = float(as_mm)
        if h <= 0:
            raise ValueError("截面厚度 t 必须大于 0。")
        if steel_area < 0:
            raise ValueError("钢筋面积 Ag 不能小于 0。")
        if not 0 <= edge_distance < h:
            raise ValueError("as_mm 必须满足 0 <= as_mm < t*1000。")

        material = {
            "concrete_grade": grade,
            "rebar_type": steel_type,
            **concrete,
            **rebar,
        }
        return {
            "b": 1000.0,
            "h": h,
            "Ag": steel_area,
            "Agp": steel_area,
            "a": edge_distance,
            "ap": edge_distance,
            "Rw": concrete["Rw"],
            "Rg": rebar["Rg"],
            "N": float(N) * 1e3,
            "M": abs(float(M)) * 1e6,
            "h0": h - edge_distance,
            "h0p": h - edge_distance,
            "material": material,
        }

    def pure_bending_detail():
        d = prepare_inputs()
        b, h0 = d["b"], d["h0"]
        steel_area, compression_steel_area = d["Ag"], d["Agp"]
        ap, Rw, Rg, moment = d["ap"], d["Rw"], d["Rg"], d["M"]

        if moment <= 0:
            return {
                "mode": "受弯",
                "K": float("inf"),
                "x_mm": 0.0,
                "Mu_kNm": 0.0,
                "material": d["material"],
            }

        x_try = Rg * (steel_area - compression_steel_area) / (Rw * b)
        if 2.0 * ap <= x_try <= 0.55 * h0:
            Mu = (
                Rw * b * x_try * (h0 - x_try / 2.0)
                + Rg * compression_steel_area * (h0 - ap)
            )
            return {
                "mode": "受弯-考虑受压钢筋",
                "K": Mu / moment,
                "x_mm": x_try,
                "Mu_kNm": Mu / 1e6,
                "material": d["material"],
            }

        x = Rg * steel_area / (Rw * b)
        if x <= 0.55 * h0:
            Mu = Rw * b * x * (h0 - x / 2.0)
            mode = "受弯-不考虑受压钢筋"
        else:
            x = 0.55 * h0
            Mu = 0.5 * Rw * b * h0 * h0
            mode = "受弯-按 x=0.55h0 控制"

        return {
            "mode": mode,
            "K": Mu / moment,
            "x_mm": x,
            "Mu_kNm": Mu / 1e6,
            "material": d["material"],
        }

    def large_eccentric_without_compression_steel():
        d = prepare_inputs()
        b, h, h0, a = d["b"], d["h"], d["h0"], d["a"]
        steel_area, Rw, Rg = d["Ag"], d["Rw"], d["Rg"]
        axial_force, moment = d["N"], d["M"]

        if axial_force <= 0:
            raise ValueError("该分支仅适用于 N > 0 的受压情况。")

        e0 = moment / axial_force
        e = e0 + h / 2.0 - a
        x = positive_root(
            0.5 * Rw * b,
            Rw * b * (e - h0),
            -Rg * steel_area * e,
        )
        if x <= 0.55 * h0:
            Mu = Rw * b * x * (h0 - x / 2.0)
        else:
            Mu = 0.5 * Rw * b * h0 * h0
        return Mu / (axial_force * e), x

    def eccentric_compression_detail():
        d = prepare_inputs()
        b, h = d["b"], d["h"]
        h0, h0p = d["h0"], d["h0p"]
        steel_area, compression_steel_area = d["Ag"], d["Agp"]
        a, ap, Rw, Rg = d["a"], d["ap"], d["Rw"], d["Rg"]
        axial_force, moment = d["N"], d["M"]

        if axial_force <= 0:
            raise ValueError("该分支仅适用于 N > 0 的偏心受压构件。")

        e0 = moment / axial_force
        e = e0 + h / 2.0 - a
        ep = e0 - h / 2.0 + ap
        x = positive_root(
            0.5 * Rw * b,
            Rw * b * (e - h0),
            -Rg * (steel_area * e + compression_steel_area * ep),
        )

        if x <= 0.55 * h0:
            if x >= 2.0 * ap:
                Rn = Rw * b * x + Rg * (compression_steel_area - steel_area)
                Rm = (
                    Rw * b * x * (h0 - x / 2.0)
                    + Rg * compression_steel_area * (h0 - ap)
                )
                K1 = Rn / axial_force
                K2 = Rm / (axial_force * e)
                return {
                    "mode": "大偏心受压-考虑受压钢筋",
                    "K": min(K1, K2),
                    "K_from_N": K1,
                    "K_from_M": K2,
                    "x_mm": x,
                    "e_mm": e,
                    "ep_mm": ep,
                    "material": d["material"],
                }

            K_no, x_no = large_eccentric_without_compression_steel()
            if abs(ep) < 1e-12:
                return {
                    "mode": "大偏心受压-x<2a'，忽略受压钢筋",
                    "K": K_no,
                    "K_without_comp": K_no,
                    "x_mm": x,
                    "x_no_comp_mm": x_no,
                    "e_mm": e,
                    "ep_mm": ep,
                    "material": d["material"],
                }

            K_comp = (
                Rg * compression_steel_area * (h0 - ap)
                / (axial_force * abs(ep))
            )
            return {
                "mode": "大偏心受压-x<2a'，按规范比较是否计入受压钢筋",
                "K": max(K_comp, K_no),
                "K_with_comp_by_N0_8_4": K_comp,
                "K_without_comp": K_no,
                "x_mm": x,
                "x_no_comp_mm": x_no,
                "e_mm": e,
                "ep_mm": ep,
                "material": d["material"],
            }

        R1 = 0.5 * Rw * b * h0 * h0 + Rg * compression_steel_area * (h0 - ap)
        K1 = R1 / (axial_force * e)
        if ep > 0:
            R2 = 0.5 * Rw * b * h0p * h0p + Rg * steel_area * (h0p - a)
            K2 = R2 / (axial_force * ep)
            K = min(K1, K2)
        else:
            K2 = None
            K = K1
        return {
            "mode": "小偏心受压",
            "K": K,
            "K_from_N0_9_1": K1,
            "K_from_N0_9_2": K2,
            "x_mm": x,
            "e_mm": e,
            "ep_mm": ep,
            "material": d["material"],
        }

    axial_force_kn = float(N)
    if abs(axial_force_kn) <= 1e-9:
        result = pure_bending_detail()
    elif axial_force_kn > 0:
        result = eccentric_compression_detail()
    else:
        raise ValueError("当前版本仅实现受弯和偏心受压，未实现偏心受拉。")

    return result if return_detail else result["K"]

#######################################################################################
#######################################################################################

def tunnel_force_plt(res):
    import matplotlib.pyplot as plt
    plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei', 'Arial Unicode MS']
    plt.rcParams['axes.unicode_minus'] = False 

    x, y = res['x'], res['y']
    x_plot = np.append(x, x[0]) 
    y_plot = np.append(y, y[0])
    N_nodes = len(x)

    fig, axs = plt.subplots(1, 3, figsize=(18, 6))

    # ================= 图1：模型、荷载与约束 =================
    ax1 = axs[0]
    ax1.plot(x_plot, y_plot, 'k-', linewidth=2, label="衬砌中心线")
    ax1.scatter(x, y, c='black', s=10, zorder=5) 
    
    tn, bn = res['top_node'], res['bottom_node']
    ax1.plot(x[tn], y[tn], 'bs', markersize=8, label="水平向约束 (滑动铰)")
    ax1.plot(x[bn], y[bn], 'bs', markersize=8)
    
    # 缩小了土压力的箭头比例 (scale调大) 避免互相遮挡，视觉更清爽
    ax1.quiver(x, y, res['F_earth_x'], res['F_earth_y'], color='blue', alpha=0.6, 
               scale=1.5e6, width=0.01, label="土压力荷载")
    ax1.quiver(x, y, res['F_water_x'], res['F_water_y'], color='cyan', alpha=0.8, 
               scale=1.5e6, width=0.01, label="水压力荷载")
               
    ax1.set_title("有限元模型")
    ax1.axis('equal')
    ax1.legend(loc='upper right', fontsize=9)
    ax1.grid(True, linestyle='--')

    # ================= 图2：轴力与弯矩图 =================
    ax2 = axs[1]
    ax2.plot(x_plot, y_plot, 'k-', linewidth=1.5, alpha=0.5) 
    
    scale_N = 1e-6  
    scale_M = 1e-6
    
    N_x = x + res['N_elem'] * res['nx'] * scale_N
    N_y = y + res['N_elem'] * res['ny'] * scale_N
    M_x = x + res['M_elem'] * res['nx'] * scale_M
    M_y = y + res['M_elem'] * res['ny'] * scale_M

    ax2.plot(np.append(N_x, N_x[0]), np.append(N_y, N_y[0]), 'r-', label="轴力 (N) - 拉正压负")
    for i in range(N_nodes): ax2.plot([x[i], N_x[i]], [y[i], N_y[i]], 'r-', alpha=0.3)
        
    ax2.plot(np.append(M_x, M_x[0]), np.append(M_y, M_y[0]), 'g-', label="弯矩 (M) - 外侧受拉为正")
    for i in range(N_nodes): ax2.plot([x[i], M_x[i]], [y[i], M_y[i]], 'g-', alpha=0.3)

    ax2.set_title("内力图：轴力与弯矩分布")
    ax2.axis('equal')
    ax2.legend(loc='upper right', fontsize=9)
    ax2.grid(True, linestyle='--')

    # ================= 图3：弹簧内力与边界反力 =================
    ax3 = axs[2]
    ax3.plot(x_plot, y_plot, 'k-', linewidth=2, label="衬砌中心线")
    
    has_spring = False
    for i in range(N_nodes):
        if res['active_springs'][i]:
            label = "受压地层弹簧反力" if not has_spring else ""
            ax3.quiver(x[i], y[i], res['F_spring_x'][i], res['F_spring_y'][i], 
                       color='orange', scale=2e6, width=0.005, label=label)
            ax3.scatter(x[i], y[i], c='orange', s=15, marker='s', zorder=4)
            has_spring = True
            
    ax3.quiver(x[bn], y[bn], res['R_bottom_x'], 0, color='red', scale=2e6, width=0.01, label="边界反力 (Rx)")
    ax3.quiver(x[tn], y[tn], res['R_top_x'], 0, color='red', scale=2e6, width=0.01)

    ax3.set_title("地层相互作用：弹簧状态与反力")
    ax3.axis('equal')
    ax3.legend(loc='upper right', fontsize=9)
    ax3.grid(True, linestyle='--')

    plt.tight_layout()
    plt.show()

#######################################################################################
#######################################################################################

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

#######################################################################################
#######################################################################################

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


#######################################################################################
#######################################################################################

@dataclass
class TunnelParamsMc:
    ww: float = 9.7              # 隧道宽 m
    hh: float = 8.6              # 隧道高 m
    tt: float = 0.5              # 衬砌厚度 m
    depth: float = 50            # 拱顶埋深 m
    grades: float = 4            # 围岩级别
    concrete_grade: float = 35   # 混凝土级别
    Ag: float = 2000             # 配筋面积 mm²
    as_mm: float =50             # 钢筋保护层厚度 mm
    tol_safety_factor: float = 2 # 容许安全系数

