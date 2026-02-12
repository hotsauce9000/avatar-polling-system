"use client";

import { Filter, GitCompare, List } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { getSupabaseClient } from "@/lib/supabase/client";

type ExperimentRow = {
  id: string;
  job_id: string;
  asin_a: string;
  asin_b: string;
  created_at: string;
  is_pinned: boolean;
  change_tags: string[] | null;
  scores_snapshot: Record<string, unknown> | null;
};

function readTotal(
  snapshot: Record<string, unknown> | null | undefined,
  key: "asin_a" | "asin_b",
): number {
  if (!snapshot) return 0;
  const scores = snapshot.scores;
  if (!scores || typeof scores !== "object") return 0;
  const perAsin = (scores as Record<string, unknown>)[key];
  if (!perAsin || typeof perAsin !== "object") return 0;
  const total = (perAsin as Record<string, unknown>).total;
  const numberValue = Number(total);
  return Number.isFinite(numberValue) ? numberValue : 0;
}

function deltaClass(delta: number): string {
  if (delta > 0) return "text-emerald-700 dark:text-emerald-300";
  if (delta < 0) return "text-red-700 dark:text-red-300";
  return "text-zinc-600 dark:text-zinc-400";
}

function formatDelta(delta: number): string {
  if (delta > 0) return `+${delta.toFixed(3)}`;
  return delta.toFixed(3);
}

export default function ExperimentsPage() {
  const router = useRouter();
  const [items, setItems] = useState<ExperimentRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [asinFilter, setAsinFilter] = useState("");
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const { data: authData } = await getSupabaseClient().auth.getUser();
      if (!authData.user) {
        router.replace("/");
        return;
      }

      const response = await getSupabaseClient()
        .from("experiments")
        .select(
          "id, job_id, asin_a, asin_b, created_at, is_pinned, change_tags, scores_snapshot",
        )
        .order("created_at", { ascending: false })
        .limit(50);

      if (!mounted) return;
      if (response.error) {
        setError(response.error.message);
        return;
      }
      setItems((response.data ?? []) as ExperimentRow[]);
    }
    load();
    return () => {
      mounted = false;
    };
  }, [router]);

  const filtered = useMemo(() => {
    const query = asinFilter.trim().toUpperCase();
    return items.filter((item) => {
      const byPin = pinnedOnly ? item.is_pinned : true;
      const byAsin =
        !query ||
        item.asin_a.toUpperCase().includes(query) ||
        item.asin_b.toUpperCase().includes(query);
      return byPin && byAsin;
    });
  }, [asinFilter, items, pinnedOnly]);

  const selectedRows = useMemo(
    () => filtered.filter((item) => selected.includes(item.id)).slice(0, 3),
    [filtered, selected],
  );

  const baseline = selectedRows[0];

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Experiments</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Filter, review, and compare saved runs.
        </p>
      </section>

      {error ? (
        <section className="rounded-2xl border border-red-200 bg-white p-6 text-sm text-red-700 shadow-sm dark:border-red-900 dark:bg-zinc-950 dark:text-red-300">
          {error}
        </section>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center gap-2">
          <Filter className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          <h2 className="text-lg font-medium">Filters</h2>
        </div>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <input
            value={asinFilter}
            onChange={(event) => setAsinFilter(event.target.value)}
            className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500 dark:border-zinc-800 dark:bg-black"
            placeholder="Filter by ASIN"
          />
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              className="h-4 w-4 rounded border-zinc-300 text-violet-600 focus:ring-violet-500 dark:border-zinc-700 dark:bg-black"
              type="checkbox"
              checked={pinnedOnly}
              onChange={(event) => setPinnedOnly(event.target.checked)}
            />
            Pinned only
          </label>
          <div className="text-sm text-zinc-600 dark:text-zinc-400">
            Select 2-3 rows below to compare deltas.
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center gap-2">
          <List className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          <h2 className="text-lg font-medium">Saved experiments</h2>
        </div>
        {filtered.length ? (
          <ul className="mt-3 space-y-2">
            {filtered.map((item) => {
              const checked = selected.includes(item.id);
              const a = readTotal(item.scores_snapshot, "asin_a");
              const b = readTotal(item.scores_snapshot, "asin_b");
              return (
                <li
                  key={item.id}
                  className="cursor-pointer rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm transition-colors hover:border-violet-200 hover:bg-violet-50 dark:border-zinc-800 dark:bg-black dark:hover:border-violet-900 dark:hover:bg-violet-950/20"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <label className="flex cursor-pointer items-center gap-2">
                      <input
                        className="h-4 w-4 rounded border-zinc-300 text-violet-600 focus:ring-violet-500 dark:border-zinc-700 dark:bg-black"
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => {
                          setSelected((current) => {
                            if (event.target.checked) {
                              return [...current, item.id].slice(-3);
                            }
                            return current.filter((value) => value !== item.id);
                          });
                        }}
                      />
                      <span className="font-medium">
                        {item.asin_a} vs {item.asin_b}
                      </span>
                    </label>
                    <button
                      className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                      onClick={() => router.push(`/jobs/${item.job_id}`)}
                      type="button"
                    >
                      Open job
                    </button>
                  </div>
                  <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    A total: {a.toFixed(3)} - B total: {b.toFixed(3)}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                    Tags: {item.change_tags?.length ? item.change_tags.join(", ") : "No tags"}
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
            No experiments match your filters.
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center gap-2">
          <GitCompare className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          <h2 className="text-lg font-medium">Side-by-side deltas</h2>
        </div>
        {selectedRows.length >= 2 && baseline ? (
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            {selectedRows.map((row) => {
              const a = readTotal(row.scores_snapshot, "asin_a");
              const b = readTotal(row.scores_snapshot, "asin_b");
              const baseA = readTotal(baseline.scores_snapshot, "asin_a");
              const baseB = readTotal(baseline.scores_snapshot, "asin_b");
              const deltaA = a - baseA;
              const deltaB = b - baseB;
              return (
                <div
                  key={row.id}
                  className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-black"
                >
                  <div className="font-medium">
                    {row.asin_a} vs {row.asin_b}
                  </div>
                  <div className={`mt-1 ${deltaClass(deltaA)}`}>
                    A: {a.toFixed(3)} ({formatDelta(deltaA)})
                  </div>
                  <div className={deltaClass(deltaB)}>
                    B: {b.toFixed(3)} ({formatDelta(deltaB)})
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
            Select at least 2 experiments above to see score deltas.
          </p>
        )}
      </section>
    </div>
  );
}
