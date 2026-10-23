"use client";

import { MotionConfig } from "motion/react";
import type { ReactNode } from "react";
import { ProfileProvider } from "@/lib/profile/store";
import { IdentityProvider } from "@/lib/identity/store";
import { ToastProvider } from "@/components/ui/toast";
import { TooltipProvider } from "@/components/ui/primitives";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <TooltipProvider delayDuration={150}>
        <ProfileProvider>
          <IdentityProvider>
            <ToastProvider>{children}</ToastProvider>
          </IdentityProvider>
        </ProfileProvider>
      </TooltipProvider>
    </MotionConfig>
  );
}
