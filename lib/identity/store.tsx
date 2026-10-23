"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { FactKey, IdentityNarrative, IdentityProfile, InterviewState, PathsResult } from "@/types/identity";
import { applySkip, editFact, finishEarly, newInterview, reviewInference, rewind } from "@/lib/interview/engine";
import { useProfile } from "@/lib/profile/store";
import { v2api, V2Error } from "@/lib/client/v2";
import { identityProfileSchema, interviewStateSchema } from "@/lib/v2/schemas";
import { toLegacyProfile } from "./dimensions";
import { DEMO_IDENTITIES } from "./demo";

/**
 * V2 画像状态（客户端）。
 * - 访谈与画像默认只保存在页面内存中；关闭页面即消失；
 * - 只有用户明确选择「仅保存在此设备」才写入 localStorage（键 galaxy.identity.v2），可随时一键清除；
 * - 服务端不存储任何访谈内容或画像。
 */
export const IDENTITY_STORAGE_KEY = "galaxy.identity.v2";
/** 访谈进度的本设备临时保存：只有用户主动开启才写入，24 小时后自动删除。 */
export const INTERVIEW_DRAFT_KEY = "galaxy.interview.v2.draft";
export const INTERVIEW_DRAFT_TTL_MS = 24 * 3600_000;

export interface DraftInfo {
  savedAt: number;
  questions: number;
}

function draftStorage(op: "get" | "set" | "remove", value?: string): string | null {
  try {
    if (op === "get") return window.localStorage.getItem(INTERVIEW_DRAFT_KEY);
    if (op === "set") window.localStorage.setItem(INTERVIEW_DRAFT_KEY, value!);
    else window.localStorage.removeItem(INTERVIEW_DRAFT_KEY);
  } catch {
    /* 存储不可用：不保存 */
  }
  return null;
}

export type IdentitySource = { kind: "user" } | { kind: "demo"; id: "A" | "B" };

interface TurnStatus {
  pending: boolean;
  error: string | null;
  /** 最近一轮是否因模型不可用而只记录了选项。 */
  fallback: string | null;
}

interface IdentityStore {
  hydrated: boolean;
  interview: InterviewState | null;
  turn: TurnStatus;
  /** 用户自己的画像（访谈生成，可编辑；确认后才进入研究阶段）。 */
  identity: IdentityProfile | null;
  /** 当前在看的画像：用户自己的，或某位虚构用户。 */
  source: IdentitySource;
  active: IdentityProfile | null;
  persistLocal: boolean;
  narratives: Record<string, IdentityNarrative>;
  paths: Record<string, PathsResult>;
  startInterview: () => void;
  answer: (text: string, choice: string | null) => Promise<void>;
  skip: () => void;
  back: () => void;
  finish: () => void;
  buildIdentity: () => IdentityProfile | null;
  useDemo: (id: "A" | "B") => void;
  useSelf: () => void;
  setFact: (key: FactKey, value: string | null) => void;
  review: (inferenceId: string, accept: boolean) => void;
  confirm: (persist: boolean) => void;
  clear: () => void;
  cacheKey: (p: IdentityProfile) => string;
  setNarrative: (key: string, n: IdentityNarrative) => void;
  setPaths: (key: string, p: PathsResult) => void;
  /** 用户是否开启了「在本设备临时保存访谈进度」。 */
  draftConsent: boolean;
  setDraftConsent: (on: boolean) => void;
  /** 本设备上发现的、尚未恢复的访谈进度（不会自动恢复）。 */
  savedDraft: DraftInfo | null;
  restoreDraft: () => void;
  discardDraft: () => void;
}

const Ctx = createContext<IdentityStore | null>(null);

function safeLocal(op: "get" | "set" | "remove", value?: string): string | null {
  try {
    if (op === "get") return window.localStorage.getItem(IDENTITY_STORAGE_KEY);
    if (op === "set") window.localStorage.setItem(IDENTITY_STORAGE_KEY, value!);
    else window.localStorage.removeItem(IDENTITY_STORAGE_KEY);
  } catch {
    /* 隐私模式或存储被禁用：只保存在内存中 */
  }
  return null;
}

export function IdentityProvider({ children }: { children: ReactNode }) {
  const legacy = useProfile();
  const [hydrated, setHydrated] = useState(false);
  const [interview, setInterview] = useState<InterviewState | null>(null);
  const [turn, setTurn] = useState<TurnStatus>({ pending: false, error: null, fallback: null });
  const [identity, setIdentity] = useState<IdentityProfile | null>(null);
  const [source, setSource] = useState<IdentitySource>({ kind: "user" });
  const [persistLocal, setPersistLocal] = useState(false);
  const [narratives, setNarratives] = useState<Record<string, IdentityNarrative>>({});
  const [paths, setPathsState] = useState<Record<string, PathsResult>>({});
  const inflight = useRef<AbortController | null>(null);
  const [draftConsent, setDraftConsentState] = useState(false);
  const [savedDraft, setSavedDraft] = useState<DraftInfo | null>(null);
  const draftState = useRef<InterviewState | null>(null);

  // 发现本设备上的访谈进度：校验格式与有效期，只提示，不自动恢复
  useEffect(() => {
    const raw = draftStorage("get");
    if (!raw) return;
    try {
      const d = JSON.parse(raw) as { savedAt: number; state: unknown };
      const parsed = interviewStateSchema.safeParse(d.state);
      if (!parsed.success || typeof d.savedAt !== "number" || Date.now() - d.savedAt > INTERVIEW_DRAFT_TTL_MS) {
        draftStorage("remove");
        return;
      }
      draftState.current = parsed.data as InterviewState;
      setSavedDraft({ savedAt: d.savedAt, questions: parsed.data.turns.length });
    } catch {
      draftStorage("remove");
    }
  }, []);

  // 开启后，每次访谈状态变化时更新本设备上的进度
  useEffect(() => {
    if (draftConsent && interview) draftStorage("set", JSON.stringify({ savedAt: Date.now(), state: interview }));
  }, [draftConsent, interview]);

  const setDraftConsent = useCallback(
    (on: boolean) => {
      setDraftConsentState(on);
      if (!on) draftStorage("remove");
      else if (interview) draftStorage("set", JSON.stringify({ savedAt: Date.now(), state: interview }));
    },
    [interview],
  );

  useEffect(() => {
    const raw = safeLocal("get");
    if (raw) {
      try {
        const p = identityProfileSchema.safeParse(JSON.parse(raw));
        if (p.success && p.data.confirmed) {
          setIdentity(p.data as IdentityProfile);
          setPersistLocal(true);
        } else safeLocal("remove");
      } catch {
        safeLocal("remove");
      }
    }
    setHydrated(true);
  }, []);

  const startInterview = useCallback(() => {
    setInterview(newInterview());
    setTurn({ pending: false, error: null, fallback: null });
    setSource({ kind: "user" });
  }, []);

  const answer = useCallback(
    async (text: string, choice: string | null) => {
      if (!interview || turn.pending) return;
      inflight.current?.abort();
      const ctrl = new AbortController();
      inflight.current = ctrl;
      setTurn({ pending: true, error: null, fallback: null });
      try {
        const r = await v2api.interviewTurn(interview, { text, choice }, ctrl.signal);
        setInterview(r.state);
        const fb = r.ai === "fallback" && text.trim() ? (r.llmError === "NOT_CONFIGURED" ? "当前环境未配置大模型" : "大模型暂时不可用") : null;
        setTurn({ pending: false, error: null, fallback: fb });
      } catch (e) {
        // 失败时不改变已有的访谈状态，用户可以重试
        if (e instanceof V2Error && e.code === "CANCELLED") return setTurn({ pending: false, error: null, fallback: null });
        setTurn({ pending: false, error: e instanceof Error ? e.message : "请求失败", fallback: null });
      }
    },
    [interview, turn.pending],
  );

  const skip = useCallback(() => setInterview((s) => (s ? applySkip(s) : s)), []);
  const back = useCallback(() => setInterview((s) => (s ? rewind(s) : s)), []);
  const finish = useCallback(() => setInterview((s) => (s ? finishEarly(s) : s)), []);

  const buildIdentity = useCallback(() => {
    if (!interview) return null;
    const p: IdentityProfile = {
      facts: interview.facts,
      inferences: interview.inferences,
      skipped: interview.skipped,
      contradictions: interview.contradictions,
      kind: "user",
      label: "我的投资人格",
      confirmed: false,
      confirmedAt: null,
    };
    setIdentity(p);
    setSource({ kind: "user" });
    return p;
  }, [interview]);

  const persistIfAllowed = useCallback(
    (p: IdentityProfile | null, allow: boolean) => {
      if (p && allow && p.confirmed) safeLocal("set", JSON.stringify(p));
      else safeLocal("remove");
    },
    [],
  );

  const mutateIdentity = useCallback(
    (fn: (p: IdentityProfile) => IdentityProfile) => {
      setIdentity((prev) => {
        if (!prev) return prev;
        // 用户修改后需要重新确认，才进入研究阶段
        const next = { ...fn(prev), confirmed: false, confirmedAt: null };
        persistIfAllowed(null, false);
        return next;
      });
    },
    [persistIfAllowed],
  );

  const setFact = useCallback((key: FactKey, value: string | null) => mutateIdentity((p) => ({ ...p, ...editFact(p, key, value) })), [mutateIdentity]);
  const review = useCallback((id: string, accept: boolean) => mutateIdentity((p) => ({ ...p, ...reviewInference(p, id, accept) })), [mutateIdentity]);

  const confirm = useCallback(
    (persist: boolean) => {
      if (!identity) return;
      const next: IdentityProfile = { ...identity, confirmed: true, confirmedAt: new Date().toISOString() };
      setIdentity(next);
      persistIfAllowed(next, persist);
      // 画像确认后，访谈进度不再需要
      draftStorage("remove");
      setDraftConsentState(false);
      // 同步到 InvestLens 原有画像，专业研究工作台的个性化与 AI Agent 直接使用
      legacy.commitProfile(toLegacyProfile(next, persist), persist);
      setPersistLocal(persist);
    },
    [identity, legacy, persistIfAllowed],
  );

  const clear = useCallback(() => {
    inflight.current?.abort();
    setInterview(null);
    setIdentity(null);
    setNarratives({});
    setPathsState({});
    setPersistLocal(false);
    setSource({ kind: "user" });
    safeLocal("remove");
    draftStorage("remove");
    setDraftConsentState(false);
    setSavedDraft(null);
    draftState.current = null;
    legacy.clearAll();
  }, [legacy]);

  const active = useMemo(() => (source.kind === "demo" ? DEMO_IDENTITIES[source.id] : identity), [source, identity]);

  const value: IdentityStore = {
    hydrated,
    interview,
    turn,
    identity,
    source,
    active,
    persistLocal,
    narratives,
    paths,
    startInterview,
    answer,
    skip,
    back,
    finish,
    buildIdentity,
    useDemo: (id) => {
      setSource({ kind: "demo", id });
      legacy.setLens(id);
    },
    useSelf: () => setSource({ kind: "user" }),
    setFact,
    review,
    confirm,
    clear,
    cacheKey: (p) => JSON.stringify([p.kind, p.label, p.facts, p.inferences.map((i) => [i.id, i.status]), p.skipped]),
    setNarrative: (k, n) => setNarratives((m) => ({ ...m, [k]: n })),
    setPaths: (k, p) => setPathsState((m) => ({ ...m, [k]: p })),
    draftConsent,
    setDraftConsent,
    savedDraft,
    restoreDraft: () => {
      if (!draftState.current) return;
      setInterview(draftState.current);
      setSource({ kind: "user" });
      // 恢复即表示用户希望继续临时保存
      setDraftConsentState(true);
      setSavedDraft(null);
    },
    discardDraft: () => {
      draftStorage("remove");
      draftState.current = null;
      setSavedDraft(null);
      setDraftConsentState(false);
    },
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useIdentity() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useIdentity must be used within IdentityProvider");
  return v;
}
