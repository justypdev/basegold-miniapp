# ⛏️ BaseGold Miner - Base Mini App

A play-to-burn clicker game deployed as a Base Mini App. Mine gold, buy upgrades with in-game currency, and purchase premium items with USDC - 100% of premium revenue goes to the $BG burn fund!

## 🎮 Features

### Core Game
- **Click Mining**: Tap the gold coin to mine
- **Combo System**: Fast clicks build combos up to 10x (15x with Golden Crown)
- **Passive Income**: Hire miners and buy equipment for gold/second
- **6 Upgrade Types**: Pickaxe, Miner, Drill, Excavator, Dynamite, Gold Mine

### 💎 Premium Shop (USDC Payments)
| Item | Price | Effect |
|------|-------|--------|
| ⚡ 2x Power Boost | $0.50 | Double click power for 10 minutes |
| ⏰ Time Warp | $1.00 | Instantly collect 1 hour of passive gold |
| 💎 Diamond Pickaxe | $2.00 | Permanent +10 gold per click |
| 🤖 Auto-Miner Bot | $5.00 | Permanent +100 gold per second |
| 👑 Golden Crown | $3.00 | Cosmetic + 15x max combo |
| 🔥 Burn Booster | $1.00 | 100% goes directly to burn fund |

**All premium revenue is used to buy and burn $BG tokens!**

## 🚀 Deployment Guide

### Prerequisites
- [Node.js](https://nodejs.org/) 18+
- [Vercel Account](https://vercel.com/)
- [Coinbase Developer Platform Account](https://portal.cdp.coinbase.com/)
- Farcaster/Base App account

### Step 1: Deploy to Vercel

1. Push this code to a GitHub repository
2. Go to [Vercel](https://vercel.com/new) and import the repository
3. Add environment variables:
   - `NEXT_PUBLIC_URL` = Your Vercel URL (e.g., `https://basegold-miner.vercel.app`)
   - `NEXT_PUBLIC_CDP_API_KEY` = Your CDP API key

### Step 2: Update Treasury Address

In `app/page.tsx`, update the `TREASURY_ADDRESS` constant to your wallet address:

```typescript
const TREASURY_ADDRESS = '0xYourWalletAddressHere';
```

This is where USDC payments will be sent. Use a wallet you control for the burn fund.

### Step 3: Sign the Manifest

1. Go to [base.dev/preview](https://base.dev/preview?tab=account)
2. Enter your deployed URL
3. Click "Verify" and sign with your wallet
4. Copy the `accountAssociation` object
5. Update `app/.well-known/farcaster.json/route.ts` with the signed values:

```typescript
accountAssociation: {
  header: "eyJ...",
  payload: "eyJ...",
  signature: "MHg..."
}
```

6. Redeploy to Vercel

### Step 4: Add App Assets

Upload these images to your `/public` folder:

| File | Size | Description |
|------|------|-------------|
| `logo.png` | 1024×1024 | App icon |
| `splash.png` | 200×200 | Loading splash |
| `hero.png` | 1200×630 | Hero/OG image |
| `og-image.png` | 1200×630 | Social share image |
| `screenshot1.png` | 1284×2778 | App screenshot |
| `screenshot2.png` | 1284×2778 | App screenshot |
| `screenshot3.png` | 1284×2778 | App screenshot |

### Step 5: Preview & Publish

1. Go to [base.dev/preview](https://base.dev/preview)
2. Enter your URL and verify everything looks correct
3. Open the Base App and create a post with your app URL
4. Your Mini App is now live! 🎉

## 💰 Revenue & Burns

### How the Burn Mechanism Works

1. User purchases a premium item with USDC
2. USDC is sent to the treasury wallet
3. Treasury accumulates until threshold ($50 recommended)
4. Manual or automated buyback of $BG from DEX
5. Purchased $BG is sent to burn address

### Setting Up Automated Burns (Optional)

You can automate the burn process using:
- A smart contract that swaps and burns on deposit
- A Cloudflare Worker that monitors the treasury and executes burns
- Manual periodic burns (simplest approach)

## 🔧 Local Development

```bash
# Install dependencies
npm install

# Create .env.local from template
cp .env.example .env.local

# Start dev server
npm run dev
```

Visit `http://localhost:3000` to test locally.

## 📁 Project Structure

```
basegold-miniapp/
├── app/
│   ├── .well-known/
│   │   └── farcaster.json/
│   │       └── route.ts      # Manifest endpoint
│   ├── globals.css           # Global styles
│   ├── layout.tsx            # Root layout with metadata
│   ├── page.tsx              # Main game component
│   └── providers.tsx         # Wagmi/OnchainKit providers
├── public/                   # Static assets (add your images here)
├── minikit.config.ts         # MiniKit configuration
├── package.json
├── tailwind.config.js
└── tsconfig.json
```

## 🔐 Security Notes

- **Treasury Wallet**: Use a dedicated wallet for receiving payments
- **Never expose private keys**: All signing happens client-side
- **USDC Contract**: Uses official Base USDC (`0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`)
- **Game state is local**: Stored in localStorage, not on-chain

## 📊 Tracking Revenue

To track premium purchases:
1. Monitor USDC transfers to your treasury on BaseScan
2. Set up alerts via wallet tracking services
3. Consider adding a backend webhook for purchase events

## 🛠️ Customization

### Adding New Premium Items

In `app/page.tsx`, add to the `SHOP_ITEMS` array:

```typescript
{
  id: 'new_item',
  name: '🌟 New Item',
  description: 'Description here',
  priceUSDC: '2.50',
  emoji: '🌟',
  effect: { type: 'permanent_click', amount: 5 }
}
```

Effect types:
- `boost` - Temporary multiplier
- `instant_gold` - Instant gold based on passive income
- `permanent_click` - Permanent per-click bonus
- `permanent_passive` - Permanent per-second bonus
- `cosmetic` - Visual effects + max combo increase
- `burn_contribution` - Pure burn donation

### Changing Upgrade Costs/Values

Modify the `INITIAL_UPGRADES` object in `app/page.tsx`.

## 📝 License

MIT - Feel free to fork and customize for your own project!

## 🔗 Links

- [BaseGold Website](https://basegold.io)
- [Base Mini Apps Docs](https://docs.base.org/mini-apps)
- [OnchainKit Docs](https://docs.base.org/onchainkit)
- [MiniKit Docs](https://docs.base.org/builderkits/minikit)
