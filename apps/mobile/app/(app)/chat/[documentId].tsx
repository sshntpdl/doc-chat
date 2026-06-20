// FILE: /apps/mobile/app/(app)/chat/[documentId].tsx
//
// Mobile chat screen with real-time SSE streaming.
//
// KEY MOBILE DECISIONS:
//   - FlatList with inverted={true}: newest messages at bottom without manual
//     scroll management. FlatList renders from bottom, so data is reversed.
//   - KeyboardAvoidingView + behavior='padding' (iOS) / 'height' (Android)
//   - EventSource from react-native-sse for SSE (no browser EventSource on RN)
//   - Haptic feedback on send (Haptics.impactAsync)
//   - react-native-markdown-display for AI message rendering

import { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import Markdown from "react-native-markdown-display";
import EventSource from "react-native-sse";
import { router, useLocalSearchParams } from "expo-router";
import {
  useAuthStore,
  useChatStore,
  useDocumentStore,
  useCurrentMessages,
  selectIsStreaming,
} from "@docchat/stores";
import type { ChatMessage, SSEEvent } from "@docchat/types";

const API_BASE = process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3000";

export default function ChatScreen() {
  const { documentId } = useLocalSearchParams<{ documentId: string }>();

  // Auth — needed to attach Bearer token to every SSE request
  const session = useAuthStore((s) => s.session);

  const getDocById = useDocumentStore((s) => s.getDocumentById);
  const doc = getDocById(documentId);

  const createSession = useChatStore((s) => s.createSession);
  const setActive = useChatStore((s) => s.setActiveSession);
  const activeId = useChatStore((s) => s.activeSessionId);
  const isStreaming = useChatStore(selectIsStreaming);
  const appendToken = useChatStore((s) => s.appendToken);
  const attachSources = useChatStore((s) => s.attachSources);
  const finalizeStream = useChatStore((s) => s.finalizeStreaming);

  const messages = useCurrentMessages(activeId);
  // FlatList inverted needs data in reverse order
  const reversedMsgs = [...messages].reverse();

  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const esRef = useRef<EventSource | null>(null);
  const inputRef = useRef<TextInput>(null);

  // Create a local session on mount; real UUID session is created server-side
  // on the first message and returned via the 'start' SSE event.
  useEffect(() => {
    const id = createSession(documentId);
    setActive(id);
    return () => {
      esRef.current?.close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Send message via SSE ────────────────────────────────────────────────────
  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isStreaming || !activeId) return;

    setInput("");
    setSending(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const now = new Date().toISOString();
    const userMsgId = `msg_${Date.now()}`;
    const asstMsgId = `msg_${Date.now() + 1}`;

    // Optimistically add user message + empty assistant placeholder to store
    useChatStore.setState((state) => {
      const sess = state.sessions[activeId];
      if (!sess) return state;
      return {
        ...state,
        isStreaming: true,
        streamingMessageId: asstMsgId,
        sessions: {
          ...state.sessions,
          [activeId]: {
            ...sess,
            messages: [
              ...sess.messages,
              {
                id: userMsgId,
                sessionId: activeId,
                userId: "local",
                role: "user",
                content: trimmed,
                createdAt: now,
              },
              {
                id: asstMsgId,
                sessionId: activeId,
                userId: "local",
                role: "assistant",
                content: "", // tokens append here
                createdAt: now,
              },
            ],
          },
        },
      };
    });

    // Always pass null for sessionId so the server creates a real UUID session.
    // Local temp IDs (e.g. "session_1234_abc") are not valid UUIDs and will
    // cause the server's session lookup to fail.
    const authToken = session?.access_token;

    const es = new EventSource(`${API_BASE}/api/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        // Required — without this header getAuthenticatedUser() throws 401
        // and the SSE stream never starts.
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({
        sessionId: null, // server creates a fresh DB session
        content: trimmed,
        documentId,
      }),
      pollingInterval: 0, // true SSE push, not polling
    });
    esRef.current = es;

    es.addEventListener("message", (event: any) => {
      try {
        if (!event.data || event.data === "[DONE]") return;
        const data = JSON.parse(event.data) as SSEEvent;

        switch (data.type) {
          case "token":
            appendToken(activeId, asstMsgId, data.content);
            break;

          case "sources":
            attachSources(activeId, asstMsgId, data.sources);
            break;

          case "done":
            finalizeStream();
            setSending(false);
            es.close();
            break;

          case "error":
            finalizeStream();
            setSending(false);
            es.close();
            break;
        }
      } catch {
        // Malformed SSE event — skip
      }
    });

    es.addEventListener("error", (err: any) => {
      console.error("[Chat] SSE error:", err);
      finalizeStream();
      setSending(false);
    });
  }, [
    input,
    isStreaming,
    activeId,
    documentId,
    session,
    appendToken,
    attachSources,
    finalizeStream,
  ]);

  // ── Render message bubble ───────────────────────────────────────────────────
  function renderMessage({ item }: { item: ChatMessage }) {
    const isUser = item.role === "user";
    const isThisStreaming =
      isStreaming && item.id === useChatStore.getState().streamingMessageId;

    return (
      <View
        style={[
          s.bubbleWrap,
          isUser ? s.bubbleWrapUser : s.bubbleWrapAssistant,
        ]}
      >
        <View style={[s.bubble, isUser ? s.bubbleUser : s.bubbleAssistant]}>
          {isUser ? (
            <Text style={s.bubbleTextUser}>{item.content}</Text>
          ) : (
            <Markdown style={markdownStyle}>
              {item.content + (isThisStreaming ? "▋" : "")}
            </Markdown>
          )}
        </View>

        {/* Source citations — collapsed by default */}
        {!isUser && item.sources && item.sources.length > 0 && (
          <MobileCitation count={item.sources.length} sources={item.sources} />
        )}
      </View>
    );
  }

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="Go back"
        >
          <Text style={s.backBtn}>←</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>
          {doc?.name ?? "Chat"}
        </Text>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
      >
        {/* Message list */}
        <FlatList
          data={reversedMsgs}
          keyExtractor={(item) => item.id}
          renderItem={renderMessage}
          inverted
          contentContainerStyle={s.messageList}
          showsVerticalScrollIndicator={false}
          ListEmptyComponent={
            <View style={s.emptyChat}>
              <Text style={s.emptyChatEmoji}>💬</Text>
              <Text style={s.emptyChatText}>
                Ask anything about{"\n"}
                {doc?.name ?? "this document"}
              </Text>
            </View>
          }
        />

        {/* Input bar */}
        <View style={s.inputBar}>
          <TextInput
            ref={inputRef}
            style={s.input}
            value={input}
            onChangeText={setInput}
            placeholder="Ask a question…"
            placeholderTextColor="#64748B"
            multiline
            maxLength={2000}
            editable={!isStreaming}
            returnKeyType="default"
            blurOnSubmit={false}
            accessibilityLabel="Chat input"
          />
          <TouchableOpacity
            onPress={handleSend}
            disabled={!input.trim() || isStreaming}
            style={[
              s.sendBtn,
              (!input.trim() || isStreaming) && s.sendBtnDisabled,
            ]}
            accessibilityLabel={
              isStreaming ? "Generating response" : "Send message"
            }
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
  );
}

// ─── MOBILE CITATION ──────────────────────────────────────────────────────────

function MobileCitation({ count, sources }: { count: number; sources: any[] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={c.wrap}>
      <TouchableOpacity
        onPress={() => setExpanded((v) => !v)}
        style={c.toggle}
        accessibilityRole="button"
        accessibilityLabel={`${expanded ? "Hide" : "Show"} ${count} source citations`}
        accessibilityState={{ expanded }}
      >
        <Text style={c.toggleText}>
          {expanded ? "▾" : "▸"} {count} source{count !== 1 ? "s" : ""}
        </Text>
      </TouchableOpacity>

      {expanded &&
        sources.map((src, i) => (
          <View key={i} style={c.card}>
            <Text style={c.cardName} numberOfLines={1}>
              📄 {src.documentName}
            </Text>
            <Text style={c.cardPage}>
              p. {src.pageNumber} · {Math.round(src.similarity * 100)}% match
            </Text>
            <Text style={c.cardSnippet} numberOfLines={3}>
              "{src.snippet}"
            </Text>
          </View>
        ))}
    </View>
  );
}

// ─── STYLES ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#0F172A" },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#334155",
  },
  backBtn: { color: "#818CF8", fontSize: 22, lineHeight: 28 },
  headerTitle: { flex: 1, color: "#F1F5F9", fontSize: 16, fontWeight: "600" },

  messageList: { paddingHorizontal: 16, paddingVertical: 12, gap: 16 },

  bubbleWrap: { gap: 6 },
  bubbleWrapUser: { alignItems: "flex-end" },
  bubbleWrapAssistant: { alignItems: "flex-start" },

  bubble: {
    maxWidth: "82%",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  bubbleUser: {
    backgroundColor: "#6366F1",
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
    borderBottomLeftRadius: 4,
    maxWidth: "100%",
  },
  bubbleTextUser: { color: "#FFFFFF", fontSize: 15, lineHeight: 22 },

  emptyChat: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 48,
  },
  emptyChatEmoji: { fontSize: 48, marginBottom: 16, textAlign: "center" },
  emptyChatText: {
    color: "#64748B",
    fontSize: 16,
    textAlign: "center",
    lineHeight: 24,
  },

  inputBar: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: "#334155",
    backgroundColor: "#0F172A",
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    color: "#F1F5F9",
    fontSize: 15,
    lineHeight: 20,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#6366F1",
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { opacity: 0.4 },
  sendBtnIcon: { color: "#FFFFFF", fontSize: 20, fontWeight: "700" },
});

const c = StyleSheet.create({
  wrap: { marginTop: 4, gap: 4 },
  toggle: { flexDirection: "row", alignItems: "center", paddingVertical: 4 },
  toggleText: { color: "#818CF8", fontSize: 12, fontWeight: "600" },
  card: {
    backgroundColor: "#1E293B",
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: "#334155",
    gap: 4,
  },
  cardName: { color: "#F1F5F9", fontSize: 12, fontWeight: "600" },
  cardPage: { color: "#64748B", fontSize: 11 },
  cardSnippet: {
    color: "#94A3B8",
    fontSize: 12,
    fontStyle: "italic",
    lineHeight: 18,
  },
});

const markdownStyle = {
  body: { color: "#F1F5F9", fontSize: 15, lineHeight: 22 },
  paragraph: { marginTop: 0, marginBottom: 6, color: "#F1F5F9" },
  code_inline: {
    backgroundColor: "#334155",
    color: "#A5B4FC",
    borderRadius: 4,
    paddingHorizontal: 4,
  },
  fence: { backgroundColor: "#334155", borderRadius: 8, padding: 12 },
  bullet_list: { marginVertical: 4 },
  list_item: { flexDirection: "row" as const, gap: 6 },
  heading1: { color: "#F1F5F9", fontWeight: "700" as const },
  heading2: { color: "#F1F5F9", fontWeight: "700" as const },
  strong: { color: "#F1F5F9", fontWeight: "700" as const },
  em: { color: "#CBD5E1", fontStyle: "italic" as const },
};
