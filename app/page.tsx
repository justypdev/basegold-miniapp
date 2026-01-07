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
import { ConnectWallet, Wallet, WalletDropdown, WalletDropdownFundLink } from '@coinbase/onchainkit/wallet';
import { FundButton } from '@coinbase/onchainkit/fund';
import { Avatar, Name } from '@coinbase/onchainkit/identity';
import { encodeFunctionData, parseUnits, formatUnits, parseEther, parseAbiItem } from 'viem';
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

const MAX_CLICKS_PER_SECOND = 20;
const MIN_BURNS_FOR_LEADERBOARD = 1;
const VERIFICATION_POLL_INTERVAL = 2000; // Poll every 2 seconds
const VERIFICATION_MAX_ATTEMPTS = 30; // Max 60 seconds of polling

// ============ ABIs ============

const ERC20_ABI = [
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

// ============ SHOP ITEMS (ETH prices) ============
// Effects are ONLY applied after on-chain verification

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

interface OnChainPurchase {
  itemId: string;
  ethAmount: string;
  bgBurned: number;
  timestamp: number;
  txHash: string;
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

// ============ HELPER: Match ETH amount to shop item ============

function matchEthToItem(ethAmount: string): typeof SHOP_ITEMS[0] | null {
  const eth = parseFloat(ethAmount);
  for (const item of SHOP_ITEMS) {
    const itemEth = parseFloat(item.priceETH);
    // Allow 5% tolerance for gas variations
    if (Math.abs(eth - itemEth) / itemEth < 0.05) {
      return item;
    }
  }
  return null;
}

// ============ HELPER: Calculate bonuses from verified purchases ============

function calculateVerifiedBonuses(purchases: OnChainPurchase[], currentTime: number) {
  let bonusClick = 0;
  let bonusPassive = 0;
  let hasCrown = false;
  let maxCombo = 10;
  let activeBoost: { multiplier: number; endTime: number; remaining: number } | null = null;
  let instantGoldPending = 0;

  purchases.forEach(purchase => {
    const item = matchEthToItem(purchase.ethAmount);
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
        const boostEndTime = purchase.timestamp + (item.effect.duration || 600000);
        const remaining = boostEndTime - currentTime;
        if (remaining > 0) {
          // Keep the boost with most time remaining
          if (!activeBoost || remaining > activeBoost.remaining) {
            activeBoost = { 
              multiplier: item.effect.multiplier || 2, 
              endTime: boostEndTime,
              remaining 
            };
          }
        }
        break;
      case 'instant_gold':
        // Track for display, actual gold added when verified
        instantGoldPending++;
        break;
    }
  });

  return { bonusClick, bonusPassive, hasCrown, maxCombo, activeBoost, instantGoldPending };
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

function VerificationStatus({ status, item }: { status: string; item: typeof SHOP_ITEMS[0] }) {
  return (
    <div className="p-4 bg-blue-500/20 border border-blue-500 rounded-xl">
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
        <div>
          <div className="text-blue-400 font-medium">{status}</div>
          <div className="text-xs text-gray-400">{item.emoji} {item.name}</div>
        </div>
      </div>
    </div>
  );
}

// ============ MAIN COMPONENT ============

export default function MinerGame() {
  const [isReady, setIsReady] = useState(false);
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
  
  const [verifiedPurchases, setVerifiedPurchases] = useState<OnChainPurchase[]>([]);
  const [userBurnCount, setUserBurnCount] = useState(0);
  const [userBurnAmount, setUserBurnAmount] = useState(0);
  const [loadingVerification, setLoadingVerification] = useState(true);
  
  // Purchase verification state
  const [pendingVerification, setPendingVerification] = useState<{
    item: typeof SHOP_ITEMS[0];
    startTime: number;
    initialBurnCount: number;
    status: string;
  } | null>(null);
  const [verificationSuccess, setVerificationSuccess] = useState<typeof SHOP_ITEMS[0] | null>(null);
  const [verificationError, setVerificationError] = useState<string | null>(null);

  // ============ SESSION STATE ============
  
  const [gold, setGold] = useState(0);
  const [totalClicks, setTotalClicks] = useState(0);
  const [combo, setCombo] = useState(1);
  const [lastClickTime, setLastClickTime] = useState(0);
  const [upgrades, setUpgrades] = useState(INITIAL_UPGRADES);
  const [appliedInstantGold, setAppliedInstantGold] = useState<Set<string>>(new Set());
  const [currentTime, setCurrentTime] = useState(Date.now());
  
  // UI state
  const [activeTab, setActiveTab] = useState<'game' | 'shop' | 'buy' | 'leaderboard' | 'stats'>('game');
  const [floatingTexts, setFloatingTexts] = useState<Array<{id: number, text: string, x: number, y: number}>>([]);
  const [selectedItem, setSelectedItem] = useState<typeof SHOP_ITEMS[0] | null>(null);
  
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

  // Update current time for boost calculations
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Calculate verified bonuses
  const verifiedBonuses = useMemo(() => 
    calculateVerifiedBonuses(verifiedPurchases, currentTime), 
    [verifiedPurchases, currentTime]
  );
  
  // Calculate base stats from upgrades
  const baseGoldPerClick = useMemo(() => {
    return 1 + Object.values(upgrades).reduce((sum, u) => sum + u.owned * u.perClick, 0);
  }, [upgrades]);
  
  const baseGoldPerSecond = useMemo(() => {
    return Object.values(upgrades).reduce((sum, u) => sum + u.owned * u.perSec, 0);
  }, [upgrades]);
  
  // Final values from on-chain data
  const goldPerClick = baseGoldPerClick + verifiedBonuses.bonusClick;
  const goldPerSecond = baseGoldPerSecond + verifiedBonuses.bonusPassive;
  const clickMultiplier = verifiedBonuses.activeBoost?.multiplier || 1;
  const boostEndTime = verifiedBonuses.activeBoost?.endTime || null;
  const boostRemaining = verifiedBonuses.activeBoost?.remaining || 0;
  const hasCrown = verifiedBonuses.hasCrown;
  const maxCombo = verifiedBonuses.maxCombo;

  // ============ FETCH ON-CHAIN PURCHASES ============
  
  const fetchVerifiedPurchases = useCallback(async (): Promise<OnChainPurchase[]> => {
    if (!publicClient || !address) {
      setLoadingVerification(false);
      return [];
    }
    
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
        const txHash = log.transactionHash;
        
        totalBurned += bgBurned;

        const matchingItem = matchEthToItem(ethAmount);
        if (matchingItem) {
          purchases.push({
            itemId: matchingItem.id,
            ethAmount,
            bgBurned,
            timestamp,
            txHash,
          });
        }
      });

      setVerifiedPurchases(purchases);
      setUserBurnCount(logs.length);
      setUserBurnAmount(totalBurned);
      setLoadingVerification(false);
      
      return purchases;
    } catch (error) {
      console.error('Error fetching verified purchases:', error);
      setLoadingVerification(false);
      return [];
    }
  }, [publicClient, address]);

  // Initial fetch
  useEffect(() => {
    fetchVerifiedPurchases();
  }, [fetchVerifiedPurchases]);

  // ============ PURCHASE VERIFICATION POLLING ============
  
  useEffect(() => {
    if (!pendingVerification || !publicClient || !address) return;

    let attempts = 0;
    const pollInterval = setInterval(async () => {
      attempts++;
      
      if (attempts > VERIFICATION_MAX_ATTEMPTS) {
        clearInterval(pollInterval);
        setVerificationError('Verification timed out. Please check your transaction on BaseScan.');
        setPendingVerification(null);
        return;
      }

      setPendingVerification(prev => prev ? {
        ...prev,
        status: `Verifying on blockchain... (${attempts}/${VERIFICATION_MAX_ATTEMPTS})`
      } : null);

      try {
        const purchases = await fetchVerifiedPurchases();
        
        // Check if we have more burns than before
        if (purchases.length > pendingVerification.initialBurnCount) {
          // Find the new purchase
          const newPurchase = purchases.find(p => 
            p.timestamp > pendingVerification.startTime - 60000 // Within last minute
          );

          if (newPurchase) {
            const verifiedItem = matchEthToItem(newPurchase.ethAmount);
            
            if (verifiedItem && verifiedItem.id === pendingVerification.item.id) {
              // SUCCESS! Purchase verified on-chain
              clearInterval(pollInterval);
              
              console.log('✅ Purchase verified on-chain:', verifiedItem.id, 'txHash:', newPurchase.txHash);
              
              // Apply instant gold if applicable
              if (verifiedItem.effect.type === 'instant_gold' && !appliedInstantGold.has(newPurchase.txHash)) {
                const instantGold = goldPerSecond * 3600 * (verifiedItem.effect.hours || 1);
                setGold(prev => prev + instantGold);
                setAppliedInstantGold(prev => new Set([...prev, newPurchase.txHash]));
              }
              
              setVerificationSuccess(verifiedItem);
              setPendingVerification(null);
              setSelectedItem(null);
              
              setTimeout(() => setVerificationSuccess(null), 6000);
            }
          }
        }
      } catch (error) {
        console.error('Verification poll error:', error);
      }
    }, VERIFICATION_POLL_INTERVAL);

    return () => clearInterval(pollInterval);
  }, [pendingVerification, publicClient, address, fetchVerifiedPurchases, goldPerSecond, appliedInstantGold]);

  // ============ WATCH BURN EVENTS ============

  useWatchContractEvent({
    address: INSTANT_BURN,
    abi: INSTANT_BURN_ABI,
    eventName: 'InstantBurn',
    onLogs(logs) {
      logs.forEach((log: any) => {
        const bgBurned = formatUnits(log.args.bgBurned || 0n, 18);
        const buyerAddress = log.args.buyer as string;
        const buyerShort = buyerAddress?.slice(0, 6) + '...' + buyerAddress?.slice(-4);
        
        const id = Date.now();
        setBurnNotifications(prev => [...prev, { id, amount: parseFloat(bgBurned).toFixed(6), buyer: buyerShort }]);
        
        refetchSupply();
        refetchBurnStats();
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
        .map(([address, data]) => ({ address, ...data }))
        .sort((a, b) => b.totalBurned - a.totalBurned)
        .slice(0, 50);

      setBurnLeaderboard(leaderboard);
    } catch (error) {
      console.error('Error fetching burn leaderboard:', error);
    }
    setLoadingLeaderboard(false);
  }, [publicClient]);

  const loadPointsLeaderboard = useCallback(() => {
    try {
      const saved = localStorage.getItem('basegold-verified-leaderboard-v2');
      if (saved) {
        const data = JSON.parse(saved) as VerifiedPointsEntry[];
        setPointsLeaderboard(data
          .filter(e => Date.now() - e.timestamp < 30 * 24 * 60 * 60 * 1000)
          .sort((a, b) => b.gold - a.gold)
          .slice(0, 50));
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
    
    if (userBurnCount < MIN_BURNS_FOR_LEADERBOARD) {
      setSubmitError(`Must have at least ${MIN_BURNS_FOR_LEADERBOARD} verified burn(s). You have: ${userBurnCount}`);
      return;
    }

    setSubmittingScore(true);
    
    try {
      const timestamp = Date.now();
      const message = `BaseGold Score Submission\nAddress: ${address}\nGold: ${gold}\nClicks: ${totalClicks}\nBurns: ${userBurnCount}\nTimestamp: ${timestamp}`;
      
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
        sessionDuration: Date.now() - sessionStartTime.current,
      };

      const saved = localStorage.getItem('basegold-verified-leaderboard-v2');
      let leaderboard: VerifiedPointsEntry[] = saved ? JSON.parse(saved) : [];
      
      const existingIndex = leaderboard.findIndex(e => e.address.toLowerCase() === address.toLowerCase());
      
      if (existingIndex >= 0) {
        if (gold > leaderboard[existingIndex].gold) {
          leaderboard[existingIndex] = newEntry;
        }
      } else {
        leaderboard.push(newEntry);
      }
      
      leaderboard = leaderboard
        .filter(e => Date.now() - e.timestamp < 30 * 24 * 60 * 60 * 1000)
        .sort((a, b) => b.gold - a.gold)
        .slice(0, 100);
      
      localStorage.setItem('basegold-verified-leaderboard-v2', JSON.stringify(leaderboard));
      setPointsLeaderboard(leaderboard.slice(0, 50));
      
      alert('✅ Score submitted and verified! 🏆');
    } catch (error: any) {
      console.error('Error submitting score:', error);
      setSubmitError(error.message || 'Failed to sign score');
    }
    
    setSubmittingScore(false);
  }, [address, signMessageAsync, gold, totalClicks, userBurnCount, userBurnAmount, playerName]);

  // ============ GAME LOGIC ============

  useEffect(() => {
    const init = async () => {
      try { await sdk.actions.ready(); } catch {}
      setIsReady(true);
      sessionStartTime.current = Date.now();
    };
    init();
  }, []);

  useEffect(() => {
    const savedName = localStorage.getItem('basegold-player-name');
    if (savedName) setPlayerName(savedName);
  }, []);

  useEffect(() => {
    if (playerName) localStorage.setItem('basegold-player-name', playerName);
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
      const dead = deadBalance ? Number(formatUnits(deadBalance as bigint, 18)) : 0;
      const burned = INITIAL_SUPPLY - supply + dead;
      setTotalBurned(burned);
    }
  }, [totalSupply, deadBalance]);

  // Refresh data
  useEffect(() => {
    const interval = setInterval(() => {
      refetchSupply();
      refetchBurnStats();
      fetchVerifiedPurchases();
    }, 15000);
    return () => clearInterval(interval);
  }, [refetchSupply, refetchBurnStats, fetchVerifiedPurchases]);

  // Click handler with rate limiting
  const handleClick = useCallback((e: React.MouseEvent) => {
    const now = Date.now();
    
    clickTimestamps.current = clickTimestamps.current.filter(t => now - t < 1000);
    if (clickTimestamps.current.length >= MAX_CLICKS_PER_SECOND) return;
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

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  const buildPurchaseCalls = (priceETH: string) => {
    return [{
      to: INSTANT_BURN,
      value: parseEther(priceETH),
      data: encodeFunctionData({
        abi: INSTANT_BURN_ABI,
        functionName: 'buyAndBurn',
        args: [],
      }),
    }];
  };

  // Start verification after transaction
  const startVerification = useCallback((item: typeof SHOP_ITEMS[0]) => {
    setPendingVerification({
      item,
      startTime: Date.now(),
      initialBurnCount: userBurnCount,
      status: 'Waiting for blockchain confirmation...',
    });
    setVerificationError(null);
  }, [userBurnCount]);

  // Parse burn stats
  const burnStatsArray = burnStats as [bigint, bigint, bigint] | undefined;
  const totalBurnCount = burnStatsArray ? Number(burnStatsArray[2]) : 0;

  // Count verified purchases
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
          <span className="text-[10px] bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded ml-1">ON-CHAIN</span>
        </div>
        <Wallet>
          <ConnectWallet>
            <Avatar className="w-5 h-5" />
            <Name className="text-xs" />
          </ConnectWallet>
        </Wallet>
      </header>

      {/* Burn Ticker */}
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

      {/* Balances */}
      <div className="bg-gradient-to-r from-[#D4AF37]/10 via-[#996515]/10 to-[#D4AF37]/10 border-b border-[#D4AF37]/30 py-3 px-4">
        <div className="flex justify-between items-center max-w-lg mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#F4E4BA] via-[#D4AF37] to-[#996515] flex items-center justify-center text-[#996515] font-bold text-sm border-2 border-[#996515]">BG</div>
            <div>
              <div className="text-xs text-gray-400">Your BaseGold</div>
              <div className="text-xl font-bold text-[#D4AF37] font-mono">
                {isConnected && bgBalance ? parseFloat(bgBalance.formatted).toFixed(4) : '0.0000'}
              </div>
            </div>
          </div>
          <button onClick={() => setActiveTab('buy')} className="px-4 py-2 bg-gradient-to-r from-[#D4AF37] to-[#996515] text-black font-bold text-sm rounded-lg">
            🛒 Buy BG
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
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <FundButton className="px-3 py-1.5 bg-[#627EEA] text-white font-medium text-xs rounded-lg" />
            <a href="https://relay.link/bridge/base" target="_blank" rel="noopener noreferrer" className="px-3 py-1.5 bg-[#627EEA]/20 border border-[#627EEA]/50 text-[#627EEA] font-medium text-xs rounded-lg hover:bg-[#627EEA]/30">
              🌉 Bridge
            </a>
          </div>
        </div>
      </div>

      {/* Tabs */}
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
            className={`flex-1 py-3 text-xs font-medium transition-all whitespace-nowrap px-2 ${activeTab === tab.id ? 'text-[#D4AF37] border-b-2 border-[#D4AF37] bg-[#D4AF37]/5' : 'text-gray-500'}`}
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

            {/* On-Chain Verified Bonuses */}
            {(verifiedBonuses.bonusClick > 0 || verifiedBonuses.bonusPassive > 0 || hasCrown || boostEndTime) && (
              <div className="mb-4 p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                <div className="text-xs text-green-300 font-medium mb-2 text-center flex items-center justify-center gap-2">
                  <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                  On-Chain Verified Bonuses
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
                {boostEndTime && (
                  <div className="mt-2 p-2 bg-yellow-500/20 rounded text-center">
                    <div className="text-yellow-400 font-bold">⚡ {clickMultiplier}x BOOST</div>
                    <div className="text-yellow-300 text-xs">{formatTime(boostRemaining)} remaining</div>
                  </div>
                )}
              </div>
            )}

            {/* Gold Coin */}
            <div className="relative flex justify-center items-center h-56 mb-4">
              {floatingTexts.map(ft => (
                <div key={ft.id} className="absolute pointer-events-none font-bold text-[#D4AF37] text-xl" style={{ left: ft.x, top: ft.y, animation: 'floatUp 1s ease-out forwards' }}>
                  {ft.text}
                </div>
              ))}
              <button onClick={handleClick} className="w-44 h-44 rounded-full select-none bg-gradient-to-br from-[#F4E4BA] via-[#D4AF37] to-[#996515] border-8 border-[#996515] shadow-[0_10px_30px_rgba(0,0,0,0.5),0_0_50px_rgba(212,175,55,0.3)] hover:shadow-[0_0_80px_rgba(212,175,55,0.5)] active:scale-95 transition-all duration-100 flex items-center justify-center text-4xl font-bold text-[#996515]">
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
                  className={`p-2 rounded-lg border transition-all text-left text-sm ${gold >= upgrade.cost ? 'bg-[#D4AF37]/10 border-[#D4AF37]/50 hover:bg-[#D4AF37]/20' : 'bg-white/5 border-white/10 opacity-50'}`}
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
              <p className="text-xs text-gray-400">All purchases verified on Base blockchain 🔗</p>
            </div>

            {/* Verification in Progress */}
            {pendingVerification && (
              <div className="mb-4">
                <VerificationStatus status={pendingVerification.status} item={pendingVerification.item} />
              </div>
            )}

            {/* Verification Success */}
            {verificationSuccess && (
              <div className="mb-4 p-4 bg-green-500/20 border-2 border-green-500 rounded-xl text-center">
                <div className="text-3xl mb-2">✅</div>
                <div className="text-green-400 font-bold text-lg">Verified On-Chain!</div>
                <div className="mt-2 p-2 bg-black/30 rounded-lg">
                  <div className="text-white font-medium">{verificationSuccess.emoji} {verificationSuccess.name}</div>
                  <div className="text-green-300 text-sm mt-1">
                    {verificationSuccess.effect.type === 'permanent_click' && `+${verificationSuccess.effect.amount} gold per click`}
                    {verificationSuccess.effect.type === 'permanent_passive' && `+${verificationSuccess.effect.amount} gold per second`}
                    {verificationSuccess.effect.type === 'boost' && `${verificationSuccess.effect.multiplier}x boost for ${(verificationSuccess.effect.duration || 0) / 60000} min`}
                    {verificationSuccess.effect.type === 'instant_gold' && `+${verificationSuccess.effect.hours} hour(s) of gold`}
                    {verificationSuccess.effect.type === 'cosmetic' && `Crown unlocked!`}
                    {verificationSuccess.effect.type === 'burn_contribution' && `BG burned!`}
                  </div>
                </div>
                <div className="text-xs text-gray-400 mt-2">Transaction confirmed on Base</div>
              </div>
            )}

            {/* Verification Error */}
            {verificationError && (
              <div className="mb-4 p-4 bg-red-500/20 border border-red-500 rounded-xl text-center">
                <div className="text-red-400">{verificationError}</div>
                <button onClick={() => setVerificationError(null)} className="mt-2 text-xs text-gray-400 hover:text-white">
                  Dismiss
                </button>
              </div>
            )}

            {/* Shop Items */}
            <div className="space-y-2">
              {SHOP_ITEMS.map(item => {
                const purchaseCount = verifiedPurchaseCounts[item.id] || 0;
                const isDisabled = !!pendingVerification;
                
                return (
                  <div key={item.id}>
                    <button
                      onClick={() => !isDisabled && setSelectedItem(selectedItem?.id === item.id ? null : item)}
                      disabled={isDisabled}
                      className={`w-full p-3 rounded-xl border transition-all text-left ${isDisabled ? 'opacity-50' : ''} ${selectedItem?.id === item.id ? 'bg-[#627EEA]/20 border-[#627EEA]' : 'bg-white/5 border-white/10 hover:border-[#D4AF37]/50'}`}
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
                    
                    {selectedItem?.id === item.id && isConnected && !pendingVerification && (
                      <div className="mt-2 p-3 bg-black/50 rounded-lg space-y-3">
                        <div className="text-xs text-gray-400 text-center">
                          ⏱️ After purchase, we'll verify on-chain before applying effects
                        </div>
                        <Transaction
                          chainId={base.id}
                          calls={buildPurchaseCalls(item.priceETH)}
                          onStatus={(status) => {
                            console.log('📝 Status:', status.statusName);
                            if (status.statusName === 'success') {
                              startVerification(item);
                            }
                          }}
                        >
                          <TransactionButton 
                            text={`Pay ${item.priceETH} ETH & Burn BG 🔥`}
                            className="w-full py-3 rounded-lg font-bold bg-gradient-to-r from-orange-500 to-red-500 text-sm"
                          />
                          <TransactionStatus>
                            <TransactionStatusLabel />
                            <TransactionStatusAction />
                          </TransactionStatus>
                        </Transaction>
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

            {/* Security Info */}
            <div className="mt-6 p-3 bg-green-500/5 border border-green-500/20 rounded-lg">
              <div className="text-xs text-green-400 font-medium mb-2">🔐 Security</div>
              <ul className="text-xs text-gray-400 space-y-1">
                <li>• All purchases verified on Base blockchain</li>
                <li>• Effects only apply after on-chain confirmation</li>
                <li>• Cannot be manipulated or exploited</li>
              </ul>
            </div>
          </>
        )}

        {/* ============ BUY BG TAB ============ */}
        {activeTab === 'buy' && (
          <>
            <div className="text-center mb-4">
              <h2 className="text-xl font-bold text-[#D4AF37] mb-1">🛒 Buy BaseGold</h2>
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

            <div className="space-y-2">
              <a href="https://aerodrome.finance/swap?from=eth&to=0x36b712A629095234F2196BbB000D1b96C12Ce78e" target="_blank" rel="noopener noreferrer" className="block p-4 bg-blue-500/10 border border-blue-500/30 rounded-xl hover:bg-blue-500/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-blue-500/20 flex items-center justify-center text-xl">🔵</div>
                    <div>
                      <div className="font-medium text-white">Aerodrome</div>
                      <div className="text-xs text-gray-400">Best liquidity</div>
                    </div>
                  </div>
                  <div className="text-blue-400 text-sm">Swap →</div>
                </div>
              </a>

              <a href="https://app.uniswap.org/swap?outputCurrency=0x36b712A629095234F2196BbB000D1b96C12Ce78e&chain=base" target="_blank" rel="noopener noreferrer" className="block p-4 bg-pink-500/10 border border-pink-500/30 rounded-xl hover:bg-pink-500/20">
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
              <div className="text-xs text-gray-400 mb-1">Contract:</div>
              <div className="flex items-center gap-2">
                <code className="text-xs text-[#D4AF37] font-mono flex-1 truncate">0x36b712A629095234F2196BbB000D1b96C12Ce78e</code>
                <button onClick={() => { navigator.clipboard.writeText('0x36b712A629095234F2196BbB000D1b96C12Ce78e'); }} className="px-2 py-1 bg-white/10 rounded text-xs">Copy</button>
              </div>
            </div>
          </>
        )}

        {/* ============ LEADERBOARD TAB ============ */}
        {activeTab === 'leaderboard' && (
          <>
            <div className="text-center mb-4">
              <h2 className="text-xl font-bold text-[#D4AF37] mb-1">🏆 Leaderboards</h2>
            </div>

            <div className="flex gap-2 mb-4">
              <button onClick={() => setLeaderboardTab('burns')} className={`flex-1 py-2 rounded-lg font-medium text-sm ${leaderboardTab === 'burns' ? 'bg-orange-500/20 border border-orange-500 text-orange-400' : 'bg-white/5 border border-white/10 text-gray-400'}`}>
                🔥 Burners
              </button>
              <button onClick={() => setLeaderboardTab('points')} className={`flex-1 py-2 rounded-lg font-medium text-sm ${leaderboardTab === 'points' ? 'bg-[#D4AF37]/20 border border-[#D4AF37] text-[#D4AF37]' : 'bg-white/5 border border-white/10 text-gray-400'}`}>
                ⛏️ Miners
              </button>
            </div>

            {leaderboardTab === 'burns' && (
              <div className="space-y-2">
                <div className="p-2 bg-green-500/10 border border-green-500/30 rounded-lg text-center text-xs text-green-400">
                  ✓ 100% On-Chain
                </div>
                
                {loadingLeaderboard ? (
                  <div className="text-center py-8 text-gray-400">Loading...</div>
                ) : burnLeaderboard.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">No burns yet</div>
                ) : (
                  burnLeaderboard.slice(0, 10).map((entry, index) => (
                    <div key={entry.address} className={`flex justify-between items-center p-3 rounded-lg border ${entry.address.toLowerCase() === address?.toLowerCase() ? 'bg-orange-500/20 border-orange-500' : 'bg-white/5 border-white/10'}`}>
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
                <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-xs text-blue-400">
                  Requires: {MIN_BURNS_FOR_LEADERBOARD}+ burn(s) + wallet signature
                </div>

                {isConnected && (
                  <div className="p-3 bg-[#D4AF37]/10 border border-[#D4AF37]/30 rounded-lg">
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-sm text-gray-300">Your Score:</span>
                      <span className="text-[#D4AF37] font-bold">{formatNumber(gold)}</span>
                    </div>
                    <div className="flex justify-between items-center mb-2 text-xs">
                      <span className="text-gray-400">Burns:</span>
                      <span className={userBurnCount >= MIN_BURNS_FOR_LEADERBOARD ? 'text-green-400' : 'text-red-400'}>
                        {userBurnCount} {userBurnCount >= MIN_BURNS_FOR_LEADERBOARD ? '✓' : '✗'}
                      </span>
                    </div>
                    
                    {submitError && <div className="mb-2 p-2 bg-red-500/20 rounded text-xs text-red-400">{submitError}</div>}
                    
                    <div className="flex gap-2">
                      <input type="text" value={playerName} onChange={(e) => setPlayerName(e.target.value.slice(0, 20))} placeholder="Name" className="flex-1 bg-black/50 border border-white/20 rounded px-2 py-1 text-sm" />
                      <button onClick={submitVerifiedScore} disabled={submittingScore || userBurnCount < MIN_BURNS_FOR_LEADERBOARD} className={`px-4 py-1 rounded font-medium text-sm ${userBurnCount >= MIN_BURNS_FOR_LEADERBOARD ? 'bg-[#D4AF37] text-black' : 'bg-gray-600 text-gray-400'}`}>
                        {submittingScore ? '...' : '🔐 Submit'}
                      </button>
                    </div>
                  </div>
                )}

                {pointsLeaderboard.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">No scores yet</div>
                ) : (
                  pointsLeaderboard.slice(0, 10).map((entry, index) => (
                    <div key={entry.address} className={`flex justify-between items-center p-3 rounded-lg border ${entry.address.toLowerCase() === address?.toLowerCase() ? 'bg-[#D4AF37]/20 border-[#D4AF37]' : 'bg-white/5 border-white/10'}`}>
                      <div className="flex items-center gap-3">
                        <span className={`text-lg font-bold w-8 ${index === 0 ? 'text-yellow-400' : index === 1 ? 'text-gray-300' : index === 2 ? 'text-orange-400' : 'text-gray-500'}`}>
                          {index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `#${index + 1}`}
                        </span>
                        <div>
                          <div className="font-medium text-sm">{entry.name}</div>
                          <div className="text-xs text-gray-500">🔥 {entry.burnCount}</div>
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
              <h2 className="text-xl font-bold text-[#D4AF37] mb-1">📊 Stats</h2>
            </div>

            <div className="mb-6 p-6 bg-gradient-to-br from-orange-900/30 to-red-900/30 border border-orange-500/30 rounded-2xl text-center">
              <div className="text-5xl mb-2">🔥</div>
              <div className="text-3xl font-bold text-orange-400 font-mono">{totalBurned.toFixed(4)}</div>
              <div className="text-gray-400">BG Burned</div>
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
              <h3 className="text-sm font-medium text-gray-300 mb-3">🔐 Security</h3>
              <div className="space-y-2 text-xs">
                <div className="flex items-center gap-2 text-green-400">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  Shop purchases verified on-chain
                </div>
                <div className="flex items-center gap-2 text-green-400">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  Effects only apply after blockchain confirmation
                </div>
                <div className="flex items-center gap-2 text-green-400">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  Leaderboard requires wallet signature
                </div>
                <div className="flex items-center gap-2 text-green-400">
                  <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                  Click rate limited ({MAX_CLICKS_PER_SECOND} CPS max)
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
