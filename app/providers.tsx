'use client';

import { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { base } from 'wagmi/chains';
import { coinbaseWallet, injected } from 'wagmi/connectors';
import { OnchainKitProvider } from '@coinbase/onchainkit';

const queryClient = new QueryClient();

const wagmiConfig = createConfig({
  chains: [base],
  connectors: [
    // Coinbase Smart Wallet
    coinbaseWallet({
      appName: 'BaseGold Miner',
      preference: 'all', // Changed from 'smartWalletOnly' to allow both smart wallet AND extension
    }),
    // MetaMask and other injected wallets (Rabby, Trust, etc.)
    injected({
      shimDisconnect: true,
    }),
  ],
  transports: {
    [base.id]: http(),
  },
});

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
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
