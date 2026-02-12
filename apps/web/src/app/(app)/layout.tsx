"use client";

import type { User } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";

import { AppSidebar } from "@/components/AppSidebar";
import { getSupabaseClient } from "@/lib/supabase/client";

function setSessionCookie(active: boolean) {
  if (typeof document === "undefined") return;
  if (active) {
    document.cookie = "aps_session=1; Path=/; Max-Age=2592000; SameSite=Lax";
    return;
  }
  document.cookie = "aps_session=; Path=/; Max-Age=0; SameSite=Lax";
}

export default function AppLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  const router = useRouter();
  const [isReady, setIsReady] = useState(false);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let mounted = true;

    async function ensureSession() {
      const { data, error } = await getSupabaseClient().auth.getUser();
      if (!mounted) return;

      if (error || !data.user) {
        setSessionCookie(false);
        router.replace("/");
        return;
      }

      setSessionCookie(true);
      setUser(data.user);
      setIsReady(true);
    }

    ensureSession();

    const { data: authListener } = getSupabaseClient().auth.onAuthStateChange(
      (_event, session) => {
        if (session?.user) {
          setSessionCookie(true);
          setUser(session.user);
          setIsReady(true);
          return;
        }
        setSessionCookie(false);
        setUser(null);
        router.replace("/");
      },
    );

    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [router]);

  if (!isReady) {
    return (
      <div className="flex h-dvh items-center justify-center bg-zinc-50 text-sm text-zinc-600 dark:bg-black dark:text-zinc-400">
        Loading workspace...
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-zinc-50 text-zinc-950 dark:bg-black dark:text-zinc-50">
      <AppSidebar userEmail={user?.email} />
      <div className="md:ml-60">
        <main className="mx-auto w-full max-w-6xl px-4 pb-16 pt-20 md:px-6 md:pt-8">
          {children}
        </main>
      </div>
    </div>
  );
}
