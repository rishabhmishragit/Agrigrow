import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { config } from "../../config";
import { useCryo } from "../../state/CryoProvider";
import { Button, Card, Field, Screen } from "../../components/ui";
import { colors } from "../../theme";

const DEMOS = [
  ["Farmer", "farmer@test.com"],
  ["Offtaker", "offtaker@test.com"],
  ["Field agent", "agent@test.com"],
  ["Driver", "driver@test.com"],
  ["Operations", "ops@test.com"],
];

export function LoginScreen() {
  const { signIn, requestOtp, signInPhone, busy } = useCryo();
  const [email, setEmail] = useState("farmer@test.com");
  const [password, setPassword] = useState(config.demoPassword);
  const [phone, setPhone] = useState("0244001001");
  const [code, setCode] = useState("");
  const [phoneMode, setPhoneMode] = useState(false);

  return (
    <Screen
      title="CryoChain"
      subtitle="Cold-chain aggregation for farmers, buyers, field teams and drivers in Ghana."
    >
      <Card>
        <Text style={styles.kicker}>Development accounts</Text>
        <Text style={styles.help}>Password for every demo account: {config.demoPassword}. These accounts must not be used in production.</Text>
        <View style={styles.row}>
          {DEMOS.map(([label, value]) => (
            <Pressable key={value} onPress={() => setEmail(value)} style={styles.chip}>
              <Text style={styles.chipText}>{label}</Text>
            </Pressable>
          ))}
        </View>
      </Card>
      {phoneMode ? (
        <Card>
          <Field label="Phone number" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          <Button label="Send code" tone="secondary" onPress={() => void requestOtp(phone)} disabled={busy} />
          <Field label="SMS code" value={code} onChangeText={setCode} keyboardType="numeric" />
          <Button label="Verify and continue" onPress={() => void signInPhone(phone, code)} disabled={busy} />
          <Button label="Use email instead" tone="secondary" onPress={() => setPhoneMode(false)} />
        </Card>
      ) : (
        <Card>
          <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" />
          <Field label="Password" value={password} onChangeText={setPassword} />
          <Button label={busy ? "Signing in" : "Sign in"} onPress={() => void signIn(email, password)} disabled={busy} />
          <Button label="Use phone code" tone="secondary" onPress={() => setPhoneMode(true)} />
        </Card>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  kicker: { fontWeight: "700", color: colors.cold, marginBottom: 6 },
  help: { color: colors.muted, lineHeight: 20, marginBottom: 10 },
  row: { flexDirection: "row", flexWrap: "wrap" },
  chip: { backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8, marginBottom: 8 },
  chipText: { color: colors.primaryDark, fontWeight: "700" },
});
