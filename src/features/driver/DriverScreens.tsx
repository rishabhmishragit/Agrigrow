import { useEffect, useState } from "react";
import { Linking, StyleSheet, Text } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { config } from "../../config";
import { useCryo } from "../../state/CryoProvider";
import { Button, Card, Choice, Empty, Field, KeyValue, Screen, StatusBadge } from "../../components/ui";
import { markDeparted } from "../../domain/clientFlows";
import {
  arriveAtStop,
  confirmCollection,
  confirmDelivery,
  departWithLoad,
  postLocationPing,
  recordTemperature,
} from "../../domain/fieldOps";
import { readPosition } from "../../services/device";
import { captureEvidence } from "../../services/device";
import { colors } from "../../theme";

export type DriverParamList = {
  Manifest: undefined;
  Stop: { id: string };
  Profile: undefined;
};

type ManifestProps = NativeStackScreenProps<DriverParamList, "Manifest">;
type StopProps = NativeStackScreenProps<DriverParamList, "Stop">;

export function ManifestScreen({ navigation }: ManifestProps) {
  const { db, user, offline, forceOffline, setForceOffline, run } = useCryo();
  const driver = db.driverProfiles.find((item) => item.userId === user?.id);
  const manifest = db.manifests.find((item) => item.driverId === driver?.id && item.status !== "COMPLETED");
  const vehicle = db.vehicles.find((item) => item.id === manifest?.vehicleId);
  const stops = db.stops
    .filter((item) => item.manifestId === manifest?.id)
    .slice()
    .sort((a, b) => a.sequence - b.sequence);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (!sharing || !manifest || !user) return;
    const tick = () => {
      void (async () => {
        const position = await readPosition();
        if (!position) return;
        await run((state, ports, actor) =>
          postLocationPing(state, ports, actor.id, {
            manifestId: manifest.id,
            latitude: position.latitude,
            longitude: position.longitude,
            idempotencyKey: `ping:${manifest.id}:${ports.now()}`,
            offline,
          }),
        );
      })();
    };
    const timer = setInterval(tick, Math.max(config.trackingIntervalSeconds, 30) * 1000);
    return () => clearInterval(timer);
  }, [sharing, manifest, user, offline, run]);

  if (!manifest) return <Screen title="Route"><Empty text="No manifest is assigned today." /></Screen>;
  const pending = stops.filter((item) => item.status !== "COLLECTED" && item.status !== "DELIVERED");
  const queued = db.syncQueue.filter((item) => item.actorId === user?.id && item.syncStatus !== "SYNCED").length;
  return (
    <Screen title="Today's route" subtitle={`${manifest.code} · ${vehicle?.plate ?? "Truck"} · ${offline ? "Offline" : "Online"}`}>
      <Card>
        <KeyValue label="Route" value={manifest.routeLabel} />
        <KeyValue label="Destination" value={manifest.destination} />
        <KeyValue label="Pending actions" value={String(pending.length)} />
        <KeyValue label="Offline queue" value={String(queued)} />
      </Card>
      <Button label={forceOffline ? "Offline mode on" : "Work offline"} tone="secondary" onPress={() => setForceOffline(!forceOffline)} />
      <Button label="Account" tone="secondary" onPress={() => navigation.navigate("Profile")} />
      <Button label={sharing ? "Stop sharing position" : "Share position on this route"} tone="secondary" onPress={() => setSharing((value) => !value)} />
      {stops.map((stop) => (
        <Card key={stop.id}>
          <Text style={styles.title}>{stop.sequence}. {stop.kind === "COLLECTION" ? "Farm gate" : "Delivery"}</Text>
          <Text style={styles.meta}>{stop.location}</Text>
          <Text style={styles.meta}>{stop.windowLabel}</Text>
          <StatusBadge status={stop.status} />
          <Button label="Open stop" onPress={() => navigation.navigate("Stop", { id: stop.id })} />
          {stop.latitude !== undefined ? (
            <Button
              label="Open map"
              tone="secondary"
              onPress={() => void Linking.openURL(`https://www.openstreetmap.org/?mlat=${stop.latitude}&mlon=${stop.longitude}#map=13/${stop.latitude}/${stop.longitude}`)}
            />
          ) : null}
        </Card>
      ))}
      {db.lots.filter((lot) => manifest.lotIds.includes(lot.id) && lot.orderState === "COLLECTED").map((lot) => (
        <Button key={lot.id} label={`Depart with ${lot.code}`} onPress={() => void run((state, ports, actor) => departWithLoad(state, ports, actor.id, lot.id))} />
      ))}
    </Screen>
  );
}

export function StopScreen({ route }: StopProps) {
  const { db, run, busy, offline } = useCryo();
  const stop = db.stops.find((item) => item.id === route.params.id);
  const [temperature, setTemperature] = useState("");
  const [checkpoint, setCheckpoint] = useState<"load" | "farm_stop" | "depart_last" | "arrival" | "handover">(stop?.kind === "DELIVERY" ? "arrival" : "farm_stop");
  const [gauge, setGauge] = useState<string | undefined>();
  const [receiver, setReceiver] = useState("");
  const [signature, setSignature] = useState("");
  const [accepted, setAccepted] = useState<Record<string, string>>({});
  const [rejected, setRejected] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [photo, setPhoto] = useState<string | undefined>();
  const queued = db.syncQueue.filter((item) => item.actorId && item.syncStatus !== "SYNCED").length;
  if (!stop) return <Screen title="Stop"><Empty text="Stop was not found." /></Screen>;
  const lines = db.consignments.filter((item) => stop.consignmentIds.includes(item.id));
  const appTime = db.temperatures.find((item) => item.stopId === stop.id)?.timestamp;
  return (
    <Screen title={stop.kind === "COLLECTION" ? "Farm gate" : "Delivery"} subtitle={`${stop.location} · ${offline ? "Offline" : "Online"} · queue ${queued}`}>
      <Card>
        <StatusBadge status={stop.status} />
        <KeyValue label="Window" value={stop.windowLabel} />
        {stop.arrivedAt ? <KeyValue label="Arrived" value={stop.arrivedAt} /> : null}
        {stop.departedAt ? <KeyValue label="Departed" value={stop.departedAt} /> : null}
        {lines.map((item) => (
          <KeyValue key={item.id} label="Price per kg" value={`${item.expectedQuantity} kg · ${item.agreedPricePerUnit} GHS`} />
        ))}
      </Card>
      <Button
        label="Mark arrived"
        tone="secondary"
        onPress={() =>
          void (async () => {
            const position = await readPosition();
            await run((state, ports, user) => arriveAtStop(state, ports, user.id, stop.id, position));
          })()
        }
      />
      <Text style={styles.meta}>Checkpoint</Text>
      {db.opsConfig.checkpoints.map((item) => (
        <Choice key={item} label={item.replace(/_/g, " ")} selected={checkpoint === item} onPress={() => setCheckpoint(item)} />
      ))}
      <Field label="Temperature (°C)" value={temperature} onChangeText={setTemperature} keyboardType="numeric" />
      <Button label={gauge ? "Gauge photo added" : "Gauge photo"} tone="secondary" onPress={() => void captureEvidence().then((uri) => { if (uri) setGauge(uri); })} />
      {appTime ? <Text style={styles.meta}>App time {appTime}. This time is not editable.</Text> : null}
      <Button
        label="Record temperature"
        tone="secondary"
        disabled={busy || !gauge || !temperature}
        onPress={() =>
          void (async () => {
            const position = await readPosition();
            await run((state, ports, user) =>
              recordTemperature(state, ports, user.id, {
                stopId: stop.id,
                temperature: Number(temperature),
                unit: "C",
                checkpoint,
                gaugePhotoUri: gauge,
                latitude: position?.latitude,
                longitude: position?.longitude,
                idempotencyKey: `temp:${stop.id}:${checkpoint}`,
                offline,
              }),
            );
          })()
        }
      />
      {stop.kind === "COLLECTION" ? (
        <>
          <Button label="Arrived" tone="secondary" onPress={() => void (async () => { const position = await readPosition(); await run((state, ports, user) => arriveAtStop(state, ports, user.id, stop.id, position)); })()} />
          <Button
            label={busy ? "Saving" : "Collected"}
            disabled={busy}
            onPress={() =>
              void (async () => {
                const position = await readPosition();
                await run((state, ports, user) => confirmCollection(state, ports, user.id, { stopId: stop.id, idempotencyKey: `collect:${stop.id}`, offline, latitude: position?.latitude, longitude: position?.longitude }));
              })()
            }
          />
          <Button label="Departed" tone="secondary" onPress={() => void run((state, ports, user) => markDeparted(state, ports, user.id, stop.id))} />
        </>
      ) : (
        <>
          {lines.map((item) => (
            <Card key={item.id}>
              <Text style={styles.title}>{item.expectedQuantity} kg expected</Text>
              <Field label="Accepted kg" value={accepted[item.id] ?? ""} onChangeText={(value) => setAccepted((current) => ({ ...current, [item.id]: value }))} keyboardType="numeric" />
              <Field label="Rejected kg" value={rejected[item.id] ?? ""} onChangeText={(value) => setRejected((current) => ({ ...current, [item.id]: value }))} keyboardType="numeric" />
            </Card>
          ))}
          <Field label="Reason for rejected kg" value={reason} onChangeText={setReason} />
          <Field label="Receiver name" value={receiver} onChangeText={setReceiver} />
          <Field label="Signature (type full name)" value={signature} onChangeText={setSignature} />
          <Button label={photo ? "Photo added" : "Add proof photo"} tone="secondary" onPress={() => void captureEvidence().then((uri) => { if (uri) setPhoto(uri); })} />
          <Button
            label={busy ? "Saving" : "Confirm handover"}
            disabled={busy}
            onPress={() =>
              void (async () => {
                const position = await readPosition();
                await run((state, ports, user) =>
                  confirmDelivery(state, ports, user.id, {
                    stopId: stop.id,
                    receiverName: receiver,
                    signatureName: signature,
                    notes: reason,
                    photoUris: photo ? [photo] : [],
                    lineItems: lines.map((item) => ({ consignmentId: item.id, acceptedKg: Number(accepted[item.id] ?? 0), rejectedKg: Number(rejected[item.id] ?? 0), reason })),
                    latitude: position?.latitude,
                    longitude: position?.longitude,
                    idempotencyKey: `deliver:${stop.id}`,
                    offline,
                  }),
                );
              })()
            }
          />
        </>
      )}
    </Screen>
  );
}

export function DriverProfile() {
  const { user, db, signOut, resetDemo, offline } = useCryo();
  const driver = db.driverProfiles.find((item) => item.userId === user?.id);
  const vehicle = db.vehicles.find((item) => item.id === driver?.vehicleId);
  return (
    <Screen title="Driver" subtitle={offline ? "You are offline. Stamps stay on this phone until sync." : "Online"}>
      <Card>
        <KeyValue label="Name" value={user?.fullName ?? ""} />
        <KeyValue label="Vehicle" value={vehicle ? `${vehicle.plate} · ${vehicle.type}` : "Unassigned"} />
      </Card>
      <Button label="Sign out" tone="secondary" onPress={() => void signOut()} />
      <Button label="Reset demo data" tone="danger" onPress={() => void resetDemo()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 17, fontWeight: "700", letterSpacing: -0.2, color: colors.ink },
  meta: { color: colors.muted, marginTop: 4, fontSize: 14, lineHeight: 20 },
});
