import { useCallback, useEffect } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  BackgroundVariant,
  ConnectionMode,
} from 'reactflow';
import dagre from 'dagre';
import 'reactflow/dist/style.css';
import { WorkflowDAG } from '@pacore/core';
import { CustomWorkflowNode } from './workflow-nodes/CustomWorkflowNode';

interface WorkflowGraphProps {
  workflow: WorkflowDAG;
  onNodeSelect?: (nodeId: string) => void;
  selectedNodeId?: string | null;
  onConnect?: (sourceId: string, targetId: string) => void;
}

// Node types for React Flow
const nodeTypes = {
  custom: CustomWorkflowNode,
};

// Convert WorkflowDAG to React Flow format
const convertToFlowNodes = (workflow: WorkflowDAG): { nodes: Node[]; edges: Edge[] } => {
  const nodes: Node[] = workflow.nodes.map((node, index) => ({
    id: node.id,
    type: 'custom',
    position: { x: 0, y: 0 }, // Will be set by layout
    data: {
      label: node.description || `Step ${index + 1}`,
      nodeData: node,
    },
  }));

  const edges: Edge[] = workflow.nodes.flatMap((node) =>
    (node.inputs || []).map((inputId) => ({
      id: `${inputId}-${node.id}`,
      source: inputId,
      target: node.id,
      animated: true,
      style: { stroke: '#94a3b8', strokeWidth: 2 },
    }))
  );

  return { nodes, edges };
};

// Auto-layout using Dagre
const getLayoutedElements = (nodes: Node[], edges: Edge[]) => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: 'TB', ranksep: 80, nodesep: 60 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: 250, height: 100 });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  dagre.layout(dagreGraph);

  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    return {
      ...node,
      position: {
        x: nodeWithPosition.x - 125, // Center node (width / 2)
        y: nodeWithPosition.y - 50,  // Center node (height / 2)
      },
    };
  });

  return { nodes: layoutedNodes, edges };
};

export function WorkflowGraph({ workflow, onNodeSelect, selectedNodeId, onConnect }: WorkflowGraphProps) {
  const { nodes: flowNodes, edges: flowEdges } = convertToFlowNodes(workflow);
  const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(flowNodes, flowEdges);

  const [nodes, setNodes, onNodesChange] = useNodesState(layoutedNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(layoutedEdges);

  // Update nodes when workflow changes
  useEffect(() => {
    const { nodes: newFlowNodes, edges: newFlowEdges } = convertToFlowNodes(workflow);
    const { nodes: newLayoutedNodes, edges: newLayoutedEdges } = getLayoutedElements(
      newFlowNodes,
      newFlowEdges
    );
    setNodes(newLayoutedNodes);
    setEdges(newLayoutedEdges);
  }, [workflow, setNodes, setEdges]);

  // Update selected state
  useEffect(() => {
    setNodes((nds) =>
      nds.map((node) => ({
        ...node,
        selected: node.id === selectedNodeId,
      }))
    );
  }, [selectedNodeId, setNodes]);

  const onNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (onNodeSelect) {
        onNodeSelect(node.id);
      }
    },
    [onNodeSelect]
  );

  const onPaneClick = useCallback(() => {
    if (onNodeSelect) {
      onNodeSelect(''); // Deselect by passing empty string
    }
  }, [onNodeSelect]);

  const handleConnect = useCallback(
    (connection: any) => {
      if (onConnect && connection.source && connection.target) {
        onConnect(connection.source, connection.target);
      }
    },
    [onConnect]
  );

  return (
    <div className="w-full h-full bg-gray-50">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        onConnect={handleConnect}
        nodeTypes={nodeTypes}
        connectionMode={ConnectionMode.Loose}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        minZoom={0.5}
        maxZoom={1.5}
      >
        <Background variant={BackgroundVariant.Dots} gap={12} size={1} />
        <Controls />
      </ReactFlow>
    </div>
  );
}
