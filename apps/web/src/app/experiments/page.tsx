"use client";

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
  const n = Number(total);
  return Number.isFinite(n) ? n : 0;
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

      const resp = await getSupabaseClient()
        .from("experiments")
        .select(
          "id, job_id, asin_a, asin_b, created_at, is_pinned, change_tags, scores_snapshot",
        )
        .order("created_at", { ascending: false })
        .limit(50);

      if (!mounted) return;
      if (resp.error) {
        setError(resp.error.message);
        return;
      }
      setItems((resp.data ?? []) as ExperimentRow[]);
    }
    load();
    return () => {
      mounted = false;
    };
  }, [router]);

  const filtered = useMemo(() => {
    const q = asinFilter.trim().toUpperCase();
    return items.filter((x) => {
      const byPin = pinnedOnly ? x.is_pinned : true;
      const byAsin =
        !q || x.asin_a.toUpperCase().includes(q) || x.asin_b.toUpperCase().includes(q);
      return byPin && byAsin;
    });
  }, [asinFilter, items, pinnedOnly]);

  const selectedRows = useMemo(
    () => filtered.filter((x) => selected.includes(x.id)).slice(0, 3),
    [filtered, selected],
  );

  const baseline = selectedRows[0];

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-black dark:text-zinc-50">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <div>
          <h1 className="text-xl font-semibold">Experiments</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Filter, review, and compare saved runs.
          </p>
        </div>
        <button
          className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
          onClick={() => router.push("/dashboard")}
          type="button"
        >
          Dashboard
        </button>
      </header>

      <main className="mx-auto w-full max-w-5xl px-6 pb-16">
        {error ? (
          <section className="rounded-2xl border border-red-200 bg-white p-6 text-sm text-red-700 shadow-sm dark:border-red-900 dark:bg-zinc-950 dark:text-red-300">
            {error}
          </section>
        ) : null}

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-medium">Filters</h2>
          <div className="mt-3 grid gap-3 md:grid-cols-3">
            <input
              value={asinFilter}
              onChange={(e) => setAsinFilter(e.target.value)}
              className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-black dark:focus:border-zinc-600"
              placeholder="Filter by ASIN"
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={pinnedOnly}
                onChange={(e) => setPinnedOnly(e.target.checked)}
              />
              Pinned only
            </label>
            <div className="text-sm text-zinc-600 dark:text-zinc-400">
              Select 2-3 rows below to compare deltas.
            </div>
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-medium">Saved experiments</h2>
          {filtered.length ? (
            <ul className="mt-3 space-y-2">
              {filtered.map((item) => {
                const checked = selected.includes(item.id);
                const a = readTotal(item.scores_snapshot, "asin_a");
                const b = readTotal(item.scores_snapshot, "asin_b");
                return (
                  <li
                    key={item.id}
                    className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-sm dark:border-zinc-800 dark:bg-black"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={(e) => {
                            setSelected((prev) => {
                              if (e.target.checked) {
                                return [...prev, item.id].slice(-3);
                              }
                              return prev.filter((x) => x !== item.id);
                            });
                          }}
                        />
                        <span className="font-medium">
                          {item.asin_a} vs {item.asin_b}
                        </span>
                      </label>
                      <button
                        className="rounded-lg border border-zinc-200 bg-white px-3 py-1 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                        onClick={() => router.push(`/jobs/${item.job_id}`)}
                        type="button"
                      >
                        Open job
                      </button>
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      A total: {a.toFixed(3)} - B total: {b.toFixed(3)}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
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

        <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-medium">Side-by-side deltas</h2>
          {selectedRows.length >= 2 && baseline ? (
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {selectedRows.map((row) => {
                const a = readTotal(row.scores_snapshot, "asin_a");
                const b = readTotal(row.scores_snapshot, "asin_b");
                const baseA = readTotal(baseline.scores_snapshot, "asin_a");
                const baseB = readTotal(baseline.scores_snapshot, "asin_b");
                return (
                  <div
                    key={row.id}
                    className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-black"
                  >
                    <div className="font-medium">
                      {row.asin_a} vs {row.asin_b}
                    </div>
                    <div className="mt-1 text-zinc-600 dark:text-zinc-400">
                      A: {a.toFixed(3)} ({(a - baseA).toFixed(3)})
                    </div>
                    <div className="text-zinc-600 dark:text-zinc-400">
                      B: {b.toFixed(3)} ({(b - baseB).toFixed(3)})
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
      </main>
    </div>
  );
}
