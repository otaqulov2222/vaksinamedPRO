import { ScrollViewStyleReset } from 'expo-router/html';
import { type PropsWithChildren } from 'react';

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="uz">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" />
        <ScrollViewStyleReset />
        {/* 100vw + scrollbar = chap kesilish; faqat 100% ishlatiladi */}
        <style
          dangerouslySetInnerHTML={{
            __html: `
              html, body {
                margin: 0;
                padding: 0;
                height: 100%;
                overflow: hidden;
                background-color: #F7F5F2;
              }
              #root {
                height: 100%;
                width: 100%;
                max-width: 100%;
                overflow: hidden;
                display: flex;
                flex-direction: column;
              }
              #root > div {
                flex: 1;
                min-height: 0;
                min-width: 0;
                width: 100%;
                max-width: 100%;
              }
              *, *::before, *::after {
                box-sizing: border-box;
              }
            `,
          }}
        />
        <script src="https://telegram.org/js/telegram-web-app.js"></script>
      </head>
      <body>{children}</body>
    </html>
  );
}
