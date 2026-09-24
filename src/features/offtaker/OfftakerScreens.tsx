import { useState } from "react";
import { Pressable, StyleSheet, Text } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCryo } from "../../state/CryoProvider";
import { Button, Card, Empty, Field, KeyValue, MoneyRow, Screen, StatusBadge } from "../../components/ui";
import { formatGhs } from "../../domain/money";
import { escrowInstructionForLot, farmerName, lotConsignments, produceName, visibleLots } from "../../domain/selectors";
import { commitToLot, confirmEscrowFunding, createRequirement, initiateEscrow } from "../../domain/trade";
import { acceptDelivery } from "../../domain/settlement";
import { colors } from "../../theme";

export type OfftakerParamList = {
  Market: undefined;
  LotDetail: { id: string };
  Orders: undefined;
  OrderDetail: { lotId: string };
  Requirements: undefined;
  Profile: undefined;
};

type MarketProps = NativeStackScreenProps<OfftakerParamList, "Market">;
type LotProps = NativeStackScreenProps<OfftakerParamList, "LotDetail">;
type OrdersProps = NativeStackScreenProps<OfftakerParamList, "Orders">;
type OrderProps = NativeStackScreenProps<OfftakerParamList, "OrderDetail">;

export function MarketScreen({ navigation }: MarketProps) {
  const { db, user } = useCryo();
  if (!user) return null;
  const lots = visibleLots(db, user).filter((item) => item.status === "PUBLISHED");
  return (
    <Screen title="Lots" subtitle="Aggregated farmer consignments. Each farmer stays visible.">
      {lots.length === 0 ? <Empty text="No lots are open for commitment." /> : null}
      {lots.map((lot) => {
        const consignments = lotConsignments(db, lot.id);
        const quantity = consignments.reduce((sum, item) => sum + item.expectedQuantity, 0);
        return (
          <Pressable key={lot.id} onPress={() => navigation.navigate("LotDetail", { id: lot.id })}>
            <Card>
              <Text style={styles.title}>{lot.code} · {produceName(db, lot.produceId)}</Text>
              <Text style={styles.meta}>{quantity} kg · {consignments.length} consignments · {lot.origin}</Text>
              <Text style={styles.meta}>{formatGhs(lot.pricePerUnit)} / kg · {lot.gradeExpectation}</Text>
              <StatusBadge status={lot.orderState} />
            </Card>
          </Pressable>
        );
      })}
      <Button label="Standing requirements" tone="secondary" onPress={() => navigation.navigate("Requirements")} />
      <Button label="My orders" tone="secondary" onPress={() => navigation.navigate("Orders")} />
      <Button label="Account" tone="secondary" onPress={() => navigation.navigate("Profile")} />
    </Screen>
  );
}

export function LotDetailScreen({ route, navigation }: LotProps) {
  const { db, run, busy, simulateFunding } = useCryo();
  const lot = db.lots.find((item) => item.id === route.params.id);
  if (!lot) return <Screen title="Lot"><Empty text="Lot was not found." /></Screen>;
  const consignments = lotConsignments(db, lot.id);
  const instruction = escrowInstructionForLot(db, lot.id);
  const commitment = db.commitments.find((item) => item.lotId === lot.id);
  const escrow = db.escrows.find((item) => item.commitmentId === commitment?.id);
  return (
    <Screen title={lot.code} subtitle={`${produceName(db, lot.produceId)} · ${lot.origin} to ${lot.destination}`}>
      <Card>
        <StatusBadge status={commitment?.orderState ?? lot.orderState} />
        <KeyValue label="Grade" value={lot.gradeExpectation} />
        <KeyValue label="Window" value={`${lot.deliveryWindowStart} to ${lot.deliveryWindowEnd}`} />
        {consignments.map((item) => (
          <KeyValue key={item.id} label={farmerName(db, item.farmerId)} value={`${item.expectedQuantity} ${item.unit}`} />
        ))}
      </Card>
      {instruction ? (
        <Card>
          <Text style={styles.title}>Order total</Text>
          <MoneyRow label="Lot value" value={instruction.lotValue} />
          <MoneyRow label="Other charges" value={instruction.otherCharges} />
          <MoneyRow label="Order total" value={instruction.totalEscrowRequirement} strong />
        </Card>
      ) : null}
      {!commitment ? (
        <Button
          label={busy ? "Saving" : "Order and pay"}
          disabled={busy}
          onPress={() =>
            void run((state, ports, user) => commitToLot(state, ports, user.id, lot.id)).then(async (created) => {
              if (!created) return;
              await run((state, ports, user) => initiateEscrow(state, ports, user.id, created.id));
              navigation.navigate("OrderDetail", { lotId: lot.id });
            })
          }
        />
      ) : (
        <Button label="View order" onPress={() => navigation.navigate("OrderDetail", { lotId: lot.id })} />
      )}
      {escrow ? (
        <Card>
          <KeyValue label="Reference" value={escrow.externalReference} />
          <KeyValue label="Status" value={escrow.status} />
          {escrow.status === "PENDING" ? (
            <>
              <Button label="Simulate payment confirmation" tone="secondary" onPress={() => simulateFunding(escrow.externalReference)} />
              <Button
                label="Check funding"
                disabled={busy}
                onPress={() => void run((state, ports, user) => confirmEscrowFunding(state, ports, user.id, escrow.id))}
              />
            </>
          ) : null}
        </Card>
      ) : null}
    </Screen>
  );
}

export function OrdersScreen({ navigation }: OrdersProps) {
  const { db, user } = useCryo();
  const profile = db.offtakerProfiles.find((item) => item.userId === user?.id);
  const commitments = db.commitments.filter((item) => item.offtakerId === profile?.id);
  return (
    <Screen title="Orders">
      {commitments.length === 0 ? <Empty text="You have not committed to a lot yet." /> : null}
      {commitments.map((item) => {
        const lot = db.lots.find((lotItem) => lotItem.id === item.lotId);
        return (
          <Pressable key={item.id} onPress={() => navigation.navigate("OrderDetail", { lotId: item.lotId })}>
            <Card>
              <Text style={styles.title}>{lot?.code}</Text>
              <Text style={styles.meta}>{lot ? produceName(db, lot.produceId) : ""}</Text>
              <StatusBadge status={item.orderState} />
            </Card>
          </Pressable>
        );
      })}
    </Screen>
  );
}

export function OrderDetailScreen({ route }: OrderProps) {
  const { db, run, busy } = useCryo();
  const lot = db.lots.find((item) => item.id === route.params.lotId);
  const commitment = db.commitments.find((item) => item.lotId === lot?.id);
  const delivery = db.deliveries.find((item) => item.lotId === lot?.id);
  const proof = db.proofs.find((item) => item.deliveryId === delivery?.id);
  const temps = db.temperatures.filter((item) => item.manifestId && lot && db.stops.some((stop) => stop.id === item.stopId && stop.lotId === lot.id));
  if (!lot || !commitment) return <Screen title="Order"><Empty text="Order was not found." /></Screen>;
  return (
    <Screen title={lot.code} subtitle="Delivery and acceptance">
      <Card>
        <StatusBadge status={commitment.orderState} />
        <KeyValue label="Destination" value={lot.destination} />
        <KeyValue label="Delivery status" value={delivery?.status ?? "Not dispatched"} />
        {lotConsignments(db, lot.id).map((item) => (
          <KeyValue
            key={item.id}
            label={farmerName(db, item.farmerId)}
            value={`${item.acceptedWeight ?? item.expectedQuantity} ${item.unit} ${item.gradeCode ? `· grade ${item.gradeCode}` : ""}`}
          />
        ))}
        {temps.map((item) => (
          <KeyValue key={item.id} label="Temperature" value={`${item.temperature}°${item.unit}`} />
        ))}
        {proof ? <KeyValue label="Received by" value={proof.receiverName} /> : null}
        {proof ? <KeyValue label="Delivered" value={proof.timestamp} /> : null}
      </Card>
      {commitment.orderState === "DELIVERED" ? (
        <Button
          label={busy ? "Saving" : "Accept delivery"}
          disabled={busy}
          onPress={() => void run((state, ports, user) => acceptDelivery(state, ports, user.id, lot.id))}
        />
      ) : null}
      {commitment.orderState === "ACCEPTED" ? <Text style={styles.meta}>Accepted. Operations can approve the farmer payout.</Text> : null}
    </Screen>
  );
}

export function RequirementsScreen() {
  const { db, user, run, busy } = useCryo();
  const profile = db.offtakerProfiles.find((item) => item.userId === user?.id);
  const mine = db.standingRequirements.filter((item) => item.offtakerId === profile?.id);
  const [produceId, setProduceId] = useState(db.produce[0]?.id ?? "");
  const [quantity, setQuantity] = useState("1000");
  const [location, setLocation] = useState(profile?.deliveryLocation ?? "");
  return (
    <Screen title="Requirements" subtitle="Tell operations what you need on a standing basis.">
      {mine.map((item) => (
        <Card key={item.id}>
          <Text style={styles.title}>{produceName(db, item.produceId)} · {item.quantity} {item.unit}</Text>
          <Text style={styles.meta}>{item.deliveryLocation}</Text>
          <StatusBadge status={item.status} />
        </Card>
      ))}
      <Field label="Quantity (kg)" value={quantity} onChangeText={setQuantity} keyboardType="numeric" />
      <Field label="Delivery location" value={location} onChangeText={setLocation} />
      <Button
        label={busy ? "Saving" : "Post requirement"}
        disabled={busy}
        onPress={() =>
          void run((state, ports, actor) =>
            createRequirement(state, ports, actor.id, {
              produceId,
              quantity: Number(quantity),
              unit: "kg",
              gradeRequirement: "Grade A",
              deliveryLocation: location,
              deliveryWindowStart: "2026-10-01",
              deliveryWindowEnd: "2026-10-07",
            }),
          )
        }
      />
    </Screen>
  );
}

export function OfftakerProfile() {
  const { user, db, signOut, resetDemo } = useCryo();
  const profile = db.offtakerProfiles.find((item) => item.userId === user?.id);
  return (
    <Screen title="Account">
      <Card>
        <KeyValue label="Name" value={user?.fullName ?? ""} />
        <KeyValue label="Organisation" value={profile?.organization ?? ""} />
        <KeyValue label="Delivery" value={profile?.deliveryLocation ?? ""} />
      </Card>
      <Button label="Sign out" tone="secondary" onPress={() => void signOut()} />
      <Button label="Reset demo data" tone="danger" onPress={() => void resetDemo()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 17, fontWeight: "700", letterSpacing: -0.2, color: colors.ink, marginBottom: 2 },
  meta: { color: colors.muted, marginBottom: 4, lineHeight: 20, fontSize: 14 },
});
