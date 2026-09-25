import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { useCryo } from "../../state/CryoProvider";
import { Button, Card, Empty, Field, KeyValue, MoneyRow, Screen, StatusBadge } from "../../components/ui";
import { formatGhs } from "../../domain/money";
import { produceName } from "../../domain/selectors";
import { payBuyerOrder, placeBuyerOrder, reorder, setBuyerSeat } from "../../domain/clientFlows";
import { acceptDelivery } from "../../domain/settlement";
import type { BuyerOrder, BuyerSeat, ProduceCategory } from "../../domain/types";
import { colors } from "../../theme";

const CATEGORIES: Array<{ id: ProduceCategory; label: string }> = [
  { id: "fruit", label: "Fruit" },
  { id: "vegetables", label: "Vegetables" },
  { id: "meat", label: "Meat" },
  { id: "fish", label: "Fish" },
  { id: "dairy", label: "Dairy" },
];

const PROGRESS = ["Submitted", "Approved", "Paid", "Allocated", "In collection", "Delivered", "Closed"] as const;

export type OfftakerParamList = {
  Market: undefined;
  LotDetail: { produceId: string };
  Orders: undefined;
  OrderDetail: { orderId: string };
  Payments: undefined;
  Team: undefined;
  Profile: undefined;
};

type MarketProps = NativeStackScreenProps<OfftakerParamList, "Market">;
type ProductProps = NativeStackScreenProps<OfftakerParamList, "LotDetail">;
type OrdersProps = NativeStackScreenProps<OfftakerParamList, "Orders">;
type OrderProps = NativeStackScreenProps<OfftakerParamList, "OrderDetail">;
type PaymentsProps = NativeStackScreenProps<OfftakerParamList, "Payments">;

function orderLabel(order: BuyerOrder): string {
  if (order.paymentStatus === "UNPAID") return "Awaiting confirmation";
  if (order.orderStatus === "IN_FULFILMENT") return "In collection";
  if (order.orderStatus === "ACCEPTED") return "Closed";
  if (order.orderStatus === "PAID") return "Paid";
  if (order.orderStatus === "DELIVERED") return "Delivered";
  if (order.orderStatus === "ALLOCATED") return "Allocated";
  if (order.orderStatus === "CANCELLED") return "Cancelled";
  return "Submitted";
}

function progressIndex(order: BuyerOrder): number {
  if (order.orderStatus === "ACCEPTED") return 6;
  if (order.orderStatus === "DELIVERED") return 5;
  if (order.orderStatus === "IN_FULFILMENT") return 4;
  if (order.orderStatus === "ALLOCATED") return 3;
  if (order.orderStatus === "PAID" || order.paymentStatus === "PAID") return 2;
  if (order.orderStatus === "AWAITING_PAYMENT") return 1;
  return 0;
}

function BuyerNav({
  navigation,
  current,
}: {
  navigation: { navigate: (route: "Market" | "Orders" | "Payments" | "Team") => void };
  current: "Market" | "Orders" | "Payments" | "Team";
}) {
  const items: Array<[typeof current, string]> = [
    ["Market", "Home"],
    ["Orders", "Orders"],
    ["Payments", "Payments"],
    ["Team", "Users"],
  ];
  return (
    <View style={styles.nav}>
      {items.map(([route, label]) => (
        <Pressable key={route} style={styles.navItem} onPress={() => navigation.navigate(route)}>
          <Text style={[styles.navLabel, current === route && styles.navOn]}>{label}</Text>
        </Pressable>
      ))}
    </View>
  );
}

export function MarketScreen({ navigation }: MarketProps) {
  const { db, user, run, signOut } = useCryo();
  const profile = db.offtakerProfiles.find((item) => item.userId === user?.id);
  const seat = profile?.buyerSeat ?? "admin";
  const [category, setCategory] = useState<ProduceCategory | "">("");
  const products = db.produce.filter((item) => item.category === category);
  const previous = db.buyerOrders.filter((item) => item.offtakerId === profile?.id);
  return (
    <Screen
      title={category ? CATEGORIES.find((item) => item.id === category)?.label ?? "Home" : (profile?.organization ?? "Home")}
      subtitle={category ? "Choose a product. You never see farmers or lot codes." : `Signed in as ${seat}. Pay in full before collection.`}
      footer={<BuyerNav navigation={navigation} current="Market" />}
    >
      {category ? (
        <Button label="All categories" tone="secondary" onPress={() => setCategory("")} />
      ) : (
        <View style={styles.grid}>
          {CATEGORIES.map((item) => (
            <Pressable key={item.id} style={styles.tile} onPress={() => setCategory(item.id)}>
              <Text style={styles.tileLabel}>{item.label}</Text>
            </Pressable>
          ))}
        </View>
      )}
      {category
        ? products.map((produce) => (
            <Pressable key={produce.id} onPress={() => navigation.navigate("LotDetail", { produceId: produce.id })}>
              <Card>
                <View style={styles.row}>
                  <Text style={styles.title}>{produce.name}</Text>
                  <Text style={styles.price}>{formatGhs(produce.pricePerKg ?? 0)}<Text style={styles.unit}> /kg</Text></Text>
                </View>
                <Text style={styles.meta}>Minimum order in kilograms. Lead time is set on the product page.</Text>
              </Card>
            </Pressable>
          ))
        : null}
      {!category ? <Text style={styles.section}>Reorder</Text> : null}
      {!category && previous.length === 0 ? <Empty text="Past orders appear here so you can reorder them." /> : null}
      {!category
        ? previous.slice(0, 3).map((item) => (
            <Card key={item.id}>
              <Text style={styles.title}>{produceName(db, item.produceId)} · {item.quantityKg} kg</Text>
              <Text style={styles.meta}>{item.deliveryDate}</Text>
              <Button label="Reorder" tone="secondary" onPress={() => void run((state, ports, actor) => reorder(state, ports, actor.id, item.id))} />
            </Card>
          ))
        : null}
      {!category ? <Button label="Sign out" tone="secondary" onPress={() => void signOut()} /> : null}
    </Screen>
  );
}

export function LotDetailScreen({ route, navigation }: ProductProps) {
  const { db, run, busy, user } = useCryo();
  const produce = db.produce.find((item) => item.id === route.params.produceId);
  const profile = db.offtakerProfiles.find((item) => item.userId === user?.id);
  const grades = db.gradeScales.find((item) => item.produceId === produce?.id)?.grades ?? [];
  const [kg, setKg] = useState(100);
  const [date, setDate] = useState("2026-10-08");
  if (!produce) return <Screen title="Product"><Empty text="Product was not found." /></Screen>;
  const price = produce.pricePerKg ?? 0;
  const total = kg * price;
  const seat = profile?.buyerSeat ?? "admin";
  return (
    <Screen title={produce.name} subtitle="Grade, kilograms, then delivery date. Pay CryoChain in full.">
      <Card>
        <View style={styles.row}>
          <View>
            <Text style={styles.title}>{produce.name}</Text>
            <Text style={styles.meta}>Steps of 10 kg</Text>
          </View>
          <Text style={styles.price}>{price.toFixed(2)}<Text style={styles.unit}> /kg</Text></Text>
        </View>
        {grades.length > 0 ? (
          <View style={styles.wrap}>
            {grades.map((grade) => (
              <View key={grade.code} style={styles.grade}>
                <Text style={styles.gradeText}>{grade.label}</Text>
              </View>
            ))}
          </View>
        ) : null}
      </Card>
      <Text style={styles.section}>Quantity, kg</Text>
      <View style={styles.stepper}>
        <Pressable style={styles.stepBtn} onPress={() => setKg((value) => Math.max(10, value - 10))}><Text style={styles.stepBtnText}>−</Text></Pressable>
        <View style={styles.stepValue}><Text style={styles.stepValueText}>{kg}</Text></View>
        <Pressable style={styles.stepBtn} onPress={() => setKg((value) => value + 10)}><Text style={styles.stepBtnText}>+</Text></Pressable>
      </View>
      <Field label="Delivery date" value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" />
      <Field label="Deliver to" value={profile?.deliveryLocation ?? ""} onChangeText={() => undefined} />
      <Card>
        <MoneyRow label={`${kg} kg × ${price.toFixed(2)}`} value={total} strong />
      </Card>
      <Button
        label={busy ? "Saving" : seat === "requester" ? "Submit for approval" : "Order and pay"}
        disabled={busy}
        onPress={() =>
          void run((state, ports, actor) => placeBuyerOrder(state, ports, actor.id, { produceId: produce.id, quantityKg: kg, deliveryDate: date })).then(async (order) => {
            if (!order) return;
            if (seat !== "requester") {
              await run((state, ports, actor) => payBuyerOrder(state, ports, actor.id, order.id));
            }
            navigation.navigate("OrderDetail", { orderId: order.id });
          })
        }
      />
    </Screen>
  );
}

export function OrdersScreen({ navigation }: OrdersProps) {
  const { db, user } = useCryo();
  const profile = db.offtakerProfiles.find((item) => item.userId === user?.id);
  const orders = db.buyerOrders.filter((item) => item.offtakerId === profile?.id);
  return (
    <Screen title="Orders" subtitle="Product, kilograms, date, order status and payment status." footer={<BuyerNav navigation={navigation} current="Orders" />}>
      {orders.length === 0 ? <Empty text="You have not placed an order yet." /> : null}
      {orders.map((item) => (
        <Pressable key={item.id} onPress={() => navigation.navigate("OrderDetail", { orderId: item.id })}>
          <Card>
            <View style={styles.row}>
              <Text style={styles.title}>{produceName(db, item.produceId)}</Text>
              <StatusBadge status={item.paymentStatus === "UNPAID" ? "AWAITING_PAYMENT" : item.orderStatus} />
            </View>
            <View style={styles.row}>
              <Text style={styles.meta}>{item.quantityKg} kg · {item.deliveryDate}</Text>
              <Text style={styles.price}>{formatGhs(item.totalGhs)}</Text>
            </View>
            <Text style={styles.meta}>{orderLabel(item)}</Text>
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}

export function OrderDetailScreen({ route, navigation }: OrderProps) {
  const { db, run, busy, user } = useCryo();
  const order = db.buyerOrders.find((item) => item.id === route.params.orderId);
  const profile = db.offtakerProfiles.find((item) => item.userId === user?.id);
  const lot = db.lots.find((item) => item.id === order?.lotId);
  const delivery = db.deliveries.find((item) => item.lotId === lot?.id);
  if (!order) return <Screen title="Order"><Empty text="Order was not found." /></Screen>;
  const seat = profile?.buyerSeat ?? "admin";
  const limit = profile?.paymentLimitGhs ?? 0;
  const overLimit = seat === "approver" && order.totalGhs > limit;
  const step = progressIndex(order);
  return (
    <Screen title={produceName(db, order.produceId)} subtitle="Your order. Farmer names and lot codes stay with operations.">
      <View style={styles.progress}>
        {PROGRESS.map((label, index) => (
          <View key={label} style={[styles.progressBar, index <= step ? styles.progressOn : null]} />
        ))}
      </View>
      <Text style={styles.meta}>{PROGRESS[step]}</Text>
      <Card>
        <KeyValue label="Kilograms" value={`${order.quantityKg} kg`} />
        <KeyValue label="Delivery date" value={order.deliveryDate} />
        <KeyValue label="Order status" value={orderLabel(order)} />
        <KeyValue label="Payment status" value={order.paymentStatus === "PAID" ? "Confirmed" : "Awaiting confirmation"} />
        <MoneyRow label="Order total" value={order.totalGhs} strong />
        {delivery ? <KeyValue label="Delivery" value={delivery.status} /> : null}
      </Card>
      {overLimit ? (
        <Card>
          <Text style={styles.warn}>This order is above your payment limit of {formatGhs(limit)}. An admin has to pay it.</Text>
        </Card>
      ) : null}
      {order.paymentStatus !== "PAID" && seat !== "requester" ? (
        <Button
          label={busy ? "Paying" : "Pay in full"}
          disabled={busy || overLimit}
          onPress={() => void run((state, ports, actor) => payBuyerOrder(state, ports, actor.id, order.id))}
        />
      ) : null}
      {order.paymentStatus === "PAID" ? (
        <Card>
          <Text style={styles.good}>Payment confirmed. Collection is scheduled only after this confirmation.</Text>
        </Card>
      ) : null}
      <Button label="Reorder" tone="secondary" onPress={() => void run((state, ports, actor) => reorder(state, ports, actor.id, order.id)).then(() => navigation.navigate("Orders"))} />
      {lot && delivery?.status === "DELIVERED" ? (
        <Button label="Accept delivery" disabled={busy} onPress={() => void run((state, ports, actor) => acceptDelivery(state, ports, actor.id, lot.id))} />
      ) : null}
    </Screen>
  );
}

export function PaymentsScreen({ navigation }: PaymentsProps) {
  const { db, user } = useCryo();
  const profile = db.offtakerProfiles.find((item) => item.userId === user?.id);
  const orders = db.buyerOrders.filter((item) => item.offtakerId === profile?.id);
  return (
    <Screen title="Payments" subtitle="Receipts for orders paid to CryoChain. Collection waits until payment is confirmed." footer={<BuyerNav navigation={navigation} current="Payments" />}>
      {orders.length === 0 ? <Empty text="Payments appear after you place an order." /> : null}
      {orders.map((item) => (
        <Pressable key={item.id} onPress={() => navigation.navigate("OrderDetail", { orderId: item.id })}>
          <Card>
            <View style={styles.row}>
              <Text style={styles.title}>{produceName(db, item.produceId)}</Text>
              <Text style={styles.price}>{formatGhs(item.totalGhs)}</Text>
            </View>
            <Text style={styles.meta}>{item.quantityKg} kg · {item.deliveryDate}</Text>
            <StatusBadge status={item.paymentStatus === "PAID" ? "PAID" : "AWAITING_PAYMENT"} />
          </Card>
        </Pressable>
      ))}
    </Screen>
  );
}

export function TeamScreen({ navigation }: NativeStackScreenProps<OfftakerParamList, "Team">) {
  const { db, run, user, signOut } = useCryo();
  const mine = db.offtakerProfiles.find((item) => item.userId === user?.id);
  const admin = (mine?.buyerSeat ?? "admin") === "admin";
  return (
    <Screen title="Users" subtitle="Requester submits. Approver pays up to a limit. Admin manages users." footer={<BuyerNav navigation={navigation} current="Team" />}>
      {db.offtakerProfiles.map((item) => {
        const person = db.users.find((entry) => entry.id === item.userId);
        return (
          <Card key={item.id}>
            <Text style={styles.title}>{person?.fullName}</Text>
            <Text style={styles.meta}>{item.organization} · {item.buyerSeat ?? "admin"}{item.buyerSeat === "approver" ? ` · limit ${formatGhs(item.paymentLimitGhs ?? 0)}` : ""}</Text>
            {admin ? (
              <View style={styles.wrap}>
                {(["requester", "approver", "admin"] as BuyerSeat[]).map((seat) => (
                  <Button
                    key={seat}
                    label={seat}
                    tone="secondary"
                    onPress={() => void run((state, ports, actor) => setBuyerSeat(state, ports, actor.id, { profileId: item.id, seat, paymentLimitGhs: seat === "approver" ? 8000 : 50000 }))}
                  />
                ))}
              </View>
            ) : null}
          </Card>
        );
      })}
      <Button label="Sign out" tone="secondary" onPress={() => void signOut()} />
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
        <KeyValue label="Seat" value={profile?.buyerSeat ?? "admin"} />
        <KeyValue label="Delivery" value={profile?.deliveryLocation ?? ""} />
      </Card>
      <Button label="Sign out" tone="secondary" onPress={() => void signOut()} />
      <Button label="Reset demo data" tone="danger" onPress={() => void resetDemo()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 16, fontWeight: "600", color: colors.ink, marginBottom: 2 },
  meta: { color: colors.muted, marginBottom: 4, lineHeight: 20, fontSize: 12 },
  price: { fontSize: 16, fontWeight: "600", color: colors.ink, fontVariant: ["tabular-nums"] },
  unit: { fontSize: 12, fontWeight: "400", color: colors.muted },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  tile: { flexGrow: 1, flexBasis: "46%", minHeight: 104, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.line, borderRadius: 8, justifyContent: "flex-end", padding: 14 },
  tileLabel: { fontSize: 16, fontWeight: "600", color: colors.ink },
  section: { marginTop: 16, marginBottom: 8, fontSize: 12, fontWeight: "600", color: colors.muted },
  stepper: { flexDirection: "row", gap: 8, marginBottom: 12 },
  stepBtn: { width: 56, height: 56, borderWidth: 1, borderColor: colors.lineStrong, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  stepBtnText: { fontSize: 24, color: colors.ink },
  stepValue: { flex: 1, height: 56, borderWidth: 1, borderColor: colors.lineStrong, borderRadius: 6, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  stepValueText: { fontSize: 24, fontWeight: "600", color: colors.ink, fontVariant: ["tabular-nums"] },
  grade: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: colors.lineStrong, backgroundColor: colors.surface },
  gradeText: { fontSize: 14, fontWeight: "600", color: colors.ink },
  progress: { flexDirection: "row", gap: 3, marginBottom: 8 },
  progressBar: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.lineStrong },
  progressOn: { backgroundColor: colors.green },
  warn: { color: colors.danger, lineHeight: 20 },
  good: { color: colors.green, lineHeight: 20 },
  nav: { flexDirection: "row", borderTopWidth: 1, borderTopColor: colors.line, backgroundColor: colors.surface },
  navItem: { flex: 1, height: 56, alignItems: "center", justifyContent: "center" },
  navLabel: { fontSize: 12, fontWeight: "600", color: colors.muted },
  navOn: { color: colors.primary },
});
