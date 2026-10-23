"""Source parser: turns code files into a language-independent structure using Tree-sitter.

Output per file (this is the contract other modules rely on):
{
  "path": "src/click/core.py", "language": "python", "loc": 120, "parse_errors": False,
  "functions": [{"name": "Foo.bar", "start_line": 10, "end_line": 25, "complexity": 4,
                 "is_method": True, "calls": ["print", "helper"]}],
  "classes":   [{"name": "Foo", "start_line": 5, "end_line": 40, "bases": ["Base"], "methods": ["bar"]}],
  "imports":   [{"module": "os.path", "names": [], "level": 0},
                {"module": "utils", "names": ["helper"], "level": 1}]   # level>0 = relative import
}
To add a language (e.g. Java): write an _extract_<lang>(root) function and add it to LANGUAGES.
"""
import os
from pathlib import Path

import tree_sitter_python as tspython
from tree_sitter import Language, Parser

MAX_FILE_BYTES = 1_000_000
SKIP_DIRS = {
    ".git", "node_modules", "venv", ".venv", "env", "__pycache__", "site-packages",
    "build", "dist", ".tox", ".mypy_cache", ".pytest_cache", ".idea", ".vscode",
}


def _text(node) -> str:
    return node.text.decode("utf-8", errors="ignore")


# ======================= Python =======================
_PY_DEFS = {"function_definition", "class_definition"}
_PY_BRANCHES = {
    "if_statement", "elif_clause", "for_statement", "while_statement", "except_clause",
    "boolean_operator", "conditional_expression", "case_clause",
    "for_in_clause", "if_clause",  # comprehensions
}


def _py_complexity_and_calls(body) -> tuple[int, list[str]]:
    """Cyclomatic complexity (1 + decision points) and called names, skipping nested defs."""
    count, calls = 0, set()
    stack = list(body.children) if body is not None else []
    while stack:
        n = stack.pop()
        if n.type in _PY_DEFS:
            continue
        if n.type in _PY_BRANCHES:
            count += 1
        elif n.type == "call":
            fn = n.child_by_field_name("function")
            if fn is not None:
                if fn.type == "identifier":
                    calls.add(_text(fn))
                elif fn.type == "attribute":
                    attr = fn.child_by_field_name("attribute")
                    if attr is not None:
                        calls.add(_text(attr))
        stack.extend(n.children)
    return 1 + count, sorted(calls)


def _py_import(node) -> list[dict]:
    if node.type == "import_statement":
        out = []
        for child in node.children_by_field_name("name"):
            target = child.child_by_field_name("name") if child.type == "aliased_import" else child
            out.append({"module": _text(target), "names": [], "level": 0})
        return out

    # import_from_statement
    mod = node.child_by_field_name("module_name")
    raw = _text(mod) if mod is not None else ""
    level = len(raw) - len(raw.lstrip("."))
    names = []
    for child in node.children_by_field_name("name"):
        target = child.child_by_field_name("name") if child.type == "aliased_import" else child
        names.append(_text(target))
    if any(c.type == "wildcard_import" for c in node.children):
        names.append("*")
    return [{"module": raw.lstrip("."), "names": names, "level": level}]


def _extract_python(root) -> dict:
    functions, classes, imports = [], [], []
    class_by_qual = {}
    # iterative walk (deeply nested code can exceed Python's recursion limit)
    stack = [(root, (), False)]
    while stack:
        node, scope, in_class = stack.pop()
        for child in node.children:
            t = child.type
            if t == "function_definition":
                name = _text(child.child_by_field_name("name"))
                body = child.child_by_field_name("body")
                complexity, calls = _py_complexity_and_calls(body)
                parent = ".".join(scope)
                functions.append({
                    "name": ".".join(scope + (name,)),
                    "start_line": child.start_point[0] + 1,
                    "end_line": child.end_point[0] + 1,
                    "complexity": complexity,
                    "is_method": in_class,
                    "calls": calls,
                })
                if in_class and parent in class_by_qual:
                    class_by_qual[parent]["methods"].append(name)
                stack.append((body, scope + (name,), False))
            elif t == "class_definition":
                name = _text(child.child_by_field_name("name"))
                sup = child.child_by_field_name("superclasses")
                bases = [_text(b) for b in sup.named_children if b.type != "keyword_argument"] if sup else []
                qual = ".".join(scope + (name,))
                entry = {"name": qual, "start_line": child.start_point[0] + 1,
                         "end_line": child.end_point[0] + 1, "bases": bases, "methods": []}
                classes.append(entry)
                class_by_qual[qual] = entry
                stack.append((child.child_by_field_name("body"), scope + (name,), True))
            elif t in ("import_statement", "import_from_statement"):
                imports.extend(_py_import(child))
            else:
                stack.append((child, scope, in_class))
    functions.sort(key=lambda f: f["start_line"])
    classes.sort(key=lambda c: c["start_line"])
    return {"functions": functions, "classes": classes, "imports": imports}


def _count_loc_python(source: str) -> int:
    return sum(1 for ln in source.splitlines() if ln.strip() and not ln.strip().startswith("#"))


# ======================= Registry =======================
LANGUAGES = {
    ".py": {
        "name": "python",
        "language": Language(tspython.language()),
        "extract": _extract_python,
        "loc": _count_loc_python,
    },
    # ".java": {...}  <- add Java here later
}
_parsers: dict[str, Parser] = {}


def _get_parser(ext: str) -> Parser:
    if ext not in _parsers:
        _parsers[ext] = Parser(LANGUAGES[ext]["language"])
    return _parsers[ext]


# ======================= Public API =======================
def parse_source(source: bytes, ext: str, rel_path: str = "") -> dict | None:
    """Parse one file's bytes. Returns None if the extension isn't supported."""
    cfg = LANGUAGES.get(ext)
    if cfg is None:
        return None
    tree = _get_parser(ext).parse(source)
    result = cfg["extract"](tree.root_node)
    return {
        "path": rel_path,
        "language": cfg["name"],
        "loc": cfg["loc"](source.decode("utf-8", errors="ignore")),
        "parse_errors": tree.root_node.has_error,
        **result,
    }


def parse_file(file_path: str | Path, rel_path: str | None = None) -> dict | None:
    p = Path(file_path)
    return parse_source(p.read_bytes(), p.suffix.lower(), rel_path or p.name)


def parse_repository(repo_path: str | Path) -> dict:
    """Walk a cloned repo and parse every supported file."""
    root = Path(repo_path)
    files, skipped = [], 0
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            ext = os.path.splitext(fn)[1].lower()
            if ext not in LANGUAGES:
                continue
            full = Path(dirpath) / fn
            try:
                if full.stat().st_size > MAX_FILE_BYTES:
                    skipped += 1
                    continue
                parsed = parse_source(full.read_bytes(), ext, full.relative_to(root).as_posix())
            except (OSError, ValueError):
                skipped += 1
                continue
            files.append(parsed)
    files.sort(key=lambda f: f["path"])
    return {
        "files": files,
        "skipped": skipped,
        "total_functions": sum(len(f["functions"]) for f in files),
        "total_classes": sum(len(f["classes"]) for f in files),
    }


if __name__ == "__main__":
    # Quick manual test:  python -m app.engine.parser /path/to/cloned/repo
    import sys
    r = parse_repository(sys.argv[1])
    print(f"files={len(r['files'])} functions={r['total_functions']} "
          f"classes={r['total_classes']} skipped={r['skipped']}")
    worst = sorted((fn["complexity"], f["path"], fn["name"]) for f in r["files"] for fn in f["functions"])[-5:]
    for c, path, name in reversed(worst):
        print(f"  complexity {c:>3}  {path}::{name}")