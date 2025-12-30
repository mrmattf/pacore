import { Zap, AlertCircle, X } from 'lucide-react';

interface WorkflowIntent {
  detected: boolean;
  intentType?: 'create' | 'execute';
  confidence: number;
  description: string;
  workflowId?: string;
  workflowName?: string;
  workflowDescription?: string;
  nodeCount?: number;
  executionId?: string;
}

interface WorkflowIntentBannerProps {
  intent: WorkflowIntent;
  onConfirmExecution?: (workflowId: string) => void;
  onCreateWorkflow?: () => void;
  onDismiss: () => void;
}

export function WorkflowIntentBanner({
  intent,
  onConfirmExecution,
  onCreateWorkflow,
  onDismiss,
}: WorkflowIntentBannerProps) {
  if (!intent.detected) return null;

  const isExecute = intent.intentType === 'execute';
  const isCreate = intent.intentType === 'create';
  const isPendingConfirmation = isExecute && !intent.executionId;

  return (
    <div
      className={`rounded-lg p-4 border-l-4 ${
        isPendingConfirmation
          ? 'bg-yellow-50 border-yellow-500'
          : isCreate
          ? 'bg-blue-50 border-blue-500'
          : 'bg-purple-50 border-purple-500'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0">
          {isPendingConfirmation ? (
            <AlertCircle className="w-5 h-5 text-yellow-600" />
          ) : isCreate ? (
            <Zap className="w-5 h-5 text-blue-600" />
          ) : (
            <AlertCircle className="w-5 h-5 text-purple-600" />
          )}
        </div>

        <div className="flex-1">
          <div className="flex items-center justify-between">
            <h3
              className={`font-semibold ${
                isPendingConfirmation
                  ? 'text-yellow-900'
                  : isCreate
                  ? 'text-blue-900'
                  : 'text-purple-900'
              }`}
            >
              {isPendingConfirmation && 'Confirm Workflow Execution'}
              {isCreate && 'Workflow Creation Opportunity'}
              {!isExecute && !isCreate && 'Workflow Automation Detected'}
            </h3>
            <button
              onClick={onDismiss}
              className="text-gray-400 hover:text-gray-600"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <p
            className={`text-sm mt-1 ${
              isPendingConfirmation
                ? 'text-yellow-700'
                : isCreate
                ? 'text-blue-700'
                : 'text-purple-700'
            }`}
          >
            {intent.description}
          </p>

          {isPendingConfirmation && (
            <div className="mt-3 space-y-2">
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

          <div className="mt-2 text-xs text-gray-600">
            Confidence: {(intent.confidence * 100).toFixed(0)}%
          </div>

          {isPendingConfirmation && onConfirmExecution && intent.workflowId && (
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => onConfirmExecution(intent.workflowId!)}
                className="text-sm px-3 py-1.5 bg-yellow-600 text-white rounded hover:bg-yellow-700 transition-colors"
              >
                Execute Workflow
              </button>
              <button
                onClick={onDismiss}
                className="text-sm px-3 py-1.5 bg-gray-200 text-gray-700 rounded hover:bg-gray-300 transition-colors"
              >
                Cancel
              </button>
            </div>
          )}

          {isCreate && onCreateWorkflow && (
            <div className="mt-3">
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
    </div>
  );
}
