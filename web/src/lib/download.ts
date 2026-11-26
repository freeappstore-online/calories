/** Save text as a file through the browser's download */
export function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // iOS Safari starts the download asynchronously; revoking immediately cancels it
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
