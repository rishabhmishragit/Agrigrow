import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { config } from "../../config";
import { useCryo } from "../../state/CryoProvider";
import { Button, Field } from "../../components/ui";
import { colors } from "../../theme";

const DEMOS = [
  ["Farmer", "farmer@test.com", "List produce and follow payouts"],
  ["Offtaker", "offtaker@test.com", "Commit to lots and fund escrow"],
  ["Field agent", "agent@test.com", "Grade and weigh at the farm gate"],
  ["Driver", "driver@test.com", "Collect, record temperature, deliver"],
  ["Operations", "ops@test.com", "Aggregate, dispatch, release escrow"],
];

const STEPS = ["List", "Aggregate", "Escrow", "Verify", "Deliver", "Settle"];

export function LoginScreen() {
  const { signIn, requestOtp, signInPhone, busy } = useCryo();
  const { width } = useWindowDimensions();
  const wide = width >= 960;
  const [email, setEmail] = useState("farmer@test.com");
  const [password, setPassword] = useState(config.demoPassword);
  const [phone, setPhone] = useState("0244001001");
  const [code, setCode] = useState("");
  const [phoneMode, setPhoneMode] = useState(false);

  return (
    <SafeAreaView style={styles.safe}>
      <View style={[styles.shell, wide && styles.shellWide]}>
        <View style={[styles.brand, wide && styles.brandWide]}>
          <Text style={styles.mark}>CryoChain</Text>
          <Text style={styles.brandTitle}>Cold-chain aggregation for Ghana.</Text>
          <Text style={styles.brandCopy}>
            One operational system for farmers, buyers, field agents, drivers and operations. Money stays in an external trust account.
          </Text>
          <View style={styles.steps}>
            {STEPS.map((step, index) => (
              <View key={step} style={styles.step}>
                <Text style={styles.stepIndex}>{String(index + 1).padStart(2, "0")}</Text>
                <Text style={styles.stepLabel}>{step}</Text>
              </View>
            ))}
          </View>
        </View>
        <ScrollView style={styles.formPane} contentContainerStyle={styles.formWrap}>
          <View style={styles.form}>
            <Text style={styles.formKicker}>Sign in</Text>
            <Text style={styles.formTitle}>{phoneMode ? "Phone code" : "Development access"}</Text>
            <Text style={styles.formHelp}>
              Password for every demo account: {config.demoPassword}. These accounts must not be used in production.
            </Text>
            {!phoneMode ? (
              <View style={styles.roles}>
                {DEMOS.map(([label, value, hint]) => {
                  const selected = email === value;
                  return (
                    <Pressable
                      key={value}
                      accessibilityRole="button"
                      onPress={() => setEmail(value)}
                      style={[styles.role, selected && styles.roleOn]}
                    >
                      <Text style={[styles.roleLabel, selected && styles.roleLabelOn]}>{label}</Text>
                      <Text style={styles.roleHint}>{hint}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            {phoneMode ? (
              <>
                <Field label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
                <Button label="Send code" tone="secondary" onPress={() => void requestOtp(phone)} disabled={busy} />
                <Field label="SMS code" value={code} onChangeText={setCode} keyboardType="numeric" />
                <Button label="Verify and continue" onPress={() => void signInPhone(phone, code)} disabled={busy} />
                <Button label="Use email instead" tone="secondary" onPress={() => setPhoneMode(false)} />
              </>
            ) : (
              <>
                <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
                <Field label="Password" value={password} onChangeText={setPassword} />
                <Button label={busy ? "Signing in" : "Continue"} onPress={() => void signIn(email, password)} disabled={busy} />
                <Button label="Use a phone code" tone="secondary" onPress={() => setPhoneMode(true)} />
              </>
            )}
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.sidebar },
  shell: { flex: 1 },
  shellWide: { flexDirection: "row" },
  brand: { padding: 28, paddingTop: 36 },
  brandWide: { width: "42%", justifyContent: "center", padding: 48 },
  mark: { color: "#9DCFB8", fontSize: 13, fontWeight: "700", letterSpacing: 1.6, textTransform: "uppercase" },
  brandTitle: { color: colors.white, fontSize: 36, lineHeight: 42, fontWeight: "700", letterSpacing: -0.8, marginTop: 14, maxWidth: 420 },
  brandCopy: { color: colors.sidebarText, fontSize: 15, lineHeight: 23, marginTop: 14, maxWidth: 420 },
  steps: { flexDirection: "row", flexWrap: "wrap", marginTop: 28, gap: 8 },
  step: { backgroundColor: "rgba(255,255,255,0.06)", borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, minWidth: 88 },
  stepIndex: { color: "#9DCFB8", fontSize: 11, fontWeight: "700", letterSpacing: 0.6 },
  stepLabel: { color: colors.white, fontSize: 14, fontWeight: "600", marginTop: 2 },
  formPane: { flex: 1, backgroundColor: colors.bg },
  formWrap: { flexGrow: 1, padding: 28, justifyContent: "center" },
  form: { width: "100%", maxWidth: 480, alignSelf: "center", paddingVertical: 12 },
  formKicker: { color: colors.primary, fontSize: 12, fontWeight: "700", letterSpacing: 1.2, textTransform: "uppercase" },
  formTitle: { color: colors.ink, fontSize: 28, fontWeight: "700", letterSpacing: -0.5, marginTop: 6 },
  formHelp: { color: colors.muted, lineHeight: 21, marginTop: 8, marginBottom: 16 },
  roles: { marginBottom: 8 },
  role: { borderWidth: 1, borderColor: colors.line, backgroundColor: colors.surface, borderRadius: 14, padding: 12, marginBottom: 8 },
  roleOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  roleLabel: { color: colors.ink, fontWeight: "700", fontSize: 15 },
  roleLabelOn: { color: colors.primaryDark },
  roleHint: { color: colors.muted, marginTop: 2, fontSize: 13 },
});
