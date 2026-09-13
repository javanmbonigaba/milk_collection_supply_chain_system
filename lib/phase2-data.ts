export type Farmer = {
  farmerId: string;
  userId?: string;
  username?: string;
  password?: string;
  fullName: string;
  nationalId?: string;
  phone: string;
  email?: string;
  province?: string;
  district?: string;
  sector?: string;
  village?: string;
  cell?: string;
  fullAddress?: string;
  mccId: string;
  mccName?: string;
  registeredBy?: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
};

export type CollectionRequest = {
  requestId: string;
  farmerId: string;
  collectorId: string;
  status: "PENDING" | "ACCEPTED" | "REJECTED";
  requestedAt: string;
  respondedAt?: string;
  collectorName?: string;
  mccName?: string;
};

export type Animal = {
  animalId: string;
  farmerId: string;
  tagNumber: string;
  breed?: string;
  sex: "FEMALE" | "MALE";
  dateOfBirth?: string;
  status: "ACTIVE" | "INACTIVE";
  registrationBatchId?: string;
  createdAt: string;
};

export type BreedType = {
  id: number;
  name: string;
};

export type CowRegistrationAuthorization = {
  batchId: string;
  farmerId: string;
  farmerName: string;
  requestedBy: string;
  requestedByName: string;
  cowCount: number;
  cowTags: string[];
  status: "PENDING_AUTHORIZATION" | "AUTHORIZED" | "REGISTERED" | "EXPIRED" | "REJECTED" | "CANCELLED";
  otpCode: string;
  createdAt: string;
  expiresAt: string;
};

export type CowRegistrationSession = CowRegistrationAuthorization & {
  authorizationSessionId: string;
  farmerPhone: string;
  verifiedAt?: string;
  usedAt?: string;
  cancelledAt?: string;
  failedAttempts: number;
  resendCount: number;
};

export type MilkCollection = {
  collectionId: string;
  farmerId: string;
  animalId?: string;
  mccId: string;
  collectionDate: string;
  collectionSource: "FARMER_COLLECTION_CHAIN" | "DIRECT_MCC_COLLECTION";
  litres: number;
  fatPercentage?: number;
  temperatureC?: number;
  acceptanceStatus: "PENDING" | "ACCEPTED" | "REJECTED";
  collectorAcceptanceStatus: "PENDING" | "ACCEPTED" | "REJECTED";
  mccAcceptanceStatus: "PENDING" | "ACCEPTED" | "REJECTED";
  mccComment?: string;
  notes?: string;
  collectedBy: string;
  collectorName?: string;
  collectorMccName?: string;
};

export type QualityTest = {
  testId: string;
  collectionId?: string;
  acidity?: number;
  density?: number;
  adulterationDetected: boolean;
  organolepticResult?: "PASS" | "FAIL";
  lactometerReading?: number;
  alcoholTestResult?: "PASS" | "FAIL";
  result: "PENDING" | "PASS" | "FAIL";
  comment?: string;
  testedBy: string;
  testedAt: string;
};

export type MilkBatch = {
  batchId: string;
  mccId: string;
  collectorId?: string;
  collectorName?: string;
  parentBatchCode?: string;
  batchDate: string;
  totalLitres: number;
  destination?: string;
  status: "OPEN" | "CLOSED" | "DISPATCHED" | "ACCEPTED" | "REJECTED";
  approvalComment?: string;
  approvedBy?: string;
  approvedAt?: string;
  createdBy: string;
  createdAt: string;
  collectionIds?: string[];
};

export type CollectorBatchAssignment = {
  assignmentId: string;
  collectorId: string;
  collectorName?: string;
  mccId: string;
  batchCode: string;
  status: "ACTIVE" | "INACTIVE";
  assignedBy: string;
  createdAt: string;
};

export type FarmerPayment = {
  paymentId: string;
  farmerId: string;
  periodStart: string;
  periodEnd: string;
  litres: number;
  ratePerLitre: number;
  amount: number;
  status: "PENDING" | "PAID" | "CANCELLED";
  paidAt?: string;
  processedBy: string;
  createdAt: string;
};

export type VeterinaryRecord = {
  recordId: string;
  animalId: string;
  visitDate: string;
  diagnosis: string;
  treatment?: string;
  medicine?: string;
  withdrawalUntil?: string;
  veterinarianId: string;
  notes?: string;
  clearanceStatus?: "ACTIVE" | "CLEARED";
};

export type Phase2Summary = {
  farmers: number;
  animals: number;
  collectionsToday: number;
  litresToday: number;
  pendingQualityTests: number;
  openBatches: number;
  pendingPayments: number;
};
