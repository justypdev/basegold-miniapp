// minikit.config.ts
// Update ROOT_URL to your deployed domain
const ROOT_URL = process.env.NEXT_PUBLIC_URL || 'https://your-app.vercel.app';

export const minikitConfig = {
  // Step 4: Add accountAssociation after signing at base.dev/preview
  accountAssociation: {
    header: "",
    payload: "",
    signature: ""
  },
  miniapp: {
    version: "1",
    name: "BaseGold Miner",
    subtitle: "Mine Gold, Burn $BG",
    description: "Click to mine gold! Ad revenue and in-app purchases fund $BG token burns. The inverse of Bitcoin mining.",
    screenshotUrls: [
      `${ROOT_URL}/screenshot1.png`,
      `${ROOT_URL}/screenshot2.png`
    ],
    iconUrl: `${ROOT_URL}/logo.png`,
    splashImageUrl: `${ROOT_URL}/splash.png`,
    splashBackgroundColor: "#0A0A0A",
    homeUrl: ROOT_URL,
    webhookUrl: `${ROOT_URL}/api/webhook`,
    primaryCategory: "games",
    tags: ["crypto", "mining", "basegold", "defi", "clicker", "burn"],
    heroImageUrl: `${ROOT_URL}/hero.png`,
    tagline: "Play to Burn $BG",
    ogTitle: "BaseGold Miner - Play & Burn",
    ogDescription: "Mine gold, buy upgrades, and help burn $BG tokens!",
    ogImageUrl: `${ROOT_URL}/og-image.png`,
  },
} as const;

export default minikitConfig;
