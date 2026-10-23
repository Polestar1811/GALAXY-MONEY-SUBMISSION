import type { Metadata } from "next";
import { ProfileManager } from "@/components/profile/ProfileManager";

export const metadata: Metadata = { title: "画像与隐私" };

export default function ProfilePage() {
  return <ProfileManager />;
}
