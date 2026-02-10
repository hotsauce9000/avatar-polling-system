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
        setError(sessionError.message);
        return;
      }

      if (!data.session) {
        setError("No active session. Try signing in again.");
        return;
      }

      router.replace("/dashboard");
    }

    run();

    return () => {
      isMounted = false;
    };
  }, [router]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-xl flex-col justify-center gap-4 px-6 py-20">
      <h1 className="text-2xl font-semibold">Signing you in...</h1>
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
    </main>
  );
}
