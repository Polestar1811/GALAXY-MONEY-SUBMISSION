import type { Metadata } from "next";
import { DesignSystem } from "@/components/design/DesignSystem";

export const metadata: Metadata = { title: "设计系统" };

export default function DesignPage() {
  return <DesignSystem />;
}
