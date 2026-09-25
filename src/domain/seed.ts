import { emptyDatabase } from "./db";
import { calculateConsignmentSettlement } from "./economics";
import { roundGhs } from "./money";
import type { AppDatabase, GradeOption, ProduceListing } from "./types";

const NOW = "2026-09-23T08:00:00.000Z";
const DAY = "2026-09-23";

const tomatoGrades: GradeOption[] = [
  { code: "1", label: "Grade 1", acceptable: true },
  { code: "2", label: "Grade 2", acceptable: true },
  { code: "3", label: "Grade 3", acceptable: true },
  { code: "R", label: "Reject", acceptable: false },
];

const pepperGrades: GradeOption[] = [
  { code: "A", label: "Export A", acceptable: true },
  { code: "B", label: "Local B", acceptable: true },
  { code: "R", label: "Reject", acceptable: false },
];

const generalGrades: GradeOption[] = [
  { code: "A", label: "Grade A", acceptable: true },
  { code: "B", label: "Grade B", acceptable: true },
  { code: "C", label: "Grade C", acceptable: true },
  { code: "R", label: "Reject", acceptable: false },
];

export function createSeed(): AppDatabase {
  const db = emptyDatabase();
  db.produce.push(
    { id: "prod_tomato", name: "Tomato", defaultUnit: "kg", category: "vegetables", pricePerKg: 4.5, temperatureMinC: 8, temperatureMaxC: 12 },
    { id: "prod_pepper", name: "Pepper", defaultUnit: "kg", category: "vegetables", pricePerKg: 8, temperatureMinC: 7, temperatureMaxC: 10 },
    { id: "prod_okra", name: "Okra", defaultUnit: "kg", category: "vegetables", pricePerKg: 5 },
    { id: "prod_maize", name: "Maize", defaultUnit: "kg", category: "vegetables", pricePerKg: 3.2 },
    { id: "prod_yam", name: "Yam", defaultUnit: "kg", category: "vegetables", pricePerKg: 4 },
    { id: "prod_mango", name: "Mango", defaultUnit: "kg", category: "fruit", pricePerKg: 6, temperatureMinC: 10, temperatureMaxC: 13 },
    { id: "prod_pineapple", name: "Pineapple", defaultUnit: "kg", category: "fruit", pricePerKg: 5.5 },
    { id: "prod_goat", name: "Goat meat", defaultUnit: "kg", category: "meat", pricePerKg: 45, temperatureMinC: 0, temperatureMaxC: 4 },
    { id: "prod_tilapia", name: "Tilapia", defaultUnit: "kg", category: "fish", pricePerKg: 28, temperatureMinC: 0, temperatureMaxC: 2 },
    { id: "prod_milk", name: "Fresh milk", defaultUnit: "kg", category: "dairy", pricePerKg: 8, temperatureMinC: 2, temperatureMaxC: 4 },
  );
  db.gradeScales.push(
    { id: "scale_tomato", produceId: "prod_tomato", grades: tomatoGrades },
    { id: "scale_pepper", produceId: "prod_pepper", grades: pepperGrades },
    { id: "scale_okra", produceId: "prod_okra", grades: generalGrades },
    { id: "scale_maize", produceId: "prod_maize", grades: generalGrades },
    { id: "scale_yam", produceId: "prod_yam", grades: generalGrades },
    { id: "scale_mango", produceId: "prod_mango", grades: generalGrades },
    { id: "scale_pineapple", produceId: "prod_pineapple", grades: generalGrades },
    { id: "scale_goat", produceId: "prod_goat", grades: generalGrades },
    { id: "scale_tilapia", produceId: "prod_tilapia", grades: generalGrades },
    { id: "scale_milk", produceId: "prod_milk", grades: generalGrades },
  );

  const people: Array<[string, string, string, string, string, string]> = [
    ["u_akua", "farmer", "Akua Boateng", "+233244001001", "farmer@test.com", "Techiman"],
    ["u_kwesi", "farmer", "Kwesi Appiah", "+233244001002", "kwesi@farmers.cryochain.local", "Techiman"],
    ["u_abena", "farmer", "Abena Owusu", "+233244001003", "abena@farmers.cryochain.local", "Wenchi"],
    ["u_yaw", "farmer", "Yaw Mensah", "+233244001004", "yaw@farmers.cryochain.local", "Wenchi"],
    ["u_efua", "farmer", "Efua Darko", "+233244001005", "efua@farmers.cryochain.local", "Mampong"],
    ["u_kofi", "farmer", "Kofi Adu", "+233244001006", "kofi@farmers.cryochain.local", "Tamale"],
    ["u_kojo", "farmer", "Kojo Asante", "+233244001007", "kojo@farmers.cryochain.local", "Ejura"],
    ["u_adwoa", "farmer", "Adwoa Frimpong", "+233244001008", "adwoa@farmers.cryochain.local", "Nkoranza"],
    ["u_ama", "farmer", "Ama Gyamfi", "+233244001009", "ama@farmers.cryochain.local", "Offinso"],
    ["u_esi", "farmer", "Esi Quaye", "+233244001010", "esi@farmers.cryochain.local", "Agona Swedru"],
    ["u_accra", "offtaker", "Kojo Nyarko", "+233302220011", "offtaker@test.com", "Accra"],
    ["u_kumasi", "offtaker", "Abena Sarpong", "+233322220012", "kumasi@buyers.cryochain.local", "Kumasi"],
    ["u_nana", "field_agent", "Nana Yeboah", "+233244110001", "agent@test.com", "Techiman"],
    ["u_linda", "field_agent", "Linda Ofori", "+233244110002", "linda@agents.cryochain.local", "Mampong"],
    ["u_ibrahim", "field_agent", "Ibrahim Fuseini", "+233244110003", "ibrahim@agents.cryochain.local", "Tamale"],
    ["u_samuel", "driver", "Samuel Tetteh", "+233244220001", "driver@test.com", "Kumasi"],
    ["u_grace", "driver", "Grace Mensima", "+233244220002", "grace@drivers.cryochain.local", "Accra"],
    ["u_daniel", "driver", "Daniel Owusu", "+233244220003", "daniel@drivers.cryochain.local", "Tamale"],
    ["u_ops", "ops", "Ama Darkwah", "+233302330001", "ops@test.com", "Accra"],
    ["u_ops2", "ops", "Kweku Mensah", "+233302330002", "ops2@test.com", "Accra"],
  ];
  for (const [id, role, fullName, phone, email, location] of people) {
    db.users.push({
      id,
      role: role as AppDatabase["users"][number]["role"],
      fullName,
      phone,
      email,
      location,
      active: true,
      createdAt: NOW,
    });
  }

  const farmers: Array<[string, string, string, string, string[], number, number]> = [
    ["f_akua", "u_akua", "Techiman", "Tuobodom", ["prod_tomato"], 7.59, -1.94],
    ["f_kwesi", "u_kwesi", "Techiman", "Tanoso", ["prod_tomato"], 7.6, -1.95],
    ["f_abena", "u_abena", "Wenchi", "Wenchi", ["prod_pepper"], 7.74, -2.1],
    ["f_yaw", "u_yaw", "Wenchi", "Subinso", ["prod_pepper"], 7.75, -2.11],
    ["f_efua", "u_efua", "Mampong", "Mampong", ["prod_tomato"], 7.06, -1.4],
    ["f_kofi", "u_kofi", "Tamale", "Lamashegu", ["prod_tomato"], 9.41, -0.85],
    ["f_kojo", "u_kojo", "Ejura", "Ejura", ["prod_maize"], 7.39, -1.36],
    ["f_adwoa", "u_adwoa", "Nkoranza", "Nkoranza", ["prod_maize"], 7.57, -1.71],
    ["f_ama", "u_ama", "Offinso", "Offinso", ["prod_mango"], 6.93, -1.65],
    ["f_esi", "u_esi", "Agona Swedru", "Agona", ["prod_mango"], 5.53, -0.7],
  ];
  for (const [id, userId, village, community, produceIds, latitude, longitude] of farmers) {
    db.farmerProfiles.push({
      id,
      userId,
      village,
      community,
      produceIds,
      phoneVerified: true,
      locationLabel: `${community}, ${village}`,
      latitude,
      longitude,
      farmInfo: "Smallholder plot, fictional demo farm.",
    });
  }
  db.offtakerProfiles.push(
    { id: "o_accra", userId: "u_accra", organization: "Accra Fresh Markets Ltd", deliveryLocation: "Avenor Cold Store, Accra", latitude: 5.6037, longitude: -0.187, buyerSeat: "admin", paymentLimitGhs: 50000 },
    { id: "o_kumasi", userId: "u_kumasi", organization: "Kumasi Cold Foods", deliveryLocation: "Asafo Cold Room, Kumasi", latitude: 6.6885, longitude: -1.6244, buyerSeat: "approver", paymentLimitGhs: 8000 },
  );
  db.fieldAgentProfiles.push(
    { id: "a_nana", userId: "u_nana", baseLocation: "Techiman", assignedArea: "Techiman–Wenchi" },
    { id: "a_linda", userId: "u_linda", baseLocation: "Mampong", assignedArea: "Mampong–Ejura" },
    { id: "a_ibrahim", userId: "u_ibrahim", baseLocation: "Tamale", assignedArea: "Tamale" },
  );
  db.vehicles.push(
    { id: "v1", plate: "GS 2140-26", type: "Refrigerated truck", coldCapable: true, ownerLabel: "CryoChain truck" },
    { id: "v2", plate: "GS 1182-25", type: "Refrigerated truck", coldCapable: true, ownerLabel: "CryoChain truck" },
    { id: "v3", plate: "GT 3304-24", type: "Insulated van", coldCapable: true, ownerLabel: "CryoChain truck" },
  );
  db.driverProfiles.push(
    { id: "d_samuel", userId: "u_samuel", licenseRef: "DL-DEMO-1001", vehicleId: "v1" },
    { id: "d_grace", userId: "u_grace", licenseRef: "DL-DEMO-1002", vehicleId: "v2" },
    { id: "d_daniel", userId: "u_daniel", licenseRef: "DL-DEMO-1003", vehicleId: "v3" },
  );

  const listing = (
    id: string,
    farmerId: string,
    produceId: string,
    quantity: number,
    place: string,
    status: ProduceListing["status"],
    lat: number,
    lng: number,
  ): ProduceListing => ({
    id,
    farmerId,
    produceId,
    quantity,
    unit: "kg",
    availableDate: DAY,
    pickupLocation: place,
    latitude: lat,
    longitude: lng,
    status,
    createdAt: NOW,
    updatedAt: NOW,
  });

  db.listings.push(
    listing("list_akua_open", "f_akua", "prod_tomato", 450, "Tuobodom, Techiman", "AVAILABLE", 7.59, -1.94),
    listing("list_kwesi_open", "f_kwesi", "prod_tomato", 700, "Tanoso, Techiman", "AVAILABLE", 7.6, -1.95),
    listing("list_abena_open", "f_abena", "prod_pepper", 180, "Wenchi", "AVAILABLE", 7.74, -2.1),
    listing("list_efua_pub", "f_efua", "prod_tomato", 320, "Mampong", "ALLOCATED", 7.06, -1.4),
    listing("list_kofi_pub", "f_kofi", "prod_tomato", 500, "Lamashegu, Tamale", "ALLOCATED", 9.41, -0.85),
    listing("list_kojo_escrow", "f_kojo", "prod_maize", 800, "Ejura", "ALLOCATED", 7.39, -1.36),
    listing("list_adwoa_escrow", "f_adwoa", "prod_maize", 400, "Nkoranza", "ALLOCATED", 7.57, -1.71),
    listing("list_ama_job", "f_ama", "prod_mango", 250, "Offinso", "SCHEDULED", 6.93, -1.65),
    listing("list_esi_job", "f_esi", "prod_mango", 350, "Agona Swedru", "SCHEDULED", 5.53, -0.7),
    listing("list_efua_transit", "f_efua", "prod_tomato", 280, "Mampong", "COLLECTED", 7.06, -1.4),
    listing("list_kofi_transit", "f_kofi", "prod_tomato", 420, "Lamashegu, Tamale", "COLLECTED", 9.41, -0.85),
    listing("list_abena_accept", "f_abena", "prod_pepper", 40, "Wenchi", "COLLECTED", 7.74, -2.1),
    listing("list_yaw_accept", "f_yaw", "prod_pepper", 360, "Subinso, Wenchi", "COLLECTED", 7.75, -2.11),
    listing("list_akua_paid", "f_akua", "prod_tomato", 200, "Tuobodom, Techiman", "SETTLED", 7.59, -1.94),
    listing("list_kwesi_paid", "f_kwesi", "prod_tomato", 600, "Tanoso, Techiman", "SETTLED", 7.6, -1.95),
  );

  db.lots.push(
    { id: "lot_pub", code: "LC-2401", produceId: "prod_tomato", origin: "Mampong and Tamale", destination: "Avenor Cold Store, Accra", gradeExpectation: "Grade 1 or 2", pricePerUnit: 4.5, collectionFeePerStop: 60, otherCharges: 0, status: "PUBLISHED", orderState: "LOT_CREATED", createdBy: "u_ops", deliveryWindowStart: "2026-09-25", deliveryWindowEnd: "2026-09-26", publishedAt: NOW, createdAt: NOW },
    { id: "lot_escrow", code: "LC-2402", produceId: "prod_maize", origin: "Ejura–Nkoranza", destination: "Asafo Cold Room, Kumasi", gradeExpectation: "Grade A", pricePerUnit: 3.2, collectionFeePerStop: 70, otherCharges: 0, status: "COMMITTED", orderState: "ESCROW_PENDING", createdBy: "u_ops", deliveryWindowStart: "2026-09-26", deliveryWindowEnd: "2026-09-27", publishedAt: NOW, createdAt: NOW },
    { id: "lot_job", code: "LC-2403", produceId: "prod_mango", origin: "Offinso and Agona", destination: "Avenor Cold Store, Accra", gradeExpectation: "Grade A", pricePerUnit: 6, collectionFeePerStop: 90, otherCharges: 0, status: "COMMITTED", orderState: "COLLECTION_SCHEDULED", createdBy: "u_ops", deliveryWindowStart: "2026-09-24", deliveryWindowEnd: "2026-09-24", publishedAt: NOW, createdAt: NOW },
    { id: "lot_transit", code: "LC-2394", produceId: "prod_tomato", origin: "Mampong and Tamale", destination: "Avenor Cold Store, Accra", gradeExpectation: "Grade 1", pricePerUnit: 4.8, collectionFeePerStop: 80, otherCharges: 0, status: "COMMITTED", orderState: "IN_TRANSIT", createdBy: "u_ops", deliveryWindowStart: DAY, deliveryWindowEnd: DAY, publishedAt: NOW, createdAt: NOW },
    { id: "lot_accept", code: "LC-2388", produceId: "prod_pepper", origin: "Wenchi", destination: "Avenor Cold Store, Accra", gradeExpectation: "Export A", pricePerUnit: 8, collectionFeePerStop: 200, otherCharges: 0, status: "COMMITTED", orderState: "ACCEPTED", createdBy: "u_ops", deliveryWindowStart: "2026-09-22", deliveryWindowEnd: "2026-09-22", publishedAt: NOW, createdAt: NOW },
    { id: "lot_paid", code: "LC-2360", produceId: "prod_tomato", origin: "Techiman", destination: "Avenor Cold Store, Accra", gradeExpectation: "Grade 1", pricePerUnit: 5, collectionFeePerStop: 100, otherCharges: 0, status: "CLOSED", orderState: "SETTLED", createdBy: "u_ops", deliveryWindowStart: "2026-09-18", deliveryWindowEnd: "2026-09-18", publishedAt: NOW, createdAt: NOW },
  );

  const consignment = (
    id: string,
    lotId: string,
    listingId: string,
    farmerId: string,
    produceId: string,
    expected: number,
    price: number,
    status: ProduceListing["status"],
    extra: Partial<AppDatabase["consignments"][number]> = {},
  ) => {
    db.consignments.push({
      id,
      lotId,
      listingId,
      farmerId,
      produceId,
      expectedQuantity: expected,
      unit: "kg",
      agreedPricePerUnit: price,
      bookingAccepted: status !== "ALLOCATED",
      status,
      ...extra,
    });
  };
  consignment("c_efua_pub", "lot_pub", "list_efua_pub", "f_efua", "prod_tomato", 320, 4.5, "ALLOCATED");
  consignment("c_kofi_pub", "lot_pub", "list_kofi_pub", "f_kofi", "prod_tomato", 500, 4.5, "ALLOCATED");
  consignment("c_kojo", "lot_escrow", "list_kojo_escrow", "f_kojo", "prod_maize", 800, 3.2, "ALLOCATED");
  consignment("c_adwoa", "lot_escrow", "list_adwoa_escrow", "f_adwoa", "prod_maize", 400, 3.2, "ALLOCATED");
  consignment("c_ama", "lot_job", "list_ama_job", "f_ama", "prod_mango", 250, 6, "SCHEDULED", { collectionStopId: "stop_job" });
  consignment("c_esi", "lot_job", "list_esi_job", "f_esi", "prod_mango", 350, 6, "SCHEDULED", { collectionStopId: "stop_job" });
  consignment("c_efua_tr", "lot_transit", "list_efua_transit", "f_efua", "prod_tomato", 280, 4.8, "COLLECTED", { collectionStopId: "stop_tr_col", confirmedWeight: 276, acceptedWeight: 270, gradeCode: "1" });
  consignment("c_kofi_tr", "lot_transit", "list_kofi_transit", "f_kofi", "prod_tomato", 420, 4.8, "COLLECTED", { collectionStopId: "stop_tr_col", confirmedWeight: 410, acceptedWeight: 400, gradeCode: "1" });
  consignment("c_abena_acc", "lot_accept", "list_abena_accept", "f_abena", "prod_pepper", 40, 8, "COLLECTED", { collectionStopId: "stop_acc", confirmedWeight: 40, acceptedWeight: 40, gradeCode: "A" });
  consignment("c_yaw_acc", "lot_accept", "list_yaw_accept", "f_yaw", "prod_pepper", 360, 8, "COLLECTED", { collectionStopId: "stop_acc", confirmedWeight: 360, acceptedWeight: 360, gradeCode: "A" });
  consignment("c_akua_paid", "lot_paid", "list_akua_paid", "f_akua", "prod_tomato", 200, 5, "SETTLED", { collectionStopId: "stop_paid", confirmedWeight: 200, acceptedWeight: 200, gradeCode: "1" });
  consignment("c_kwesi_paid", "lot_paid", "list_kwesi_paid", "f_kwesi", "prod_tomato", 600, 5, "SETTLED", { collectionStopId: "stop_paid", confirmedWeight: 600, acceptedWeight: 600, gradeCode: "1" });

  db.commitments.push(
    { id: "cm_escrow", lotId: "lot_escrow", offtakerId: "o_kumasi", orderState: "ESCROW_PENDING", createdAt: NOW },
    { id: "cm_job", lotId: "lot_job", offtakerId: "o_accra", orderState: "COLLECTION_SCHEDULED", createdAt: NOW },
    { id: "cm_transit", lotId: "lot_transit", offtakerId: "o_accra", orderState: "IN_TRANSIT", createdAt: NOW },
    { id: "cm_accept", lotId: "lot_accept", offtakerId: "o_accra", orderState: "ACCEPTED", createdAt: NOW, acceptedAt: "2026-09-22T16:00:00.000Z" },
    { id: "cm_paid", lotId: "lot_paid", offtakerId: "o_accra", orderState: "SETTLED", createdAt: NOW, acceptedAt: "2026-09-18T15:00:00.000Z" },
  );

  db.escrows.push(
    { id: "esc_pending", commitmentId: "cm_escrow", provider: "mock", bankLabel: "CryoChain", externalReference: "PAY-2402", status: "PENDING", instructedAmountGhs: roundGhs(800 * 3.2 + 400 * 3.2), createdAt: NOW },
    { id: "esc_job", commitmentId: "cm_job", provider: "mock", bankLabel: "CryoChain", externalReference: "PAY-2403", status: "FUNDED", instructedAmountGhs: roundGhs(250 * 6 + 350 * 6), externalTransactionRef: "PAY-TX-2403", fundedAt: NOW, createdAt: NOW },
    { id: "esc_transit", commitmentId: "cm_transit", provider: "mock", bankLabel: "CryoChain", externalReference: "PAY-2394", status: "FUNDED", instructedAmountGhs: roundGhs(280 * 4.8 + 420 * 4.8), externalTransactionRef: "PAY-TX-2394", fundedAt: NOW, createdAt: NOW },
    { id: "esc_accept", commitmentId: "cm_accept", provider: "mock", bankLabel: "CryoChain", externalReference: "PAY-2388", status: "FUNDED", instructedAmountGhs: roundGhs(40 * 8 + 360 * 8), externalTransactionRef: "PAY-TX-2388", fundedAt: NOW, createdAt: NOW },
    { id: "esc_paid", commitmentId: "cm_paid", provider: "mock", bankLabel: "CryoChain", externalReference: "PAY-2360", status: "RELEASED", instructedAmountGhs: roundGhs(200 * 5 + 600 * 5), externalTransactionRef: "PAY-TX-2360", fundedAt: "2026-09-17T10:00:00.000Z", releaseRequestedAt: "2026-09-18T16:00:00.000Z", releasedAt: "2026-09-18T16:05:00.000Z", releaseIdempotencyKey: "escrow-release:esc_paid", createdAt: NOW },
  );

  db.collections.push(
    { id: "col_job", lotId: "lot_job", commitmentId: "cm_job", fieldAgentId: "a_nana", scheduledDate: DAY, windowLabel: "08:00–11:00", status: "SCHEDULED" },
    { id: "col_transit", lotId: "lot_transit", commitmentId: "cm_transit", fieldAgentId: "a_linda", scheduledDate: "2026-09-22", windowLabel: "06:00–09:00", status: "COLLECTED" },
    { id: "col_accept", lotId: "lot_accept", commitmentId: "cm_accept", fieldAgentId: "a_nana", scheduledDate: "2026-09-21", windowLabel: "07:00–10:00", status: "COLLECTED" },
    { id: "col_paid", lotId: "lot_paid", commitmentId: "cm_paid", fieldAgentId: "a_nana", scheduledDate: "2026-09-17", windowLabel: "07:00–10:00", status: "COLLECTED" },
  );

  db.manifests.push({
    id: "mf_today",
    code: "MF-0923",
    driverId: "d_samuel",
    vehicleId: "v1",
    date: DAY,
    routeLabel: "Offinso collection, then Accra delivery",
    destination: "Avenor Cold Store, Accra",
    status: "ASSIGNED",
    commitmentIds: ["cm_job", "cm_transit"],
    lotIds: ["lot_job", "lot_transit"],
  });

  db.stops.push(
    { id: "stop_job", kind: "COLLECTION", collectionId: "col_job", manifestId: "mf_today", lotId: "lot_job", location: "Offinso farm gate", latitude: 6.93, longitude: -1.65, windowLabel: "08:00–11:00", collectionFee: 90, consignmentIds: ["c_ama", "c_esi"], status: "PENDING", sequence: 1 },
    { id: "stop_transit_del", kind: "DELIVERY", manifestId: "mf_today", lotId: "lot_transit", location: "Avenor Cold Store, Accra", latitude: 5.6037, longitude: -0.187, windowLabel: "14:00–17:00", collectionFee: 0, consignmentIds: ["c_efua_tr", "c_kofi_tr"], status: "IN_TRANSIT", sequence: 2 },
    { id: "stop_tr_col", kind: "COLLECTION", collectionId: "col_transit", manifestId: "mf_today", lotId: "lot_transit", location: "Mampong", latitude: 7.06, longitude: -1.4, windowLabel: "06:00–09:00", collectionFee: 80, consignmentIds: ["c_efua_tr", "c_kofi_tr"], status: "COLLECTED", sequence: 0, completedAt: "2026-09-22T09:00:00.000Z" },
    { id: "stop_acc", kind: "COLLECTION", collectionId: "col_accept", lotId: "lot_accept", location: "Wenchi", latitude: 7.74, longitude: -2.1, windowLabel: "07:00–10:00", collectionFee: 200, consignmentIds: ["c_abena_acc", "c_yaw_acc"], status: "COLLECTED", sequence: 1, completedAt: "2026-09-21T10:00:00.000Z" },
    { id: "stop_paid", kind: "COLLECTION", collectionId: "col_paid", lotId: "lot_paid", location: "Techiman", latitude: 7.59, longitude: -1.94, windowLabel: "07:00–10:00", collectionFee: 100, consignmentIds: ["c_akua_paid", "c_kwesi_paid"], status: "COLLECTED", sequence: 1, completedAt: "2026-09-17T10:00:00.000Z" },
  );

  db.deliveries.push(
    { id: "del_transit", commitmentId: "cm_transit", lotId: "lot_transit", manifestId: "mf_today", stopId: "stop_transit_del", location: "Avenor Cold Store, Accra", status: "IN_TRANSIT", syncStatus: "SYNCED" },
    { id: "del_accept", commitmentId: "cm_accept", lotId: "lot_accept", location: "Avenor Cold Store, Accra", status: "DELIVERED", deliveredAt: "2026-09-22T15:30:00.000Z", syncStatus: "SYNCED" },
    { id: "del_paid", commitmentId: "cm_paid", lotId: "lot_paid", location: "Avenor Cold Store, Accra", status: "DELIVERED", deliveredAt: "2026-09-18T14:00:00.000Z", syncStatus: "SYNCED" },
    { id: "del_job", commitmentId: "cm_job", lotId: "lot_job", manifestId: "mf_today", location: "Avenor Cold Store, Accra", status: "PENDING", syncStatus: "SYNCED" },
  );

  const addInspection = (id: string, consignmentId: string, collectionId: string, actual: number, accepted: number, grade: string) => {
    db.inspections.push({
      id,
      consignmentId,
      collectionId,
      agentId: "a_nana",
      expectedQuantity: actual,
      actualQuantity: actual,
      rejectedQuantity: actual - accepted,
      acceptedQuantity: accepted,
      gradeCode: grade,
      qualityStatus: actual === accepted ? "ACCEPTED" : "PARTIAL",
      photoUris: [`mock-storage://evidence/${id}`],
      recordedAt: NOW,
      syncStatus: "SYNCED",
      idempotencyKey: `seed:${id}`,
      latitude: 7.59,
      longitude: -1.94,
    });
    db.grades.push({ id: `g_${id}`, inspectionId: id, consignmentId, code: grade, scaleId: "scale_tomato", recordedAt: NOW });
    db.weights.push({ id: `w_${id}`, inspectionId: id, consignmentId, expectedWeight: actual, actualWeight: accepted, unit: "kg", agentId: "a_nana", recordedAt: NOW });
  };
  addInspection("ins_efua", "c_efua_tr", "col_transit", 276, 270, "1");
  addInspection("ins_kofi", "c_kofi_tr", "col_transit", 410, 400, "1");
  addInspection("ins_abena", "c_abena_acc", "col_accept", 40, 40, "A");
  addInspection("ins_yaw", "c_yaw_acc", "col_accept", 360, 360, "A");
  addInspection("ins_akua", "c_akua_paid", "col_paid", 200, 200, "1");
  addInspection("ins_kwesi", "c_kwesi_paid", "col_paid", 600, 600, "1");
  db.grades.find((item) => item.id === "g_ins_abena")!.scaleId = "scale_pepper";
  db.grades.find((item) => item.id === "g_ins_yaw")!.scaleId = "scale_pepper";

  db.proofs.push(
    { id: "pod_accept", deliveryId: "del_accept", photoUris: ["mock-storage://pod/pod_accept"], receiverName: "Yaw Boateng", signatureName: "Yaw Boateng", timestamp: "2026-09-22T15:40:00.000Z", latitude: 5.6, longitude: -0.19, driverId: "d_samuel", syncStatus: "SYNCED", idempotencyKey: "seed:pod_accept" },
    { id: "pod_paid", deliveryId: "del_paid", photoUris: ["mock-storage://pod/pod_paid"], receiverName: "Esi Lamptey", signatureName: "Esi Lamptey", timestamp: "2026-09-18T14:10:00.000Z", latitude: 5.6, longitude: -0.19, driverId: "d_grace", syncStatus: "SYNCED", idempotencyKey: "seed:pod_paid" },
  );
  db.temperatures.push(
    { id: "temp_transit_col", stopId: "stop_tr_col", driverId: "d_samuel", manifestId: "mf_today", temperature: 10, unit: "C", timestamp: "2026-09-22T08:00:00.000Z", syncStatus: "SYNCED", idempotencyKey: "seed:temp1" },
    { id: "temp_accept", stopId: "stop_acc", driverId: "d_samuel", temperature: 8, unit: "C", timestamp: "2026-09-21T09:00:00.000Z", syncStatus: "SYNCED", idempotencyKey: "seed:temp2" },
  );
  db.locationPings.push({
    id: "ping1",
    driverId: "d_samuel",
    vehicleId: "v1",
    manifestId: "mf_today",
    latitude: 6.7,
    longitude: -1.62,
    timestamp: NOW,
    syncStatus: "SYNCED",
    idempotencyKey: "seed:ping1",
  });

  const akuaPay = calculateConsignmentSettlement({ confirmedWeight: 200, pricePerUnit: 5, consignmentWeight: 200, totalStopWeight: 800, stopCollectionFee: 100 });
  const kwesiPay = calculateConsignmentSettlement({ confirmedWeight: 600, pricePerUnit: 5, consignmentWeight: 600, totalStopWeight: 800, stopCollectionFee: 100 });
  db.settlements.push(
    { id: "set_akua", consignmentId: "c_akua_paid", farmerId: "f_akua", commitmentId: "cm_paid", grossValue: akuaPay.grossValue, collectionFee: akuaPay.collectionFee, otherDeductions: 0, netSettlement: akuaPay.netSettlement, feeCapped: akuaPay.feeCapped, status: "PAID", calculatedAt: "2026-09-18T16:06:00.000Z", paidAt: "2026-09-18T18:00:00.000Z", paymentReference: "PAY-2360-AKUA" },
    { id: "set_kwesi", consignmentId: "c_kwesi_paid", farmerId: "f_kwesi", commitmentId: "cm_paid", grossValue: kwesiPay.grossValue, collectionFee: kwesiPay.collectionFee, otherDeductions: 0, netSettlement: kwesiPay.netSettlement, feeCapped: kwesiPay.feeCapped, status: "PAID", calculatedAt: "2026-09-18T16:06:00.000Z", paidAt: "2026-09-18T18:00:00.000Z", paymentReference: "PAY-2360-KWESI" },
  );
  db.payments.push(
    { id: "pay_akua", settlementId: "set_akua", consignmentId: "c_akua_paid", provider: "mock", amountGhs: akuaPay.netSettlement, currency: "GHS", status: "PAID", externalReference: "PAY-2360-AKUA", idempotencyKey: "payout:set_akua", createdAt: "2026-09-18T16:06:00.000Z", paidAt: "2026-09-18T18:00:00.000Z" },
    { id: "pay_kwesi", settlementId: "set_kwesi", consignmentId: "c_kwesi_paid", provider: "mock", amountGhs: kwesiPay.netSettlement, currency: "GHS", status: "PAID", externalReference: "PAY-2360-KWESI", idempotencyKey: "payout:set_kwesi", createdAt: "2026-09-18T16:06:00.000Z", paidAt: "2026-09-18T18:00:00.000Z" },
  );
  db.idempotency.push(
    { key: "escrow-release:esc_paid", operation: "ESCROW_RELEASE", entityId: "esc_paid", createdAt: "2026-09-18T16:05:00.000Z" },
    { key: "payout:set_akua", operation: "PAYOUT", entityId: "pay_akua", createdAt: "2026-09-18T16:06:00.000Z" },
    { key: "payout:set_kwesi", operation: "PAYOUT", entityId: "pay_kwesi", createdAt: "2026-09-18T16:06:00.000Z" },
  );

  db.standingRequirements.push({
    id: "req_kumasi",
    offtakerId: "o_kumasi",
    produceId: "prod_tomato",
    quantity: 2000,
    unit: "kg",
    gradeRequirement: "Grade 1 or 2",
    deliveryLocation: "Asafo Cold Room, Kumasi",
    deliveryWindowStart: "2026-09-28",
    deliveryWindowEnd: "2026-09-30",
    temperatureMinC: 8,
    temperatureMaxC: 12,
    notes: "Weekly standing order for the Kumasi cold room.",
    status: "ACTIVE",
    createdAt: NOW,
  });

  db.exceptions.push(
    { id: "ex1", type: "Payment mismatch", severity: "MEDIUM", entityType: "BuyerOrder", entityId: "bo_mango", description: "Paid amount does not match the order total.", createdBy: "u_ops", status: "OPEN", createdAt: NOW },
    { id: "ex2", type: "Temp out of range", severity: "HIGH", entityType: "TemperatureRecord", entityId: "temp_seed", description: "14°C at depart last. Range is 0–8°C.", createdBy: "u_samuel", status: "OPEN", createdAt: NOW },
    { id: "ex3", type: "Consignment short", severity: "HIGH", entityType: "Consignment", entityId: "c_kofi_tr", description: "Kofi Adu short by 10 kg. Both the expected and confirmed weights are kept.", createdBy: "u_linda", status: "IN_PROGRESS", createdAt: NOW },
    { id: "ex4", type: "Farmer no show", severity: "MEDIUM", entityType: "FarmerProfile", entityId: "f_esi", description: "Esi Quaye was not at the farm gate.", createdBy: "u_nana", status: "RESOLVED", resolution: "Pickup moved inside the same window.", createdAt: NOW, resolvedAt: NOW },
    { id: "ex5", type: "Sync conflict", severity: "LOW", entityType: "FieldInspection", entityId: "ins_akua", description: "Two versions of this weight exist. Both kept. Waiting for the node manager. Phone 200.0 kg. Server 198.5 kg.", createdBy: "u_ops", status: "OPEN", createdAt: NOW },
    { id: "ex6", type: "Transfer failed", severity: "HIGH", entityType: "Payment", entityId: "pay_seed", description: "MoMo transfer to the farmer failed.", createdBy: "u_ops", status: "OPEN", createdAt: NOW },
    { id: "ex7", type: "Wallet limit", severity: "MEDIUM", entityType: "FarmerProfile", entityId: "f_akua", description: "Payout is above the farmer wallet tier.", createdBy: "u_ops", status: "OPEN", createdAt: NOW },
    { id: "ex8", type: "Delivery rejection", severity: "HIGH", entityType: "Delivery", entityId: "del_accept", description: "Receiver rejected 4 kg. Reason: soft fruit.", createdBy: "u_samuel", status: "OPEN", createdAt: NOW },
  );
  db.buyerOrders.push({
    id: "bo_mango",
    offtakerId: "o_accra",
    produceId: "prod_mango",
    quantityKg: 600,
    deliveryDate: "2026-09-26",
    pricePerKg: 6,
    totalGhs: 3600,
    orderStatus: "PAID",
    paymentStatus: "PAID",
    submittedBy: "u_accra",
    paidBy: "u_accra",
    createdAt: NOW,
  });
  db.opsConfig = {
    payoutApprovalThresholdGhs: 5000,
    payoutApproverIds: ["u_ops", "u_ops2"],
    temperatureMinC: 0,
    temperatureMaxC: 8,
    checkpoints: ["load", "farm_stop", "depart_last", "arrival", "handover"],
  };

  db.notifications.push(
    { id: "n1", userId: "u_akua", channel: "in_app", title: "Payment released", body: `GHS ${akuaPay.netSettlement.toFixed(2)} paid for tomatoes on LC-2360.`, read: false, createdAt: "2026-09-18T18:00:00.000Z", entityType: "Settlement", entityId: "set_akua" },
    { id: "n2", userId: "u_nana", channel: "in_app", title: "Assignment", body: "LC-2403 mango collection is assigned to you today.", read: false, createdAt: NOW, entityType: "Collection", entityId: "col_job" },
    { id: "n3", userId: "u_samuel", channel: "in_app", title: "Manifest assigned", body: "MF-0923 is your route today.", read: false, createdAt: NOW, entityType: "Manifest", entityId: "mf_today" },
    { id: "n4", userId: "u_accra", channel: "in_app", title: "Lot available", body: "LC-2401 tomatoes are ready for commitment.", read: false, createdAt: NOW, entityType: "Lot", entityId: "lot_pub" },
    { id: "n5", userId: "u_ops", channel: "in_app", title: "Delivery accepted", body: "LC-2388 was accepted. The farmer payout can be approved.", read: false, createdAt: "2026-09-22T16:00:00.000Z", entityType: "Lot", entityId: "lot_accept" },
  );
  db.smsMessages.push({
    id: "sms1",
    to: "+233244001001",
    body: `CryoChain paid GHS ${akuaPay.netSettlement.toFixed(2)} for Tomato. Ref PAY-2360-AKUA.`,
    status: "sent",
    provider: "mock",
    providerMessageId: "SMS-SEED-1",
    idempotencyKey: "sms:payout:set_akua",
    createdAt: "2026-09-18T18:00:00.000Z",
    event: "payout_completed",
    userId: "u_akua",
  });
  db.auditLogs.push(
    { id: "aud1", actorId: "u_ops", role: "ops", action: "LOT_CREATED", entity: "Lot", entityId: "lot_pub", newState: "LOT_CREATED", timestamp: NOW },
    { id: "aud2", actorId: "u_ops", role: "ops", action: "ESCROW_RELEASED", entity: "Lot", entityId: "lot_paid", previousState: "ESCROW_RELEASE_REQUESTED", newState: "ESCROW_RELEASED", timestamp: "2026-09-18T16:05:00.000Z" },
    { id: "aud3", actorId: "u_accra", role: "offtaker", action: "DELIVERY_ACCEPTED", entity: "Lot", entityId: "lot_accept", previousState: "DELIVERED", newState: "ACCEPTED", timestamp: "2026-09-22T16:00:00.000Z" },
    { id: "aud4", actorId: "u_nana", role: "field_agent", action: "FIELD_INSPECTION", entity: "FieldInspection", entityId: "ins_abena", newState: "SYNCED", timestamp: "2026-09-21T09:30:00.000Z" },
  );
  return db;
}
