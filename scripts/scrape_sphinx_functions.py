#!/usr/bin/env python3
"""
Scrape Sphinx (Python docs-style) function definitions from a documentation URL and
write a JSON file suitable for rendering into HTML or plaintext by tooling (e.g., a ComfyUI node).

Example usage:
    python scripts/scrape_sphinx_functions.py \
        --url https://docs.python.org/3.11/library/os.path.html \
        --out data/os_path_functions.json --pretty

Notes:
- Designed for pages like https://docs.python.org/3.x/library/<module>.html that use Sphinx HTML with
  <dl class="py function"> entries (as in the Python stdlib docs).
- Extracts: id, href, module prefix, name, qualname, signature, params, summary, description (text & HTML).
- Keeps output minimal yet rich enough to be rendered into UI nodes.

Dependencies: requests, beautifulsoup4
"""
from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import asdict, dataclass
from typing import List, Optional
from urllib.parse import urljoin

try:
    import requests
    from bs4 import BeautifulSoup, Tag
except Exception as e:
    print("This script requires 'requests' and 'beautifulsoup4'. Please install them:", file=sys.stderr)
    print("    pip install requests beautifulsoup4", file=sys.stderr)
    raise


@dataclass
class FunctionItem:
    id: str                     # e.g., "os.path.commonprefix"
    href: str                   # absolute URL to the function anchor
    module: str                 # e.g., "os.path"
    name: str                   # e.g., "commonprefix"
    qualname: str               # e.g., "os.path.commonprefix"
    signature: str              # human-readable signature string
    params: List[str]           # list of parameter tokens (best-effort)
    returns: Optional[str]      # textual return annotation if any (best-effort)
    summary: str                # first paragraph under the function
    description_text: str       # full textual description
    description_html: str       # HTML inside the <dd> for richer rendering


@dataclass
class ScrapeResult:
    source_url: str
    module_id: Optional[str]
    scraped_at: float
    items: List[FunctionItem]


def text_of(el: Optional[Tag]) -> str:
    if not el:
        return ""
    return " ".join(el.get_text(" ", strip=True).split())


def html_of(el: Optional[Tag]) -> str:
    if not el:
        return ""
    # Return inner HTML of element
    return "".join(str(child) for child in el.children)


def extract_signature_text(dt: Tag) -> str:
    # Clone approach: get text, drop the trailing paragraph sign from headerlink if present
    raw = dt.get_text("", strip=True)
    # Some Sphinx themes include a "¶"; ensure it's not stuck to signature
    return raw.replace("¶", "").strip()


def extract_params(dt: Tag) -> List[str]:
    params = []
    for em in dt.select("em.sig-param"):
        # The textual content of parameter definition; keep compact
        pname = text_of(em)
        if pname:
            params.append(pname)
    return params


def extract_returns(dt: Tag) -> Optional[str]:
    # Sphinx sometimes includes return annotations in <span class="sig-return"> or after ->
    # Best-effort: look for span.sig-return, else parse arrow in text
    span = dt.select_one("span.sig-return")
    if span:
        t = text_of(span)
        return t or None
    sig_text = extract_signature_text(dt)
    if "->" in sig_text:
        return sig_text.split("->", 1)[-1].strip()
    return None


def extract_module_and_name(dt: Tag) -> tuple[str, str, str]:
    # Determine module/prefix and function name from spans
    pre = dt.select_one("span.sig-prename.descclassname")
    name = dt.select_one("span.sig-name.descname")
    module_prefix = ""
    func_name = ""
    if pre:
        # pre usually contains trailing dot inside a nested span.pre like "os.path."
        module_prefix = text_of(pre).rstrip(".")
    if name:
        func_name = text_of(name)
    # Fallback: parse ID if available
    dt_id = dt.get("id") or ""
    qualname = dt_id if dt_id else (f"{module_prefix}.{func_name}".strip("."))
    if not module_prefix and "." in qualname:
        module_prefix = qualname.rsplit(".", 1)[0]
    if not func_name and "." in qualname:
        func_name = qualname.rsplit(".", 1)[1]
    return module_prefix, func_name, qualname


def parse_functions(soup: BeautifulSoup, base_url: str, module_section_id: Optional[str]) -> List[FunctionItem]:
    root: Tag = soup
    if module_section_id:
        sec = soup.select_one(f"section#{module_section_id}")
        if not sec:
            # Some themes use div[id=module-...] rather than section
            sec = soup.select_one(f"div#{module_section_id}")
        if sec:
            root = sec

    items: List[FunctionItem] = []
    for dl in root.select("dl.py.function"):
        dt = dl.find("dt")
        dd = dl.find("dd")
        if not dt:
            continue

        dt_id = dt.get("id") or ""
        headerlink = dt.select_one("a.headerlink")
        href = urljoin(base_url, headerlink.get("href")) if headerlink and headerlink.has_attr("href") else (
            urljoin(base_url, f"#{dt_id}") if dt_id else base_url
        )

        module_prefix, func_name, qualname = extract_module_and_name(dt)
        signature_text = extract_signature_text(dt)
        params = extract_params(dt)
        returns = extract_returns(dt)

        summary = ""
        description_text = ""
        description_html = ""
        if dd:
            first_p = dd.find("p")
            summary = text_of(first_p)
            description_text = text_of(dd)
            description_html = html_of(dd)

        items.append(FunctionItem(
            id=dt_id or qualname,
            href=href,
            module=module_prefix,
            name=func_name,
            qualname=qualname,
            signature=signature_text,
            params=params,
            returns=returns,
            summary=summary,
            description_text=description_text,
            description_html=description_html,
        ))
    return items


def main(argv: Optional[List[str]] = None) -> int:
    p = argparse.ArgumentParser(description="Scrape Sphinx function definitions from a documentation page.")
    p.add_argument("--url", required=True, help="URL of the Sphinx HTML page (e.g., https://docs.python.org/3.11/library/os.path.html)")
    p.add_argument("--out", required=True, help="Output JSON file path")
    p.add_argument("--module-id", default=None, help="Optional section/div id to scope (e.g., module-os.path)")
    p.add_argument("--pretty", action="store_true", help="Pretty-print the JSON output")
    p.add_argument("--timeout", type=float, default=20.0, help="HTTP timeout in seconds (default 20)")
    args = p.parse_args(argv)

    url = args.url
    out_path = args.out

    try:
        resp = requests.get(url, timeout=args.timeout, headers={
            "User-Agent": "ovum-sphinx-scraper/1.0 (+https://github.com/)"
        })
        resp.raise_for_status()
        # Force UTF-8 decoding for known UTF-8 Sphinx pages (e.g., Python docs),
        # so that characters like non-breaking spaces and en-dashes aren't mis-decoded.
        resp.encoding = "utf-8"
    except Exception as e:
        print(f"Error fetching URL: {e}", file=sys.stderr)
        return 2

    soup = BeautifulSoup(resp.text, "html.parser")

    # Try to infer module section id if not given
    module_id = args.module_id
    if not module_id:
        # Common pattern: section#module-<name>
        sec = soup.select_one("section[id^=module-], div[id^=module-]")
        if sec and isinstance(sec, Tag) and sec.has_attr("id"):
            module_id = sec.get("id")

    items = parse_functions(soup, base_url=url, module_section_id=module_id)

    # If an output file already exists, load it and preserve existing 'returns' values
    # for items where the newly scraped value is missing.
    existing_items_by_id = {}
    try:
        with open(out_path, "r", encoding="utf-8") as f_old:
            old_payload = json.load(f_old)
            if isinstance(old_payload, dict) and isinstance(old_payload.get("items"), list):
                for it in old_payload.get("items", []):
                    if isinstance(it, dict):
                        iid = it.get("id") or it.get("qualname")
                        if iid:
                            existing_items_by_id[iid] = it
    except FileNotFoundError:
        pass
    except Exception:
        # If parsing old file fails, just ignore and proceed
        existing_items_by_id = {}

    # Apply preservation logic
    if existing_items_by_id:
        for idx, item in enumerate(items):
            iid = item.id or item.qualname
            old = existing_items_by_id.get(iid)
            if old is not None:
                old_ret = old.get("returns") if isinstance(old, dict) else None
                if (item.returns is None or (isinstance(item.returns, str) and item.returns.strip() == "")) and old_ret:
                    # preserve non-empty existing returns
                    items[idx].returns = old_ret

    result = ScrapeResult(
        source_url=url,
        module_id=module_id,
        scraped_at=time.time(),
        items=items,
    )

    payload = {
        "source_url": result.source_url,
        "module_id": result.module_id,
        "scraped_at": result.scraped_at,
        "items": [asdict(item) for item in result.items],
    }

    try:
        with open(out_path, "w", encoding="utf-8") as f:
            if args.pretty:
                json.dump(payload, f, ensure_ascii=False, indent=2)
            else:
                json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
    except Exception as e:
        print(f"Error writing output file '{out_path}': {e}", file=sys.stderr)
        return 3

    print(f"Wrote {len(items)} function definitions to {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
