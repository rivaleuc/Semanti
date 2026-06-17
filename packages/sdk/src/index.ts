import { keccak256, toHex, type Address } from "viem";

export * from "./genlayer.js";

export const BPS = 10_000n;

/** Belief distribution of a commitment, in basis points (sums to 10000). */
export interface Belief {
  keptBps: number;
  breachBps: number;
  entropyBps: number;
  finalized: boolean;
  nonce: bigint;
}

/** Derive the EVM commitment id from the GenLayer commitment key. */
export function commitmentId(key: string): bigint {
  return BigInt(keccak256(toHex(key)));
}

/** Split a bond according to final belief mass, mirroring SemantiVault.settle. */
export function settlementSplit(
  bond: bigint,
  counterStake: bigint,
  keptBps: number,
  breachBps: number
): { toPromiser: bigint; toBeneficiary: bigint } {
  if (keptBps + breachBps > 10_000) throw new Error("belief mass exceeds 10000 bps");
  const bondToBeneficiary = (bond * BigInt(breachBps)) / BPS;
  const counterToPromiser = (counterStake * BigInt(keptBps)) / BPS;
  return {
    toPromiser: bond - bondToBeneficiary + counterToPromiser,
    toBeneficiary: bondToBeneficiary + counterStake - counterToPromiser,
  };
}

export interface SemantiDeployment {
  chainId: number;
  smt: Address;
  vault: Address;
  genlayerContract: string;
}

export const vaultAbi = [
  {
    type: "function",
    name: "postCommitment",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "beneficiary", type: "address" },
      { name: "bond", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "assertBreach",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "stake", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "settle",
    stateMutability: "nonpayable",
    inputs: [
      { name: "id", type: "uint256" },
      { name: "beliefKeptBps", type: "uint16" },
      { name: "beliefBreachBps", type: "uint16" },
      { name: "nonce", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "lockedOf",
    stateMutability: "view",
    inputs: [{ name: "id", type: "uint256" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "commitments",
    stateMutability: "view",
    inputs: [{ name: "", type: "uint256" }],
    outputs: [
      { name: "promiser", type: "address" },
      { name: "beneficiary", type: "address" },
      { name: "bond", type: "uint256" },
      { name: "counterStake", type: "uint256" },
      { name: "settleAfter", type: "uint64" },
      { name: "status", type: "uint8" },
      { name: "keptBps", type: "uint16" },
      { name: "lastNonce", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "CommitmentPosted",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "promiser", type: "address", indexed: true },
      { name: "beneficiary", type: "address", indexed: true },
      { name: "bond", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Settled",
    inputs: [
      { name: "id", type: "uint256", indexed: true },
      { name: "keptBps", type: "uint16", indexed: false },
      { name: "nonce", type: "uint256", indexed: false },
    ],
  },
] as const;

export const erc20Abi = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;
