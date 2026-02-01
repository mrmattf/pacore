import { useState, useEffect } from 'react';
import { WorkflowNode } from '@pacore/core';
import { NodeOutputMapper } from './NodeOutputMapper';

interface SchemaFieldProps {
  fieldName: string;
  fieldSchema: any; // JSON Schema for this field
  required: boolean;
  value: any;
  onChange: (value: any) => void;
  existingNodes: WorkflowNode[];
  currentNodeId: string;
  connectedInputs: string[]; // Node IDs connected as inputs
}

export function SchemaField({
  fieldName,
  fieldSchema,
  required,
  value,
  onChange,
  existingNodes,
  currentNodeId,
  connectedInputs
}: SchemaFieldProps) {
  // Determine if current value is mapped or static
  const isMapped = typeof value === 'string' && value.startsWith('$input');
  const [inputMode, setInputMode] = useState<'static' | 'mapped'>(
    isMapped ? 'mapped' : 'static'
  );

  // Update input mode when value changes externally
  useEffect(() => {
    const nowMapped = typeof value === 'string' && value.startsWith('$input');
    setInputMode(nowMapped ? 'mapped' : 'static');
  }, [value]);

  const handleModeChange = (mode: 'static' | 'mapped') => {
    setInputMode(mode);
    if (mode === 'static') {
      // Reset to default or empty based on type
      const defaultValue = fieldSchema.default ?? getTypeDefault(fieldSchema.type);
      onChange(defaultValue);
    } else {
      // Reset to first connected node reference
      onChange(connectedInputs.length > 0 ? `$input[0]` : '');
    }
  };

  const getTypeDefault = (type: string): any => {
    switch (type) {
      case 'string':
        return '';
      case 'number':
      case 'integer':
        return 0;
      case 'boolean':
        return false;
      case 'array':
        return [];
      case 'object':
        return {};
      default:
        return '';
    }
  };

  const renderStaticInput = () => {
    const type = fieldSchema.type;

    switch (type) {
      case 'string':
        // Check if there's an enum (dropdown)
        if (fieldSchema.enum && Array.isArray(fieldSchema.enum)) {
          return (
            <select
              value={value || ''}
              onChange={(e) => onChange(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Select...</option>
              {fieldSchema.enum.map((option: string) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          );
        }

        // Regular text input
        return (
          <input
            type="text"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder={fieldSchema.default || fieldSchema.description || `Enter ${fieldName}...`}
            minLength={fieldSchema.minLength}
            maxLength={fieldSchema.maxLength}
            pattern={fieldSchema.pattern}
          />
        );

      case 'number':
      case 'integer':
        return (
          <input
            type="number"
            value={value ?? ''}
            onChange={(e) => {
              const val = e.target.value;
              onChange(val === '' ? '' : parseFloat(val));
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder={fieldSchema.default?.toString() || '0'}
            min={fieldSchema.minimum}
            max={fieldSchema.maximum}
            step={type === 'integer' ? 1 : 'any'}
          />
        );

      case 'boolean':
        return (
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={!!value}
              onChange={(e) => onChange(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">
              {fieldSchema.description || 'Enable'}
            </span>
          </label>
        );

      case 'array':
      case 'object':
        // Fallback to JSON for complex types
        return (
          <div className="space-y-1">
            <textarea
              value={typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
              onChange={(e) => {
                try {
                  onChange(JSON.parse(e.target.value));
                } catch {
                  // Keep as string if invalid JSON
                  onChange(e.target.value);
                }
              }}
              rows={4}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder={type === 'array' ? '[]' : '{}'}
            />
            <p className="text-xs text-gray-500">
              Enter valid JSON for this {type}
            </p>
          </div>
        );

      default:
        // Fallback for unknown types
        return (
          <input
            type="text"
            value={value || ''}
            onChange={(e) => onChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            placeholder={`Enter ${fieldName}...`}
          />
        );
    }
  };

  return (
    <div className="space-y-2 pb-4 border-b border-gray-100 last:border-b-0">
      {/* Field Label */}
      <label className="block text-sm font-medium text-gray-700">
        {fieldName}
        {required && <span className="text-red-500 ml-1">*</span>}
        {fieldSchema.type && (
          <span className="ml-2 text-xs text-gray-500 font-normal">
            ({fieldSchema.type})
          </span>
        )}
      </label>

      {/* Field Description */}
      {fieldSchema.description && (
        <p className="text-xs text-gray-600">{fieldSchema.description}</p>
      )}

      {/* Input Source Toggle */}
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="radio"
            checked={inputMode === 'static'}
            onChange={() => handleModeChange('static')}
            className="text-blue-600 focus:ring-blue-500"
          />
          <span className="text-gray-700">Static Value</span>
        </label>
        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="radio"
            checked={inputMode === 'mapped'}
            onChange={() => handleModeChange('mapped')}
            className="text-blue-600 focus:ring-blue-500"
            disabled={connectedInputs.length === 0}
          />
          <span className={connectedInputs.length === 0 ? 'text-gray-400' : 'text-gray-700'}>
            Map from Node
          </span>
        </label>
      </div>

      {/* Input Control */}
      {inputMode === 'static' ? (
        renderStaticInput()
      ) : (
        <NodeOutputMapper
          existingNodes={existingNodes}
          currentNodeId={currentNodeId}
          connectedInputs={connectedInputs}
          value={value || ''}
          onChange={onChange}
        />
      )}
    </div>
  );
}
