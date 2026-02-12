"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { ComponentType } from "react";
import { usePathname, useRouter } from "next/navigation";
import { FlaskConical, LayoutDashboard, LogOut, Menu, X } from "lucide-react";

import { getSupabaseClient } from "@/lib/supabase/client";

type AppSidebarProps = {
  userEmail?: string | null;
};

type NavItem = {
  href: "/dashboard" | "/experiments";
  label: string;
  icon: ComponentType<{ className?: string }>;
};

const NAV_ITEMS: NavItem[] = [
  {
    href: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    href: "/experiments",
    label: "Experiments",
    icon: FlaskConical,
  },
];

function setSessionCookie(active: boolean) {
  if (typeof document === "undefined") return;
  if (active) {
    document.cookie = "aps_session=1; Path=/; Max-Age=2592000; SameSite=Lax";
    return;
  }
  document.cookie = "aps_session=; Path=/; Max-Age=0; SameSite=Lax";
}

function itemIsActive(pathname: string, href: string): boolean {
  if (href === "/dashboard" && pathname.startsWith("/jobs/")) return true;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppSidebar(props: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const [openAtPath, setOpenAtPath] = useState<string | null>(null);
  const isOpen = openAtPath === pathname;

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenAtPath(null);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  async function handleSignOut() {
    setSessionCookie(false);
    setOpenAtPath(null);
    await getSupabaseClient().auth.signOut();
    router.replace("/");
  }

  function toggleMenu() {
    setOpenAtPath((current) => (current === pathname ? null : pathname));
  }

  function closeMenu() {
    setOpenAtPath(null);
  }

  return (
    <>
      <button
        aria-expanded={isOpen}
        aria-label={isOpen ? "Close navigation menu" : "Open navigation menu"}
        className="fixed left-4 top-4 z-50 flex h-10 w-10 items-center justify-center rounded-lg border border-zinc-200 bg-white text-zinc-700 transition-colors hover:bg-zinc-100 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900 md:hidden"
        onClick={toggleMenu}
        type="button"
      >
        {isOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
      </button>

      {isOpen ? (
        <button
          aria-label="Close sidebar overlay"
          className="fixed inset-0 z-30 bg-black/40 md:hidden"
          onClick={closeMenu}
          type="button"
        />
      ) : null}

      <aside
        className={`fixed inset-y-0 left-0 z-40 flex h-dvh w-60 flex-col border-r border-zinc-200 bg-zinc-50 text-zinc-900 transition-transform duration-200 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-100 ${
          isOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        <div className="flex h-16 items-center border-b border-zinc-200 px-4 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300">
              A
            </span>
            <div className="space-y-0.5">
              <p className="text-sm font-semibold">Avatar Polling</p>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">Internal SaaS</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-3" role="navigation" aria-label="Main">
          <ul className="space-y-1">
            {NAV_ITEMS.map((item) => {
              const active = itemIsActive(pathname, item.href);
              const ItemIcon = item.icon;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`flex h-10 items-center gap-3 rounded-r-lg border-l-2 border-transparent px-3 text-sm font-medium transition-colors ${
                      active
                        ? "border-violet-600 bg-violet-50 text-violet-700 dark:border-violet-400 dark:bg-violet-950/30 dark:text-violet-300"
                        : "text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-900"
                    }`}
                  >
                    <ItemIcon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="border-t border-zinc-200 p-3 dark:border-zinc-800">
          <p className="mb-2 truncate text-xs text-zinc-500 dark:text-zinc-400">
            {props.userEmail ?? "Signed in"}
          </p>
          <button
            className="flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-zinc-200 bg-white text-sm font-medium transition-colors hover:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:hover:bg-zinc-800"
            onClick={handleSignOut}
            type="button"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      </aside>
    </>
  );
}
