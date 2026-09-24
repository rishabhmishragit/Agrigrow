import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCryo } from "../../state/CryoProvider";
import { Button, Card, Choice, Empty, Field, KeyValue, Screen, StatusBadge } from "../../components/ui";
import { farmerName, produceName } from "../../domain/selectors";
import { flushSync, recordInspection } from "../../domain/fieldOps";
import { registerFarmer } from "../../domain/trade";
import { captureEvidence, readPosition } from "../../services/device";
import { colors } from "../../theme";

export type AgentParamList = {
  Jobs: undefined;
  Inspection: { consignmentId: string };
  Sync: undefined;
  Register: undefined;
  Profile: undefined;
};

type JobsProps = NativeStackScreenProps<AgentParamList, "Jobs">;
type InspectionProps = NativeStackScreenProps<AgentParamList, "Inspection">;

export function AgentJobs({ navigation }: JobsProps) {
  const { db, user, forceOffline, setForceOffline } = useCryo();
  const agent = db.fieldAgentProfiles.find((item) => item.userId === user?.id);
  const jobs = db.collections.filter((item) => item.fieldAgentId === agent?.id);
  const waiting = db.syncQueue.filter((item) => item.actorId === user?.id && item.syncStatus !== "SYNCED");
  return (
    <Screen title="Assigned collections" subtitle="Grade and weigh at the farm gate. Work continues without a signal.">
      <Button label={forceOffline ? "Offline mode on" : "Work offline"} tone="secondary" onPress={() => setForceOffline(!forceOffline)} />
      <Button label={`Sync queue (${waiting.length})`} tone="secondary" onPress={() => navigation.navigate("Sync")} />
      <Button label="Register a farmer" tone="secondary" onPress={() => navigation.navigate("Register")} />
      <Button label="Profile" tone="secondary" onPress={() => navigation.navigate("Profile")} />
      {jobs.length === 0 ? <Empty text="No collections are assigned to you." /> : null}
      {jobs.map((job) => {
        const lot = db.lots.find((item) => item.id === job.lotId);
        const consignments = db.consignments.filter((item) => item.lotId === job.lotId);
        return (
          <Card key={job.id}>
            <Text style={styles.title}>{lot?.code} · {lot ? produceName(db, lot.produceId) : ""}</Text>
            <Text style={styles.meta}>{job.scheduledDate} · {job.windowLabel}</Text>
            <StatusBadge status={lot?.orderState ?? job.status} />
            {consignments.map((item) => {
              const inspection = db.inspections.find((row) => row.consignmentId === item.id);
              return (
                <Pressable key={item.id} onPress={() => navigation.navigate("Inspection", { consignmentId: item.id })}>
                  <View style={styles.row}>
                    <Text style={styles.name}>{farmerName(db, item.farmerId)} · {item.expectedQuantity} {item.unit}</Text>
                    <StatusBadge status={inspection ? (inspection.syncStatus === "SYNCED" ? "SYNCED" : "PENDING") : "PENDING"} />
                  </View>
                </Pressable>
              );
            })}
          </Card>
        );
      })}
    </Screen>
  );
}

export function InspectionScreen({ route }: InspectionProps) {
  const { db, run, busy, offline } = useCryo();
  const consignment = db.consignments.find((item) => item.id === route.params.consignmentId);
  const scale = db.gradeScales.find((item) => item.produceId === consignment?.produceId);
  const existing = db.inspections.find((item) => item.consignmentId === consignment?.id);
  const [actual, setActual] = useState(String(existing?.actualQuantity ?? consignment?.expectedQuantity ?? ""));
  const [rejected, setRejected] = useState(String(existing?.rejectedQuantity ?? "0"));
  const [grade, setGrade] = useState(existing?.gradeCode ?? scale?.grades[0]?.code ?? "");
  const [notes, setNotes] = useState(existing?.notes ?? "");
  const [photos, setPhotos] = useState<string[]>(existing?.photoUris ?? []);
  if (!consignment) return <Screen title="Inspection"><Empty text="Consignment was not found." /></Screen>;
  return (
    <Screen title={farmerName(db, consignment.farmerId)} subtitle={`${produceName(db, consignment.produceId)} · expected ${consignment.expectedQuantity} ${consignment.unit}`}>
      <Card>
        <Text style={styles.meta}>{offline ? "PENDING SYNC — this phone will keep the reading." : existing?.syncStatus === "SYNCED" ? "SYNCED" : "Ready to send"}</Text>
        {existing ? <StatusBadge status={existing.syncStatus} /> : null}
      </Card>
      <Field label="Actual quantity" value={actual} onChangeText={setActual} keyboardType="numeric" />
      <Field label="Rejected quantity" value={rejected} onChangeText={setRejected} keyboardType="numeric" />
      <Text style={styles.label}>Grade</Text>
      <View style={styles.wrap}>
        {scale?.grades.map((item) => (
          <Choice key={item.code} label={`${item.code} ${item.label}`} selected={item.code === grade} onPress={() => setGrade(item.code)} />
        ))}
      </View>
      <Field label="Notes" value={notes} onChangeText={setNotes} multiline />
      <Button
        label={photos.length ? "Photo added" : "Add photo"}
        tone="secondary"
        onPress={() => void captureEvidence().then((uri) => { if (uri) setPhotos((current) => [...current, uri]); })}
      />
      <Button
        label={busy ? "Saving" : "Confirm grade and weight"}
        disabled={busy}
        onPress={() =>
          void (async () => {
            const position = await readPosition();
            await run((state, ports, user) =>
              recordInspection(state, ports, user.id, {
                consignmentId: consignment.id,
                actualQuantity: Number(actual),
                rejectedQuantity: Number(rejected),
                gradeCode: grade,
                notes,
                photoUris: photos,
                latitude: position?.latitude,
                longitude: position?.longitude,
                idempotencyKey: `inspection:${consignment.id}:${user.id}`,
                offline,
              }),
            );
          })()
        }
      />
    </Screen>
  );
}

export function SyncScreen() {
  const { db, user, run, busy, offline } = useCryo();
  const items = db.syncQueue.filter((item) => item.actorId === user?.id);
  return (
    <Screen title="Sync" subtitle={offline ? "You are offline. Your changes have been saved and will sync automatically when connectivity returns." : "Send saved field work."}>
      <Button label={busy ? "Syncing" : "Sync now"} disabled={busy || offline} onPress={() => void run((state, ports, actor) => flushSync(state, ports, actor.id))} />
      {items.length === 0 ? <Empty text="Nothing is waiting." /> : null}
      {items.map((item) => (
        <Card key={item.id}>
          <Text style={styles.title}>{item.action}</Text>
          <StatusBadge status={item.syncStatus} />
          {item.lastError ? <Text style={styles.meta}>{item.lastError}</Text> : null}
        </Card>
      ))}
    </Screen>
  );
}

export function RegisterFarmerScreen() {
  const { db, run, busy } = useCryo();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+23324400");
  const [village, setVillage] = useState("");
  const [produceId, setProduceId] = useState(db.produce[0]?.id ?? "");
  return (
    <Screen title="Register farmer" subtitle="A field agent can register a farmer who does not have the app.">
      <Field label="Name" value={name} onChangeText={setName} />
      <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Field label="Village" value={village} onChangeText={setVillage} />
      <View style={styles.wrap}>
        {db.produce.map((item) => (
          <Choice key={item.id} label={item.name} selected={item.id === produceId} onPress={() => setProduceId(item.id)} />
        ))}
      </View>
      <Button
        label={busy ? "Saving" : "Register"}
        disabled={busy}
        onPress={() =>
          void run((state, ports, user) =>
            registerFarmer(state, ports, user.id, {
              fullName: name,
              phone,
              village,
              community: village,
              location: village,
              produceIds: [produceId],
            }),
          )
        }
      />
    </Screen>
  );
}

export function AgentProfile() {
  const { user, db, signOut, resetDemo } = useCryo();
  const agent = db.fieldAgentProfiles.find((item) => item.userId === user?.id);
  return (
    <Screen title="Agent">
      <Card>
        <KeyValue label="Name" value={user?.fullName ?? ""} />
        <KeyValue label="Area" value={agent?.assignedArea ?? ""} />
      </Card>
      <Button label="Sign out" tone="secondary" onPress={() => void signOut()} />
      <Button label="Reset demo data" tone="danger" onPress={() => void resetDemo()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 17, fontWeight: "700", letterSpacing: -0.2, color: colors.ink },
  meta: { color: colors.muted, marginVertical: 4, lineHeight: 20, fontSize: 14 },
  name: { fontSize: 15, color: colors.ink, flex: 1, marginRight: 8, fontWeight: "600" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.line },
  label: { fontSize: 12, fontWeight: "700", letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 8, color: colors.muted },
  wrap: { flexDirection: "row", flexWrap: "wrap", marginBottom: 8 },
});
