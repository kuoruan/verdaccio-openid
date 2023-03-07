/**
 * Copy text to the clipboard.
 *
 * @param text the text to copy to the clipboard
 */
export async function copyToClipboard(text: string) {
  await navigator.clipboard.writeText(text);
}
