# ⛏️ BaseGold Miner - Season 2

**The Official Play-to-Burn Game for BaseGold ($BG)**

Mine gold, climb the leaderboards, and burn $BG to unlock exclusive rewards. Season 2 introduces new shop items, visual effects, and enhanced anti-cheat protection!

## 🏆 Season 2 Highlights

### 🔥 Burn-to-Play Mechanics
- Every shop purchase burns $BG tokens via the InstantBurn contract
- Minimum 1 burn required to submit leaderboard scores
- On-chain verification ensures fair competition

### 🆕 New Shop Items
| Item | Price | Effect |
|------|-------|--------|
| ⚡ 5x MEGA BOOST | ~$4 | 5x ALL earnings for 5 minutes |
| 🏔️ Second Mine | ~$15 | PERMANENT 2x multiplier on all earnings |
| 🐐 Golden Goat | ~$10 | 25x max combo + auto-click |
| 🍀 Lucky Nugget | ~$6 | 15% chance for 10x gold per click |
| ⏰ Time Warp PRO | ~$7 | Instantly collect 8 hours of passive gold |
| 💎 Diamond Mine | ~$12 | Permanent +500 gold per second |
| 🔥 Inferno Burn | ~$5.50 | +25/click, +100/sec, massive BG burn |

### 📊 Dual Leaderboards
- **⛏️ Miners Leaderboard** - Compete for highest gold mined
- **🔥 Burners Leaderboard** - Track total $BG burned

### 🎮 Enhanced Gameplay
- **On-chain verification** - All scores verified via wallet signature
- **Anti-cheat protection** - Fair play for everyone
- **Session management** - One device per wallet
- **Cloud saves** - Progress saved to server automatically
- **Offline earnings** - Earn gold while away (up to 8 hours)

## 🎯 How to Play

1. **Connect Wallet** - Use any Base-compatible wallet
2. **Start Mining** - Click the gold coin to mine
3. **Build Combos** - Fast clicks = higher multipliers (up to 15x!)
4. **Buy Upgrades** - Spend gold on permanent improvements
5. **Shop Premium Items** - USDC purchases unlock powerful effects
6. **Burn $BG** - Required to submit scores (minimum 1 burn)
7. **Compete** - Climb the leaderboard for season rewards!

## 💰 Burn Mechanics

All shop purchases go through the InstantBurn contract:
1. User pays ETH for shop item
2. Contract swaps ETH → $BG on DEX
3. $BG is burned immediately
4. User receives in-game effect after on-chain confirmation

This creates constant deflationary pressure on $BG supply.

## 🔧 Technical Stack

- **Framework**: Next.js 14 (App Router)
- **Blockchain**: Base Network (Ethereum L2)
- **Wallet**: OnchainKit + Wagmi
- **Database**: Upstash Redis (serverless)
- **Hosting**: Vercel
- **Payments**: USDC via Base

## 📁 Project Structure

```
basegold-miniapp/
├── app/
│   ├── api/
│   │   ├── game/           # Save/load game state
│   │   ├── leaderboard/    # Score submission & rankings
│   │   ├── session/        # Anti-cheat session management
│   │   └── onramp/         # Coinbase onramp integration
│   ├── globals.css         # Animations & effects
│   ├── layout.tsx          # Root layout
│   ├── page.tsx            # Main game (2000+ lines!)
│   └── providers.tsx       # Wallet providers
├── minikit.config.ts       # Base MiniKit config
└── package.json
```

## 🚀 Deployment

### Environment Variables

```env
# Vercel KV (Upstash Redis)
KV_REST_API_URL=
KV_REST_API_TOKEN=

# Or direct Upstash
UPSTASH_REDIS_REST_KV_REST_API_URL=
UPSTASH_REDIS_REST_KV_REST_API_TOKEN=

# App URL
NEXT_PUBLIC_URL=https://your-app.vercel.app

# Coinbase Developer Platform
NEXT_PUBLIC_CDP_API_KEY=
CDP_API_KEY_PRIVATE_KEY=
```

### Deploy to Vercel

```bash
# Clone repository
git clone https://github.com/basegold/basegold-miniapp.git

# Install dependencies
npm install

# Deploy
vercel --prod
```

## 🔐 Security Features

- **Wallet Signature Verification** - EIP-191 + EIP-1271 (smart wallets)
- **On-chain Burn Verification** - Scores require verified burns
- **Session Locking** - One active session per wallet
- **Rate Limiting** - Prevents save spam
- **Gold Cap Validation** - Detects impossible scores
- **Server-side State** - Client can't tamper with saved progress

## 🔄 Season Management

To start a new season, update `CURRENT_SEASON` in both API routes:

```typescript
// app/api/game/route.ts
const CURRENT_SEASON = 's3'; // Change to reset

// app/api/leaderboard/route.ts  
const CURRENT_SEASON = 's3'; // Must match!
```

This creates fresh Redis keys while preserving historical data.

## 📊 Key Contracts

| Contract | Address |
|----------|---------|
| $BG Token | `0x8fe815417913a93ea99049fc0718ee1647a3f702` |
| Instant Burn | `0xF9dc5A103C5B09bfe71cF1Badcce362827b34BFE` |
| USDC (Base) | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |

## 🔗 Links

- **Website**: [basegold.io](https://basegold.io)
- **Play Now**: [basegold-miniapp.vercel.app](https://basegold-miniapp.vercel.app)
- **Twitter/X**: [@BaseGold_](https://x.com/BaseGold_)
- **Telegram**: [BaseGold Community](https://t.me/basegold)
- **DexScreener**: [BaseGold Chart](https://dexscreener.com/base/0x8fe815417913a93ea99049fc0718ee1647a3f702)

## 📝 License

MIT - Built for the BaseGold community 🏆

---

**You Only Need One** ⛏️💛
