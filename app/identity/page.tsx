import type { Metadata } from "next";
import { Suspense } from "react";
import { IdentityReport } from "@/components/identity/IdentityReport";
import { JourneyShell } from "@/components/journey/JourneyShell";

export const metadata: Metadata = { title: "投资人格 · 我们对你的理解" };

export default function IdentityPage() {
  return (
    <JourneyShell>
      <Suspense fallback={<div className="skeleton h-64" />}>
        <IdentityReport />
      </Suspense>
    </JourneyShell>
  );
}
