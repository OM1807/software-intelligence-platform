"""Dependency graph: resolve imports to repo files, build a NetworkX graph, compute graph metrics.

Input : the list of parsed files from parser.parse_repository()["files"]
Output: build_dependency_graph(files) -> {
    "edges":   [(source_path, target_path, weight), ...],   # source imports target
    "metrics": {path: {"fan_in", "fan_out", "centrality", "instability", "in_cycle"}},
    "cycles":  [[path, ...], ...],                           # circular-dependency groups, biggest first
    "stats":   {"nodes", "edges", "cycles", "files_in_cycles", "isolated", "avg_fan_out"},
}

Edge direction: A -> B means "A imports B", so B's fan_in = number of files that depend on B.

To add a language (e.g. Java): write a resolver class with __init__(paths) and
resolve(src_path, imp) -> list[str], then register it in RESOLVERS.
"""
import posixpath
from collections import defaultdict

import networkx as nx

MAX_CYCLES_STORED = 50


# ======================= Python import resolver =======================
class PythonResolver:
    """Maps import statements to .py files that exist inside the repo.

    Imports of anything not in the repo (os, requests, ...) resolve to nothing and are ignored.
    """

    def __init__(self, paths: list[str]):
        self.paths = set(paths)
        self.module_to_path: dict[str, str] = {}
        self._index(sorted(paths))

    def _index(self, paths: list[str]) -> None:
        primary: dict[str, str] = {}
        aliases: dict[str, str] = {}
        for path in paths:
            parts = path.split("/")
            dirs, filename = parts[:-1], parts[-1]
            is_init = filename == "__init__.py"
            stem = filename[:-3]

            # primary name: walk up while the parent dir is a package (has __init__.py)
            i = len(dirs)
            while i > 0 and "/".join(dirs[:i] + ["__init__.py"]) in self.paths:
                i -= 1
            primary_parts = dirs[i:] + ([] if is_init else [stem])
            # alias: path from the repo root, so "src.pkg.mod" style imports also resolve
            alias_parts = dirs + ([] if is_init else [stem])

            for name_parts, table in ((primary_parts, primary), (alias_parts, aliases)):
                if not name_parts:
                    continue
                name = ".".join(name_parts)
                # on a name clash keep the shallowest file (deterministic)
                if name not in table or path.count("/") < table[name].count("/"):
                    table[name] = path

        self.module_to_path = {**aliases, **primary}  # primary names win over aliases

    def _file_for(self, parts: list[str]) -> str | None:
        """Filesystem lookup used by relative imports: <parts>.py or <parts>/__init__.py."""
        base = "/".join(parts)
        for candidate in ([f"{base}.py"] if parts else []) + [posixpath.join(base, "__init__.py")]:
            if candidate in self.paths:
                return candidate
        return None

    def _lookup(self, dotted: str) -> str | None:
        """Longest-prefix match: 'a.b.c' -> a.b.c, else a.b, else a."""
        parts = dotted.split(".")
        while parts:
            hit = self.module_to_path.get(".".join(parts))
            if hit:
                return hit
            parts.pop()
        return None

    def resolve(self, src_path: str, imp: dict) -> list[str]:
        module, names, level = imp["module"], imp["names"], imp["level"]
        real_names = [n for n in names if n != "*"]

        if level:  # relative import: resolved from the importing file's folder
            base = src_path.split("/")[:-1]
            up = level - 1
            if up > len(base):
                return []
            if up:
                base = base[:-up]
            pkg_dir = base + (module.split(".") if module else [])
            hits = [h for n in real_names if (h := self._file_for(pkg_dir + [n]))]
            if not hits and (h := self._file_for(pkg_dir)):
                hits = [h]
            return hits

        # absolute import
        if not module:
            return []
        # "from pkg import mod" -> mod may be a submodule file
        hits = [h for n in real_names if (h := self.module_to_path.get(f"{module}.{n}"))]
        if not hits and (h := self._lookup(module)):
            hits = [h]
        return hits


RESOLVERS = {"python": PythonResolver}


# ======================= Graph metrics =======================
def _pagerank(G: nx.DiGraph, damping: float = 0.85, iters: int = 100, tol: float = 1e-8) -> dict[str, float]:
    """Plain power-iteration PageRank (avoids a SciPy dependency).

    An edge A -> B passes importance to B, so files that many important files import score high.
    """
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

    # one resolver per language, each only knows files of its own language
    paths_by_lang: dict[str, list[str]] = defaultdict(list)
    for f in files:
        paths_by_lang[f["language"]].append(f["path"])
    resolvers = {lang: RESOLVERS[lang](paths) for lang, paths in paths_by_lang.items() if lang in RESOLVERS}

    for f in files:
        resolver = resolvers.get(f["language"])
        if resolver is None:
            continue
        for imp in f["imports"]:
            for target in resolver.resolve(f["path"], imp):
                if target == f["path"]:
                    continue
                if G.has_edge(f["path"], target):
                    G[f["path"]][target]["weight"] += 1  # weight = number of import statements
                else:
                    G.add_edge(f["path"], target, weight=1)

    # circular dependencies = strongly connected components with more than one file
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
            "centrality": round(pr[p] / top, 4),            # 0..1, 1 = most central file
            "instability": round(fo / (fi + fo), 3) if fi + fo else 0.0,  # 0 = stable, 1 = unstable
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


if __name__ == "__main__":
    # Quick manual test:  python -m app.engine.dependency_graph /path/to/repo
    import sys

    from app.engine.parser import parse_repository

    result = build_dependency_graph(parse_repository(sys.argv[1])["files"])
    print(result["stats"])
    for c in result["cycles"][:5]:
        print("cycle:", " <-> ".join(c))
    top = sorted(result["metrics"].items(), key=lambda kv: kv[1]["fan_in"], reverse=True)[:5]
    for path, m in top:
        print(f"  fan_in={m['fan_in']:>3} fan_out={m['fan_out']:>3} centrality={m['centrality']}  {path}")