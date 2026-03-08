import type { TemplateContent } from '@pacore/core';

/**
 * Applies flat `templates.{templateKey}.{field}` entries from fieldOverrides
 * onto a resolved TemplateContent.
 *
 * Fixes the bug where editable field overrides (subject, intro, body, closing)
 * are stored in fieldOverrides but never applied during rendering — chains
 * read from namedTemplates directly, so overrides were silently ignored.
 */
export function applyTemplateFieldOverrides(
  base: TemplateContent,
  templateKey: string,
  fieldOverrides: Record<string, unknown>
): TemplateContent {
  const overrides: Partial<TemplateContent> = {};
  for (const field of ['subject', 'intro', 'body', 'closing'] as const) {
    const val = fieldOverrides[`templates.${templateKey}.${field}`];
    if (val !== undefined && val !== '') overrides[field] = val as string;
  }
  return { ...base, ...overrides };
}
