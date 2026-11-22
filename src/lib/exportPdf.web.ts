// Web: expo-print can't render arbitrary HTML here (its web printAsync and
// printToFileAsync just call window.print() on the app itself), so the
// report is loaded into a hidden iframe and that frame is printed. The
// browser's dialog offers "Guardar como PDF" as well as real printers.
export async function exportHtmlAsPdf(html: string, baseName: string): Promise<void> {
  const iframe = document.createElement("iframe");
  // Off-screen but not display:none — some browsers won't print a frame
  // that isn't rendered.
  iframe.setAttribute("aria-hidden", "true");
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";

  await new Promise<void>((resolve, reject) => {
    iframe.onload = () => resolve();
    iframe.onerror = () => reject(new Error("No se pudo preparar el PDF."));
    iframe.srcdoc = html;
    document.body.appendChild(iframe);
  });

  const frameWindow = iframe.contentWindow;
  if (!frameWindow) {
    iframe.remove();
    throw new Error("No se pudo preparar el PDF.");
  }

  // Chrome names the saved PDF after the top document's title, not the
  // frame's, so borrow it for the duration of the dialog.
  const previousTitle = document.title;
  document.title = baseName;

  const cleanup = () => {
    document.title = previousTitle;
    iframe.remove();
  };
  // print() blocks until the dialog closes in Chrome/Edge/Firefox but not
  // in Safari, so clean up on afterprint, with a fallback for browsers that
  // don't fire it.
  frameWindow.addEventListener("afterprint", cleanup, { once: true });
  setTimeout(() => {
    if (iframe.isConnected) cleanup();
  }, 60_000);

  frameWindow.focus();
  frameWindow.print();
}
