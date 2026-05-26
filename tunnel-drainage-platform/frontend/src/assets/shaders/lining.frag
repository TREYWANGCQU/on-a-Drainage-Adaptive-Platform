// 接收来自顶点着色器的 Varyings
in vec3 vLocalPosition;
in vec3 vNormal;
in vec3 vViewPosition;
in vec3 vInstanceColor;
in vec3 vLocalNormal; // 确保此处存在接收声明

uniform float r;
uniform float r1;
uniform float r2;
uniform float rg;
uniform float spacing; 
uniform float aspect; // [修复] 新增注入的真实几何宽高比参数
out vec4 fragColor;

// 基于参数化一元二次方程精确解算马蹄形等效半径
float calculateHorseshoeRadius(vec2 p) {
    float x_orig = p.x;
    float y_orig = p.y;
    
    float center_x = 0.0;
    if (spacing > 0.1) {
        center_x = sign(x_orig) * (spacing * 0.5);
    }
    float xl = x_orig - center_x;
    float yl = y_orig;
    
    // 修改点：同步 CPU 端参数拓扑，完全消除硬编码数字，实现动态自适应解算
    // 构建与 TS 严密对齐的基准拓扑，消除硬编码导致的外层形变
    float R1_base = 1.05 * r;
    float R2_base = 0.65 * r;
    float R3_base = 1.80 * r;
    
    float dx = R1_base - R2_base;
    float dy = sqrt(max(0.01, (R3_base - R2_base) * (R3_base - R2_base) - dx * dx));
    
    float w = 2.1 * r;
    float h = w * aspect; 
    float H_side = max(0.0, h - R1_base + dy - R3_base); // 解除 0.1 阻挡，支持真实宽扁结构
    float invertCenterY = -H_side + dy;
    
    
    // 逆向解算等效半径 r_point，严密匹配目标层厚
    if (yl >= 0.0) {
        float r_point = length(vec2(xl, yl));
        return r + r_point - R1_base;
    } else if (yl >= -H_side) {
        return r + abs(xl) - R1_base;
    } else {
        float angle_invert = atan(yl - invertCenterY, abs(xl));
        float aRight = atan(-dy, dx);
        if (angle_invert < aRight) {
            // 仰拱区
            float r_point = length(vec2(abs(xl), yl - invertCenterY));
            return r + r_point - R3_base;
        } else {
            // 边墙角区
            float r_point = length(vec2(abs(xl) - dx, yl + H_side));
            return r + r_point - R2_base;
        }
    }
}

void main() {
    // 光照计算仍使用受视图矩阵影响的法线
    vec3 normal_view = normalize(vNormal);       
    vec3 viewDir = normalize(vViewPosition); 
    
    // 基础科技感调色板定义
    vec3 colorSecondary = vec3(0.72, 0.74, 0.75); 
    vec3 colorPrimary   = vec3(0.38, 0.41, 0.44); 
    vec3 colorGrout     = vec3(0.12, 0.45, 0.74); 
    vec3 colorEdge      = vec3(0.05, 0.08, 0.10); 
    
    vec3 finalColor = vec3(0.5);
    float alpha = 1.0;
    float roughness = 0.5;
    float metallic = 0.1;
    float emit = 0.0;
    
    // 【核心修正】完全隔离相机视角干扰，使用绝对局部坐标法线判定
    if (abs(vLocalNormal.z) > 0.5) {
        // ==================== 1. 端面多层衬砌拓扑拆解 ====================
        float reff = calculateHorseshoeRadius(vLocalPosition.xy);
        
        if (reff >= r && reff < r1) {
            finalColor = colorSecondary;
            roughness = 0.3;
            float tex = sin(vLocalPosition.x * 20.0) * sin(vLocalPosition.y * 20.0);
            finalColor += vec3(tex * 0.02);
        } 
        else if (reff >= r1 && reff <=r2) {
            finalColor = colorPrimary;
            roughness = 0.8;
            float wave = sin(reff * 40.0);
            float delta = fwidth(wave) * 1.5; 
            float grid = smoothstep(0.92 - delta, 0.92 + delta, wave);
            
            finalColor = mix(finalColor, vec3(0.22, 0.24, 0.26), grid * 0.4);
        } 
        
        else {
            discard;
        }
        
        float edgeStroke = 0.03;
        if (abs(reff - r1) < edgeStroke || abs(reff - r2) < edgeStroke ) {
            finalColor = mix(finalColor, colorEdge, 0.7);
        }
    } 
    else {
       
        // ==================== 2. 隧道侧壁与内表面渲染 ====================
    float x_orig = vLocalPosition.x;
    float center_x = 0.0;
    if (spacing > 0.1) { center_x = sign(x_orig) * (spacing * 0.5); }
    float xl = x_orig - center_x;

    // 补充细节：根据同心拓扑推算仰拱最低处的绝对高度边界与路面绝对高度
    float dy_u = sqrt(max(0.01, (1.80 - 0.65) * (1.80 - 0.65) - (1.05 - 0.65) * (1.05 - 0.65))) * r;
    float H_side_u = max(0.0, 2.1 * r * aspect - 1.05 * r + dy_u - 1.80 * r);
    float arc_y_bottom = -H_side_u + dy_u - 1.80 * r;
    
    float dy_road = 1.80 * r - 0.8;
    float halfRoadW = sqrt(max(0.0, 1.80 * r * 1.80 * r - dy_road * dy_road));
    float roadY = arc_y_bottom + 0.8;

    // 空间区域严格分类判定
    bool isCenterDitch = (r > 5.0 && abs(xl) <= 0.305 && vLocalPosition.y < roadY);
    bool isSideDitch = (abs(xl) >= (halfRoadW - 0.305) && abs(xl) <= (halfRoadW + 0.01) && vLocalPosition.y < roadY);
    bool isRoadSurface = (vLocalNormal.y > 0.9 && abs(vLocalPosition.y - roadY)<0.05);

    if (isCenterDitch) {
        // 对于 r > r_threshold(5.0)，中心水沟严格保留并涂装
        finalColor = vec3(0.12, 0.14, 0.16); 
        roughness = 0.2;
        emit = 0.0;
    }
    else if (isSideDitch) {
        // 增加两侧边沟的演示效果设置
        // 两侧边沟取消流动条纹，改用均匀深色防渗涂装
        finalColor = vec3(0.12, 0.15, 0.18); 
        roughness = 0.3;
        //float waterFlow = step(0.95, sin(vLocalPosition.z * 4.0 + 1.0)); 
        //finalColor = mix(finalColor, vec3(0.0, 0.8, 0.7), waterFlow * 0.4);
        emit = 0.0;
    }
    else if (isRoadSurface) {
        // 回填层路面设置为半透明材质，以便查看后期隐藏的排水管线
        roughness = 0.2;
        metallic = 0.4;
        
        // 计算当前点到路面中心的相对距离比例 (0.0 为中心，1.0 为最外侧边沟沿)
        float edgeFactor = abs(xl) / halfRoadW;
        
        // 采用高幂次曲线，让透明度在中心快速收敛至极低，在边缘处陡峭上升
        float borderGlow = pow(edgeFactor, 4.0);
        
        // 调色：中心淡蓝色，边缘高亮深蓝
        finalColor = mix(vec3(0.05, 0.1, 0.15), vec3(0.0, 0.6, 1.0), borderGlow);
        emit = borderGlow * 0.3;
        
        // 透明度控制：中心留出 0.15 的极高透明度查看管网，边缘上升到 0.6 锁定轮廓
        alpha = mix(0.15, 0.60, borderGlow);
    }
    else {
        // 保持原其余内墙面（非路面、非水沟区域）渲染逻辑不变
        float reff_wall = calculateHorseshoeRadius(vLocalPosition.xy);
        float mid_r = (r + r2) * 0.5;
    
        if (reff_wall < mid_r) {
            finalColor = colorSecondary * vInstanceColor;
            roughness = 0.4;
            float ringJoint = step(0.98, sin(vLocalPosition.z * (3.1415926 / 12.0)));
            finalColor = mix(finalColor, colorEdge, ringJoint * 0.6);
            float scanLine = step(0.97, sin(vLocalPosition.z * 0.5 - 0.0));
            vec3 glowColor = vec3(0.0, 0.9, 1.0);
            finalColor = mix(finalColor, glowColor, scanLine * 0.3);
            emit = scanLine * 0.4;
        } 
        else {
            finalColor = vec3(0.18, 0.22, 0.28); 
            roughness = 0.9;
            float cracks = step(0.95, sin(vLocalPosition.z * 2.0) * cos(reff_wall * 5.0));
            finalColor = mix(finalColor, vec3(0.0, 0.5, 0.9), cracks * 0.5);
            emit = cracks * 0.3;
        }
    }
        
    }
    
    // 执行高性能 Blinn-Phong 光照解算
    vec3 lightDir = normalize(vec3(1.0, 1.0, 1.0));
    float diff = max(dot(normal_view, lightDir), 0.0);
    vec3 diffuse = diff * finalColor;
    
    vec3 halfDir = normalize(lightDir + viewDir);
    float spec = pow(max(dot(normal_view, halfDir), 0.0), 32.0);
    vec3 specular = vec3(0.3) * spec * (1.0 - roughness);
    
    vec3 ambient = vec3(0.25) * finalColor;
    
    vec3 finalComputedColor = ambient + diffuse + specular + (finalColor * emit);
    fragColor = vec4(finalComputedColor, alpha);
}