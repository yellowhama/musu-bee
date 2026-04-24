import { Html, Head, Main, NextScript } from "next/document";

export default function Document() {
  return (
    <Html lang="ko">
      <Head />
      <body style={{ margin: 0, background: "var(--bg-base)" }}>
        <Main />
        <NextScript />
      </body>
    </Html>
  );
}
