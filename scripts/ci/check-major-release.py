# scripts/ci/check-major-release.py
# 隧道工程多维协同智能排水自适应平台 - CI 大版本判定与更新摘要提取门禁脚本

import json
import os
import re
import sys
from pathlib import Path

# 强制重构 Windows 控制台标准输出为 UTF-8，防止 cp1252 编码异常
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


def main():
    tag = os.environ.get("GITHUB_REF_NAME", "").strip()
    print(f"[CI Gatekeeper] 当前触发 Tag: '{tag}'")

    if not tag:
        print("[CI Gatekeeper] 错误: 未获取到 GITHUB_REF_NAME 环境变量。")
        set_output("is_major", "false")
        sys.exit(1)

    # 1. 正则判定大版本 (严格大版本: vX.0.0 或 功能里程碑: vX.Y.0)
    # 严格排除补丁版本 (Z > 0) 以及任何预发布后缀 (-alpha, -beta, -rc)
    major_pattern = r"^v([0-9]+)\.([0-9]+)\.0$"
    match = re.match(major_pattern, tag)
    if not match:
        print(f"[CI Gatekeeper] Tag '{tag}' 不符合大版本/里程碑发布命名规约 (^v[0-9]+\\.[0-9]+\\.0$)。")
        print(">> 触发安全熔断：阻断自动发布流水线（非大版本），避免产生非必要的云端打包资源消耗。")
        set_output("is_major", "false")
        sys.exit(0)

    version_number = tag.lstrip("v")
    print(f"[CI Gatekeeper] 命名核验通过，提取发布版本号: {version_number}")

    # 定位仓库根目录 (scripts/ci/ -> 根目录)
    root = Path(__file__).resolve().parent.parent.parent

    # 2. SSOT 版本强一致性双锁核验 (tauri.conf.json & package.json)
    tauri_conf = root / "tunnel-drainage-platform" / "frontend" / "src-tauri" / "tauri.conf.json"
    if tauri_conf.exists():
        with open(tauri_conf, "r", encoding="utf-8") as f:
            data = json.load(f)
            conf_ver = data.get("version", "")
            if conf_ver != version_number:
                print(f"[ERROR] tauri.conf.json 版本号 ({conf_ver}) 与 Tag 版本 ({version_number}) 不一致！")
                sys.exit(1)
            print(f"[CI Gatekeeper] [Lock 1/2] tauri.conf.json 版本核验一致: {conf_ver}")
    else:
        print(f"[ERROR] 未找到 Tauri 配置文件: {tauri_conf}")
        sys.exit(1)

    package_json = root / "tunnel-drainage-platform" / "frontend" / "package.json"
    if package_json.exists():
        with open(package_json, "r", encoding="utf-8") as f:
            pkg_data = json.load(f)
            pkg_ver = pkg_data.get("version", "")
            if pkg_ver != version_number:
                print(f"[ERROR] package.json 版本号 ({pkg_ver}) 与 Tag 版本 ({version_number}) 不一致！")
                sys.exit(1)
            print(f"[CI Gatekeeper] [Lock 2/2] package.json 版本核验一致: {pkg_ver}")
    else:
        print(f"[ERROR] 未找到前端 package.json: {package_json}")
        sys.exit(1)

    # 3. 提取 CHANGELOG.md 对应版本更新内容
    changelog_file = root / "CHANGELOG.md"
    extracted_notes = ""
    if changelog_file.exists():
        with open(changelog_file, "r", encoding="utf-8") as f:
            lines = f.readlines()
        in_target_version = False
        notes_lines = []
        for line in lines:
            if re.match(rf"^##\s*\[?v?{re.escape(version_number)}\]?", line):
                in_target_version = True
                continue
            elif in_target_version and line.startswith("## "):
                break
            if in_target_version:
                notes_lines.append(line)
        extracted_notes = "".join(notes_lines).strip()
        if extracted_notes:
            print(f"[CI Gatekeeper] 成功从 CHANGELOG.md 提取版本 [{version_number}] 更新摘要 ({len(notes_lines)} 行)。")

    if not extracted_notes:
        print("[CI Gatekeeper] 警告: CHANGELOG.md 中未检索到当前版本的独立章节，采用兜底发布声明。")
        extracted_notes = f"## 隧道工程多维协同智能排水自适应平台 {tag} 里程碑版本正式发布。\n\n详见工程代码提交历史与技术文档。"

    # 将提取的更新说明持久化至 release_notes.md 供下游步骤作为 Artifact 读取
    notes_path = root / "release_notes.md"
    with open(notes_path, "w", encoding="utf-8") as f:
        f.write(extracted_notes)
    print(f"[CI Gatekeeper] 更新摘要已成功暂存至: {notes_path}")

    # 4. 输出环境变量供 GitHub Actions 下游 Job 消费
    set_output("is_major", "true")
    set_output("version", version_number)
    print("[CI Gatekeeper] 门禁全部放行 (PASS)！准备调度深度编译与发布流水线。")


def set_output(name: str, value: str):
    github_output = os.environ.get("GITHUB_OUTPUT")
    if github_output:
        with open(github_output, "a", encoding="utf-8") as f:
            f.write(f"{name}={value}\n")
    else:
        print(f"[OUTPUT (Local Mode)] {name}={value}")


if __name__ == "__main__":
    main()
