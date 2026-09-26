import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Icon, IconName, Switch, Text } from "../components";
import { useTokens } from "../theme";
import { selection } from "../../services/haptics";

interface Props {
  title: string;
  subtitle?: string;
  icon?: IconName;
  value: boolean;
  onValueChange: (value: boolean) => void;
  disabled?: boolean;
}

/**
 * A settings row where the whole row is the switch: one focus stop that
 * reads "title, subtitle, switch, on" and toggles on tap anywhere. A Switch
 * passed as ListRow `trailing` sits inside an accessible View, which hides
 * it from VoiceOver.
 */
export function SwitchRow({ title, subtitle, icon, value, onValueChange, disabled }: Props) {
  const t = useTokens();
  const toggle = () => {
    selection();
    onValueChange(!value);
  };
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
      accessibilityState={{ checked: value, disabled: !!disabled }}
      disabled={disabled}
      onPress={toggle}
      style={({ pressed }) => [
        styles.row,
        { minHeight: t.size.touch + 4, paddingHorizontal: t.space.base, paddingVertical: t.space.md, gap: t.space.md },
        pressed && { backgroundColor: t.color.bg.sunken },
        disabled && { opacity: 0.45 },
      ]}
    >
      {icon && <Icon name={icon} color={t.color.text.secondary} />}
      <View style={styles.body}>
        <Text variant="body">{title}</Text>
        {subtitle && (
          <Text variant="footnote" color="secondary">
            {subtitle}
          </Text>
        )}
      </View>
      <View importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Switch label={title} value={value} onValueChange={onValueChange} disabled={disabled} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center" },
  body: { flex: 1, gap: 2 },
});
