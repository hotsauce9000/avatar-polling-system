"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import type { User } from "@supabase/supabase-js";

import { createJob } from "@/lib/api";
import { getSupabaseClient } from "@/lib/supabase/client";

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [asinA, setAsinA] = useState("");
  const [asinB, setAsinB] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

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
    }

    load();

    const { data: authListener } = getSupabaseClient().auth.onAuthStateChange(
      (_event, session) => {
        if (!session) router.replace("/");
      }
    );

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [router]);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-black dark:text-zinc-50">
      <header className="mx-auto flex w-full max-w-4xl items-center justify-between px-6 py-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Dashboard</h1>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Signed in as {user?.email ?? "loading..."}
          </p>
        </div>
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
      </header>

      <main className="mx-auto w-full max-w-4xl px-6 pb-16">
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

          {error ? (
            <p className="mt-3 text-sm text-red-600">{error}</p>
          ) : null}
        </section>
      </main>
    </div>
  );
}
