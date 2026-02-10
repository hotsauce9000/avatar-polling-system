"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { getSupabaseClient } from "@/lib/supabase/client";

type JobRow = {
  id: string;
  asin_a: string;
  asin_b: string;
  status: string;
  created_at: string;
};

type JobStageRow = {
  id: string;
  job_id: string;
  stage_number: number;
  status: string;
  output: unknown;
  created_at: string;
  completed_at: string | null;
};

export default function JobPage({ params }: { params: { jobId: string } }) {
  const router = useRouter();
  const jobId = params.jobId;
  const [job, setJob] = useState<JobRow | null>(null);
  const [stages, setStages] = useState<JobStageRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const title = useMemo(() => {
    if (!job) return `Job ${jobId}`;
    return `${job.asin_a} vs ${job.asin_b}`;
  }, [job, jobId]);

  useEffect(() => {
    let isMounted = true;

    async function loadInitial() {
      setError(null);

      const { data: userData } = await getSupabaseClient().auth.getUser();
      if (!userData.user) {
        router.replace("/");
        return;
      }

      const jobResp = await getSupabaseClient()
        .from("jobs")
        .select("id, asin_a, asin_b, status, created_at")
        .eq("id", jobId)
        .maybeSingle();

      if (!isMounted) return;

      if (jobResp.error) {
        setError(jobResp.error.message);
        return;
      }

      if (!jobResp.data) {
        setError("Job not found (or you don't have access).");
        return;
      }

      setJob(jobResp.data as JobRow);

      const stagesResp = await getSupabaseClient()
        .from("job_stages")
        .select("id, job_id, stage_number, status, output, created_at, completed_at")
        .eq("job_id", jobId)
        .order("stage_number", { ascending: true });

      if (!isMounted) return;

      if (stagesResp.error) {
        setError(stagesResp.error.message);
        return;
      }

      setStages((stagesResp.data ?? []) as JobStageRow[]);
    }

    loadInitial();

    const channel = getSupabaseClient()
      .channel(`job-stages:${jobId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "job_stages",
          filter: `job_id=eq.${jobId}`,
        },
        () => {
          // Re-fetch is simplest for now (MVP slice).
          loadInitial();
        }
      )
      .subscribe();

    return () => {
      isMounted = false;
      getSupabaseClient().removeChannel(channel);
    };
  }, [jobId, router]);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-black dark:text-zinc-50">
      <header className="mx-auto flex w-full max-w-4xl items-start justify-between gap-6 px-6 py-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Progressive stages (Realtime).
          </p>
        </div>
        <button
          className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:hover:bg-zinc-900"
          onClick={() => router.push("/dashboard")}
          type="button"
        >
          Back
        </button>
      </header>

      <main className="mx-auto w-full max-w-4xl px-6 pb-16">
        {error ? (
          <section className="rounded-2xl border border-red-200 bg-white p-6 text-sm text-red-700 shadow-sm dark:border-red-900 dark:bg-zinc-950 dark:text-red-300">
            {error}
          </section>
        ) : null}

        <section className="mt-6 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-medium">Stages</h2>
          <div className="mt-4 space-y-3">
            {stages.length ? (
              stages.map((s) => (
                <div
                  key={s.id}
                  className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-black"
                >
                  <div className="flex items-center justify-between">
                    <div className="font-medium">Stage {s.stage_number}</div>
                    <div className="text-zinc-600 dark:text-zinc-400">{s.status}</div>
                  </div>
                  <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-zinc-700 dark:text-zinc-300">
                    {JSON.stringify(s.output, null, 2)}
                  </pre>
                </div>
              ))
            ) : (
              <p className="text-sm text-zinc-600 dark:text-zinc-400">
                No stages yet.
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
