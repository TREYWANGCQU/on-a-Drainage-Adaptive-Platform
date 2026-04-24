import numpy as np
#import matplotlib.pyplot as plt

# def tunnel_force_plt(res):
    # plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei', 'Arial Unicode MS']
    # plt.rcParams['axes.unicode_minus'] = False 

    # x, y = res['x'], res['y']
    # x_plot = np.append(x, x[0]) 
    # y_plot = np.append(y, y[0])
    # N_nodes = len(x)

    # fig, axs = plt.subplots(1, 3, figsize=(18, 6))

    # # ================= 图1：模型、荷载与约束 =================
    # ax1 = axs[0]
    # ax1.plot(x_plot, y_plot, 'k-', linewidth=2, label="衬砌中心线")
    # ax1.scatter(x, y, c='black', s=10, zorder=5) 
    
    # tn, bn = res['top_node'], res['bottom_node']
    # ax1.plot(x[tn], y[tn], 'bs', markersize=8, label="水平向约束 (滑动铰)")
    # ax1.plot(x[bn], y[bn], 'bs', markersize=8)
    
    # # 缩小了土压力的箭头比例 (scale调大) 避免互相遮挡，视觉更清爽
    # ax1.quiver(x, y, res['F_earth_x'], res['F_earth_y'], color='blue', alpha=0.6, 
    #            scale=1.5e6, width=0.01, label="土压力荷载")
    # ax1.quiver(x, y, res['F_water_x'], res['F_water_y'], color='cyan', alpha=0.8, 
    #            scale=1.5e6, width=0.01, label="水压力荷载")
               
    # ax1.set_title("有限元模型")
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