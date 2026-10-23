import type { Metadata } from "next";
import { Suspense } from "react";
import { JourneyShell } from "@/components/journey/JourneyShell";
import { MoneyPaths } from "@/components/paths/MoneyPaths";

export const metadata: Metadata = { title: "财富研究路径" };

export default function PathsPage() {
  return (
    <JourneyShell>
      <Suspense fallback={<div className="skeleton h-64" />}>
        <MoneyPaths />
      </Suspense>
    </JourneyShell>
  );
}
