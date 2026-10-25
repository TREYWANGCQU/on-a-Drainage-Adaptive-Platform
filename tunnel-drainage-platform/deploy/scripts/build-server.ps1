# tunnel-drainage-platform/deploy/scripts/build-server.ps1
# Windows 本地主控：Docker 服务器版交付物料打包与生产环境配置生成脚本

param (
    [string]$OperatorPassword = "",
    [string]$Version = "v1.0.0",
    [switch]$NonInteractive = $false
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RootDir = Resolve-Path "$ScriptDir\..\.."
$DeployDir = Join-Path $RootDir "deploy\server"
$DistDockerDir = Join-Path $RootDir "dist-docker"

# 前置断言：检查 Git 状态，若有未忽略的敏感构建文件已被暂存或被跟踪，立即报错阻断
$gitStatus = git status --porcelain 2>$null
if ($gitStatus -match "_build_constants\.py|\.env\.production") {
    Write-Error "[Security Gate] 检测到工作区存在敏感配置文件未被完全忽略或已被暂存，构建已被物理阻断！"
    exit 1
}

# 交互式或参数化获取生产环境口令
if (-not $OperatorPassword -and -not $NonInteractive) {
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "  [安全配置] 隧道工程平台 Docker 服务器版 - 生产运维口令配置" -ForegroundColor Cyan
    Write-Host "==========================================================" -ForegroundColor Cyan
    $inputPwd = Read-Host "请输入服务器版生产环境密码 [直接回车使用默认: chongqing123456]"
    if ($inputPwd.Trim()) {
        $OperatorPassword = $inputPwd.Trim()
    } else {
        $OperatorPassword = "chongqing123456"
    }
} elseif (-not $OperatorPassword) {
    $OperatorPassword = "chongqing123456"
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " [Server Mode] 启动 Docker 服务器交付物料归集与独立部署包生成" -ForegroundColor Cyan
Write-Host " 工程根目录: $RootDir" -ForegroundColor Gray
Write-Host " 交付输出目录: $DistDockerDir" -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. 准备并初始化 dist-docker 目录
if (Test-Path $DistDockerDir) {
    Remove-Item -Path $DistDockerDir -Recurse -Force
}
New-Item -ItemType Directory -Path $DistDockerDir -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $DistDockerDir "nginx") -Force | Out-Null

# 2. 生成高熵 HMAC 密钥
$randomBytes = New-Object byte[] 32
(New-Object Security.Cryptography.RNGCryptoServiceProvider).GetBytes($randomBytes)
$secretKey = -join ($randomBytes | ForEach-Object { "{0:x2}" -f $_ })

# 3. 写入专属受保护生产环境配置 (.env.production，受 .gitignore 严密保护)
Write-Host "`n[Step 1/3] 生成独立交付环境配置文件 (.env.production)..." -ForegroundColor Yellow
$envProdContent = @"
# =============================================================
# 隧道工程多维协同智能排水自适应平台 - 生产运行环境变量
# 生成时间: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
# 严禁将本文件提交至 Git 仓库！
# =============================================================

# Docker 镜像与版本
DOCKER_REGISTRY_NAMESPACE=reaticle
APP_VERSION=$Version

# 宿主对外暴露网络端口
HTTP_PORT=80
HTTPS_PORT=443

# 日志输出等级 (debug | info | warning | error)
LOG_LEVEL=info

# 数据库持久化路径 (容器内映射路径)
DB_PATH=/app/data/tunnel_params.db

# 平台安全认证与运维级改密配置
# 运维改密规程：修改此口令后执行 docker compose restart backend 热重启生效 (<=15s)
PLATFORM_AUTH_PASSWORD=$OperatorPassword
PLATFORM_SECRET_KEY=$secretKey
PLATFORM_AUTH_MODE=server
PLATFORM_AUTH_ENABLED=true
AUTH_TOKEN_EXPIRE_MINUTES=120
"@
$envProdPath = Join-Path $DistDockerDir ".env.production"
Set-Content -Path $envProdPath -Value $envProdContent -Encoding UTF8 -Force
Write-Host "  -> 已生成安全配置文件: $envProdPath" -ForegroundColor Green

# 4. 拷贝部署编排与 Nginx 配置
Write-Host "`n[Step 2/3] 拷贝 Docker Compose 生产编排资产与 Nginx 配置..." -ForegroundColor Yellow
$composeProdSource = Join-Path $DeployDir "docker-compose.prod.yml"
$composeTarget = Join-Path $DistDockerDir "docker-compose.yml"
Copy-Item $composeProdSource $composeTarget -Force
Write-Host "  -> 已拷贝: docker-compose.yml (基于 docker-compose.prod.yml)" -ForegroundColor Green

$nginxConfigSource = Join-Path $DeployDir "nginx\nginx.conf"
if (Test-Path $nginxConfigSource) {
    Copy-Item $nginxConfigSource (Join-Path $DistDockerDir "nginx\nginx.conf") -Force
    Write-Host "  -> 已拷贝: nginx/nginx.conf" -ForegroundColor Green
}

# 5. 生成部署指导说明 README.txt 与 SHA256 校验和
Write-Host "`n[Step 3/3] 生成独立部署运行指导说明与 SHA-256 清单..." -ForegroundColor Yellow
$readmeContent = @"
======================================================================
隧道工程多维协同智能排水自适应平台 - Docker 服务器版本独立部署包
======================================================================

【快速启动规程】
1. 将本目录完整上传至目标 Linux 服务器（例如: /opt/tunnel-platform）；
2. 确保已安装 Docker (24.0+) 与 Docker Compose (v2.0+)；
3. 将 .env.production 重命名为 .env，或直接执行带环境参数的编排命令：
   docker compose --env-file .env.production up -d
4. 访问服务器 IP 即可进入 Web 端工作台。

【运维级改密规程】
- 本平台遵循云原生 12-Factor App 静态配置标准，不设在线改密，彻底避免配置漂移与越权；
- 如需更改管理员操作口令，编辑 .env 或 .env.production 中的 PLATFORM_AUTH_PASSWORD 字段；
- 执行热重启容器：
   docker compose restart backend
- 容器在 15 秒内无缝完成热重启并加载全新口令。
======================================================================
"@
$readmePath = Join-Path $DistDockerDir "DEPLOY_README.txt"
Set-Content -Path $readmePath -Value $readmeContent -Encoding UTF8 -Force

# 计算 SHA-256
$SumsFile = Join-Path $DistDockerDir "SHA256SUMS.txt"
$HashList = @()
Get-ChildItem -Path $DistDockerDir -File | Where-Object { $_.Name -ne "SHA256SUMS.txt" } | ForEach-Object {
    $hash = (Get-FileHash $_.FullName -Algorithm SHA256).Hash
    $HashList += "$hash  $($_.Name)"
}
$HashList | Out-File -FilePath $SumsFile -Encoding utf8
Write-Host "  -> SHA256 校验清单已生成: $SumsFile" -ForegroundColor Green

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host " [Server Mode] Docker 服务器部署包生成成功！" -ForegroundColor Green
Write-Host " 输出目录: $DistDockerDir" -ForegroundColor Green
Write-Host " 注意: 包含私有口令，严禁将 dist-docker/ 提交至 Git 仓库。" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Green
