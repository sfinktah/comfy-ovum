# scripts/sync_pyproject_from_requirements.py
import re
import sys
from pathlib import Path

# noinspection PyCompatibility
import tomllib  # Python 3.11+

try:
    # noinspection PyUnusedImports
    import tomli_w  # writer
except ImportError:
    print(
        "ERROR: Missing dependency 'tomli-w'.\n"
        "Install it into your project's virtualenv:\n"
        "  pip install tomli-w\n"
        "Then add it to your requirements.txt (and/or pyproject.toml) so others have it too."
    )
    sys.exit(2)

REQ_LINE_RE = re.compile(r"^\s*([A-Za-z0-9_.\-]+)\s*(\[.*\])?\s*([<>=!~]=?.*)?\s*(?:#.*)?$")


# noinspection PyCompatibility
def parse_req(line: str) -> str | None:
    line = line.strip()
    if not line or line.startswith("#") or line.startswith("-r "):
        return None
    m = REQ_LINE_RE.match(line)
    if not m:
        return None
    name, extras, spec = m.groups()
    extras = extras or ""
    spec = spec or ""
    return f"{name}{extras}{spec}".strip()

def load_requirements(path: Path) -> list[str]:
    reqs: list[str] = []
    for raw in path.read_text(encoding="utf-8").splitlines():
        parsed = parse_req(raw)
        if parsed:
            # Filter out tomllib and tomli_w to avoid duplication
            pkg_name = dep_key(parsed)
            if pkg_name not in ("tomllib", "tomli-w"):
                reqs.append(parsed)
    return reqs

def normalize_name(s: str) -> str:
    return re.sub(r"[-_.]+", "-", s).lower()

def dep_key(dep: str) -> str:
    name = dep.split(";")[0].strip()
    if "[" in name:
        name = name.split("[", 1)[0]
    name = re.split(r"[<>=!~ ]", name, 1)[0]
    return normalize_name(name)

def main(pyproject_path="pyproject.toml", requirements_path="requirements.txt"):
    pyproject = Path(pyproject_path)
    reqfile = Path(requirements_path)

    if not pyproject.exists() or not reqfile.exists():
        print("pyproject.toml and requirements.txt must both exist.")
        return 1

    data = tomllib.loads(pyproject.read_text(encoding="utf-8"))
    project = data.setdefault("project", {})
    deps: list[str] = project.setdefault("dependencies", [])

    reqs = load_requirements(reqfile)

    dep_map = {dep_key(d): d for d in deps}
    req_map = {dep_key(r): r for r in reqs}

    changed = False
    for k, v in req_map.items():
        if dep_map.get(k) != v:
            dep_map[k] = v
            changed = True

    merged = list(dep_map.values())
    merged.sort(key=lambda s: dep_key(s))

    if merged != deps:
        project["dependencies"] = merged
        changed = True

    if changed:
        pyproject.write_text(tomli_w.dumps(data), encoding="utf-8")
        print(f"Updated {pyproject_path} [project].dependencies from {requirements_path}")
        return 0
    else:
        print("No changes to pyproject.toml")
        return 0

if __name__ == "__main__":
    raise SystemExit(main())
