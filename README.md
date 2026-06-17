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

## Why GenLayer

A promise like "production-ready by Q3" cannot be settled by a deterministic
VM, and not because of gas. The judgment itself is the problem.

- **Meaning is not a pure function of explicit inputs.** Solidity state
  transitions must be deterministic: same inputs, same output, verifiable by
  every node. Deciding whether a vague promise was kept is interpretation, not
  computation. The only way to put it on a deterministic chain is to hardcode
  a checklist at signing time or trust an oracle, and both throw away the
  thing that made the promise worth bonding.
- **GenLayer reaches consensus on meaning, not bytes.** Validators run diverse
  LLMs and agree through an equivalence predicate, not byte-identical output.
  Two models can phrase a verdict differently and still be counted as the same
  judgment. That is exactly the consensus shape a semantic verdict needs.
- **Re-evaluation is legitimate here.** A deterministic function must return
  the same answer for the same input forever, so "judge this again later" is
  meaningless. On GenLayer a new validator set and fresh evidence can produce a
  different, better-grounded belief. Semanti leans on this directly: belief
  hardens over consecutive rounds, and new evidence can reopen a finalized
  commitment.
- **Native web access, no oracle.** The leader fetches evidence (status pages,
  logs) inside the non-deterministic block with `gl.nondet.web`, treated as
  untrusted data, so there is no separate oracle to trust or bribe.

The deterministic part still belongs on the EVM. Money, bonds, replay
protection, and the challenge window live in the Base vault, which never
interprets anything. GenLayer decides what happened; Base enforces what that
means for the stakes. Each chain does only what it is good at.

## Architecture

- `contracts/` holds the EVM side: `SMTToken` and `SemantiVault` (Foundry,
  Solidity 0.8.30). The vault never interprets anything. It locks bonds,
  accepts counter-stakes, and executes proportional settlement when the
  resolver delivers a finalized belief with an unused nonce.
- `genlayer/semanti.py` is the intelligent contract: the commitment store, the
  consensus-gated LLM re-evaluation, the precedent log fed back into prompts,
  and the `read_settlement` view the vault's resolver reads.
- `packages/sdk/` is a small TypeScript package. `index.ts` has the EVM side
  (commitment id derivation, settlement math, ABIs); `genlayer.ts` wraps the
  GenLayer contract (post, re-evaluate, read belief and settlement via
  `genlayer-js`) and maps a finalized GenLayer settlement onto the vault's
  `settle` arguments. Install it from the repo, not a registry.
- `web/` is the Next.js interface. It posts the bond on the Base vault and,
  in the same view, creates and re-evaluates the commitment on the GenLayer
  contract, reads the live belief distribution, and maps the finalized
  settlement back into the vault `settle` call.

## Frontend and SDK path to GenLayer

The interface talks to both chains. The EVM panel locks the bond on the Base
vault. The GenLayer panel (`web/app/app/genlayer-panel.tsx`) calls the live
intelligent contract through the SDK:

- `postCommitment` / `reevaluate` / `submitEvidence` are GenLayer writes
  (signed by the GenLayer Snap in the browser, or a private key in a keeper).
- `getBelief` / `readSettlement` / `readStats` are GenLayer reads and need no
  account; the panel polls them to show the live belief distribution and the
  convergence streak.
- `settlementToVaultArgs(key, settlement)` maps a finalized GenLayer verdict
  onto `SemantiVault.settle(keccak256(key), keptBps, breachBps, nonce)`, the
  exact resolver-gated call that moves money on Base. The EVM commitment id is
  `keccak256(key)`, the same id used when the bond was posted, so settlement
  lands on the right escrow.

The settlement direction is GenLayer to Base: belief converges on GenLayer,
the resolver reads `read_settlement`, and only then is `settle` callable on
the vault.

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
