# scripts/wiki/build-wiki.py
# -*- coding: utf-8 -*-
"""
隧道工程多维协同智能排水自适应平台
GitHub Wiki 体系化构建与自动化转换引擎 (Compiler Engine)
版本: v1.1.0
"""

import os
import sys
import re
import shutil
import argparse
from pathlib import Path

try:
    import yaml
except ImportError:
    yaml = None


def parse_simple_yaml(text: str) -> dict:
    """简单的降级 YAML 解析器，用于无 pyyaml 依赖时的基础配置解析"""
    data = {"settings": {}, "categories": []}
    cur_cat = None
    cur_page = None
    mode = None

    for line in text.splitlines():
        raw = line
        line = line.split('#')[0].rstrip()
        if not line:
            continue
        indent = len(raw) - len(raw.lstrip())
        stripped = line.strip()

        if stripped.startswith("site_title:"):
            data["settings"]["site_title"] = stripped.split(":", 1)[1].strip().strip('"\'')
        elif stripped.startswith("asset_cdn_prefix:"):
            data["settings"]["asset_cdn_prefix"] = stripped.split(":", 1)[1].strip().strip('"\'')
        elif stripped.startswith("- id:"):
            cur_cat = {"id": stripped.split(":", 1)[1].strip().strip('"\''), "pages": []}
            data["categories"].append(cur_cat)
            mode = "cat"
        elif cur_cat and stripped.startswith("title:") and mode == "cat":
            cur_cat["title"] = stripped.split(":", 1)[1].strip().strip('"\'')
        elif cur_cat and stripped.startswith("- source:"):
            cur_page = {"source": stripped.split(":", 1)[1].strip().strip('"\'')}
            cur_cat["pages"].append(cur_page)
            mode = "page"
        elif cur_page and ":" in stripped and mode == "page":
            k, v = stripped.split(":", 1)
            k = k.strip()
            v = v.strip().strip('"\'')
            if v.lower() == "true":
                v = True
            elif v.lower() == "false":
                v = False
            elif v.isdigit():
                v = int(v)
            cur_page[k] = v

    return data


def load_manifest(manifest_path: Path) -> dict:
    content = manifest_path.read_text(encoding="utf-8")
    if yaml:
        return yaml.safe_load(content)
    return parse_simple_yaml(content)


def sanitize_wiki_page(
    content: str,
    source_filename: str,
    wiki_title: str,
    slug: str,
    is_curated: bool,
    cdn_prefix: str,
    source_to_slug: dict
) -> str:
    """清洗单篇 Markdown 内容，处理相对图片链接、Markdown 跨文档链接以及状态声明徽章"""
    lines = content.splitlines()

    # 1. 如果原始文件首行已有相似的大标题，保持或标准化
    # 2. 跨文档链接重写 [xxx](阶段x-xxx.md) -> [[xxx|TargetSlug]]
    def link_replacer(match):
        text = match.group(1)
        raw_target = match.group(2).strip()
        # 外部链接保持原样
        if raw_target.startswith("http://") or raw_target.startswith("https://"):
            return match.group(0)
        # 纯锚点直接保留
        if raw_target.startswith("#"):
            return f"[{text}]({raw_target})"

        target_clean = raw_target.split('#')[0].replace('\\', '/')
        anchor = ("#" + raw_target.split('#')[1]) if '#' in raw_target else ""

        # 如果是内部 markdown 引用，支持全路径、相对路径或文件名匹配
        for src_name, target_slug in source_to_slug.items():
            src_clean = src_name.replace('\\', '/')
            if (target_clean == src_clean or 
                target_clean.endswith('/' + src_clean) or 
                src_clean.endswith('/' + target_clean) or 
                Path(src_clean).name == Path(target_clean).name):
                return f"[[{text}|{target_slug}{anchor}]]"

        return match.group(0)

    processed_content = re.sub(r'\[([^\]]+)\]\(([^)]+\.md(?:#[^)]*)?)\)', link_replacer, content)

    # 3. 相对图片链接绝对化处理
    def image_replacer(match):
        alt = match.group(1)
        img_path = match.group(2).strip()
        if not img_path.startswith("http://") and not img_path.startswith("https://"):
            clean_path = img_path.lstrip("./").lstrip("/").replace("\\", "/")
            return f"![{alt}]({cdn_prefix}/{clean_path})"
        return match.group(0)

    processed_content = re.sub(r'!\[([^\]]*)\]\(([^)]+)\)', image_replacer, processed_content)

    # 4. 状态声明徽章（仅对非人工精修、草案状态文档注入）
    header_badge = ""
    if not is_curated:
        header_badge = (
            "> [!NOTE]\n"
            "> **工程状态提示**：本文档由主仓库过程技术记录自动归档生成（原始文件名：`" + source_filename + "`）。"
            "若需查验最新架构基准与使用手册，请查阅系统主文档。\n\n"
        )

    return header_badge + processed_content


def generate_sidebar(categories: list) -> str:
    """生成 _Sidebar.md 多级导航菜单"""
    lines = [
        "# 隧道工程智能排水知识库",
        "",
        "* [[🏠 知识库主页|Home]]",
        "* [[📖 系统双模式部署与使用说明书|Manual-System-Deployment-Guide]]",
        "",
        "---",
    ]

    for cat in categories:
        cat_title = cat.get("title", "知识模块")
        # 避免主页/部署手册在侧边栏重复显示
        pages = [p for p in cat.get("pages", []) if p.get("slug") not in ("Home", "Manual-System-Deployment-Guide")]
        if not pages:
            continue

        lines.append(f"### {cat_title}")
        for page in pages:
            title = page.get("wiki_title", page.get("slug"))
            slug = page.get("slug")
            lines.append(f"* [[{title}|{slug}]]")
        lines.append("")

    return "\n".join(lines)


def generate_home(categories: list, total_pages: int, curated_count: int) -> str:
    """生成 Home.md 体系化知识库门户主页"""
    lines = [
        "# 隧道工程多维协同智能排水自适应平台知识库 (Wiki SSOT)",
        "",
        "> **平台愿景**：融合地质水文数值解算、三维参数化空间拓扑与边缘自适应排水调控，构建面向复杂特长地下水工工程的自主可控智能防排水协同中枢。",
        "",
        "---",
        "",
        "## 🧭 知识体系快速导航",
        "",
        "| 知识领域 | 包含专题与模块 | 核心交付成果 | 快速直达 |",
        "| :--- | :--- | :--- | :--- |",
    ]

    for cat in categories:
        title = cat.get("title", "")
        pages = cat.get("pages", [])
        if not pages:
            continue
        core_links = "、".join([f"[[{p.get('wiki_title')}|{p.get('slug')}]]" for p in pages[:2]])
        total_in_cat = len(pages)
        first_slug = pages[0].get("slug")
        lines.append(f"| **{title}** | 汇编收录 {total_in_cat} 篇专题规范 | {core_links} | [[进入模块|{first_slug}]] |")

    lines.extend([
        "",
        "---",
        "",
        "## 📊 知识资产治理指标",
        f"- **收录词条总数**：{total_pages} 篇高信噪比技术词条",
        f"- **人工精修覆盖**：{curated_count} 篇重点核心篇章（含 12 次迭代精选复盘）",
        "- **同步治理机制**：GitHub Actions 监听主仓库文档变更，自动执行 Markdown 语法净化并部署至 Wiki 独立 Git 仓库",
        "- **工程事实基准 (SSOT)**：所有 Wiki 词条均严格溯源自代码仓库中的验证成果与真实代码实现",
        "",
        "---",
        "",
        "## 🚀 协同开发与角色入口",
        "1. **算法与数值解算协作者**：请优先查阅 [[阶段1：计算引擎对比校验与精度验证|Phase1-Engine-Verification]] 及参数对齐基准。",
        "2. **前端与 3D 渲染协作者**：请参阅 [[阶段4：3D可视化交互工程总体方案|Phase4-3D-Visualization-Overview]] 与 [[12次微观迭代演进全景复盘|Phase4-Evolution-Summary]]。",
        "3. **现场交付与运维团队**：请直达 [[系统双模式部署与使用说明书|Manual-System-Deployment-Guide]] 与 [[阶段6：服务器与桌面独立GUI双模式交付架构|Phase6-Dual-Mode-Delivery-Architecture]]。",
        "",
        "---",
        "*最后构建时间：由 GitHub Actions / 本地构建脚本自动同步生成。*"
    ])

    return "\n".join(lines)


def generate_footer() -> str:
    return (
        "---\n"
        "*隧道工程多维协同智能排水自适应平台 · 知识资产库由 CI/CD 流水线自动维护更新。*\n"
    )


def build_wiki(manifest_path: Path, output_dir: Path, repo_root: Path):
    print(f"[*] 读取知识库编排清单: {manifest_path}")
    manifest = load_manifest(manifest_path)
    settings = manifest.get("settings", {})
    categories = manifest.get("categories", [])
    cdn_prefix = settings.get("asset_cdn_prefix", "https://raw.githubusercontent.com/TREYWANGCQU/-----------------/main")

    output_dir.mkdir(parents=True, exist_ok=True)
    curated_dir = repo_root / "docs" / "wiki"

    # 构建全局映射表
    source_to_slug = {}
    for cat in categories:
        for page in cat.get("pages", []):
            src = page.get("source")
            slug = page.get("slug")
            if src and slug:
                source_to_slug[src] = slug

    total_pages = 0
    curated_count = 0
    processed_slugs = set()

    for cat in categories:
        cat_id = cat.get("id")
        pages = cat.get("pages", [])
        for page in pages:
            src = page.get("source")
            slug = page.get("slug")
            wiki_title = page.get("wiki_title", slug)
            tier = page.get("tier", 2)
            status = page.get("status", "draft")
            is_override = page.get("override", False)

            if not src or not slug:
                continue

            # 判定文件读取路径与优先级
            content = None
            is_curated = (status == "curated")
            curated_candidate = curated_dir / f"{slug}.md"
            override_source = repo_root / src

            if is_override and override_source.exists():
                print(f"[Override] 采用显式覆写精修文件: {src} -> {slug}.md")
                content = override_source.read_text(encoding="utf-8")
                is_curated = True
            elif curated_candidate.exists():
                print(f"[Curated] 命中局部人工精修区: docs/wiki/{slug}.md -> {slug}.md")
                content = curated_candidate.read_text(encoding="utf-8")
                is_curated = True
            else:
                raw_source = repo_root / src
                if raw_source.exists():
                    print(f"[Raw] 读取原始过程文档: {src} -> {slug}.md")
                    content = raw_source.read_text(encoding="utf-8")
                else:
                    print(f"[Warning] 未找到源文件: {src}，跳过该词条")
                    continue

            if is_curated:
                curated_count += 1

            # 净化与格式转换
            sanitized = sanitize_wiki_page(
                content=content,
                source_filename=src,
                wiki_title=wiki_title,
                slug=slug,
                is_curated=is_curated,
                cdn_prefix=cdn_prefix,
                source_to_slug=source_to_slug
            )

            # 写入 Wiki 独立根目录目标文件
            target_path = output_dir / f"{slug}.md"
            target_path.write_text(sanitized, encoding="utf-8")
            processed_slugs.add(slug)
            total_pages += 1

    # 生成导航系统
    print("[*] 正在合成 _Sidebar.md 多级导航树...")
    sidebar_content = generate_sidebar(categories)
    (output_dir / "_Sidebar.md").write_text(sidebar_content, encoding="utf-8")

    print("[*] 正在合成 Home.md 门户聚合主页...")
    home_content = generate_home(categories, total_pages, curated_count)
    (output_dir / "Home.md").write_text(home_content, encoding="utf-8")

    print("[*] 正在生成 _Footer.md 版权信息...")
    (output_dir / "_Footer.md").write_text(generate_footer(), encoding="utf-8")

    print(f"\n[SUCCESS] Wiki 构建完成！共生成 {total_pages} 篇词条 (精选/精修 {curated_count} 篇)，输出目录: {output_dir.resolve()}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="GitHub Wiki 转换与构建引擎")
    parser.add_argument("--manifest", default="docs/wiki-manifest.yml", help="编排清单路径")
    parser.add_argument("--output", default="doc/wiki_staging", help="Wiki 输出目标目录")
    parser.add_argument("--repo-root", default=".", help="代码仓库根目录")
    args = parser.parse_args()

    repo_root = Path(args.repo_root).resolve()
    manifest_path = (repo_root / args.manifest).resolve()
    output_dir = (repo_root / args.output).resolve()

    build_wiki(manifest_path, output_dir, repo_root)
