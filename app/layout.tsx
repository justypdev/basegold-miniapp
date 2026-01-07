// app/layout.tsx
import type { Metadata } from 'next';
import { Providers } from './providers';
import './globals.css';

const URL = process.env.NEXT_PUBLIC_URL || 'https://your-app.vercel.app';

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: 'BaseGold Miner - Play & Burn',
    description: 'Mine gold, buy upgrades, and help burn $BG tokens! The inverse of Bitcoin mining.',
    other: {
      'fc:miniapp': JSON.stringify({
        version: 'next',
        imageUrl: `${URL}/og-image.png`,
        button: {
          title: '⛏️ Start Mining',
          action: {
            type: 'launch_miniapp',
            name: 'BaseGold Miner',
            url: URL,
            splashImageUrl: `${URL}/splash.png`,
            splashBackgroundColor: '#0A0A0A',
          },
        },
      }),
    },
  };
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
