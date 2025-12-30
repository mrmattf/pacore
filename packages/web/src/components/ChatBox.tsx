import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

interface WorkflowIntent {
  detected: boolean;
  intentType?: 'create' | 'execute';
  confidence: number;
  description: string;
  workflowId?: string;
  workflowName?: string;
  workflowDescription?: string;
  nodeCount?: number;
}

interface Message {
  role: 'user' | 'assistant' | 'workflow-intent';
  content: string;
  workflowIntent?: WorkflowIntent;
}

interface Props {
  messages: Message[];
  onConfirmExecution?: (workflowId: string) => void;
  onCreateWorkflow?: () => void;
  onDismissIntent?: (messageIndex: number) => void;
}

export function ChatBox({ messages, onConfirmExecution, onCreateWorkflow, onDismissIntent }: Props) {
  const endRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Process markdown links in messages: [text](/path)
  const renderMessageContent = (content: string) => {
    const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
    const parts: (string | JSX.Element)[] = [];
    let lastIndex = 0;
    let match;

    while ((match = linkRegex.exec(content)) !== null) {
      // Add text before link
      if (match.index > lastIndex) {
        parts.push(content.substring(lastIndex, match.index));
      }

      // Add clickable link
      const linkText = match[1];
      const linkPath = match[2];
      parts.push(
        <a
          key={match.index}
          href={linkPath}
          onClick={(e) => {
            e.preventDefault();
            navigate(linkPath);
          }}
          className="underline hover:text-blue-800 cursor-pointer"
        >
          {linkText}
        </a>
      );

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < content.length) {
      parts.push(content.substring(lastIndex));
    }

    return parts.length > 0 ? <>{parts}</> : content;
  };

  return (
    <div className="space-y-4">
      {messages.map((message, index) => {
        // Workflow intent message - render as special confirmation card
        if (message.role === 'workflow-intent' && message.workflowIntent) {
          const intent = message.workflowIntent;
          const isExecute = intent.intentType === 'execute';
          const isCreate = intent.intentType === 'create';

          return (
            <div key={index} className="flex justify-start">
              <div className={`max-w-2xl w-full rounded-lg p-4 border-l-4 ${
                isExecute
                  ? 'bg-yellow-50 border-yellow-500'
                  : isCreate
                  ? 'bg-blue-50 border-blue-500'
                  : 'bg-purple-50 border-purple-500'
              }`}>
                <div className="flex items-start justify-between mb-2">
                  <h4 className={`font-semibold ${
                    isExecute ? 'text-yellow-900' : isCreate ? 'text-blue-900' : 'text-purple-900'
                  }`}>
                    {isExecute && 'Confirm Workflow Execution'}
                    {isCreate && 'Workflow Creation Opportunity'}
                    {!isExecute && !isCreate && 'Workflow Automation Detected'}
                  </h4>
                  {onDismissIntent && (
                    <button
                      onClick={() => onDismissIntent(index)}
                      className="text-gray-400 hover:text-gray-600"
                      title="Dismiss"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <p className={`text-sm mb-2 ${
                  isExecute ? 'text-yellow-700' : isCreate ? 'text-blue-700' : 'text-purple-700'
                }`}>
                  {intent.description}
                </p>

                {isExecute && (
                  <div className="space-y-2 mb-3">
                    {intent.workflowName && (
                      <div className="text-sm">
                        <span className="font-semibold text-gray-700">Workflow:</span>{' '}
                        <span className="text-gray-900">{intent.workflowName}</span>
                      </div>
                    )}
                    {intent.workflowDescription && (
                      <div className="text-sm">
                        <span className="font-semibold text-gray-700">Description:</span>{' '}
                        <span className="text-gray-600">{intent.workflowDescription}</span>
                      </div>
                    )}
                    {intent.nodeCount !== undefined && (
                      <div className="text-sm text-gray-600">
                        {intent.nodeCount} {intent.nodeCount === 1 ? 'step' : 'steps'}
                      </div>
                    )}
                  </div>
                )}

                <div className="text-xs text-gray-600 mb-3">
                  Confidence: {(intent.confidence * 100).toFixed(0)}%
                </div>

                {isExecute && onConfirmExecution && intent.workflowId && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => onConfirmExecution(intent.workflowId!)}
                      className="text-sm px-3 py-1.5 bg-yellow-600 text-white rounded hover:bg-yellow-700 transition-colors"
                    >
                      Execute Workflow
                    </button>
                    <button
                      onClick={() => onDismissIntent && onDismissIntent(index)}
                      className="text-sm px-3 py-1.5 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {isCreate && onCreateWorkflow && (
                  <div>
                    <button
                      onClick={onCreateWorkflow}
                      className="text-sm px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
                    >
                      Create Workflow
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        }

        // Regular message - user or assistant
        return (
          <div
            key={index}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-2xl px-4 py-2 rounded-lg ${
                message.role === 'user'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-900'
              }`}
            >
              <p className="whitespace-pre-wrap">{renderMessageContent(message.content)}</p>
            </div>
          </div>
        );
      })}
      <div ref={endRef} />
    </div>
  );
}
