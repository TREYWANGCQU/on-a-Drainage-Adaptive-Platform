// 接收来自顶点着色器的 Varyings
#include <common>
#include <clipping_planes_pars_fragment>

in vec3 vLocalPosition;
in vec3 vNormal;
in vec3 vViewPosition;
in vec3 vInstanceColor;
in vec3 vLocalNormal; // 确保此处存在接收声明
in vec3 vWorldPosition; // 新增：接收世界坐标
in vec2 vUv; // 新增：接收 UV 坐标

uniform float r;
uniform float r1;
uniform float r2;
uniform float rg;
uniform float spacing; 
uniform float aspect; // [修复] 新增注入的真实几何宽高比参数
uniform float totalLength; // 新增：隧道总长度参数

// 新增双范式控制 Uniforms
uniform vec3 uBaseColor;       // 衬砌基色 vec3(0.12, 0.18, 0.25)
uniform vec3 uFresnelColor;    // 边缘发光 vec3(0.0, 0.95, 1.0)
uniform float uOpacity;        // 基础透明度 0.35
uniform float uFresnelPower;   // 菲涅尔指数 3.0
uniform float uShowGrid;       // 全息网格开关 (1.0 开启暗夜网格, 0.0 关闭纯净影棚玻璃)
out vec4 fragColor;

#include <logdepthbuf_pars_fragment>

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
    #include <clipping_planes_fragment>
    // 光照计算仍使用受视图矩阵影响的法线，引入 gl_FrontFacing 修正 DoubleSide 背面光照
    vec3 normal_view = normalize(vNormal);       
    if (!gl_FrontFacing) {
        normal_view = -normal_view;
    }
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
        // [核心剔除] 仅渲染隧道真实前洞口（z >= -0.8）与后洞口（z <= -(totalLength - 0.8)），废弃中间1m实例产生的内部切片端面
        if (totalLength > 1.5 && vWorldPosition.z < -0.8 && vWorldPosition.z > -(totalLength - 0.8)) {
            discard;
        }

        // ==================== 1. 端面多层衬砌拓扑拆解 ====================
        float reff = calculateHorseshoeRadius(vLocalPosition.xy);
        
        if (reff >= r && reff < r1) {
            finalColor = colorSecondary;
            roughness = 0.3;
        } 
        else if (reff >= r1 && reff <= r2) {
            // 初期支护（一衬）层：采用均匀真实混凝土调色，移除同心正弦弧形条纹伪影
            finalColor = colorPrimary;
            roughness = 0.8;
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
        // 衬砌侧壁与拱顶：纯净高透明物理玻璃 / 影棚透视质感
        float reff_wall = calculateHorseshoeRadius(vLocalPosition.xy);
        float mid_r = (r + r2) * 0.5;
    
        float fresnel = pow(1.0 - max(0.0, dot(normal_view, viewDir)), uFresnelPower);
        vec3 baseTone = (reff_wall < mid_r) ? uBaseColor * vInstanceColor : mix(uBaseColor, vec3(0.18, 0.22, 0.28), 0.5);
        finalColor = mix(baseTone, uFresnelColor, fresnel * 0.75);
        roughness = 0.08;
        alpha = clamp(uOpacity + fresnel * 0.6, 0.08, 0.85);

        // 升级 fwidth() 屏幕空间导数抗锯齿网格模型，解决旋转与极远距离下的莫尔纹走样 (WBS 1.1)
        if (uShowGrid > 0.5) {
            float scale = 1.0;
            float grid_z = fract(vWorldPosition.z * scale);
            float w = fwidth(vWorldPosition.z * scale);
            float line_pattern = clamp(1.0 - abs(grid_z - 0.5) / max(w, 0.001), 0.0, 1.0);
            float dist = length(vViewPosition);
            float lod_factor = clamp(1.0 - (dist - 15.0) / (70.0 - 15.0), 0.0, 1.0);
            float finalGrid = line_pattern * lod_factor;
            finalColor += uFresnelColor * finalGrid * 0.35;
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

    #include <logdepthbuf_fragment>
}