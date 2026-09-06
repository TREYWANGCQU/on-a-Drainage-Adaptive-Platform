# tunnel-drainage-platform/deploy/scripts/deploy-docker.ps1
# Windows 本地主控：Docker 服务器版配置同步与远程多架构一键发布脚本

[CmdletBinding()]
param (
    [Parameter(Mandatory = $false)]
    [ValidateSet("SyncConfig", "BuildPush", "All", "Status")]
    [string]$Action = "All",

    [Parameter(Mandatory = $false)]
    [string]$Version = "v1.0.0",

    [Parameter(Mandatory = $false)]
    [string]$DockerUser = "reaticle",

    [Parameter(Mandatory = $false)]
    [string]$RemoteHost = "reaticle@192.168.120.11",

    [Parameter(Mandatory = $false)]
    [string]$RemoteDir = "~/projects/tunnel-drainage-platform",

    [Parameter(Mandatory = $false)]
    [switch]$SkipSSHCheck = $false
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Resolve-Path (Join-Path $ScriptDir "..\..")

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " [Docker Hub 发布控制台] 目标版本: $Version | 操作: $Action" -ForegroundColor Cyan
Write-Host " 本地工程路径: $ProjectRoot" -ForegroundColor Cyan
Write-Host " 远端构建节点: $RemoteHost ($RemoteDir)" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. 检查 SSH 互信连接
function Check-SSHConnection {
    if ($SkipSSHCheck) {
        Write-Host "[1/4] 跳过 SSH 前置握手检查 (SkipSSHCheck 开启)" -ForegroundColor Gray
        return
    }
    Write-Host "[1/4] 正在检测 SSH 远端工作站连通性..." -ForegroundColor Yellow
    $retries = 3
    $connected = $false
    for ($i = 1; $i -le $retries; $i++) {
        Write-Host "    -> 尝试第 $i 次链路握手..." -ForegroundColor Gray
        ssh -o ConnectTimeout=25 -o ServerAliveInterval=15 -o ServerAliveCountMax=6 $RemoteHost "echo '[OK] SSH 链路握手成功，构建节点就绪。'"
        if ($LASTEXITCODE -eq 0) {
            $connected = $true
            break
        }
        Start-Sleep -Seconds 3
    }
    if (-not $connected) {
        Write-Error "无法通过 SSH 连接到 iMac 构建机 ($RemoteHost)，请检查局域网连接或公钥配置。"
    }
}

# 2. 一键同步 Docker 构建配置与最新脚本到远端
function Sync-DockerConfig {
    Write-Host "[2/4] 正在同步本地 Dockerfile、Nginx 与构建配置至远端..." -ForegroundColor Yellow
    # 确保远端目标目录存在
    ssh $RemoteHost "mkdir -p $RemoteDir/deploy/server/nginx $RemoteDir/deploy/scripts"
    
    # 同步 server 目录下的编排与 Dockerfile
    scp -r "$ProjectRoot\deploy\server\*" "$($RemoteHost):$RemoteDir/deploy/server/"
    # 同步构建运行脚本
    scp -r "$ProjectRoot\deploy\scripts\*" "$($RemoteHost):$RemoteDir/deploy/scripts/"
    # 同步 .dockerignore
    if (Test-Path "$ProjectRoot\.dockerignore") {
        scp "$ProjectRoot\.dockerignore" "$($RemoteHost):$RemoteDir/.dockerignore"
    }
    Write-Host "[OK] 构建配置同步完成！" -ForegroundColor Green
}

# 3. 触发远端执行 Buildx 多架构交叉编译并直推 Docker Hub
function Invoke-RemoteBuildPush {
    Write-Host "[3/4] 触发 iMac 执行 Docker Buildx 多架构编译并推送到 Docker Hub..." -ForegroundColor Yellow
    
    $RemoteBuildCommand = @"
bash -c '
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
cd $RemoteDir
echo "=== 检查并激活 Buildx 构建器 ==="
docker buildx use tunnel-builder 2>/dev/null || docker buildx create --name tunnel-builder --driver docker-container --bootstrap --use

echo "=== [1/2] 构建并推送后端多架构镜像 ($DockerUser/tunnel-drainage-backend:$Version) ==="
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -f deploy/server/Dockerfile.backend \
  -t $DockerUser/tunnel-drainage-backend:$Version \
  -t $DockerUser/tunnel-drainage-backend:latest \
  --push .

echo "=== [2/2] 构建并推送前端多架构镜像 ($DockerUser/tunnel-drainage-frontend:$Version) ==="
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -f deploy/server/Dockerfile.frontend \
  -t $DockerUser/tunnel-drainage-frontend:$Version \
  -t $DockerUser/tunnel-drainage-frontend:latest \
  --push .

echo "=== 验证 Docker Hub 后端 Manifest 清单 ==="
docker buildx imagetools inspect $DockerUser/tunnel-drainage-backend:$Version

echo "=== 验证 Docker Hub 前端 Manifest 清单 ==="
docker buildx imagetools inspect $DockerUser/tunnel-drainage-frontend:$Version
'
"@
    ssh -o ServerAliveInterval=15 -o ServerAliveCountMax=60 $RemoteHost $RemoteBuildCommand
    if ($LASTEXITCODE -ne 0) {
        Write-Error "远端多架构编译或推送到 Docker Hub 失败，请检查 Docker Hub 登录凭证或网络状态。"
    }
    Write-Host "[OK] 镜像构建与多架构推送成功！" -ForegroundColor Green
}

# 4. 执行状态核查
function Show-Status {
    Write-Host "[4/4] 正在拉取 Docker Hub 远程 Manifest 状态..." -ForegroundColor Yellow
    ssh $RemoteHost "export PATH=\"/opt/homebrew/bin:/usr/local/bin:`$PATH\"; docker buildx imagetools inspect $DockerUser/tunnel-drainage-backend:$Version; echo '---'; docker buildx imagetools inspect $DockerUser/tunnel-drainage-frontend:$Version"
}

# 路由分发
Check-SSHConnection

switch ($Action) {
    "SyncConfig" {
        Sync-DockerConfig
    }
    "BuildPush" {
        Invoke-RemoteBuildPush
    }
    "All" {
        Sync-DockerConfig
        Invoke-RemoteBuildPush
        Show-Status
    }
    "Status" {
        Show-Status
    }
}

Write-Host "==========================================================" -ForegroundColor Green
Write-Host " 操作顺利完成！镜像已发布至 Docker Hub: $DockerUser" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green
