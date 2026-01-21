'use client';

import { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, cookieToInitialState, type Config } from 'wagmi';
import { OnchainKitProvider } from '@coinbase/onchainkit';
import { base } from '@reown/appkit/networks';
import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';

// Your Reown project ID
const projectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID || 'd394a77c2b0d10d504be213594316d9a';

// App metadata for wallet connections
const metadata = {
  name: 'BaseGold Miner',
  description: 'Mine gold, burn BG tokens, climb the leaderboard!',
  url: 'https://basegold-miniapp.vercel.app',
  icons: ['https://basegold.io/logo.png'],
};

// Configure Wagmi adapter for Base network
const wagmiAdapter = new WagmiAdapter({
  networks: [base],
  projectId,
  ssr: true,
});

// Create the AppKit instance with all features enabled
createAppKit({
  adapters: [wagmiAdapter],
  networks: [base],
  projectId,
  metadata,
  // Enable all the cool features
  features: {
    analytics: true,
    onramp: true,      // Buy ETH with card
    swaps: true,       // Swap ETH <-> BG right in the modal!
    email: false,      // Keep it simple - wallet only
    socials: false,
  },
  // Gold theme to match BaseGold branding
  themeMode: 'dark',
  themeVariables: {
    '--w3m-accent': '#D4AF37',
    '--w3m-color-mix': '#D4AF37',
    '--w3m-color-mix-strength': 20,
    '--w3m-border-radius-master': '12px',
  },
});

const queryClient = new QueryClient();

export default function Providers({ 
  children,
  cookies 
}: { 
  children: ReactNode;
  cookies?: string | null;
}) {
  const initialState = cookieToInitialState(wagmiAdapter.wagmiConfig as Config, cookies);

  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig as Config} initialState={initialState}>
      <QueryClientProvider client={queryClient}>
        <OnchainKitProvider
          apiKey={process.env.NEXT_PUBLIC_CDP_API_KEY}
          projectId={process.env.NEXT_PUBLIC_CDP_PROJECT_ID}
          chain={base}
        >
          {children}
        </OnchainKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

// Export config for use elsewhere
export { wagmiAdapter };
