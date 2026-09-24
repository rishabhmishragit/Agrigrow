import type { USSDSession } from "./types";

export interface UssdTurn {
  response: string;
  end: boolean;
  session: USSDSession;
  effect?: UssdEffect;
}

export type UssdEffect =
  | { type: "register"; name: string; village: string; produceName: string }
  | { type: "list"; produceName: string; quantity: number; availableDate: string; location: string };

const ROOT = `CryoChain
1 Register
2 List produce
3 My listings
4 Pickup booking
5 Pickup status
6 Payment
7 Help`;

export function startUssd(phone: string, sessionId: string, now: string): UssdTurn {
  return {
    response: ROOT,
    end: false,
    session: {
      id: sessionId,
      phone,
      menu: "ROOT",
      context: {},
      ended: false,
      createdAt: now,
      updatedAt: now,
    },
  };
}

export function continueUssd(
  session: USSDSession,
  text: string,
  now: string,
  view: {
    registered: boolean;
    listings: string[];
    bookings: string[];
    statuses: string[];
    payments: string[];
  },
): UssdTurn {
  const input = text.trim();
  const next: USSDSession = { ...session, context: { ...session.context }, updatedAt: now };
  const say = (response: string, menu: string, end = false, effect?: UssdEffect): UssdTurn => {
    next.menu = menu;
    next.ended = end;
    return { response, end, session: next, effect };
  };

  if (next.menu === "ROOT") {
    if (input === "1") return say("Enter your name:", "REG_NAME");
    if (input === "2") {
      if (!view.registered) return say("Register first.\n1 Register", "ROOT");
      return say("Produce name:", "LIST_PRODUCE");
    }
    if (input === "3") return say(view.listings.join("\n") || "No listings.", "ROOT", true);
    if (input === "4") return say(view.bookings.join("\n") || "No pickup booked.", "ROOT", true);
    if (input === "5") return say(view.statuses.join("\n") || "No active pickup.", "ROOT", true);
    if (input === "6") return say(view.payments.join("\n") || "No payment yet.", "ROOT", true);
    if (input === "7") return say("Call your field agent or reply with your village name. SMS will confirm important steps.", "ROOT", true);
    return say(`Choose 1-7.\n${ROOT}`, "ROOT");
  }
  if (next.menu === "REG_NAME") {
    next.context.name = input;
    return say("Village or community:", "REG_VILLAGE");
  }
  if (next.menu === "REG_VILLAGE") {
    next.context.village = input;
    return say("Main produce (example Tomato):", "REG_PRODUCE");
  }
  if (next.menu === "REG_PRODUCE") {
    return say("Registered. You can list produce.", "ROOT", true, {
      type: "register",
      name: next.context.name ?? "",
      village: next.context.village ?? "",
      produceName: input,
    });
  }
  if (next.menu === "LIST_PRODUCE") {
    next.context.produceName = input;
    return say("Quantity in kg:", "LIST_QTY");
  }
  if (next.menu === "LIST_QTY") {
    if (!/^\d+(\.\d+)?$/.test(input) || Number(input) <= 0) return say("Enter a number greater than 0:", "LIST_QTY");
    next.context.quantity = input;
    return say("Available date YYYY-MM-DD:", "LIST_DATE");
  }
  if (next.menu === "LIST_DATE") {
    next.context.availableDate = input;
    return say("Pickup village:", "LIST_PLACE");
  }
  if (next.menu === "LIST_PLACE") {
    return say("Listing saved. You will get an SMS.", "ROOT", true, {
      type: "list",
      produceName: next.context.produceName ?? "",
      quantity: Number(next.context.quantity),
      availableDate: next.context.availableDate ?? "",
      location: input,
    });
  }
  return say(ROOT, "ROOT");
}
