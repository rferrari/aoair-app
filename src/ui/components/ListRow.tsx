import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { impact, ImpactFeedbackStyle } from "../../services/haptics";
import { useTokens } from "../theme";
import { Icon, IconName } from "./Icon";
import { Text } from "./Text";

export interface ListRowProps {
  title: string;
  subtitle?: string;
  /** Current value, shown trailing (e.g. "Qwen2.5 1.5B"). */
  value?: string;
  icon?: IconName;
  /** Custom trailing element (Switch, Badge). Replaces value + chevron. */
  trailing?: React.ReactNode;
  onPress?: () => void;
  /** Shows a chevron; defaults to true when the row navigates (`onPress` without `trailing`). */
  chevron?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  /** Overrides the composed "title, value, subtitle" label. */
  accessibilityLabel?: string;
  accessibilityHint?: string;
}

/**
 * One focusable unit: title + value + subtitle are read as one phrase.
 * Title and value stack vertically when they don't fit (long PT strings, 200% text).
 */
export function ListRow({
  title,
  subtitle,
  value,
  icon,
  trailing,
  onPress,
  chevron,
  destructive,
  disabled,
  accessibilityLabel,
  accessibilityHint,
}: ListRowProps) {
  const t = useTokens();
  const showChevron = chevron ?? (!!onPress && !trailing);
  const label = accessibilityLabel ?? [title, value, subtitle].filter(Boolean).join(", ");
  const content = (
    <>
      {icon && <Icon name={icon} color={destructive ? t.color.status.danger.solid : t.color.text.secondary} />}
      <View style={styles.body}>
        <View style={styles.titleLine}>
          <Text variant="body" color={destructive ? "danger" : "primary"} style={styles.title}>
            {title}
          </Text>
          {value && !trailing && (
            <Text variant="callout" color="tertiary" style={styles.value} numberOfLines={2}>
              {value}
            </Text>
          )}
        </View>
        {subtitle && (
          <Text variant="footnote" color="secondary">
            {subtitle}
          </Text>
        )}
      </View>
      {trailing}
      {showChevron && <Icon name="chevron-right" size="sm" color={t.color.text.tertiary} />}
    </>
  );
  const rowStyle = {
    minHeight: t.size.touch + 4,
    paddingHorizontal: t.space.base,
    paddingVertical: t.space.md,
    gap: t.space.md,
  };
  if (!onPress) {
    return (
      <View accessible accessibilityLabel={label} style={[styles.row, rowStyle]}>
        {content}
      </View>
    );
  }
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={() => {
        impact(ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => [
        styles.row,
        rowStyle,
        pressed && { backgroundColor: t.color.bg.sunken },
        disabled && { opacity: 0.45 },
      ]}
    >
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  body: { flex: 1, gap: 2 },
  titleLine: { flexDirection: "row", flexWrap: "wrap", alignItems: "baseline", columnGap: 8, justifyContent: "space-between" },
  title: { flexShrink: 1 },
  value: { flexShrink: 1, textAlign: "right", marginLeft: "auto" },
});
