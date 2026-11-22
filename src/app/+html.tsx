import { ScrollViewStyleReset, useServerDocumentContext } from "expo-router/html";
import { type PropsWithChildren } from "react";

// This file is web-only and used to configure the root HTML for every
// web page during web builds and development. Setting lang="es" and
// google notranslate prevents browsers (Chrome, Edge) from detecting
// the page as English and mistranslating words like "Media" to "Medios de comunicación".
//
// Since SDK 58 the server hands the bundle's <script>s, the CSS, the
// favicon and the react-native-web styles to this component through
// useServerDocumentContext() instead of splicing them into the HTML string:
// leaving out headNodes/bodyNodes renders a page with no JS (blank on web).
export default function Root({ children }: PropsWithChildren) {
  const { htmlAttributes, headNodes, bodyAttributes, bodyNodes } = useServerDocumentContext();

  return (
    <html lang="es" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        <meta name="google" content="notranslate" />
        <ScrollViewStyleReset />
        {headNodes}
      </head>

      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}
