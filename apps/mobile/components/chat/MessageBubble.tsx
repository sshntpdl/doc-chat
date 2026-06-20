// FILE: apps/mobile/components/chat/MessageBubble.tsx
//
// Renders a single chat message bubble for both user and AI messages.
// Extracted from the inline definition in chat/[documentId].tsx so it
// can be reused in any future chat surface (e.g. global document chat).
//
// KEY MOBILE DECISIONS:
//   - react-native-markdown-display for AI messages (supports bold, code, lists)
//   - Streaming cursor appended directly to content string while isStreaming=true
//   - memo() prevents re-render of finished messages during active stream
//   - Copy-to-clipboard on long press of AI message

import { memo, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import Markdown from "react-native-markdown-display";
import type { ChatMessage } from "@docchat/types";
import { SourceCitation } from "./SourceCitation";

// ─── PROPS ────────────────────────────────────────────────────────────────────

interface MessageBubbleProps {
  message: ChatMessage;
  /** True only while THIS specific message is being actively streamed */
  isStreaming?: boolean;
}

// ─── COMPONENT ───────────────────────────────────────────────────────────────
// memo() so that only the actively-streaming bubble re-renders on each token.
// All completed messages stay frozen.

export const MessageBubble = memo(function MessageBubble({
  message,
  isStreaming = false,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  async function handleLongPress() {
    if (isUser) return; // only copy AI messages
    await Clipboard.setStringAsync(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // Format timestamp as "2:34 PM"
  const time = new Date(message.createdAt).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <View style={[s.wrapper, isUser ? s.wrapperUser : s.wrapperAssistant]}>
      {/* Avatar */}
      <View style={[s.avatar, isUser ? s.avatarUser : s.avatarAssistant]}>
        <Text style={s.avatarText}>{isUser ? "U" : "AI"}</Text>
      </View>

      {/* Bubble + sources column */}
      <View style={s.column}>
        {/* Main bubble */}
        <Pressable
          onLongPress={handleLongPress}
          style={[s.bubble, isUser ? s.bubbleUser : s.bubbleAssistant]}
          accessibilityRole="text"
          accessibilityLabel={`${isUser ? "You" : "DocChat"}: ${message.content}`}
        >
          {isUser ? (
            // Plain text for user messages — no markdown needed
            <Text style={s.userText}>{message.content}</Text>
          ) : (
            // Markdown for AI — supports **bold**, `code`, lists, tables
            <Markdown style={mdStyle}>
              {/* Append streaming cursor character while streaming */}
              {message.content + (isStreaming ? "▋" : "")}
            </Markdown>
          )}
        </Pressable>

        {/* Copy feedback */}
        {copied && (
          <Text style={s.copiedLabel} accessibilityLiveRegion="polite">
            Copied!
          </Text>
        )}

        {/* Source citations (AI only, after streaming finishes) */}
        {!isUser &&
          !isStreaming &&
          message.sources &&
          message.sources.length > 0 && (
            <SourceCitation sources={message.sources} />
          )}

        {/* Timestamp */}
        <Text style={[s.time, isUser ? s.timeUser : s.timeAssistant]}>
          {time}
        </Text>
      </View>
    </View>
  );
});

// ─── STYLES ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  wrapper: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginVertical: 4,
  },
  wrapperUser: {
    flexDirection: "row-reverse", // avatar on right
  },
  wrapperAssistant: {
    flexDirection: "row", // avatar on left
  },

  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
    flexShrink: 0,
  },
  avatarUser: {
    backgroundColor: "#6366F1",
  },
  avatarAssistant: {
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
  },
  avatarText: {
    color: "#FFFFFF",
    fontSize: 10,
    fontWeight: "700",
  },

  column: {
    flex: 1,
    gap: 4,
    // Constrain width so bubble doesn't stretch full screen
    maxWidth: "85%",
  },

  bubble: {
    borderRadius: 16,
    paddingHorizontal: 13,
    paddingVertical: 10,
  },
  bubbleUser: {
    backgroundColor: "#6366F1",
    borderBottomRightRadius: 4,
    alignSelf: "flex-end",
  },
  bubbleAssistant: {
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
    borderBottomLeftRadius: 4,
    alignSelf: "flex-start",
  },

  userText: {
    color: "#FFFFFF",
    fontSize: 15,
    lineHeight: 22,
  },

  copiedLabel: {
    color: "#4ADE80",
    fontSize: 11,
    alignSelf: "flex-end",
    marginRight: 4,
  },

  time: {
    fontSize: 10,
    color: "#475569",
    marginTop: 1,
  },
  timeUser: { alignSelf: "flex-end", marginRight: 4 },
  timeAssistant: { alignSelf: "flex-start", marginLeft: 4 },
});

// ─── MARKDOWN STYLES ─────────────────────────────────────────────────────────
// These map to react-native-markdown-display's style keys.

const mdStyle = StyleSheet.create({
  body: {
    color: "#F1F5F9",
    fontSize: 15,
    lineHeight: 22,
  },
  paragraph: {
    marginTop: 0,
    marginBottom: 4,
    color: "#F1F5F9",
  },
  strong: {
    color: "#FFFFFF",
    fontWeight: "700",
  },
  em: {
    color: "#CBD5E1",
    fontStyle: "italic",
  },
  code_inline: {
    backgroundColor: "#334155",
    color: "#A5B4FC",
    borderRadius: 4,
    paddingHorizontal: 4,
    fontSize: 13,
    fontFamily: "monospace",
  },
  fence: {
    backgroundColor: "#0F172A",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#334155",
  },
  code_block: {
    backgroundColor: "#0F172A",
    borderRadius: 8,
    padding: 12,
    fontFamily: "monospace",
    fontSize: 13,
    color: "#E2E8F0",
  },
  bullet_list: {
    marginVertical: 4,
  },
  ordered_list: {
    marginVertical: 4,
  },
  list_item: {
    flexDirection: "row",
    gap: 6,
  },
  heading1: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 18,
    marginVertical: 6,
  },
  heading2: {
    color: "#FFFFFF",
    fontWeight: "700",
    fontSize: 16,
    marginVertical: 4,
  },
  heading3: {
    color: "#F1F5F9",
    fontWeight: "600",
    fontSize: 15,
    marginVertical: 4,
  },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: "#6366F1",
    paddingLeft: 12,
    marginVertical: 4,
    opacity: 0.8,
  },
  hr: {
    backgroundColor: "#334155",
    height: 1,
    marginVertical: 8,
  },
});
