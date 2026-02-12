"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { getSupabaseClient } from "@/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function run() {
      const { data, error: sessionError } = await getSupabaseClient().auth.getSession();

      if (!isMounted) return;

      if (sessionError) {
        document.cookie = "aps_session=; Path=/; Max-Age=0; SameSite=Lax";
        setError(sessionError.message);
        return;
      }

      if (!data.session) {
        document.cookie = "aps_session=; Path=/; Max-Age=0; SameSite=Lax";
        setError("No active session. Try signing in again.");
        return;
      }

      document.cookie = "aps_session=1; Path=/; Max-Age=2592000; SameSite=Lax";
      router.replace("/dashboard");
    }

    run();

    return () => {
      isMounted = false;
    };
  }, [router]);

  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-950 dark:bg-black dark:text-zinc-50">
      <main className="mx-auto flex min-h-dvh w-full max-w-xl flex-col justify-center gap-4 px-6 py-20">
        <h1 className="text-2xl font-semibold">Signing you in...</h1>
        {error ? <p className="text-sm text-red-600 dark:text-red-400">{error}</p> : null}
      </main>
    </div>
  );
}
