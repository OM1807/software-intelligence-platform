import { useMemo } from 'react';
import ReactFlow, {
  Background,
  Controls,
  Position,
  type Node,
  type Edge,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { PageContainer, PageHeader } from '@/components/Page';

const nodeBase = {
  sourcePosition: Position.Right,
  targetPosition: Position.Left,
};

const nodes: Node[] = [
  { id: 'gateway', position: { x: 0, y: 120 }, data: { label: 'API Gateway' }, ...nodeBase },
  { id: 'auth', position: { x: 260, y: 0 }, data: { label: 'AuthAPI' }, ...nodeBase },
  { id: 'user', position: { x: 260, y: 140 }, data: { label: 'UserService' }, ...nodeBase },
  { id: 'payment', position: { x: 260, y: 280 }, data: { label: 'PaymentGateway' }, ...nodeBase },
  { id: 'notify', position: { x: 540, y: 60 }, data: { label: 'NotificationService' }, ...nodeBase },
  { id: 'report', position: { x: 540, y: 220 }, data: { label: 'ReportingModule' }, ...nodeBase },
  { id: 'data', position: { x: 820, y: 140 }, data: { label: 'DataLayer' }, ...nodeBase },
  { id: 'utils', position: { x: 540, y: 360 }, data: { label: 'CoreUtils' }, ...nodeBase },
];

const edges: Edge[] = [
  { id: 'e1', source: 'gateway', target: 'auth' },
  { id: 'e2', source: 'gateway', target: 'user' },
  { id: 'e3', source: 'gateway', target: 'payment' },
  { id: 'e4', source: 'auth', target: 'notify' },
  { id: 'e5', source: 'user', target: 'notify' },
  { id: 'e6', source: 'user', target: 'data' },
  { id: 'e7', source: 'payment', target: 'data' },
  { id: 'e8', source: 'report', target: 'data' },
  { id: 'e9', source: 'notify', target: 'data' },
  { id: 'e10', source: 'utils', target: 'data' },
];

export default function DependencyView() {
  const flowNodes = useMemo(
    () =>
      nodes.map((n) => ({
        ...n,
        style: {
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '10px',
          fontSize: '13px',
          fontWeight: 500,
          color: '#0f172a',
          padding: '8px 14px',
          width: 150,
        },
      })),
    [],
  );

  return (
    <PageContainer>
      <PageHeader
        title="Dependency Graph"
        description="Component-level dependencies extracted from the repository."
      />
      <div className="card h-[560px] p-0">
        <ReactFlow
          nodes={flowNodes}
          edges={edges}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={20} size={1} color="#f1f5f9" />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
    </PageContainer>
  );
}
