import { Zap } from "lucide-react";

import type { CreditPack } from "@/lib/api";

type DashboardCreditPacksProps = {
  creditPacks: CreditPack[];
  isBuyingPackId: string | null;
  onBuyPack: (pack: CreditPack) => Promise<void>;
};

export function DashboardCreditPacks(props: DashboardCreditPacksProps) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center gap-2">
        <Zap className="h-5 w-5 text-violet-600 dark:text-violet-400" />
        <h2 className="text-lg font-medium">Credit packs</h2>
      </div>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Buy credits with Stripe checkout.
      </p>
      {props.creditPacks.length ? (
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {props.creditPacks.map((pack) => (
            <article
              key={pack.id}
              className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm transition-transform duration-200 hover:-translate-y-0.5 hover:shadow-sm dark:border-zinc-800 dark:bg-black"
            >
              <h3 className="font-medium">{pack.label}</h3>
              <p className="mt-1 text-2xl font-semibold">{pack.credits} credits</p>
              <p className="mt-1 text-zinc-600 dark:text-zinc-400">${pack.price_usd} USD</p>
              <p className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">{pack.blurb}</p>
              <button
                className="mt-3 h-10 w-full rounded-lg bg-zinc-950 px-3 text-xs font-medium text-white transition-colors hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
                disabled={Boolean(props.isBuyingPackId)}
                onClick={() => props.onBuyPack(pack)}
                type="button"
              >
                {props.isBuyingPackId === pack.id ? "Redirecting..." : "Buy with Stripe"}
              </button>
            </article>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          Credit packs unavailable.
        </p>
      )}
    </section>
  );
}
