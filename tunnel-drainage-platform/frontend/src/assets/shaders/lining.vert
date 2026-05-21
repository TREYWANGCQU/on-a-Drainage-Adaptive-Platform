// tunnel-drainage-platform\frontend\src\assets\shaders\lining.vert
// 暴露的隧道参数 Uniforms
uniform float r;
uniform float r1;
uniform float r2;
uniform float rg;

// 传递给片元着色器的 Varyings
out vec3 vLocalPosition;
out vec3 vNormal;
out vec3 vViewPosition;
out vec3 vInstanceColor;
out vec3 vLocalNormal; // 确保此处存在输出声明

void main() {
    vLocalPosition = position;
    vLocalNormal = normal; // 确保此处对局部物理法线赋值
    
    // 基础顶点位置解算
    vec4 localPosition = vec4(position, 1.0);
    vec3 transformedNormal = normal;
    
    // 适配 InstancedMesh 空间矩阵推演
    #ifdef USE_INSTANCING
        localPosition = instanceMatrix * localPosition;
        mat3 instanceNormalMatrix = mat3(instanceMatrix);
        transformedNormal = instanceNormalMatrix * transformedNormal;
    #endif
    
    // 传递法线与视图方向
    vNormal = normalize(normalMatrix * transformedNormal);
    vec4 mvPosition = modelViewMatrix * localPosition;
    vViewPosition = -mvPosition.xyz;
    
    // 严格分离：适配实例颜色的独立宏推演
    #ifdef USE_INSTANCING_COLOR
        vInstanceColor = instanceColor;
    #else
        vInstanceColor = vec3(1.0);
    #endif
    
    gl_Position = projectionMatrix * mvPosition;
}