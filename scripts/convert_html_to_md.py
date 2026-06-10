#!/usr/bin/env python3
"""
重新转换 YUDAO HTML → Markdown。
只提取正文内容（跳过 header/sidebar/footer/buttons 等广告区）。
"""
import os, re, base64, hashlib, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

from bs4 import BeautifulSoup, NavigableString, Tag
from markdownify import markdownify as md_convert

HTML_DIR = r"D:/codex/YUDAO/ruoyi-vue-pro-cleaned"
MD_OUT = r"docs/开发参考-md"
IMG_OUT = r"frontend/public/knowledge-images"

os.makedirs(IMG_OUT, exist_ok=True)
os.makedirs(MD_OUT, exist_ok=True)

total = ok = img_total = 0

BOILERPLATE_SELECTORS = [
    'header', 'nav', 'aside', 'footer',
    '.navbar', '.sidebar', '.sidebar-mask', '.sidebar-hover-trigger',
    '.footer', '.buttons', '.custom-html-window',
    '.page-nav', '.page-edit', '.table-of-contents',
    'script', 'style', 'noscript', 'iframe',
]

def extract_content(soup):
    """只保留正文内容，删除所有广告/导航/侧边栏"""
    # Remove boilerplate elements
    for sel in BOILERPLATE_SELECTORS:
        for el in soup.select(sel):
            el.decompose()

    # Find the main content: either .theme-container > div (unnamed) or .page
    body = soup.body if soup.body else soup
    content = None

    # Try .theme-container first
    tc = body.select_one('.theme-container')
    if tc:
        # Get the unnamed divs (those without class) inside theme-container
        content_divs = []
        for child in tc.find_all(recursive=False):
            if isinstance(child, Tag):
                cls = child.get('class', [])
                if not cls:  # unnamed div = content
                    content_divs.append(child)
        if content_divs:
            # Use the largest unnamed div (by text length)
            content = max(content_divs, key=lambda d: len(d.get_text()))
    if not content:
        content = body

    # Clean up remaining noise: empty divs, orphan text
    for el in content.select('div'):
        if not el.get_text(strip=True) and not el.find('img'):
            el.decompose()

    return content


for cat_name in sorted(os.listdir(HTML_DIR)):
    cat_dir = os.path.join(HTML_DIR, cat_name)
    if not os.path.isdir(cat_dir): continue
    md_cat_dir = os.path.join(MD_OUT, cat_name)
    os.makedirs(md_cat_dir, exist_ok=True)

    for fname in sorted(os.listdir(cat_dir)):
        if not fname.endswith(('.html', '.htm')): continue
        total += 1
        src = os.path.join(cat_dir, fname)

        try:
            with open(src, 'r', encoding='utf-8', errors='ignore') as f:
                html = f.read()
            soup = BeautifulSoup(html, 'html.parser')

            # ── Title ──
            title = None
            if soup.title: title = soup.title.get_text(strip=True)
            if title: title = re.sub(r'\s*\|\s*ruoyi-vue-pro.*$', '', title).strip()
            if not title:
                title = re.sub(r'\.html?$', '', fname)
                title = re.sub(r' _ ruoyi-vue-pro.*$', '', title).strip()

            # ── Images ──
            for img in soup.find_all('img'):
                src_attr = img.get('src', '')
                if src_attr.startswith('data:image/'):
                    img_total += 1
                    header, b64data = src_attr.split(',', 1)
                    ext = 'png'
                    if 'jpeg' in header or 'jpg' in header: ext = 'jpg'
                    elif 'gif' in header: ext = 'gif'
                    elif 'svg' in header: ext = 'svg'
                    elif 'webp' in header: ext = 'webp'
                    try:
                        data = base64.b64decode(b64data)
                    except: continue
                    h = hashlib.sha256(data).hexdigest()[:12]
                    img_name = f"{h}.{ext}"
                    img_path = os.path.join(IMG_OUT, img_name)
                    if not os.path.exists(img_path):
                        with open(img_path, 'wb') as fimg: fimg.write(data)
                    img['src'] = f'/knowledge-images/{img_name}'
                    for attr in ['style', 'width', 'height']:
                        if img.has_attr(attr): del img[attr]

            # ── Extract content only ──
            content_el = extract_content(soup)
            body_html = str(content_el)

            # ── Convert to Markdown ──
            md_body = md_convert(body_html, heading_style="ATX", bullets="-")
            md_body = re.sub(r'\n{3,}', '\n\n', md_body)
            md_body = md_body.strip()

            # ── Frontmatter ──
            fm = f"---\ntitle: {title}\ncategory: {cat_name}\n---\n\n"
            output = fm + md_body + '\n'

            safe_title = re.sub(r'[\\/*?:"<>|]', '-', title)[:80]
            md_path = os.path.join(md_cat_dir, f"{safe_title}.md")
            with open(md_path, 'w', encoding='utf-8') as fout:
                fout.write(output)

            ok += 1
            if total % 20 == 0:
                print(f"  Progress: {total} files, {ok} ok, {img_total} images")

        except Exception as e:
            print(f"  FAIL {cat_name}/{fname}: {e}")

print(f"\nDone: {total} total, {ok} converted, {img_total} images extracted")
