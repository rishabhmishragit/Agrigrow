import { must } from "./db";
import { produceName } from "./selectors";
import { begin, CommandResult, Ports } from "./support";
import { createListing, selfRegisterFarmer } from "./trade";
import type { AppDatabase } from "./types";
import { continueUssd, startUssd } from "./ussd";

export async function handleUssd(
  source: AppDatabase,
  ports: Ports,
  input: { sessionId: string; phone: string; text: string; start: boolean },
): Promise<CommandResult<{ response: string; end: boolean }>> {
  let db = begin(source);
  const existing = db.ussdSessions.find((item) => item.id === input.sessionId && !item.ended);
  const view = ussdView(db, input.phone);
  const turn =
    !existing || input.start
      ? startUssd(input.phone, input.sessionId, ports.now())
      : continueUssd(existing, input.text, ports.now(), view);
  const index = db.ussdSessions.findIndex((item) => item.id === turn.session.id);
  if (index >= 0) db.ussdSessions[index] = turn.session;
  else db.ussdSessions.push(turn.session);

  if (turn.effect?.type === "register") {
    const effect = turn.effect;
    const registered = await selfRegisterFarmer(db, ports, {
      fullName: effect.name,
      phone: input.phone,
      village: effect.village,
      produceName: effect.produceName,
    });
    db = registered.db;
  }
  if (turn.effect?.type === "list") {
    const effect = turn.effect;
    const user = must(db.users.find((item) => item.phone === input.phone), "Register before listing produce.");
    const produce = db.produce.find((item) => item.name.toLowerCase() === effect.produceName.toLowerCase());
    if (!produce) {
      return { db, data: { response: "Produce not recognised. Try Tomato, Pepper, Okra, Maize, Yam or Mango.", end: true } };
    }
    const created = await createListing(db, ports, user.id, {
      produceId: produce.id,
      quantity: effect.quantity,
      unit: "kg",
      availableDate: effect.availableDate,
      pickupLocation: effect.location,
    });
    db = created.db;
  }
  return { db, data: { response: turn.response, end: turn.end } };
}

function ussdView(db: AppDatabase, phone: string) {
  const user = db.users.find((item) => item.phone === phone);
  const farmer = db.farmerProfiles.find((item) => item.userId === user?.id);
  const listings = db.listings.filter((item) => item.farmerId === farmer?.id);
  const consignments = db.consignments.filter((item) => item.farmerId === farmer?.id);
  return {
    registered: Boolean(farmer),
    listings: listings.map((item) => `${produceName(db, item.produceId)} ${item.quantity}${item.unit} ${item.status}`),
    bookings: consignments
      .filter((item) => item.status === "SCHEDULED")
      .map((item) => `${produceName(db, item.produceId)} pickup ${item.bookingAccepted ? "accepted" : "waiting"}`),
    statuses: consignments.map((item) => `${produceName(db, item.produceId)} ${item.status}`),
    payments: db.settlements
      .filter((item) => item.farmerId === farmer?.id)
      .map((item) => `GHS ${item.netSettlement.toFixed(2)} ${item.status}`),
  };
}
