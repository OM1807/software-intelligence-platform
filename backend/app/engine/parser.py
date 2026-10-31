"""Source parser: turns code files into a language-independent structure using Tree-sitter and AST extractors.

Supported languages:
- Python (.py)
- TypeScript / JavaScript (.ts, .tsx, .js, .jsx, .mjs, .cjs)
- Java (.java)

Output per file:
{
  "path": "src/click/core.py", "language": "python", "loc": 120, "parse_errors": False,
  "functions": [{"name": "Foo.bar", "start_line": 10, "end_line": 25, "complexity": 4,
                 "is_method": True, "calls": ["print", "helper"]}],
  "classes":   [{"name": "Foo", "start_line": 5, "end_line": 40, "bases": ["Base"], "methods": ["bar"]}],
  "imports":   [{"module": "os.path", "names": [], "level": 0},
                {"module": "utils", "names": ["helper"], "level": 1}]
}
"""
import os
import re
from pathlib import Path

import tree_sitter_python as tspython
from tree_sitter import Language, Parser

MAX_FILE_BYTES = 1_000_000
SKIP_DIRS = {
    ".git", "node_modules", "venv", ".venv", "env", "__pycache__", "site-packages",
    "build", "dist", ".tox", ".mypy_cache", ".pytest_cache", ".idea", ".vscode",
    "target", ".next", "out",
}


def _text(node) -> str:
    return node.text.decode("utf-8", errors="ignore")


# ======================= Python =======================
_PY_DEFS = {"function_definition", "class_definition"}
_PY_BRANCHES = {
    "if_statement", "elif_clause", "for_statement", "while_statement", "except_clause",
    "boolean_operator", "conditional_expression", "case_clause",
    "for_in_clause", "if_clause",
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
                entry = {
                    "name": qual,
                    "start_line": child.start_point[0] + 1,
                    "end_line": child.end_point[0] + 1,
                    "bases": bases,
                    "methods": [],
                }
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


# ======================= JavaScript / TypeScript =======================
_JS_IMPORT_RE = re.compile(
    r"""(?:import\s+(?:(?:\*\s+as\s+\w+|(?:[\w\s,{}]+))\s+from\s+)?['"]([^'"]+)['"]|require\(['"]([^'"]+)['"]\)|import\(['"]([^'"]+)['"]\))""",
    re.MULTILINE,
)
_JS_FUNC_RE = re.compile(
    r"""(?:(?:export\s+)?(?:default\s+)?(?:async\s+)?function(?:\s+([a-zA-Z0-9_$]+))?\s*\(([^)]*)\)|(?:const|let|var)\s+([a-zA-Z0-9_$]+)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[a-zA-Z0-9_$]+)\s*=>)""",
    re.MULTILINE,
)
_JS_CLASS_RE = re.compile(
    r"""(?:export\s+)?class\s+([a-zA-Z0-9_$]+)(?:\s+extends\s+([a-zA-Z0-9_$]+))?""",
    re.MULTILINE,
)
_JS_BRANCH_RE = re.compile(r"""\b(if|else\s+if|for|while|catch|case|switch)\b|\?|&&|\|\|""")


def _find_block_end(source: str, start_pos: int) -> int:
    """Find the index of the matching closing brace after start_pos."""
    open_brace = source.find("{", start_pos)
    if open_brace == -1:
        nl = source.find("\n", start_pos)
        return nl if nl != -1 else len(source)
    depth = 1
    pos = open_brace + 1
    length = len(source)
    while pos < length and depth > 0:
        ch = source[pos]
        if ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
        elif ch == '"' or ch == "'" or ch == "`":
            quote = ch
            pos += 1
            while pos < length and source[pos] != quote:
                if source[pos] == "\\":
                    pos += 1
                pos += 1
        pos += 1
    return pos


def _extract_js_ts(source_code: str) -> dict:
    functions, classes, imports = [], [], []

    # extract imports
    for m in _JS_IMPORT_RE.finditer(source_code):
        mod = m.group(1) or m.group(2) or m.group(3)
        if mod:
            level = 1 if mod.startswith(".") else 0
            imports.append({"module": mod, "names": [], "level": level})

    # extract classes
    for m in _JS_CLASS_RE.finditer(source_code):
        name = m.group(1)
        base = [m.group(2)] if m.group(2) else []
        start_line = source_code[:m.start()].count("\n") + 1
        end_pos = _find_block_end(source_code, m.start())
        end_line = source_code[:end_pos].count("\n") + 1
        classes.append({
            "name": name,
            "start_line": start_line,
            "end_line": max(start_line, end_line),
            "bases": base,
            "methods": [],
        })

    # extract functions
    for m in _JS_FUNC_RE.finditer(source_code):
        name = m.group(1) or m.group(3) or "anonymous"
        start_line = source_code[:m.start()].count("\n") + 1
        end_pos = _find_block_end(source_code, m.start())
        end_line = source_code[:end_pos].count("\n") + 1
        fn_slice = source_code[m.start():end_pos]
        branches = len(_JS_BRANCH_RE.findall(fn_slice))
        functions.append({
            "name": name,
            "start_line": start_line,
            "end_line": max(start_line, end_line),
            "complexity": 1 + branches,
            "is_method": False,
            "calls": [],
        })

    return {"functions": functions, "classes": classes, "imports": imports}


def _count_loc_c_style(source: str) -> int:
    loc = 0
    in_block = False
    for line in source.splitlines():
        s = line.strip()
        if not s:
            continue
        if in_block:
            if "*/" in s:
                in_block = False
            continue
        if s.startswith("/*"):
            if "*/" not in s:
                in_block = True
            continue
        if s.startswith("//"):
            continue
        loc += 1
    return loc


# ======================= Java =======================
_JAVA_IMPORT_RE = re.compile(r"""^\s*import\s+(?:static\s+)?([a-zA-Z0-9_.*]+);""", re.MULTILINE)
_JAVA_CLASS_RE = re.compile(
    r"""(?:public|protected|private)?\s*(?:static\s+)?(?:final\s+)?(?:abstract\s+)?class\s+([a-zA-Z0-9_$]+)(?:\s+extends\s+([a-zA-Z0-9_$]+))?(?:\s+implements\s+([a-zA-Z0-9_$,\s]+))?""",
    re.MULTILINE,
)
_JAVA_METHOD_RE = re.compile(
    r"""(?:public|protected|private)?\s*(?:static\s+)?(?:final\s+)?(?:synchronized\s+)?(?:<[^>]+>\s+)?[a-zA-Z0-9_<>,\[\]]+\s+([a-zA-Z0-9_$]+)\s*\(([^)]*)\)\s*(?:throws\s+[a-zA-Z0-9_,\s]+)?\s*\{""",
    re.MULTILINE,
)


def _extract_java(source_code: str) -> dict:
    functions, classes, imports = [], [], []
    for m in _JAVA_IMPORT_RE.finditer(source_code):
        mod = m.group(1)
        imports.append({"module": mod, "names": [mod.split(".")[-1]], "level": 0})

    for m in _JAVA_CLASS_RE.finditer(source_code):
        name = m.group(1)
        base = [m.group(2)] if m.group(2) else []
        start_line = source_code[:m.start()].count("\n") + 1
        end_pos = _find_block_end(source_code, m.start())
        end_line = source_code[:end_pos].count("\n") + 1
        classes.append({
            "name": name,
            "start_line": start_line,
            "end_line": max(start_line, end_line),
            "bases": base,
            "methods": [],
        })

    for m in _JAVA_METHOD_RE.finditer(source_code):
        name = m.group(1)
        start_line = source_code[:m.start()].count("\n") + 1
        end_pos = _find_block_end(source_code, m.start())
        end_line = source_code[:end_pos].count("\n") + 1
        method_slice = source_code[m.start():end_pos]
        branches = len(_JS_BRANCH_RE.findall(method_slice))
        functions.append({
            "name": name,
            "start_line": start_line,
            "end_line": max(start_line, end_line),
            "complexity": 1 + branches,
            "is_method": True,
            "calls": [],
        })

    return {"functions": functions, "classes": classes, "imports": imports}


# ======================= Registry =======================
_LANGUAGES = {
    ".py": {
        "name": "python",
        "type": "tree_sitter",
        "language": Language(tspython.language()),
        "extract": _extract_python,
        "loc": _count_loc_python,
    },
    ".ts": {
        "name": "typescript",
        "type": "text",
        "extract": _extract_js_ts,
        "loc": _count_loc_c_style,
    },
    ".tsx": {
        "name": "typescript",
        "type": "text",
        "extract": _extract_js_ts,
        "loc": _count_loc_c_style,
    },
    ".js": {
        "name": "javascript",
        "type": "text",
        "extract": _extract_js_ts,
        "loc": _count_loc_c_style,
    },
    ".jsx": {
        "name": "javascript",
        "type": "text",
        "extract": _extract_js_ts,
        "loc": _count_loc_c_style,
    },
    ".mjs": {
        "name": "javascript",
        "type": "text",
        "extract": _extract_js_ts,
        "loc": _count_loc_c_style,
    },
    ".cjs": {
        "name": "javascript",
        "type": "text",
        "extract": _extract_js_ts,
        "loc": _count_loc_c_style,
    },
    ".java": {
        "name": "java",
        "type": "text",
        "extract": _extract_java,
        "loc": _count_loc_c_style,
    },
}

_parsers: dict[str, Parser] = {}


def _get_parser(ext: str) -> Parser:
    if ext not in _parsers:
        _parsers[ext] = Parser(_LANGUAGES[ext]["language"])
    return _parsers[ext]


# ======================= Public API =======================
def parse_source(source: bytes, ext: str, rel_path: str = "") -> dict | None:
    """Parse one file's bytes. Returns None if the extension isn't supported."""
    cfg = _LANGUAGES.get(ext)
    if cfg is None:
        return None

    text_content = source.decode("utf-8", errors="ignore")
    loc = cfg["loc"](text_content)

    if cfg.get("type") == "tree_sitter":
        tree = _get_parser(ext).parse(source)
        result = cfg["extract"](tree.root_node)
        has_error = tree.root_node.has_error
    else:
        result = cfg["extract"](text_content)
        has_error = False

    return {
        "path": rel_path,
        "language": cfg["name"],
        "loc": loc,
        "parse_errors": has_error,
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
            if ext not in _LANGUAGES:
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
            if parsed:
                files.append(parsed)
    files.sort(key=lambda f: f["path"])
    return {
        "files": files,
        "skipped": skipped,
        "total_functions": sum(len(f["functions"]) for f in files),
        "total_classes": sum(len(f["classes"]) for f in files),
    }
