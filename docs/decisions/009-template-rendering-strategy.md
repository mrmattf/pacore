# ADR-009: Plain-Text Template Base with Per-Adapter Renderers

**Date:** 2026-03
**Status:** Accepted
**Affects:** `packages/cloud/src/skills/templates/`, `packages/cloud/src/integrations/gorgias/`, `packages/cloud/src/integrations/zendesk/`, `packages/cloud/src/integrations/reamaze/`, `packages/core/src/types/skill-template.ts`

---

## Context

The initial template engine stored all message content as HTML strings. This caused several problems:

1. **Re:amaze does not accept HTML** — Re:amaze's conversation API expects plain text. Sending HTML produced raw `<p>` and `<br>` tags in customer-facing messages.
2. **Editing experience was broken** — Editable fields (`intro`, `body`, `closing`) exposed raw HTML to users in the Customize tab, requiring them to write `<br>` for newlines.
3. **Subject lines were not editable** — The `subject` field was only overridable at the chain level via `applyTemplateFieldOverrides()`, and the field overrides stored in `UserSkillConfig.fieldOverrides` were never applied to subjects during rendering.
4. **No visibility into available variables** — Users editing templates had no way to know what `{{variables}}` were available without reading source code.

## Decision

### Plain-Text Base Templates

All `NamedTemplates` store content as **plain text** with `\n` line breaks, never HTML:

```typescript
intro: "Hi {{customerName}},",
body: "Your order #{{orderNumber}} contains items that are currently out of stock:\n\n{{backorderedItems}}",
closing: "We'll notify you as soon as your items ship.\n\nThank you for your patience."
```

HTML rendering is the adapter's responsibility, not the template's.

### Per-Adapter Renderers

Each `NotificationToolAdapter` implementation applies the appropriate transformation:

- **Gorgias / Zendesk** — `nl2br()`: replace `\n` with `<br>` and wrap in `<p>` tags for HTML ticket bodies
- **Re:amaze** — `renderTemplatePlainText()`: pass through as-is, no HTML transformation

The `CreateTicketParams` interface now carries both:
```typescript
message: string;           // HTML (for adapters that accept it)
messagePlainText: string;  // Plain text (for adapters that require it)
```

Adapter implementations use whichever field matches their API requirements.

### Editable Fields Exposed in UI

Template variants declare `editableFields` including `intro`, `body`, `closing`, and `subject`. The Customize tab in `SkillConfigPage` renders a textarea for each editable field pre-filled with the template default. User edits are stored in `UserSkillConfig.fieldOverrides` and applied at render time via `applyTemplateFieldOverrides()`.

The `subject` field override bug (overrides stored but never applied during rendering) was fixed: `applyTemplateFieldOverrides()` is now called in all 4 rendering chains and in the gateway `test-event` handler.

### Template Variables as Discoverable Chips

Template variants declare `templateVariables`:
```typescript
templateVariables: [
  { name: 'customerName', description: 'Customer full name' },
  { name: 'orderNumber', description: 'Shopify order number' },
  { name: 'backorderedItems', description: 'List of backordered line items' },
]
```

The Customize tab renders these as clickable chips. Clicking a chip inserts the `{{variable}}` token into the active textarea, so users can reference variables without memorizing syntax.

### Re:amaze Branding Scope

Re:amaze manages branding (logo, company name) at the account level. The Re:amaze template variant therefore exposes only `signature` as an editable field — no `logo` or `companyName` fields. Gorgias and Zendesk variants retain `logo` and `companyName` as editable fields since those platforms accept HTML with embedded branding.

## Alternatives Considered

1. **Markdown base format** — considered; rejected because Gorgias/Zendesk expect HTML, not Markdown, and converting Markdown → HTML introduces a dependency (markdown-it, remark) for marginal benefit. Plain text + nl2br is simpler.
2. **Single `message` field, adapter strips HTML** — rejected: adapters should not have to parse or strip HTML; cleaner to pass both representations and let each adapter choose.
3. **Separate template definitions per adapter** — rejected: would require maintaining 3 copies of every message body. The base template + per-adapter renderer keeps content DRY.

## Consequences

- Re:amaze customers receive clean plain-text messages; Gorgias/Zendesk customers receive properly formatted HTML — same source template, different output.
- Users editing templates in the Customize tab see natural text with `\n` newlines, not HTML tags.
- Adding a new adapter that requires a third format (e.g., Markdown for Intercom) requires only a new renderer method, not new template content.
- `CreateTicketParams` carries both `message` (HTML) and `messagePlainText` — adapters that don't need both can ignore one field.
- Subject overrides now work correctly across all rendering paths; previously stored user overrides are now applied.
