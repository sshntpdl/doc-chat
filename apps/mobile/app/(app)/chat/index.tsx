import React, { useCallback, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  StyleSheet,
  Alert,
  Pressable,
  TextInput,
  type ListRenderItemInfo,
  type AccessibilityRole,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { router } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import * as Haptics from "expo-haptics";
import type { Session } from "@supabase/supabase-js";
import { useAuthStore, useDocumentStore } from "@docchat/stores";
import type { Document } from "@docchat/types";
import { EmptyState } from "../../../components/ui/EmptyState";
import { LoadingScreen } from "../../../components/ui/LoadingScreen";

// CONSTANTS

const HIT_SLOP = { top: 12, bottom: 12, left: 12, right: 12 } as const;
const BUTTON_ROLE: AccessibilityRole = "button";

interface DocColorEntry {
  readonly bg: string;
  readonly accent: string;
  readonly icon: string;
}

const DOC_COLORS: Readonly<Record<string, DocColorEntry>> = {
  pdf: { bg: "#1B2D1E", accent: "#22C55E", icon: "📗" },
  markdown: { bg: "#1B2D1E", accent: "#22C55E", icon: "📝" },
  default: { bg: "#1B1E2D", accent: "#818CF8", icon: "📄" },
} as const;

function getDocStyle(type: string): DocColorEntry {
  return DOC_COLORS[type] ?? (DOC_COLORS.default as DocColorEntry);
}

function formatChunks(count: number): string {
  if (count === 0) return "Processing…";
  return `${count} chunk${count !== 1 ? "s" : ""}`;
}

// GREETING HELPERS

interface Greeting {
  readonly text: string;
  readonly wave: string;
}

function getGreeting(): Greeting {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return { text: "Good morning", wave: "👋" };
  if (hour >= 12 && hour < 17) return { text: "Good afternoon", wave: "👋" };
  if (hour >= 17 && hour < 21) return { text: "Good evening", wave: "👋" };
  return { text: "Good night", wave: "🌙" };
}

function getFirstName(session: Session | null): string {
  const meta = session?.user?.user_metadata as
    | Record<string, string>
    | undefined;
  if (meta?.full_name) return meta.full_name.split(" ")[0] ?? "there";
  if (meta?.name) return meta.name.split(" ")[0] ?? "there";
  if (meta?.first_name) return meta.first_name;
  const email = session?.user?.email ?? "";
  return email.split("@")[0] || "there";
}

// HEADER

interface HeaderProps {
  readonly selectMode: boolean;
  readonly selectedCount: number;
  readonly onUpload: () => void;
  readonly onSignOut: () => void;
  readonly onDelete: () => void;
  readonly onCancel: () => void;
}

function Header({
  selectMode,
  selectedCount,
  onUpload,
  onSignOut,
  onDelete,
  onCancel,
}: HeaderProps): React.JSX.Element {
  if (selectMode) {
    return (
      <View style={s.header}>
        <TouchableOpacity
          onPress={onCancel}
          hitSlop={HIT_SLOP}
          accessibilityRole={BUTTON_ROLE}
          accessibilityLabel="Cancel selection"
        >
          <Text style={s.cancelText}>Cancel</Text>
        </TouchableOpacity>
        <Text style={s.headerTitle}>{selectedCount} selected</Text>
        <TouchableOpacity
          onPress={onDelete}
          hitSlop={HIT_SLOP}
          disabled={selectedCount === 0}
          accessibilityRole={BUTTON_ROLE}
          accessibilityLabel="Delete selected documents"
        >
          <View
            style={[s.deleteBtn, selectedCount === 0 && s.deleteBtnDisabled]}
          >
            <Text
              style={[
                s.deleteBtnText,
                selectedCount === 0 && s.deleteBtnTextDisabled,
              ]}
            >
              Delete
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  }
  return (
    <View style={s.header}>
      <View>
        <Text style={s.headerEyebrow}>Your library</Text>
        <Text style={s.headerTitle}>Documents</Text>
      </View>
      <View style={s.headerActions}>
        <TouchableOpacity
          onPress={onUpload}
          hitSlop={HIT_SLOP}
          accessibilityRole={BUTTON_ROLE}
          accessibilityLabel="Upload a document"
          style={s.uploadBtn}
        >
          <Text style={s.uploadBtnText}>＋ Upload</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={onSignOut}
          hitSlop={HIT_SLOP}
          accessibilityRole={BUTTON_ROLE}
          accessibilityLabel="Sign out"
          style={s.signOutBtn}
        >
          <Text style={s.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// DOCUMENT CARD
interface DocumentCardProps {
  readonly item: Document;
  readonly selectMode: boolean;
  readonly isSelected: boolean;
  readonly onPress: (item: Document) => void;
  readonly onLongPress: (id: string) => void;
}

function DocumentCard({
  item,
  selectMode,
  isSelected,
  onPress,
  onLongPress,
}: DocumentCardProps): React.JSX.Element {
  const isReady = item.status === "ready" || item.status === "partial";
  const docStyle = getDocStyle(item.type);

  return (
    <Pressable
      onPress={() => onPress(item)}
      onLongPress={() => onLongPress(item.id)}
      delayLongPress={400}
      accessibilityRole={BUTTON_ROLE}
      accessibilityLabel={`Chat with ${item.name}`}
      accessibilityState={{
        disabled: !isReady && !selectMode,
        selected: isSelected,
      }}
      style={({ pressed }) => [
        s.cardShell,
        isSelected && s.cardShellSelected,
        !isReady && !selectMode && s.cardShellDisabled,
        pressed && (isReady || selectMode) && s.cardShellPressed,
      ]}
    >
      {/*
        This View — NOT the Pressable — owns the row layout.
      */}
      <View style={s.cardRow}>
        <View style={[s.accentBar, { backgroundColor: docStyle.accent }]} />

        <View style={[s.iconBox, { backgroundColor: docStyle.bg }]}>
          <Text style={s.docIcon}>{docStyle.icon}</Text>
        </View>

        {/* Text column — title on top, meta below */}
        <View style={s.docInfo}>
          <Text style={s.docName} numberOfLines={2}>
            {item.name}
          </Text>
          <View style={s.docMetaRow}>
            <View style={[s.typePill, { borderColor: `${docStyle.accent}55` }]}>
              <Text style={[s.typePillText, { color: docStyle.accent }]}>
                {item.type.toUpperCase()}
              </Text>
            </View>
            <Text style={s.docMeta}>
              {formatChunks(item.chunkCount)}
              {!isReady ? `  ·  ${item.status}` : ""}
            </Text>
          </View>
        </View>

        {/* Right-side element */}
        {selectMode ? (
          <View style={[s.checkbox, isSelected && s.checkboxChecked]}>
            {isSelected ? <Text style={s.checkMark}>✓</Text> : null}
          </View>
        ) : isReady ? (
          <View style={s.chevronBox}>
            <Text style={s.chevron}>›</Text>
          </View>
        ) : (
          <View style={s.processingDot} />
        )}
      </View>
    </Pressable>
  );
}

// SCREEN

export default function ChatIndexScreen(): React.JSX.Element {
  const signOut = useAuthStore((s) => s.signOut);
  const session = useAuthStore((s) => s.session);
  const token = session?.access_token;

  const { documents, isLoading, fetchDocuments, deleteDocument } =
    useDocumentStore();

  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const greeting = useMemo(() => getGreeting(), []);
  const firstName = useMemo(() => getFirstName(session), [session]);

  const filteredDocuments = useMemo(() => {
    if (searchQuery.trim() === "") return documents;
    const q = searchQuery.toLowerCase();
    return documents.filter((d) => d.name.toLowerCase().includes(q));
  }, [documents, searchQuery]);

  useFocusEffect(
    useCallback(() => {
      if (token != null) void fetchDocuments(token);
    }, [token, fetchDocuments]),
  );

  const handleRefresh = useCallback(async (): Promise<void> => {
    if (token == null) return;
    setRefreshing(true);
    await fetchDocuments(token);
    setRefreshing(false);
  }, [token, fetchDocuments]);

  const openUpload = useCallback(() => {
    router.push("/(app)/chat/upload");
  }, []);
  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const handleLongPress = useCallback(async (id: string): Promise<void> => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectMode(true);
    setSelectedIds(new Set([id]));
  }, []);

  const handlePressItem = useCallback(
    (item: Document) => {
      if (selectMode) {
        toggleSelect(item.id);
        return;
      }
      const isReady = item.status === "ready" || item.status === "partial";
      if (!isReady) return;
      router.push(`/(app)/chat/${item.id}`);
    },
    [selectMode, toggleSelect],
  );

  const confirmDelete = useCallback(() => {
    const count = selectedIds.size;
    if (count === 0) return;
    Alert.alert(
      count === 1 ? "Delete document?" : `Delete ${count} documents?`,
      "This can't be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            const ids = Array.from(selectedIds);
            exitSelectMode();
            void Promise.all(ids.map((id) => deleteDocument(id, token ?? "")));
          },
        },
      ],
    );
  }, [selectedIds, exitSelectMode, deleteDocument, token]);

  const handleSignOut = useCallback(() => {
    void signOut();
  }, [signOut]);
  const clearSearch = useCallback(() => setSearchQuery(""), []);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Document>) => (
      <DocumentCard
        item={item}
        selectMode={selectMode}
        isSelected={selectedIds.has(item.id)}
        onPress={handlePressItem}
        onLongPress={(id) => void handleLongPress(id)}
      />
    ),
    [selectMode, selectedIds, handlePressItem, handleLongPress],
  );

  const keyExtractor = useCallback((item: Document) => item.id, []);

  const processingCount = useMemo(
    () =>
      documents.filter((d) => d.status !== "ready" && d.status !== "partial")
        .length,
    [documents],
  );

  const displayedCount = filteredDocuments.length;

  if (isLoading && documents.length === 0) {
    return <LoadingScreen message="Loading your documents…" showLogo={false} />;
  }

  if (!isLoading && documents.length === 0) {
    return (
      <SafeAreaView style={s.container} edges={["top"]}>
        <StatusBar
          style="light"
          backgroundColor="#080E1A"
          translucent={false}
        />
        <Header
          selectMode={false}
          selectedCount={0}
          onUpload={openUpload}
          onSignOut={handleSignOut}
          onDelete={() => undefined}
          onCancel={() => undefined}
        />
        <EmptyState
          emoji="📂"
          title="No documents yet"
          subtitle="Upload a PDF, Markdown, or text file to start chatting with it."
          actionLabel="Upload your first document"
          onAction={openUpload}
        />
      </SafeAreaView>
    );
  }

  const ListHeader = (
    <>
      {!selectMode ? (
        <View style={s.greetingBlock}>
          <Text style={s.greetingLabel}>{greeting.text},</Text>
          <View style={s.greetingNameRow}>
            <Text style={s.greetingName}>{firstName}</Text>
            <Text style={s.greetingWave}>{greeting.wave}</Text>
          </View>
          <View style={s.kbCard}>
            <View style={s.kbIconWrap}>
              <Text style={s.kbIcon}>🗂️</Text>
            </View>
            <View style={s.kbTextWrap}>
              <Text style={s.kbCount}>{documents.length}</Text>
              <Text style={s.kbLabel}>
                document{documents.length !== 1 ? "s" : ""} in your knowledge
                base
              </Text>
            </View>
          </View>
          <View style={s.searchWrap}>
            <Text style={s.searchIcon}>🔍</Text>
            <TextInput
              style={s.searchInput}
              placeholder="Search documents…"
              placeholderTextColor="#3A4E66"
              value={searchQuery}
              onChangeText={setSearchQuery}
              returnKeyType="search"
              clearButtonMode="while-editing"
              autoCorrect={false}
              autoCapitalize="none"
            />
            {searchQuery.length > 0 ? (
              <TouchableOpacity
                onPress={clearSearch}
                hitSlop={HIT_SLOP}
                accessibilityRole={BUTTON_ROLE}
                accessibilityLabel="Clear search"
              >
                <Text style={s.searchClear}>✕</Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      ) : null}
      <View style={s.listHeader}>
        <Text style={s.listHeaderText}>
          {selectMode
            ? `${selectedIds.size} SELECTED — TAP MORE TO ADD`
            : searchQuery.trim() !== ""
              ? `${displayedCount} RESULT${displayedCount !== 1 ? "S" : ""}  ·  LONG-PRESS TO SELECT`
              : `${documents.length} DOCUMENT${documents.length !== 1 ? "S" : ""}  ·  LONG-PRESS TO SELECT`}
        </Text>
      </View>
    </>
  );

  const ListEmpty =
    searchQuery.trim() !== "" ? (
      <View style={s.noResults}>
        <Text style={s.noResultsEmoji}>🔎</Text>
        <Text style={s.noResultsTitle}>No results</Text>
        <Text style={s.noResultsSub}>No documents match "{searchQuery}"</Text>
      </View>
    ) : null;

  const ListFooter =
    processingCount > 0 ? (
      <View style={s.footerNote}>
        <View style={s.footerNoteRow}>
          <View style={s.processingPulse} />
          <Text style={s.footerNoteText}>
            {processingCount} document{processingCount !== 1 ? "s are" : " is"}{" "}
            still processing — they'll appear here when ready
          </Text>
        </View>
      </View>
    ) : null;

  return (
    <SafeAreaView style={s.container} edges={["top"]}>
      <StatusBar style="light" backgroundColor="#080E1A" translucent={false} />
      <Header
        selectMode={selectMode}
        selectedCount={selectedIds.size}
        onUpload={openUpload}
        onSignOut={handleSignOut}
        onDelete={confirmDelete}
        onCancel={exitSelectMode}
      />
      <FlatList
        data={filteredDocuments}
        keyExtractor={keyExtractor}
        extraData={selectMode ? selectedIds : null}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => void handleRefresh()}
            tintColor="#6366F1"
            colors={["#6366F1"]}
          />
        }
        ItemSeparatorComponent={() => <View style={s.separator} />}
        ListHeaderComponent={ListHeader}
        ListEmptyComponent={ListEmpty}
        ListFooterComponent={ListFooter}
        contentContainerStyle={s.listContent}
      />
    </SafeAreaView>
  );
}

// ─── STYLES ────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#080E1A" },

  // ── Header ──────────────────────────────────────────────────────────────
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#0F1A2E",
    backgroundColor: "#080E1A",
  },
  headerEyebrow: {
    color: "#4B5A72",
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 2,
  },
  headerTitle: {
    color: "#E8EFF8",
    fontSize: 26,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 10 },
  uploadBtn: {
    backgroundColor: "#4F46E5",
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 22,
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 5,
  },
  uploadBtnText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  signOutBtn: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#1E2E44",
  },
  signOutText: { color: "#4B5A72", fontSize: 13, fontWeight: "500" },
  cancelText: { color: "#818CF8", fontSize: 15 },
  deleteBtn: {
    backgroundColor: "#7F1D1D",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  deleteBtnDisabled: { backgroundColor: "#1E2D44", opacity: 0.5 },
  deleteBtnText: { color: "#FCA5A5", fontSize: 14, fontWeight: "600" },
  deleteBtnTextDisabled: { color: "#475569" },

  // ── Greeting ────────────────────────────────────────────────────────────
  greetingBlock: { paddingTop: 22, paddingBottom: 4, gap: 14 },
  greetingLabel: {
    color: "#6B7E99",
    fontSize: 15,
    fontWeight: "500",
    letterSpacing: 0.1,
    marginBottom: 2,
  },
  greetingNameRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  greetingName: {
    color: "#E8EFF8",
    fontSize: 28,
    fontWeight: "800",
    letterSpacing: -0.6,
  },
  greetingWave: { fontSize: 26 },

  // ── Knowledge-base card ─────────────────────────────────────────────────
  kbCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0D1626",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#162035",
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 14,
  },
  kbIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#111E33",
    alignItems: "center",
    justifyContent: "center",
  },
  kbIcon: { fontSize: 22 },
  kbTextWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: 5,
  },
  kbCount: {
    color: "#818CF8",
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.5,
  },
  kbLabel: { color: "#4B5A72", fontSize: 13, fontWeight: "500", flex: 1 },

  // ── Search ──────────────────────────────────────────────────────────────
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0D1626",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#162035",
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  searchIcon: { fontSize: 15 },
  searchInput: {
    flex: 1,
    color: "#D8E4F5",
    fontSize: 14,
    fontWeight: "500",
    padding: 0,
    margin: 0,
  },
  searchClear: {
    color: "#3A4E66",
    fontSize: 13,
    fontWeight: "700",
    paddingHorizontal: 4,
  },

  // ── List chrome ─────────────────────────────────────────────────────────
  listContent: { flexGrow: 1, paddingHorizontal: 16, paddingBottom: 32 },
  listHeader: { paddingTop: 16, paddingBottom: 10 },
  listHeaderText: {
    color: "#2E3D54",
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.1,
    textTransform: "uppercase",
  },
  separator: { height: 10 },
  noResults: { alignItems: "center", paddingTop: 48, gap: 8 },
  noResultsEmoji: { fontSize: 36 },
  noResultsTitle: { color: "#D8E4F5", fontSize: 17, fontWeight: "700" },
  noResultsSub: {
    color: "#3A4E66",
    fontSize: 13,
    textAlign: "center",
    lineHeight: 20,
  },

  // ── Document card ───────────────────────────────────────────────────────
  cardShell: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.08)",
    backgroundColor: "#111827",
    // overflow: "hidden", // clips accent bar + iconBox to card radius
  },
  cardShellPressed: {
    backgroundColor: "#162438",
    borderColor: "rgba(255, 255, 255, 0.14)",
  },
  cardShellSelected: { borderColor: "#4F46E5", backgroundColor: "#0F1836" },
  cardShellDisabled: { opacity: 0.45 },

  // Inner row — this is the single source of truth for row layout
  cardRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 72,
    backgroundColor: "#111827",
    borderRadius: 14,
    overflow: "hidden",
  },

  // Accent bar: sits flush left, stretches full card height
  accentBar: {
    width: 3,
    alignSelf: "stretch",
  },

  // Icon box: fixed 44×44
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
    marginRight: 12,
    flexShrink: 0,
    flexGrow: 0,
  },
  docIcon: { fontSize: 22 },

  // Text column
  docInfo: {
    flex: 1,
    paddingVertical: 14,
    gap: 5,
  },
  docName: {
    color: "#D8E4F5",
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 19,
  },
  docMetaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  typePill: {
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  typePillText: { fontSize: 9, fontWeight: "700", letterSpacing: 0.5 },
  docMeta: { color: "#3A4E66", fontSize: 12 },

  // Right-side elements
  chevronBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: "#0F1A2E",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
    flexShrink: 0,
    flexGrow: 0,
  },
  chevron: {
    color: "#4F46E5",
    fontSize: 18,
    fontWeight: "400",
    lineHeight: 22,
  },

  processingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FBBF24",
    marginRight: 14,
    flexShrink: 0,
    flexGrow: 0,
  },

  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: "#2E3D54",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
    flexShrink: 0,
    flexGrow: 0,
  },
  checkboxChecked: { backgroundColor: "#4F46E5", borderColor: "#4F46E5" },
  checkMark: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },

  // ── Footer ──────────────────────────────────────────────────────────────
  footerNote: {
    marginTop: 20,
    backgroundColor: "#0D1626",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#162035",
  },
  footerNoteRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  processingPulse: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FBBF24",
    flexShrink: 0,
  },
  footerNoteText: { color: "#3A4E66", fontSize: 13, lineHeight: 19, flex: 1 },
});
