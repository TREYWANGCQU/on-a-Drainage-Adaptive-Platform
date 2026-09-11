# scripts/build-wiki-staging.ps1
<#
.SYNOPSIS
    隧道工程智能排水自适应平台 - GitHub Wiki 本地编译与受控暂存构建引擎
.DESCRIPTION
    1. 依据 docs/wiki-manifest.yml 清单调度，扫描 docs/ 下全量工程与阶段文档；
    2. 优先采用 docs/wiki/*.md 人工精修覆写版本（如 12次迭代复盘）；
    3. 自动转换内部跨文档链接与 GitHub Raw CDN 图床；
    4. 动态生成门户首页 (Home.md)、侧边栏导航 (_Sidebar.md) 与页脚 (_Footer.md)；
    5. 将生成物统一输出至代码仓受控暂存区 doc/wiki_staging/。
.PARAMETER OutputDir
    Wiki 暂存输出目录，默认为 doc/wiki_staging
#>

[CmdletBinding()]
param(
    [string]$OutputDir = ""
)

$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ManifestPath = Join-Path $ProjectRoot "docs\wiki-manifest.yml"
$PythonScript = Join-Path $ProjectRoot "scripts\wiki\build-wiki.py"

if ([string]::IsNullOrWhiteSpace($OutputDir)) {
    $OutputDir = Join-Path $ProjectRoot "doc\wiki_staging"
}

Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "[Wiki Curator] 隧道工程平台 Wiki 受控暂存构建引擎启动..." -ForegroundColor Cyan
Write-Host "[Wiki Curator] 编排控制清单: $ManifestPath" -ForegroundColor Gray
Write-Host "[Wiki Curator] 受控暂存输出区: $OutputDir" -ForegroundColor Gray
Write-Host "============================================================" -ForegroundColor Cyan

if (-not (Test-Path $ManifestPath)) {
    Write-Error "未找到编排清单文件: $ManifestPath"
}

# 运行 Python 编译转换引擎
python $PythonScript --manifest "docs/wiki-manifest.yml" --output "doc/wiki_staging" --repo-root $ProjectRoot

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n============================================================" -ForegroundColor Green
    Write-Host "[Wiki Curator] 构建成功！暂存文件已就绪于: $OutputDir" -ForegroundColor Green
    Write-Host "[Wiki Curator] 请使用 'git status' 审查变动，随后提交并推送至 main 分支触发自动发布。" -ForegroundColor Green
    Write-Host "============================================================" -ForegroundColor Green
} else {
    Write-Error "[Wiki Curator] 构建失败，退出码: $LASTEXITCODE"
}
