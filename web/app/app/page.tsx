"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";
import { commitmentId, vaultAbi, erc20Abi } from "@semanti/sdk";
import Link from "next/link";
import { GenLayerPanel } from "./genlayer-panel";
import { useState } from "react";
import { parseUnits, type Address, isAddress, maxUint256 } from "viem";
import {
  useAccount,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";

const VAULT = process.env.NEXT_PUBLIC_VAULT_ADDRESS as Address | undefined;
const SMT = process.env.NEXT_PUBLIC_SMT_ADDRESS as Address | undefined;

const allowanceAbi = [
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export default function AppPage() {
  const { isConnected, address } = useAccount();
  const [key, setKey] = useState("");
  const [claim, setClaim] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  const [bond, setBond] = useState("");

  const { writeContract, data: txHash, isPending, error } = useWriteContract();
  const { isLoading: confirming, isSuccess } = useWaitForTransactionReceipt({
    hash: txHash,
  });

  const id = key ? commitmentId(key) : undefined;
  const { data: locked } = useReadContract({
    address: VAULT,
    abi: vaultAbi,
    functionName: "lockedOf",
    args: id !== undefined ? [id] : undefined,
    query: { enabled: Boolean(VAULT && id !== undefined) },
  });

  const amount = bond ? parseUnits(bond, 18) : 0n;
  const { data: allowance } = useReadContract({
    address: SMT,
    abi: allowanceAbi,
    functionName: "allowance",
    args: address && VAULT ? [address, VAULT] : undefined,
    query: { enabled: Boolean(SMT && VAULT && address), refetchInterval: 4000 },
  });
  const needsApproval = (allowance ?? 0n) < amount || amount === 0n;

  const configured = Boolean(VAULT && SMT);
  const canSubmit =
    configured && isConnected && key && claim && isAddress(beneficiary) && bond;

  // Two explicit steps: approve first, then post once the allowance is
  // mined. Posting in the same click would revert on a stale allowance.
  function submit() {
    if (!canSubmit || !VAULT || !SMT || id === undefined) return;
    if (needsApproval) {
      writeContract({
        address: SMT,
        abi: erc20Abi,
        functionName: "approve",
        args: [VAULT, maxUint256],
      });
      return;
    }
    writeContract({
      address: VAULT,
      abi: vaultAbi,
      functionName: "postCommitment",
      args: [id, beneficiary as Address, amount],
    });
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <header className="flex items-center justify-between">
        <Link href="/" className="text-lg font-bold tracking-tight">
          Semanti
        </Link>
        <ConnectButton showBalance={false} />
      </header>

      {!configured && (
        <div className="mt-10 rounded-lg border border-line bg-surface p-6 text-sm shadow-sm dark:border-line-dark dark:bg-surface-dark">
          <p className="font-semibold">No deployment configured.</p>
          <p className="mt-2 text-muted dark:text-muted-dark">
            Set NEXT_PUBLIC_VAULT_ADDRESS and NEXT_PUBLIC_SMT_ADDRESS after
            running contracts/script/Deploy.s.sol, then restart the dev
            server.
          </p>
        </div>
      )}

      <section className="mt-10 rounded-lg border border-line bg-surface p-8 shadow-sm dark:border-line-dark dark:bg-surface-dark">
        <h1 className="text-xl font-bold tracking-tight">Post a commitment</h1>
        <p className="mt-1 text-sm text-muted dark:text-muted-dark">
          The claim text is registered on GenLayer under this key. The bond
          locks here on Base until the verdict converges.
        </p>

        <div className="mt-6 grid gap-4">
          <label className="grid gap-1 text-sm font-semibold">
            Commitment key
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="acme-api-q3-2026"
              className="rounded-md border border-line bg-canvas px-3 py-2 font-medium outline-none focus:border-accent dark:border-line-dark dark:bg-canvas-dark"
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Claim
            <textarea
              value={claim}
              onChange={(e) => setClaim(e.target.value)}
              rows={3}
              placeholder="Vendor will deliver a production-ready API by Q3 2026."
              className="rounded-md border border-line bg-canvas px-3 py-2 font-medium outline-none focus:border-accent dark:border-line-dark dark:bg-canvas-dark"
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Beneficiary address
            <input
              value={beneficiary}
              onChange={(e) => setBeneficiary(e.target.value)}
              placeholder="0x…"
              className="rounded-md border border-line bg-canvas px-3 py-2 font-medium outline-none focus:border-accent dark:border-line-dark dark:bg-canvas-dark"
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Bond (SMT)
            <input
              value={bond}
              onChange={(e) => setBond(e.target.value)}
              placeholder="1000"
              inputMode="decimal"
              className="rounded-md border border-line bg-canvas px-3 py-2 font-medium outline-none focus:border-accent dark:border-line-dark dark:bg-canvas-dark"
            />
          </label>

          <button
            onClick={submit}
            disabled={!canSubmit || isPending || confirming}
            className="btn-anim mt-2 rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isPending || confirming
              ? "Confirming…"
              : needsApproval
                ? "Approve SMT"
                : "Post commitment"}
          </button>

          {isSuccess && (
            <p className="text-sm font-semibold text-accent">
              Commitment posted. Register the same key on the GenLayer
              contract to start adjudication.
            </p>
          )}
          {error && (
            <p className="text-sm text-red-600">
              {error.message.split("\n")[0]}
            </p>
          )}
          {typeof locked === "bigint" && locked > 0n && (
            <p className="text-sm text-muted dark:text-muted-dark">
              Currently locked for this key:{" "}
              {(Number(locked) / 1e18).toLocaleString()} SMT
            </p>
          )}
        </div>
      </section>

      <GenLayerPanel />
    </main>
  );
}
