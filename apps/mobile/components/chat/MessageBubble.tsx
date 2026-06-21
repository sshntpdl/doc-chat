// FILE: apps/mobile/components/chat/MessageBubble.tsx
//
// WEB FEATURE PARITY (this version):
//
//  ✅ TWO-PHASE STREAMING
//       Phase 1 — isWaitingForFirstToken (streaming=true, content=''):
//         Shows <TypingDots>  →  mirrors web's <TypingDots> component
//       Phase 2 — isReceivingTokens (streaming=true, content!=''):
//         Renders content + <StreamingCursor>  →  mirrors web's <StreamingCursor>
//
//  ✅ TYPING DOTS  — 3 bouncing dots with staggered Animated loop.
//       Mirrors web's @keyframes typing-bounce. Replaces the old "no
//       loading state" gap that existed in the original mobile version.
//
//  ✅ STREAMING CURSOR  — slim blinking vertical bar below the last
//       markdown segment.  Web renders it inline inside the last <p>
//       using a <span>; that's impossible in RN (Markdown outputs block
//       Views). Rendering it below the content is the correct mobile
//       adaptation and matches production mobile chat apps.
//
//  ✅ CITATION ANNOTATION + SEGMENT SPLITTER
//       Identical regex + splitIntoCitationSegments() logic as web.
//       [Doc: filename, p.X] tokens are stripped from the Markdown
//       pipeline and rendered as styled citation chips between segments.
//       Mobile limitation: chips appear between blocks, not mid-sentence
//       (RN Markdown is block-level). The SourceCitation panel below
//       still provides full source detail.
//
//  ✅ AI MESSAGE BODY  — <AIMessageBody> mirrors web's <AIMessageBody>:
//       renders segments array (text → Markdown, citation → chip).
//
//  ✅ COPY CODE BUTTON  — per-code-block copy button injected via
//       react-native-markdown-display `rules` override (mirrors web's
//       markdownComponents.pre + <CopyCodeButton>).
//       MARKDOWN_RULES is module-level (stable ref) — same rationale as
//       web's "Defined outside the component so the reference is stable".
//
//  ✅ LONG-PRESS COPY  — unchanged from original; copies full AI message.
//       Web shows a hover-reveal ⎘ button; long-press is the canonical
//       mobile equivalent and is already well-established in the codebase.

import { memo, useState, useEffect, useRef, useMemo } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  Animated,
  Platform,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import Markdown from "react-native-markdown-display";
import type { ChatMessage } from "@docchat/types";
import { SourceCitation } from "./SourceCitation";

// ─── CITATION SEGMENT TYPES + PARSER ─────────────────────────────────────────
// Identical to web — split content on [Doc: filename, p.X] patterns BEFORE
// passing to Markdown so citation tokens never enter the markdown pipeline.
// See web MessageBubble for the full comment explaining why we do this here
// rather than via ReactMarkdown's components API.

type TextSegment = { type: "text"; content: string };
type CitationSegment = { type: "citation"; filename: string; page: string };
type Segment = TextSegment | CitationSegment;

const DOC_CITATION_RE = /\[Doc:\s*([^\],]+?),\s*(p\.[\d–\-,\s]+?)\]/g;

function splitIntoCitationSegments(content: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  DOC_CITATION_RE.lastIndex = 0;

  while ((match = DOC_CITATION_RE.exec(content)) !== null) {
    if (match.index > lastIndex) {
      segments.push({
        type: "text",
        content: content.slice(lastIndex, match.index),
      });
    }
    segments.push({
      type: "citation",
      filename: match[1].trim(),
      page: match[2].trim(),
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < content.length) {
    segments.push({ type: "text", content: content.slice(lastIndex) });
  }

  return segments.length > 0 ? segments : [{ type: "text", content }];
}

// ─── TYPING DOTS ──────────────────────────────────────────────────────────────
// Phase 1 loading state while waiting for the first streaming token.
// Mirrors web's @keyframes typing-bounce: each dot translates -5px up
// and opacity 0.4 → 1, staggered by 180 ms (web uses animationDelay).
// Each dot completes its animation in a 1200 ms loop to keep all dots
// in perfect sync regardless of when the component mounts.

function TypingDots() {
  const dots = useRef([0, 1, 2].map(() => new Animated.Value(0))).current;
  const opacities = useRef(
    [0, 1, 2].map(() => new Animated.Value(0.4)),
  ).current;

  useEffect(() => {
    const STAGGER = 180; // ms between dot animations (matches web's 0.18s delay)
    const RISE = 250; // ms for up + down each (≈ web's 300ms split)
    const CYCLE = 1200; // ms total loop period

    const loops = dots.map((translateY, i) =>
      Animated.loop(
        Animated.sequence([
          // Pre-delay so each dot starts offset from the previous
          Animated.delay(i * STAGGER),
          // Rise: move up and brighten
          Animated.parallel([
            Animated.timing(translateY, {
              toValue: -5,
              duration: RISE,
              useNativeDriver: true,
            }),
            Animated.timing(opacities[i], {
              toValue: 1,
              duration: RISE,
              useNativeDriver: true,
            }),
          ]),
          // Fall: return to baseline and dim
          Animated.parallel([
            Animated.timing(translateY, {
              toValue: 0,
              duration: RISE,
              useNativeDriver: true,
            }),
            Animated.timing(opacities[i], {
              toValue: 0.4,
              duration: RISE,
              useNativeDriver: true,
            }),
          ]),
          // Pad to fill the remaining cycle so all loops stay in lockstep
          Animated.delay(CYCLE - RISE * 2 - i * STAGGER),
        ]),
      ),
    );

    Animated.parallel(loops).start();
    return () => loops.forEach((l) => l.stop());
  }, []);

  return (
    <View
      style={dotS.wrapper}
      accessibilityRole="progressbar"
      accessibilityLabel="AI is typing"
    >
      {dots.map((translateY, i) => (
        <Animated.View
          key={i}
          accessible={false}
          style={[
            dotS.dot,
            { transform: [{ translateY }], opacity: opacities[i] },
          ]}
        />
      ))}
    </View>
  );
}

const dotS = StyleSheet.create({
  wrapper: {
    flexDirection: "row",
    gap: 4,
    alignItems: "center",
    height: 22,
    paddingVertical: 3,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#475569",
  },
});

// ─── STREAMING CURSOR ─────────────────────────────────────────────────────────
// Phase 2 indicator while tokens are arriving.
// Mirrors web's @keyframes blink-cursor (0.9s step-start → 0.9s opacity toggle).
// Web renders it inline within the last <p> via a <span>; that's not possible
// in RN because react-native-markdown-display outputs block-level Views that
// can't contain arbitrary React sibling nodes.
// Decision: render below the last text segment. Visually unambiguous on mobile.

function StreamingCursor() {
  const opacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0,
          duration: 450,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 450,
          useNativeDriver: true,
        }),
      ]),
    );
    anim.start();
    return () => anim.stop();
  }, []);

  return (
    <Animated.View accessible={false} style={[cursorS.cursor, { opacity }]} />
  );
}

const cursorS = StyleSheet.create({
  cursor: {
    width: 2,
    height: 14,
    backgroundColor: "#6366F1", // var(--color-primary)
    borderRadius: 1,
    marginTop: 6,
    alignSelf: "flex-start",
  },
});

// ─── CITATION ANNOTATION ─────────────────────────────────────────────────────
// Mobile adaptation of web's <CitationAnnotation>.
// Web renders as an inline <span> (opacity 0.6, hover → 1).
// RN: rendered as a small mono chip between content blocks.
// Tooltip via `accessibilityLabel`; no hover (native handles via long-press).

function CitationAnnotation({
  filename,
  page,
}: {
  filename: string;
  page: string;
}) {
  const displayName =
    filename.length > 28 ? filename.slice(0, 26) + "…" : filename;

  return (
    <View
      style={citeS.chip}
      accessible
      accessibilityLabel={`Source: ${filename}, ${page}`}
    >
      <Text style={citeS.text}>
        [{displayName}, {page}]
      </Text>
    </View>
  );
}

const citeS = StyleSheet.create({
  chip: {
    backgroundColor: "#0F172A",
    borderWidth: 1,
    borderColor: "#334155",
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginVertical: 3,
    alignSelf: "flex-start",
  },
  text: {
    color: "#64748B",
    fontSize: 11,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
});

// ─── COPY CODE BUTTON ─────────────────────────────────────────────────────────
// Mirrors web's <CopyCodeButton> (absolute top-right of <pre>, opacity-0
// group-hover:opacity-100).
// Mobile: always visible at bottom-right of the code block (no hover state).
// Defined BEFORE MARKDOWN_RULES so the module-level const can reference it.

function CopyCodeButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    await Clipboard.setStringAsync(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <TouchableOpacity
      onPress={handleCopy}
      style={cpS.btn}
      accessibilityLabel={copied ? "Copied!" : "Copy code"}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Text style={cpS.label}>{copied ? "Copied ✓" : "Copy"}</Text>
    </TouchableOpacity>
  );
}

const cpS = StyleSheet.create({
  btn: {
    alignSelf: "flex-end",
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: "#334155",
    borderRadius: 4,
  },
  label: {
    color: "#94A3B8",
    fontSize: 11,
    fontWeight: "600",
  },
});

// ─── MARKDOWN RULES ───────────────────────────────────────────────────────────
// Defined at MODULE LEVEL so the reference is stable across renders —
// same rationale as web's `markdownComponents` comment:
//   "prevents ReactMarkdown from remounting on every token during streaming"
//
// Overrides `fence` (``` code blocks) and `code_block` (indented blocks) to
// inject a per-block <CopyCodeButton>.  All other tokens use default rendering.

const MARKDOWN_RULES = {
  fence: (node: any, _children: any, _parent: any, styles: any) => (
    <View key={node.key} style={styles.fence}>
      <Text
        selectable
        style={{
          color: "#E2E8F0",
          fontFamily: "monospace",
          fontSize: 13,
          lineHeight: 20,
        }}
      >
        {node.content}
      </Text>
      <CopyCodeButton code={node.content} />
    </View>
  ),

  code_block: (node: any, _children: any, _parent: any, styles: any) => (
    <View key={node.key} style={styles.code_block}>
      <Text
        selectable
        style={{
          color: "#E2E8F0",
          fontFamily: "monospace",
          fontSize: 13,
          lineHeight: 20,
        }}
      >
        {node.content}
      </Text>
      <CopyCodeButton code={node.content} />
    </View>
  ),
};

// ─── AI MESSAGE BODY ──────────────────────────────────────────────────────────
// Mirrors web's <AIMessageBody>: renders citation-parsed segments as either
// Markdown blocks or CitationAnnotation chips, then appends the streaming
// cursor while tokens are arriving.
//
// Each text segment gets its own <Markdown> instance so markdown context
// (bold, lists, headings) applies correctly within each chunk — same
// approach as web's per-segment <ReactMarkdown> inside a `contents` span.

interface AIBodyProps {
  content: string;
  isReceivingTokens: boolean;
}

function AIMessageBody({ content, isReceivingTokens }: AIBodyProps) {
  const segments = useMemo(() => splitIntoCitationSegments(content), [content]);

  return (
    <View style={{ gap: 2 }}>
      {segments.map((seg, i) =>
        seg.type === "citation" ? (
          <CitationAnnotation key={i} filename={seg.filename} page={seg.page} />
        ) : (
          <Markdown key={i} style={mdStyle} rules={MARKDOWN_RULES}>
            {seg.content}
          </Markdown>
        ),
      )}

      {/* Streaming cursor — shown below last segment while tokens arrive.
          Web attaches it inside the last <p>; RN block model prevents that.
          This is visually clear and is the correct mobile adaptation. */}
      {isReceivingTokens && <StreamingCursor />}
    </View>
  );
}

// ─── PROPS ────────────────────────────────────────────────────────────────────

interface MessageBubbleProps {
  message: ChatMessage;
  /** True only while THIS specific message is being actively streamed */
  isStreaming?: boolean;
}

// ─── MESSAGE BUBBLE ───────────────────────────────────────────────────────────
// memo() so only the actively-streaming bubble re-renders per token.

export const MessageBubble = memo(function MessageBubble({
  message,
  isStreaming = false,
}: MessageBubbleProps) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);

  // ── Two-phase streaming — mirrors web's derived booleans ─────────────────
  const isWaitingForFirstToken = isStreaming && message.content.length === 0;
  const isReceivingTokens = isStreaming && message.content.length > 0;

  // ── Long-press copies full AI message (web equivalent: hover ⎘ button) ──
  async function handleLongPress() {
    if (isUser || !message.content) return;
    await Clipboard.setStringAsync(message.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const time = new Date(message.createdAt).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });

  return (
    <View style={[s.wrapper, isUser ? s.wrapperUser : s.wrapperAssistant]}>
      {/* ── Avatar ── */}
      <View style={[s.avatar, isUser ? s.avatarUser : s.avatarAssistant]}>
        <Text style={s.avatarText}>{isUser ? "U" : "AI"}</Text>
      </View>

      {/* ── Bubble + meta column ── */}
      <View style={s.column}>
        <Pressable
          onLongPress={handleLongPress}
          style={[s.bubble, isUser ? s.bubbleUser : s.bubbleAssistant]}
          accessibilityRole="text"
          accessibilityLabel={`${isUser ? "You" : "DocChat"}: ${message.content}`}
        >
          {isUser ? (
            // Plain text — no markdown needed for user messages
            <Text style={s.userText}>{message.content}</Text>
          ) : (
            <>
              {/* Phase 1: waiting for first token → bouncing dots */}
              {isWaitingForFirstToken && <TypingDots />}

              {/* Phase 2 / complete: render content with citation chips */}
              {!isWaitingForFirstToken && (
                <AIMessageBody
                  content={message.content}
                  isReceivingTokens={isReceivingTokens}
                />
              )}
            </>
          )}
        </Pressable>

        {/* Long-press copy feedback */}
        {copied && (
          <Text style={s.copiedLabel} accessibilityLiveRegion="polite">
            Copied!
          </Text>
        )}

        {/* Source citations — AI only, after streaming finishes */}
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

// ─── BUBBLE STYLES ────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  wrapper: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginVertical: 4,
  },
  wrapperUser: { flexDirection: "row-reverse" },
  wrapperAssistant: { flexDirection: "row" },

  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 2,
    flexShrink: 0,
  },
  avatarUser: { backgroundColor: "#6366F1" },
  avatarAssistant: {
    backgroundColor: "#1E293B",
    borderWidth: 1,
    borderColor: "#334155",
  },
  avatarText: { color: "#FFFFFF", fontSize: 10, fontWeight: "700" },

  column: {
    flex: 1,
    gap: 4,
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

  time: { fontSize: 10, color: "#475569", marginTop: 1 },
  timeUser: { alignSelf: "flex-end", marginRight: 4 },
  timeAssistant: { alignSelf: "flex-start", marginLeft: 4 },
});

// ─── MARKDOWN STYLES ──────────────────────────────────────────────────────────
// Passed to each <Markdown style={mdStyle}> instance in AIMessageBody.
// fence / code_block are referenced by MARKDOWN_RULES rule functions
// via the `styles` parameter they receive.

const mdStyle = StyleSheet.create({
  body: { color: "#F1F5F9", fontSize: 15, lineHeight: 22 },
  paragraph: { marginTop: 0, marginBottom: 4, color: "#F1F5F9" },
  strong: { color: "#FFFFFF", fontWeight: "700" },
  em: { color: "#CBD5E1", fontStyle: "italic" },

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
  },

  bullet_list: { marginVertical: 4 },
  ordered_list: { marginVertical: 4 },
  list_item: { flexDirection: "row", gap: 6 },

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
  hr: { backgroundColor: "#334155", height: 1, marginVertical: 8 },
});
