"use client";

import { useMemo, useState, useTransition } from "react";

import { getSupabaseClient } from "@/lib/supabase/client";

export default function Home() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const redirectTo = useMemo(() => {
    if (typeof window === "undefined") return undefined;
    return `${window.location.origin}/auth/callback`;
  }, []);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-950 dark:bg-black dark:text-zinc-50">
      <main className="mx-auto flex w-full max-w-xl flex-col gap-10 px-6 py-20">
        <header className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight">
            Avatar-Based Amazon Listing Optimizer
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            Compare two ASINs. Get a verdict grounded in vision evidence and
            buyer personas.
          </p>
        </header>

        <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <h2 className="text-lg font-medium">Sign in</h2>
          <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
            Enter your email to receive a magic link.
          </p>

          <form
            className="mt-6 flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              setMessage(null);

              startTransition(async () => {
                const { error } = await getSupabaseClient().auth.signInWithOtp({
                  email,
                  options: redirectTo ? { emailRedirectTo: redirectTo } : {},
                });

                if (error) {
                  setMessage(error.message);
                  return;
                }

                setMessage("Check your inbox for the magic link.");
              });
            }}
          >
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Email</span>
              <input
                className="h-11 rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-black dark:focus:border-zinc-600"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
              />
            </label>

            <button
              className="h-11 rounded-lg bg-zinc-950 text-sm font-medium text-white hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-zinc-50 dark:text-zinc-950 dark:hover:bg-zinc-200"
              type="submit"
              disabled={isPending}
            >
              {isPending ? "Sending..." : "Send magic link"}
            </button>

            {message ? (
              <p className="text-sm text-zinc-700 dark:text-zinc-300">
                {message}
              </p>
            ) : null}
          </form>
        </section>
      </main>
    </div>
  );
}
