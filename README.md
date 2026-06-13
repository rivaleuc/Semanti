# Semanti

Settlement infrastructure for commercial promises written in plain language.

## Why this exists

Most commercial agreements are not numbers. They are sentences: "the vendor
will deliver a production-ready API by Q3", "99.9% uptime in May", "a
good-faith migration effort". A deterministic blockchain can store these
sentences and escrow money behind them, but it cannot judge them. Every
attempt to do so collapses the sentence into a checklist at signing time, or
hands the judgment to a trusted oracle, which is the centralization the chain
was supposed to remove.

Semanti keeps the sentence as a sentence. The promise is bonded with SMT on
Base and adjudicated on GenLayer, where validators running diverse models
judge the evidence under an interpretation standard distilled from how
similar promises were judged before. The verdict is not a bit. It is a belief
distribution (kept, breached, undetermined) that hardens over consecutive
agreeing evaluation rounds. Settlement on Base triggers only after the belief
converges and survives a challenge buffer, and it splits both stakes
proportionally to the final belief mass.

Two properties matter:

- **Undetermined is a safe failure.** If the models genuinely disagree, the
  belief never converges, nobody is slashed, and both sides get their funds
  back. Ambiguity does not punish anyone.
- **Precedent is path-dependent on purpose.** Finalized verdicts are embedded
  into a vector store and retrieved when similar claims are judged. The
  protocol's reading of "production-ready" evolves the way case law does,
  through accumulated judgments rather than governance votes. This is also
  the protocol's main attack surface, and it is treated as one: per-epoch
  belief deltas are clamped, precedent diffusion depth is capped, and new
  evidence can reopen a finalized node under a fresh settlement nonce that
  the vault will only honor once.

## Architecture

- `contracts/` holds the EVM side: `SMTToken` and `SemantiVault` (Foundry,
  Solidity 0.8.30). The vault never interprets anything. It locks bonds,
  accepts counter-stakes, and executes proportional settlement when the
  resolver delivers a finalized belief with an unused nonce.
- `genlayer/semanti.py` is the intelligent contract: the commitment graph,
  the epoch evaluation loop, precedent retrieval and diffusion, and the
  ghost-contract call into the vault.
- `packages/sdk/` is a small TypeScript package (commitment id derivation,
  settlement math, ABIs). Install it from the repo, not a registry.
- `web/` is the Next.js interface for posting and tracking commitments.

## Status

The vault is implemented and tested (Foundry suite passes). The GenLayer
contract is deployed and working on the Bradbury testnet at
`0x9f10f991d6De534B4A700819c653d9201Cd0BC01`: posting a commitment, running an
LLM-jury re-evaluation under consensus, and reading the resulting belief
distribution all work end to end. There is no token deployed on a public EVM
and no mainnet. This is a working prototype of the settlement design.

The GenLayer side was built to what the platform actually supports, which
trimmed the original design:

- No contract-side model routing. Validators choose their own models; the
  contract only defines the prompt and the validation predicate.
- No embedding vector store. Precedent is a bounded JSON log of past verdicts
  fed back into the prompt as text, with deterministic word-overlap ranking
  instead of nearest-neighbor retrieval.
- No self-triggering epoch loop. Each re-evaluation is one external
  transaction (a user, a cron, or a relayer keeper).
- Settlement is read, not pushed. The vault's resolver reads `read_settlement`
  on the GenLayer contract and calls `SemantiVault.settle`. GenLayer never
  makes the cross-chain call itself.
