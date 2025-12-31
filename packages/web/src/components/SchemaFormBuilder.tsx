import { useState, useEffect } from 'react';
import { JSONSchema, WorkflowNode } from '@pacore/core';
import { SchemaField } from './SchemaField';
import { validateAgainstSchema, ValidationError } from '../utils/jsonSchemaValidator';
import { AlertCircle } from 'lucide-react';

interface SchemaFormBuilderProps {
  schema: JSONSchema;
  value: Record<string, any>;
  onChange: (value: Record<string, any>) => void;
  existingNodes: WorkflowNode[];
  currentNodeId: string;
}

export function SchemaFormBuilder({
  schema,
  value,
  onChange,
  existingNodes,
  currentNodeId
}: SchemaFormBuilderProps) {
  const [viewMode, setViewMode] = useState<'form' | 'json'>('form');
  const [jsonText, setJsonText] = useState('');
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);

  // Sync JSON text with value
  useEffect(() => {
    setJsonText(JSON.stringify(value, null, 2));
  }, [value]);

  // Validate on value changes
  useEffect(() => {
    const errors = validateAgainstSchema(value, schema);
    setValidationErrors(errors);
  }, [value, schema]);

  const handleFieldChange = (fieldName: string, fieldValue: any) => {
    onChange({
      ...value,
      [fieldName]: fieldValue
    });
  };

  const handleJsonChange = (text: string) => {
    setJsonText(text);
    try {
      const parsed = JSON.parse(text);
      setJsonError(null);
      onChange(parsed);
    } catch (error) {
      setJsonError((error as Error).message);
      // Don't update value if JSON is invalid
    }
  };

  if (!schema.properties || Object.keys(schema.properties).length === 0) {
    return (
      <div className="text-sm text-gray-500 bg-gray-50 p-4 rounded border border-gray-200">
        <p className="font-medium">No parameters required</p>
        <p className="text-xs mt-1">This tool does not require any input parameters.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* View Mode Toggle */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setViewMode('form')}
          className={`px-3 py-2 text-sm font-medium transition-colors ${
            viewMode === 'form'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Form View
        </button>
        <button
          onClick={() => setViewMode('json')}
          className={`px-3 py-2 text-sm font-medium transition-colors ${
            viewMode === 'json'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          JSON View
        </button>
      </div>

      {/* Validation Errors */}
      {validationErrors.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h4 className="text-sm font-medium text-red-800">Validation Errors</h4>
              <ul className="mt-1 text-sm text-red-700 space-y-1">
                {validationErrors.map((error, idx) => (
                  <li key={idx} className="flex items-start gap-1">
                    <span className="font-medium">{error.field}:</span>
                    <span>{error.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Form or JSON View */}
      {viewMode === 'form' ? (
        <div className="space-y-4">
          {Object.entries(schema.properties).map(([fieldName, fieldSchema]) => (
            <SchemaField
              key={fieldName}
              fieldName={fieldName}
              fieldSchema={fieldSchema}
              required={schema.required?.includes(fieldName) || false}
              value={value[fieldName]}
              onChange={(v) => handleFieldChange(fieldName, v)}
              existingNodes={existingNodes}
              currentNodeId={currentNodeId}
            />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          <textarea
            value={jsonText}
            onChange={(e) => handleJsonChange(e.target.value)}
            rows={12}
            className="w-full px-3 py-2 border border-gray-300 rounded-md font-mono text-xs focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder='{"key": "value"}'
          />
          {jsonError && (
            <div className="flex items-start gap-2 text-sm text-red-600">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>Invalid JSON: {jsonError}</span>
            </div>
          )}
          <p className="text-xs text-gray-500">
            Advanced mode: Edit parameters as JSON. Use $input[0], $input[0].field for mapped values.
          </p>
        </div>
      )}
    </div>
  );
}
