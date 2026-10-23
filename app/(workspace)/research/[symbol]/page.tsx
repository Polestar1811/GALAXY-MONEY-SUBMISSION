import type { Metadata } from "next";
import { Suspense } from "react";
import { ResearchWorkspace } from "@/components/research/ResearchWorkspace";
import { PanelSkeleton } from "@/components/ui/states";

export async function generateMetadata({ params }: { params: Promise<{ symbol: string }> }): Promise<Metadata> {
  const { symbol } = await params;
  return { title: `研究 ${decodeURIComponent(symbol)}` };
}

export default async function ResearchPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  return (
    <Suspense fallback={<PanelSkeleton rows={6} className="mx-auto max-w-[1360px]" />}>
      <ResearchWorkspace symbol={decodeURIComponent(symbol).toUpperCase()} />
    </Suspense>
  );
}
