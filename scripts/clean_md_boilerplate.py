#!/usr/bin/env python3
"""
彻底清洗 MD 文件：切除页头广告区 + 页脚版权区，只保留正文内容。
"""
import os, re, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

ROOT = r"docs/开发参考-md"
total = cleaned = 0

for cat in sorted(os.listdir(ROOT)):
    cat_dir = os.path.join(ROOT, cat)
    if not os.path.isdir(cat_dir): continue
    for fname in sorted(os.listdir(cat_dir)):
        if not fname.endswith('.md'): continue
        path = os.path.join(cat_dir, fname)
        total += 1

        with open(path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Split frontmatter + body
        fm, body = '', content
        if content.startswith('---'):
            parts = content.split('---', 2)
            if len(parts) >= 3:
                fm = parts[1]
                body = parts[2]

        lines = body.split('\n')

        # ── Find content start: first # or ## heading ──
        content_start = 0
        for i, line in enumerate(lines):
            if re.match(r'^#{1,2}\s+\S', line):
                content_start = i
                break

        # ── Find content end: footer boilerplate markers ──
        content_end = len(lines)
        footer_markers = [
            r'Theme by',
            r'Copyright',
            r'MIT License',
            r'^\s*←\s*$',
            r'跟随系统',
            r'浅色模式',
            r'深色模式',
            r'阅读模式',
            r'^\s*×\s*$',
            r'芋道源码',
            # Table cell variants
            r'^\|?\s*Theme by',
            r'^\|?\s*Copyright',
            r'^\|?\s*芋道源码',
            r'^\|?\s*MIT License',
            # Nav rows with doc.iocoder.cn
            r'doc\.iocoder\.cn.*→',
        ]
        for i in range(len(lines) - 1, content_start, -1):
            line = lines[i].strip()
            for marker in footer_markers:
                if re.match(marker, line, re.IGNORECASE):
                    content_end = i
                    break
            if content_end < len(lines):
                break

        # ── Keep only the content section ──
        new_body_lines = lines[content_start:content_end]

        # Clean up: remove standalone link remnants, breadcrumbs, nav rows
        cleaned_lines = []
        for line in new_body_lines:
            # Skip breadcrumb lines (single category names with no other content)
            if re.match(r'^\s*-\s*(开发指南|后端手册|前端手册|中间件手册|工作流手册|大屏手册|支付手册|会员手册|商城手册|ERP\s*手册|CRM\s*手册|MES\s*手册|WMS\s*手册|IM\s*即时通讯|AI\s*大模型|IoT\s*物联网|公众号手册|系统手册|运维手册|萌新必读|更新日志)\s*$', line):
                continue
            # Remove doc.iocoder.cn links (next/prev nav) - strip the link, keep text if any
            line = re.sub(r'\[([^\]]*)\]\(https?://doc\.iocoder\.cn[^)]*\)', r'\1', line)
            # Skip lines that are now just whitespace/punctuation after link removal
            if re.match(r'^\s*[←→]\s*$', line):
                continue
            # Remove leftover half-links like "微服务版](https://...)"
            line = re.sub(r'^[^[]*\]\([^)]+\)$', '', line)
            # Skip empty link-only lines
            if re.match(r'^\s*\[.*\]\(https?://[^)]+\)\s*$', line):
                continue
            cleaned_lines.append(line)

        new_body = '\n'.join(cleaned_lines)
        # Remove [#](#...) heading anchors (inline TOC junk from HTML→MD)
        new_body = re.sub(r'\[#\]\(#[^)]*\)', '', new_body)
        # Remove "(opens new window)" noise
        new_body = re.sub(r'\s*\(opens new window\)', '', new_body)

        new_body = re.sub(r'\n{3,}', '\n\n', new_body)
        new_body = '\n'.join(l.rstrip() for l in new_body.split('\n'))
        new_body = new_body.strip()

        # Rebuild
        if fm:
            new_content = f"---\n{fm}\n---\n\n{new_body}\n"
        else:
            new_content = new_body + '\n'

        with open(path, 'w', encoding='utf-8') as f:
            f.write(new_content)
        cleaned += 1

print(f"Done: {total} files, {cleaned} cleaned")
