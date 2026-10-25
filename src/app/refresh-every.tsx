"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Polling, bis der Live-Fortschritt per SSE kommt. */
export function RefreshEvery({ ms }: { ms: number }) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => router.refresh(), ms);
    return () => clearInterval(timer);
  }, [router, ms]);
  return null;
}
