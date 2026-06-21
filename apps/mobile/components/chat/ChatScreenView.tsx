// FILE: /apps/mobile/components/chat/ChatScreenView.tsx

import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  Platform,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Keyboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as Haptics from "expo-haptics";
import Markdown from "react-native-markdown-display";
import EventSource from "react-native-sse";
import { router, useLocalSearchParams } from "expo-router";
import {
  useAuthStore,
  useChatStore,
  useDocumentStore,
  deriveTitle,
} from "@docchat/stores";
import type { ChatMessage, SSEEvent } from "@docchat/types";
import { TypingIndicator } from "../documents/TypingIndicator";
import { ChatSidebar } from "./ChatSidebar";
import { SuggestedQuestions } from "./SuggestedQuestions";

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function findOrBuildSessionId(documentId: string): string {
  const { sessions } = useChatStore.getState();
  const existing = Object.values(sessions).find(
    (s) => s.documentId === documentId && s.messages.length === 0,
  );
  return (
    existing?.id ??
    `session_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  );
}

function isLocalTempId(id: string): boolean {
  return id.startsWith("session_");
}

// ─── Citation parser ──────────────────────────────────────────────────────────

interface ParsedCitation {
  index: number;
  filename: string;
  page: string;
}

const DOC_CITATION_RE = /\[Doc:\s*([^\],]+?),\s*(p\.[\d–\-,\s]+?)\]/g;

function parseCitations(content: string): {
  cleanContent: string;
  citations: ParsedCitation[];
} {
  const citations: ParsedCitation[] = [];
  let cleanContent = "";
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let idx = 1;

  DOC_CITATION_RE.lastIndex = 0;
  while ((match = DOC_CITATION_RE.exec(content)) !== null) {
    cleanContent += content.slice(lastIndex, match.index);
    cleanContent += superscriptNum(idx);
    citations.push({
      index: idx,
      filename: match[1].trim(),
      page: match[2].trim(),
    });
    lastIndex = match.index + match[0].length;
    idx++;
  }
  cleanContent += content.slice(lastIndex);
  return { cleanContent, citations };
}

const SUPERSCRIPTS: Record<number, string> = {
  1: "¹",
  2: "²",
  3: "³",
  4: "⁴",
  5: "⁵",
  6: "⁶",
  7: "⁷",
  8: "⁸",
  9: "⁹",
};
function superscriptNum(n: number): string {
  return SUPERSCRIPTS[n] ?? `[${n}]`;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ChatScreenView() {
  const params = useLocalSearchParams<{ documentId: string }>();
  const documentId = Array.isArray(params.documentId)
    ? params.documentId[0]
    : params.documentId;

  const authSession = useAuthStore((s) => s.session);
  const getDocById = useDocumentStore((s) => s.getDocumentById);
  const doc = getDocById(documentId);

  const fetchSessions = useChatStore((s) => s.fetchSessions);
  const loadHistory = useChatStore((s) => s.loadHistory);
  const requestNewChat = useChatStore((s) => s.requestNewChat);
  const storeSetActiveSession = useChatStore((s) => s.setActiveSession);

  const [activeSessionId, setActiveSessionId] = useState<string>(() =>
    findOrBuildSessionId(documentId),
  );
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ── NEW: track when we're fetching history for a selected older session ──
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);

  useEffect(() => {
    const store = useChatStore.getState();
    if (!store.sessions[activeSessionId]) {
      useChatStore.setState((state) => ({
        ...state,
        sessions: {
          ...state.sessions,
          [activeSessionId]: {
            id: activeSessionId,
            userId: "",
            documentId,
            title: "New Chat",
            messages: [],
            createdAt: new Date().toISOString(),
            isLoaded: true,
          },
        },
      }));
    }
    store.setActiveSession(activeSessionId);
    fetchSessions(documentId);
    return () => {
      esRef.current?.close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const [messages, setMessages] = useState<ChatMessage[]>(
    () => useChatStore.getState().sessions[activeSessionId]?.messages ?? [],
  );

  useEffect(() => {
    setMessages(
      useChatStore.getState().sessions[activeSessionId]?.messages ?? [],
    );
    const unsub = useChatStore.subscribe((state) => {
      const msgs = state.sessions[activeSessionId]?.messages;
      if (msgs !== undefined) {
        setMessages((prev) => (prev === msgs ? prev : msgs));
      }
    });
    return unsub;
  }, [activeSessionId]);

  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMsgId, setStreamingMsgId] = useState<string | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const inputRef = useRef<TextInput>(null);
  const resolvedSessionIdRef = useRef<string>(activeSessionId);

  const reversedMsgs = [...messages].reverse();
  const isEmpty = messages.length === 0;

  // ─── Session selection ────────────────────────────────────────────────────
  //
  // Switches to the selected session immediately so the header/sidebar
  // reflect the correct context, then loads history in the background.
  // isLoadingHistory gates what we show in the chat body while the fetch
  // is in flight — spinner instead of SuggestedQuestions.

  const handleSelectSession = useCallback(
    async (id: string) => {
      if (isStreaming) return;
      esRef.current?.close();
      setIsStreaming(false);
      setStreamingMsgId(null);
      setSending(false);

      // Determine whether this session needs a server round-trip before
      // switching. Stubs fetched from the sessions list have isLoaded = false.
      const sessionInStore = useChatStore.getState().sessions[id];
      const needsFetch = !sessionInStore?.isLoaded;

      if (needsFetch) {
        setIsLoadingHistory(true);
      }

      // Flip the active session immediately — the header, input bar, and
      // sidebar close all respond right away. The body shows a spinner if
      // needsFetch, otherwise shows whatever messages are already in the store.
      storeSetActiveSession(id);
      setActiveSessionId(id);
      setSidebarOpen(false);

      // Fetch history (no-op when isLoaded is already true).
      try {
        await loadHistory(id);
      } finally {
        setIsLoadingHistory(false);
      }
    },
    [isStreaming, loadHistory, storeSetActiveSession],
  );

  // ─── New chat ─────────────────────────────────────────────────────────────
  //
  // Clear any pending history load state — the new session is always a fresh
  // local stub with isLoaded = true, so the body should show SuggestedQuestions.

  const handleNewChat = useCallback(() => {
    if (isStreaming) return;
    setIsLoadingHistory(false);
    const id = requestNewChat(documentId);
    storeSetActiveSession(id);
    setActiveSessionId(id);
    setSidebarOpen(false);
  }, [isStreaming, requestNewChat, documentId, storeSetActiveSession]);

  // ─── Send ─────────────────────────────────────────────────────────────────

  const handleSend = useCallback(
    async (overrideText?: string) => {
      const trimmed = (overrideText ?? input).trim();
      if (!trimmed || isStreaming) return;

      setInput("");
      Keyboard.dismiss();
      setSending(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      const sendSessionId = activeSessionId;
      resolvedSessionIdRef.current = sendSessionId;

      const now = new Date().toISOString();
      const userMsgId = `msg_${Date.now()}`;
      const asstMsgId = `msg_${Date.now() + 1}`;

      useChatStore.setState((state) => {
        const sess = state.sessions[sendSessionId];
        if (!sess) return state;

        // This is the first message in the session → derive and apply a
        // title locally, the same way chatStore.sendMessage() does for the
        // web path. Without this, sessions created from this screen kept
        // their initial "New Chat" title forever: this component streams
        // via its own EventSource implementation instead of going through
        // sendMessage(), so it never ran the title-deriving logic, and the
        // sidebar's session-list merge intentionally never overwrites a
        // session it already has locally (to avoid clobbering loaded
        // messages) — so the placeholder title was never corrected either.
        const isFirstMessage = sess.messages.length === 0;

        return {
          ...state,
          isStreaming: true,
          streamingMessageId: asstMsgId,
          sessions: {
            ...state.sessions,
            [sendSessionId]: {
              ...sess,
              title: isFirstMessage ? deriveTitle(trimmed) : sess.title,
              messages: [
                ...sess.messages,
                {
                  id: userMsgId,
                  sessionId: sendSessionId,
                  userId: "local",
                  role: "user" as const,
                  content: trimmed,
                  createdAt: now,
                },
                {
                  id: asstMsgId,
                  sessionId: sendSessionId,
                  userId: "local",
                  role: "assistant" as const,
                  content: "",
                  createdAt: now,
                },
              ],
            },
          },
        };
      });

      setIsStreaming(true);
      setStreamingMsgId(asstMsgId);

      const authToken = authSession?.access_token;
      const es = new EventSource(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        },
        body: JSON.stringify({
          sessionId: isLocalTempId(sendSessionId) ? null : sendSessionId,
          content: trimmed,
          documentId,
        }),
        pollingInterval: 0,
      });
      esRef.current = es;

      const finalize = () => {
        setIsStreaming(false);
        setStreamingMsgId(null);
        setSending(false);
        useChatStore.setState((s) => ({
          ...s,
          isStreaming: false,
          streamingMessageId: null,
        }));
        es.close();
      };

      es.addEventListener("message", (event: any) => {
        try {
          if (!event.data || event.data === "[DONE]") return;
          const data = JSON.parse(event.data) as SSEEvent;
          switch (data.type) {
            case "start": {
              if (
                data.sessionId &&
                data.sessionId !== resolvedSessionIdRef.current
              ) {
                const prevId = resolvedSessionIdRef.current;
                const nextId = data.sessionId;
                resolvedSessionIdRef.current = nextId;
                useChatStore.setState((state) => {
                  const existing = state.sessions[prevId];
                  if (!existing) return state;
                  const next = { ...state.sessions };
                  // `existing` already carries the optimistic title set
                  // above (or the session's prior title, for follow-up
                  // messages), so it survives this rename intact. The
                  // sidebar's fetchSessions() will later sync it against
                  // the DB-confirmed title as a defense-in-depth pass.
                  next[nextId] = { ...existing, id: nextId, isLoaded: true };
                  delete next[prevId];
                  return { ...state, sessions: next, activeSessionId: nextId };
                });
                setActiveSessionId(nextId);
              }
              break;
            }
            case "token": {
              const targetId = resolvedSessionIdRef.current;
              useChatStore.setState((state) => {
                const sess = state.sessions[targetId];
                if (!sess) return state;
                return {
                  ...state,
                  sessions: {
                    ...state.sessions,
                    [targetId]: {
                      ...sess,
                      messages: sess.messages.map((m) =>
                        m.id === asstMsgId
                          ? { ...m, content: m.content + data.content }
                          : m,
                      ),
                    },
                  },
                };
              });
              break;
            }
            case "sources": {
              const targetId = resolvedSessionIdRef.current;
              useChatStore.setState((state) => {
                const sess = state.sessions[targetId];
                if (!sess) return state;
                return {
                  ...state,
                  sessions: {
                    ...state.sessions,
                    [targetId]: {
                      ...sess,
                      messages: sess.messages.map((m) =>
                        m.id === asstMsgId
                          ? { ...m, sources: data.sources }
                          : m,
                      ),
                    },
                  },
                };
              });
              break;
            }
            case "done":
              finalize();
              break;
            case "error":
              finalize();
              break;
          }
        } catch {
          /* Malformed SSE frame — skip */
        }
      });
      es.addEventListener("error", () => finalize());
    },
    [input, isStreaming, activeSessionId, documentId, authSession],
  );

  const handleSuggestedQuestion = useCallback(
    (question: string) => {
      handleSend(question);
    },
    [handleSend],
  );

  const docDisplayName = doc?.name
    ? decodeURIComponent(doc.name)
        .replace(/\.[^/.]+$/, "")
        .replace(/_/g, " ")
    : "Document";

  // ── Message renderer ──────────────────────────────────────────────────────

  function renderMessage({ item }: { item: ChatMessage }) {
    const isUser = item.role === "user";
    const isThisStreaming = isStreaming && item.id === streamingMsgId;

    if (isUser) {
      return (
        <View style={s.bubbleWrapUser}>
          <View style={s.bubbleUser}>
            <Text style={s.bubbleTextUser}>{item.content}</Text>
          </View>
        </View>
      );
    }

    const { cleanContent, citations } = parseCitations(item.content ?? "");

    return (
      <View style={s.bubbleWrapAssistant}>
        <View style={s.aiAvatar}>
          <Text style={s.aiAvatarText}>AI</Text>
        </View>
        <View style={s.assistantColumn}>
          <View style={s.bubbleAssistant}>
            {isThisStreaming && item.content === "" ? (
              <TypingIndicator />
            ) : (
              <Markdown style={markdownStyle}>
                {cleanContent + (isThisStreaming ? " ▋" : "")}
              </Markdown>
            )}
          </View>

          {!isThisStreaming && citations.length > 0 && (
            <CitationList citations={citations} />
          )}

          {!isThisStreaming &&
            !citations.length &&
            item.sources &&
            item.sources.length > 0 && (
              <LegacySourceToggle
                count={item.sources.length}
                sources={item.sources}
              />
            )}
        </View>
      </View>
    );
  }

  // ── Chat body — three distinct states ─────────────────────────────────────
  //
  //  1. isLoadingHistory  → user tapped an older session; history fetch is
  //                         in flight. Show a centered spinner — NOT
  //                         SuggestedQuestions, which would be confusing.
  //
  //  2. isEmpty (new chat) → local temp session with isLoaded = true and no
  //                          messages. Show SuggestedQuestions to help the
  //                          user get started.
  //
  //  3. has messages       → normal inverted FlatList.

  function renderChatBody() {
    if (isLoadingHistory) {
      return (
        <View style={s.historyLoadingContainer}>
          <ActivityIndicator size="large" color="#4F46E5" />
          <Text style={s.historyLoadingText}>Loading conversation…</Text>
        </View>
      );
    }

    if (isEmpty) {
      return (
        <View style={s.flex}>
          <SuggestedQuestions onSelect={handleSuggestedQuestion} />
        </View>
      );
    }

    return (
      <FlatList
        data={reversedMsgs}
        keyExtractor={(item) => item.id}
        renderItem={renderMessage}
        inverted
        contentContainerStyle={s.messageList}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      />
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <>
      <StatusBar style="light" backgroundColor="#080E1A" translucent={false} />
      <SafeAreaView style={s.container} edges={["top", "bottom"]}>
        {/* ── Header ── always anchored, never pushed by keyboard ── */}
        <View style={s.header}>
          <TouchableOpacity
            onPress={() => router.back()}
            hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
            accessibilityLabel="Go back"
            style={s.headerBackBtn}
          >
            <Text style={s.backArrow}>←</Text>
          </TouchableOpacity>

          <View style={s.headerCenter}>
            <Text style={s.headerDocLabel} numberOfLines={1}>
              {docDisplayName}
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => setSidebarOpen(true)}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            style={s.historyBtn}
            accessibilityLabel="Open chat history"
            accessibilityRole="button"
          >
            <Text style={s.historyBtnIcon}>☰</Text>
          </TouchableOpacity>
        </View>

        <KeyboardAvoidingView
          style={s.flex}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={0}
        >
          {renderChatBody()}

          {/* ── Input bar ── */}
          <View style={s.inputBar}>
            <TextInput
              ref={inputRef}
              style={s.input}
              value={input}
              onChangeText={setInput}
              placeholder="Ask a question…"
              placeholderTextColor="#3A4E66"
              multiline
              maxLength={2000}
              editable={!isStreaming && !isLoadingHistory}
              returnKeyType="default"
              blurOnSubmit={false}
              accessibilityLabel="Chat input"
            />
            <TouchableOpacity
              onPress={() => handleSend()}
              disabled={!input.trim() || isStreaming || isLoadingHistory}
              style={[
                s.sendBtn,
                (!input.trim() || isStreaming || isLoadingHistory) &&
                  s.sendBtnDisabled,
              ]}
              accessibilityLabel={
                isStreaming ? "Generating response" : "Send message"
              }
              activeOpacity={0.8}
            >
              {isStreaming ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <Text style={s.sendBtnIcon}>↑</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <ChatSidebar
        visible={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        document={doc}
        documentId={documentId}
        activeSessionId={activeSessionId}
        onSelectSession={handleSelectSession}
        onNewChat={handleNewChat}
      />
    </>
  );
}

// ─── Citation list ────────────────────────────────────────────────────────────

interface CitationListProps {
  citations: ParsedCitation[];
}

function CitationList({ citations }: CitationListProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={cl.wrapper}>
      <TouchableOpacity
        onPress={() => setExpanded((v) => !v)}
        style={cl.toggle}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={`${expanded ? "Hide" : "Show"} ${citations.length} source${citations.length !== 1 ? "s" : ""}`}
        accessibilityState={{ expanded }}
      >
        <View style={cl.toggleInner}>
          {!expanded &&
            citations.slice(0, 3).map((c) => (
              <View key={c.index} style={cl.previewBadge}>
                <Text style={cl.previewBadgeText}>{c.index}</Text>
              </View>
            ))}
          <Text style={cl.toggleText}>
            {expanded
              ? "▾ Hide sources"
              : `▸ ${citations.length} source${citations.length !== 1 ? "s" : ""}`}
          </Text>
        </View>
      </TouchableOpacity>

      {expanded && (
        <View style={cl.list}>
          {citations.map((c) => (
            <View key={c.index} style={cl.item}>
              <View style={cl.badge}>
                <Text style={cl.badgeText}>{c.index}</Text>
              </View>
              <View style={cl.itemText}>
                <Text style={cl.filename} numberOfLines={1}>
                  {c.filename}
                </Text>
                <Text style={cl.page}>{c.page}</Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const cl = StyleSheet.create({
  wrapper: { marginTop: 4, gap: 4 },
  toggle: { paddingVertical: 2 },
  toggleInner: { flexDirection: "row", alignItems: "center", gap: 5 },
  toggleText: { color: "#4B5A72", fontSize: 11, fontWeight: "500" },
  previewBadge: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#162035",
    borderWidth: 1,
    borderColor: "#2E3D54",
    alignItems: "center",
    justifyContent: "center",
  },
  previewBadgeText: { color: "#4B5A72", fontSize: 8, fontWeight: "700" },
  list: { gap: 3, marginTop: 2 },
  item: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: "#0A1220",
    borderRadius: 7,
    padding: 7,
    borderWidth: 1,
    borderColor: "#111E33",
  },
  badge: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: "#111E33",
    borderWidth: 1,
    borderColor: "#2E3D54",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 1,
  },
  badgeText: { color: "#4B5A72", fontSize: 9, fontWeight: "700" },
  itemText: { flex: 1, gap: 1 },
  filename: { color: "#64748B", fontSize: 11, fontWeight: "500" },
  page: { color: "#2E3D54", fontSize: 10 },
});

// ─── Legacy source toggle ─────────────────────────────────────────────────────

function LegacySourceToggle({
  count,
  sources,
}: {
  count: number;
  sources: any[];
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <View style={lc.wrap}>
      <TouchableOpacity
        onPress={() => setExpanded((v) => !v)}
        style={lc.toggle}
        accessibilityRole="button"
      >
        <Text style={lc.toggleText}>
          {expanded ? "▾" : "▸"} {count} source{count !== 1 ? "s" : ""}
        </Text>
      </TouchableOpacity>
      {expanded &&
        sources.map((src, i) => (
          <View key={i} style={lc.card}>
            <Text style={lc.cardName} numberOfLines={1}>
              📄 {src.documentName}
            </Text>
            <Text style={lc.cardPage}>
              p. {src.pageNumber} · {Math.round(src.similarity * 100)}% match
            </Text>
            <Text style={lc.cardSnippet} numberOfLines={3}>
              "{src.snippet}"
            </Text>
          </View>
        ))}
    </View>
  );
}

const lc = StyleSheet.create({
  wrap: { marginTop: 4, gap: 4 },
  toggle: { flexDirection: "row", alignItems: "center", paddingVertical: 4 },
  toggleText: { color: "#4B5A72", fontSize: 11, fontWeight: "500" },
  card: {
    backgroundColor: "#0A1220",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#111E33",
    gap: 4,
  },
  cardName: { color: "#64748B", fontSize: 12, fontWeight: "600" },
  cardPage: { color: "#2E3D54", fontSize: 11 },
  cardSnippet: {
    color: "#3A4E66",
    fontSize: 12,
    fontStyle: "italic",
    lineHeight: 18,
  },
});

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#080E1A" },
  flex: { flex: 1 },

  // ── Header ──
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#0F1A2E",
    backgroundColor: "#080E1A",
    minHeight: 52,
  },
  headerBackBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 10,
  },
  backArrow: {
    color: "#818CF8",
    fontSize: 24,
    lineHeight: 28,
    fontWeight: "300",
  },
  headerCenter: {
    flex: 1,
    alignItems: "center",
    paddingHorizontal: 4,
  },
  headerDocLabel: {
    color: "#D8E4F5",
    fontSize: 15,
    fontWeight: "600",
    letterSpacing: -0.2,
  },
  historyBtn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: "#0D1626",
    borderWidth: 1,
    borderColor: "#162035",
    alignItems: "center",
    justifyContent: "center",
  },
  historyBtnIcon: {
    color: "#6B7A96",
    fontSize: 15,
    lineHeight: 18,
  },

  // ── History loading state ──
  // Shown while fetching messages for a previously-saved session.
  // Replaces both SuggestedQuestions and the FlatList during the fetch.
  historyLoadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
  },
  historyLoadingText: {
    color: "#4B5A72",
    fontSize: 14,
    fontWeight: "500",
    letterSpacing: 0.1,
  },

  // ── AI avatar ──
  aiAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#1E2A45",
    borderWidth: 1,
    borderColor: "#2E3D54",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    marginTop: 2,
  },
  aiAvatarText: { color: "#818CF8", fontSize: 9, fontWeight: "700" },

  // ── Messages ──
  messageList: {
    paddingHorizontal: 14,
    paddingVertical: 16,
    gap: 16,
    flexGrow: 1,
  },
  bubbleWrapUser: { alignItems: "flex-end" },
  bubbleUser: {
    maxWidth: "80%",
    backgroundColor: "#4F46E5",
    borderRadius: 18,
    borderBottomRightRadius: 4,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleTextUser: { color: "#FFFFFF", fontSize: 15, lineHeight: 22 },
  bubbleWrapAssistant: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  assistantColumn: { flex: 1, gap: 4 },
  bubbleAssistant: {
    backgroundColor: "#0D1626",
    borderRadius: 18,
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: "#162035",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },

  // ── Input bar ──
  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#0F1A2E",
    backgroundColor: "#080E1A",
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: "#0D1626",
    borderWidth: 1,
    borderColor: "#1E2A45",
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    color: "#D8E4F5",
    fontSize: 15,
    lineHeight: 20,
  },
  sendBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "#4F46E5",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
    marginBottom: 0,
  },
  sendBtnDisabled: {
    backgroundColor: "#1A2340",
    shadowOpacity: 0,
    elevation: 0,
  },
  sendBtnIcon: {
    color: "#FFFFFF",
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 26,
  },
});

const markdownStyle = {
  body: { color: "#D8E4F5", fontSize: 15, lineHeight: 22 },
  paragraph: { marginTop: 0, marginBottom: 6, color: "#D8E4F5" },
  code_inline: {
    backgroundColor: "#162035",
    color: "#818CF8",
    borderRadius: 4,
    paddingHorizontal: 4,
    fontSize: 13,
  },
  fence: {
    backgroundColor: "#0A1220",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#162035",
  },
  bullet_list: { marginVertical: 4 },
  list_item: { flexDirection: "row" as const, gap: 6 },
  heading1: {
    color: "#E8EFF8",
    fontWeight: "700" as const,
    fontSize: 18,
    marginBottom: 4,
  },
  heading2: {
    color: "#E8EFF8",
    fontWeight: "700" as const,
    fontSize: 16,
    marginBottom: 4,
  },
  strong: { color: "#E8EFF8", fontWeight: "700" as const },
  em: { color: "#94A3B8", fontStyle: "italic" as const },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: "#4F46E5",
    paddingLeft: 10,
    opacity: 0.85,
  },
};
