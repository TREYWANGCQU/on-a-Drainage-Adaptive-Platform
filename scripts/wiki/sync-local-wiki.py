# scripts/wiki/sync-local-wiki.py
# -*- coding: utf-8 -*-
"""
隧道工程多维协同智能排水自适应平台
GitHub Wiki 本地同步与离线灾备推送工具
版本: v1.1.0
"""

import os
import sys
import shutil
import subprocess
import argparse
from pathlib import Path


def run_cmd(cmd, cwd=None, capture=True):
    print(f"[*] 执行命令: {cmd}")
    res = subprocess.run(
        cmd,
        cwd=cwd,
        shell=True,
        text=True,
        capture_output=capture,
        encoding="utf-8",
        errors="replace"
    )
    if res.returncode != 0 and capture:
        print(f"[!] 报错输出:\n{res.stderr}")
    return res


def sync_wiki(repo_url: str, output_dir: Path, work_dir: Path, token: str = None):
    # 构造带鉴权或标准 URL 的 wiki git 地址
    if not repo_url.endswith(".wiki.git"):
        clean_url = repo_url.rstrip("/").removesuffix(".git")
        wiki_git_url = f"{clean_url}.wiki.git"
    else:
        wiki_git_url = repo_url

    if token:
        if "https://" in wiki_git_url:
            auth_url = wiki_git_url.replace("https://", f"https://x-access-token:{token}@")
        else:
            auth_url = wiki_git_url
    else:
        auth_url = wiki_git_url

    print(f"[*] 目标 Wiki Git 地址: {wiki_git_url}")

    # 1. 探测远程 Wiki 仓库是否存在
    print("[*] 正在探测远程 Wiki 仓库连接状态...")
    test_res = run_cmd(f"git ls-remote {auth_url}")
    if test_res.returncode != 0:
        print("\n" + "="*70)
        print("【⚠️ 关键提示：远程 GitHub Wiki 仓库尚未初始化】")
        print("GitHub 平台规则：每个新项目的 Wiki 必须在 Web 网页端完成首次初始化！")
        print("请在浏览器中打开项目的 GitHub 页面，执行以下两步：")
        print("  1. 点击顶部标签页中的 [Wiki]（若未显示，在 Settings -> Features 勾选 Wikis）")
        print("  2. 点击绿色的 [Create the first page] 按钮，标题随意输入并点击页面底部 [Save Page]")
        print("保存成功后，GitHub 才会为项目分配 .wiki.git 实体，届时再次运行本脚本即可秒级推送！")
        print("="*70 + "\n")
        return False

    # 2. 准备本地 Wiki 临时检出目录
    wiki_checkout_dir = work_dir / "wiki_repo"
    if wiki_checkout_dir.exists():
        shutil.rmtree(wiki_checkout_dir)

    print(f"[*] 克隆远程 Wiki 仓库到临时目录: {wiki_checkout_dir}...")
    clone_res = run_cmd(f"git clone {auth_url} {wiki_checkout_dir}")
    if clone_res.returncode != 0:
        print("[!] 克隆 Wiki 仓库失败，请检查网络或 Git 访问权限。")
        return False

    # 3. 将 output_dir 中的文件同步覆盖至 wiki_checkout_dir
    print(f"[*] 正在将编译产物从 {output_dir} 同步至 Wiki 工作区...")
    for item in output_dir.glob("*"):
        if item.is_file():
            shutil.copy2(item, wiki_checkout_dir / item.name)

    # 4. 检查差异并提交推送
    run_cmd("git add -A", cwd=wiki_checkout_dir)
    status_res = run_cmd("git status -s", cwd=wiki_checkout_dir)
    if not status_res.stdout.strip():
        print("[*] Wiki 内容已是最新，无任何增量变更需要提交。")
        return True

    print("[*] 检测到 Wiki 增量更新，正在生成 Commit 并推送...")
    commit_res = run_cmd('git commit -m "docs(wiki): sync curated knowledge base from main repository"', cwd=wiki_checkout_dir)
    push_res = run_cmd(f"git push {auth_url} HEAD:master", cwd=wiki_checkout_dir)
    if push_res.returncode != 0:
        # 尝试推送 main 分支
        push_res = run_cmd(f"git push {auth_url} HEAD:main", cwd=wiki_checkout_dir)

    if push_res.returncode == 0:
        print("\n[SUCCESS] 🎉 成功将体系化知识库发布至 GitHub Wiki！")
        return True
    else:
        print("[!] 推送失败，请检查写入权限。")
        return False


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="GitHub Wiki 本地一键同步与离线推送工具")
    parser.add_argument("--repo-url", default="", help="GitHub 主仓库或 Wiki 仓库 URL (如不指定则自动获取 origin)")
    parser.add_argument("--token", default="", help="GitHub PAT 访问令牌（可选，默认使用本地 Git 凭据）")
    parser.add_argument("--dist-dir", default="dist/wiki", help="Wiki 编译产物目录")
    args = parser.parse_args()

    current_root = Path(".").resolve()
    repo_url = args.repo_url
    if not repo_url:
        res = run_cmd("git remote get-url origin")
        if res.returncode == 0 and res.stdout.strip():
            repo_url = res.stdout.strip()
        else:
            print("[!] 未能自动识别 git remote origin，请通过 --repo-url 指定。")
            sys.exit(1)

    dist_path = current_root / args.dist_dir
    temp_work = current_root / "dist" / "temp_wiki_sync"
    temp_work.mkdir(parents=True, exist_ok=True)

    # 确保先执行编译
    build_script = current_root / "scripts" / "wiki" / "build-wiki.py"
    if build_script.exists():
        print("[*] 正在先调用 build-wiki.py 编译生成最新 Wiki 产物...")
        subprocess.run([sys.executable, str(build_script), "--output", str(dist_path)], check=True)

    token = args.token or os.environ.get("WIKI_SYNC_TOKEN") or os.environ.get("GITHUB_TOKEN")
    success = sync_wiki(repo_url, dist_path, temp_work, token=token)
    if not success:
        sys.exit(1)
