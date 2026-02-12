import { Coins } from "lucide-react";

import type { CreditOperation } from "@/lib/api";

export type CreditSnapshot = {
  credit_balance: number;
  daily_credit_used: number;
  daily_credit_reset_date: string | null;
};

type DashboardCreditsProps = {
  credits: CreditSnapshot | null;
  creditOperations: CreditOperation[];
};

export function DashboardCredits(props: DashboardCreditsProps) {
  return (
    <section className="space-y-6">
      <article className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center gap-2">
          <Coins className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          <h2 className="text-lg font-medium">Credits</h2>
        </div>
        <div className="mt-3 space-y-1 text-sm">
          <p>
            Balance:{" "}
            <span className="font-semibold text-violet-600 dark:text-violet-400">
              {props.credits ? props.credits.credit_balance : "..."}
            </span>
          </p>
          <p className="text-zinc-600 dark:text-zinc-400">
            Used today: {props.credits ? props.credits.daily_credit_used : "..."}
          </p>
          <p className="text-zinc-600 dark:text-zinc-400">
            Daily reset: {props.credits?.daily_credit_reset_date ?? "n/a"}
          </p>
        </div>
      </article>

      <article className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-lg font-medium">Credit history</h2>
        {props.creditOperations.length ? (
          <ul className="mt-3 space-y-2 text-sm">
            {props.creditOperations.map((operation) => (
              <li
                key={operation.idempotency_key}
                className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-black"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">{operation.operation_type}</div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">
                      {new Date(operation.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div
                    className={`text-sm font-semibold ${
                      operation.amount > 0
                        ? "text-emerald-700 dark:text-emerald-300"
                        : "text-red-700 dark:text-red-300"
                    }`}
                  >
                    {operation.amount > 0 ? `+${operation.amount}` : operation.amount}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
            No credit operations yet.
          </p>
        )}
      </article>
    </section>
  );
}
