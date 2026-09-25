import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { useCryo } from "../../state/CryoProvider";
import { Button, Card, Choice, Empty, Field, KeyValue, Metric, MoneyRow, Screen, StatusBadge } from "../../components/ui";
import { formatGhs } from "../../domain/money";
import {
  escrowInstructionForLot,
  farmerName,
  lotConsignments,
  opsKpis,
  previewConsignment,
  previewNewLot,
  produceName,
  userName,
} from "../../domain/selectors";
import { allocateBuyerOrder, approvePayoutRun, createPayoutRun, hoursLeft, recutConsignment, saveOpsConfig } from "../../domain/clientFlows";
import { releaseEscrow } from "../../domain/settlement";
import { createLot, scheduleCollection, updateException } from "../../domain/trade";
import { colors } from "../../theme";

const SECTIONS = [
  "Dashboard",
  "Orders",
  "Allocation",
  "Runs",
  "Payments",
  "Collections",
  "Manifests",
  "Deliveries",
  "Settlements",
  "Exceptions",
  "People",
  "Audit",
  "Settings",
] as const;

type Section = (typeof SECTIONS)[number];

const NAV = [
  { label: "Overview", items: ["Dashboard"] as Section[] },
  { label: "Trade", items: ["Orders", "Allocation", "Runs", "Payments", "Settlements"] as Section[] },
  { label: "Custody", items: ["Collections", "Manifests", "Deliveries"] as Section[] },
  { label: "Control", items: ["Exceptions", "People", "Audit", "Settings"] as Section[] },
];

export function OpsConsole() {
  const { width } = useWindowDimensions();
  const wide = width >= 960;
  const [section, setSection] = useState<Section>("Dashboard");
  return (
    <View style={[styles.frame, wide && styles.frameWide]}>
      {wide ? (
        <View style={styles.side}>
          <Text style={styles.brand}>CryoChain</Text>
          <Text style={styles.sideNote}>Operations console</Text>
          {NAV.map((group) => (
            <View key={group.label}>
              <Text style={styles.group}>{group.label}</Text>
              {group.items.map((item) => (
                <Pressable key={item} accessibilityRole="button" onPress={() => setSection(item)} style={[styles.sideItem, item === section && styles.sideOn]}>
                  <Text style={[styles.sideText, item === section && styles.sideTextOn]}>{item}</Text>
                </Pressable>
              ))}
            </View>
          ))}
        </View>
      ) : (
        <ScrollView horizontal style={styles.chips} contentContainerStyle={styles.chipRow}>
          {SECTIONS.map((item) => (
            <Pressable key={item} onPress={() => setSection(item)} style={[styles.chip, item === section && styles.chipOn]}>
              <Text style={[styles.chipText, item === section && styles.chipTextOn]}>{item}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}
      <View style={styles.main}>
        {section === "Dashboard" ? <Dashboard /> : null}
        {section === "Orders" ? <OrderBook /> : null}
        {section === "Allocation" ? <Allocation /> : null}
        {section === "Runs" ? <PayoutRuns /> : null}
        {section === "Payments" ? <EscrowPanel /> : null}
        {section === "Collections" ? <Collections /> : null}
        {section === "Manifests" ? <Manifests /> : null}
        {section === "Deliveries" ? <Deliveries /> : null}
        {section === "Settlements" ? <Settlements /> : null}
        {section === "Exceptions" ? <Exceptions /> : null}
        {section === "People" ? <People /> : null}
        {section === "Audit" ? <Audit /> : null}
        {section === "Settings" ? <Settings /> : null}
      </View>
    </View>
  );
}

function OrderBook() {
  const { db } = useCryo();
  const paid = db.buyerOrders.filter((item) => item.paymentStatus === "PAID");
  return (
    <Screen title="Orders" subtitle="Paid buyer orders. Farmers and consignments stay on Allocation.">
      {paid.length === 0 ? <Empty text="No paid orders yet." /> : null}
      {paid.map((item) => (
        <Card key={item.id}>
          <Text style={styles.rowTitle}>{produceName(db, item.produceId)} · {item.quantityKg} kg</Text>
          <Text style={styles.meta}>{item.deliveryDate} · {formatGhs(item.totalGhs)}</Text>
          <StatusBadge status={item.orderStatus} />
        </Card>
      ))}
    </Screen>
  );
}

function Allocation() {
  const { db, run, busy } = useCryo();
  const [orderId, setOrderId] = useState(db.buyerOrders.find((item) => item.paymentStatus === "PAID")?.id ?? "");
  const [farmerId, setFarmerId] = useState(db.farmerProfiles[0]?.id ?? "");
  const [kg, setKg] = useState("100");
  const [price, setPrice] = useState("4.50");
  const order = db.buyerOrders.find((item) => item.id === orderId);
  const consignments = order?.lotId ? lotConsignments(db, order.lotId) : [];
  return (
    <Screen title="Allocation" subtitle="Split a paid order across farmers. Price is set per consignment.">
      <Text style={styles.meta}>Order</Text>
      <View style={styles.wrap}>
        {db.buyerOrders.filter((item) => item.paymentStatus === "PAID").map((item) => (
          <Choice key={item.id} label={`${produceName(db, item.produceId)} ${item.quantityKg} kg`} selected={item.id === orderId} onPress={() => setOrderId(item.id)} />
        ))}
      </View>
      <Text style={styles.meta}>Farmer</Text>
      <View style={styles.wrap}>
        {db.farmerProfiles.map((item) => (
          <Choice key={item.id} label={farmerName(db, item.id)} selected={item.id === farmerId} onPress={() => setFarmerId(item.id)} />
        ))}
      </View>
      <Field label="Kilograms for this consignment" value={kg} onChangeText={setKg} keyboardType="numeric" />
      <Field label="Price per kg" value={price} onChangeText={setPrice} keyboardType="numeric" />
      <Button
        label={busy ? "Saving" : "Add consignment"}
        disabled={busy || !order}
        onPress={() => order ? void run((state, ports, user) => allocateBuyerOrder(state, ports, user.id, { orderId: order.id, splits: [...(order.lotId ? lotConsignments(state, order.lotId).map((item) => ({ farmerId: item.farmerId, kg: item.expectedQuantity, pricePerKg: item.agreedPricePerUnit })) : []), { farmerId, kg: Number(kg), pricePerKg: Number(price) }] })) : undefined}
      />
      {consignments.map((item) => (
        <Card key={item.id}>
          <Text style={styles.rowTitle}>{farmerName(db, item.farmerId)} · {item.expectedQuantity} kg</Text>
          <Text style={styles.meta}>{formatGhs(item.agreedPricePerUnit)} / kg · settlement {formatGhs(item.expectedQuantity * item.agreedPricePerUnit)}</Text>
          <Button label="Re-cut short" tone="secondary" onPress={() => void run((state, ports, user) => recutConsignment(state, ports, user.id, { consignmentId: item.id, kg: Math.max(1, item.expectedQuantity - 10) }))} />
        </Card>
      ))}
    </Screen>
  );
}

function PayoutRuns() {
  const { db, run, busy, user } = useCryo();
  const payable = db.settlements.filter((item) => item.status !== "PAID");
  const [selected, setSelected] = useState<string[]>([]);
  return (
    <Screen title="Runs" subtitle="Payable consignments. A run needs another approver, and two approvers above the threshold.">
      {payable.map((item) => {
        const due = new Date(new Date(item.calculatedAt).getTime() + 24 * 60 * 60 * 1000).toISOString();
        return (
          <Pressable key={item.id} onPress={() => setSelected((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])}>
            <Card style={selected.includes(item.id) ? styles.selected : undefined}>
              <Text style={styles.rowTitle}>{farmerName(db, item.farmerId)} · {formatGhs(item.netSettlement)}</Text>
              <Text style={styles.meta}>{hoursLeft(due, new Date().toISOString())} hours left in the 24h window</Text>
            </Card>
          </Pressable>
        );
      })}
      <Button label={busy ? "Creating" : "Create payout run"} disabled={busy || selected.length === 0} onPress={() => void run((state, ports, actor) => createPayoutRun(state, ports, actor.id, selected))} />
      {db.payoutRuns.map((item) => (
        <Card key={item.id}>
          <Text style={styles.rowTitle}>{formatGhs(item.totalGhs)} · {item.status}</Text>
          <Text style={styles.meta}>Raised by {userName(db, item.raisedBy)} · due {item.dueAt}</Text>
          <Button label="Approve" tone="secondary" disabled={item.raisedBy === user?.id} onPress={() => void run((state, ports, actor) => approvePayoutRun(state, ports, actor.id, item.id))} />
        </Card>
      ))}
    </Screen>
  );
}

function Dashboard() {
  const { db } = useCryo();
  const kpis = opsKpis(db, new Date().toISOString());
  const cards: Array<[string, number]> = [
    ["Active farmers", kpis.activeFarmers],
    ["Active listings", kpis.activeListings],
    ["Lots awaiting commitment", kpis.lotsAwaitingCommitment],
    ["Lots committed", kpis.lotsCommitted],
    ["Awaiting payment", kpis.escrowPending],
    ["Paid", kpis.escrowFunded],
    ["Collections today", kpis.collectionsToday],
    ["Deliveries today", kpis.deliveriesToday],
    ["Exceptions", kpis.exceptions],
    ["Pending acceptance", kpis.pendingAcceptance],
    ["Pending settlement", kpis.pendingSettlement],
    ["Completed settlements", kpis.completedSettlements],
  ];
  return (
    <Screen title="Dashboard" subtitle="Supply, payment, custody and settlement.">
      <View style={styles.grid}>
        {cards.map(([label, value]) => (
          <Metric key={label} label={label} value={value} />
        ))}
      </View>
    </Screen>
  );
}

function Listings() {
  const { db, run, busy } = useCryo();
  const available = db.listings.filter((item) => item.status === "AVAILABLE");
  const [selected, setSelected] = useState<string[]>([]);
  const [price, setPrice] = useState("4.50");
  const [fee, setFee] = useState("80");
  const [destination, setDestination] = useState("Avenor Cold Store, Accra");
  const [grade, setGrade] = useState("Grade 1 or 2");
  const chosen = available.filter((item) => selected.includes(item.id));
  const sameProduce = new Set(chosen.map((item) => item.produceId)).size <= 1;
  const preview = useMemo(() => {
    if (!chosen.length || !sameProduce) return undefined;
    const priceNumber = Number(price);
    const feeNumber = Number(fee);
    if (!Number.isFinite(priceNumber) || !Number.isFinite(feeNumber)) return undefined;
    return previewNewLot(chosen.map((item) => item.quantity), priceNumber, feeNumber);
  }, [chosen, fee, price, sameProduce]);
  const toggle = (id: string) => setSelected((current) => (current.includes(id) ? current.filter((item) => item !== id) : [...current, id]));
  return (
    <Screen title="Listings" subtitle="Select compatible listings, review each farmer, then publish a lot.">
      {available.map((item) => (
        <Pressable key={item.id} onPress={() => toggle(item.id)}>
          <Card style={selected.includes(item.id) ? styles.selected : undefined}>
            <Text style={styles.rowTitle}>{farmerName(db, item.farmerId)} · {produceName(db, item.produceId)}</Text>
            <Text style={styles.meta}>{item.quantity} {item.unit} · {item.pickupLocation}</Text>
            <StatusBadge status={item.status} />
          </Card>
        </Pressable>
      ))}
      <Field label="Agreed price per kg" value={price} onChangeText={setPrice} keyboardType="numeric" />
      <Field label="Collection fee for the stop" value={fee} onChangeText={setFee} keyboardType="numeric" />
      <Field label="Destination" value={destination} onChangeText={setDestination} />
      <Field label="Grade expectation" value={grade} onChangeText={setGrade} />
      {!sameProduce ? <Text style={styles.warn}>Choose listings of one produce only.</Text> : null}
      {preview ? (
        <Card>
          <Text style={styles.rowTitle}>Estimate before field weight</Text>
          {chosen.map((item, index) => (
            <KeyValue key={item.id} label={farmerName(db, item.farmerId)} value={`${item.quantity} kg · net ${formatGhs(preview.rows[index].netSettlement)}`} />
          ))}
          <MoneyRow label="Estimated order total" value={preview.instruction.totalEscrowRequirement} strong />
        </Card>
      ) : null}
      <Button
        label={busy ? "Publishing" : "Publish lot"}
        disabled={busy || chosen.length === 0 || !sameProduce}
        onPress={() =>
          void run((state, ports, user) =>
            createLot(state, ports, user.id, {
              listingIds: selected,
              destination,
              pricePerUnit: Number(price),
              collectionFee: Number(fee),
              gradeExpectation: grade,
              deliveryWindowStart: "2026-09-26",
              deliveryWindowEnd: "2026-09-27",
              publish: true,
            }),
          ).then(() => setSelected([]))
        }
      />
    </Screen>
  );
}

function Lots() {
  const { db } = useCryo();
  return (
    <Screen title="Lots">
      {db.lots.map((lot) => {
        const consignments = lotConsignments(db, lot.id);
        const quantity = consignments.reduce((sum, item) => sum + (item.acceptedWeight ?? item.expectedQuantity), 0);
        return (
          <Card key={lot.id}>
            <Text style={styles.rowTitle}>{lot.code} · {produceName(db, lot.produceId)}</Text>
            <Text style={styles.meta}>{quantity} kg · {consignments.length} consignments · {lot.origin}</Text>
            <StatusBadge status={lot.orderState} />
            {consignments.map((item) => (
              <KeyValue key={item.id} label={farmerName(db, item.farmerId)} value={`${item.expectedQuantity} ${item.unit}`} />
            ))}
          </Card>
        );
      })}
    </Screen>
  );
}

function Commitments() {
  const { db } = useCryo();
  return (
    <Screen title="Commitments">
      {db.commitments.map((item) => {
        const lot = db.lots.find((lotItem) => lotItem.id === item.lotId);
        const buyer = db.offtakerProfiles.find((profile) => profile.id === item.offtakerId);
        return (
          <Card key={item.id}>
            <Text style={styles.rowTitle}>{lot?.code} · {buyer?.organization}</Text>
            <StatusBadge status={item.orderState} />
          </Card>
        );
      })}
    </Screen>
  );
}

function EscrowPanel() {
  const { db, run, busy } = useCryo();
  const ready = db.lots.filter((item) => item.orderState === "ACCEPTED");
  return (
    <Screen title="Payments" subtitle="Payout is allowed only after acceptance, and only for operations.">
      {db.escrows.map((escrow) => {
        const commitment = db.commitments.find((item) => item.id === escrow.commitmentId);
        const lot = db.lots.find((item) => item.id === commitment?.lotId);
        return (
          <Card key={escrow.id}>
            <Text style={styles.rowTitle}>{lot?.code} · {escrow.externalReference}</Text>
            <KeyValue label="Amount" value={formatGhs(escrow.instructedAmountGhs)} />
            <StatusBadge status={escrow.status} />
          </Card>
        );
      })}
      {ready.map((lot) => {
        const instruction = escrowInstructionForLot(db, lot.id);
        return (
          <Card key={lot.id}>
            <Text style={styles.rowTitle}>Payout {lot.code}</Text>
            <Text style={styles.meta}>Accepted {db.commitments.find((item) => item.lotId === lot.id)?.acceptedAt}</Text>
            {lotConsignments(db, lot.id).map((item) => {
              const preview = previewConsignment(db, item);
              return (
                <View key={item.id}>
                  <Text style={styles.meta}>{farmerName(db, item.farmerId)} · {item.acceptedWeight} kg</Text>
                  {preview ? (
                    <>
                      <MoneyRow label="Gross" value={preview.grossValue} />
                      <MoneyRow label="Net to farmer" value={preview.netSettlement} strong />
                    </>
                  ) : null}
                </View>
              );
            })}
            {instruction ? <MoneyRow label="Order total" value={instruction.totalEscrowRequirement} /> : null}
            <Button
              label={busy ? "Approving" : "Approve payout"}
              disabled={busy}
              onPress={() => void run((state, ports, user) => releaseEscrow(state, ports, user.id, lot.id))}
            />
          </Card>
        );
      })}
      {ready.length === 0 ? <Empty text="No accepted delivery is waiting for release." /> : null}
    </Screen>
  );
}

function Collections() {
  const { db, run, busy } = useCryo();
  const [agentId, setAgentId] = useState(db.fieldAgentProfiles[0]?.id ?? "");
  const [driverId, setDriverId] = useState(db.driverProfiles[0]?.id ?? "");
  const [vehicleId, setVehicleId] = useState(db.vehicles[0]?.id ?? "");
  const fundable = db.lots.filter((item) => item.orderState === "ESCROW_FUNDED");
  return (
    <Screen title="Collections">
      <Text style={styles.meta}>Agent</Text>
      <View style={styles.wrap}>
        {db.fieldAgentProfiles.map((item) => (
          <Choice key={item.id} label={userName(db, item.userId)} selected={item.id === agentId} onPress={() => setAgentId(item.id)} />
        ))}
      </View>
      <Text style={styles.meta}>Driver</Text>
      <View style={styles.wrap}>
        {db.driverProfiles.map((item) => (
          <Choice key={item.id} label={userName(db, item.userId)} selected={item.id === driverId} onPress={() => setDriverId(item.id)} />
        ))}
      </View>
      <Text style={styles.meta}>Vehicle</Text>
      <View style={styles.wrap}>
        {db.vehicles.map((item) => (
          <Choice key={item.id} label={item.plate} selected={item.id === vehicleId} onPress={() => setVehicleId(item.id)} />
        ))}
      </View>
      {fundable.map((lot) => (
        <Card key={lot.id}>
          <Text style={styles.rowTitle}>{lot.code} is funded and can be dispatched</Text>
          <Button
            label={busy ? "Scheduling" : "Schedule collection"}
            disabled={busy}
            onPress={() =>
              void run((state, ports, user) =>
                scheduleCollection(state, ports, user.id, {
                  lotId: lot.id,
                  fieldAgentId: agentId,
                  driverId,
                  vehicleId,
                  scheduledDate: new Date().toISOString().slice(0, 10),
                  windowLabel: "08:00–12:00",
                }),
              )
            }
          />
        </Card>
      ))}
      {db.collections.map((item) => {
        const lot = db.lots.find((lotItem) => lotItem.id === item.lotId);
        return (
          <Card key={item.id}>
            <Text style={styles.rowTitle}>{lot?.code} · {item.scheduledDate}</Text>
            <Text style={styles.meta}>{item.windowLabel}</Text>
            <StatusBadge status={item.status} />
          </Card>
        );
      })}
    </Screen>
  );
}

function Manifests() {
  const { db } = useCryo();
  return (
    <Screen title="Manifests">
      {db.manifests.map((item) => (
        <Card key={item.id}>
          <Text style={styles.rowTitle}>{item.code} · {userName(db, db.driverProfiles.find((driver) => driver.id === item.driverId)?.userId ?? "")}</Text>
          <Text style={styles.meta}>{item.routeLabel}</Text>
          <StatusBadge status={item.status === "ASSIGNED" ? "SCHEDULED" : item.status} />
        </Card>
      ))}
    </Screen>
  );
}

function Deliveries() {
  const { db } = useCryo();
  return (
    <Screen title="Deliveries">
      {db.deliveries.map((item) => {
        const lot = db.lots.find((lotItem) => lotItem.id === item.lotId);
        return (
          <Card key={item.id}>
            <Text style={styles.rowTitle}>{lot?.code} · {item.location}</Text>
            <StatusBadge status={item.status} />
          </Card>
        );
      })}
    </Screen>
  );
}

function Settlements() {
  const { db } = useCryo();
  return (
    <Screen title="Settlements">
      {db.settlements.length === 0 ? <Empty text="No farmer settlement has been calculated yet." /> : null}
      {db.settlements.map((item) => (
        <Card key={item.id}>
          <Text style={styles.rowTitle}>{farmerName(db, item.farmerId)}</Text>
          <Text style={styles.meta}>{(db.consignments.find((row) => row.id === item.consignmentId)?.acceptedWeight ?? db.consignments.find((row) => row.id === item.consignmentId)?.expectedQuantity ?? 0)} kg × {formatGhs(db.consignments.find((row) => row.id === item.consignmentId)?.agreedPricePerUnit ?? 0)}</Text>
          <MoneyRow label="Settlement" value={item.netSettlement} strong />
          <KeyValue label="Reference" value={item.paymentReference ?? "—"} />
          <StatusBadge status={item.status} />
        </Card>
      ))}
    </Screen>
  );
}

function Exceptions() {
  const { db, run } = useCryo();
  return (
    <Screen title="Exceptions">
      {db.exceptions.map((item) => (
        <Card key={item.id}>
          <Text style={styles.rowTitle}>{item.type}</Text>
          <Text style={styles.meta}>{item.description}</Text>
          <StatusBadge status={item.status} />
          {item.status !== "RESOLVED" && item.status !== "CLOSED" ? (
            <Button
              label="Mark resolved"
              tone="secondary"
              onPress={() =>
                void run((state, ports, user) =>
                  updateException(state, ports, user.id, {
                    exceptionId: item.id,
                    status: "RESOLVED",
                    resolution: "Handled by operations.",
                  }),
                )
              }
            />
          ) : null}
        </Card>
      ))}
    </Screen>
  );
}

function People() {
  const { db } = useCryo();
  const [query, setQuery] = useState("");
  const people = db.users.filter((item) => item.fullName.toLowerCase().includes(query.toLowerCase()) || item.role.includes(query.toLowerCase()));
  return (
    <Screen title="People">
      <Field label="Search" value={query} onChangeText={setQuery} />
      {people.map((item) => (
        <Card key={item.id}>
          <Text style={styles.rowTitle}>{item.fullName}</Text>
          <Text style={styles.meta}>{(item.role === "offtaker" ? "Buyer" : item.role.replace(/_/g, " "))} · {item.phone} · {item.location}</Text>
        </Card>
      ))}
    </Screen>
  );
}

function Audit() {
  const { db } = useCryo();
  const [query, setQuery] = useState("");
  const rows = db.auditLogs
    .filter((item) => `${item.action} ${item.entity} ${item.entityId}`.toLowerCase().includes(query.toLowerCase()))
    .slice()
    .reverse();
  return (
    <Screen title="Audit log">
      <Field label="Filter" value={query} onChangeText={setQuery} />
      {rows.map((item) => (
        <Card key={item.id}>
          <Text style={styles.rowTitle}>{item.action}</Text>
          <Text style={styles.meta}>{item.role} · {item.entity} {item.entityId}</Text>
          <Text style={styles.meta}>{(item.previousState ?? "—") + " → " + (item.newState ?? "—")} · {item.timestamp}</Text>
        </Card>
      ))}
    </Screen>
  );
}

function Settings() {
  const { db, run, busy, signOut, resetDemo, forceOffline, setForceOffline } = useCryo();
  const [threshold, setThreshold] = useState(String(db.opsConfig.payoutApprovalThresholdGhs));
  const [minC, setMinC] = useState(String(db.opsConfig.temperatureMinC));
  const [maxC, setMaxC] = useState(String(db.opsConfig.temperatureMaxC));
  const [approvers, setApprovers] = useState(db.opsConfig.payoutApproverIds);
  const opsUsers = db.users.filter((item) => item.role === "ops");
  return (
    <Screen title="Settings" subtitle="Payout threshold, approvers, temperature checkpoints.">
      <Field label="Two-approver threshold (GHS)" value={threshold} onChangeText={setThreshold} keyboardType="numeric" />
      <Field label="Minimum temperature °C" value={minC} onChangeText={setMinC} keyboardType="numeric" />
      <Field label="Maximum temperature °C" value={maxC} onChangeText={setMaxC} keyboardType="numeric" />
      <Text style={styles.meta}>Approvers</Text>
      <View style={styles.wrap}>
        {opsUsers.map((item) => (
          <Choice key={item.id} label={item.fullName} selected={approvers.includes(item.id)} onPress={() => setApprovers((current) => current.includes(item.id) ? current.filter((id) => id !== item.id) : [...current, item.id])} />
        ))}
      </View>
      <Text style={styles.meta}>Checkpoints: {db.opsConfig.checkpoints.join(", ")}</Text>
      <Button
        label={busy ? "Saving" : "Save configuration"}
        disabled={busy}
        onPress={() => void run((state, ports, user) => saveOpsConfig(state, ports, user.id, { ...state.opsConfig, payoutApprovalThresholdGhs: Number(threshold), temperatureMinC: Number(minC), temperatureMaxC: Number(maxC), payoutApproverIds: approvers }))}
      />
      <Button label={forceOffline ? "Offline forced" : "Force offline"} tone="secondary" onPress={() => setForceOffline(!forceOffline)} />
      <Button label="Sign out" tone="secondary" onPress={() => void signOut()} />
      <Button label="Reset demo data" tone="danger" onPress={() => void resetDemo()} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  frame: { flex: 1, backgroundColor: colors.bg },
  frameWide: { flexDirection: "row" },
  side: { width: 220, backgroundColor: colors.surface, paddingHorizontal: 16, paddingTop: 24, paddingBottom: 24, borderRightWidth: 1, borderRightColor: colors.line },
  brand: { color: colors.ink, fontSize: 18, fontWeight: "600" },
  sideNote: { color: colors.muted, marginTop: 4, marginBottom: 18, fontSize: 12 },
  group: { color: colors.muted, fontSize: 11, fontWeight: "600", letterSpacing: 0.6, textTransform: "uppercase", marginTop: 16, marginBottom: 6, paddingHorizontal: 12 },
  sideItem: { paddingVertical: 10, paddingHorizontal: 12, borderRadius: 6, marginBottom: 2 },
  sideOn: { backgroundColor: colors.primarySoft },
  sideText: { color: colors.ink, fontSize: 14 },
  sideTextOn: { color: colors.primaryDark, fontWeight: "600" },
  chips: { maxHeight: 58, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.line },
  chipRow: { paddingHorizontal: 12, paddingVertical: 10, alignItems: "center" },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 999, marginRight: 8, backgroundColor: colors.bg },
  chipOn: { backgroundColor: colors.ink },
  chipText: { color: colors.ink, fontWeight: "600", fontSize: 13 },
  chipTextOn: { color: colors.white },
  main: { flex: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12 },
  rowTitle: { fontSize: 16, fontWeight: "700", letterSpacing: -0.2, color: colors.ink, marginBottom: 2 },
  meta: { color: colors.muted, marginBottom: 4, lineHeight: 20, fontSize: 14 },
  selected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  warn: { color: colors.danger, marginBottom: 8, fontWeight: "600" },
  wrap: { flexDirection: "row", flexWrap: "wrap", marginBottom: 8 },
});
