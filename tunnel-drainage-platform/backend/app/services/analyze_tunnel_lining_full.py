import numpy as np
#import matplotlib.pyplot as plt

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

if __name__ == "__main__":

    print("正在计算隧道衬砌模型...")
    res = analyze_tunnel_lining_full(
        width=10.0, height=10.0, t=0.5, Ec=3e10, 
        p=200000, lam=0.5, prw=50000, Ks=5e7
    )

    #plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei', 'Arial Unicode MS']
    #plt.rcParams['axes.unicode_minus'] = False 

    # x, y = res['x'], res['y']
    # x_plot = np.append(x, x[0]) 
    # y_plot = np.append(y, y[0])
    # N_nodes = len(x)

    # #fig, axs = plt.subplots(1, 3, figsize=(18, 6))

    # # ================= 图1：模型、荷载与约束 =================
    # #ax1 = axs[0]
    # #ax1.plot(x_plot, y_plot, 'k-', linewidth=2, label="衬砌中心线")
    # #ax1.scatter(x, y, c='black', s=10, zorder=5) 
    
    # tn, bn = res['top_node'], res['bottom_node']
    # ax1.plot(x[tn], y[tn], 'bs', markersize=8, label="水平向约束 (滑动铰)")
    # ax1.plot(x[bn], y[bn], 'bs', markersize=8)
    
    # # 缩小了土压力的箭头比例 (scale调大) 避免互相遮挡，视觉更清爽
    # ax1.quiver(x, y, res['F_earth_x'], res['F_earth_y'], color='blue', alpha=0.6, 
    #            scale=1.5e6, width=0.01, label="土压力荷载")
    # ax1.quiver(x, y, res['F_water_x'], res['F_water_y'], color='cyan', alpha=0.8, 
    #            scale=1.5e6, width=0.01, label="水压力荷载")
               
    # ax1.set_title("有限元模型：去除仰拱竖向土压力")
    # ax1.axis('equal')
    # ax1.legend(loc='upper right', fontsize=9)
    # ax1.grid(True, linestyle='--')

    # # ================= 图2：轴力与弯矩图 =================
    # ax2 = axs[1]
    # ax2.plot(x_plot, y_plot, 'k-', linewidth=1.5, alpha=0.5) 
    
    # scale_N = 1e-6  
    # scale_M = 1e-6
    
    # N_x = x + res['N_elem'] * res['nx'] * scale_N
    # N_y = y + res['N_elem'] * res['ny'] * scale_N
    # M_x = x + res['M_elem'] * res['nx'] * scale_M
    # M_y = y + res['M_elem'] * res['ny'] * scale_M

    # ax2.plot(np.append(N_x, N_x[0]), np.append(N_y, N_y[0]), 'r-', label="轴力 (N) - 拉正压负")
    # for i in range(N_nodes): ax2.plot([x[i], N_x[i]], [y[i], N_y[i]], 'r-', alpha=0.3)
        
    # ax2.plot(np.append(M_x, M_x[0]), np.append(M_y, M_y[0]), 'g-', label="弯矩 (M) - 外侧受拉为正")
    # for i in range(N_nodes): ax2.plot([x[i], M_x[i]], [y[i], M_y[i]], 'g-', alpha=0.3)

    # ax2.set_title("内力图：轴力与弯矩分布")
    # ax2.axis('equal')
    # ax2.legend(loc='upper right', fontsize=9)
    # ax2.grid(True, linestyle='--')

    # # ================= 图3：弹簧内力与边界反力 =================
    # ax3 = axs[2]
    # ax3.plot(x_plot, y_plot, 'k-', linewidth=2, label="衬砌中心线")
    
    # has_spring = False
    # for i in range(N_nodes):
    #     if res['active_springs'][i]:
    #         label = "受压地层弹簧反力" if not has_spring else ""
    #         ax3.quiver(x[i], y[i], res['F_spring_x'][i], res['F_spring_y'][i], 
    #                    color='orange', scale=2e6, width=0.005, label=label)
    #         ax3.scatter(x[i], y[i], c='orange', s=15, marker='s', zorder=4)
    #         has_spring = True
            
    # ax3.quiver(x[bn], y[bn], res['R_bottom_x'], 0, color='red', scale=2e6, width=0.01, label="边界反力 (Rx)")
    # ax3.quiver(x[tn], y[tn], res['R_top_x'], 0, color='red', scale=2e6, width=0.01)

    # ax3.set_title("地层相互作用：弹簧状态与反力")
    # ax3.axis('equal')
    # ax3.legend(loc='upper right', fontsize=9)
    # ax3.grid(True, linestyle='--')

    # plt.tight_layout()
    # plt.show()
    # pass

