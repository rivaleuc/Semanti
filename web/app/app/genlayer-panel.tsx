"use client";

import {
  SEMANTI_GENLAYER_ADDRESS,
  createBrowserClient,
  createReadClient,
  getBelief,
  postCommitment,
  reevaluate,
  readSettlement,
  settlementToVaultArgs,
  vaultAbi,
  type GenLayerBelief,
  type GenLayerSettlement,
} from "@semanti/sdk";
import { useCallback, useEffect, useState } from "react";
import { parseUnits, type Address } from "viem";
import { useWriteContract } from "wagmi";

const VAULT = process.env.NEXT_PUBLIC_VAULT_ADDRESS as Address | undefined;

type EthProvider = { request: (args: unknown) => Promise<unknown> };

function getInjected(): EthProvider | undefined {
  if (typeof window === "undefined") return undefined;
  return (window as unknown as { ethereum?: EthProvider }).ethereum;
}

export function GenLayerPanel() {
  const [key, setKey] = useState("");
  const [claim, setClaim] = useState("");
  const [beneficiary, setBeneficiary] = useState("");
  const [stake, setStake] = useState("1000");
  const [evidenceUrl, setEvidenceUrl] = useState("");

  const [belief, setBelief] = useState<GenLayerBelief | null>(null);
  const [settlement, setSettlement] = useState<GenLayerSettlement | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const { writeContract } = useWriteContract();

  const refresh = useCallback(async (k: string) => {
    if (!k) return;
    const client = createReadClient();
    const [b, s] = await Promise.all([
      getBelief(client, k),
      readSettlement(client, k),
    ]);
    setBelief(b.exists ? b : null);
    setSettlement(s);
  }, []);

  useEffect(() => {
    if (key) refresh(key).catch((e) => setErr(String(e?.message ?? e)));
  }, [key, refresh]);

  async function connectedWriteClient() {
    const injected = getInjected();
    if (!injected) throw new Error("No injected wallet found for GenLayer");
    const client = createBrowserClient(injected);
    // GenLayer Snap signs the transactions for the Bradbury testnet.
    await (client as unknown as { connect: (n: string) => Promise<void> }).connect(
      "testnetBradbury"
    );
    return client;
  }

  async function onCreate() {
    setErr(null);
    setNote(null);
    if (!claim || !beneficiary) {
      setErr("claim and beneficiary required");
      return;
    }
    setBusy("Creating commitment on GenLayer…");
    try {
      const client = await connectedWriteClient();
      const newKey = await postCommitment(client, {
        beneficiary,
        claimText: claim,
        stakeAtRisk: parseUnits(stake || "0", 18),
        evidenceUrl: evidenceUrl || undefined,
      });
      setKey(newKey);
      setNote(`Commitment created on GenLayer with key ${newKey}.`);
      await refresh(newKey);
    } catch (e: unknown) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  async function onReevaluate() {
    setErr(null);
    setNote(null);
    setBusy("Running LLM jury re-evaluation…");
    try {
      const client = await connectedWriteClient();
      await reevaluate(client, key);
      setNote("Re-evaluation reached consensus. Refreshing belief…");
      await refresh(key);
    } catch (e: unknown) {
      setErr(String((e as Error)?.message ?? e));
    } finally {
      setBusy(null);
    }
  }

  function onSettleOnBase() {
    setErr(null);
    setNote(null);
    if (!VAULT) {
      setErr("NEXT_PUBLIC_VAULT_ADDRESS not configured");
      return;
    }
    if (!settlement) return;
    try {
      const a = settlementToVaultArgs(key, settlement);
      // settle() is resolver-gated on the vault. This maps the GenLayer
      // verdict onto the exact call the resolver relays to Base.
      writeContract({
        address: VAULT,
        abi: vaultAbi,
        functionName: "settle",
        args: [a.id, a.beliefKeptBps, a.beliefBreachBps, a.nonce],
      });
      setNote("Submitted settle() to the vault (resolver-gated).");
    } catch (e: unknown) {
      setErr(String((e as Error)?.message ?? e));
    }
  }

  return (
    <section className="mt-8 rounded-lg border border-line bg-surface p-8 shadow-sm dark:border-line-dark dark:bg-surface-dark">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight">Adjudicate on GenLayer</h2>
        <a
          href={`https://studio.genlayer.com/contracts/${SEMANTI_GENLAYER_ADDRESS}`}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-xs text-muted hover:text-accent dark:text-muted-dark"
        >
          {SEMANTI_GENLAYER_ADDRESS.slice(0, 10)}…
        </a>
      </div>
      <p className="mt-1 text-sm text-muted dark:text-muted-dark">
        Create the promise on the GenLayer contract, run a consensus-gated LLM
        re-evaluation, and map the finalized belief into the vault&apos;s
        settle call.
      </p>

      <div className="mt-6 grid gap-4">
        <label className="grid gap-1 text-sm font-semibold">
          Claim
          <textarea
            value={claim}
            onChange={(e) => setClaim(e.target.value)}
            rows={2}
            placeholder="Vendor delivers a production-ready API by Q3 2026."
            className="rounded-md border border-line bg-canvas px-3 py-2 font-medium outline-none focus:border-accent dark:border-line-dark dark:bg-canvas-dark"
          />
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-semibold">
            Beneficiary
            <input
              value={beneficiary}
              onChange={(e) => setBeneficiary(e.target.value)}
              placeholder="0x…"
              className="rounded-md border border-line bg-canvas px-3 py-2 font-medium outline-none focus:border-accent dark:border-line-dark dark:bg-canvas-dark"
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Stake at risk (SMT)
            <input
              value={stake}
              onChange={(e) => setStake(e.target.value)}
              inputMode="decimal"
              className="rounded-md border border-line bg-canvas px-3 py-2 font-medium outline-none focus:border-accent dark:border-line-dark dark:bg-canvas-dark"
            />
          </label>
        </div>
        <label className="grid gap-1 text-sm font-semibold">
          Evidence URL (optional)
          <input
            value={evidenceUrl}
            onChange={(e) => setEvidenceUrl(e.target.value)}
            placeholder="https://status.vendor.com"
            className="rounded-md border border-line bg-canvas px-3 py-2 font-medium outline-none focus:border-accent dark:border-line-dark dark:bg-canvas-dark"
          />
        </label>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={onCreate}
            disabled={!!busy}
            className="btn-anim rounded-md bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:bg-accent-strong disabled:opacity-50"
          >
            Create on GenLayer
          </button>
          <label className="flex items-center gap-2 text-sm font-semibold">
            Key
            <input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="0"
              className="w-20 rounded-md border border-line bg-canvas px-2 py-1.5 font-mono outline-none focus:border-accent dark:border-line-dark dark:bg-canvas-dark"
            />
          </label>
          <button
            onClick={onReevaluate}
            disabled={!!busy || !key}
            className="btn-anim rounded-md border border-line px-4 py-2.5 text-sm font-semibold hover:border-accent disabled:opacity-50 dark:border-line-dark"
          >
            Re-evaluate
          </button>
          <button
            onClick={() => refresh(key).catch((e) => setErr(String(e)))}
            disabled={!key}
            className="btn-anim rounded-md border border-line px-4 py-2.5 text-sm font-semibold hover:border-accent disabled:opacity-50 dark:border-line-dark"
          >
            Refresh
          </button>
        </div>

        {busy && <p className="text-sm font-semibold text-accent">{busy}</p>}
        {note && <p className="text-sm font-semibold text-accent">{note}</p>}
        {err && <p className="text-sm text-red-600">{err}</p>}
      </div>

      {belief && (
        <div className="mt-6 rounded-md border border-line p-4 dark:border-line-dark">
          <div className="grid grid-cols-3 gap-3 text-center">
            {[
              ["Kept", belief.kept],
              ["Breach", belief.breach],
              ["Undetermined", belief.entropy],
            ].map(([label, v]) => (
              <div key={label as string}>
                <div className="text-2xl font-extrabold tracking-tight">{v as number}</div>
                <div className="text-xs font-semibold uppercase text-muted dark:text-muted-dark">
                  {label as string}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-sm text-muted dark:text-muted-dark">
            {belief.finalized ? "Finalized" : "Converging"}, streak{" "}
            {belief.convergence_streak}/3, {belief.evaluations} evaluation(s)
          </p>
          {belief.reasoning && (
            <p className="mt-2 text-sm">{belief.reasoning}</p>
          )}
        </div>
      )}

      {settlement && (
        <div className="mt-4 rounded-md border border-line p-4 text-sm dark:border-line-dark">
          <p className="font-semibold">Settlement mapping</p>
          {settlement.settleable ? (
            <>
              <p className="mt-2 text-muted dark:text-muted-dark">
                Finalized. The resolver relays this verdict to the Base vault:
              </p>
              <pre className="mt-2 overflow-x-auto rounded bg-canvas p-3 font-mono text-xs dark:bg-canvas-dark">
{`vault.settle(
  id:        keccak256("${key}"),
  keptBps:   ${settlement.belief_kept_bps},
  breachBps: ${settlement.belief_breach_bps},
  nonce:     ${settlement.finality_nonce}
)`}
              </pre>
              <button
                onClick={onSettleOnBase}
                className="btn-anim mt-3 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong"
              >
                Settle on Base (resolver only)
              </button>
            </>
          ) : (
            <p className="mt-2 text-muted dark:text-muted-dark">
              Not finalized yet. Belief must converge before the vault can
              settle.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
