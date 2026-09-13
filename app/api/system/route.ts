import { NextResponse } from "next/server";
import { buildFarmerAddress } from "@/lib/farmer-validation";
import {
  appendAuditEntryToDatabase,
  createCowRegistrationBatch,
  cancelCowRegistrationBatch,
  resendCowRegistrationOtp,
  createBreedType,
  listBreedTypes,
  verifyCowRegistrationBatch,
  createCollection,
  createFarmer,
  listActiveCollectors,
  createCollectionRequest,
  decideCollectionRequest,
  cancelCollectionRequest,
  createBatch,
  deleteBatch,
  updateRejectedBatchComment,
  createPayment,
  updatePaymentShares,
  listCollectorPayments,
  markCollectorPaymentPaid,
  listAccountingRecords,
  createExpenseType,
  createExpense,
  listAdministrationRequests,
  createAdministrationRequest,
  decideAdministrationRequest,
  createQualityTest,
  createBatchQualityTest,
  createVeterinaryRecord,
  updateVeterinaryRecordDates,
  clearVeterinaryRecord,
  getPhase2Summary,
  getScopedPhase2Data,
  getUserByUid,
  updateUserByAdmin,
  createUser,
  createCollectorUser,
  deleteUserByAdmin,
  loginUser,
  changeUserPassword,
  listAnimals,
  listAuditLogsForAdmin,
  listCowRegistrationSessions,
  listCollections,
  listFarmers,
  listBatches,
  listPayments,
  listQualityTests,
  listVeterinaryRecords,
  findCowOwnerByTag,
  verifyFarmerForCollector,
  listCollectors,
  updateFarmerForCollector,
  deleteFarmerForCollector,
  updateAnimalForCollector,
  deleteAnimalForCollector,
  readDatabaseState,
  saveDatabaseState,
  updateMccByAdmin,
  listCollectorBatchAssignments,
  createCollectorBatchAssignment,
  listCollectorBatchApprovals,
  decideCollectorBatches,
} from "@/lib/data-layer";
import { DEFAULT_INITIAL_PASSWORD } from "@/lib/app-data";
import {
  getCompleteCellOptions,
  getCompleteDistrictOptions,
  getCompleteProvinceOptions,
  getCompleteSectorOptions,
  getCompleteVillageOptions,
} from "@/lib/rwanda-address-server";

export async function GET() {
  const state = await readDatabaseState();
  return NextResponse.json(state);
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    action?: string;
    state?: any;
    email?: string;
    password?: string;
    entry?: any;
    userId?: string;
    data?: any;
  };

  try {
    if (body.action === "login") {
      const user = await loginUser(body.email ?? "", body.password ?? "");
      return NextResponse.json({ ok: Boolean(user), message: user ? "Login successful." : "Invalid email or password.", user });
    }

    if (body.action === "changePassword") {
      await changeUserPassword(String(body.userId ?? ""), String(body.data?.currentPassword ?? ""), String(body.data?.newPassword ?? ""));
      return NextResponse.json({ ok: true });
    }

    if (body.action === "saveState") {
      await saveDatabaseState(body.state);
      return NextResponse.json(await readDatabaseState());
    }

    if (body.action === "updateMcc") {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor || !["SUPER_ADMIN", "ADMIN", "MCC_MANAGER"].includes(actor.role)) {
        return NextResponse.json({ error: "Only administrators and MCC managers can edit MCC details." }, { status: 403 });
      }
      const data = body.data ?? {};
      await updateMccByAdmin({
        mccId: String(data.mccId ?? ""),
        name: String(data.name ?? ""),
        district: String(data.district ?? ""),
      });
      await appendAuditEntryToDatabase({
        userId: actor.uid,
        action: "MCC_UPDATED",
        module: "mcc",
        entityType: "mccCenter",
        entityId: String(data.mccId ?? ""),
        description: `MCC details updated by ${actor.fullName}.`,
      }, actor.uid);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "appendAudit") {
      await appendAuditEntryToDatabase(body.entry, body.userId ?? "system");
      return NextResponse.json(await readDatabaseState());
    }

    if (body.action === "audit") {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor || !["SUPER_ADMIN", "ADMIN"].includes(actor.role)) {
        return NextResponse.json({ error: "Audit logs are restricted to the administrator." }, { status: 403 });
      }
      return NextResponse.json({ auditLogs: await listAuditLogsForAdmin() });
    }

    if (body.action === "cowRegistrationSessions") {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor || !["SUPER_ADMIN", "ADMIN"].includes(actor.role)) {
        return NextResponse.json({ error: "Authorization sessions are restricted to administrators." }, { status: 403 });
      }
      return NextResponse.json({ sessions: await listCowRegistrationSessions() });
    }

    if (body.action === "phase2") {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor) return NextResponse.json({ error: "Authenticated user required." }, { status: 401 });
      return NextResponse.json(await getScopedPhase2Data(actor));
    }

    if (body.action === "rwandaAddressOptions") {
      const province = String(body.data?.province ?? "");
      const district = String(body.data?.district ?? "");
      const sector = String(body.data?.sector ?? "");
      const cell = String(body.data?.cell ?? "");
      return NextResponse.json({
        provinces: getCompleteProvinceOptions(),
        districts: province ? getCompleteDistrictOptions(province) : [],
        sectors: province && district ? getCompleteSectorOptions(province, district) : [],
        cells: province && district && sector ? getCompleteCellOptions(province, district, sector) : [],
        villages: province && district && sector && cell ? getCompleteVillageOptions(province, district, sector, cell) : [],
      });
    }

    if (body.action === "farmerAddress") {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor) return NextResponse.json({ error: "Authenticated user required." }, { status: 401 });
      const farmer = (await listFarmers()).find((entry) => entry.farmerId === String(body.data?.farmerId ?? ""));
      if (!farmer) return NextResponse.json({ error: "Farmer was not found." }, { status: 404 });
      return NextResponse.json({
        province: farmer.province ?? null,
        district: farmer.district ?? null,
        sector: farmer.sector ?? null,
        cell: farmer.cell ?? null,
        village: farmer.village ?? null,
        country: "Rwanda",
        full_address: farmer.fullAddress ?? buildFarmerAddress({
          province: farmer.province ?? "",
          district: farmer.district ?? "",
          sector: farmer.sector ?? "",
          cell: farmer.cell ?? "",
          village: farmer.village ?? "",
        }),
      });
    }

    if (body.action === "breedTypes") {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor) return NextResponse.json({ error: "Authenticated user required." }, { status: 401 });
      return NextResponse.json({ breedTypes: await listBreedTypes() });
    }

    if (body.action === "createBreedType") {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor || actor.role !== "MCC_MANAGER") return NextResponse.json({ error: "Only the MCC Manager can create breed types." }, { status: 403 });
      const breedType = await createBreedType(String(body.data?.name ?? ""), actor.uid);
      return NextResponse.json({ ok: true, breedType });
    }

    if (body.action === "collectors") {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor || actor.role !== "VETERINARY_OFFICER") return NextResponse.json({ error: "Only veterinary officers can load collector assignments." }, { status: 403 });
      return NextResponse.json({ collectors: await listCollectors() });
    }

    if (body.action === "findCowOwnerByTag") {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor || actor.role !== "VETERINARY_OFFICER") {
        return NextResponse.json({ error: "Only veterinary officers can search cow owners." }, { status: 403 });
      }
      const result = await findCowOwnerByTag(String(body.data?.tagNumber ?? ""));
      if (!result) return NextResponse.json({ error: "No active cow was found with that tag number." }, { status: 404 });
      return NextResponse.json(result);
    }

    if (body.action === "updateUser") {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor || !["SUPER_ADMIN", "ADMIN"].includes(actor.role)) return NextResponse.json({ error: "Only administrators can edit users." }, { status: 403 });
      const target = body.data ?? {};
      if (!target.uid || !target.fullName || !target.email || !target.role || !target.status) return NextResponse.json({ error: "Name, email, role, and status are required." }, { status: 400 });
      await updateUserByAdmin(target);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "createCollector") {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor || actor.role !== "MCC_MANAGER") return NextResponse.json({ error: "Only the MCC Manager can create collectors." }, { status: 403 });
      const data = body.data ?? {};
      if (!data.fullName || !data.email) return NextResponse.json({ error: "Collector name and email are required." }, { status: 400 });
      const collectorBatchCode = await createCollectorUser({ uid: `collector-${Date.now()}`, fullName: String(data.fullName), email: String(data.email), password: DEFAULT_INITIAL_PASSWORD, mccIds: actor.mccIds ?? [] });
      return NextResponse.json({ ok: true, collectorBatchCode });
    }

    if (body.action === "deleteUser") {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor || !["SUPER_ADMIN", "ADMIN"].includes(actor.role)) return NextResponse.json({ error: "Only administrators can delete users." }, { status: 403 });
      if (!body.data?.uid || body.data.uid === actor.uid) return NextResponse.json({ error: "You cannot delete your own account." }, { status: 400 });
      await deleteUserByAdmin(String(body.data.uid));
      return NextResponse.json({ ok: true });
    }

    if (body.action === "createFarmer") {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor || !["SUPER_ADMIN", "ADMIN", "MCC_MANAGER", "MCC_OFFICER", "MILK_COLLECTOR", "VETERINARY_OFFICER"].includes(actor.role)) return NextResponse.json({ error: "You are not allowed to register farmers." }, { status: 403 });
      const registeredBy = actor.role === "VETERINARY_OFFICER" ? body.data.collectorId : actor.uid;
      if (actor.role === "VETERINARY_OFFICER" && !registeredBy) return NextResponse.json({ error: "Select a collector for this farmer." }, { status: 400 });
      await createFarmer({ ...body.data, registeredBy });
      await appendAuditEntryToDatabase({
        userId: body.userId ?? "system",
        action: "FARMER_CREATED",
        module: "farmers",
        entityType: "farmer",
        entityId: body.data.farmerId,
        description: `${body.data.fullName} was registered.`,
      }, body.userId);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "activeCollectors") {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor || actor.role !== "FARMER") return NextResponse.json({ error: "Only farmers can request a collector." }, { status: 403 });
      return NextResponse.json({ collectors: await listActiveCollectors() });
    }

    if (body.action === "createCollectionRequest") {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor || actor.role !== "FARMER") return NextResponse.json({ error: "Only farmers can request a collector." }, { status: 403 });
      const farmers = await listFarmers();
      const farmerRecord = farmers.find((entry) => entry.userId === actor.uid);
      if (!farmerRecord) return NextResponse.json({ error: "Farmer profile was not found." }, { status: 404 });
      await createCollectionRequest(farmerRecord.farmerId, String(body.data?.collectorId ?? ""));
      return NextResponse.json({ ok: true });
    }

    if (body.action === "decideCollectionRequest") {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor || actor.role !== "MILK_COLLECTOR") return NextResponse.json({ error: "Only milk collectors can decide requests." }, { status: 403 });
      await decideCollectionRequest(String(body.data?.requestId ?? ""), actor.uid, body.data?.status === "ACCEPTED" ? "ACCEPTED" : "REJECTED");
      return NextResponse.json({ ok: true });
    }

    if (body.action === "cancelCollectionRequest") {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor || actor.role !== "FARMER") return NextResponse.json({ error: "Only farmers can cancel requests." }, { status: 403 });
      const farmerRecord = (await listFarmers()).find((entry) => entry.userId === actor.uid);
      if (!farmerRecord) return NextResponse.json({ error: "Farmer profile was not found." }, { status: 404 });
      await cancelCollectionRequest(String(body.data?.requestId ?? ""), farmerRecord.farmerId);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "verifyFarmer") {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor || actor.role !== "MILK_COLLECTOR") return NextResponse.json({ error: "Only collectors can verify farmer IDs." }, { status: 403 });
      const farmer = await verifyFarmerForCollector(String(body.data?.farmerId ?? ""), actor.uid);
      if (!farmer) return NextResponse.json({ error: "Farmer ID was not found in your registered farmers." }, { status: 404 });
      return NextResponse.json({
        farmer: {
          farmerId: farmer.farmerId,
          fullName: farmer.fullName,
          phone: farmer.phone,
          email: farmer.email ?? null,
          nationalId: farmer.nationalId ?? null,
          mccId: farmer.mccId,
          status: farmer.status,
        },
      });
    }

    if (["updateFarmer", "deleteFarmer", "updateAnimal", "deleteAnimal"].includes(body.action ?? "")) {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor || !["MCC_OFFICER", "MILK_COLLECTOR"].includes(actor.role)) return NextResponse.json({ error: "Only MCC officers and collectors can manage these records." }, { status: 403 });
      if (actor.role === "MILK_COLLECTOR" && ["updateFarmer", "deleteFarmer"].includes(body.action ?? "")) {
        return NextResponse.json({ error: "Collectors can edit cows but cannot edit or delete farmer records." }, { status: 403 });
      }
      const allFarmers = actor.role === "MCC_OFFICER";
      if (body.action === "updateFarmer") await updateFarmerForCollector(body.data, actor.uid, allFarmers);
      if (body.action === "deleteFarmer") await deleteFarmerForCollector(String(body.data?.farmerId ?? ""), actor.uid, allFarmers);
      if (body.action === "updateAnimal") await updateAnimalForCollector(body.data, actor.uid, allFarmers);
      if (body.action === "deleteAnimal") await deleteAnimalForCollector(String(body.data?.animalId ?? ""), actor.uid, allFarmers);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "createAnimal") {
      return NextResponse.json(
        { error: "Direct cow registration is disabled. Submit a cow batch for farmer OTP authorization." },
        { status: 410 },
      );
    }

    if (body.action === "createCowRegistrationBatch") {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor || !["SUPER_ADMIN", "ADMIN", "MCC_MANAGER", "MCC_OFFICER", "MILK_COLLECTOR", "VETERINARY_OFFICER"].includes(actor.role)) {
        return NextResponse.json({ error: "You are not allowed to register cows." }, { status: 403 });
      }
      const data = body.data ?? {};
      const farmerId = String(data.farmerId ?? "");
      if (actor.role === "MILK_COLLECTOR" && !(await verifyFarmerForCollector(farmerId, actor.uid))) {
        return NextResponse.json({ error: "Collectors can only register cows for farmers assigned to their account." }, { status: 403 });
      }
      const result = await createCowRegistrationBatch({
        batchId: `COW-BATCH-${Date.now()}`,
        farmerId,
        requestedBy: actor.uid,
        cows: Array.isArray(data.cows) ? data.cows : [],
      });
      if (result.supersededBatchId) {
        await appendAuditEntryToDatabase({
          userId: actor.uid,
          action: "COW_REGISTRATION_OTP_SUPERSEDED",
          module: "animals",
          entityType: "cowRegistrationBatch",
          entityId: result.supersededBatchId,
          description: `A new OTP request for this farmer replaced the still-pending batch ${result.supersededBatchId}; only one active OTP per farmer is allowed.`,
        }, actor.uid);
      }
      await appendAuditEntryToDatabase({
        userId: actor.uid,
        action: "COW_REGISTRATION_AUTHORIZATION_REQUESTED",
        module: "animals",
        entityType: "cowRegistrationBatch",
        entityId: result.batchId,
        description: `A ${data.cows?.length ?? 0}-cow registration batch was sent to the farmer for OTP authorization.`,
      }, actor.uid);
      return NextResponse.json({ ok: true, ...result });
    }

    if (body.action === "verifyCowRegistrationBatch") {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor || !["SUPER_ADMIN", "ADMIN", "MCC_MANAGER", "MCC_OFFICER", "MILK_COLLECTOR", "VETERINARY_OFFICER"].includes(actor.role)) {
        return NextResponse.json({ error: "You are not allowed to verify cow registration batches." }, { status: 403 });
      }
      const batchId = String(body.data?.batchId ?? "");
      try {
        const result = await verifyCowRegistrationBatch({
          batchId,
          otp: String(body.data?.otp ?? ""),
          requestedBy: actor.uid,
        });
        await appendAuditEntryToDatabase({
          userId: actor.uid,
          action: "COW_REGISTRATION_BATCH_REGISTERED",
          module: "animals",
          entityType: "cowRegistrationBatch",
          entityId: result.batchId,
          description: `${result.registeredCount} cows were registered after successful farmer OTP authorization.`,
        }, actor.uid);
        return NextResponse.json({ ok: true, ...result });
      } catch (error) {
        await appendAuditEntryToDatabase({
          userId: actor.uid,
          action: "COW_REGISTRATION_OTP_VERIFICATION_FAILED",
          module: "animals",
          entityType: "cowRegistrationBatch",
          entityId: batchId,
          description: error instanceof Error ? error.message.replace(/\n/g, " ") : "OTP verification failed.",
        }, actor.uid);
        throw error;
      }
    }

    if (body.action === "cancelCowRegistrationBatch") {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor || !["SUPER_ADMIN", "ADMIN", "MCC_MANAGER", "MCC_OFFICER", "MILK_COLLECTOR", "VETERINARY_OFFICER"].includes(actor.role)) {
        return NextResponse.json({ error: "You are not allowed to cancel cow registration batches." }, { status: 403 });
      }
      const batchId = String(body.data?.batchId ?? "");
      const result = await cancelCowRegistrationBatch({ batchId, requestedBy: actor.uid });
      await appendAuditEntryToDatabase({
        userId: actor.uid,
        action: "COW_REGISTRATION_OTP_CANCELLED",
        module: "animals",
        entityType: "cowRegistrationBatch",
        entityId: result.batchId,
        description: "The collector cancelled OTP verification before the cow registration was completed. No cow was created.",
      }, actor.uid);
      return NextResponse.json({ ok: true, ...result });
    }

    if (body.action === "resendCowRegistrationOtp") {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor || !["SUPER_ADMIN", "ADMIN", "MCC_MANAGER", "MCC_OFFICER", "MILK_COLLECTOR", "VETERINARY_OFFICER"].includes(actor.role)) {
        return NextResponse.json({ error: "You are not allowed to resend a cow registration OTP." }, { status: 403 });
      }
      const batchId = String(body.data?.batchId ?? "");
      const result = await resendCowRegistrationOtp({ batchId, requestedBy: actor.uid });
      await appendAuditEntryToDatabase({
        userId: actor.uid,
        action: "COW_REGISTRATION_OTP_RESENT",
        module: "animals",
        entityType: "cowRegistrationBatch",
        entityId: result.batchId,
        description: "A new OTP was generated for the farmer; the previous OTP is no longer valid.",
      }, actor.uid);
      return NextResponse.json({ ok: true, ...result });
    }

    if (body.action === "createCollection") {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor || !["SUPER_ADMIN", "ADMIN", "MCC_MANAGER", "MCC_OFFICER", "MILK_COLLECTOR"].includes(actor.role)) return NextResponse.json({ error: "You are not allowed to record collections." }, { status: 403 });
      const collectionSource = actor.role === "MILK_COLLECTOR" ? "FARMER_COLLECTION_CHAIN" : String(body.data?.collectionSource ?? "");
      if (!["FARMER_COLLECTION_CHAIN", "DIRECT_MCC_COLLECTION"].includes(collectionSource)) {
        return NextResponse.json({ error: "A valid collection source is required." }, { status: 400 });
      }
      await createCollection({
        ...body.data,
        collectionSource,
        acceptanceStatus: "PENDING",
        collectorAcceptanceStatus: actor.role === "MILK_COLLECTOR" || collectionSource === "DIRECT_MCC_COLLECTION" ? "ACCEPTED" : body.data.collectorAcceptanceStatus,
        mccAcceptanceStatus: "PENDING",
        collectedBy: actor.uid,
      });
      await appendAuditEntryToDatabase({
        userId: body.userId ?? "system",
        action: "MILK_COLLECTED",
        module: "collections",
        entityType: "milkCollection",
        entityId: body.data.collectionId,
        description: `${body.data.litres} litres were recorded.`,
      }, body.userId);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "createVeterinaryRecord") {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor || !["SUPER_ADMIN", "ADMIN", "MCC_MANAGER", "VETERINARY_OFFICER"].includes(actor.role)) return NextResponse.json({ error: "You are not allowed to create veterinary records." }, { status: 403 });
      await createVeterinaryRecord({ ...body.data, veterinarianId: actor.uid });
      await appendAuditEntryToDatabase({
        userId: body.userId ?? "system",
        action: "VETERINARY_RECORD_CREATED",
        module: "veterinary",
        entityType: "veterinaryRecord",
        entityId: body.data.recordId,
        description: `${body.data.diagnosis} was recorded.`,
      }, body.userId);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "updateVeterinaryRecordDates") {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor || !["SUPER_ADMIN", "ADMIN", "MCC_MANAGER", "VETERINARY_OFFICER"].includes(actor.role)) return NextResponse.json({ error: "You are not allowed to update veterinary records." }, { status: 403 });
      await updateVeterinaryRecordDates(String(body.data.recordId ?? ""), String(body.data.visitDate ?? ""), String(body.data.withdrawalUntil ?? ""));
      await appendAuditEntryToDatabase({
        userId: body.userId ?? "system",
        action: "VETERINARY_RECORD_DATES_UPDATED",
        module: "veterinary",
        entityType: "veterinaryRecord",
        entityId: body.data.recordId,
        description: "Veterinary treatment dates were updated.",
      }, body.userId);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "clearVeterinaryRecord") {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor || !["SUPER_ADMIN", "ADMIN", "MCC_MANAGER", "VETERINARY_OFFICER"].includes(actor.role)) return NextResponse.json({ error: "You are not allowed to clear veterinary records." }, { status: 403 });
      await clearVeterinaryRecord(String(body.data.recordId ?? ""));
      await appendAuditEntryToDatabase({
        userId: body.userId ?? "system",
        action: "VETERINARY_RECORD_CLEARED",
        module: "veterinary",
        entityType: "veterinaryRecord",
        entityId: body.data.recordId,
        description: "Cow was cleared for milk collection.",
      }, body.userId);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "createQualityTest") {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor || !["SUPER_ADMIN", "ADMIN", "MCC_MANAGER", "MCC_OFFICER", "MILK_COLLECTOR"].includes(actor.role)) return NextResponse.json({ error: "You are not allowed to record quality tests." }, { status: 403 });
      await createQualityTest(body.data);
      await appendAuditEntryToDatabase({
        userId: body.userId ?? "system",
        action: "MILK_QUALITY_TESTED",
        module: "quality",
        entityType: "qualityTest",
        entityId: body.data.testId,
        description: `Collection ${body.data.collectionId} was marked ${body.data.result}.`,
      }, body.userId);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "createBatchQualityTest") {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor || !["SUPER_ADMIN", "ADMIN", "MCC_MANAGER", "MCC_OFFICER"].includes(actor.role)) return NextResponse.json({ error: "Only MCC officers can test batches." }, { status: 403 });
      await createBatchQualityTest({ ...body.data, testedBy: actor.uid });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "createBatch") {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor || !["SUPER_ADMIN", "ADMIN", "MCC_MANAGER", "PROCESSING_INDUSTRY", "MILK_COLLECTOR"].includes(actor.role)) return NextResponse.json({ error: "You are not allowed to create batches." }, { status: 403 });
      await createBatch(body.data);
      await appendAuditEntryToDatabase({
        userId: body.userId ?? "system",
        action: "MILK_BATCH_CREATED",
        module: "batches",
        entityType: "milkBatch",
        entityId: body.data.batchId,
        description: `${body.data.totalLitres} litres were assigned to a batch.`,
      }, body.userId);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "deleteBatch") {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor || !["SUPER_ADMIN", "ADMIN", "MCC_MANAGER", "PROCESSING_INDUSTRY", "MILK_COLLECTOR"].includes(actor.role)) return NextResponse.json({ error: "You are not allowed to delete batches." }, { status: 403 });
      await deleteBatch(String(body.data?.batchId ?? ""), actor);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "updateRejectedBatchComment") {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor || !["SUPER_ADMIN", "ADMIN", "MCC_MANAGER", "MCC_OFFICER"].includes(actor.role)) return NextResponse.json({ error: "Only MCC officers can add batch comments." }, { status: 403 });
      await updateRejectedBatchComment(String(body.data?.batchId ?? ""), String(body.data?.comment ?? ""));
      return NextResponse.json({ ok: true });
    }

    if (body.action === "collectorBatchApprovals") {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor || !["MCC_OFFICER", "MCC_MANAGER", "ADMIN", "SUPER_ADMIN"].includes(actor.role)) return NextResponse.json({ error: "Batch approval access denied." }, { status: 403 });
      return NextResponse.json({ batches: await listCollectorBatchApprovals() });
    }

    if (body.action === "collectorBatchAssignments") {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor || !["MILK_COLLECTOR", "MCC_OFFICER", "MCC_MANAGER", "ADMIN", "SUPER_ADMIN"].includes(actor.role)) return NextResponse.json({ error: "Batch assignment access denied." }, { status: 403 });
      const assignments = await listCollectorBatchAssignments();
      return NextResponse.json({ assignments: actor.role === "MILK_COLLECTOR" ? assignments.filter((assignment) => assignment.collectorId === actor.uid && assignment.status === "ACTIVE") : assignments });
    }

    if (body.action === "assignCollectorBatch") {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor || !["MCC_MANAGER", "ADMIN", "SUPER_ADMIN"].includes(actor.role)) return NextResponse.json({ error: "Only MCC Managers and administrators can assign collector batches." }, { status: 403 });
      const assignment = await createCollectorBatchAssignment({ collectorId: String(body.data?.collectorId ?? ""), mccId: String(body.data?.mccId ?? actor.mccIds[0] ?? ""), assignedBy: actor.uid, batchCode: body.data?.batchCode ? String(body.data.batchCode) : undefined });
      return NextResponse.json({ ok: true, assignment });
    }

    if (body.action === "decideCollectorBatches") {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor || !["MCC_OFFICER", "MCC_MANAGER", "ADMIN", "SUPER_ADMIN"].includes(actor.role)) return NextResponse.json({ error: "Only MCC Officers and Managers can approve collector batches." }, { status: 403 });
      await decideCollectorBatches({
        batchIds: Array.isArray(body.data?.batchIds) ? body.data.batchIds.map(String) : [],
        status: body.data?.status === "REJECTED" ? "REJECTED" : "ACCEPTED",
        comment: String(body.data?.comment ?? ""),
        approvedBy: actor.uid,
      });
      return NextResponse.json({ ok: true });
    }

    if (body.action === "createPayment") {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor || !["SUPER_ADMIN", "ADMIN", "FINANCE_OFFICER"].includes(actor.role)) return NextResponse.json({ error: "You are not allowed to create payments." }, { status: 403 });
      await createPayment(body.data);
      await appendAuditEntryToDatabase({
        userId: body.userId ?? "system",
        action: "FARMER_PAYMENT_CREATED",
        module: "payments",
        entityType: "farmerPayment",
        entityId: body.data.paymentId,
        description: `Payment of ${body.data.amount} was created.`,
      }, body.userId);
      return NextResponse.json({ ok: true });
    }

    if (body.action === "updatePaymentShares") {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor || actor.role !== "MCC_MANAGER") return NextResponse.json({ error: "Only the MCC Manager can modify payment shares." }, { status: 403 });
      await updatePaymentShares(Number(body.data?.mccSharePercent), Number(body.data?.collectorSharePercent));
      return NextResponse.json({ ok: true });
    }

    if (body.action === "accountingRecords") {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor || !["SUPER_ADMIN", "ADMIN", "MCC_OFFICER", "MCC_MANAGER"].includes(actor.role)) return NextResponse.json({ error: "Accounting access denied." }, { status: 403 });
      return NextResponse.json(await listAccountingRecords());
    }

    if (body.action === "collectorPayments") {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor || !["SUPER_ADMIN", "ADMIN", "MCC_MANAGER", "MCC_OFFICER", "FINANCE_OFFICER"].includes(actor.role)) {
        return NextResponse.json({ error: "You are not allowed to view collector payments." }, { status: 403 });
      }
      return NextResponse.json({ collectorPayments: await listCollectorPayments() });
    }

    if (body.action === "markCollectorPaymentPaid") {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor || !["SUPER_ADMIN", "ADMIN", "MCC_MANAGER", "MCC_OFFICER"].includes(actor.role)) {
        return NextResponse.json({ error: "Only MCC Officers and administrators can approve collector payments." }, { status: 403 });
      }
      await markCollectorPaymentPaid(body.data, actor.uid);
      await appendAuditEntryToDatabase({
        userId: actor.uid,
        action: "COLLECTOR_PAYMENT_PAID",
        module: "accounting",
        entityType: "collectorPayment",
        entityId: String(body.data?.paymentId ?? ""),
        description: `Collector payment for ${body.data?.collectorName ?? body.data?.collectorId} was marked Paid.`,
      }, actor.uid);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "createExpenseType") {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor || actor.role !== "MCC_MANAGER") return NextResponse.json({ error: "Only the MCC Manager can create expense types." }, { status: 403 });
      await createExpenseType(String(body.data?.typeName ?? ""), actor.uid);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "createExpense") {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor || !["MCC_OFFICER", "MCC_MANAGER"].includes(actor.role)) return NextResponse.json({ error: "Only MCC staff can record expenses." }, { status: 403 });
      await createExpense({ ...body.data, expenseId: `EXP-${Date.now()}`, recordedBy: actor.uid, amount: Number(body.data?.amount) });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "administrationRequests") {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor || !["MCC_OFFICER", "MCC_MANAGER"].includes(actor.role)) return NextResponse.json({ error: "Administration access denied." }, { status: 403 });
      return NextResponse.json({ requests: await listAdministrationRequests() });
    }
    if (body.action === "createAdministrationRequest") {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor || actor.role !== "MCC_OFFICER") return NextResponse.json({ error: "Only MCC Officers can submit these requests." }, { status: 403 });
      await createAdministrationRequest({ requestId: `REQ-${Date.now()}`, requestedBy: actor.uid, requestType: String(body.data?.requestType ?? ""), details: String(body.data?.details ?? "") });
      return NextResponse.json({ ok: true });
    }
    if (body.action === "decideAdministrationRequest") {
      const actor = await getUserByUid(body.userId ?? "");
      if (!actor || actor.role !== "MCC_MANAGER") return NextResponse.json({ error: "Only the MCC Manager can approve requests." }, { status: 403 });
      const status = body.data?.status;
      if (status !== "APPROVED" && status !== "REJECTED") return NextResponse.json({ error: "Invalid request decision." }, { status: 400 });
      await decideAdministrationRequest(String(body.data?.requestId ?? ""), status, actor.uid);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unsupported action" }, { status: 400 });
  } catch (error) {
    console.error("System API failed:", error);
    const message = error instanceof Error ? error.message : "Database operation failed.";
    const status = message === "Farmer already exists with this Phone Number and ID Number." ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
