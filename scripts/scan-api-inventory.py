#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
接口全景扫描器 —— 产出「模块 / HTTP / 路径 / Controller.方法 / 权限守卫 / 保护形态 / 调用方」。

用途：
  1. 为 AI 对话操作网关的工具链设计提供输入
  2. 为 /console/admin/api-docs 页面补上运行时反射拿不到的三列（权限、调用方、正确模块归属）

为什么不能用 AdminDocsController 的运行时反射代替：
  - 权限判定写在方法体里（40 种 requireXxx 助手 + 内联 RoleEnum 比较），反射拿不到
  - 调用方信息只存在于前端代码，运行时无从得知
  - 它按路径第 3 段猜模块，/api/admin/twin/... 会被归成 admin

用法：
  python scripts/scan-api-inventory.py [输出路径]
  默认输出到 docs/02-设计存档/计划文档/2026-10-08-接口全景-数据附表.tsv
"""
import os
import re
import sys
import collections

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
JAVA = os.path.join(REPO, "src", "main", "java")
FE = os.path.join(REPO, "frontend", "src")
MP = os.path.join(REPO, "aroapp", "miniprogram")

DEFAULT_OUT = os.path.join(
    REPO, "docs", "02-设计存档", "计划文档", "2026-10-08-接口全景-数据附表.tsv"
)

# --- 前端 HTTP 客户端的 baseURL（见 frontend/src/api/core/*.ts） ---
CLIENT_BASE = {
    "authHttp": "/api",
    "publicHttp": "/api",
    "adminHttp": "/api/admin",
    "http": "/api/v1/twin",
}

# --- 权限守卫的五种写法 ---
GUARD_PATTERNS = [
    (re.compile(r"require([A-Za-z]+)\s*\("), "helper"),
    (re.compile(r"getRole\(\)\s*\.\s*getLevel\(\)"), "inline-level"),
    (re.compile(r"isSuperAdmin\s*\("), "inline-superadmin"),
    (re.compile(r"isAdmin\s*\("), "inline-admin"),
    (re.compile(r"RoleEnum\.([A-Z_]+)"), "role-enum"),
]

MAPPING_RE = re.compile(r"@(Get|Post|Put|Delete|Patch|Request)Mapping\b")
CALL_RE = re.compile(
    r"\b(authHttp|adminHttp|publicHttp|http)\s*\.\s*(get|post|put|delete|patch)"
    r"\b[^(]{0,300}?\(\s*[`'\"]([^`'\"]+)[`'\"]"
)
# 小程序两种写法：request({url: '/api/...'}) 与裸字符串字面量 '/api/v1/...'
MP_URL_RES = [
    re.compile(r"url\s*:\s*([`'\"])((?:/api|/v1)[^`'\"]*)\1"),
    re.compile(r"([`'\"])((?:/api/v1|/api/admin|/api)/[a-zA-Z][^`'\"]*)\1"),
]


def _args_of(text):
    """text 形如 '@GetMapping(...)'；返回括号内文本，裸注解（无括号）返回 None。"""
    start = text.find("(")
    if start < 0:
        return None
    depth = 0
    for i in range(start, len(text)):
        if text[i] == "(":
            depth += 1
        elif text[i] == ")":
            depth -= 1
            if depth == 0:
                return text[start + 1 : i]
    return text[start + 1 :]


def _first_string(text):
    if text is None:
        return ""
    m = re.search(r'"([^"]*)"', text)
    return m.group(1) if m else ""


def _scan_backend_routes():
    """扫描全部 *Controller.java -> (module, controller, java_method, http, path, guards)"""
    rows = []
    for dirpath, _, files in os.walk(JAVA):
        for fn in files:
            if not fn.endswith("Controller.java"):
                continue
            full_path = os.path.join(dirpath, fn)
            lines = open(full_path, encoding="utf-8", errors="replace").read().split("\n")
            rel = os.path.relpath(full_path, JAVA).replace("\\", "/")
            m = re.search(r"modules/([^/]+)", rel)
            module = m.group(1) if m else "(other)"

            # 类级基础路径：紧邻 class 声明的那个 @RequestMapping
            base = ""
            for i, ln in enumerate(lines):
                if ln.strip().startswith("@RequestMapping") and re.search(
                    r"\bclass\s+\w+Controller", "\n".join(lines[i : i + 6])
                ):
                    base = _first_string(_args_of(ln.strip()))
                    break

            for i, ln in enumerate(lines):
                st = ln.strip()
                mm = MAPPING_RE.match(st)
                if not mm:
                    continue
                verb = mm.group(1)
                args = _args_of(st)
                # 多行注解：续行拼接
                if args is not None and ")" not in st[st.find("(") :]:
                    j = i + 1
                    while j < len(lines) and j < i + 4:
                        args += " " + lines[j]
                        if ")" in lines[j]:
                            break
                        j += 1
                path = _first_string(args)  # 裸映射 -> ""
                if verb == "Request":
                    m2 = re.search(r"RequestMethod\.([A-Z]+)", args or "")
                    http = m2.group(1) if m2 else "ANY"
                else:
                    http = verb.upper()

                # Java 方法名；找不到说明是类级注解，跳过
                java_method = ""
                for j in range(i, min(i + 8, len(lines))):
                    m3 = re.search(
                        r"(?:public|private|protected)\s+[\w<>\[\],\s\?\.]+\s+(\w+)\s*\(",
                        lines[j],
                    )
                    if m3:
                        java_method = m3.group(1)
                        break
                if not java_method:
                    continue

                body = "\n".join(lines[i : i + 55])
                found = []
                for rx, kind in GUARD_PATTERNS:
                    for g in set(rx.findall(body)):
                        if kind in ("helper", "role-enum"):
                            found.append(f"{kind}:{g}")
                        else:
                            found.append(kind)

                full = (
                    (base.rstrip("/") + "/" + path.lstrip("/")).replace("//", "/")
                    if path
                    else base
                )
                rows.append(
                    (module, fn[:-5], java_method, http, full, "|".join(sorted(set(found))))
                )
    return sorted(set(rows))


def _normalize(url):
    url = re.sub(r"\?.*$", "", url)
    url = re.sub(r"\$\{[^}]*\}", "{p}", url)  # 模板变量 -> 单段通配
    return url.replace("//", "/").rstrip("/") or "/"


def _path_regex(path):
    escaped = re.escape(re.sub(r"\{[^}]*\}", "\x00", _normalize(path)))
    return re.compile("^" + escaped.replace("\x00", "[^/]+") + "$")


def _scan_frontend_calls():
    """扫描 frontend/src 全部 ts/tsx -> (area, source, client, http, path)"""
    rows = []
    for dirpath, _, files in os.walk(FE):
        if "node_modules" in dirpath or "__tests__" in dirpath:
            continue
        for fn in files:
            if not fn.endswith((".ts", ".tsx")):
                continue
            full_path = os.path.join(dirpath, fn)
            txt = open(full_path, encoding="utf-8", errors="replace").read()
            rel = os.path.relpath(full_path, FE).replace("\\", "/")
            parts = rel.split("/")
            if parts[0] == "features" and len(parts) > 1:
                area = "features/" + parts[1]
            elif parts[0] == "api":
                area = "api"
            else:
                area = parts[0]
            for client, verb, path in CALL_RE.findall(txt):
                rows.append((area, rel, client, verb.upper(), path))
    return sorted(set(rows))


def _scan_miniprogram_calls():
    """扫描 aroapp/miniprogram -> (package, url)"""
    rows = []
    for dirpath, _, files in os.walk(MP):
        if "node_modules" in dirpath:
            continue
        for fn in files:
            if not fn.endswith((".js", ".wxml")):
                continue
            full_path = os.path.join(dirpath, fn)
            txt = open(full_path, encoding="utf-8", errors="replace").read()
            pkg = os.path.relpath(full_path, MP).replace("\\", "/").split("/")[0]
            for rx in MP_URL_RES:
                for _, url in rx.findall(txt):
                    rows.append((pkg, url))
    return sorted(set(rows))


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else DEFAULT_OUT

    backend = _scan_backend_routes()
    fe = _scan_frontend_calls()
    mp = _scan_miniprogram_calls()

    compiled = [(r, _path_regex(r[4])) for r in backend]

    callers = collections.defaultdict(lambda: {"web": set(), "mp": set()})
    for area, _src, client, _http, raw in fe:
        p = _normalize(raw)
        base = CLIENT_BASE.get(client, "/api")
        full = p if p.startswith("/api") else base + ("" if p.startswith("/") else "/") + p
        for row, rx in compiled:
            if rx.match(full):
                callers[tuple(row)]["web"].add(area)
    for pkg, raw in mp:
        p = _normalize(raw)
        full = p if p.startswith("/api") else "/api" + ("" if p.startswith("/") else "/") + p
        for row, rx in compiled:
            if rx.match(full):
                callers[tuple(row)]["mp"].add(pkg)

    os.makedirs(os.path.dirname(out_path), exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        f.write("模块\tHTTP\t路径\tController.方法\t权限守卫\t保护形态\tWeb调用方\t小程序调用方\n")
        for row in backend:
            module, _ctrl, java_method, http, path, guards = row
            c = callers.get(tuple(row), {"web": set(), "mp": set()})
            if guards:
                cls = "角色守卫"
            elif c["web"] or c["mp"]:
                cls = "需复核"
            else:
                cls = "无调用方"
            f.write(
                "\t".join(
                    [
                        module,
                        http,
                        path,
                        java_method,
                        guards,
                        cls,
                        ",".join(sorted(c["web"])),
                        ",".join(sorted(c["mp"])),
                    ]
                )
                + "\n"
            )

    stats = collections.Counter(
        "角色守卫" if r[5] else ("需复核" if callers.get(tuple(r)) else "无调用方")
        for r in backend
    )
    print(f"路由 {len(backend)} 条 | " + " | ".join(f"{k} {v}" for k, v in stats.most_common()))
    print(f"前端调用 {len(fe)} 处 | 小程序 {len(mp)} 条")
    print(f"已写出 {out_path}")


if __name__ == "__main__":
    main()
