# tunnel-drainage-platform/deploy/scripts/build-desktop.ps1
# Windows 桌面独立 GUI 模式一键编译、打包与发布流水线脚本

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$RootDir = Resolve-Path "$ScriptDir\..\.."
$BackendDir = Join-Path $RootDir "backend"
$FrontendDir = Join-Path $RootDir "frontend"
$DesktopReleaseDir = Join-Path $RootDir "release\desktop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " [Desktop Mode] 启动桌面独立 GUI 自动化构建与发行流水线" -ForegroundColor Cyan
Write-Host " 工程根目录: $RootDir" -ForegroundColor Gray
Write-Host "==========================================================" -ForegroundColor Cyan

# 0. 准备发布目录
if (!(Test-Path $DesktopReleaseDir)) {
    New-Item -ItemType Directory -Path $DesktopReleaseDir -Force | Out-Null
}

# 1. 编译独立后端 Sidecar (PyInstaller 冻结)
Write-Host "`n[Step 1/5] 编译自包含 Python 后端引擎 Sidecar (PyInstaller)..." -ForegroundColor Yellow
Push-Location $BackendDir
try {
    $PythonExe = ".\venv\Scripts\python.exe"
    $PyInstallerExe = ".\venv\Scripts\pyinstaller.exe"

    if (!(Test-Path $PyInstallerExe)) {
        Write-Host "未检测到 PyInstaller，正在安装..." -ForegroundColor Yellow
        & $PythonExe -m pip install pyinstaller
    }

    & $PyInstallerExe packaging/sidecar.spec --distpath dist --workpath build -y
    if ($LASTEXITCODE -ne 0) {
        throw "PyInstaller 打包后端 Sidecar 失败！退出码: $LASTEXITCODE"
    }
}
finally {
    Pop-Location
}

# 2. 注入外部二进制至 Tauri 桥接目录
Write-Host "`n[Step 2/5] 注入外部二进制物料至 Tauri Binaries 目录..." -ForegroundColor Yellow
$SidecarDist = Join-Path $BackendDir "dist\tunnel-backend-sidecar.exe"
$TauriBinDir = Join-Path $FrontendDir "src-tauri\binaries"

if (!(Test-Path $TauriBinDir)) {
    New-Item -ItemType Directory -Path $TauriBinDir -Force | Out-Null
}

Copy-Item $SidecarDist (Join-Path $TauriBinDir "tunnel-backend-sidecar.exe") -Force
Copy-Item $SidecarDist (Join-Path $TauriBinDir "tunnel-backend-sidecar-x86_64-pc-windows-msvc.exe") -Force
Write-Host "  -> 已同步: tunnel-backend-sidecar.exe" -ForegroundColor Green
Write-Host "  -> 已同步: tunnel-backend-sidecar-x86_64-pc-windows-msvc.exe" -ForegroundColor Green

# 3. 构建前端 SPA 静态生产资产
Write-Host "`n[Step 3/5] 执行前端生产打包 (Vite + TypeScript)..." -ForegroundColor Yellow
Push-Location $FrontendDir
try {
    npm run build
    if ($LASTEXITCODE -ne 0) {
        throw "前端 npm run build 失败！"
    }
}
finally {
    Pop-Location
}

# 4. 执行 Tauri 2.0 桌面原生编译与打包
Write-Host "`n[Step 4/5] 执行 Tauri 2.0 原生 Windows 安装包与可执行程序构建..." -ForegroundColor Yellow
Push-Location $FrontendDir
try {
    npx tauri build
    if ($LASTEXITCODE -ne 0) {
        throw "Tauri 构建失败！退出码: $LASTEXITCODE"
    }
}
finally {
    Pop-Location
}

# 5. 归集最终交付物至 release/desktop 并生成校验和
Write-Host "`n[Step 5/5] 归集桌面交付发行包并计算 SHA-256 完整性校验和..." -ForegroundColor Yellow
$BundleDir = Join-Path $FrontendDir "src-tauri\target\release\bundle"
$ReleaseExe = Join-Path $DesktopReleaseDir "TunnelDrainagePlatform-v1.0.0-x64-Setup.exe"

# 查找并归集 NSIS 安装程序
$NsisFiles = Get-ChildItem -Path "$BundleDir\nsis" -Filter "*.exe" -Recurse -ErrorAction SilentlyContinue
if ($NsisFiles -and $NsisFiles.Count -gt 0) {
    Copy-Item $NsisFiles[0].FullName $ReleaseExe -Force
    Write-Host "  -> 成功归集安装向导: $ReleaseExe" -ForegroundColor Green
} else {
    # 尝试从 msi 目录查找
    $MsiFiles = Get-ChildItem -Path "$BundleDir\msi" -Filter "*.msi" -Recurse -ErrorAction SilentlyContinue
    if ($MsiFiles -and $MsiFiles.Count -gt 0) {
        $ReleaseMsi = Join-Path $DesktopReleaseDir "TunnelDrainagePlatform-v1.0.0-x64.msi"
        Copy-Item $MsiFiles[0].FullName $ReleaseMsi -Force
        Write-Host "  -> 成功归集 MSI 安装包: $ReleaseMsi" -ForegroundColor Green
    }
}

# 绿色便携版打包 (免安装解压即用)
$TargetReleaseBin = Join-Path $FrontendDir "src-tauri\target\release\tunnel_drainage_platform.exe"
if (!(Test-Path $TargetReleaseBin)) {
    $TargetReleaseBin = Join-Path $FrontendDir "src-tauri\target\release\TunnelDrainagePlatform.exe"
}

if (Test-Path $TargetReleaseBin) {
    $PortableDir = Join-Path $DesktopReleaseDir "TunnelDrainagePlatform-Portable"
    if (Test-Path $PortableDir) { Remove-Item $PortableDir -Recurse -Force }
    New-Item -ItemType Directory -Path $PortableDir -Force | Out-Null

    Copy-Item $TargetReleaseBin (Join-Path $PortableDir "TunnelDrainagePlatform.exe") -Force
    Copy-Item $SidecarDist (Join-Path $PortableDir "tunnel-backend-sidecar.exe") -Force

    $PortableZip = Join-Path $DesktopReleaseDir "TunnelDrainagePlatform-v1.0.0-x64-Portable.zip"
    if (Test-Path $PortableZip) { Remove-Item $PortableZip -Force }
    Compress-Archive -Path "$PortableDir\*" -DestinationPath $PortableZip -Force
    Remove-Item $PortableDir -Recurse -Force
    Write-Host "  -> 成功生成绿色免安装便携版: $PortableZip" -ForegroundColor Green
}

# 计算 SHA256 校验和清单
$SumsFile = Join-Path $DesktopReleaseDir "SHA256SUMS.txt"
$HashList = @()
Get-ChildItem -Path $DesktopReleaseDir -File | Where-Object { $_.Name -ne "SHA256SUMS.txt" -and $_.Name -ne ".gitkeep" } | ForEach-Object {
    $hash = (Get-FileHash $_.FullName -Algorithm SHA256).Hash
    $HashList += "$hash  $($_.Name)"
}
$HashList | Out-File -FilePath $SumsFile -Encoding utf8
Write-Host "  -> SHA256 校验清单已更新: $SumsFile" -ForegroundColor Green

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host " [Desktop Mode] 桌面独立 GUI 交付物料已成功发布至:" -ForegroundColor Cyan
Write-Host " -> $DesktopReleaseDir" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
