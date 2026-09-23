import { colors } from "./colors";
import { typography, fontFamilies } from "./typography";
import { spacing, radii, shadows } from "./spacing";

export { colors, typography, fontFamilies, spacing, radii, shadows };

export const theme = {
  colors,
  typography,
  fontFamilies,
  spacing,
  radii,
  shadows,
  // Helper for quick terminal badge styling
  badges: {
    emerald: {
      backgroundColor: colors.emerald.bgSubtle,
      borderColor: colors.emerald.border,
      borderWidth: 1,
      color: colors.text.accentEmerald,
    },
    cyan: {
      backgroundColor: colors.cyan.bgSubtle,
      borderColor: colors.cyan.border,
      borderWidth: 1,
      color: colors.text.accentCyan,
    },
    amber: {
      backgroundColor: colors.amber.bgSubtle,
      borderColor: colors.amber.border,
      borderWidth: 1,
      color: colors.text.accentAmber,
    },
    crimson: {
      backgroundColor: colors.crimson.bgSubtle,
      borderColor: colors.crimson.border,
      borderWidth: 1,
      color: colors.crimson[400],
    },
    frontier: {
      backgroundColor: colors.frontier.badgeBg,
      borderColor: colors.frontier.badgeBorder,
      borderWidth: 1,
      color: colors.frontier.text,
    },
  },
} as const;

export default theme;
