#!/usr/bin/env python3
"""
删除 MD 文件中的外部导航目录（含 doc.iocoder.cn 链接的行）。
处理 docs/开发参考-md/ 下全部 326 个文件。
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
        if content.startswith('---'):
            parts = content.split('---', 2)
            if len(parts) >= 3:
                fm = parts[1]
                body = parts[2]
            else:
                fm = ''
                body = content
        else:
            fm = ''
            body = content

        # 1. Remove lines containing doc.iocoder.cn (TOC nav)
        lines = body.split('\n')
        filtered = [l for l in lines if 'doc.iocoder.cn' not in l]
        new_body = '\n'.join(filtered)

        # 2. Strip markdown links to yudao.iocoder.cn (multi-line aware, keep link text)
        new_body = re.sub(
            r'\[([\s\S]*?)\]\([^)]*yudao\.iocoder\.cn[^)]*\)',
            r'\1',
            new_body
        )

        # 3. Remove orphan "(opens new window)" noise from stripped links
        new_body = re.sub(r'\n\s*\(opens new window\)', '', new_body)
        new_body = re.sub(r'\(opens new window\)\s*\n', '\n', new_body)

        # 4. Clean up: collapse 3+ blank lines, remove trailing whitespace
        new_body = re.sub(r'\n{3,}', '\n\n', new_body)
        new_body = '\n'.join(l.rstrip() for l in new_body.split('\n'))
        new_body = new_body.strip()

        # Rebuild
        if fm:
            new_content = f"---\n{fm}\n---\n\n{new_body}\n"
        else:
            new_content = new_body + '\n'

        if new_content != content:
            cleaned += 1
            with open(path, 'w', encoding='utf-8') as f:
                f.write(new_content)

if total:
    print(f"Done: {total} files scanned, {cleaned} cleaned (removed doc.iocoder.cn TOC)")
else:
    print(f"No MD files found in {ROOT}")
