import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '나홀로섬에',
  description: '혼자 사는 작은 섬에 유리병 편지가 밀려옵니다.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <head>
        {/* 화면 전체에 쓰는 넥슨 Lv1 고딕은 먼저 받아 둔다(편지·시계 글꼴은 쓸 때 받는다) */}
        <link rel="preload" href="/fonts/nexon-lv1-gothic.woff2" as="font" type="font/woff2" crossOrigin="" />
      </head>
      <body>{children}</body>
    </html>
  );
}
