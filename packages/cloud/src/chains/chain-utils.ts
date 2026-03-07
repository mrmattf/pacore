/**
 * Converts an HTML message string to readable plain text for use in
 * execution step previews. Block-level tags become newlines; all other
 * tags are stripped. Common HTML entities are decoded. Excess whitespace
 * is collapsed.
 */
export function toPlainText(html: string, maxLen = 600): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:p|div|tr|li|h[1-6]|table|thead|tbody|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#\d+;/g, '')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .slice(0, maxLen);
}
