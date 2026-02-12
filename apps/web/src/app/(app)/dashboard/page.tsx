"use client";

import { FlaskConical } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import {
  createCreditCheckout,
  createJob,
  getAnalyticsEvents,
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
import {
  DashboardComparison,
} from "@/components/dashboard/DashboardComparison";
import {
  DashboardCredits,
  type CreditSnapshot,
} from "@/components/dashboard/DashboardCredits";
import { DashboardCreditPacks } from "@/components/dashboard/DashboardCreditPacks";
import { DashboardRecentJobs } from "@/components/dashboard/DashboardRecentJobs";

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

function isStripeCheckoutUrl(url: string): boolean {
  try {
    return new URL(url).hostname.endsWith(".stripe.com");
  } catch {
    return false;
  }
}

export default function DashboardPage() {
  const router = useRouter();
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
      const { data: userData, error: userError } = await getSupabaseClient().auth.getUser();
      if (!isMounted) return;

      if (userError || !userData.user) {
        router.replace("/");
        return;
      }

      const { data: sessionData } = await getSupabaseClient().auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const [profileResp, jobsResp, experimentsResp, analyticsResp] = await Promise.all([
        getSupabaseClient()
          .from("user_profiles")
          .select("credit_balance, daily_credit_used, daily_credit_reset_date")
          .eq("id", userData.user.id)
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

    return () => {
      isMounted = false;
    };
  }, [router]);

  const stageLatency = useMemo<StageLatencySummary[]>(() => {
    const byStage = new Map<number, number[]>();
    for (const event of analyticsEvents) {
      if (event.event_name !== "stage_completed") continue;
      if (typeof event.stage_number !== "number") continue;
      const durationMs = Number(event.properties?.duration_ms ?? 0);
      if (!Number.isFinite(durationMs) || durationMs <= 0) continue;
      const currentValues = byStage.get(event.stage_number) ?? [];
      currentValues.push(durationMs);
      byStage.set(event.stage_number, currentValues);
    }

    return Array.from(byStage.entries())
      .map(([stage, durations]) => ({
        stage,
        samples: durations.length,
        p50_ms: Math.round(percentile(durations, 0.5)),
        p95_ms: Math.round(percentile(durations, 0.95)),
      }))
      .sort((left, right) => left.stage - right.stage);
  }, [analyticsEvents]);

  async function handleCompare() {
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
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unknown error");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleBuyPack(pack: CreditPack) {
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
      if (!isStripeCheckoutUrl(checkout.checkout_url)) {
        throw new Error("Invalid Stripe checkout URL.");
      }
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
    } catch (reason) {
      setBillingMessage(reason instanceof Error ? reason.message : "Failed to start checkout.");
    } finally {
      setIsBuyingPackId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Run comparisons, monitor performance, and manage credits.
        </p>
      </section>

      {billingMessage ? (
        <section className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300">
          {billingMessage}
        </section>
      ) : null}

      <DashboardComparison
        asinA={asinA}
        asinB={asinB}
        isSubmitting={isSubmitting}
        error={error}
        onAsinAChange={setAsinA}
        onAsinBChange={setAsinB}
        onCompare={handleCompare}
      />

      <section className="grid gap-6 lg:grid-cols-2">
        <DashboardCredits credits={credits} creditOperations={creditOperations} />

        <article className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            <h2 className="text-lg font-medium">Recent experiments</h2>
          </div>
          {recentExperiments.length ? (
            <ul className="mt-3 space-y-2 text-sm">
              {recentExperiments.map((experiment) => (
                <li key={experiment.id}>
                  <button
                    className="w-full cursor-pointer rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-left transition-colors hover:border-violet-200 hover:bg-violet-50 dark:border-zinc-800 dark:bg-black dark:hover:border-violet-900 dark:hover:bg-violet-950/20"
                    onClick={() => router.push("/experiments")}
                    type="button"
                  >
                    <div className="font-medium">
                      {experiment.asin_a} vs {experiment.asin_b}
                    </div>
                    <div className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      {experiment.change_tags?.length
                        ? experiment.change_tags.join(", ")
                        : "No tags"}
                    </div>
                  </button>
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

      <DashboardCreditPacks
        creditPacks={creditPacks}
        isBuyingPackId={isBuyingPackId}
        onBuyPack={handleBuyPack}
      />

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-lg font-medium">Stage latency (P50/P95)</h2>
        <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
          Derived from `stage_completed` analytics events.
        </p>
        {stageLatency.length ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-sm">
              <thead className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
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

      <DashboardRecentJobs
        recentJobs={recentJobs}
        onOpenJob={(jobId) => router.push(`/jobs/${jobId}`)}
      />
    </div>
  );
}
