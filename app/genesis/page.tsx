import type { Metadata } from "next";
import { InterviewFlow } from "@/components/genesis/InterviewFlow";
import { JourneyShell } from "@/components/journey/JourneyShell";

export const metadata: Metadata = { title: "Genesis · 先认识一下你" };

export default function GenesisPage() {
  return (
    <JourneyShell wide>
      <InterviewFlow />
    </JourneyShell>
  );
}
