# Mini webserver route for serving files under /web as /ovum/web/*
# Uses ComfyUI PromptServer routes (aiohttp).

from __future__ import annotations

import html
import mimetypes
import posixpath
from pathlib import Path

# noinspection PyPackageRequirements
from aiohttp import web
from markdown_it import MarkdownIt
# noinspection PyUnresolvedReferences,PyPackageRequirements
from server import PromptServer

# Base directory for serving
MODULE_DIR = Path(__file__).resolve().parent
WEB_DIR = MODULE_DIR / "web"

# Ensure mimetypes has some common types on Windows
mimetypes.add_type("text/markdown", ".md")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("application/javascript", ".js")


def _is_subpath(child: Path, parent: Path) -> bool:
    try:
        child.resolve().relative_to(parent.resolve())
        return True
    except Exception:
        return False


def _markdown_to_html(md_text: str) -> str:
    # Render Markdown using markdown-it-py with GFM-like features
    md = MarkdownIt("commonmark", {"linkify": True, "typographer": True})
    md.enable("table")
    md.enable("strikethrough")
    body = md.render(md_text)
    return f"""
<!doctype html>
<html lang="en"><head>
<meta charset='utf-8'>
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>README</title>
<link rel="stylesheet" href="/ovum/web/css/base.css">
<link rel="stylesheet" href="/ovum/web/css/markdown.css">
</head><body>
{body}
</body></html>
"""


def _directory_listing(base_url: str, directory: Path, rel: Path) -> web.Response:
    items = []
    try:
        for entry in sorted(directory.iterdir(), key=lambda p: (p.is_file(), p.name.lower())):
            name = entry.name + ("/" if entry.is_dir() else "")
            link = posixpath.join(base_url.rstrip('/'), *(rel.parts + (entry.name,)))
            items.append(f"<li><a href='{html.escape(link)}'>{html.escape(name)}</a></li>")
    except Exception as e:
        items.append(f"<li>Error reading directory: {html.escape(str(e))}</li>")
    escaped_rel = html.escape(str(rel).replace('\\', '/'))
    items_html = "\n" + "\n".join(items)
    body = f"""
<!doctype html>
<html lang="en"><head>
<meta charset='utf-8'><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Index of /{escaped_rel}</title>
<link rel="stylesheet" href="/ovum/web/css/base.css">
</head><body>
<h1>Index of /{escaped_rel}</h1>
<ul>
{items_html}
</ul>
</body></html>
"""
    return web.Response(text=body, content_type="text/html")


@PromptServer.instance.routes.get('/ovum/web/{tail:.*}')
async def ovum_web(request: web.Request):
    # tail may be empty or a path under web
    tail = request.match_info.get('tail', '')
    # Normalize to Path using POSIX-style incoming paths; prevent traversal
    safe_tail = Path(*(p for p in Path(tail).parts if p not in ("..","") ))
    target = (WEB_DIR / safe_tail).resolve()

    # Enforce sandbox under WEB_DIR
    if not _is_subpath(target, WEB_DIR):
        return web.Response(status=403, text="Forbidden")

    # If target is directory, attempt index.html or readme.md
    if target.is_dir():
        index_html = target / 'index.html'
        readme_md = target / 'readme.md'
        readme_MD = target / 'README.md'
        if index_html.is_file():
            return web.FileResponse(path=index_html)
        if readme_md.is_file() or readme_MD.is_file():
            p = readme_md if readme_md.is_file() else readme_MD
            try:
                text = p.read_text(encoding='utf-8', errors='ignore')
            except Exception:
                text = p.read_text(errors='ignore')
            html_doc = _markdown_to_html(text)
            return web.Response(text=html_doc, content_type='text/html')
        # else show directory listing
        base_url = '/ovum/web'
        rel = target.relative_to(WEB_DIR)
        return _directory_listing(base_url, target, rel)

    # If file, serve file or 404
    if target.is_file():
        # FileResponse sets content-type using mimetypes
        return web.FileResponse(path=target)

    # If path didn't exist but tail is empty (i.e., root), treat as directory listing of WEB_DIR
    if tail.strip() == "":
        base_url = '/ovum/web'
        return _directory_listing(base_url, WEB_DIR, Path('.'))

    return web.Response(status=404, text="Not Found")
