import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCryo } from "../../state/CryoProvider";
import { Button, Card, Choice, Empty, Field, KeyValue, MoneyRow, Screen, StatusBadge } from "../../components/ui";
import { formatGhs } from "../../domain/money";
import { farmerName, produceName } from "../../domain/selectors";
import { acceptCollectionBooking, createListing } from "../../domain/trade";
import { handleUssd } from "../../domain/ussdGateway";
import { colors } from "../../theme";

export type FarmerParamList = {
  FarmerHome: undefined;
  NewListing: undefined;
  ListingDetail: { id: string };
  SettlementDetail: { id: string };
  Ussd: undefined;
  Notifications: undefined;
  Profile: undefined;
};

type HomeProps = NativeStackScreenProps<FarmerParamList, "FarmerHome">;
type NewProps = NativeStackScreenProps<FarmerParamList, "NewListing">;
type ListingProps = NativeStackScreenProps<FarmerParamList, "ListingDetail">;
type SettlementProps = NativeStackScreenProps<FarmerParamList, "SettlementDetail">;

export function FarmerHome({ navigation }: HomeProps) {
  const { db, user } = useCryo();
  const farmer = db.farmerProfiles.find((item) => item.userId === user?.id);
  const listings = db.listings.filter((item) => item.farmerId === farmer?.id);
  const settlements = db.settlements.filter((item) => item.farmerId === farmer?.id);
  const upcoming = db.consignments.filter((item) => item.farmerId === farmer?.id && item.status === "SCHEDULED");
  return (
    <Screen title={`Hello${user ? `, ${user.fullName.split(" ")[0]}` : ""}`} subtitle="List produce, follow pickups, and see how you were paid.">
      <Button label="List produce" onPress={() => navigation.navigate("NewListing")} />
      <View style={styles.links}>
        <Button label="Phone menu (USSD)" tone="secondary" onPress={() => navigation.navigate("Ussd")} />
        <Button label="Messages" tone="secondary" onPress={() => navigation.navigate("Notifications")} />
        <Button label="My details" tone="secondary" onPress={() => navigation.navigate("Profile")} />
      </View>
      <Text style={styles.section}>Active listings</Text>
      {listings.filter((item) => item.status !== "SETTLED" && item.status !== "CANCELLED").length === 0 ? <Empty text="No active listings." /> : null}
      {listings
        .filter((item) => item.status !== "SETTLED" && item.status !== "CANCELLED")
        .map((item) => (
          <Pressable key={item.id} onPress={() => navigation.navigate("ListingDetail", { id: item.id })}>
            <Card>
              <Text style={styles.cardTitle}>{produceName(db, item.produceId)}</Text>
              <Text style={styles.meta}>{item.quantity} {item.unit} · {item.pickupLocation}</Text>
              <StatusBadge status={item.status} />
            </Card>
          </Pressable>
        ))}
      <Text style={styles.section}>Upcoming pickup</Text>
      {upcoming.length === 0 ? <Empty text="No pickup booked yet." /> : null}
      {upcoming.map((item) => (
        <Card key={item.id}>
          <Text style={styles.cardTitle}>{produceName(db, item.produceId)}</Text>
          <Text style={styles.meta}>{item.expectedQuantity} {item.unit}</Text>
          <StatusBadge status={item.bookingAccepted ? "ACCEPTED" : "SCHEDULED"} />
        </Card>
      ))}
      <Text style={styles.section}>Payments</Text>
      {settlements.length === 0 ? <Empty text="No completed payment yet." /> : null}
      {settlements.map((item) => (
        <Pressable key={item.id} onPress={() => navigation.navigate("SettlementDetail", { id: item.id })}>
          <Card>
            <Text style={styles.cardTitle}>{formatGhs(item.netSettlement)}</Text>
            <StatusBadge status={item.status} />
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}

export function NewListing({ navigation }: NewProps) {
  const { db, run, busy } = useCryo();
  const [produceId, setProduceId] = useState(db.produce[0]?.id ?? "");
  const [quantity, setQuantity] = useState("");
  const [date, setDate] = useState("2026-09-26");
  const [place, setPlace] = useState("");
  const [notes, setNotes] = useState("");
  return (
    <Screen title="List produce" subtitle="Tell CryoChain what is ready. Keep the numbers simple.">
      <Text style={styles.label}>Produce</Text>
      <View style={styles.wrap}>
        {db.produce.map((item) => (
          <Choice key={item.id} label={item.name} selected={item.id === produceId} onPress={() => setProduceId(item.id)} />
        ))}
      </View>
      <Field label="Quantity (kg)" value={quantity} onChangeText={setQuantity} keyboardType="numeric" />
      <Field label="Available date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
      <Field label="Pickup place" value={place} onChangeText={setPlace} placeholder="Village or community" />
      <Field label="Notes" value={notes} onChangeText={setNotes} multiline />
      <Button
        label={busy ? "Saving" : "Save listing"}
        disabled={busy}
        onPress={() =>
          void run((state, ports, user) =>
            createListing(state, ports, user.id, {
              produceId,
              quantity: Number(quantity),
              unit: "kg",
              availableDate: date,
              pickupLocation: place,
              notes,
            }),
          ).then((listing) => {
            if (listing) navigation.replace("ListingDetail", { id: listing.id });
          })
        }
      />
    </Screen>
  );
}

export function ListingDetail({ route }: ListingProps) {
  const { db, run, busy } = useCryo();
  const listing = db.listings.find((item) => item.id === route.params.id);
  const consignment = db.consignments.find((item) => item.listingId === listing?.id);
  const lot = db.lots.find((item) => item.id === consignment?.lotId);
  const stop = db.stops.find((item) => item.id === consignment?.collectionStopId);
  if (!listing) return <Screen title="Listing"><Empty text="This listing is no longer available." /></Screen>;
  return (
    <Screen title={produceName(db, listing.produceId)} subtitle={listing.pickupLocation}>
      <Card>
        <StatusBadge status={listing.status} />
        <KeyValue label="Quantity" value={`${listing.quantity} ${listing.unit}`} />
        <KeyValue label="Available" value={listing.availableDate} />
        <KeyValue label="Lot" value={lot?.code ?? "Not grouped yet"} />
        {stop ? <KeyValue label="Pickup window" value={stop.windowLabel} /> : null}
        {stop ? <KeyValue label="Pickup place" value={stop.location} /> : null}
        {listing.notes ? <KeyValue label="Notes" value={listing.notes} /> : null}
      </Card>
      {consignment && consignment.status === "SCHEDULED" && !consignment.bookingAccepted ? (
        <Button
          label={busy ? "Saving" : "Accept pickup"}
          disabled={busy}
          onPress={() => void run((state, ports, user) => acceptCollectionBooking(state, ports, user.id, consignment.id))}
        />
      ) : null}
    </Screen>
  );
}

export function SettlementDetail({ route }: SettlementProps) {
  const { db } = useCryo();
  const settlement = db.settlements.find((item) => item.id === route.params.id);
  const consignment = db.consignments.find((item) => item.id === settlement?.consignmentId);
  if (!settlement || !consignment) return <Screen title="Payment"><Empty text="Payment record was not found." /></Screen>;
  return (
    <Screen title="Your payment" subtitle="This is calculated for your consignment only.">
      <Card>
        <KeyValue label="Produce" value={produceName(db, consignment.produceId)} />
        <KeyValue label="Confirmed weight" value={`${consignment.acceptedWeight ?? consignment.confirmedWeight ?? "—"} ${consignment.unit}`} />
        <KeyValue label="Price" value={`${formatGhs(consignment.agreedPricePerUnit)} per ${consignment.unit}`} />
        <MoneyRow label="Gross value" value={settlement.grossValue} />
        <MoneyRow label="Allocated collection fee" value={settlement.collectionFee} />
        {settlement.feeCapped ? <Text style={styles.note}>The fee was capped at 5% of your own consignment value.</Text> : null}
        <MoneyRow label="Net settlement" value={settlement.netSettlement} strong />
        <KeyValue label="Status" value={settlement.status} />
        <KeyValue label="Paid" value={settlement.paidAt ?? "Not yet"} />
        <KeyValue label="Payment reference" value={settlement.paymentReference ?? "—"} />
      </Card>
    </Screen>
  );
}

export function UssdScreen() {
  const { db, run } = useCryo();
  const [phone, setPhone] = useState("+233244009999");
  const [sessionId, setSessionId] = useState("demo-session");
  const [text, setText] = useState("");
  const [screenText, setScreenText] = useState("Press Start to open the phone menu.");
  const [started, setStarted] = useState(false);
  return (
    <Screen title="USSD menu" subtitle="The same farmer records as the app. A real aggregator can replace the mock transport later.">
      <Card>
        <Text style={styles.phone}>{screenText}</Text>
      </Card>
      <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
      <Field label="Reply" value={text} onChangeText={setText} />
      <Button
        label={started ? "Send" : "Start"}
        onPress={() =>
          void run((state, ports) =>
            handleUssd(state, ports, { sessionId, phone, text: started ? text : "", start: !started }),
          ).then((reply) => {
            if (!reply) return;
            setScreenText(reply.response);
            setStarted(!reply.end);
            setText("");
            if (reply.end) setSessionId(`demo-${Date.now()}`);
          })
        }
      />
      <Text style={styles.note}>Recent SMS for this phone</Text>
      {db.smsMessages.filter((item) => item.to === phone).slice(-3).map((item) => (
        <Card key={item.id}><Text>{item.body}</Text></Card>
      ))}
    </Screen>
  );
}

export function NotificationsScreen() {
  const { db, user } = useCryo();
  const notes = db.notifications.filter((item) => item.userId === user?.id).slice().reverse();
  const sms = db.smsMessages.filter((item) => item.userId === user?.id).slice().reverse();
  return (
    <Screen title="Messages">
      {notes.map((item) => (
        <Card key={item.id}>
          <Text style={styles.cardTitle}>{item.title}</Text>
          <Text style={styles.meta}>{item.body}</Text>
        </Card>
      ))}
      <Text style={styles.section}>SMS</Text>
      {sms.length === 0 ? <Empty text="No SMS yet." /> : null}
      {sms.map((item) => (
        <Card key={item.id}>
          <Text style={styles.meta}>{item.body}</Text>
          <StatusBadge status={item.status === "sent" ? "SETTLED" : "FAILED"} />
        </Card>
      ))}
    </Screen>
  );
}

export function ProfileScreen() {
  const { db, user, signOut, resetDemo, forceOffline, setForceOffline } = useCryo();
  const farmer = db.farmerProfiles.find((item) => item.userId === user?.id);
  return (
    <Screen title="My details">
      <Card>
        <KeyValue label="Name" value={user?.fullName ?? ""} />
        <KeyValue label="Phone" value={user?.phone ?? ""} />
        <KeyValue label="Village" value={farmer?.village ?? user?.location ?? ""} />
        <KeyValue label="Phone verified" value={farmer?.phoneVerified ? "Yes" : "No"} />
      </Card>
      <Button label={forceOffline ? "Working offline" : "Work offline"} tone="secondary" onPress={() => setForceOffline(!forceOffline)} />
      <Button label="Sign out" tone="secondary" onPress={() => void signOut()} />
      <Button label="Reset demo data" tone="danger" onPress={() => void resetDemo()} />
      <Text style={styles.note}>Farmer shown in records: {farmer ? farmerName(db, farmer.id) : "—"}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 18, fontWeight: "700", color: colors.ink, marginTop: 16, marginBottom: 8 },
  cardTitle: { fontSize: 18, fontWeight: "700", color: colors.ink, marginBottom: 4 },
  meta: { color: colors.muted, marginBottom: 8, lineHeight: 20 },
  links: { marginTop: 8 },
  label: { fontWeight: "700", marginBottom: 8, color: colors.ink },
  wrap: { flexDirection: "row", flexWrap: "wrap" },
  note: { color: colors.muted, marginTop: 8, lineHeight: 20 },
  phone: { fontFamily: "monospace", fontSize: 16, lineHeight: 24, color: colors.ink },
});
