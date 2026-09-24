import { ReactNode } from "react";
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
import { colors, statusTone } from "../theme";

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
        <Text style={styles.title}>{title}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        {children}
      </ScrollView>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
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
        (pressed || disabled) && styles.pressed,
      ]}
    >
      <Text style={[styles.buttonText, tone === "secondary" && styles.buttonTextSecondary]}>{label}</Text>
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
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        keyboardType={keyboardType}
        multiline={multiline}
        style={[styles.input, multiline && styles.multiline]}
        placeholderTextColor={colors.muted}
      />
    </View>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone = statusTone(status);
  return (
    <View style={[styles.badge, { backgroundColor: tone.background }]}>
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
    <View style={styles.kv}>
      <Text style={[styles.kvLabel, strong && styles.strong]}>{label}</Text>
      <Text style={[styles.kvValue, strong && styles.strong]}>{formatGhs(value)}</Text>
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
    <Pressable onPress={onPress} style={[styles.choice, selected && styles.choiceOn]}>
      <Text style={[styles.choiceText, selected && styles.choiceTextOn]}>{label}</Text>
    </Pressable>
  );
}

export function Empty({ text }: { text: string }) {
  return <Text style={styles.empty}>{text}</Text>;
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
  scroll: { padding: 20, paddingBottom: 40 },
  title: { fontSize: 28, fontWeight: "700", color: colors.ink, marginBottom: 4 },
  subtitle: { fontSize: 16, color: colors.muted, marginBottom: 16, lineHeight: 22 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  button: {
    minHeight: 52,
    borderRadius: 14,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 16,
    marginTop: 8,
  },
  buttonSecondary: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line },
  buttonDanger: { backgroundColor: colors.danger },
  buttonText: { color: colors.white, fontSize: 16, fontWeight: "700" },
  buttonTextSecondary: { color: colors.ink },
  pressed: { opacity: 0.7 },
  field: { marginBottom: 12 },
  label: { fontSize: 14, fontWeight: "600", color: colors.ink, marginBottom: 6 },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.surface,
    fontSize: 16,
    color: colors.ink,
  },
  multiline: { minHeight: 96, textAlignVertical: "top", paddingTop: 12 },
  badge: { alignSelf: "flex-start", borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeText: { fontSize: 13, fontWeight: "700" },
  kv: { flexDirection: "row", justifyContent: "space-between", gap: 12, paddingVertical: 6 },
  kvLabel: { color: colors.muted, fontSize: 15, flex: 1 },
  kvValue: { color: colors.ink, fontSize: 15, fontWeight: "600", flex: 1, textAlign: "right" },
  strong: { color: colors.ink, fontWeight: "800" },
  choice: {
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: colors.surface,
  },
  choiceOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  choiceText: { color: colors.ink, fontWeight: "600" },
  choiceTextOn: { color: colors.white },
  empty: { color: colors.muted, fontSize: 16, marginVertical: 12 },
  footer: { padding: 16, borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface },
  banner: { backgroundColor: colors.coldSoft, padding: 12 },
  bannerDanger: { backgroundColor: colors.dangerSoft },
  bannerOffline: { backgroundColor: colors.warningSoft },
  bannerText: { color: colors.ink, fontSize: 14, lineHeight: 20 },
});
