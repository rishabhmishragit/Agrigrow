import { ReactNode, useState } from "react";
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { STATUS_LABEL } from "../domain/selectors";
import { formatGhs } from "../domain/money";
import { colors, shadow, statusTone } from "../theme";

export function Screen({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.safe} edges={["bottom"]}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.page}>
          <Text style={styles.kicker}>CryoChain</Text>
          <Text style={styles.title}>{title}</Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          {children}
        </View>
      </ScrollView>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

export function Section({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {hint ? <Text style={styles.sectionHint}>{hint}</Text> : null}
    </View>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

export function Button({
  label,
  onPress,
  tone = "primary",
  disabled,
}: {
  label: string;
  onPress: () => void;
  tone?: "primary" | "secondary" | "danger";
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        tone === "secondary" && styles.buttonSecondary,
        tone === "danger" && styles.buttonDanger,
        pressed && !disabled && styles.pressed,
        disabled && styles.disabled,
      ]}
    >
      <Text style={[styles.buttonText, tone === "secondary" && styles.buttonTextSecondary, tone === "danger" && styles.buttonTextDanger]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  keyboardType?: "default" | "numeric" | "phone-pad" | "email-address";
  multiline?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        keyboardType={keyboardType}
        multiline={multiline}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        style={[styles.input, multiline && styles.multiline, focused && styles.inputFocused]}
        placeholderTextColor={colors.faint}
      />
    </View>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone = statusTone(status);
  return (
    <View style={[styles.badge, { backgroundColor: tone.background }]}>
      <View style={[styles.dot, { backgroundColor: tone.dot }]} />
      <Text style={[styles.badgeText, { color: tone.color }]}>{STATUS_LABEL[status] ?? status}</Text>
    </View>
  );
}

export function KeyValue({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.kv}>
      <Text style={styles.kvLabel}>{label}</Text>
      <Text style={styles.kvValue}>{value}</Text>
    </View>
  );
}

export function MoneyRow({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <View style={[styles.kv, strong && styles.kvStrong]}>
      <Text style={[styles.kvLabel, strong && styles.strong]}>{label}</Text>
      <Text style={[styles.kvValue, strong && styles.strongValue]}>{formatGhs(value)}</Text>
    </View>
  );
}

export function Choice({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={[styles.choice, selected && styles.choiceOn]}>
      <Text style={[styles.choiceText, selected && styles.choiceTextOn]}>{label}</Text>
    </Pressable>
  );
}

export function Empty({ text }: { text: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyText}>{text}</Text>
    </View>
  );
}

export function Banner({ text, tone = "info" }: { text: string; tone?: "info" | "danger" | "offline" }) {
  return (
    <View style={[styles.banner, tone === "danger" && styles.bannerDanger, tone === "offline" && styles.bannerOffline]}>
      <Text style={styles.bannerText}>{text}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 48 },
  page: { width: "100%", maxWidth: 1080, alignSelf: "center" },
  kicker: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.primary,
    marginBottom: 6,
  },
  title: { fontSize: 30, fontWeight: "700", letterSpacing: -0.6, color: colors.ink },
  subtitle: { fontSize: 15, color: colors.muted, marginTop: 6, marginBottom: 18, lineHeight: 22, maxWidth: 640 },
  section: { marginTop: 22, marginBottom: 10 },
  sectionTitle: { fontSize: 13, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", color: colors.muted },
  sectionHint: { color: colors.faint, marginTop: 2, fontSize: 13 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.line,
    ...shadow.card,
  },
  metric: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 16,
    paddingHorizontal: 16,
    minWidth: 168,
    flexGrow: 1,
    ...shadow.card,
  },
  metricLabel: { color: colors.muted, fontSize: 12, fontWeight: "600", letterSpacing: 0.3, textTransform: "uppercase" },
  metricValue: { color: colors.ink, fontSize: 28, fontWeight: "700", letterSpacing: -0.6, marginTop: 8 },
  button: {
    minHeight: 48,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    marginTop: 8,
  },
  buttonSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.lineStrong },
  buttonDanger: { backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: "#F0C9C9" },
  buttonText: { color: colors.white, fontSize: 15, fontWeight: "700" },
  buttonTextSecondary: { color: colors.ink },
  buttonTextDanger: { color: colors.danger },
  pressed: { opacity: 0.88 },
  disabled: { opacity: 0.45 },
  field: { marginBottom: 14 },
  label: { fontSize: 12, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase", color: colors.muted, marginBottom: 6 },
  input: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.surfaceMuted,
    fontSize: 16,
    color: colors.ink,
  },
  inputFocused: { borderColor: colors.primary, backgroundColor: colors.surface },
  multiline: { minHeight: 104, textAlignVertical: "top", paddingTop: 12 },
  badge: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 8,
  },
  dot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  badgeText: { fontSize: 12, fontWeight: "700", letterSpacing: 0.2 },
  kv: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  kvStrong: { marginTop: 4 },
  kvLabel: { color: colors.muted, fontSize: 14, flex: 1 },
  kvValue: { color: colors.ink, fontSize: 14, fontWeight: "600", flex: 1.2, textAlign: "right" },
  strong: { color: colors.ink, fontWeight: "700", fontSize: 15 },
  strongValue: { color: colors.primaryDark, fontWeight: "800", fontSize: 16 },
  choice: {
    borderWidth: 1,
    borderColor: colors.lineStrong,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: colors.surface,
  },
  choiceOn: { backgroundColor: colors.primarySoft, borderColor: colors.primary },
  choiceText: { color: colors.ink, fontWeight: "600", fontSize: 14 },
  choiceTextOn: { color: colors.primaryDark },
  empty: {
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.lineStrong,
    borderRadius: 14,
    padding: 18,
    marginVertical: 8,
    backgroundColor: colors.surfaceMuted,
  },
  emptyText: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
  },
  banner: {
    backgroundColor: colors.coldSoft,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#D3E7EC",
  },
  bannerDanger: { backgroundColor: colors.dangerSoft, borderBottomColor: "#F0C9C9" },
  bannerOffline: { backgroundColor: colors.warningSoft, borderBottomColor: "#F0E0C4" },
  bannerText: { color: colors.ink, fontSize: 13, lineHeight: 18, textAlign: "center" },
});
