// FILE: apps/mobile/components/chat/ChatSidebar.tsx

import { useState, useEffect, useRef, useCallback, memo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  Animated,
  StyleSheet,
  Pressable,
  FlatList,
  Alert,
  ActivityIndicator,
  Platform,
} from "react-native";
import { useRouter } from "expo-router";
import { useChatStore, useSessionList } from "@docchat/stores";
import type { Document } from "@docchat/types";

// ─── Constants ────────────────────────────────────────────────────────────────

const SIDEBAR_WIDTH = 300;
const ANIMATION_MS = 260;
const BACKDROP_ALPHA = 0.65;

// ─── Props ────────────────────────────────────────────────────────────────────

interface ChatSidebarProps {
  visible: boolean;
  onClose: () => void;
  document: Document | undefined;
  documentId: string;
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onNewChat: () => void;
}

// ─── Session skeleton ─────────────────────────────────────────────────────────

function SessionSkeleton() {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 700,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 700,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <View style={sk.wrapper} accessibilityElementsHidden>
      {[68, 52, 76].map((w) => (
        <View key={w} style={sk.row}>
          <Animated.View
            style={[sk.line, { width: `${w}%` as any, opacity }]}
          />
          <Animated.View style={[sk.lineSub, { width: "35%", opacity }]} />
        </View>
      ))}
    </View>
  );
}

const sk = StyleSheet.create({
  wrapper: { paddingHorizontal: 12, paddingTop: 4, gap: 2 },
  row: { paddingHorizontal: 10, paddingVertical: 9, gap: 7 },
  line: { height: 11, borderRadius: 6, backgroundColor: "#1E2A45" },
  lineSub: { height: 8, borderRadius: 4, backgroundColor: "#1E2A45" },
});

// ─── Session row ──────────────────────────────────────────────────────────────
//
// Long-press triggers the delete Alert.
// The "Hold to delete" hint keeps discoverability high without cluttering
// the default view.

interface SessionRowProps {
  id: string;
  title: string;
  createdAt: string;
  isLoaded: boolean;
  msgCount: number;
  isActive: boolean;
  isDeleting: boolean;
  onPress: () => void;
  onLongPress: () => void;
}

const SessionRow = memo(function SessionRow({
  title,
  createdAt,
  msgCount,
  isLoaded,
  isActive,
  isDeleting,
  onPress,
  onLongPress,
}: SessionRowProps) {
  const dateLabel = new Date(createdAt).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
  const subLabel = isLoaded
    ? msgCount > 0
      ? `${msgCount} msg${msgCount !== 1 ? "s" : ""}`
      : "empty"
    : "tap to load";

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={onLongPress}
      delayLongPress={450}
      disabled={isDeleting}
      activeOpacity={0.7}
      style={[
        row.btn,
        isActive && row.btnActive,
        isDeleting && row.btnDeleting,
      ]}
      accessibilityRole="button"
      accessibilityState={{ selected: isActive, disabled: isDeleting }}
      accessibilityLabel={`${title || "New Chat"}, ${dateLabel}${subLabel ? `, ${subLabel}` : ""}. Long press to delete.`}
      accessibilityHint="Long press to delete this conversation"
    >
      {/* Active indicator bar */}
      {isActive && <View style={row.activeBar} />}

      <View style={row.content}>
        <Text
          style={[row.title, isActive && row.titleActive]}
          numberOfLines={1}
        >
          {title || "New Chat"}
        </Text>
        <Text style={[row.meta, isActive && row.metaActive]}>
          {dateLabel}
          {subLabel ? ` · ${subLabel}` : ""}
        </Text>
      </View>

      {isDeleting && (
        <ActivityIndicator size="small" color="#3A4E66" style={row.spinner} />
      )}
    </TouchableOpacity>
  );
});

const row = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 8,
    marginVertical: 1,
    borderRadius: 9,
    position: "relative",
  },
  btnActive: { backgroundColor: "#111E33" },
  btnDeleting: { opacity: 0.35 },

  activeBar: {
    position: "absolute",
    left: 6,
    top: 10,
    bottom: 10,
    width: 3,
    borderRadius: 2,
    backgroundColor: "#4F46E5",
  },

  content: { flex: 1, paddingLeft: 4, gap: 2 },
  title: { fontSize: 13, fontWeight: "500", color: "#94A3B8" },
  titleActive: { color: "#C7D2FE", fontWeight: "600" },
  meta: { fontSize: 11, color: "#2E3D54" },
  metaActive: { color: "#3A4E66" },
  spinner: { position: "absolute", right: 14 },
});

// ─── Main component ───────────────────────────────────────────────────────────

export function ChatSidebar({
  visible,
  onClose,
  document: doc,
  documentId,
  activeSessionId,
  onSelectSession,
  onNewChat,
}: ChatSidebarProps) {
  const router = useRouter();

  const [modalVisible, setModalVisible] = useState(false);
  const translateX = useRef(new Animated.Value(-SIDEBAR_WIDTH)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const { sessions, hasMore, isFetching, hasFetched } =
    useSessionList(documentId);
  const deleteSession = useChatStore((s) => s.deleteSession);
  const fetchSessions = useChatStore((s) => s.fetchSessions);
  const isStreaming = useChatStore((s) => s.isStreaming);
  const streamingMessageId = useChatStore((s) => s.streamingMessageId);

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const activeIsEmpty = !activeSession || activeSession.messages.length === 0;

  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    if (visible) {
      setModalVisible(true);
      Animated.parallel([
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          speed: 20,
          bounciness: 0,
        }),
        Animated.timing(backdropOpacity, {
          toValue: BACKDROP_ALPHA,
          duration: ANIMATION_MS,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: -SIDEBAR_WIDTH,
          duration: ANIMATION_MS - 40,
          useNativeDriver: true,
        }),
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: ANIMATION_MS - 40,
          useNativeDriver: true,
        }),
      ]).start(() => setModalVisible(false));
    }
  }, [visible]);

  const handleLoadMore = useCallback(() => {
    if (!isFetching && hasMore) fetchSessions(documentId);
  }, [isFetching, hasMore, fetchSessions, documentId]);

  // ─── Long-press delete ────────────────────────────────────────────────────
  //
  // Called from SessionRow.onLongPress. If the session has messages we
  // show a confirmation Alert; empty sessions are deleted silently.
  // We guard against deleting the session that is currently streaming.

  function handleLongPressSession(
    sessionId: string,
    hasMessages: boolean,
    sessionTitle: string,
  ) {
    // Never delete a session whose stream is in flight
    if (isStreaming && streamingMessageId) {
      const streamingSession = sessions.find((s) =>
        s.messages.some((m) => m.id === streamingMessageId),
      );
      if (streamingSession?.id === sessionId) return;
    }

    if (hasMessages) {
      Alert.alert(
        "Delete conversation",
        `"${sessionTitle || "New Chat"}" and all its messages will be permanently deleted.`,
        [
          { text: "Cancel", style: "cancel" },
          {
            text: "Delete",
            style: "destructive",
            onPress: async () => {
              setDeletingId(sessionId);
              await deleteSession(sessionId);
              setDeletingId(null);
            },
          },
        ],
        { cancelable: true },
      );
    } else {
      // Empty session — delete without a confirmation prompt
      setDeletingId(sessionId);
      deleteSession(sessionId).finally(() => setDeletingId(null));
    }
  }

  const renderItem = useCallback(
    ({ item }: { item: (typeof sessions)[number] }) => (
      <SessionRow
        id={item.id}
        title={item.title}
        createdAt={item.createdAt}
        isLoaded={item.isLoaded}
        msgCount={item.messages.length}
        isActive={item.id === activeSessionId}
        isDeleting={deletingId === item.id}
        onPress={() => onSelectSession(item.id)}
        onLongPress={() =>
          handleLongPressSession(item.id, item.messages.length > 0, item.title)
        }
      />
    ),
    [activeSessionId, deletingId, sessions, isStreaming, streamingMessageId],
  );

  const ListFooter =
    hasFetched && hasMore ? (
      <View style={main.footerSpinner}>
        {isFetching && <ActivityIndicator size="small" color="#2E3D54" />}
      </View>
    ) : (
      <View style={{ height: 20 }} />
    );

  const ListEmpty = hasFetched ? (
    <Text style={main.emptyText}>No previous conversations yet.</Text>
  ) : null;

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View style={main.overlay}>
        {/* ── Drawer ── */}
        <Animated.View
          style={[main.drawer, { transform: [{ translateX }] }]}
          accessibilityViewIsModal
        >
          {/* ── LEVEL 1: Navigation — highest hierarchy ── */}
          <View style={main.navRow}>
            <TouchableOpacity
              onPress={() => {
                onClose();
                router.back();
              }}
              style={main.libraryBtn}
              accessibilityRole="button"
              accessibilityLabel="Back to document list"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={main.libraryArrow}>←</Text>
              <Text style={main.libraryLabel}>Library</Text>
            </TouchableOpacity>
          </View>

          {/* ── LEVEL 2: Document context — medium hierarchy ── */}
          <View style={main.docCard}>
            <View style={main.docIconBox}>
              <Text style={main.docIconText}>
                {doc?.type === "pdf"
                  ? "📕"
                  : doc?.type === "markdown"
                    ? "📝"
                    : "📄"}
              </Text>
            </View>
            <View style={main.docCardText}>
              <Text style={main.docName} numberOfLines={2}>
                {doc?.name ?? "Loading…"}
              </Text>
              {doc && (
                <Text style={main.docMeta}>
                  {doc.chunkCount > 0 ? `${doc.chunkCount} chunks · ` : ""}
                  {doc.type.toUpperCase()}
                </Text>
              )}
            </View>
          </View>

          {/* ── LEVEL 3: New Chat CTA ── */}
          <View style={main.newChatWrapper}>
            <TouchableOpacity
              onPress={activeIsEmpty ? undefined : onNewChat}
              activeOpacity={activeIsEmpty ? 1 : 0.75}
              style={[
                main.newChatBtn,
                activeIsEmpty && main.newChatBtnDisabled,
              ]}
              accessibilityRole="button"
              accessibilityLabel={
                activeIsEmpty
                  ? "You're already in a new chat"
                  : "Start a new chat"
              }
              accessibilityState={{ disabled: activeIsEmpty }}
            >
              <Text
                style={[
                  main.newChatPlus,
                  activeIsEmpty && main.newChatTextDisabled,
                ]}
              >
                ＋
              </Text>
              <Text
                style={[
                  main.newChatText,
                  activeIsEmpty && main.newChatTextDisabled,
                ]}
              >
                New Chat
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── LEVEL 4: Session list — newest first, scrollable ── */}
          {/* Long-press any row to delete it. */}
          <View style={main.sectionHeader}>
            <Text style={main.sectionLabel}>HISTORY · HOLD TO DELETE</Text>
          </View>

          <FlatList
            data={hasFetched ? sessions : []}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.3}
            ListHeaderComponent={!hasFetched ? <SessionSkeleton /> : null}
            ListEmptyComponent={ListEmpty}
            ListFooterComponent={ListFooter}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ paddingBottom: 8 }}
            style={{ flex: 1 }}
          />
        </Animated.View>

        {/* ── Backdrop ── */}
        <Animated.View
          style={[main.backdrop, { opacity: backdropOpacity }]}
          pointerEvents={visible ? "auto" : "none"}
        >
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        </Animated.View>
      </View>
    </Modal>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const main = StyleSheet.create({
  overlay: { flex: 1, flexDirection: "row" },
  backdrop: { flex: 1, backgroundColor: "#000000" },

  drawer: {
    width: SIDEBAR_WIDTH,
    backgroundColor: "#080E1A",
    borderRightWidth: 1,
    borderRightColor: "#0F1A2E",
    paddingTop: Platform.OS === "ios" ? 52 : 28,
    flexDirection: "column",
    ...Platform.select({
      ios: {
        shadowColor: "#000",
        shadowOpacity: 0.5,
        shadowRadius: 16,
        shadowOffset: { width: 6, height: 0 },
      },
      android: { elevation: 16 },
    }),
  },

  // ── Level 1: Nav row ──
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  libraryBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: "#0D1626",
    borderWidth: 1,
    borderColor: "#1E2A45",
  },
  libraryArrow: {
    color: "#818CF8",
    fontSize: 18,
    lineHeight: 22,
    fontWeight: "300",
  },
  libraryLabel: {
    color: "#818CF8",
    fontSize: 13,
    fontWeight: "600",
    letterSpacing: 0.2,
  },

  // ── Level 2: Doc card ──
  docCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    marginHorizontal: 12,
    marginBottom: 14,
    backgroundColor: "#0D1626",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#111E33",
    padding: 12,
  },
  docIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: "#2D1B1B",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  docIconText: { fontSize: 18 },
  docCardText: { flex: 1, gap: 3 },
  docName: {
    fontSize: 13,
    fontWeight: "600",
    color: "#C7D2FE",
    lineHeight: 18,
  },
  docMeta: {
    fontSize: 10,
    color: "#2E3D54",
    fontWeight: "500",
    letterSpacing: 0.3,
  },

  // ── Level 3: New Chat ──
  newChatWrapper: { paddingHorizontal: 12, marginBottom: 8 },
  newChatBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#111E33",
    borderWidth: 1,
    borderColor: "#1E2A45",
    borderRadius: 9,
    paddingVertical: 11,
  },
  newChatBtnDisabled: { opacity: 0.35 },
  newChatPlus: {
    color: "#818CF8",
    fontSize: 16,
    fontWeight: "300",
    lineHeight: 20,
  },
  newChatText: { fontSize: 13, color: "#818CF8", fontWeight: "600" },
  newChatTextDisabled: { color: "#2E3D54" },

  // ── Level 4: Session list ──
  sectionHeader: {
    paddingHorizontal: 20,
    paddingTop: 4,
    paddingBottom: 6,
  },
  sectionLabel: {
    fontSize: 9,
    fontWeight: "700",
    color: "#1E2A45",
    letterSpacing: 1.2,
  },

  emptyText: {
    fontSize: 12,
    color: "#2E3D54",
    paddingHorizontal: 22,
    paddingTop: 8,
  },
  footerSpinner: { paddingVertical: 12, alignItems: "center" },
});
