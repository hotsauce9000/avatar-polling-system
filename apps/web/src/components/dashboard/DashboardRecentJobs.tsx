import { Clock } from "lucide-react";

import type { RecentJob } from "@/lib/api";

type DashboardRecentJobsProps = {
  recentJobs: RecentJob[];
  onOpenJob: (jobId: string) => void;
};

export function DashboardRecentJobs(props: DashboardRecentJobsProps) {
  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
      <div className="flex items-center gap-2">
        <Clock className="h-5 w-5 text-violet-600 dark:text-violet-400" />
        <h2 className="text-lg font-medium">Recent jobs</h2>
      </div>
      {props.recentJobs.length ? (
        <ul className="mt-3 space-y-2 text-sm">
          {props.recentJobs.map((run) => (
            <li key={run.id}>
              <button
                className="w-full cursor-pointer rounded-lg border border-zinc-200 bg-zinc-50 p-3 text-left transition-colors hover:border-violet-200 hover:bg-violet-50 dark:border-zinc-800 dark:bg-black dark:hover:border-violet-900 dark:hover:bg-violet-950/20"
                onClick={() => props.onOpenJob(run.id)}
                type="button"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-medium">
                      {run.asin_a} vs {run.asin_b}
                    </div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400">{run.status}</div>
                  </div>
                  <span className="text-xs font-medium text-violet-600 dark:text-violet-400">
                    Open
                  </span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">No jobs yet.</p>
      )}
    </section>
  );
}
