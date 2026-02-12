"use client";

import Image from "next/image";
import { Eye, Package, Trophy, Users, Wrench } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { trackEvent } from "@/lib/api";
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

type StageMeta = {
  number: number;
  key: string;
  label: string;
};

const STAGE_META: StageMeta[] = [
  { number: 0, key: "listing_fetch", label: "Listing Fetch" },
  { number: 1, key: "main_image_ctr", label: "Main Image CTR" },
  { number: 2, key: "gallery_cvr", label: "Gallery CVR" },
  { number: 3, key: "text_alignment", label: "Text Alignment" },
  { number: 4, key: "avatars", label: "Avatars" },
  { number: 5, key: "verdict", label: "Verdict" },
];

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function statusBadge(status?: string): string {
  switch (status) {
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-300";
    case "in_progress":
      return "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-300";
    case "failed":
      return "border-red-200 bg-red-50 text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300";
    case "skipped":
      return "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300";
    default:
      return "border-zinc-200 bg-zinc-50 text-zinc-700 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300";
  }
}

function toFixedSafe(value: unknown, digits = 3): string {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "0.000";
  return numeric.toFixed(digits);
}

export default function JobPage() {
  const router = useRouter();
  const params = useParams<{ jobId: string }>();
  const jobId = Array.isArray(params.jobId) ? params.jobId[0] : params.jobId;

  const [job, setJob] = useState<JobRow | null>(null);
  const [stages, setStages] = useState<JobStageRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [tagsInput, setTagsInput] = useState("");
  const [notesInput, setNotesInput] = useState("");
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [isSavingExperiment, setIsSavingExperiment] = useState(false);

  const title = useMemo(() => {
    if (!jobId) return "Job";
    if (!job) return `Job ${jobId}`;
    return `${job.asin_a} vs ${job.asin_b}`;
  }, [job, jobId]);

  const stageMap = useMemo(() => {
    const map = new Map<number, JobStageRow>();
    for (const stage of stages) map.set(stage.stage_number, stage);
    return map;
  }, [stages]);

  const stageOutputMap = useMemo(() => {
    const outputMap = new Map<number, Record<string, unknown>>();
    for (const stage of stages) {
      const parsed = asRecord(stage.output);
      if (parsed) outputMap.set(stage.stage_number, parsed);
    }
    return outputMap;
  }, [stages]);

  const completedStages = useMemo(
    () =>
      STAGE_META.filter(
        (metadata) => (stageMap.get(metadata.number)?.status ?? "pending") === "completed",
      ).length,
    [stageMap],
  );

  const stage0 = stageOutputMap.get(0);
  const stage1 = stageOutputMap.get(1);
  const stage2 = stageOutputMap.get(2);
  const stage4 = stageOutputMap.get(4);
  const stage5 = stageOutputMap.get(5);

  const asinAData = asRecord(stage0?.asin_a);
  const asinBData = asRecord(stage0?.asin_b);

  const scoreA = Number(asRecord(asRecord(stage5?.scores)?.asin_a)?.total ?? 0);
  const scoreB = Number(asRecord(asRecord(stage5?.scores)?.asin_b)?.total ?? 0);
  const winner = String(stage5?.winner ?? "TIE");
  const confidence = Number(stage5?.confidence ?? 0);

  const avatars = Array.isArray(stage4?.avatars)
    ? (stage4?.avatars as Array<Record<string, unknown>>)
    : [];

  const fixes = Array.isArray(stage5?.prioritized_fixes)
    ? (stage5?.prioritized_fixes as Array<Record<string, unknown>>)
    : [];

  const visionEvidence = [
    ...(Array.isArray(stage1?.evidence)
      ? (stage1?.evidence as Array<Record<string, unknown>>)
      : []),
    ...(Array.isArray(stage2?.evidence)
      ? (stage2?.evidence as Array<Record<string, unknown>>)
      : []),
  ];

  useEffect(() => {
    if (!jobId) return;
    let isMounted = true;

    async function loadInitial() {
      setError(null);
      const { data: userData } = await getSupabaseClient().auth.getUser();
      if (!userData.user) {
        router.replace("/");
        return;
      }

      const jobResponse = await getSupabaseClient()
        .from("jobs")
        .select("id, asin_a, asin_b, status, created_at")
        .eq("id", jobId)
        .maybeSingle();

      if (!isMounted) return;

      if (jobResponse.error) {
        setError(jobResponse.error.message);
        return;
      }

      if (!jobResponse.data) {
        setError("Job not found (or you don't have access).");
        return;
      }

      setJob(jobResponse.data as JobRow);

      const stagesResponse = await getSupabaseClient()
        .from("job_stages")
        .select("id, job_id, stage_number, status, output, created_at, completed_at")
        .eq("job_id", jobId)
        .order("stage_number", { ascending: true });

      if (!isMounted) return;

      if (stagesResponse.error) {
        setError(stagesResponse.error.message);
        return;
      }

      setStages((stagesResponse.data ?? []) as JobStageRow[]);
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
          loadInitial();
        },
      )
      .subscribe();

    return () => {
      isMounted = false;
      getSupabaseClient().removeChannel(channel);
    };
  }, [jobId, router]);

  async function saveExperiment() {
    if (!job || !stage5) return;
    setSaveMessage(null);
    setIsSavingExperiment(true);
    try {
      const {
        data: { user },
      } = await getSupabaseClient().auth.getUser();
      if (!user) {
        router.replace("/");
        return;
      }
      const tags = tagsInput
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean)
        .slice(0, 8);
      const { error: insertError } = await getSupabaseClient().from("experiments").insert({
        user_id: user.id,
        asin_a: job.asin_a,
        asin_b: job.asin_b,
        job_id: job.id,
        scores_snapshot: stage5?.scores ?? {},
        change_tags: tags,
        notes: notesInput.trim() || null,
      });
      if (insertError) {
        throw insertError;
      }
      const { data: sessionData } = await getSupabaseClient().auth.getSession();
      if (sessionData.session?.access_token) {
        try {
          await trackEvent({
            accessToken: sessionData.session.access_token,
            eventName: "experiment_saved",
            jobId: job.id,
            properties: { tags_count: tags.length },
          });
        } catch {
          // Ignore analytics failures.
        }
      }
      setSaveMessage("Experiment saved.");
    } catch (reason) {
      setSaveMessage(reason instanceof Error ? reason.message : "Failed to save experiment.");
    } finally {
      setIsSavingExperiment(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Progressive stages (Realtime) - {completedStages}/{STAGE_META.length} done
        </p>
      </section>

      {error ? (
        <section className="rounded-2xl border border-red-200 bg-white p-6 text-sm text-red-700 shadow-sm dark:border-red-900 dark:bg-zinc-950 dark:text-red-300">
          {error}
        </section>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-lg font-medium">Stage Progress</h2>
        <div className="mt-4 grid gap-3 lg:grid-cols-3 xl:grid-cols-6">
          {STAGE_META.map((metadata) => {
            const row = stageMap.get(metadata.number);
            const status = row?.status ?? "pending";
            return (
              <div
                key={metadata.number}
                className={`rounded-xl border px-3 py-3 text-xs ${statusBadge(status)}`}
              >
                <div className="font-semibold">Stage {metadata.number}</div>
                <div className="mt-1">{metadata.label}</div>
                <div className="mt-2 uppercase tracking-wide">{status}</div>
              </div>
            );
          })}
        </div>
      </section>

      {stage0 ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center gap-2">
            <Package className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            <h2 className="text-lg font-medium">Listings</h2>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            {[asinAData, asinBData].map((asinData, index) => {
              const asin = String(asinData?.asin ?? (index === 0 ? job?.asin_a : job?.asin_b) ?? "");
              const titleText = String(asinData?.title ?? "No title");
              const imageUrl = String(asinData?.main_image_url ?? "");
              const provider = String(asinData?.provider ?? stage0.provider ?? "unknown");
              return (
                <article
                  key={asin || index}
                  className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-black"
                >
                  <div className="text-xs uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                    {asin}
                  </div>
                  {imageUrl ? (
                    <Image
                      src={imageUrl}
                      alt={asin}
                      width={320}
                      height={320}
                      className="mt-2 h-40 w-full rounded-lg bg-white object-contain p-2 dark:bg-zinc-950"
                      unoptimized
                    />
                  ) : (
                    <div className="mt-2 h-40 animate-pulse rounded-lg bg-zinc-200 dark:bg-zinc-800" />
                  )}
                  <p className="mt-3 text-sm leading-5">{titleText}</p>
                  <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                    Provider: {provider}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ) : null}

      {stage5 ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            <h2 className="text-lg font-medium">Verdict</h2>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <span className="rounded-xl border border-violet-300 bg-violet-50 px-4 py-2 text-base font-semibold text-violet-700 dark:border-violet-800 dark:bg-violet-950/30 dark:text-violet-300">
              Winner: {winner}
            </span>
            <span className="text-zinc-600 dark:text-zinc-400">
              Confidence: {(confidence * 100).toFixed(1)}%
            </span>
            {winner === "TIE" ? (
              <span className="text-amber-700 dark:text-amber-300">
                Split verdict: both listings are currently close.
              </span>
            ) : null}
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-black">
              <div className="text-sm font-medium">ASIN A Total</div>
              <div className="mt-1 text-2xl font-semibold">{toFixedSafe(scoreA)}</div>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-black">
              <div className="text-sm font-medium">ASIN B Total</div>
              <div className="mt-1 text-2xl font-semibold">{toFixedSafe(scoreB)}</div>
            </div>
          </div>
        </section>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-2">
        <article className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            <h2 className="text-lg font-medium">Avatars</h2>
          </div>
          {avatars.length ? (
            <div className="mt-4 space-y-3">
              {avatars.map((avatar, index) => (
                <div
                  key={`${avatar.name ?? "avatar"}-${index}`}
                  className="rounded-xl border border-zinc-200 border-l-2 border-l-violet-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:border-l-violet-800 dark:bg-black"
                >
                  <div className="font-medium">{String(avatar.name ?? "Persona")}</div>
                  <div className="mt-1 text-zinc-600 dark:text-zinc-400">
                    Leans to: {String(avatar.leans_to ?? "TIE")}
                  </div>
                  {Array.isArray(avatar.cares_about) ? (
                    <div className="mt-2 text-xs text-zinc-500 dark:text-zinc-400">
                      {avatar.cares_about.map((value) => String(value)).join(" - ")}
                    </div>
                  ) : null}
                  {avatar.fix_suggestion ? (
                    <p className="mt-2 text-xs text-zinc-600 dark:text-zinc-300">
                      Fix: {String(avatar.fix_suggestion)}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
              Avatars will appear after Stage 4 completes.
            </p>
          )}
        </article>

        <article className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="flex items-center gap-2">
            <Wrench className="h-5 w-5 text-violet-600 dark:text-violet-400" />
            <h2 className="text-lg font-medium">Prioritized Fixes</h2>
          </div>
          {fixes.length ? (
            <div className="mt-4 space-y-3">
              {fixes.map((fix, index) => (
                <div
                  key={`fix-${index}`}
                  className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-black"
                >
                  <div className="flex items-center gap-2 font-medium">
                    <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-violet-100 px-2 text-xs text-violet-700 dark:bg-violet-950/50 dark:text-violet-300">
                      #{index + 1}
                    </span>
                    {String(fix.title ?? "Suggestion")}
                  </div>
                  {fix.reason ? (
                    <p className="mt-1 text-zinc-600 dark:text-zinc-400">{String(fix.reason)}</p>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
              No prioritized fixes yet.
            </p>
          )}
        </article>
      </section>

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div className="flex items-center gap-2">
          <Eye className="h-5 w-5 text-violet-600 dark:text-violet-400" />
          <h2 className="text-lg font-medium">What The Model Saw</h2>
        </div>
        {visionEvidence.length ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {visionEvidence.slice(0, 8).map((item, index) => (
              <div
                key={`evidence-${index}`}
                className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-black"
              >
                <div className="font-medium">
                  ASIN {String(item.asin ?? "?")} - {String(item.factor ?? "factor")}
                </div>
                <div className="mt-1 text-zinc-600 dark:text-zinc-400">
                  {String(item.detail ?? "")}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
            Evidence items will appear when vision stages return structured evidence.
          </p>
        )}
      </section>

      {stage5 ? (
        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-medium">Save As Experiment</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Save this run with tags so you can compare it later.
          </p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Tags (comma-separated)</span>
              <input
                value={tagsInput}
                onChange={(event) => setTagsInput(event.target.value)}
                className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500 dark:border-zinc-800 dark:bg-black"
                placeholder="main-image-v2, shorter-title"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Notes</span>
              <input
                value={notesInput}
                onChange={(event) => setNotesInput(event.target.value)}
                className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500 dark:border-zinc-800 dark:bg-black"
                placeholder="What changed in this experiment?"
              />
            </label>
          </div>
          <button
            className="mt-4 h-10 rounded-lg bg-violet-600 px-4 text-sm font-medium text-white transition-colors hover:bg-violet-700 focus:ring-2 focus:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-violet-500 dark:hover:bg-violet-400"
            onClick={saveExperiment}
            disabled={isSavingExperiment}
            type="button"
          >
            {isSavingExperiment ? "Saving..." : "Save experiment"}
          </button>
          {saveMessage ? (
            <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">{saveMessage}</p>
          ) : null}
        </section>
      ) : null}

      <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <h2 className="text-lg font-medium">Stage JSON (Debug)</h2>
        <div className="mt-4 space-y-3">
          {stages.length ? (
            stages.map((stage) => (
              <details
                key={stage.id}
                className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-sm dark:border-zinc-800 dark:bg-black"
                open={stage.status === "failed"}
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-2">
                  <span className="font-medium">
                    Stage {stage.stage_number} - {STAGE_META[stage.stage_number]?.label ?? "Unknown"}
                  </span>
                  <span className={`rounded-full border px-2 py-0.5 text-xs ${statusBadge(stage.status)}`}>
                    {stage.status}
                  </span>
                </summary>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap text-xs text-zinc-700 dark:text-zinc-300">
                  {JSON.stringify(stage.output, null, 2)}
                </pre>
              </details>
            ))
          ) : (
            <p className="text-sm text-zinc-600 dark:text-zinc-400">No stages yet.</p>
          )}
        </div>
      </section>
    </div>
  );
}
