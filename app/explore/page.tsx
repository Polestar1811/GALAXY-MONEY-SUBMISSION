import type { Metadata } from "next";
import { Suspense } from "react";
import { PortfolioExplorer } from "@/components/explore/PortfolioExplorer";
import { JourneyShell } from "@/components/journey/JourneyShell";

export const metadata: Metadata = { title: "组合探索" };

export default function ExplorePage() {
  return (
    <JourneyShell wide>
      <Suspense fallback={<div className="skeleton h-64" />}>
        <PortfolioExplorer />
      </Suspense>
    </JourneyShell>
  );
}
