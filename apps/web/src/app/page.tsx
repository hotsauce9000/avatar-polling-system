"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { getSupabaseClient } from "@/lib/supabase/client";

const RESERVED_TEST_EMAIL_DOMAINS = new Set(["example.com", "example.net", "example.org"]);

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function usesReservedDomain(value: string): boolean {
  const at = value.lastIndexOf("@");
  if (at < 0) return false;
  const domain = value.slice(at + 1);
  return RESERVED_TEST_EMAIL_DOMAINS.has(domain);
}

export default function Home() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const redirectTo = useMemo(() => {
    if (typeof window === "undefined") return undefined;
    return `${window.location.origin}/auth/callback`;
  }, []);

  useEffect(() => {
    let mounted = true;

    async function redirectAuthedUsers() {
      const { data } = await getSupabaseClient().auth.getSession();
      if (!mounted || !data.session) return;
      document.cookie = "aps_session=1; Path=/; Max-Age=2592000; SameSite=Lax";
      router.replace("/dashboard");
    }

    redirectAuthedUsers();

    return () => {
      mounted = false;
    };
  }, [router]);

  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-950 dark:bg-black dark:text-zinc-50">
      <main className="mx-auto flex w-full max-w-4xl flex-col gap-10 px-6 py-20">
        <header className="space-y-4">
          <h1 className="bg-gradient-to-r from-violet-700 to-violet-500 bg-clip-text text-4xl font-semibold tracking-tight text-transparent dark:from-violet-300 dark:to-violet-500">
            Avatar-Based Amazon Listing Optimizer
          </h1>
          <p className="max-w-2xl text-zinc-600 dark:text-zinc-400">
            Compare two ASINs in realtime, then get a winner with evidence,
            confidence, and buyer-avatar explanations.
          </p>
          <div className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-3 py-1 text-xs text-violet-700 dark:border-violet-900 dark:bg-violet-950/30 dark:text-violet-300">
            Built for fast listing iteration and clear next actions.
          </div>
        </header>

        <section className="grid gap-3 md:grid-cols-3">
          {[
            {
              title: "1. Compare",
              body: "Paste two ASINs or Amazon URLs and launch the run.",
            },
            {
              title: "2. Watch stages",
              body: "See listing fetch, image scoring, text scoring, and avatars.",
            },
            {
              title: "3. Improve",
              body: "Use prioritized fixes, save experiments, and iterate quickly.",
            },
          ].map((step) => (
            <article
              key={step.title}
              className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-transform duration-200 hover:-translate-y-0.5 dark:border-zinc-800 dark:bg-zinc-950"
            >
              <h2 className="text-sm font-semibold">
                <span className="text-violet-600 dark:text-violet-400">{step.title.slice(0, 2)}</span>{" "}
                {step.title.slice(2)}
              </h2>
              <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                {step.body}
              </p>
            </article>
          ))}
        </section>

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
                const normalizedEmail = normalizeEmail(email);

                if (usesReservedDomain(normalizedEmail)) {
                  setMessage("Use a real inbox domain. Reserved example.com addresses cannot receive magic links.");
                  return;
                }

                const { error } = await getSupabaseClient().auth.signInWithOtp({
                  email: normalizedEmail,
                  options: redirectTo ? { emailRedirectTo: redirectTo } : {},
                });

                if (error) {
                  const lowerMessage = error.message.toLowerCase();
                  if (lowerMessage.includes("invalid") && lowerMessage.includes("email")) {
                    setMessage(
                      "Sign-in failed: this email was rejected by the auth provider. Check formatting and use a deliverable inbox.",
                    );
                    return;
                  }
                  setMessage(`Sign-in failed: ${error.message}`);
                  return;
                }

                setMessage("Check your inbox for the magic link.");
              });
            }}
          >
            <label className="flex flex-col gap-1">
              <span className="text-sm font-medium">Email</span>
              <input
                className="h-10 rounded-lg border border-zinc-200 bg-white px-3 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500 dark:border-zinc-800 dark:bg-black"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
              />
            </label>

            <button
              className="h-10 rounded-lg bg-violet-600 text-sm font-medium text-white transition-colors hover:bg-violet-700 focus:ring-2 focus:ring-violet-500 disabled:cursor-not-allowed disabled:opacity-50 dark:bg-violet-500 dark:hover:bg-violet-400"
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
