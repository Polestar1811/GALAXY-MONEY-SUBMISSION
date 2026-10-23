"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { InvestorProfile, LensId, ProfileFieldKey, ProfileValues } from "@/types/profile";
import { parseProfile } from "./schema";
import { PERSONAS, emptyUserProfile } from "./personas";

export const STORAGE_KEY = "investlens.profile.v1";
const LENS_KEY = "investlens.lens";

interface ProfileStore {
  hydrated: boolean;
  /** 用户自己的画像（Genesis 产出）。默认只在内存中。 */
  userProfile: InvestorProfile | null;
  /** Genesis 进行中的草稿，只在内存中。 */
  genesisDraft: InvestorProfile;
  lens: LensId | null;
  /** 当前参与个性化的画像：虚构画像，或「已确认」的用户画像。 */
  activeProfile: InvestorProfile | null;
  /** 是否检测到本地已保存的数据。 */
  storedLocally: boolean;
  setLens: (l: LensId | null) => void;
  setGenesisDraft: (p: InvestorProfile) => void;
  resetGenesisDraft: () => void;
  commitProfile: (p: InvestorProfile, persist: boolean) => void;
  updateField: <K extends ProfileFieldKey>(key: K, value: ProfileValues[K]) => void;
  removeField: (key: ProfileFieldKey) => void;
  confirmProfile: () => void;
  setConsent: (persist: boolean) => void;
  clearAll: () => void;
  readStored: () => string | null;
}

const Ctx = createContext<ProfileStore | null>(null);

function safeGet(storage: "local" | "session", key: string): string | null {
  try {
    return (storage === "local" ? window.localStorage : window.sessionStorage).getItem(key);
  } catch {
    return null;
  }
}
function safeSet(storage: "local" | "session", key: string, value: string | null) {
  try {
    const s = storage === "local" ? window.localStorage : window.sessionStorage;
    if (value === null) s.removeItem(key);
    else s.setItem(key, value);
  } catch {
    /* 隐私模式或存储被禁用：静默降级为仅内存 */
  }
}

export function ProfileProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [userProfile, setUserProfile] = useState<InvestorProfile | null>(null);
  const [genesisDraft, setGenesisDraft] = useState<InvestorProfile>(emptyUserProfile);
  const [lens, setLensState] = useState<LensId | null>(null);
  const [storedLocally, setStoredLocally] = useState(false);

  // 启动时：只恢复「用户明确同意保存」的画像
  useEffect(() => {
    const raw = safeGet("local", STORAGE_KEY);
    if (raw) {
      try {
        const p = parseProfile(JSON.parse(raw));
        if (p && p.consent.persistLocal) {
          setUserProfile(p);
          setStoredLocally(true);
        } else safeSet("local", STORAGE_KEY, null);
      } catch {
        safeSet("local", STORAGE_KEY, null);
      }
    }
    const l = safeGet("session", LENS_KEY);
    if (l === "A" || l === "B" || l === "self") setLensState(l);
    setHydrated(true);
  }, []);

  const persist = useCallback((p: InvestorProfile | null) => {
    if (p && p.consent.persistLocal) {
      safeSet("local", STORAGE_KEY, JSON.stringify(p));
      setStoredLocally(true);
    } else {
      safeSet("local", STORAGE_KEY, null);
      setStoredLocally(false);
    }
  }, []);

  const setLens = useCallback((l: LensId | null) => {
    setLensState(l);
    safeSet("session", LENS_KEY, l);
  }, []);

  const mutate = useCallback(
    (fn: (p: InvestorProfile) => InvestorProfile) => {
      setUserProfile((prev) => {
        if (!prev) return prev;
        const next = fn(prev);
        persist(next);
        return next;
      });
    },
    [persist],
  );

  const commitProfile = useCallback(
    (p: InvestorProfile, persistLocal: boolean) => {
      const now = new Date().toISOString();
      const next: InvestorProfile = {
        ...p,
        status: "confirmed",
        confirmedAt: now,
        consent: { persistLocal, updatedAt: now },
      };
      setUserProfile(next);
      persist(next);
      setLens("self");
    },
    [persist, setLens],
  );

  const updateField = useCallback(
    <K extends ProfileFieldKey>(key: K, value: ProfileValues[K]) =>
      mutate((p) => ({ ...p, [key]: value, skipped: p.skipped.filter((k) => k !== key), status: "draft" })),
    [mutate],
  );

  const removeField = useCallback(
    (key: ProfileFieldKey) =>
      mutate((p) => {
        const next = { ...p, status: "draft" as const };
        delete next[key];
        return next;
      }),
    [mutate],
  );

  const confirmProfile = useCallback(
    () => mutate((p) => ({ ...p, status: "confirmed", confirmedAt: new Date().toISOString() })),
    [mutate],
  );

  const setConsent = useCallback(
    (persistLocal: boolean) => mutate((p) => ({ ...p, consent: { persistLocal, updatedAt: new Date().toISOString() } })),
    [mutate],
  );

  const clearAll = useCallback(() => {
    setUserProfile(null);
    setGenesisDraft(emptyUserProfile());
    safeSet("local", STORAGE_KEY, null);
    setStoredLocally(false);
    setLens(null);
  }, [setLens]);

  const activeProfile = useMemo<InvestorProfile | null>(() => {
    if (lens === "A" || lens === "B") return PERSONAS[lens];
    if (lens === "self" && userProfile?.status === "confirmed") return userProfile;
    return null;
  }, [lens, userProfile]);

  const value: ProfileStore = {
    hydrated,
    userProfile,
    genesisDraft,
    lens,
    activeProfile,
    storedLocally,
    setLens,
    setGenesisDraft,
    resetGenesisDraft: () => setGenesisDraft(emptyUserProfile()),
    commitProfile,
    updateField,
    removeField,
    confirmProfile,
    setConsent,
    clearAll,
    readStored: () => safeGet("local", STORAGE_KEY),
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useProfile() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useProfile must be used within ProfileProvider");
  return v;
}
