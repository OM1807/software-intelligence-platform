import { useEffect, useMemo, useState } from 'react';
import ReactFlow, {
  Background,
  Controls,
  Position,
  MarkerType,
  MiniMap,
  type Node,
  type Edge,
} from 'reactflow';
import 'reactflow/dist/style.css';
import {
  AlertTriangle,
  Code2,
  Filter,
  Layers,
  Network,
  RotateCw,
  Search,
  X,
  FileCode,
  ArrowRight,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import { api, type DependencyGraph, type GraphNode } from '@/api';
import { PageContainer, PageHeader } from '@/components/Page';
import { useRepos } from '@/context/RepoContext';

export default function DependencyView() {
  const { activeRepo } = useRepos();
  const [graph, setGraph] = useState<DependencyGraph | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [hideIsolated, setHideIsolated] = useState(true);
  const [cyclesOnly, setCyclesOnly] = useState(false);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [showCyclesDrawer, setShowCyclesDrawer] = useState(false);

  useEffect(() => {
    if (!activeRepo || activeRepo.status !== 'completed') return;
    setLoading(true);
    api
      .dependencies(activeRepo.id, true)
      .then(setGraph)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load dependency graph.'))
      .finally(() => setLoading(false));
  }, [activeRepo]);

  // Filter nodes based on user controls
  const filteredNodes = useMemo(() => {
    if (!graph) return [];
    return graph.nodes.filter((node) => {
      if (search && !node.id.toLowerCase().includes(search.toLowerCase())) return false;
      if (hideIsolated && node.fan_in === 0 && node.fan_out === 0) return false;
      if (cyclesOnly && !node.in_cycle) return false;
      return true;
    });
  }, [graph, search, hideIsolated, cyclesOnly]);

  const filteredNodeIds = useMemo(() => new Set(filteredNodes.map((n) => n.id)), [filteredNodes]);

  // Filter edges based on visible nodes
  const filteredEdges = useMemo(() => {
    if (!graph) return [];
    return graph.edges.filter((e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target));
  }, [graph, filteredNodeIds]);

  // Compute hierarchical layered coordinates
  const nodes = useMemo<Node[]>(() => {
    if (!filteredNodes.length) return [];

    // Group files by layer / directory prefix
    const layers: Record<string, GraphNode[]> = {};
    for (const n of filteredNodes) {
      const parts = n.id.split('/');
      const layerName = parts.length > 1 ? parts[0] : 'root';
      if (!layers[layerName]) layers[layerName] = [];
      layers[layerName].push(n);
    }

    const layerKeys = Object.keys(layers).sort();
    const result: Node[] = [];

    layerKeys.forEach((layerName, layerIdx) => {
      const groupNodes = layers[layerName];
      const xPos = layerIdx * 340 + 50;
      groupNodes.forEach((node, nodeIdx) => {
        const yPos = nodeIdx * 110 + 60;
        const isSelected = selectedNodeId === node.id;

        result.push({
          id: node.id,
          position: { x: xPos, y: yPos },
          sourcePosition: Position.Right,
          targetPosition: Position.Left,
          data: {
            label: (
              <div className="flex flex-col text-left">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-bold text-xs truncate max-w-[140px] text-slate-800">
                    {node.label}
                  </span>
                  {node.in_cycle && (
                    <span className="inline-block w-2 h-2 rounded-full bg-red-500 animate-pulse" title="In circular dependency loop" />
                  )}
                </div>
                <span className="text-[10px] text-slate-400 truncate max-w-[160px] font-mono">
                  {node.id}
                </span>
                <div className="mt-1.5 flex items-center justify-between text-[10px] text-slate-500 border-t pt-1 border-slate-100">
                  <span>in:{node.fan_in} · out:{node.fan_out}</span>
                  <span className="font-semibold text-blue-600">{(node.centrality * 100).toFixed(0)}% rank</span>
                </div>
              </div>
            ),
          },
          style: {
            background: isSelected ? '#eff6ff' : node.in_cycle ? '#fef2f2' : '#ffffff',
            border: isSelected
              ? '2px solid #2563eb'
              : node.in_cycle
              ? '1.5px solid #ef4444'
              : '1px solid #e2e8f0',
            borderRadius: '12px',
            padding: '10px 12px',
            width: 200,
            boxShadow: isSelected ? '0 4px 12px rgba(37,99,235,0.2)' : '0 1px 3px rgba(0,0,0,0.05)',
            cursor: 'pointer',
          },
        });
      });
    });

    return result;
  }, [filteredNodes, selectedNodeId]);

  const edges = useMemo<Edge[]>(() => {
    return filteredEdges.map((edge, index) => {
      const isRelated = selectedNodeId === edge.source || selectedNodeId === edge.target;
      return {
        id: `e-${edge.source}-${edge.target}-${index}`,
        source: edge.source,
        target: edge.target,
        animated: isRelated,
        markerEnd: { type: MarkerType.ArrowClosed, color: isRelated ? '#2563eb' : '#94a3b8' },
        style: {
          stroke: isRelated ? '#2563eb' : '#94a3b8',
          strokeWidth: isRelated ? 2.5 : 1,
          opacity: selectedNodeId ? (isRelated ? 1 : 0.25) : 0.6,
        },
      };
    });
  }, [filteredEdges, selectedNodeId]);

  const selectedNode = useMemo(() => {
    if (!selectedNodeId || !graph) return null;
    return graph.nodes.find((n) => n.id === selectedNodeId) || null;
  }, [selectedNodeId, graph]);

  const nodeDependencies = useMemo(() => {
    if (!selectedNodeId || !graph) return { imports: [], importedBy: [] };
    const imports = graph.edges.filter((e) => e.source === selectedNodeId).map((e) => e.target);
    const importedBy = graph.edges.filter((e) => e.target === selectedNodeId).map((e) => e.source);
    return { imports, importedBy };
  }, [selectedNodeId, graph]);

  return (
    <PageContainer>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <PageHeader
          title="Dependency Graph"
          description="Explore direct dependencies, isolate hotspots, and inspect circular dependency paths without overwhelming the canvas."
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
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-xs">
        <div className="relative min-w-[240px] flex-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search module or file path…"
            className="input pl-9 text-xs py-1.5"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            type="button"
            onClick={() => setHideIsolated(!hideIsolated)}
            className={`rounded-lg px-3 py-1.5 font-semibold transition border ${
              hideIsolated ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-slate-50 text-slate-600 border-slate-200'
            }`}
          >
            Hide Isolated Files
          </button>

          <button
            type="button"
            onClick={() => setCyclesOnly(!cyclesOnly)}
            className={`rounded-lg px-3 py-1.5 font-semibold transition border ${
              cyclesOnly ? 'bg-red-50 text-red-700 border-red-200' : 'bg-slate-50 text-slate-600 border-slate-200'
            }`}
          >
            Cycles Only
          </button>

          <div className="rounded-lg bg-slate-100 px-3 py-1.5 font-mono text-[11px] text-slate-600">
            Nodes: {filteredNodes.length} · Edges: {filteredEdges.length}
          </div>
        </div>
      </div>

      {/* Main Flow Canvas & Details Drawer */}
      <div className="relative h-[650px] card p-0 overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-xs text-slate-500">
            <RotateCw size={18} className="animate-spin text-blue-600" />
            Computing NetworkX graph metrics and PageRank centrality…
          </div>
        ) : graph && nodes.length > 0 ? (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodeClick={(_, node) => setSelectedNodeId(node.id)}
            fitView
            fitViewOptions={{ padding: 0.2 }}
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={24} size={1} color="#e2e8f0" />
            <Controls showInteractive={false} className="bg-white border rounded-xl shadow-xs" />
            <MiniMap
              nodeColor={(n) => {
                const target = graph.nodes.find((item) => item.id === n.id);
                return target?.in_cycle ? '#ef4444' : '#2563eb';
              }}
              style={{ height: 100, width: 140, borderRadius: 8 }}
            />
          </ReactFlow>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">
            No dependency nodes match current filters.
          </div>
        )}

        {/* Selected Node Details Drawer */}
        {selectedNode && (
          <div className="absolute right-4 top-4 z-20 w-80 rounded-2xl border border-slate-200 bg-white/95 p-4 shadow-xl backdrop-blur-md">
            <div className="flex items-start justify-between border-b pb-3">
              <div className="min-w-0">
                <span className="badge bg-blue-50 text-blue-700 border-blue-200 text-[10px] uppercase">
                  {selectedNode.language || 'Code File'}
                </span>
                <h3 className="mt-1 truncate text-sm font-bold text-slate-900">{selectedNode.label}</h3>
                <p className="truncate text-[11px] text-slate-400 font-mono">{selectedNode.id}</p>
              </div>
              <button
                onClick={() => setSelectedNodeId(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={16} />
              </button>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-xl bg-slate-50 p-2.5">
                <span className="text-[10px] text-slate-400 uppercase">Lines of Code</span>
                <p className="text-sm font-bold text-slate-800">{selectedNode.loc}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-2.5">
                <span className="text-[10px] text-slate-400 uppercase">PageRank Centrality</span>
                <p className="text-sm font-bold text-blue-600">{(selectedNode.centrality * 100).toFixed(1)}%</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-2.5">
                <span className="text-[10px] text-slate-400 uppercase">Fan-In (Dependents)</span>
                <p className="text-sm font-bold text-slate-800">{selectedNode.fan_in}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-2.5">
                <span className="text-[10px] text-slate-400 uppercase">Fan-Out (Imports)</span>
                <p className="text-sm font-bold text-slate-800">{selectedNode.fan_out}</p>
              </div>
            </div>

            {selectedNode.in_cycle && (
              <div className="mt-3 rounded-xl bg-red-50 border border-red-200 p-2.5 text-xs text-red-700 flex items-center gap-2">
                <AlertTriangle size={15} className="shrink-0" />
                <span>Participates in a circular dependency loop</span>
              </div>
            )}

            <div className="mt-3 border-t pt-2 text-xs space-y-2">
              <div>
                <p className="text-[11px] font-bold text-slate-500 uppercase">Direct Dependents ({nodeDependencies.importedBy.length})</p>
                <div className="mt-1 max-h-24 overflow-y-auto space-y-1">
                  {nodeDependencies.importedBy.length ? (
                    nodeDependencies.importedBy.map((p) => (
                      <p key={p} className="truncate rounded bg-slate-50 px-2 py-1 text-[11px] font-mono text-slate-700">
                        {p}
                      </p>
                    ))
                  ) : (
                    <p className="text-[11px] text-slate-400">None (Root entrypoint)</p>
                  )}
                </div>
              </div>

              <div>
                <p className="text-[11px] font-bold text-slate-500 uppercase">Direct Imports ({nodeDependencies.imports.length})</p>
                <div className="mt-1 max-h-24 overflow-y-auto space-y-1">
                  {nodeDependencies.imports.length ? (
                    nodeDependencies.imports.map((p) => (
                      <p key={p} className="truncate rounded bg-slate-50 px-2 py-1 text-[11px] font-mono text-slate-700">
                        {p}
                      </p>
                    ))
                  ) : (
                    <p className="text-[11px] text-slate-400">None (Leaf module)</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Circular Dependencies Slide-out Drawer */}
        {showCyclesDrawer && graph?.cycles && (
          <div className="absolute left-4 top-4 z-20 w-96 rounded-2xl border border-red-200 bg-white/95 p-4 shadow-xl backdrop-blur-md">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-1.5 text-sm font-bold text-red-700">
                <AlertTriangle size={16} /> Circular Dependency Loops ({graph.cycles.length})
              </div>
              <button
                onClick={() => setShowCyclesDrawer(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                <X size={16} />
              </button>
            </div>
            <div className="mt-3 max-h-[460px] overflow-y-auto space-y-3">
              {graph.cycles.map((cycle, cIdx) => (
                <div key={cIdx} className="rounded-xl border border-red-100 bg-red-50/50 p-2.5 text-xs">
                  <p className="font-semibold text-red-900 mb-1">Cycle #{cIdx + 1} ({cycle.length} files)</p>
                  <div className="space-y-1">
                    {cycle.map((filePath, fIdx) => (
                      <div
                        key={filePath}
                        onClick={() => setSelectedNodeId(filePath)}
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
