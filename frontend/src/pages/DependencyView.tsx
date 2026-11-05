import { memo, useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  Handle,
  MarkerType,
  MiniMap,
  Position,
  ReactFlowProvider,
  useReactFlow,
  useStore,
  type Edge,
  type Node,
  type NodeProps,
} from 'reactflow';
import dagre from 'dagre';
import 'reactflow/dist/style.css';
import { AlertTriangle, ArrowDown, ArrowRight, Crosshair, FolderOpen, RotateCw, Search, X } from 'lucide-react';
import { api, type DependencyGraph, type GraphNode } from '@/api';
import { PageContainer, PageHeader } from '@/components/Page';
import { useRepos } from '@/context/RepoContext';

/* ------------------------------------------------------------------ */
/* Types & constants                                                   */
/* ------------------------------------------------------------------ */

type ViewMode = 'modules' | 'files';

type VNode = {
  id: string;
  title: string;
  sub: string;
  left: string;
  right: string;
  color: string;
  inCycle: boolean;
  external: boolean;
  width: number;
  height: number;
};

type VEdge = { id: string; source: string; target: string; weight: number; inCycle: boolean };

type ModuleInfo = {
  id: string;
  files: GraphNode[];
  loc: number;
  inCycle: boolean;
  color: string;
  out: Map<string, number>;
  inn: Map<string, number>;
};

type NodeData = { v: VNode; horizontal: boolean };

const FILE_W = 210;
const FILE_H = 62;
const MOD_W = 236;
const MOD_H = 72;
const MAX_EXTERNAL = 40;
const PALETTE = ['#2563eb', '#7c3aed', '#0891b2', '#16a34a', '#d97706', '#db2777', '#4f46e5', '#0d9488', '#ea580c', '#65a30d'];

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

function topKey(id: string): string {
  return id.includes('/') ? id.split('/')[0] : '(root)';
}

function moduleOf(id: string, depth: number): string {
  const dir = id.split('/').slice(0, -1);
  return dir.length ? dir.slice(0, depth).join('/') : '(root)';
}

/** Smallest folder depth that gives a readable number of modules (about 10-40). */
function autoDepth(nodes: GraphNode[]): number {
  let best = 1;
  for (let d = 1; d <= 4; d++) {
    const count = new Set(nodes.map((n) => moduleOf(n.id, d))).size;
    if (count > 40) break;
    best = d;
    if (count >= 10) break;
  }
  return best;
}

/**
 * Layered (Sugiyama-style) layout: dependencies flow in one direction and edge
 * crossings are minimised. Files with no visible links are packed in a grid
 * below the graph instead of stretching it into one long line.
 */
function computeLayout(vnodes: VNode[], vedges: VEdge[], horizontal: boolean): Map<string, { x: number; y: number }> {
  const pos = new Map<string, { x: number; y: number }>();
  const linked = new Set<string>();
  for (const e of vedges) {
    linked.add(e.source);
    linked.add(e.target);
  }
  const connected = vnodes.filter((n) => linked.has(n.id));
  const loose = vnodes.filter((n) => !linked.has(n.id));

  let bottom = 0;
  if (connected.length) {
    const g = new dagre.graphlib.Graph();
    g.setGraph({
      rankdir: horizontal ? 'LR' : 'TB',
      nodesep: horizontal ? 22 : 34,
      ranksep: horizontal ? 140 : 90,
      marginx: 20,
      marginy: 20,
    });
    g.setDefaultEdgeLabel(() => ({}));
    for (const n of connected) g.setNode(n.id, { width: n.width, height: n.height });
    for (const e of vedges) g.setEdge(e.source, e.target);
    dagre.layout(g);

    // Centre positions straight from dagre, grouped into ranks (dependency layers).
    type Item = { n: VNode; r: number; c: number };
    const ranks = new Map<number, Item[]>();
    for (const n of connected) {
      const p = g.node(n.id);
      const r = horizontal ? p.x : p.y;
      const c = horizontal ? p.y : p.x;
      const key = Math.round(r);
      if (!ranks.has(key)) ranks.set(key, []);
      ranks.get(key)!.push({ n, r, c });
    }

    // Keep dagre's crossing-minimised order inside every layer, but pack each layer compactly
    // and centre all layers on one common axis. A layer with many nodes would otherwise become
    // one endless line, so wide layers are wrapped into a grid and later layers move aside.
    const MAX_STRAIGHT = 12;
    const all = [...ranks.values()].flat();
    const axisC = all.reduce((sum, it) => sum + it.c, 0) / all.length;
    let shift = 0;
    for (const key of [...ranks.keys()].sort((a, b) => a - b)) {
      const items = ranks.get(key)!.sort((a, b) => a.c - b.c);
      const count = items.length;
      const rankSize = horizontal ? items[0].n.width : items[0].n.height;
      const crossSize = horizontal ? items[0].n.height : items[0].n.width;
      const gapRank = 40;
      const gapCross = horizontal ? 22 : 34;
      const rows = count > MAX_STRAIGHT ? Math.max(10, Math.ceil(Math.sqrt(2 * count))) : count;
      const cols = Math.ceil(count / rows);
      const extent = Math.min(rows, count) * (crossSize + gapCross) - gapCross;

      items.forEach((it, i) => {
        const r = it.r + shift + Math.floor(i / rows) * (rankSize + gapRank);
        const c = axisC - extent / 2 + (i % rows) * (crossSize + gapCross) + crossSize / 2;
        const x = horizontal ? r : c;
        const y = horizontal ? c : r;
        pos.set(it.n.id, { x: x - it.n.width / 2, y: y - it.n.height / 2 });
        bottom = Math.max(bottom, y + it.n.height / 2);
      });
      shift += (cols - 1) * (rankSize + gapRank);
    }
    // Normalise so the graph starts near the origin.
    let minX = Infinity;
    let minY = Infinity;
    for (const p of pos.values()) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
    }
    for (const p of pos.values()) {
      p.x -= minX - 20;
      p.y -= minY - 20;
    }
    bottom -= minY - 20;
  }

  if (loose.length) {
    const cols = Math.max(1, Math.min(8, Math.ceil(Math.sqrt(loose.length) * 1.6)));
    const cellW = loose[0].width + 24;
    const cellH = loose[0].height + 18;
    const startY = connected.length ? bottom + 90 : 20;
    loose.forEach((n, i) => {
      pos.set(n.id, { x: 20 + (i % cols) * cellW, y: startY + Math.floor(i / cols) * cellH });
    });
  }
  return pos;
}

/* ------------------------------------------------------------------ */
/* Lightweight node renderer (memoised, defined outside the component) */
/* ------------------------------------------------------------------ */

// Below this zoom level nodes switch to a big, readable title (and far fewer DOM elements).
const lowDetailSelector = (s: { transform: [number, number, number] }) => s.transform[2] < 0.5;

const DepNode = memo(function DepNode({ data }: NodeProps<NodeData>) {
  const { v, horizontal } = data;
  const lowDetail = useStore(lowDetailSelector);
  return (
    <div
      className={`dep-node rounded-lg border px-2.5 py-1.5 text-left ${lowDetail ? '' : 'shadow-sm'} ${
        v.inCycle ? 'border-red-400 bg-red-50' : v.external ? 'border-dashed border-slate-300 bg-slate-50' : 'border-slate-200 bg-white'
      }`}
      style={{ width: v.width, height: v.height, borderLeft: `${lowDetail ? 10 : 4}px solid ${v.color}` }}
      title={v.id}
    >
      <Handle type="target" position={horizontal ? Position.Left : Position.Top} isConnectable={false} />
      {lowDetail ? (
        <div className="flex h-full items-center">
          <span className="truncate text-[26px] font-bold leading-tight text-slate-800">{v.title}</span>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between gap-1">
            <span className="truncate text-xs font-bold text-slate-800">{v.title}</span>
            {v.inCycle && <span className="h-2 w-2 shrink-0 rounded-full bg-red-500" title="In circular dependency" />}
          </div>
          <div className="truncate font-mono text-[10px] text-slate-400">{v.sub}</div>
          <div className="mt-1 flex items-center justify-between border-t border-slate-100 pt-1 text-[10px] text-slate-500">
            <span>{v.left}</span>
            <span className="font-semibold text-blue-600">{v.right}</span>
          </div>
        </>
      )}
      <Handle type="source" position={horizontal ? Position.Right : Position.Bottom} isConnectable={false} />
    </div>
  );
});

const nodeTypes = { dep: DepNode };

/* ------------------------------------------------------------------ */
/* Canvas                                                              */
/* ------------------------------------------------------------------ */

function Canvas({
  nodes,
  edges,
  signal,
  hasSelection,
  showMiniMap,
  onSelect,
  onOpen,
}: {
  nodes: Node<NodeData>[];
  edges: Edge[];
  signal: unknown;
  hasSelection: boolean;
  showMiniMap: boolean;
  onSelect: (id: string | null) => void;
  onOpen: (id: string) => void;
}) {
  const { fitView } = useReactFlow();

  // Re-fit only when the layout changes, not when a node is selected.
  useEffect(() => {
    const t = window.setTimeout(() => fitView({ padding: 0.15, maxZoom: 1, duration: 250 }), 60);
    return () => window.clearTimeout(t);
  }, [signal, fitView]);

  return (
    <div className={`dep-canvas h-full w-full ${hasSelection ? 'has-selection' : ''}`}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodeClick={(_, node) => onSelect(node.id)}
        onNodeDoubleClick={(_, node) => onOpen(node.id)}
        onPaneClick={() => onSelect(null)}
        nodesDraggable={false}
        nodesConnectable={false}
        minZoom={0.03}
        maxZoom={1.5}
        onlyRenderVisibleElements
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={24} size={1} color="#e2e8f0" />
        <Controls showInteractive={false} className="bg-white border rounded-xl shadow-xs" />
        {showMiniMap && (
          <MiniMap
            pannable
            zoomable
            nodeColor={(n) => ((n.data as NodeData | undefined)?.v.inCycle ? '#ef4444' : (n.data as NodeData | undefined)?.v.color ?? '#2563eb')}
            style={{ height: 100, width: 150, borderRadius: 8 }}
          />
        )}
      </ReactFlow>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export default function DependencyView() {
  const { activeRepo } = useRepos();
  const [graph, setGraph] = useState<DependencyGraph | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [mode, setMode] = useState<ViewMode>('files');
  const [depth, setDepth] = useState(0); // 0 = auto
  const [limit, setLimit] = useState(100);
  const [horizontal, setHorizontal] = useState(true);
  const [search, setSearch] = useState('');
  const [hideIsolated, setHideIsolated] = useState(true);
  const [cyclesOnly, setCyclesOnly] = useState(false);
  const [scopeModule, setScopeModule] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);
  const [focusDepth, setFocusDepth] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showCyclesDrawer, setShowCyclesDrawer] = useState(false);

  useEffect(() => {
    if (!activeRepo || activeRepo.status !== 'completed') return;
    setLoading(true);
    setError('');
    api
      .dependencies(activeRepo.id, true)
      .then((g) => {
        setGraph(g);
        // Big repositories open as a folder-level overview; small ones show files directly.
        setMode(g.nodes.length > 60 ? 'modules' : 'files');
        setScopeModule(null);
        setFocusId(null);
        setSelectedId(null);
        setDepth(0);
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load dependency graph.'))
      .finally(() => setLoading(false));
  }, [activeRepo]);

  const effDepth = useMemo(() => depth || (graph ? autoDepth(graph.nodes) : 1), [depth, graph]);

  const colors = useMemo(() => {
    const map = new Map<string, string>();
    if (!graph) return map;
    [...new Set(graph.nodes.map((n) => topKey(n.id)))].sort().forEach((k, i) => map.set(k, PALETTE[i % PALETTE.length]));
    return map;
  }, [graph]);

  // Folder-level aggregation (nodes = folders, edge weight = number of imports between them)
  const moduleGraph = useMemo(() => {
    const mods = new Map<string, ModuleInfo>();
    if (!graph) return mods;
    const fileModule = new Map<string, string>();
    for (const n of graph.nodes) {
      const id = moduleOf(n.id, effDepth);
      fileModule.set(n.id, id);
      let m = mods.get(id);
      if (!m) {
        m = { id, files: [], loc: 0, inCycle: false, color: colors.get(topKey(n.id)) ?? PALETTE[0], out: new Map(), inn: new Map() };
        mods.set(id, m);
      }
      m.files.push(n);
      m.loc += n.loc || 0;
      if (n.in_cycle) m.inCycle = true;
    }
    for (const e of graph.edges) {
      const s = fileModule.get(e.source);
      const t = fileModule.get(e.target);
      if (!s || !t || s === t) continue;
      const w = e.weight || 1;
      mods.get(s)!.out.set(t, (mods.get(s)!.out.get(t) ?? 0) + w);
      mods.get(t)!.inn.set(s, (mods.get(t)!.inn.get(s) ?? 0) + w);
    }
    return mods;
  }, [graph, effDepth, colors]);

  const cycleSets = useMemo(() => {
    const map = new Map<string, Set<number>>();
    (graph?.cycles ?? []).forEach((cycle, i) => {
      for (const id of cycle) {
        if (!map.has(id)) map.set(id, new Set());
        map.get(id)!.add(i);
      }
    });
    return map;
  }, [graph]);

  // What is visible (depends on filters, NOT on the selected node)
  const view = useMemo(() => {
    const empty = { vnodes: [] as VNode[], vedges: [] as VEdge[], hidden: 0, total: 0 };
    if (!graph) return empty;
    const q = search.trim().toLowerCase();

    if (mode === 'modules') {
      const keep = [...moduleGraph.values()].filter((m) => {
        if (q && !m.id.toLowerCase().includes(q) && !m.files.some((f) => f.id.toLowerCase().includes(q))) return false;
        if (cyclesOnly && !m.inCycle) return false;
        if (hideIsolated && m.out.size === 0 && m.inn.size === 0) return false;
        return true;
      });
      const ids = new Set(keep.map((m) => m.id));
      const vnodes: VNode[] = keep.map((m) => ({
        id: m.id,
        title: m.id,
        sub: `${m.files.length} files · ${m.loc.toLocaleString()} LOC`,
        left: `in ${m.inn.size} · out ${m.out.size}`,
        right: 'double-click to open',
        color: m.color,
        inCycle: m.inCycle,
        external: false,
        width: MOD_W,
        height: MOD_H,
      }));
      const vedges: VEdge[] = [];
      for (const m of keep) {
        for (const [t, w] of m.out) {
          if (ids.has(t)) vedges.push({ id: `${m.id}→${t}`, source: m.id, target: t, weight: w, inCycle: false });
        }
      }
      return { vnodes, vedges, hidden: 0, total: moduleGraph.size };
    }

    // ---- files mode ----
    const byId = new Map(graph.nodes.map((n) => [n.id, n]));
    const passes = (n: GraphNode) =>
      (!q || n.id.toLowerCase().includes(q)) && !(hideIsolated && n.fan_in === 0 && n.fan_out === 0) && !(cyclesOnly && !n.in_cycle);

    let picked: GraphNode[] = [];
    const external = new Set<string>();
    let hidden = 0;
    let total = graph.nodes.length;

    if (focusId && byId.has(focusId)) {
      const adj = new Map<string, string[]>();
      for (const e of graph.edges) {
        if (!adj.has(e.source)) adj.set(e.source, []);
        if (!adj.has(e.target)) adj.set(e.target, []);
        adj.get(e.source)!.push(e.target);
        adj.get(e.target)!.push(e.source);
      }
      const seen = new Set([focusId]);
      let frontier = [focusId];
      for (let d = 0; d < focusDepth; d++) {
        const next: string[] = [];
        for (const id of frontier) {
          for (const nb of adj.get(id) ?? []) {
            if (!seen.has(nb)) {
              seen.add(nb);
              next.push(nb);
            }
          }
        }
        frontier = next;
      }
      picked = [...seen].map((id) => byId.get(id)!).filter(Boolean);
      total = picked.length;
    } else if (scopeModule) {
      const inMod = graph.nodes.filter((n) => moduleOf(n.id, effDepth) === scopeModule && passes(n));
      const ids = new Set(inMod.map((n) => n.id));
      const ext = new Map<string, GraphNode>();
      for (const e of graph.edges) {
        const sIn = ids.has(e.source);
        const tIn = ids.has(e.target);
        if (sIn === tIn) continue;
        const other = byId.get(sIn ? e.target : e.source);
        if (other && moduleOf(other.id, effDepth) !== scopeModule) ext.set(other.id, other);
      }
      const extList = [...ext.values()].sort((a, b) => b.centrality - a.centrality);
      const extKeep = extList.slice(0, MAX_EXTERNAL);
      hidden = extList.length - extKeep.length;
      extKeep.forEach((n) => external.add(n.id));
      picked = [...inMod, ...extKeep];
      total = inMod.length;
    } else {
      const filtered = graph.nodes.filter(passes).sort((a, b) => b.fan_in + b.fan_out - (a.fan_in + a.fan_out) || b.centrality - a.centrality);
      picked = filtered.slice(0, limit);
      hidden = filtered.length - picked.length;
      total = filtered.length;
    }

    const pickedIds = new Set(picked.map((n) => n.id));
    const vnodes: VNode[] = picked.map((n) => ({
      id: n.id,
      title: n.label,
      sub: n.id.includes('/') ? n.id.slice(0, n.id.length - n.label.length - 1) : '(root)',
      left: `in ${n.fan_in} · out ${n.fan_out}`,
      right: `${(n.centrality * 100).toFixed(0)}% rank`,
      color: colors.get(topKey(n.id)) ?? PALETTE[0],
      inCycle: n.in_cycle,
      external: external.has(n.id),
      width: FILE_W,
      height: FILE_H,
    }));
    const vedges: VEdge[] = [];
    for (const e of graph.edges) {
      if (e.source === e.target || !pickedIds.has(e.source) || !pickedIds.has(e.target)) continue;
      if (external.has(e.source) && external.has(e.target)) continue;
      const a = cycleSets.get(e.source);
      const b = cycleSets.get(e.target);
      const inCycle = !!a && !!b && [...a].some((i) => b.has(i));
      vedges.push({ id: `${e.source}→${e.target}`, source: e.source, target: e.target, weight: e.weight || 1, inCycle });
    }
    return { vnodes, vedges, hidden, total };
  }, [graph, mode, moduleGraph, search, hideIsolated, cyclesOnly, limit, scopeModule, focusId, focusDepth, effDepth, colors, cycleSets]);

  // Layout is computed once per visible set / direction, never on selection.
  const layoutResult = useMemo(() => {
    const pos = computeLayout(view.vnodes, view.vedges, horizontal);
    const isModule = mode === 'modules';
    const dense = view.vedges.length > 150; // arrowheads on every line are costly and cluttered; shown on highlight
    const nodes: Node<NodeData>[] = view.vnodes.map((v) => ({
      id: v.id,
      type: 'dep',
      position: pos.get(v.id) ?? { x: 0, y: 0 },
      data: { v, horizontal },
      sourcePosition: horizontal ? Position.Right : Position.Bottom,
      targetPosition: horizontal ? Position.Left : Position.Top,
    }));
    const edges: Edge[] = view.vedges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      data: { weight: e.weight },
      interactionWidth: 0,
      markerEnd: dense ? undefined : { type: MarkerType.ArrowClosed, color: e.inCycle ? '#ef4444' : '#94a3b8', width: 14, height: 14 },
      style: {
        stroke: e.inCycle ? '#ef4444' : '#94a3b8',
        strokeWidth: isModule ? Math.min(6, 1 + Math.log2(e.weight + 1)) : 1.2,
        opacity: isModule ? 0.75 : 0.5,
        strokeDasharray: e.inCycle ? '5 4' : undefined,
      },
    }));
    return { nodes, edges };
  }, [view, horizontal, mode]);

  // Selection overlay: only related nodes / edges get new objects, everything else keeps identity.
  const { nodes, edges } = useMemo(() => {
    if (!selectedId) return layoutResult;
    const related = new Set<string>([selectedId]);
    const relEdges = layoutResult.edges.filter((e) => e.source === selectedId || e.target === selectedId);
    for (const e of relEdges) {
      related.add(e.source);
      related.add(e.target);
    }
    const relIds = new Set(relEdges.map((e) => e.id));
    const isModule = mode === 'modules';
    return {
      nodes: layoutResult.nodes.map((n) =>
        related.has(n.id) ? { ...n, className: n.id === selectedId ? 'is-related is-selected' : 'is-related' } : n,
      ),
      edges: layoutResult.edges.map((e) =>
        relIds.has(e.id)
          ? {
              ...e,
              className: 'is-related',
              animated: relEdges.length <= 30,
              zIndex: 10,
              label: isModule ? String((e.data as { weight: number }).weight) : undefined,
              labelStyle: { fontSize: 11, fontWeight: 700, fill: '#1d4ed8' },
              labelBgStyle: { fill: '#eff6ff' },
              markerEnd: { type: MarkerType.ArrowClosed, color: '#2563eb', width: 16, height: 16 },
              style: {
                stroke: '#2563eb',
                strokeWidth: isModule ? Math.min(7, 2.5 + Math.log2((e.data as { weight: number }).weight + 1) * 0.5) : 2.5,
                opacity: 1,
              },
            }
          : e,
      ),
    };
  }, [layoutResult, selectedId, mode]);

  // Drop a selection that is no longer on screen
  useEffect(() => {
    if (selectedId && !view.vnodes.some((n) => n.id === selectedId)) setSelectedId(null);
  }, [view, selectedId]);

  const selectedFile = useMemo(
    () => (mode === 'files' && selectedId && graph ? graph.nodes.find((n) => n.id === selectedId) ?? null : null),
    [mode, selectedId, graph],
  );
  const selectedModule = mode === 'modules' && selectedId ? moduleGraph.get(selectedId) ?? null : null;

  const fileDeps = useMemo(() => {
    if (!selectedFile || !graph) return { imports: [] as string[], importedBy: [] as string[] };
    return {
      imports: graph.edges.filter((e) => e.source === selectedFile.id).map((e) => e.target),
      importedBy: graph.edges.filter((e) => e.target === selectedFile.id).map((e) => e.source),
    };
  }, [selectedFile, graph]);

  /* ---------------- actions ---------------- */
  function switchMode(next: ViewMode) {
    setMode(next);
    setScopeModule(null);
    setFocusId(null);
    setSelectedId(null);
  }
  function openModule(id: string) {
    setMode('files');
    setScopeModule(id);
    setFocusId(null);
    setSelectedId(null);
  }
  function focusFile(id: string) {
    setMode('files');
    setScopeModule(null);
    setFocusId(id);
    setSelectedId(id);
  }
  function handleOpen(id: string) {
    if (mode === 'modules') openModule(id);
    else focusFile(id);
  }
  function clearScope() {
    setScopeModule(null);
    setFocusId(null);
    setSelectedId(null);
  }

  const isScoped = mode === 'files' && (scopeModule || focusId);
  const toggle = (on: boolean, tone: 'blue' | 'red' = 'blue') =>
    `rounded-lg px-3 py-1.5 font-semibold transition border ${
      on
        ? tone === 'red'
          ? 'bg-red-50 text-red-700 border-red-200'
          : 'bg-blue-50 text-blue-700 border-blue-200'
        : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
    }`;

  return (
    <PageContainer>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <PageHeader
          title="Dependency Graph"
          description="Start with the folder-level overview, then open a folder or focus on a file to see exactly how it connects."
        />
        {graph?.cycles && graph.cycles.length > 0 && (
          <button
            onClick={() => setShowCyclesDrawer(!showCyclesDrawer)}
            className="btn-secondary text-xs gap-1.5 border-red-200 text-red-700 bg-red-50 hover:bg-red-100"
          >
            <AlertTriangle size={14} className="text-red-600" />
            {graph.cycles.length} Circular Dependencies
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          {error}
        </p>
      )}

      {/* Control Bar */}
      <div className="mb-4 space-y-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative min-w-[220px] flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search module or file path…"
              className="input pl-9 text-xs py-1.5"
            />
          </div>

          <div className="inline-flex overflow-hidden rounded-lg border border-slate-200 text-xs font-semibold">
            {(['modules', 'files'] as ViewMode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={`px-3 py-1.5 transition ${mode === m ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
              >
                {m === 'modules' ? 'Folders overview' : 'Files'}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setHorizontal(!horizontal)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100"
            title="Change layout direction"
          >
            {horizontal ? <ArrowRight size={14} /> : <ArrowDown size={14} />}
            {horizontal ? 'Left → Right' : 'Top → Bottom'}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button type="button" onClick={() => setHideIsolated(!hideIsolated)} className={toggle(hideIsolated)}>
            Hide Isolated Files
          </button>
          <button type="button" onClick={() => setCyclesOnly(!cyclesOnly)} className={toggle(cyclesOnly, 'red')}>
            Cycles Only
          </button>

          {mode === 'modules' && (
            <label className="inline-flex items-center gap-1.5 text-slate-600">
              Folder depth
              <select
                value={depth}
                onChange={(e) => {
                  setDepth(Number(e.target.value));
                  setSelectedId(null);
                }}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold"
              >
                <option value={0}>Auto ({effDepth})</option>
                {[1, 2, 3, 4].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          )}

          {mode === 'files' && !isScoped && (
            <label className="inline-flex items-center gap-1.5 text-slate-600">
              Show top
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold"
              >
                {[50, 100, 200, 400].map((n) => (
                  <option key={n} value={n}>
                    {n} files{n >= 400 ? ' (slower)' : ''}
                  </option>
                ))}
              </select>
              by connections
            </label>
          )}

          {focusId && (
            <label className="inline-flex items-center gap-1.5 text-slate-600">
              Hops
              <select
                value={focusDepth}
                onChange={(e) => setFocusDepth(Number(e.target.value))}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs font-semibold"
              >
                <option value={1}>1 (direct)</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
              </select>
            </label>
          )}

          <div className="ml-auto rounded-lg bg-slate-100 px-3 py-1.5 font-mono text-[11px] text-slate-600">
            {mode === 'modules' ? 'Folders' : 'Files'}: {view.vnodes.length} · Links: {view.vedges.length}
          </div>
        </div>

        {isScoped && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl bg-blue-50 px-3 py-2 text-xs text-blue-800">
            <button type="button" onClick={() => switchMode('modules')} className="font-semibold underline">
              All folders
            </button>
            <span>›</span>
            <span className="font-mono font-semibold">{focusId ?? scopeModule}</span>
            <span className="text-blue-600">
              {focusId ? `(showing files within ${focusDepth} hop${focusDepth > 1 ? 's' : ''})` : '(dashed = files outside this folder)'}
            </span>
            <button type="button" onClick={clearScope} className="ml-auto inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 font-semibold text-blue-700 hover:bg-blue-100">
              <X size={12} /> Clear
            </button>
          </div>
        )}

        {mode === 'files' && view.hidden > 0 && (
          <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
            {scopeModule
              ? `${view.hidden} more outside files are hidden to keep the graph readable.`
              : `Showing the ${view.vnodes.length} most connected of ${view.total} files. Use search, the folder overview or “Focus” to see others.`}
          </p>
        )}
      </div>

      {/* Main canvas */}
      <div className="relative h-[680px] card p-0 overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-xs text-slate-500">
            <RotateCw size={18} className="animate-spin text-blue-600" />
            Computing graph metrics and PageRank centrality…
          </div>
        ) : graph && view.vnodes.length > 0 ? (
          <ReactFlowProvider>
            <Canvas
              nodes={nodes}
              edges={edges}
              signal={layoutResult}
              hasSelection={!!selectedId}
              showMiniMap={view.vnodes.length <= 200}
              onSelect={setSelectedId}
              onOpen={handleOpen}
            />
          </ReactFlowProvider>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">No dependency nodes match current filters.</div>
        )}

        {/* Legend */}
        {graph && view.vnodes.length > 0 && !loading && (
          <div className="pointer-events-none absolute bottom-3 left-14 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white/90 px-3 py-1.5 text-[10px] text-slate-500 shadow-sm">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-red-500" /> In circular dependency</span>
            <span className="flex items-center gap-1"><span className="h-0.5 w-4 bg-blue-600" /> Selected links</span>
            <span>Left stripe = top-level folder</span>
            {mode === 'modules' && <span>Line thickness = number of imports</span>}
            <span>Arrows point to the imported file</span>
          </div>
        )}

        {/* Selected details */}
        {(selectedFile || selectedModule) && (
          <div className="absolute right-4 top-4 z-20 w-80 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur-md">
            <div className="flex items-start justify-between border-b pb-3">
              <div className="min-w-0">
                <span className="badge bg-blue-50 text-blue-700 border-blue-200 text-[10px] uppercase">
                  {selectedFile ? selectedFile.language || 'Code File' : 'Folder'}
                </span>
                <h3 className="mt-1 truncate text-sm font-bold text-slate-900">{selectedFile ? selectedFile.label : selectedModule!.id}</h3>
                {selectedFile && <p className="truncate text-[11px] text-slate-400 font-mono">{selectedFile.id}</p>}
              </div>
              <button onClick={() => setSelectedId(null)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X size={16} />
              </button>
            </div>

            {selectedFile && (
              <>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <Stat label="Lines of Code" value={selectedFile.loc} />
                  <Stat label="PageRank" value={`${(selectedFile.centrality * 100).toFixed(1)}%`} tone="blue" />
                  <Stat label="Fan-In (Dependents)" value={selectedFile.fan_in} />
                  <Stat label="Fan-Out (Imports)" value={selectedFile.fan_out} />
                </div>
                {selectedFile.in_cycle && <CycleNote />}
                <button
                  type="button"
                  onClick={() => focusFile(selectedFile.id)}
                  className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  <Crosshair size={14} /> Focus on this file
                </button>
                <div className="mt-3 border-t pt-2 text-xs space-y-2">
                  <PathList title="Direct Dependents" items={fileDeps.importedBy} empty="None (Root entrypoint)" onPick={focusFile} />
                  <PathList title="Direct Imports" items={fileDeps.imports} empty="None (Leaf module)" onPick={focusFile} />
                </div>
              </>
            )}

            {selectedModule && (
              <>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <Stat label="Files" value={selectedModule.files.length} />
                  <Stat label="Lines of Code" value={selectedModule.loc.toLocaleString()} />
                  <Stat label="Depends on" value={`${selectedModule.out.size} folders`} />
                  <Stat label="Used by" value={`${selectedModule.inn.size} folders`} />
                </div>
                {selectedModule.inCycle && <CycleNote />}
                <button
                  type="button"
                  onClick={() => openModule(selectedModule.id)}
                  className="mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                >
                  <FolderOpen size={14} /> Open files in this folder
                </button>
                <div className="mt-3 border-t pt-2 text-xs space-y-2">
                  <PathList
                    title="Used by"
                    items={[...selectedModule.inn].sort((a, b) => b[1] - a[1]).map(([id, w]) => `${id}  ×${w}`)}
                    empty="None"
                  />
                  <PathList
                    title="Depends on"
                    items={[...selectedModule.out].sort((a, b) => b[1] - a[1]).map(([id, w]) => `${id}  ×${w}`)}
                    empty="None"
                  />
                </div>
              </>
            )}
          </div>
        )}

        {/* Cycles drawer */}
        {showCyclesDrawer && graph?.cycles && (
          <div className="absolute left-4 top-4 z-20 w-96 rounded-2xl border border-red-200 bg-white/95 p-4 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-1.5 text-sm font-bold text-red-700">
                <AlertTriangle size={16} /> Circular Dependency Loops ({graph.cycles.length})
              </div>
              <button onClick={() => setShowCyclesDrawer(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                <X size={16} />
              </button>
            </div>
            <div className="mt-3 max-h-[460px] overflow-y-auto space-y-3">
              {graph.cycles.map((cycle, cIdx) => (
                <div key={cIdx} className="rounded-xl border border-red-100 bg-red-50/50 p-2.5 text-xs">
                  <p className="font-semibold text-red-900 mb-1">
                    Cycle #{cIdx + 1} ({cycle.length} files)
                  </p>
                  <div className="space-y-1">
                    {cycle.map((filePath, fIdx) => (
                      <div
                        key={filePath}
                        onClick={() => focusFile(filePath)}
                        className="cursor-pointer truncate rounded px-1.5 py-0.5 font-mono text-[11px] text-red-800 hover:bg-red-100 transition"
                      >
                        {fIdx + 1}. {filePath}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </PageContainer>
  );
}

/* ------------------------------------------------------------------ */
/* Small presentational helpers                                        */
/* ------------------------------------------------------------------ */

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: 'blue' }) {
  return (
    <div className="rounded-xl bg-slate-50 p-2.5">
      <span className="text-[10px] text-slate-400 uppercase">{label}</span>
      <p className={`text-sm font-bold ${tone === 'blue' ? 'text-blue-600' : 'text-slate-800'}`}>{value}</p>
    </div>
  );
}

function CycleNote() {
  return (
    <div className="mt-3 rounded-xl bg-red-50 border border-red-200 p-2.5 text-xs text-red-700 flex items-center gap-2">
      <AlertTriangle size={15} className="shrink-0" />
      <span>Participates in a circular dependency loop</span>
    </div>
  );
}

function PathList({ title, items, empty, onPick }: { title: string; items: string[]; empty: string; onPick?: (id: string) => void }) {
  return (
    <div>
      <p className="text-[11px] font-bold text-slate-500 uppercase">
        {title} ({items.length})
      </p>
      <div className="mt-1 max-h-24 overflow-y-auto space-y-1">
        {items.length ? (
          items.map((p) => (
            <p
              key={p}
              onClick={onPick ? () => onPick(p) : undefined}
              className={`truncate rounded bg-slate-50 px-2 py-1 text-[11px] font-mono text-slate-700 ${onPick ? 'cursor-pointer hover:bg-blue-50' : ''}`}
              title={p}
            >
              {p}
            </p>
          ))
        ) : (
          <p className="text-[11px] text-slate-400">{empty}</p>
        )}
      </div>
    </div>
  );
}