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
        <link rel="preload" href="/fonts/Feather.ttf" as="font" type="font/ttf" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/MaterialCommunityIcons.ttf" as="font" type="font/ttf" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/Inter-Regular.ttf" as="font" type="font/ttf" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/Inter-SemiBold.ttf" as="font" type="font/ttf" crossOrigin="anonymous" />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              @font-face {
                font-family: 'feather';
                src: url('/fonts/Feather.ttf') format('truetype');
                font-display: swap;
              }
              @font-face {
                font-family: 'Feather';
                src: url('/fonts/Feather.ttf') format('truetype');
                font-display: swap;
              }
              @font-face {
                font-family: 'material-community';
                src: url('/fonts/MaterialCommunityIcons.ttf') format('truetype');
                font-display: swap;
              }
              @font-face {
                font-family: 'MaterialCommunityIcons';
                src: url('/fonts/MaterialCommunityIcons.ttf') format('truetype');
                font-display: swap;
              }
              @font-face {
                font-family: 'Material Design Icons';
                src: url('/fonts/MaterialCommunityIcons.ttf') format('truetype');
                font-display: swap;
              }
              @font-face {
                font-family: 'MaterialIcons';
                src: url('/fonts/MaterialIcons.ttf') format('truetype');
                font-display: swap;
              }
              @font-face {
                font-family: 'Ionicons';
                src: url('/fonts/Ionicons.ttf') format('truetype');
                font-display: swap;
              }
              @font-face {
                font-family: 'Inter_400Regular';
                src: url('/fonts/Inter-Regular.ttf') format('truetype');
                font-display: swap;
              }
              @font-face {
                font-family: 'Inter_500Medium';
                src: url('/fonts/Inter-Medium.ttf') format('truetype');
                font-display: swap;
              }
              @font-face {
                font-family: 'Inter_600SemiBold';
                src: url('/fonts/Inter-SemiBold.ttf') format('truetype');
                font-display: swap;
              }
              @font-face {
                font-family: 'Inter_700Bold';
                src: url('/fonts/Inter-Bold.ttf') format('truetype');
                font-display: swap;
              }
              @font-face {
                font-family: 'Inter';
                src: url('/fonts/Inter-Regular.ttf') format('truetype');
                font-weight: 400;
                font-display: swap;
              }
              @font-face {
                font-family: 'Inter';
                src: url('/fonts/Inter-Medium.ttf') format('truetype');
                font-weight: 500;
                font-display: swap;
              }
              @font-face {
                font-family: 'Inter';
                src: url('/fonts/Inter-SemiBold.ttf') format('truetype');
                font-weight: 600;
                font-display: swap;
              }
              @font-face {
                font-family: 'Inter';
                src: url('/fonts/Inter-Bold.ttf') format('truetype');
                font-weight: 700;
                font-display: swap;
              }

              html, body {
                margin: 0;
                padding: 0;
                height: 100%;
                overflow: hidden;
                background-color: #F7F5F2;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
                -webkit-font-smoothing: antialiased;
                -moz-osx-font-smoothing: grayscale;
              }
              #root {
                height: 100%;
                width: 100%;
                max-width: 100%;
                overflow: hidden;
                display: flex;
                flex-direction: column;
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
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
              input, textarea, button, select {
                font-family: 'Inter', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif !important;
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
