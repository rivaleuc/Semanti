import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-20">
      <header className="flex items-center justify-between">
        <span className="text-lg font-bold tracking-tight">Semanti</span>
        <Link
          href="/app"
          className="btn-anim rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent-strong"
        >
          Open app
        </Link>
      </header>

      <section className="mt-24">
        <h1 className="text-5xl font-extrabold tracking-tight [letter-spacing:-0.02em]">
          Settlement for promises written in plain language.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted dark:text-muted-dark">
          A commercial promise like &quot;production-ready API by Q3&quot;
          cannot be judged by a deterministic contract. Semanti stores the
          promise as text, bonds it with stake, and resolves it on GenLayer,
          where a jury of diverse models judges the evidence against
          accumulated precedent. Funds settle on Base only after the verdict
          converges.
        </p>
      </section>

      <section className="mt-20 grid gap-5 sm:grid-cols-3">
        {[
          {
            title: "Bond",
            body: "The promiser locks SMT behind the commitment. The beneficiary can counter-stake to assert breach.",
          },
          {
            title: "Converge",
            body: "Each epoch, validators re-judge the evidence. Belief hardens over consecutive agreeing rounds instead of flipping on one verdict.",
          },
          {
            title: "Settle",
            body: "When belief converges and survives the challenge buffer, the vault splits stakes proportionally. A promise that never converges returns everyone's funds.",
          },
        ].map((c) => (
          <div
            key={c.title}
            className="rounded-lg border border-line bg-surface p-6 shadow-sm dark:border-line-dark dark:bg-surface-dark"
          >
            <h2 className="font-bold tracking-tight">{c.title}</h2>
            <p className="mt-2 text-sm text-muted dark:text-muted-dark">
              {c.body}
            </p>
          </div>
        ))}
      </section>

      <footer className="mt-24 border-t border-line pt-6 text-sm text-muted dark:border-line-dark dark:text-muted-dark">
        Infrastructure, not a financial product. Resolution runs on GenLayer,
        settlement on Base.
      </footer>
    </main>
  );
}
