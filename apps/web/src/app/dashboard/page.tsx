"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import type { User } from "@supabase/supabase-js";

import {
  getAnalyticsEvents,
  createCreditCheckout,
  createJob,
  getCreditOperations,
  getCreditPacks,
  getRecentExperiments,
  getRecentJobs,
  trackEvent,
  type AnalyticsEventRow,
  type CreditOperation,
  type CreditPack,
  type RecentExperiment,
  type RecentJob,
} from "@/lib/api";
import { getSupabaseClient } from "@/lib/supabase/client";

type CreditSnapshot = {
  credit_balance: number;
  daily_credit_used: number;
  daily_credit_reset_date: string | null;
};

type StageLatencySummary = {
  stage: number;
  samples: number;
  p50_ms: number;
  p95_ms: number;
};

function percentile(values: number[], quantile: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.ceil(sorted.length * quantile) - 1),
  );
  return sorted[index] ?? 0;
}

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [asinA, setAsinA] = useState("");
  const [asinB, setAsinB] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [credits, setCredits] = useState<CreditSnapshot | null>(null);
  const [recentJobs, setRecentJobs] = useState<RecentJob[]>([]);
  const [recentExperiments, setRecentExperiments] = useState<RecentExperiment[]>([]);
  const [creditPacks, setCreditPacks] = useState<CreditPack[]>([]);
  const [creditOperations, setCreditOperations] = useState<CreditOperation[]>([]);
  const [analyticsEvents, setAnalyticsEvents] = useState<AnalyticsEventRow[]>([]);
  const [isBuyingPackId, setIsBuyingPackId] = useState<string | null>(null);
  const [billingMessage, setBillingMessage] = useState<string | null>(null);

  useEffect(() => {
    const checkout = new URLSearchParams(window.location.search).get("checkout");
    if (checkout === "success") {
      setBillingMessage("Purchase confirmed. Credits may take a few seconds to appear.");
    } else if (checkout === "cancel") {
      setBillingMessage("Stripe checkout was canceled.");
    }
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function load() {
      const { data, error } = await getSupabaseClient().auth.getUser();

      if (!isMounted) return;

      if (error) {
        router.replace("/");
        return;
      }

      if (!data.user) {
        router.replace("/");
        return;
      }

      setUser(data.user);

      const { data: sessionData } = await getSupabaseClient().auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const [profileResp, jobsResp, experimentsResp, analyticsResp] = await Promise.all([
        getSupabaseClient()
          .from("user_profiles")
          .select("credit_balance, daily_credit_used, daily_credit_reset_date")
          .eq("id", data.user.id)
          .maybeSingle(),
        getSupabaseClient()
          .from("jobs")
          .select("id, asin_a, asin_b, status, created_at")
          .order("created_at", { ascending: false })
          .limit(6),
        getSupabaseClient()
          .from("experiments")
          .select("id, asin_a, asin_b, created_at, change_tags")
          .order("created_at", { ascending: false })
          .limit(6),
        getSupabaseClient()
          .from("analytics_events")
          .select("event_name, stage_number, properties, created_at")
          .order("created_at", { ascending: false })
          .limit(200),
      ]);

      let packsResp:
        | {
            currency: string;
            version: string;
            packs: CreditPack[];
          }
        | null = null;
      let operationsResp:
        | {
            operations: CreditOperation[];
          }
        | null = null;
      let jobsApiResp:
        | {
            jobs: RecentJob[];
          }
        | null = null;
      let experimentsApiResp:
        | {
            experiments: RecentExperiment[];
          }
        | null = null;
      let analyticsApiResp:
        | {
            events: AnalyticsEventRow[];
          }
        | null = null;
      if (accessToken) {
        try {
          [packsResp, operationsResp, jobsApiResp, experimentsApiResp, analyticsApiResp] =
            await Promise.all([
            getCreditPacks(accessToken),
            getCreditOperations(accessToken),
            getRecentJobs({ accessToken, limit: 6 }),
            getRecentExperiments({ accessToken, limit: 6 }),
            getAnalyticsEvents({ accessToken, limit: 200 }),
          ]);
        } catch {
          packsResp = null;
          operationsResp = null;
          jobsApiResp = null;
          experimentsApiResp = null;
          analyticsApiResp = null;
        }
      }

      if (!isMounted) return;

      if (!profileResp.error && profileResp.data) {
        setCredits(profileResp.data as CreditSnapshot);
      }
      if (jobsApiResp?.jobs) {
        setRecentJobs(jobsApiResp.jobs);
      } else if (!jobsResp.error && jobsResp.data) {
        setRecentJobs(jobsResp.data as RecentJob[]);
      }
      if (experimentsApiResp?.experiments) {
        setRecentExperiments(experimentsApiResp.experiments);
      } else if (!experimentsResp.error && experimentsResp.data) {
        setRecentExperiments(experimentsResp.data as RecentExperiment[]);
      }
      if (analyticsApiResp?.events) {
        setAnalyticsEvents(analyticsApiResp.events);
      } else if (!analyticsResp.error && analyticsResp.data) {
        setAnalyticsEvents(analyticsResp.data as AnalyticsEventRow[]);
      }
      if (packsResp?.packs?.length) {
        setCreditPacks(packsResp.packs);
      }
      if (operationsResp?.operations) {
        setCreditOperations(operationsResp.operations);
      }
    }

    load();

    const { data: authListener } = getSupabaseClient().auth.onAuthStateChange(
      (_event, session) => {
        if (!session) router.replace("/");
      },
    );

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [router]);

  const stageLatency = useMemo<StageLatencySummary[]>(() => {
    const byStage = new Map<number, number[]>();
    for (const event of analyticsEvents) {
      if (event.event_name !== "stage_completed") continue;
      if (typeof event.stage_number !== "number") continue;
      const durationMs = Number(event.properties?.duration_ms ?? 0);
      if (!Number.isFinite(durationMs) || durationMs <= 0) continue;
      const arr = byStage.get(event.stage_number) ?? [];
      arr.push(durationMs);
      byStage.set(event.stage_number, arr);
    }

    return Array.from(byStage.entries())
      .map(([stage, durations]) => ({
        stage,
        samples: durations.length,
        p50_ms: Math.round(percentile(durations, 0.5)),
        p95_ms: Math.round(percentile(durations, 0.95)),
      }))
      .sort((a, b) => a.stage - b.stage);
  }, [analyticsEvents]);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-black dark:text-zinc-50">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Signed in as {user?.email ?? "loading..."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
            onClick={() => router.push("/experiments")}
            type="button"
          >
            Experiments
          </button>
          <button
            className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
            onClick={async () => {
              await getSupabaseClient().auth.signOut();
              router.replace("/");
            }}
            type="button"
          >
            Sign out
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-5xl px-6 pb-16">
        {billingMessage ? (
          <section className="mb-6 rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
            {billingMessage}
          </section>
        ) : null}

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-medium">New comparison</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Enter two Amazon.com ASINs or product URLs.
          </p>

          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">ASIN or URL (A)</span>
              <input
                className="h-11 rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-black dark:focus:border-zinc-600"
                value={asinA}
                onChange={(e) => setAsinA(e.target.value)}
                placeholder="B0XXXXXXXXX"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">ASIN or URL (B)</span>
              <input
                className="h-11 rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-black dark:focus:border-zinc-600"
                value={asinB}
                onChange={(e) => setAsinB(e.target.value)}
                placeholder="B0XXXXXXXXX"
              />
            </label>
          </div>

          <button
            className="mt-4 h-11 rounded-lg bg-zinc-950 px-4 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
            disabled={isSubmitting || !asinA.trim() || !asinB.trim()}
            onClick={async () => {
              setError(null);
              setIsSubmitting(true);
              try {
                const { data } = await getSupabaseClient().auth.getSession();
                if (!data.session) {
                  router.replace("/");
                  return;
                }

                const result = await createJob({
                  asinA,
                  asinB,
                  accessToken: data.session.access_token,
                });

                try {
                  await trackEvent({
                    accessToken: data.session.access_token,
                    eventName: "job_submitted_from_dashboard",
                    jobId: result.job_id,
                    properties: { asin_a: asinA.trim(), asin_b: asinB.trim() },
                  });
                } catch {
                  // Ignore analytics failures.
                }

                router.push(`/jobs/${result.job_id}`);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Unknown error");
              } finally {
                setIsSubmitting(false);
              }
            }}
            type="button"
          >
            {isSubmitting ? "Starting..." : "Compare"}
          </button>

          {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}
        </section>

        <section className="mt-6 grid gap-6 md:grid-cols-2">
          <article className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-lg font-medium">Credits</h2>
            <div className="mt-3 space-y-1 text-sm">
              <p>
                Balance:{" "}
                <span className="font-semibold">
                  {credits ? credits.credit_balance : "..."}
                </span>
              </p>
              <p className="text-zinc-600 dark:text-zinc-400">
                Used today: {credits ? credits.daily_credit_used : "..."}
              </p>
              <p className="text-zinc-600 dark:text-zinc-400">
                Daily reset: {credits?.daily_credit_reset_date ?? "n/a"}
              </p>
            </div>
          </article>

          <article className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
            <h2 className="text-lg font-medium">Recent Experiments</h2>
            {recentExperiments.length ? (
              <ul className="mt-3 space-y-2 text-sm">
                {recentExperiments.map((exp) => (
                  <li
                    key={exp.id}
                    className="rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-black"
                  >
                    <div className="font-medium">
                      {exp.asin_a} vs {exp.asin_b}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500">
                      {exp.change_tags?.length ? exp.change_tags.join(", ") : "No tags"}
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
                No saved experiments yet.
              </p>
            )}
          </article>
        </section>

        <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-medium">Credit packs</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Buy credits with Stripe checkout.
          </p>
          {creditPacks.length ? (
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              {creditPacks.map((pack) => (
                <article
                  key={pack.id}
                  className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-black"
                >
                  <h3 className="font-medium">{pack.label}</h3>
                  <p className="mt-1 text-2xl font-semibold">{pack.credits} credits</p>
                  <p className="mt-1 text-zinc-600 dark:text-zinc-400">${pack.price_usd} USD</p>
                  <p className="mt-2 text-xs text-zinc-500">{pack.blurb}</p>
                  <button
                    className="mt-3 h-9 w-full rounded-lg bg-zinc-950 px-3 text-xs font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
                    disabled={Boolean(isBuyingPackId)}
                    onClick={async () => {
                      setBillingMessage(null);
                      setIsBuyingPackId(pack.id);
                      try {
                        const { data } = await getSupabaseClient().auth.getSession();
                        if (!data.session) {
                          router.replace("/");
                          return;
                        }
                        const checkout = await createCreditCheckout({
                          packId: pack.id,
                          accessToken: data.session.access_token,
                        });
                        try {
                          await trackEvent({
                            accessToken: data.session.access_token,
                            eventName: "stripe_checkout_redirected",
                            properties: {
                              pack_id: pack.id,
                              credits: pack.credits,
                              session_id: checkout.session_id,
                            },
                          });
                        } catch {
                          // Ignore analytics failures.
                        }
                        window.location.assign(checkout.checkout_url);
                      } catch (err) {
                        setBillingMessage(
                          err instanceof Error ? err.message : "Failed to start checkout.",
                        );
                      } finally {
                        setIsBuyingPackId(null);
                      }
                    }}
                    type="button"
                  >
                    {isBuyingPackId === pack.id ? "Redirecting..." : "Buy with Stripe"}
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

        <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-medium">Credit history</h2>
          {creditOperations.length ? (
            <ul className="mt-3 space-y-2 text-sm">
              {creditOperations.map((op) => (
                <li
                  key={op.idempotency_key}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-black"
                >
                  <div>
                    <div className="font-medium">{op.operation_type}</div>
                    <div className="text-xs text-zinc-500">
                      {new Date(op.created_at).toLocaleString()}
                    </div>
                  </div>
                  <div className="text-sm font-semibold">{op.amount > 0 ? `+${op.amount}` : op.amount}</div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
              No credit operations yet.
            </p>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-medium">Stage latency (P50/P95)</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Derived from `stage_completed` analytics events.
          </p>
          {stageLatency.length ? (
            <div className="mt-4 overflow-x-auto">
              <table className="w-full min-w-[420px] text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="pb-2 pr-4">Stage</th>
                    <th className="pb-2 pr-4">Samples</th>
                    <th className="pb-2 pr-4">P50 (ms)</th>
                    <th className="pb-2">P95 (ms)</th>
                  </tr>
                </thead>
                <tbody>
                  {stageLatency.map((row) => (
                    <tr key={row.stage} className="border-t border-zinc-200 dark:border-zinc-800">
                      <td className="py-2 pr-4 font-medium">{row.stage}</td>
                      <td className="py-2 pr-4">{row.samples}</td>
                      <td className="py-2 pr-4">{row.p50_ms}</td>
                      <td className="py-2">{row.p95_ms}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
              No stage timing events yet.
            </p>
          )}
        </section>

        <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-medium">Recent jobs</h2>
          {recentJobs.length ? (
            <ul className="mt-3 space-y-2 text-sm">
              {recentJobs.map((run) => (
                <li
                  key={run.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-black"
                >
                  <div>
                    <div className="font-medium">
                      {run.asin_a} vs {run.asin_b}
                    </div>
                    <div className="text-xs text-zinc-500">{run.status}</div>
                  </div>
                  <button
                    className="rounded-lg border border-zinc-200 bg-white px-3 py-1 text-xs font-medium hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
                    onClick={() => router.push(`/jobs/${run.id}`)}
                    type="button"
                  >
                    Open
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">No jobs yet.</p>
          )}
        </section>
      </main>
    </div>
  );
}
