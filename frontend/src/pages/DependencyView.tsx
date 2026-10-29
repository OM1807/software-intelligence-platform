import { useEffect, useMemo, useState } from 'react';
import ReactFlow, { Background, Controls, Position, type Node, type Edge } from 'reactflow';
import 'reactflow/dist/style.css';
import { api, type DependencyGraph } from '@/api';
import { PageContainer, PageHeader } from '@/components/Page';
import { useRepos } from '@/context/RepoContext';

export default function DependencyView() {
  const { activeRepo } = useRepos();
  const [graph, setGraph] = useState<DependencyGraph | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!activeRepo || activeRepo.status !== 'completed') return;
    api.dependencies(activeRepo.id).then(setGraph).catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to load dependency graph.'));
  }, [activeRepo]);
  const nodes = useMemo<Node[]>(() => (graph?.nodes ?? []).map((node, index) => ({
    id: node.id, position: { x: (index % 4) * 220, y: Math.floor(index / 4) * 120 },
    data: { label: node.label }, sourcePosition: Position.Right, targetPosition: Position.Left,
    style: { background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', fontSize: '13px', color: '#0f172a', padding: '8px 14px', width: 180 },
  })), [graph]);
  const edges = useMemo<Edge[]>(() => (graph?.edges ?? []).map((edge, index) => ({ id: `e${index}`, source: edge.source, target: edge.target, label: String(edge.weight) })), [graph]);
  return <PageContainer>
    <PageHeader title="Dependency Graph" description="Dependencies extracted from the connected repository." />
    {error && <p role="alert" className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-800">{error}</p>}
    <div className="card h-[560px] p-0">{graph ? <ReactFlow nodes={nodes} edges={edges} fitView proOptions={{ hideAttribution: true }}><Background gap={20} size={1} color="#f1f5f9" /><Controls showInteractive={false} /></ReactFlow> : <p className="p-4 text-sm text-slate-500">No dependency graph is available yet.</p>}</div>
  </PageContainer>;
}
