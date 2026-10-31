"""Dependency graph: resolve imports to repo files, build a NetworkX graph, compute graph metrics.

Input : the list of parsed files from parser.parse_repository()["files"]
Output: build_dependency_graph(files) -> {
    "edges":   [(source_path, target_path, weight), ...],   # source imports target
    "metrics": {path: {"fan_in", "fan_out", "centrality", "instability", "in_cycle"}},
    "cycles":  [[path, ...], ...],                           # circular-dependency groups, biggest first
    "stats":   {"nodes", "edges", "cycles", "files_in_cycles", "isolated", "avg_fan_out"},
}

Edge direction: A -> B means "A imports B", so B's fan_in = number of files that depend on B.
"""
import posixpath
from collections import defaultdict

import networkx as nx

MAX_CYCLES_STORED = 50


# ======================= Python import resolver =======================
class PythonResolver:
    """Maps import statements to .py files that exist inside the repo."""

    def __init__(self, paths: list[str]):
        self.paths = set(paths)
        self.module_to_path: dict[str, str] = {}
        self._index(sorted(paths))

    def _index(self, paths: list[str]) -> None:
        for path in paths:
            parts = path.split("/")
            dirs, filename = parts[:-1], parts[-1]
            is_init = filename == "__init__.py"
            stem = filename[:-3] if filename.endswith(".py") else filename
            full_parts = dirs + ([] if is_init else [stem])
            # Index all suffix forms: e.g. for backend/app/engine/parser.py:
            # - backend.app.engine.parser
            # - app.engine.parser
            # - engine.parser
            # - parser
            for i in range(len(full_parts)):
                dotted = ".".join(full_parts[i:])
                if dotted not in self.module_to_path or len(path) < len(self.module_to_path[dotted]):
                    self.module_to_path[dotted] = path

    def _file_for(self, parts: list[str]) -> str | None:
        base = "/".join(parts)
        for candidate in ([f"{base}.py"] if parts else []) + [posixpath.join(base, "__init__.py")]:
            if candidate in self.paths:
                return candidate
        return None

    def resolve(self, src_path: str, imp: dict) -> list[str]:
        module = imp.get("module", "")
        names = imp.get("names", [])
        level = imp.get("level", 0)
        real_names = [n for n in names if n != "*"]

        if level > 0:
            base = src_path.split("/")[:-1]
            up = level - 1
            if up > len(base):
                return []
            if up > 0:
                base = base[:-up]
            pkg_dir = base + (module.split(".") if module else [])
            hits = [h for n in real_names if (h := self._file_for(pkg_dir + [n]))]
            if not hits and (h := self._file_for(pkg_dir)):
                hits = [h]
            return hits

        # Absolute import (level == 0)
        # 1. from pkg import mod where mod is mod.py inside pkg
        hits = []
        for n in real_names:
            sub = f"{module}.{n}" if module else n
            if sub in self.module_to_path:
                hits.append(self.module_to_path[sub])
        if hits:
            return hits

        # 2. from pkg.mod import func or import pkg.mod
        if module in self.module_to_path:
            return [self.module_to_path[module]]

        # 3. Fallback: longest matching dotted prefix
        parts = module.split(".")
        while parts:
            hit = self.module_to_path.get(".".join(parts))
            if hit:
                return [hit]
            parts.pop()

        return []


# ======================= JS / TS import resolver =======================
class JavaScriptResolver:
    """Maps import / require statements in JS/TS to repo files."""

    def __init__(self, paths: list[str]):
        self.paths = set(paths)
        self.src_prefixes = set()
        for p in paths:
            if "src/" in p:
                self.src_prefixes.add(p.split("src/")[0] + "src/")

    def resolve(self, src_path: str, imp: dict) -> list[str]:
        mod = imp.get("module", "").strip()
        if not mod:
            return []

        candidates = []
        if mod.startswith("."):
            curr_dir = posixpath.dirname(src_path)
            candidates.append(posixpath.normpath(posixpath.join(curr_dir, mod)))
        elif mod.startswith("@/") or mod.startswith("~/"):
            rel = mod[2:]
            if "src/" in src_path:
                prefix = src_path.split("src/")[0] + "src/"
                candidates.append(posixpath.normpath(posixpath.join(prefix, rel)))
            for prefix in self.src_prefixes:
                candidates.append(posixpath.normpath(posixpath.join(prefix, rel)))
            candidates.append(posixpath.normpath(posixpath.join("src", rel)))
            candidates.append(rel)
        else:
            curr_dir = posixpath.dirname(src_path)
            candidates.append(posixpath.normpath(posixpath.join(curr_dir, mod)))
            if "src/" in src_path:
                prefix = src_path.split("src/")[0] + "src/"
                candidates.append(posixpath.normpath(posixpath.join(prefix, mod)))
            candidates.append(mod)

        extensions = ["", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", "/index.ts", "/index.tsx", "/index.js", "/index.jsx"]
        for cand in candidates:
            for ext in extensions:
                target = cand + ext
                if target in self.paths:
                    return [target]
        return []


# ======================= Java import resolver =======================
class JavaResolver:
    """Maps Java import statements to repo files."""

    def __init__(self, paths: list[str]):
        self.paths = set(paths)
        self.stem_map: dict[str, list[str]] = defaultdict(list)
        for p in paths:
            stem = posixpath.splitext(posixpath.basename(p))[0]
            self.stem_map[stem].append(p)

    def resolve(self, src_path: str, imp: dict) -> list[str]:
        mod = imp.get("module", "").strip()
        if not mod:
            return []
        as_path = mod.replace(".", "/") + ".java"
        for p in self.paths:
            if p.endswith(as_path):
                return [p]
        simple_name = mod.split(".")[-1]
        matches = self.stem_map.get(simple_name, [])
        return matches[:1]


RESOLVERS = {
    "python": PythonResolver,
    "typescript": JavaScriptResolver,
    "javascript": JavaScriptResolver,
    "java": JavaResolver,
}


# ======================= Graph metrics =======================
def _pagerank(G: nx.DiGraph, damping: float = 0.85, iters: int = 100, tol: float = 1e-8) -> dict[str, float]:
    """Plain power-iteration PageRank."""
    nodes = list(G)
    n = len(nodes)
    if n == 0:
        return {}
    rank = {v: 1.0 / n for v in nodes}
    out_deg = {v: G.out_degree(v) for v in nodes}
    for _ in range(iters):
        dangling = sum(rank[v] for v in nodes if out_deg[v] == 0)
        new = {v: (1 - damping) / n + damping * dangling / n for v in nodes}
        for v in nodes:
            if out_deg[v]:
                share = damping * rank[v] / out_deg[v]
                for w in G.successors(v):
                    new[w] += share
        diff = sum(abs(new[v] - rank[v]) for v in nodes)
        rank = new
        if diff < tol:
            break
    return rank


def build_dependency_graph(files: list[dict]) -> dict:
    G = nx.DiGraph()
    G.add_nodes_from(f["path"] for f in files)

    # For JS/TS, share all JS/TS files
    paths_by_lang: dict[str, list[str]] = defaultdict(list)
    for f in files:
        lang = f["language"]
        if lang in ("typescript", "javascript"):
            paths_by_lang["typescript"].append(f["path"])
            paths_by_lang["javascript"].append(f["path"])
        else:
            paths_by_lang[lang].append(f["path"])

    resolvers = {lang: RESOLVERS[lang](paths) for lang, paths in paths_by_lang.items() if lang in RESOLVERS}

    for f in files:
        resolver = resolvers.get(f["language"])
        if resolver is None:
            continue
        for imp in f.get("imports", []):
            for target in resolver.resolve(f["path"], imp):
                if target == f["path"]:
                    continue
                if G.has_edge(f["path"], target):
                    G[f["path"]][target]["weight"] += 1
                else:
                    G.add_edge(f["path"], target, weight=1)

    cycles = sorted(
        (sorted(c) for c in nx.strongly_connected_components(G) if len(c) > 1),
        key=lambda c: (-len(c), c[0]),
    )
    in_cycle = {p for c in cycles for p in c}

    pr = _pagerank(G)
    top = max(pr.values(), default=0) or 1.0

    metrics = {}
    for p in G:
        fi, fo = G.in_degree(p), G.out_degree(p)
        metrics[p] = {
            "fan_in": fi,
            "fan_out": fo,
            "centrality": round(pr[p] / top, 4),
            "instability": round(fo / (fi + fo), 3) if fi + fo else 0.0,
            "in_cycle": p in in_cycle,
        }

    n = G.number_of_nodes()
    stats = {
        "nodes": n,
        "edges": G.number_of_edges(),
        "cycles": len(cycles),
        "files_in_cycles": len(in_cycle),
        "isolated": sum(1 for m in metrics.values() if m["fan_in"] == 0 and m["fan_out"] == 0),
        "avg_fan_out": round(G.number_of_edges() / n, 2) if n else 0.0,
    }
    return {
        "edges": [(s, t, d["weight"]) for s, t, d in G.edges(data=True)],
        "metrics": metrics,
        "cycles": cycles[:MAX_CYCLES_STORED],
        "stats": stats,
    }
