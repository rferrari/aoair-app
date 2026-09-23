import React, { useState } from "react";
import { View, Text, StyleSheet, Pressable, Share } from "react-native";
import * as Haptics from "expo-haptics";
import { colors } from "../theme/colors";
import { typography } from "../theme/typography";
import { spacing, radii } from "../theme/spacing";

interface Props {
  content: string;
  isStreaming?: boolean;
}

interface Block {
  type: "text" | "code";
  content: string;
  language?: string;
}

/**
 * Parses markdown into text blocks and fenced code blocks (` ```lang ... ``` `).
 */
function parseBlocks(text: string): Block[] {
  const blocks: Block[] = [];
  const codeBlockRegex = /```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeBlockRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      blocks.push({
        type: "text",
        content: text.slice(lastIndex, match.index),
      });
    }
    blocks.push({
      type: "code",
      language: match[1]?.trim() || "CODE",
      content: match[2]?.replace(/\n$/, "") || "",
    });
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    blocks.push({
      type: "text",
      content: text.slice(lastIndex),
    });
  }

  return blocks;
}

/**
 * Formats inline segments: handles `inline code` and **bold** text.
 */
function renderInlineContent(text: string) {
  const parts = text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      const codeSnippet = part.slice(1, -1);
      return (
        <Text key={index} style={styles.inlineCode} selectable>
          {codeSnippet}
        </Text>
      );
    }
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      const boldText = part.slice(2, -2);
      return (
        <Text key={index} style={styles.boldText} selectable>
          {boldText}
        </Text>
      );
    }
    return (
      <Text key={index} style={styles.bodyText} selectable>
        {part}
      </Text>
    );
  });
}

function CodeBlockView({ code, language }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
      await Share.share({ message: code });
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  return (
    <View style={styles.codeBlock}>
      <View style={styles.codeHeader}>
        <View style={styles.codeHeaderLeft}>
          <View style={styles.codeIndicatorDot} />
          <Text style={styles.codeLangText}>{(language || "plaintext").toUpperCase()}</Text>
        </View>
        <Pressable
          style={[styles.copyBtn, copied && styles.copyBtnSuccess]}
          onPress={handleCopy}
          hitSlop={8}
        >
          <Text style={[styles.copyBtnText, copied && styles.copyBtnTextSuccess]}>
            {copied ? "✓ SHARED" : "COPY / SHARE"}
          </Text>
        </Pressable>
      </View>
      <View style={styles.codeBody}>
        <Text style={styles.codeContent} selectable>
          {code}
        </Text>
      </View>
    </View>
  );
}

export function MarkdownMessage({ content, isStreaming }: Props) {
  const blocks = parseBlocks(content);

  return (
    <View style={styles.container}>
      {blocks.map((block, idx) => {
        if (block.type === "code") {
          return <CodeBlockView key={idx} code={block.content} language={block.language} />;
        }

        // Render paragraph text with inline code/bold
        const lines = block.content.split("\n");
        return (
          <View key={idx} style={styles.paragraphContainer}>
            {lines.map((line, lineIdx) => {
              const trimmed = line.trim();
              if (trimmed.startsWith("### ")) {
                return (
                  <Text key={lineIdx} style={styles.h3}>
                    {trimmed.slice(4)}
                  </Text>
                );
              }
              if (trimmed.startsWith("## ")) {
                return (
                  <Text key={lineIdx} style={styles.h2}>
                    {trimmed.slice(3)}
                  </Text>
                );
              }
              if (trimmed.startsWith("# ")) {
                return (
                  <Text key={lineIdx} style={styles.h1}>
                    {trimmed.slice(2)}
                  </Text>
                );
              }
              if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
                return (
                  <View key={lineIdx} style={styles.bulletRow}>
                    <Text style={styles.bulletSymbol}>•</Text>
                    <Text style={styles.bulletText}>{renderInlineContent(trimmed.slice(2))}</Text>
                  </View>
                );
              }

              return (
                <Text key={lineIdx} style={styles.line}>
                  {renderInlineContent(line)}
                </Text>
              );
            })}
          </View>
        );
      })}

      {isStreaming && (
        <View style={styles.cursorRow}>
          <View style={styles.streamingCursor} />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xs,
  },
  paragraphContainer: {
    gap: 4,
  },
  line: {
    ...typography.ui.bodyLg,
    color: colors.text.primary,
  },
  bodyText: {
    ...typography.ui.bodyLg,
    color: colors.text.primary,
    lineHeight: 22,
  },
  boldText: {
    ...typography.ui.bodyLg,
    fontWeight: "700",
    color: "#FFFFFF",
  },
  inlineCode: {
    ...typography.mono.sm,
    backgroundColor: "rgba(0, 0, 0, 0.45)",
    color: colors.text.accentCyan,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: radii.xs,
    borderWidth: 1,
    borderColor: "rgba(6, 182, 212, 0.25)",
  },
  h1: {
    ...typography.ui.titleLg,
    color: colors.text.heading,
    marginTop: spacing.xs,
    marginBottom: 2,
  },
  h2: {
    ...typography.ui.title,
    color: colors.text.heading,
    marginTop: 4,
    marginBottom: 2,
  },
  h3: {
    ...typography.ui.titleSm,
    color: colors.text.accentCyan,
    marginTop: 2,
    marginBottom: 1,
  },
  bulletRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingLeft: spacing.xs,
    gap: 6,
    marginVertical: 1,
  },
  bulletSymbol: {
    ...typography.ui.body,
    color: colors.text.accentEmerald,
    fontWeight: "700",
  },
  bulletText: {
    flex: 1,
  },
  codeBlock: {
    backgroundColor: colors.bg.terminal,
    borderColor: colors.border.default,
    borderWidth: 1,
    borderRadius: radii.md,
    overflow: "hidden",
    marginVertical: spacing.xs,
  },
  codeHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "rgba(30, 41, 59, 0.7)",
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: colors.border.default,
  },
  codeHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  codeIndicatorDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.emerald[400],
  },
  codeLangText: {
    ...typography.mono.xs,
    color: colors.text.secondary,
    fontWeight: "700",
  },
  copyBtn: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: "rgba(255, 255, 255, 0.08)",
    borderRadius: radii.xs,
  },
  copyBtnSuccess: {
    backgroundColor: colors.emerald.bgSubtle,
    borderColor: colors.emerald.border,
    borderWidth: 1,
  },
  copyBtnText: {
    ...typography.mono.xs,
    color: colors.text.muted,
    fontWeight: "700",
  },
  copyBtnTextSuccess: {
    color: colors.text.accentEmerald,
  },
  codeBody: {
    padding: spacing.sm,
  },
  codeContent: {
    ...typography.mono.sm,
    color: "#E2E8F0",
    lineHeight: 18,
  },
  cursorRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 2,
  },
  streamingCursor: {
    width: 8,
    height: 16,
    backgroundColor: colors.emerald[400],
    borderRadius: 2,
    opacity: 0.8,
  },
});
