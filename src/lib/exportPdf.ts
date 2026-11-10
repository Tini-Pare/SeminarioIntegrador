import { File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

// A4 in points (72 per inch); expo-print defaults to US Letter.
const A4 = { width: 595, height: 842 };
// iOS ignores @page margins and takes them from here; Android uses the
// @page rule in the document's CSS.
const MARGINS = { top: 40, bottom: 40, left: 34, right: 34 };

// Mobile: renders the HTML to a PDF file, names it, and opens the share
// sheet so the admin can send it (mail, WhatsApp, Drive) or print it.
// The web build uses exportPdf.web.ts instead.
export async function exportHtmlAsPdf(html: string, baseName: string): Promise<void> {
  const { uri } = await Print.printToFileAsync({ html, ...A4, margins: MARGINS });

  // printToFileAsync leaves a random name in the cache; give it a readable
  // one, since that's the name the recipient sees.
  const named = new File(Paths.cache, `${baseName}.pdf`);
  if (named.exists) named.delete();
  new File(uri).move(named);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(named.uri, {
      mimeType: "application/pdf",
      UTI: "com.adobe.pdf",
      dialogTitle: "Exportar estadísticas",
    });
  } else {
    await Print.printAsync({ uri: named.uri });
  }
}
