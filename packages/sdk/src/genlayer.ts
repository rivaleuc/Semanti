// GenLayer side of Semanti: create and evaluate commitments on the intelligent
// contract, read the belief distribution, and map a finalized settlement into
// the EVM vault's settle(...) arguments.
//
// Reads (get_belief, read_settlement, stats) need no account. Writes
// (post_commitment, reevaluate, submit_evidence) need a GenLayer account: in a
// browser pass the injected provider (MetaMask + GenLayer Snap) and call
// client.connect("testnetBradbury"); in a keeper/relayer pass a private key.

import { createClient, createAccount } from "genlayer-js";
import { testnetBradbury } from "genlayer-js/chains";
import { TransactionStatus } from "genlayer-js/types";
import type { Address, Hex } from "viem";
import { commitmentId } from "./index.js";

/** Live SEMANTI intelligent contract on the GenLayer Bradbury testnet. */
export const SEMANTI_GENLAYER_ADDRESS =
  "0x9f10f991d6De534B4A700819c653d9201Cd0BC01" as const;

export interface GenLayerBelief {
  exists: boolean;
  key?: string;
  claim?: string;
  kept: number;
  breach: number;
  entropy: number;
  convergence_streak: number;
  evaluations: number;
  finalized: boolean;
  finality_nonce: number;
  reasoning?: string;
}

export interface GenLayerSettlement {
  settleable: boolean;
  key?: string;
  beneficiary?: string;
  belief_kept_bps: number;
  belief_breach_bps: number;
  finality_nonce: number;
}

type AnyClient = ReturnType<typeof createClient>;

/** Read-only client (views only). */
export function createReadClient(): AnyClient {
  return createClient({ chain: testnetBradbury }) as AnyClient;
}

/** Browser client backed by an injected wallet (MetaMask + GenLayer Snap). */
export function createBrowserClient(provider: unknown): AnyClient {
  return createClient({
    chain: testnetBradbury,
    provider: provider as never,
  }) as AnyClient;
}

/** Keeper/relayer client backed by a private key. */
export function createKeeperClient(privateKey: Hex): AnyClient {
  return createClient({
    chain: testnetBradbury,
    account: createAccount(privateKey),
  }) as AnyClient;
}

function contract(address?: string): Address {
  return (address ?? SEMANTI_GENLAYER_ADDRESS) as Address;
}

// ── Reads ────────────────────────────────────────────────────────────────

export async function getBelief(
  client: AnyClient,
  key: string,
  address?: string
): Promise<GenLayerBelief> {
  return (await client.readContract({
    address: contract(address),
    functionName: "get_belief",
    args: [String(key)],
  })) as unknown as GenLayerBelief;
}

export async function readSettlement(
  client: AnyClient,
  key: string,
  address?: string
): Promise<GenLayerSettlement> {
  return (await client.readContract({
    address: contract(address),
    functionName: "read_settlement",
    args: [String(key)],
  })) as unknown as GenLayerSettlement;
}

export async function readStats(
  client: AnyClient,
  address?: string
): Promise<{ commitments: number; finalized: number; total_evaluations: number; vault: string }> {
  return (await client.readContract({
    address: contract(address),
    functionName: "stats",
    args: [],
  })) as never;
}

// ── Writes ─────────────────────────────────────────────────────────────────

/**
 * Post a commitment on GenLayer and return its key. The key is the contract's
 * node counter at creation time, so we read it before posting.
 */
export async function postCommitment(
  client: AnyClient,
  params: {
    beneficiary: string;
    claimText: string;
    stakeAtRisk: bigint;
    evidenceUrl?: string;
    dependsOn?: string;
    address?: string;
  }
): Promise<string> {
  const before = await readStats(client, params.address);
  const key = String(before.commitments);
  const hash = await client.writeContract({
    address: contract(params.address),
    functionName: "post_commitment",
    args: [
      params.beneficiary,
      params.claimText,
      Number(params.stakeAtRisk),
      params.evidenceUrl ?? "",
      params.dependsOn ?? "",
    ],
    value: 0n,
  });
  await client.waitForTransactionReceipt({ hash, status: TransactionStatus.ACCEPTED });
  return key;
}

/** Trigger one consensus-gated LLM re-evaluation of a commitment. */
export async function reevaluate(
  client: AnyClient,
  key: string,
  address?: string
): Promise<void> {
  const hash = await client.writeContract({
    address: contract(address),
    functionName: "reevaluate",
    args: [String(key)],
    value: 0n,
  });
  await client.waitForTransactionReceipt({ hash, status: TransactionStatus.ACCEPTED });
}

/** Attach new evidence, reopening a finalized commitment under a fresh nonce. */
export async function submitEvidence(
  client: AnyClient,
  key: string,
  evidenceUrl: string,
  address?: string
): Promise<void> {
  const hash = await client.writeContract({
    address: contract(address),
    functionName: "submit_evidence",
    args: [String(key), evidenceUrl],
    value: 0n,
  });
  await client.waitForTransactionReceipt({ hash, status: TransactionStatus.ACCEPTED });
}

// ── GenLayer settlement -> EVM vault mapping ────────────────────────────────

export interface VaultSettleArgs {
  id: bigint;
  beliefKeptBps: number;
  beliefBreachBps: number;
  nonce: bigint;
}

/**
 * Map a finalized GenLayer settlement onto SemantiVault.settle arguments. The
 * EVM commitment id is keccak256(key), the same id used when the bond was
 * posted on the vault, so the resolver can settle the right escrow.
 *
 * Throws if the commitment has not converged on GenLayer yet.
 */
export function settlementToVaultArgs(
  key: string,
  s: GenLayerSettlement
): VaultSettleArgs {
  if (!s.settleable) {
    throw new Error("commitment is not finalized on GenLayer yet");
  }
  return {
    id: commitmentId(key),
    beliefKeptBps: s.belief_kept_bps,
    beliefBreachBps: s.belief_breach_bps,
    nonce: BigInt(s.finality_nonce),
  };
}
