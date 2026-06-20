/** Trigger a browser download of text content as a file. Shared by the CSV template
 * download and the rebalance-plan export so the Blob/objectURL dance lives in one place. */
export function downloadText(content: string, filename: string, mime = "text/csv;charset=utf-8;") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
