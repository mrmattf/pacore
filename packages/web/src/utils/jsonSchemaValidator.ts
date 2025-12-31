import { JSONSchema } from '@pacore/core';

export interface ValidationError {
  field: string;
  message: string;
}

/**
 * Validate a value against a JSON Schema
 * Skips validation for mapped values (strings starting with $input)
 */
export function validateAgainstSchema(
  value: Record<string, any>,
  schema: JSONSchema
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Check required fields
  if (schema.required) {
    for (const requiredField of schema.required) {
      const fieldValue = value[requiredField];
      const isMapped = typeof fieldValue === 'string' && fieldValue.startsWith('$input');

      // Required field is missing or empty (unless it's a mapped value)
      if (!isMapped && (!(requiredField in value) || fieldValue === undefined || fieldValue === '')) {
        errors.push({
          field: requiredField,
          message: `${requiredField} is required`
        });
      }
    }
  }

  // Type checking for each property
  if (schema.properties) {
    for (const [fieldName, fieldSchema] of Object.entries(schema.properties)) {
      if (!(fieldName in value)) continue;

      const fieldValue = value[fieldName];

      // Skip validation for mapped values (they start with $input)
      if (typeof fieldValue === 'string' && fieldValue.startsWith('$input')) {
        continue;
      }

      const fs = fieldSchema as any;
      const expectedType = fs.type;

      if (!expectedType) continue;

      // Determine actual type
      let actualType: string;
      if (Array.isArray(fieldValue)) {
        actualType = 'array';
      } else if (fieldValue === null) {
        actualType = 'null';
      } else {
        actualType = typeof fieldValue;
      }

      // Skip if field is undefined or empty string (handled by required check)
      if (fieldValue === undefined || fieldValue === '') continue;

      // Type validation
      const isValidType =
        expectedType === actualType ||
        (expectedType === 'integer' && actualType === 'number' && Number.isInteger(fieldValue));

      if (!isValidType) {
        errors.push({
          field: fieldName,
          message: `Expected type ${expectedType}, got ${actualType}`
        });
      }

      // Additional validations for specific types
      if (expectedType === 'number' || expectedType === 'integer') {
        if (actualType === 'number') {
          // Min/max validation
          if (fs.minimum !== undefined && fieldValue < fs.minimum) {
            errors.push({
              field: fieldName,
              message: `Value must be >= ${fs.minimum}`
            });
          }
          if (fs.maximum !== undefined && fieldValue > fs.maximum) {
            errors.push({
              field: fieldName,
              message: `Value must be <= ${fs.maximum}`
            });
          }
        }
      }

      if (expectedType === 'string' && actualType === 'string') {
        // Min/max length validation
        if (fs.minLength !== undefined && fieldValue.length < fs.minLength) {
          errors.push({
            field: fieldName,
            message: `Must be at least ${fs.minLength} characters`
          });
        }
        if (fs.maxLength !== undefined && fieldValue.length > fs.maxLength) {
          errors.push({
            field: fieldName,
            message: `Must be at most ${fs.maxLength} characters`
          });
        }

        // Pattern validation
        if (fs.pattern) {
          const regex = new RegExp(fs.pattern);
          if (!regex.test(fieldValue)) {
            errors.push({
              field: fieldName,
              message: `Must match pattern: ${fs.pattern}`
            });
          }
        }

        // Enum validation
        if (fs.enum && !fs.enum.includes(fieldValue)) {
          errors.push({
            field: fieldName,
            message: `Must be one of: ${fs.enum.join(', ')}`
          });
        }
      }
    }
  }

  return errors;
}

/**
 * Extract default values from a JSON Schema
 */
export function getSchemaDefaults(schema: JSONSchema): Record<string, any> {
  const defaults: Record<string, any> = {};

  if (schema.properties) {
    for (const [fieldName, fieldSchema] of Object.entries(schema.properties)) {
      const fs = fieldSchema as any;
      if (fs.default !== undefined) {
        defaults[fieldName] = fs.default;
      }
    }
  }

  return defaults;
}

/**
 * Get a user-friendly type display name
 */
export function getTypeDisplayName(type: string): string {
  const typeMap: Record<string, string> = {
    string: 'Text',
    number: 'Number',
    integer: 'Integer',
    boolean: 'Yes/No',
    array: 'List',
    object: 'Object'
  };
  return typeMap[type] || type;
}
