'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { sdk } from '@farcaster/miniapp-sdk';
import { useAccount, useBalance, useReadContract, useWatchContractEvent, usePublicClient, useSignMessage } from 'wagmi';
import { 
  Transaction, 
  TransactionButton, 
  TransactionStatus,
  TransactionStatusLabel,
  TransactionStatusAction 
} from '@coinbase/onchainkit/transaction';
import { ConnectWallet, Wallet } from '@coinbase/onchainkit/wallet';
import { Avatar, Name } from '@coinbase/onchainkit/identity';
import { encodeFunctionData, parseUnits, formatUnits, parseEther, parseAbiItem, keccak256, toBytes } from 'viem';
import { base } from 'wagmi/chains';

// ============ CONTRACT ADDRESSES (Base Mainnet) ============

const BG_TOKEN = '0x36b712A629095234F2196BbB000D1b96C12Ce78e' as `0x${string}`;
const INSTANT_BURN = '0xF9dc5A103C5B09bfe71cF1Badcce362827b34BFE' as `0x${string}`;
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as `0x${string}`;
const AERODROME_ROUTER = '0xcF77a3Ba9A5CA399B7c97c74d54e5b1Beb874E43' as `0x${string}`;
const WETH_ADDRESS = '0x4200000000000000000000000000000000000006' as `0x${string}`;
const DEAD_ADDRESS = '0x000000000000000000000000000000000000dEaD' as `0x${string}`;
const INITIAL_SUPPLY = 10000;

// ============ SECURITY CONSTANTS ============

const MAX_CLICKS_PER_SECOND = 20; // Human limit ~15-20 CPS
const SESSION_VALIDATION_WINDOW = 1000; // 1 second window for click validation
const MIN_BURNS_FOR_LEADERBOARD = 1; // Minimum burns required to submit score

// ============ ABIs ============

const ERC20_ABI = [
  {
    name: 'approve',
    type: 'function',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ type: 'bool' }],
  },
  {
    name: 'balanceOf',
    type: 'function',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'totalSupply',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
] as const;

const INSTANT_BURN_ABI = [
  {
    name: 'buyAndBurn',
    type: 'function',
    inputs: [],
    outputs: [],
    stateMutability: 'payable',
  },
  {
    name: 'getBurnStats',
    type: 'function',
    inputs: [],
    outputs: [
      { type: 'uint256' },
      { type: 'uint256' },
      { type: 'uint256' }
    ],
    stateMutability: 'view',
  },
  {
    name: 'InstantBurn',
    type: 'event',
    inputs: [
      { name: 'buyer', type: 'address', indexed: true },
      { name: 'ethAmount', type: 'uint256', indexed: false },
      { name: 'bgBurned', type: 'uint256', indexed: false },
      { name: 'timestamp', type: 'uint256', indexed: false },
      { name: 'totalBurnedLifetime', type: 'uint256', indexed: false },
    ],
  },
] as const;

const ROUTER_ABI = [
  {
    name: 'swapExactETHForTokens',
    type: 'function',
    inputs: [
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' }
    ],
    outputs: [{ type: 'uint256[]' }],
    stateMutability: 'payable',
  },
] as const;

// ============ SHOP ITEMS (ETH prices) ============
// These map to on-chain burn events - effect is calculated from ETH spent

const SHOP_ITEMS = [
  {
    id: 'boost_2x',
    name: '⚡ 2x Power Boost',
    description: 'Double click power for 10 minutes',
    priceETH: '0.00015',
    priceUSD: '~$0.50',
    emoji: '⚡',
    effect: { type: 'boost' as const, multiplier: 2, duration: 600000 }
  },
  {
    id: 'time_warp',
    name: '⏰ Time Warp',
    description: 'Instantly collect 1 hour of passive gold',
    priceETH: '0.0003',
    priceUSD: '~$1.00',
    emoji: '⏰',
    effect: { type: 'instant_gold' as const, hours: 1 }
  },
  {
    id: 'diamond_pickaxe',
    name: '💎 Diamond Pickaxe',
    description: 'Permanent +10 gold per click',
    priceETH: '0.0006',
    priceUSD: '~$2.00',
    emoji: '💎',
    effect: { type: 'permanent_click' as const, amount: 10 }
  },
  {
    id: 'auto_miner',
    name: '🤖 Auto-Miner Bot',
    description: 'Permanent +100 gold per second',
    priceETH: '0.0015',
    priceUSD: '~$5.00',
    emoji: '🤖',
    effect: { type: 'permanent_passive' as const, amount: 100 }
  },
  {
    id: 'golden_crown',
    name: '👑 Golden Crown',
    description: 'Exclusive cosmetic + 15x combo max',
    priceETH: '0.001',
    priceUSD: '~$3.00',
    emoji: '👑',
    effect: { type: 'cosmetic' as const, maxCombo: 15 }
  },
  {
    id: 'burn_booster',
    name: '🔥 Burn Booster',
    description: '100% goes directly to burn!',
    priceETH: '0.0003',
    priceUSD: '~$1.00',
    emoji: '🔥',
    effect: { type: 'burn_contribution' as const, amount: 1 }
  },
];

// Map ETH amounts to shop items for on-chain verification
const ETH_TO_ITEM: Record<string, typeof SHOP_ITEMS[0]> = {};
SHOP_ITEMS.forEach(item => {
  ETH_TO_ITEM[item.priceETH] = item;
});

// ============ UPGRADES ============

const INITIAL_UPGRADES = {
  pickaxe: { cost: 50, owned: 0, multiplier: 1.5, perClick: 1, perSec: 0, emoji: '⛏️', name: 'Better Pickaxe' },
  miner: { cost: 100, owned: 0, multiplier: 1.5, perClick: 0, perSec: 1, emoji: '👷', name: 'Hire Miner' },
  drill: { cost: 500, owned: 0, multiplier: 1.5, perClick: 0, perSec: 5, emoji: '🔧', name: 'Gold Drill' },
  excavator: { cost: 2000, owned: 0, multiplier: 1.5, perClick: 0, perSec: 20, emoji: '🚜', name: 'Excavator' },
  dynamite: { cost: 5000, owned: 0, multiplier: 1.5, perClick: 0, perSec: 50, emoji: '🧨', name: 'Dynamite' },
  goldmine: { cost: 20000, owned: 0, multiplier: 1.5, perClick: 0, perSec: 200, emoji: '🏔️', name: 'Gold Mine' },
};

// ============ TYPES ============

interface BurnEntry {
  address: string;
  totalBurned: number;
  burnCount: number;
}

interface VerifiedPointsEntry {
  address: string;
  name: string;
  gold: number;
  totalClicks: number;
  burnCount: number;
  totalBurned: number;
  signature: string;
  timestamp: number;
  sessionDuration: number;
}

interface OnChainPurchase {
  itemId: string;
  ethAmount: string;
  bgBurned: number;
  timestamp: number;
  txHash: string;
}

// ============ HELPER FUNCTIONS ============

// Calculate premium bonuses from VERIFIED on-chain purchases
function calculateVerifiedBonuses(purchases: OnChainPurchase[]) {
  let bonusClick = 0;
  let bonusPassive = 0;
  let hasCrown = false;
  let maxCombo = 10;
  let activeBoosts: { multiplier: number; endTime: number }[] = [];

  purchases.forEach(purchase => {
    const item = ETH_TO_ITEM[purchase.ethAmount];
    if (!item) return;

    switch (item.effect.type) {
      case 'permanent_click':
        bonusClick += item.effect.amount || 10;
        break;
      case 'permanent_passive':
        bonusPassive += item.effect.amount || 100;
        break;
      case 'cosmetic':
        hasCrown = true;
        maxCombo = item.effect.maxCombo || 15;
        break;
      case 'boost':
        // Boosts are time-limited - check if still active
        const boostEndTime = purchase.timestamp + (item.effect.duration || 600000);
        if (boostEndTime > Date.now()) {
          activeBoosts.push({ multiplier: item.effect.multiplier || 2, endTime: boostEndTime });
        }
        break;
    }
  });

  // Get highest active boost multiplier
  const activeBoost = activeBoosts.length > 0 
    ? activeBoosts.reduce((max, b) => b.multiplier > max.multiplier ? b : max)
    : null;

  return { bonusClick, bonusPassive, hasCrown, maxCombo, activeBoost };
}

// Validate score is achievable
function validateScore(
  gold: number, 
  totalClicks: number, 
  sessionDuration: number,
  verifiedBonuses: ReturnType<typeof calculateVerifiedBonuses>,
  baseGoldPerClick: number,
  baseGoldPerSecond: number
): { valid: boolean; reason?: string } {
  // Check click rate isn't superhuman
  const clicksPerSecond = totalClicks / (sessionDuration / 1000);
  if (clicksPerSecond > MAX_CLICKS_PER_SECOND) {
    return { valid: false, reason: `Click rate too high: ${clicksPerSecond.toFixed(1)} CPS (max: ${MAX_CLICKS_PER_SECOND})` };
  }

  // Calculate maximum possible gold
  const maxGoldPerClick = (baseGoldPerClick + verifiedBonuses.bonusClick) * (verifiedBonuses.activeBoost?.multiplier || 1) * 15; // 15x max combo
  const maxFromClicks = totalClicks * maxGoldPerClick;
  const maxFromPassive = (baseGoldPerSecond + verifiedBonuses.bonusPassive) * (sessionDuration / 1000);
  const maxPossibleGold = maxFromClicks + maxFromPassive;

  if (gold > maxPossibleGold * 1.1) { // 10% tolerance for rounding
    return { valid: false, reason: `Gold exceeds maximum possible: ${gold} > ${maxPossibleGold.toFixed(0)}` };
  }

  return { valid: true };
}

// Create score hash for signing
function createScoreHash(address: string, gold: number, totalClicks: number, burnCount: number, timestamp: number): string {
  const message = `BaseGold Score Submission\nAddress: ${address}\nGold: ${gold}\nClicks: ${totalClicks}\nBurns: ${burnCount}\nTimestamp: ${timestamp}`;
  return message;
}

// ============ COMPONENTS ============

function BurnNotification({ burn, onComplete }: { burn: { amount: string; buyer: string }; onComplete: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onComplete, 4000);
    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 animate-pulse">
      <div className="bg-gradient-to-r from-orange-600 to-red-600 px-6 py-3 rounded-xl shadow-2xl border border-orange-400">
        <div className="flex items-center gap-3">
          <span className="text-3xl">🔥</span>
          <div>
            <div className="text-white font-bold">{burn.amount} BG BURNED!</div>
            <div className="text-orange-200 text-xs">by {burn.buyer}</div>
          </div>
          <span className="text-3xl">🔥</span>
        </div>
      </div>
    </div>
  );
}

// ============ MAIN COMPONENT ============

export default function MinerGame() {
  const [isReady, setIsReady] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(false);
  
  // Session tracking for anti-cheat
  const sessionStartTime = useRef(Date.now());
  const clickTimestamps = useRef<number[]>([]);
  
  // Wallet
  const { address, isConnected } = useAccount();
  const { data: ethBalance } = useBalance({ address });
  const { data: bgBalance } = useBalance({ address, token: BG_TOKEN });
  const publicClient = usePublicClient();
  const { signMessageAsync } = useSignMessage();

  // Contract reads
  const { data: totalSupply, refetch: refetchSupply } = useReadContract({
    address: BG_TOKEN,
    abi: ERC20_ABI,
    functionName: 'totalSupply',
  });

  const { data: contractBalance } = useReadContract({
    address: BG_TOKEN,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [BG_TOKEN],
  });

  const { data: deadBalance } = useReadContract({
    address: BG_TOKEN,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [DEAD_ADDRESS],
  });

  const { data: burnStats, refetch: refetchBurnStats } = useReadContract({
    address: INSTANT_BURN,
    abi: INSTANT_BURN_ABI,
    functionName: 'getBurnStats',
  });

  // ============ ON-CHAIN VERIFIED STATE ============
  // These are loaded from blockchain and CANNOT be manipulated
  
  const [verifiedPurchases, setVerifiedPurchases] = useState<OnChainPurchase[]>([]);
  const [userBurnCount, setUserBurnCount] = useState(0);
  const [userBurnAmount, setUserBurnAmount] = useState(0);
  const [loadingVerification, setLoadingVerification] = useState(true);

  // ============ SESSION STATE (resets on refresh) ============
  // These are ephemeral and don't persist - prevents localStorage manipulation
  
  const [gold, setGold] = useState(0);
  const [totalClicks, setTotalClicks] = useState(0);
  const [combo, setCombo] = useState(1);
  const [lastClickTime, setLastClickTime] = useState(0);
  const [upgrades, setUpgrades] = useState(INITIAL_UPGRADES);
  
  // UI state
  const [activeTab, setActiveTab] = useState<'game' | 'shop' | 'buy' | 'leaderboard' | 'stats'>('game');
  const [floatingTexts, setFloatingTexts] = useState<Array<{id: number, text: string, x: number, y: number}>>([]);
  const [selectedItem, setSelectedItem] = useState<typeof SHOP_ITEMS[0] | null>(null);
  const [purchaseSuccess, setPurchaseSuccess] = useState(false);
  const [processingPurchase, setProcessingPurchase] = useState(false);
  const [pendingPurchaseItem, setPendingPurchaseItem] = useState<typeof SHOP_ITEMS[0] | null>(null);
  const [lastPurchasedItem, setLastPurchasedItem] = useState<typeof SHOP_ITEMS[0] | null>(null);
  
  // Burn notifications
  const [burnNotifications, setBurnNotifications] = useState<Array<{ id: number; amount: string; buyer: string }>>([]);
  const [totalBurned, setTotalBurned] = useState(0);
  
  // Leaderboard state
  const [burnLeaderboard, setBurnLeaderboard] = useState<BurnEntry[]>([]);
  const [pointsLeaderboard, setPointsLeaderboard] = useState<VerifiedPointsEntry[]>([]);
  const [leaderboardTab, setLeaderboardTab] = useState<'burns' | 'points'>('burns');
  const [loadingLeaderboard, setLoadingLeaderboard] = useState(false);
  const [playerName, setPlayerName] = useState('');
  const [submittingScore, setSubmittingScore] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Calculate verified bonuses from on-chain data
  const verifiedBonuses = useMemo(() => calculateVerifiedBonuses(verifiedPurchases), [verifiedPurchases]);
  
  // Calculate base stats from in-game upgrades
  const baseGoldPerClick = useMemo(() => {
    return 1 + Object.values(upgrades).reduce((sum, u) => sum + u.owned * u.perClick, 0);
  }, [upgrades]);
  
  const baseGoldPerSecond = useMemo(() => {
    return Object.values(upgrades).reduce((sum, u) => sum + u.owned * u.perSec, 0);
  }, [upgrades]);
  
  // Final calculated values including verified bonuses
  const goldPerClick = baseGoldPerClick + verifiedBonuses.bonusClick;
  const goldPerSecond = baseGoldPerSecond + verifiedBonuses.bonusPassive;
  const clickMultiplier = verifiedBonuses.activeBoost?.multiplier || 1;
  const boostEndTime = verifiedBonuses.activeBoost?.endTime || null;
  const hasCrown = verifiedBonuses.hasCrown;
  const maxCombo = verifiedBonuses.maxCombo;

  // ============ FETCH VERIFIED ON-CHAIN DATA ============
  
  const fetchVerifiedPurchases = useCallback(async () => {
    if (!publicClient || !address) {
      setLoadingVerification(false);
      return;
    }
    
    setLoadingVerification(true);
    try {
      const logs = await publicClient.getLogs({
        address: INSTANT_BURN,
        event: parseAbiItem('event InstantBurn(address indexed buyer, uint256 ethAmount, uint256 bgBurned, uint256 timestamp, uint256 totalBurnedLifetime)'),
        args: { buyer: address },
        fromBlock: 'earliest',
        toBlock: 'latest',
      });

      const purchases: OnChainPurchase[] = [];
      let totalBurned = 0;

      logs.forEach((log: any) => {
        const ethAmount = formatUnits(log.args.ethAmount || 0n, 18);
        const bgBurned = Number(formatUnits(log.args.bgBurned || 0n, 18));
        const timestamp = Number(log.args.timestamp || 0) * 1000;
        
        totalBurned += bgBurned;

        // Find matching shop item by ETH amount
        const matchingItem = SHOP_ITEMS.find(item => {
          const itemEth = parseFloat(item.priceETH);
          const txEth = parseFloat(ethAmount);
          return Math.abs(itemEth - txEth) < 0.00001; // Small tolerance for rounding
        });

        if (matchingItem) {
          purchases.push({
            itemId: matchingItem.id,
            ethAmount: matchingItem.priceETH,
            bgBurned,
            timestamp,
            txHash: log.transactionHash,
          });
        }
      });

      setVerifiedPurchases(purchases);
      setUserBurnCount(logs.length);
      setUserBurnAmount(totalBurned);
      
      console.log('✅ Verified on-chain purchases:', purchases.length);
      console.log('🔥 Total burns:', logs.length, 'Amount:', totalBurned.toFixed(6));
    } catch (error) {
      console.error('Error fetching verified purchases:', error);
    }
    setLoadingVerification(false);
  }, [publicClient, address]);

  // Fetch on mount and when address changes
  useEffect(() => {
    fetchVerifiedPurchases();
  }, [fetchVerifiedPurchases]);

  // Watch for new burn events
  useWatchContractEvent({
    address: INSTANT_BURN,
    abi: INSTANT_BURN_ABI,
    eventName: 'InstantBurn',
    onLogs(logs) {
      logs.forEach((log: any) => {
        const bgBurned = formatUnits(log.args.bgBurned || 0n, 18);
        const buyerAddress = log.args.buyer as string;
        const buyerShort = buyerAddress?.slice(0, 6) + '...' + buyerAddress?.slice(-4);
        
        // Add notification
        const id = Date.now();
        setBurnNotifications(prev => [...prev, { id, amount: parseFloat(bgBurned).toFixed(6), buyer: buyerShort }]);
        
        // Refresh stats
        refetchSupply();
        refetchBurnStats();
        
        // If this is the current user, refresh their verified purchases
        if (address && buyerAddress.toLowerCase() === address.toLowerCase()) {
          console.log('🎯 Your burn detected! Refreshing verified data...');
          fetchVerifiedPurchases();
          
          // Handle pending purchase
          if (pendingPurchaseItem) {
            setLastPurchasedItem(pendingPurchaseItem);
            setPurchaseSuccess(true);
            setPendingPurchaseItem(null);
            setSelectedItem(null);
            setProcessingPurchase(false);
            setTimeout(() => {
              setPurchaseSuccess(false);
              setLastPurchasedItem(null);
            }, 6000);
          }
        }
      });
    },
  });

  // ============ FETCH LEADERBOARDS ============
  
  const fetchBurnLeaderboard = useCallback(async () => {
    if (!publicClient) return;
    
    setLoadingLeaderboard(true);
    try {
      const logs = await publicClient.getLogs({
        address: INSTANT_BURN,
        event: parseAbiItem('event InstantBurn(address indexed buyer, uint256 ethAmount, uint256 bgBurned, uint256 timestamp, uint256 totalBurnedLifetime)'),
        fromBlock: 'earliest',
        toBlock: 'latest',
      });

      const burnsByAddress: Record<string, { totalBurned: number; burnCount: number }> = {};
      
      logs.forEach((log: any) => {
        const buyer = log.args.buyer as string;
        const bgBurned = Number(formatUnits(log.args.bgBurned || 0n, 18));
        
        if (!burnsByAddress[buyer]) {
          burnsByAddress[buyer] = { totalBurned: 0, burnCount: 0 };
        }
        burnsByAddress[buyer].totalBurned += bgBurned;
        burnsByAddress[buyer].burnCount += 1;
      });

      const leaderboard: BurnEntry[] = Object.entries(burnsByAddress)
        .map(([address, data]) => ({
          address,
          totalBurned: data.totalBurned,
          burnCount: data.burnCount,
        }))
        .sort((a, b) => b.totalBurned - a.totalBurned)
        .slice(0, 50);

      setBurnLeaderboard(leaderboard);
    } catch (error) {
      console.error('Error fetching burn leaderboard:', error);
    }
    setLoadingLeaderboard(false);
  }, [publicClient]);

  // Load points leaderboard from localStorage (but entries are verified)
  const loadPointsLeaderboard = useCallback(() => {
    try {
      const saved = localStorage.getItem('basegold-verified-leaderboard-v1');
      if (saved) {
        const data = JSON.parse(saved) as VerifiedPointsEntry[];
        // Sort by gold and filter out expired entries (older than 30 days)
        const validEntries = data
          .filter(e => Date.now() - e.timestamp < 30 * 24 * 60 * 60 * 1000)
          .sort((a, b) => b.gold - a.gold)
          .slice(0, 50);
        setPointsLeaderboard(validEntries);
      }
    } catch {}
  }, []);

  useEffect(() => {
    if (activeTab === 'leaderboard') {
      fetchBurnLeaderboard();
      loadPointsLeaderboard();
    }
  }, [activeTab, fetchBurnLeaderboard, loadPointsLeaderboard]);

  // ============ SIGNED SCORE SUBMISSION ============
  
  const submitVerifiedScore = useCallback(async () => {
    if (!address || !signMessageAsync) return;
    
    setSubmitError(null);
    
    // Check minimum burn requirement
    if (userBurnCount < MIN_BURNS_FOR_LEADERBOARD) {
      setSubmitError(`Must have at least ${MIN_BURNS_FOR_LEADERBOARD} burn(s) to submit. You have: ${userBurnCount}`);
      return;
    }

    // Validate score
    const sessionDuration = Date.now() - sessionStartTime.current;
    const validation = validateScore(gold, totalClicks, sessionDuration, verifiedBonuses, baseGoldPerClick, baseGoldPerSecond);
    
    if (!validation.valid) {
      setSubmitError(`Score validation failed: ${validation.reason}`);
      return;
    }

    setSubmittingScore(true);
    
    try {
      const timestamp = Date.now();
      const message = createScoreHash(address, gold, totalClicks, userBurnCount, timestamp);
      
      // Sign the score with wallet
      const signature = await signMessageAsync({ message });
      
      const name = playerName.trim() || address.slice(0, 6) + '...' + address.slice(-4);
      
      const newEntry: VerifiedPointsEntry = {
        address,
        name,
        gold,
        totalClicks,
        burnCount: userBurnCount,
        totalBurned: userBurnAmount,
        signature,
        timestamp,
        sessionDuration,
      };

      // Load existing leaderboard
      const saved = localStorage.getItem('basegold-verified-leaderboard-v1');
      let leaderboard: VerifiedPointsEntry[] = saved ? JSON.parse(saved) : [];
      
      // Find existing entry for this address
      const existingIndex = leaderboard.findIndex(e => e.address.toLowerCase() === address.toLowerCase());
      
      if (existingIndex >= 0) {
        // Only update if new score is higher
        if (gold > leaderboard[existingIndex].gold) {
          leaderboard[existingIndex] = newEntry;
        }
      } else {
        leaderboard.push(newEntry);
      }
      
      // Sort and limit
      leaderboard = leaderboard
        .filter(e => Date.now() - e.timestamp < 30 * 24 * 60 * 60 * 1000)
        .sort((a, b) => b.gold - a.gold)
        .slice(0, 100);
      
      localStorage.setItem('basegold-verified-leaderboard-v1', JSON.stringify(leaderboard));
      setPointsLeaderboard(leaderboard.slice(0, 50));
      
      alert('✅ Score submitted and verified! 🏆');
    } catch (error: any) {
      console.error('Error submitting score:', error);
      setSubmitError(error.message || 'Failed to sign score');
    }
    
    setSubmittingScore(false);
  }, [address, signMessageAsync, gold, totalClicks, userBurnCount, userBurnAmount, playerName, verifiedBonuses, baseGoldPerClick, baseGoldPerSecond]);

  // ============ GAME LOGIC ============

  // Initialize
  useEffect(() => {
    const init = async () => {
      try {
        await sdk.actions.ready();
      } catch {}
      setIsReady(true);
      setDataLoaded(true);
      sessionStartTime.current = Date.now();
    };
    init();
  }, []);

  // Load player name
  useEffect(() => {
    const savedName = localStorage.getItem('basegold-player-name');
    if (savedName) setPlayerName(savedName);
  }, []);

  // Save player name
  useEffect(() => {
    if (playerName) {
      localStorage.setItem('basegold-player-name', playerName);
    }
  }, [playerName]);

  // Passive income
  useEffect(() => {
    const interval = setInterval(() => {
      if (goldPerSecond > 0) setGold(prev => prev + goldPerSecond);
    }, 1000);
    return () => clearInterval(interval);
  }, [goldPerSecond]);

  // Calculate total burned
  useEffect(() => {
    if (totalSupply) {
      const supply = Number(formatUnits(totalSupply as bigint, 18));
      const stuck = contractBalance ? Number(formatUnits(contractBalance as bigint, 18)) : 0;
      const dead = deadBalance ? Number(formatUnits(deadBalance as bigint, 18)) : 0;
      const burned = INITIAL_SUPPLY - supply + stuck + dead;
      setTotalBurned(burned);
    }
  }, [totalSupply, contractBalance, deadBalance]);

  // Refresh data periodically
  useEffect(() => {
    const interval = setInterval(() => {
      refetchSupply();
      refetchBurnStats();
    }, 15000);
    return () => clearInterval(interval);
  }, [refetchSupply, refetchBurnStats]);

  // Anti-cheat click handler with rate limiting
  const handleClick = useCallback((e: React.MouseEvent) => {
    const now = Date.now();
    
    // Rate limiting - check clicks in last second
    clickTimestamps.current = clickTimestamps.current.filter(t => now - t < SESSION_VALIDATION_WINDOW);
    
    if (clickTimestamps.current.length >= MAX_CLICKS_PER_SECOND) {
      console.warn('⚠️ Click rate limited');
      return; // Ignore click if rate exceeded
    }
    
    clickTimestamps.current.push(now);
    
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    let newCombo = now - lastClickTime < 500 ? Math.min(combo + 1, maxCombo) : 1;
    setCombo(newCombo);
    setLastClickTime(now);
    
    const earned = Math.floor(goldPerClick * clickMultiplier * newCombo);
    setGold(prev => prev + earned);
    setTotalClicks(prev => prev + 1);
    
    const id = Date.now();
    setFloatingTexts(prev => [...prev, { id, text: `+${formatNumber(earned)}`, x, y }]);
    setTimeout(() => setFloatingTexts(prev => prev.filter(ft => ft.id !== id)), 1000);
  }, [combo, lastClickTime, goldPerClick, clickMultiplier, maxCombo]);

  // Buy upgrade
  const buyUpgrade = (key: keyof typeof upgrades) => {
    const upgrade = upgrades[key];
    if (gold >= upgrade.cost) {
      setGold(prev => prev - upgrade.cost);
      setUpgrades(prev => ({
        ...prev,
        [key]: { ...prev[key], owned: prev[key].owned + 1, cost: Math.floor(prev[key].cost * prev[key].multiplier) }
      }));
    }
  };

  const formatNumber = (num: number) => {
    if (num >= 1e9) return (num / 1e9).toFixed(1) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(1) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(1) + 'K';
    return Math.floor(num).toString();
  };

  // Build purchase transaction
  const buildPurchaseCalls = (priceETH: string) => {
    const value = parseEther(priceETH);
    return [
      {
        to: INSTANT_BURN,
        value: value,
        data: encodeFunctionData({
          abi: INSTANT_BURN_ABI,
          functionName: 'buyAndBurn',
          args: [],
        }),
      },
    ];
  };

  // Manual claim handler
  const handleManualClaim = useCallback((item: typeof SHOP_ITEMS[0]) => {
    console.log('🔧 Manual claim for:', item.id);
    fetchVerifiedPurchases();
    setLastPurchasedItem(item);
    setPurchaseSuccess(true);
    setPendingPurchaseItem(null);
    setSelectedItem(null);
    setProcessingPurchase(false);
    setTimeout(() => {
      setPurchaseSuccess(false);
      setLastPurchasedItem(null);
    }, 6000);
  }, [fetchVerifiedPurchases]);

  // Parse burn stats
  const burnStatsArray = burnStats as [bigint, bigint, bigint] | undefined;
  const lifetimeEthBurned = burnStatsArray ? Number(formatUnits(burnStatsArray[0], 18)) : 0;
  const lifetimeBgBurned = burnStatsArray ? Number(formatUnits(burnStatsArray[1], 18)) : 0;
  const totalBurnCount = burnStatsArray ? Number(burnStatsArray[2]) : 0;

  // Count verified purchases by item
  const verifiedPurchaseCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    verifiedPurchases.forEach(p => {
      counts[p.itemId] = (counts[p.itemId] || 0) + 1;
    });
    return counts;
  }, [verifiedPurchases]);

  if (!isReady) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <div className="text-center">
          <div className="text-6xl mb-4 animate-bounce">⛏️</div>
          <p className="text-[#D4AF37] text-xl">Loading BaseGold Miner...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white">
      {/* Burn Notifications */}
      {burnNotifications.map(burn => (
        <BurnNotification
          key={burn.id}
          burn={burn}
          onComplete={() => setBurnNotifications(prev => prev.filter(b => b.id !== burn.id))}
        />
      ))}

      {/* Header */}
      <header className="flex justify-between items-center p-3 border-b border-[#D4AF37]/20">
        <div className="flex items-center gap-2">
          <span className="text-xl">⛏️</span>
          <span className="text-sm font-bold text-[#D4AF37]">BASEGOLD MINER</span>
          {hasCrown && <span>👑</span>}
          <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded ml-2">SECURED</span>
        </div>
        <Wallet>
          <ConnectWallet>
            <Avatar className="w-5 h-5" />
            <Name className="text-xs" />
          </ConnectWallet>
        </Wallet>
      </header>

      {/* Live Burn Ticker */}
      <div className="bg-gradient-to-r from-red-900/30 via-orange-900/30 to-red-900/30 border-b border-orange-500/30 py-2 px-4">
        <div className="flex justify-between items-center max-w-lg mx-auto">
          <div className="flex items-center gap-2">
            <span className="text-lg animate-pulse">🔥</span>
            <div>
              <div className="text-xs text-gray-400">Total Burned</div>
              <div className="text-orange-400 font-bold font-mono">{totalBurned.toFixed(4)} BG</div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-gray-400">Circulating</div>
            <div className="text-[#D4AF37] font-mono">{(INITIAL_SUPPLY - totalBurned).toFixed(2)} / 10,000</div>
          </div>
        </div>
      </div>

      {/* Balance Displays */}
      <div className="bg-gradient-to-r from-[#D4AF37]/10 via-[#996515]/10 to-[#D4AF37]/10 border-b border-[#D4AF37]/30 py-3 px-4">
        <div className="flex justify-between items-center max-w-lg mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#F4E4BA] via-[#D4AF37] to-[#996515] flex items-center justify-center text-[#996515] font-bold text-sm border-2 border-[#996515]">BG</div>
            <div>
              <div className="text-xs text-gray-400">Your BaseGold</div>
              <div className="text-xl font-bold text-[#D4AF37] font-mono">
                {isConnected && bgBalance ? parseFloat(bgBalance.formatted).toFixed(4) : '0.0000'} 
                <span className="text-sm text-gray-500 ml-1">BG</span>
              </div>
            </div>
          </div>
          <button onClick={() => setActiveTab('buy')} className="px-4 py-2 bg-gradient-to-r from-[#D4AF37] to-[#996515] text-black font-bold text-sm rounded-lg">
            {isConnected && bgBalance && parseFloat(bgBalance.formatted) > 0 ? '+ Buy More' : '🛒 Buy BG'}
          </button>
        </div>
      </div>

      <div className="bg-gradient-to-r from-[#627EEA]/10 via-[#3C4C8C]/10 to-[#627EEA]/10 border-b border-[#627EEA]/30 py-2 px-4">
        <div className="flex justify-between items-center max-w-lg mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-[#627EEA] flex items-center justify-center text-white font-bold text-xs">Ξ</div>
            <div>
              <div className="text-xs text-gray-400">Your ETH</div>
              <div className="text-lg font-bold text-[#627EEA] font-mono">
                {isConnected && ethBalance ? parseFloat(ethBalance.formatted).toFixed(4) : '0.0000'}
                <span className="text-xs text-gray-500 ml-1">ETH</span>
              </div>
            </div>
          </div>
          <a href="https://bridge.base.org/" target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-[#627EEA]/20 border border-[#627EEA]/50 text-[#627EEA] font-medium text-xs rounded-lg">
            Get ETH
          </a>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex border-b border-white/10 overflow-x-auto">
        {[
          { id: 'game', label: '⛏️ Mine' },
          { id: 'shop', label: '💎 Shop' },
          { id: 'buy', label: '🛒 Buy BG' },
          { id: 'leaderboard', label: '🏆 Top' },
          { id: 'stats', label: '📊 Stats' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex-1 py-3 text-xs font-medium transition-all whitespace-nowrap px-2
              ${activeTab === tab.id 
                ? 'text-[#D4AF37] border-b-2 border-[#D4AF37] bg-[#D4AF37]/5' 
                : 'text-gray-500 hover:text-gray-300'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <main className="max-w-lg mx-auto p-4">
        {/* ============ GAME TAB ============ */}
        {activeTab === 'game' && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-4 gap-2 mb-4 p-3 bg-black/50 rounded-xl border border-white/10">
              <div className="text-center">
                <div className="text-lg font-bold text-[#D4AF37]">{formatNumber(gold)}</div>
                <div className="text-[10px] text-gray-500">GOLD</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-[#D4AF37]">{goldPerClick * clickMultiplier}</div>
                <div className="text-[10px] text-gray-500">PER CLICK</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-[#D4AF37]">{formatNumber(goldPerSecond)}</div>
                <div className="text-[10px] text-gray-500">PER SEC</div>
              </div>
              <div className="text-center">
                <div className="text-lg font-bold text-[#D4AF37]">x{combo}</div>
                <div className="text-[10px] text-gray-500">COMBO</div>
              </div>
            </div>

            {/* Verified On-Chain Bonuses */}
            {(verifiedBonuses.bonusClick > 0 || verifiedBonuses.bonusPassive > 0 || verifiedBonuses.hasCrown) && (
              <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                <div className="text-xs text-green-300 font-medium mb-2 text-center flex items-center justify-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                  Verified On-Chain Bonuses
                </div>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {verifiedBonuses.bonusClick > 0 && (
                    <div className="bg-green-500/20 rounded p-2 text-center">
                      <div className="text-green-400 font-bold">+{verifiedBonuses.bonusClick}</div>
                      <div className="text-green-300">per click</div>
                    </div>
                  )}
                  {verifiedBonuses.bonusPassive > 0 && (
                    <div className="bg-green-500/20 rounded p-2 text-center">
                      <div className="text-green-400 font-bold">+{verifiedBonuses.bonusPassive}</div>
                      <div className="text-green-300">per second</div>
                    </div>
                  )}
                </div>
                <div className="mt-2 text-center text-[10px] text-gray-400">
                  Burns: {userBurnCount} | Total: {userBurnAmount.toFixed(6)} BG
                </div>
              </div>
            )}

            {/* Active Boost */}
            {boostEndTime && (
              <div className="mb-4 p-2 bg-[#D4AF37]/20 border border-[#D4AF37] rounded-lg text-center animate-pulse">
                <span className="text-[#D4AF37]">⚡ {clickMultiplier}x BOOST ACTIVE</span>
              </div>
            )}

            {/* Gold Coin */}
            <div className="relative flex justify-center items-center h-56 mb-4">
              {floatingTexts.map(ft => (
                <div
                  key={ft.id}
                  className="absolute pointer-events-none font-bold text-[#D4AF37] text-xl"
                  style={{ left: ft.x, top: ft.y, animation: 'floatUp 1s ease-out forwards' }}
                >
                  {ft.text}
                </div>
              ))}
              <button
                onClick={handleClick}
                className="w-44 h-44 rounded-full select-none bg-gradient-to-br from-[#F4E4BA] via-[#D4AF37] to-[#996515] border-8 border-[#996515] shadow-[0_10px_30px_rgba(0,0,0,0.5),0_0_50px_rgba(212,175,55,0.3)] hover:shadow-[0_0_80px_rgba(212,175,55,0.5)] active:scale-95 transition-all duration-100 flex items-center justify-center text-4xl font-bold text-[#996515]"
              >
                BG
              </button>
            </div>

            {/* Upgrades */}
            <h3 className="text-[#D4AF37] mb-2">⚡ Upgrades</h3>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(upgrades).map(([key, upgrade]) => (
                <button
                  key={key}
                  onClick={() => buyUpgrade(key as keyof typeof upgrades)}
                  disabled={gold < upgrade.cost}
                  className={`p-2 rounded-lg border transition-all text-left text-sm
                    ${gold >= upgrade.cost 
                      ? 'bg-[#D4AF37]/10 border-[#D4AF37]/50 hover:bg-[#D4AF37]/20' 
                      : 'bg-white/5 border-white/10 opacity-50'}`}
                >
                  <div className="flex items-center gap-1 mb-1">
                    <span>{upgrade.emoji}</span>
                    <span className="text-xs font-medium">{upgrade.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-[#D4AF37] text-xs">{formatNumber(upgrade.cost)}</span>
                    <span className="text-gray-500 text-xs">x{upgrade.owned}</span>
                  </div>
                </button>
              ))}
            </div>
          </>
        )}

        {/* ============ SHOP TAB ============ */}
        {activeTab === 'shop' && (
          <>
            <div className="text-center mb-4">
              <h2 className="text-xl font-bold text-[#D4AF37] mb-1">💎 Premium Shop</h2>
              <p className="text-xs text-orange-400">Every purchase burns BG & is verified on-chain! 🔥</p>
            </div>

            {loadingVerification && (
              <div className="mb-4 p-3 bg-blue-500/20 border border-blue-500 rounded-lg text-center">
                <span className="text-blue-400">🔄 Verifying on-chain purchases...</span>
              </div>
            )}

            {purchaseSuccess && lastPurchasedItem && (
              <div className="mb-4 p-4 bg-green-500/20 border-2 border-green-500 rounded-xl text-center">
                <div className="text-3xl mb-2">🎉</div>
                <div className="text-green-400 font-bold text-lg">Purchase Verified!</div>
                <div className="mt-2 p-2 bg-black/30 rounded-lg">
                  <div className="text-white font-medium">{lastPurchasedItem.emoji} {lastPurchasedItem.name}</div>
                  <div className="text-green-300 text-sm mt-1">
                    {lastPurchasedItem.effect.type === 'permanent_click' && `✅ +${lastPurchasedItem.effect.amount} gold per click!`}
                    {lastPurchasedItem.effect.type === 'permanent_passive' && `✅ +${lastPurchasedItem.effect.amount} gold per second!`}
                    {lastPurchasedItem.effect.type === 'boost' && `✅ ${lastPurchasedItem.effect.multiplier}x boost active!`}
                    {lastPurchasedItem.effect.type === 'instant_gold' && `✅ +${lastPurchasedItem.effect.hours} hour(s) of gold!`}
                    {lastPurchasedItem.effect.type === 'cosmetic' && `✅ Crown unlocked! Max combo: ${lastPurchasedItem.effect.maxCombo}x`}
                    {lastPurchasedItem.effect.type === 'burn_contribution' && `✅ BG burned! Thank you!`}
                  </div>
                </div>
                <div className="text-orange-400 text-xs mt-2 flex items-center justify-center gap-1">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  Verified on Base blockchain
                </div>
              </div>
            )}

            {processingPurchase && !purchaseSuccess && (
              <div className="mb-4 p-3 bg-yellow-500/20 border border-yellow-500 rounded-lg text-center">
                <span className="text-yellow-400">⏳ Processing transaction...</span>
              </div>
            )}

            <div className="space-y-2">
              {SHOP_ITEMS.map(item => {
                const purchaseCount = verifiedPurchaseCounts[item.id] || 0;
                return (
                  <div key={item.id}>
                    <button
                      onClick={() => setSelectedItem(selectedItem?.id === item.id ? null : item)}
                      className={`w-full p-3 rounded-xl border transition-all text-left
                        ${selectedItem?.id === item.id 
                          ? 'bg-[#627EEA]/20 border-[#627EEA]' 
                          : 'bg-white/5 border-white/10 hover:border-[#D4AF37]/50'}`}
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                          <span className="text-2xl">{item.emoji}</span>
                          <div>
                            <div className="font-medium text-sm flex items-center gap-2">
                              {item.name}
                              {purchaseCount > 0 && (
                                <span className="text-xs bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded flex items-center gap-1">
                                  <span className="w-1.5 h-1.5 bg-green-500 rounded-full"></span>
                                  x{purchaseCount}
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-gray-400">{item.description}</div>
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-[#627EEA] font-bold">{item.priceETH} ETH</div>
                          <div className="text-xs text-gray-500">{item.priceUSD}</div>
                        </div>
                      </div>
                    </button>
                    
                    {selectedItem?.id === item.id && isConnected && (
                      <div className="mt-2 p-2 bg-black/50 rounded-lg space-y-2">
                        <Transaction
                          chainId={base.id}
                          calls={buildPurchaseCalls(item.priceETH)}
                          onStatus={(status) => {
                            console.log('📝 onStatus:', status.statusName);
                            if (status.statusName === 'transactionPending' || status.statusName === 'buildingTransaction') {
                              setProcessingPurchase(true);
                              setPendingPurchaseItem(item);
                            }
                          }}
                        >
                          <TransactionButton 
                            text={`Pay ${item.priceETH} ETH & Burn BG 🔥`}
                            className="w-full py-2 rounded-lg font-bold bg-gradient-to-r from-orange-500 to-red-500 text-sm"
                          />
                          <TransactionStatus>
                            <TransactionStatusLabel />
                            <TransactionStatusAction />
                          </TransactionStatus>
                        </Transaction>
                        
                        {processingPurchase && (
                          <button
                            onClick={() => handleManualClaim(item)}
                            className="w-full py-2 rounded-lg font-medium bg-green-600 hover:bg-green-500 text-white text-sm"
                          >
                            ✅ Transaction Complete? Click to Verify
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {!isConnected && (
              <div className="mt-4 text-center">
                <p className="text-gray-400 text-sm mb-2">Connect wallet to purchase</p>
                <Wallet><ConnectWallet /></Wallet>
              </div>
            )}
          </>
        )}

        {/* ============ BUY BG TAB ============ */}
        {activeTab === 'buy' && (
          <>
            <div className="text-center mb-4">
              <h2 className="text-xl font-bold text-[#D4AF37] mb-1">🛒 Buy BaseGold</h2>
              <p className="text-xs text-gray-400">Get BG and watch it grow as others burn!</p>
            </div>

            <div className="mb-4 p-4 bg-gradient-to-br from-[#D4AF37]/20 to-[#996515]/20 border border-[#D4AF37]/30 rounded-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#F4E4BA] via-[#D4AF37] to-[#996515] flex items-center justify-center text-[#996515] font-bold border-2 border-[#996515]">BG</div>
                  <div>
                    <div className="text-xs text-gray-400">Your Balance</div>
                    <div className="text-2xl font-bold text-[#D4AF37] font-mono">
                      {isConnected && bgBalance ? parseFloat(bgBalance.formatted).toFixed(4) : '0.0000'}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <h3 className="text-sm font-medium text-gray-300 mb-3">Choose an Exchange:</h3>
            
            <div className="space-y-2">
              <a href="https://aerodrome.finance/swap?from=eth&to=0x36b712A629095234F2196BbB000D1b96C12Ce78e" target="_blank" rel="noopener noreferrer" className="block p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl hover:bg-blue-500/20 transition-all">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-xl">🔵</div>
                    <div>
                      <div className="font-medium text-white">Aerodrome</div>
                      <div className="text-xs text-gray-400">Recommended • Best liquidity</div>
                    </div>
                  </div>
                  <div className="text-blue-400 text-sm">Swap →</div>
                </div>
              </a>

              <a href="https://app.uniswap.org/swap?outputCurrency=0x36b712A629095234F2196BbB000D1b96C12Ce78e&chain=base" target="_blank" rel="noopener noreferrer" className="block p-4 bg-pink-500/10 border border-pink-500/30 rounded-xl hover:bg-pink-500/20 transition-all">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-pink-500/20 flex items-center justify-center text-xl">🦄</div>
                    <div>
                      <div className="font-medium text-white">Uniswap</div>
                      <div className="text-xs text-gray-400">Popular DEX</div>
                    </div>
                  </div>
                  <div className="text-pink-400 text-sm">Swap →</div>
                </div>
              </a>
            </div>

            <div className="mt-4 p-3 bg-white/5 rounded-lg">
              <div className="text-xs text-gray-400 mb-1">BG Contract Address:</div>
              <div className="flex items-center gap-2">
                <code className="text-xs text-[#D4AF37] font-mono flex-1 truncate">0x36b712A629095234F2196BbB000D1b96C12Ce78e</code>
                <button onClick={() => { navigator.clipboard.writeText('0x36b712A629095234F2196BbB000D1b96C12Ce78e'); alert('Copied!'); }} className="px-2 py-1 bg-white/10 rounded text-xs hover:bg-white/20">Copy</button>
              </div>
            </div>
          </>
        )}

        {/* ============ LEADERBOARD TAB ============ */}
        {activeTab === 'leaderboard' && (
          <>
            <div className="text-center mb-4">
              <h2 className="text-xl font-bold text-[#D4AF37] mb-1">🏆 Leaderboards</h2>
              <p className="text-xs text-gray-400">Verified on-chain rankings</p>
            </div>

            <div className="flex gap-2 mb-4">
              <button
                onClick={() => setLeaderboardTab('burns')}
                className={`flex-1 py-2 rounded-lg font-medium transition-all text-sm
                  ${leaderboardTab === 'burns' 
                    ? 'bg-orange-500/20 border border-orange-500 text-orange-400' 
                    : 'bg-white/5 border border-white/10 text-gray-400'}`}
              >
                🔥 Top Burners
              </button>
              <button
                onClick={() => setLeaderboardTab('points')}
                className={`flex-1 py-2 rounded-lg font-medium transition-all text-sm
                  ${leaderboardTab === 'points' 
                    ? 'bg-[#D4AF37]/20 border border-[#D4AF37] text-[#D4AF37]' 
                    : 'bg-white/5 border border-white/10 text-gray-400'}`}
              >
                ⛏️ Top Miners
              </button>
            </div>

            {leaderboardTab === 'burns' && (
              <div className="space-y-2">
                <div className="p-2 bg-green-500/10 border border-green-500/30 rounded-lg text-center text-xs text-green-400">
                  ✓ 100% On-Chain Verified
                </div>
                
                {loadingLeaderboard ? (
                  <div className="text-center py-8 text-gray-400">
                    <div className="animate-spin text-2xl mb-2">🔥</div>
                    Loading from blockchain...
                  </div>
                ) : burnLeaderboard.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <div className="text-4xl mb-2">🔥</div>
                    <p>No burns yet!</p>
                  </div>
                ) : (
                  burnLeaderboard.slice(0, 10).map((entry, index) => (
                    <div 
                      key={entry.address}
                      className={`flex justify-between items-center p-3 rounded-lg border
                        ${entry.address.toLowerCase() === address?.toLowerCase()
                          ? 'bg-orange-500/20 border-orange-500'
                          : 'bg-white/5 border-white/10'}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`text-lg font-bold w-8 ${index === 0 ? 'text-yellow-400' : index === 1 ? 'text-gray-300' : index === 2 ? 'text-orange-400' : 'text-gray-500'}`}>
                          {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                        </span>
                        <div className="font-mono text-sm">{entry.address.slice(0, 6)}...{entry.address.slice(-4)}</div>
                      </div>
                      <div className="text-orange-400 font-bold">{entry.totalBurned.toFixed(6)} BG</div>
                    </div>
                  ))
                )}
              </div>
            )}

            {leaderboardTab === 'points' && (
              <div className="space-y-2">
                {/* Requirements Notice */}
                <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                  <div className="text-xs text-blue-400 mb-2">📋 Requirements to Submit:</div>
                  <ul className="text-xs text-gray-400 space-y-1">
                    <li>✓ Minimum {MIN_BURNS_FOR_LEADERBOARD} burn transaction(s)</li>
                    <li>✓ Wallet signature verification</li>
                    <li>✓ Score validation (anti-cheat)</li>
                  </ul>
                </div>

                {isConnected && (
                  <div className="p-3 bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-gray-300">Your Score:</span>
                      <span className="text-[#D4AF37] font-bold">{formatNumber(gold)} gold</span>
                    </div>
                    <div className="flex justify-between items-center mb-2 text-xs">
                      <span className="text-gray-400">Your Burns:</span>
                      <span className={userBurnCount >= MIN_BURNS_FOR_LEADERBOARD ? 'text-green-400' : 'text-red-400'}>
                        {userBurnCount} {userBurnCount >= MIN_BURNS_FOR_LEADERBOARD ? '✓' : `(need ${MIN_BURNS_FOR_LEADERBOARD})`}
                      </span>
                    </div>
                    
                    {submitError && (
                      <div className="mb-2 p-2 bg-red-500/20 border border-red-500/50 rounded text-xs text-red-400">
                        {submitError}
                      </div>
                    )}
                    
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={playerName}
                        onChange={(e) => setPlayerName(e.target.value.slice(0, 20))}
                        placeholder="Your name"
                        className="flex-1 bg-black/50 border border-white/20 rounded px-2 py-1 text-sm"
                        maxLength={20}
                      />
                      <button
                        onClick={submitVerifiedScore}
                        disabled={submittingScore || userBurnCount < MIN_BURNS_FOR_LEADERBOARD}
                        className={`px-4 py-1 rounded font-medium text-sm flex items-center gap-1
                          ${userBurnCount >= MIN_BURNS_FOR_LEADERBOARD 
                            ? 'bg-[#D4AF37] text-black' 
                            : 'bg-gray-600 text-gray-400'}`}
                      >
                        {submittingScore ? '...' : '🔐 Sign & Submit'}
                      </button>
                    </div>
                  </div>
                )}

                {pointsLeaderboard.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <div className="text-4xl mb-2">⛏️</div>
                    <p>No verified scores yet!</p>
                  </div>
                ) : (
                  pointsLeaderboard.slice(0, 10).map((entry, index) => (
                    <div 
                      key={entry.address}
                      className={`flex justify-between items-center p-3 rounded-lg border
                        ${entry.address.toLowerCase() === address?.toLowerCase()
                          ? 'bg-[#D4AF37]/20 border-[#D4AF37]'
                          : 'bg-white/5 border-white/10'}`}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`text-lg font-bold w-8 ${index === 0 ? 'text-yellow-400' : index === 1 ? 'text-gray-300' : index === 2 ? 'text-orange-400' : 'text-gray-500'}`}>
                          {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                        </span>
                        <div>
                          <div className="font-medium text-sm">{entry.name}</div>
                          <div className="text-xs text-gray-500">🔥 {entry.burnCount} burns</div>
                        </div>
                      </div>
                      <div className="text-[#D4AF37] font-bold">{formatNumber(entry.gold)}</div>
                    </div>
                  ))
                )}
              </div>
            )}
          </>
        )}

        {/* ============ STATS TAB ============ */}
        {activeTab === 'stats' && (
          <>
            <div className="text-center mb-4">
              <h2 className="text-xl font-bold text-[#D4AF37] mb-1">📊 Burn Stats</h2>
              <p className="text-xs text-gray-400">Real-time deflationary metrics</p>
            </div>

            <div className="mb-6 p-6 bg-gradient-to-br from-orange-900/30 to-red-900/30 border border-orange-500/30 rounded-2xl text-center">
              <div className="text-5xl mb-2">🔥</div>
              <div className="text-3xl font-bold text-orange-400 font-mono">{totalBurned.toFixed(4)}</div>
              <div className="text-gray-400">BG Burned Forever</div>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-black/30 p-4 rounded-xl text-center">
                <div className="text-2xl font-bold text-[#D4AF37]">{(INITIAL_SUPPLY - totalBurned).toFixed(2)}</div>
                <div className="text-xs text-gray-500">Circulating</div>
              </div>
              <div className="bg-black/30 p-4 rounded-xl text-center">
                <div className="text-2xl font-bold text-orange-400">{((totalBurned / INITIAL_SUPPLY) * 100).toFixed(2)}%</div>
                <div className="text-xs text-gray-500">Burned</div>
              </div>
              <div className="bg-black/30 p-4 rounded-xl text-center">
                <div className="text-2xl font-bold text-green-400">{Math.round(21000000 / (INITIAL_SUPPLY - totalBurned)).toLocaleString()}x</div>
                <div className="text-xs text-gray-500">vs Bitcoin</div>
              </div>
              <div className="bg-black/30 p-4 rounded-xl text-center">
                <div className="text-2xl font-bold text-blue-400">{totalBurnCount}</div>
                <div className="text-xs text-gray-500">Total Burns</div>
              </div>
            </div>

            <div className="bg-white/5 p-4 rounded-xl">
              <h3 className="text-sm font-medium text-gray-300 mb-3">🔐 Security Features</h3>
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2 text-green-400">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  Premium purchases verified on-chain
                </div>
                <div className="flex items-center gap-2 text-green-400">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  Leaderboard requires wallet signature
                </div>
                <div className="flex items-center gap-2 text-green-400">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  Click rate anti-cheat ({MAX_CLICKS_PER_SECOND} CPS max)
                </div>
                <div className="flex items-center gap-2 text-green-400">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  Score validation vs blockchain data
                </div>
                <div className="flex items-center gap-2 text-green-400">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  Minimum burn requirement for leaderboard
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      <style jsx global>{`
        @keyframes floatUp {
          0% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-50px); }
        }
      `}</style>
    </div>
  );
}
