"use client";

import { FlaskConical } from "lucide-react";

type DashboardComparisonProps = {
  asinA: string;
  asinB: string;
  isSubmitting: boolean;
  error: string | null;
  onAsinAChange: (value: string) => void;
  onAsinBChange: (value: string) => void;
  onCompare: () => Promise<void>;
};

export function DashboardComparison(props: DashboardComparisonProps) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center gap-2">
        <FlaskConical className="h-5 w-5 text-violet-600 dark:text-violet-400" />
        <h2 className="text-lg font-medium">New comparison</h2>
      </div>
      <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
        Enter two Amazon.com ASINs or product URLs.
      </p>

      <div className="mt-6 grid gap-3 md:grid-cols-2">
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">ASIN or URL (A)</span>
          <input
            className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500 dark:border-zinc-800 dark:bg-black"
            value={props.asinA}
            onChange={(event) => props.onAsinAChange(event.target.value)}
            placeholder="B0XXXXXXXXX"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-sm font-medium">ASIN or URL (B)</span>
          <input
            className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500 dark:border-zinc-800 dark:bg-black"
            value={props.asinB}
            onChange={(event) => props.onAsinBChange(event.target.value)}
            placeholder="B0XXXXXXXXX"
          />
        </label>
      </div>

      <button
        className="mt-4 h-10 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white transition-colors hover:bg-violet-700 focus:ring-2 focus:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-violet-500 dark:hover:bg-violet-400"
        disabled={props.isSubmitting || !props.asinA.trim() || !props.asinB.trim()}
        onClick={props.onCompare}
        type="button"
      >
        {props.isSubmitting ? "Starting..." : "Compare"}
      </button>

      {props.error ? (
        <p className="mt-3 text-sm text-red-600 dark:text-red-400">{props.error}</p>
      ) : null}
    </section>
  );
}
