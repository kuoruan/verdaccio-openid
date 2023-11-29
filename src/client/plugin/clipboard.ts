/**
 * Copy text to the clipboard.
 *
 * @param text the text to copy to the clipboard
 */
export function copyToClipboard(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}
