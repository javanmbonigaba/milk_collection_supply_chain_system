"use client";

import { Fragment, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import QRCode from "qrcode";
import { AppShell, AccessDenied, AuthGuard } from "@/components/layout/app-shell";
import { useAuth } from "@/components/auth/auth-provider";
import { hasPermission } from "@/lib/auth/roles";
import {
  buildFarmerAddress,
  isValidNationalId,
  isValidRwandaPhoneNumber,
  normalizePhoneNumber,
} from "@/lib/farmer-validation";
import type { Animal, BreedType, CollectorBatchAssignment, CowRegistrationAuthorization, Farmer, FarmerPayment, MilkBatch, MilkCollection, Phase2Summary, QualityTest, VeterinaryRecord } from "@/lib/phase2-data";

type Phase2State = {
  farmers: Farmer[];
  animals: Animal[];
  collections: MilkCollection[];
  veterinaryRecords: VeterinaryRecord[];
  qualityTests: QualityTest[];
  batches: MilkBatch[];
  payments: FarmerPayment[];
  summary: Phase2Summary;
  mccs: Array<{ mccId: string; name: string }>;
  cowRegistrationAuthorizations: CowRegistrationAuthorization[];
  breedTypes: BreedType[];
};

type ChartSlice = { label: string; value: number; color: string };
type ConfirmationDialog = {
  title: string;
  message: string;
  confirmLabel: string;
  destructive?: boolean;
  onConfirm: () => void;
};

type RwandaAddressOptions = {
  provinces: string[];
  districts: string[];
  sectors: string[];
  cells: string[];
  villages: string[];
};

type CowBatchDraft = {
  animalId: string;
  farmerId: string;
  tagNumber: string;
  breed: string;
  sex: Animal["sex"];
  status: "ACTIVE";
};

function formatTimestamp(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function maskPhoneNumber(phone: string): string {
  const digits = phone.trim();
  if (digits.length <= 4) return digits;
  return `${digits.slice(0, 2)}${"*".repeat(Math.max(digits.length - 4, 0))}${digits.slice(-2)}`;
}

function formatCountdown(totalSeconds: number): string {
  const clamped = Math.max(totalSeconds, 0);
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}


function InteractivePieChart({ title, slices, selected, onSelect }: { title: string; slices: ChartSlice[]; selected: number; onSelect: (index: number) => void }) {
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  let offset = 0;
  const gradient = total
    ? slices.map((slice) => {
      const start = offset;
      offset += (slice.value / total) * 100;
      return `${slice.color} ${start}% ${offset}%`;
    }).join(", ")
    : "#e2e8f0 0% 100%";
  const active = slices[selected] ?? { label: "No data", value: 0, color: "#94a3b8" };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="font-semibold text-slate-900">{title}</h2>
      <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row">
        <div className="relative h-36 w-36 shrink-0 rounded-full" style={{ background: `conic-gradient(${gradient})` }}>
          <div className="absolute inset-7 flex flex-col items-center justify-center rounded-full bg-white text-center">
            <strong className="text-xl text-slate-900">{active.value}</strong>
            <span className="text-[10px] text-slate-500">{active.label}</span>
          </div>
        </div>
        <div className="w-full space-y-2">
          {slices.map((slice, index) => (
            <button key={slice.label} type="button" onClick={() => onSelect(index)} className={`flex w-full items-center justify-between rounded-lg px-2 py-1.5 text-sm ${selected === index ? "bg-slate-100 font-semibold" : "hover:bg-slate-50"}`}>
              <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: slice.color }} />{slice.label}</span>
              <span className="text-slate-500">{slice.value} ({total ? Math.round((slice.value / total) * 100) : 0}%)</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const initialState: Phase2State = {
  farmers: [],
  animals: [],
  collections: [],
  veterinaryRecords: [],
  qualityTests: [],
  batches: [],
  payments: [],
  summary: { farmers: 0, animals: 0, collectionsToday: 0, litresToday: 0, pendingQualityTests: 0, openBatches: 0, pendingPayments: 0 },
  mccs: [],
  cowRegistrationAuthorizations: [],
  breedTypes: [],
};

async function postAction(action: string, data: unknown, userId: string) {
  const response = await fetch("/api/system", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, data, userId }),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(payload?.error || "The operation could not be saved.");
  }
}

export default function OperationsPage({ managementOnly = false }: { managementOnly?: boolean }) {
  const { user } = useAuth();
  const [state, setState] = useState<Phase2State | null>(null);
  const [message, setMessage] = useState("");
  const [activeSection, setActiveSection] = useState("farmer-management");
  const [reportQrCode, setReportQrCode] = useState("");
  const [reportPreviewHtml, setReportPreviewHtml] = useState("");
  const [reportGeneratedAt] = useState(() => new Date().toLocaleString());
  const [reportReference] = useState(() => `RPT-${Date.now()}`);
  const [confirmationDialog, setConfirmationDialog] = useState<ConfirmationDialog | null>(null);
  const [recordsSearch, setRecordsSearch] = useState("");
  const [recordsSort, setRecordsSort] = useState<"newest" | "oldest">("newest");
  const [recordsStatus, setRecordsStatus] = useState<"ALL" | "ACCEPTED" | "REJECTED" | "PENDING">("ALL");
  const [recordsSource, setRecordsSource] = useState<"ALL" | MilkCollection["collectionSource"]>("ALL");
  const [recordsFrom, setRecordsFrom] = useState("");
  const [recordsTo, setRecordsTo] = useState("");
  const [expandedFarmer, setExpandedFarmer] = useState<string | null>(null);
  const [expandedCollectionFarmer, setExpandedCollectionFarmer] = useState<string | null>(null);
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);
  const [editingFarmer, setEditingFarmer] = useState<Farmer | null>(null);
  const [editingCow, setEditingCow] = useState<Animal | null>(null);
  const [editingVeterinaryRecord, setEditingVeterinaryRecord] = useState<string | null>(null);
  const [veterinaryDateForm, setVeterinaryDateForm] = useState({ visitDate: "", withdrawalUntil: "" });
  const [collectors, setCollectors] = useState<Array<{ uid: string; fullName: string }>>([]);
  const [addressOptions, setAddressOptions] = useState<RwandaAddressOptions>({ provinces: [], districts: [], sectors: [], cells: [], villages: [] });
  const [addressLoading, setAddressLoading] = useState(false);
  const [farmerForm, setFarmerForm] = useState({ fullName: "", username: "", password: "", email: "", phone: "", nationalId: "", province: "", district: "", sector: "", cell: "", village: "", mccId: "MCC-001", collectorId: "" });
  const [animalForm, setAnimalForm] = useState({ farmerId: "", tagNumber: "", breed: "", sex: "FEMALE" as Animal["sex"] });
  const [verifiedFarmer, setVerifiedFarmer] = useState<Farmer | null>(null);
  const [vetFarmerId, setVetFarmerId] = useState("");
  const [vetTagSearch, setVetTagSearch] = useState("");
  const [vetTagSearchMessage, setVetTagSearchMessage] = useState("");
  const [vetTagSearchResult, setVetTagSearchResult] = useState<{ animal: Animal; farmer: Farmer } | null>(null);
  const [verificationDialog, setVerificationDialog] = useState<{
    type: "success" | "error";
    title: string;
    message: string;
    farmer?: Farmer;
  } | null>(null);
  const [collectionForm, setCollectionForm] = useState({ farmerId: "", animalId: "", litres: "", fatPercentage: "", temperatureC: "", collectionSource: "FARMER_COLLECTION_CHAIN" as MilkCollection["collectionSource"] });
  const [vetForm, setVetForm] = useState({ animalId: "", visitDate: new Date().toISOString().slice(0, 10), diagnosis: "", treatment: "", medicine: "", withdrawalUntil: "" });
  const [qualityForm, setQualityForm] = useState({ collectionId: "", batchId: "", acidity: "", density: "", organolepticResult: "PASS" as "PASS" | "FAIL", lactometerReading: "", alcoholTestResult: "PASS" as "PASS" | "FAIL", adulterationDetected: false, result: "PASS" as QualityTest["result"], comment: "" });
  const [mccQualityTarget, setMccQualityTarget] = useState<"DIRECT_COLLECTION" | "BATCH">("DIRECT_COLLECTION");
  const [selectedQualityBatchIds, setSelectedQualityBatchIds] = useState<string[]>([]);
  const [expandedQualityBatchIds, setExpandedQualityBatchIds] = useState<string[]>([]);
  const [expandedQualityStatusBatchIds, setExpandedQualityStatusBatchIds] = useState<string[]>([]);
  const [showBatchTestWindow, setShowBatchTestWindow] = useState(false);
  const [batchComments, setBatchComments] = useState<Record<string, string>>({});
  const [batchForm, setBatchForm] = useState({ totalLitres: "", destination: "", collectionIds: [] as string[] });
  const [assignedBatches, setAssignedBatches] = useState<CollectorBatchAssignment[]>([]);
  const [selectedAssignedBatch, setSelectedAssignedBatch] = useState("");
  const [paymentForm, setPaymentForm] = useState({ farmerId: "", periodStart: new Date().toISOString().slice(0, 10), periodEnd: new Date().toISOString().slice(0, 10), litres: "", ratePerLitre: "620" });
  const [selectedChartSlice, setSelectedChartSlice] = useState({ ownership: 0, collections: 0 });
  const [cowBatchFarmerId, setCowBatchFarmerId] = useState("");
  const [cowFarmerSearch, setCowFarmerSearch] = useState("");
  const [cowBatchCows, setCowBatchCows] = useState<CowBatchDraft[]>([]);
  const [cowDraft, setCowDraft] = useState({ tagNumber: "", breed: "", sex: "FEMALE" as Animal["sex"] });
  // Backup of the cows submitted with the current pending OTP so they can be restored on cancel.
  const [cowBatchBackup, setCowBatchBackup] = useState<CowBatchDraft[]>([]);
  const [pendingCowBatch, setPendingCowBatch] = useState<{
    batchId: string;
    farmerId: string;
    farmerName: string;
    farmerPhone: string;
    cowCount: number;
    cows: Array<{ tagNumber: string; breed: string }>;
    expiresAt: string;
  } | null>(null);
  const [cowBatchOtp, setCowBatchOtp] = useState("");
  const [cowBatchBusy, setCowBatchBusy] = useState<"idle" | "generating" | "verifying" | "cancelling" | "resending">("idle");
  const [cowBatchOtpExpired, setCowBatchOtpExpired] = useState(false);
  const [cowBatchOtpSecondsLeft, setCowBatchOtpSecondsLeft] = useState(0);
  const matchingCowFarmers = (state?.farmers ?? []).filter((farmer) => {
    const query = cowFarmerSearch.trim().toLowerCase();
    return !query || [farmer.fullName, farmer.nationalId, farmer.phone].some((value) =>
      String(value ?? "").toLowerCase().includes(query),
    );
  });

  useEffect(() => {
    let active = true;
    if (!user) return () => { active = false; };
    fetch("/api/system", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "phase2", userId: user?.uid }) })
      .then((response) => response.json() as Promise<Phase2State>)
      .then((data) => { if (active) setState(data); })
      .catch(() => { if (active) setMessage("Phase 2 data could not be loaded. Check that the MySQL migration has been run."); });
    return () => { active = false; };
  }, [user?.uid]);

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setAddressLoading(true);
    fetch("/api/system", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rwandaAddressOptions", data: farmerForm }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Address options request failed.");
        return response.json() as Promise<RwandaAddressOptions>;
      })
      .then((data) => {
        if (!active) return;
        setAddressOptions({
          provinces: Array.isArray(data.provinces) ? data.provinces : [],
          districts: Array.isArray(data.districts) ? data.districts : [],
          sectors: Array.isArray(data.sectors) ? data.sectors : [],
          cells: Array.isArray(data.cells) ? data.cells : [],
          villages: Array.isArray(data.villages) ? data.villages : [],
        });
      })
      .catch((error: unknown) => {
        if (active && error instanceof Error && error.name !== "AbortError") setMessage("Rwanda address options could not be loaded.");
      })
      .finally(() => { if (active) setAddressLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [farmerForm.province, farmerForm.district, farmerForm.sector, farmerForm.cell]);

  useEffect(() => {
    if (!pendingCowBatch) {
      setCowBatchOtpSecondsLeft(0);
      return;
    }
    function tick() {
      if (!pendingCowBatch) return;
      const secondsLeft = Math.max(Math.round((new Date(pendingCowBatch.expiresAt).getTime() - Date.now()) / 1000), 0);
      setCowBatchOtpSecondsLeft(secondsLeft);
      if (secondsLeft === 0) setCowBatchOtpExpired(true);
    }
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [pendingCowBatch?.batchId, pendingCowBatch?.expiresAt]);

  useEffect(() => {
    if (user?.role !== "MILK_COLLECTOR") return;
    fetch("/api/system", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "collectorBatchAssignments", userId: user.uid }) })
      .then((response) => response.json())
      .then((data: { assignments?: CollectorBatchAssignment[] }) => { setAssignedBatches(data.assignments ?? []); setSelectedAssignedBatch(data.assignments?.[0]?.batchCode ?? ""); })
      .catch(() => setMessage("Assigned collector batches could not be loaded."));
  }, [user?.role, user?.uid]);

  useEffect(() => {
    if (user?.role !== "VETERINARY_OFFICER") return;
    fetch("/api/system", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "collectors", userId: user.uid }) })
      .then((response) => response.json())
      .then((data: { collectors?: Array<{ uid: string; fullName: string }> }) => setCollectors(data.collectors ?? []))
      .catch(() => setMessage("Collector assignments could not be loaded."));
  }, [user?.role, user?.uid]);

  useEffect(() => {
  if (user?.role !== "MILK_COLLECTOR" || !state) return;
  const reportPayload = JSON.stringify({
    type: "farmer-cow-registration-report",
    generated: reportGeneratedAt,
    farmers: state.farmers.map((farmer) => ({
      farmerId: farmer.farmerId,
      cows: state.animals.filter((cow) => cow.farmerId === farmer.farmerId).map((cow) => cow.tagNumber),
    })),
  });
  QRCode.toDataURL(reportPayload, { width: 180, margin: 1, color: { dark: "#0f172a", light: "#ffffff" } })
    .then(setReportQrCode)
    .catch(() => setReportQrCode(""));
  }, [reportGeneratedAt, state, user?.role, user?.uid]);

  useEffect(() => {
    const updateSection = () => setActiveSection(window.location.hash.replace("#", "") || "farmer-management");
    updateSection();
    window.addEventListener("hashchange", updateSection);
    return () => window.removeEventListener("hashchange", updateSection);
  }, []);

  if (!user || !hasPermission(user.role, managementOnly ? "farmer-cow.manage" : "operations.view")) {
    if (managementOnly && user) return <RedirectToDashboard />;
    return <AuthGuard><AppShell><AccessDenied /></AppShell></AuthGuard>;
  }

  const currentUser = user;
  const showSection = (section: string) => managementOnly || activeSection === section;
  const currentState = state ?? initialState;
  const provinceOptions = addressOptions.provinces;
  const districtOptions = addressOptions.districts;
  const sectorOptions = addressOptions.sectors;
  const cellOptions = addressOptions.cells;
  const villageOptions = addressOptions.villages;
  const generatedFarmerAddress = buildFarmerAddress({ province: farmerForm.province, district: farmerForm.district, sector: farmerForm.sector, cell: farmerForm.cell, village: farmerForm.village });
  const updateAddressSelection = (field: "province" | "district" | "sector" | "cell" | "village", value: string) => {
    setAddressOptions((current) => ({
      provinces: current.provinces,
      districts: field === "province" ? [] : current.districts,
      sectors: field === "province" || field === "district" ? [] : current.sectors,
      cells: field === "province" || field === "district" || field === "sector" ? [] : current.cells,
      villages: field === "province" || field === "district" || field === "sector" || field === "cell" ? [] : current.villages,
    }));
    setFarmerForm((current) => {
      const next = { ...current, [field]: value };
      if (field !== "province") next.province = current.province;
      if (field !== "district") next.district = current.district;
      if (field !== "sector") next.sector = current.sector;
      if (field !== "cell") next.cell = current.cell;
      if (field !== "village") next.village = current.village;
      if (field === "province") {
        next.district = "";
        next.sector = "";
        next.cell = "";
        next.village = "";
      }
      if (field === "district") {
        next.sector = "";
        next.cell = "";
        next.village = "";
      }
      if (field === "sector") {
        next.cell = "";
        next.village = "";
      }
      if (field === "cell") {
        next.village = "";
      }
      return next;
    });
  };
  const canWrite = hasPermission(currentUser.role, "operations.write");
  const isManagementRole = ["SUPER_ADMIN", "ADMIN", "MCC_MANAGER"].includes(currentUser.role);
  const canRegisterFarmer = isManagementRole || ["MCC_OFFICER", "MILK_COLLECTOR", "VETERINARY_OFFICER"].includes(currentUser.role);
  const canCollect = ["MCC_OFFICER", "MILK_COLLECTOR"].includes(currentUser.role);
  const canPracticeVeterinary = isManagementRole || currentUser.role === "VETERINARY_OFFICER";
  const canTestQuality = isManagementRole || ["MCC_OFFICER", "MILK_COLLECTOR"].includes(currentUser.role);
  const canCreateBatch = isManagementRole || currentUser.role === "PROCESSING_INDUSTRY" || currentUser.role === "MILK_COLLECTOR";
  const canViewBatches = canCreateBatch || currentUser.role === "MCC_OFFICER";
  const canCreatePayment = ["SUPER_ADMIN", "ADMIN", "FINANCE_OFFICER"].includes(currentUser.role);
  const cowsAssigned = currentState.farmers.filter((farmer) => currentState.animals.some((animal) => animal.farmerId === farmer.farmerId)).length;
  const collectionSlices: ChartSlice[] = [
    { label: "Accepted", value: currentState.collections.filter((item) => item.acceptanceStatus === "ACCEPTED").length, color: "#10b981" },
    { label: "Pending", value: currentState.collections.filter((item) => item.acceptanceStatus === "PENDING").length, color: "#f59e0b" },
    { label: "Rejected", value: currentState.collections.filter((item) => item.acceptanceStatus === "REJECTED").length, color: "#f43f5e" },
  ];
  const selectedCollectionFarmer = currentState.farmers.find((farmer) => farmer.farmerId === collectionForm.farmerId);
  const selectedFarmerCows = currentState.animals.filter((animal) => animal.farmerId === collectionForm.farmerId);
  const veterinaryCows = currentState.animals.filter((animal) => animal.farmerId === vetFarmerId);
  async function searchCowOwnerByTag() {
    const tagNumber = vetTagSearch.trim();
    if (!tagNumber) {
      setVetTagSearchMessage("Enter a cow tag number.");
      return;
    }
    setVetTagSearchMessage("");
    try {
      const response = await fetch("/api/system", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "findCowOwnerByTag", userId: currentUser.uid, data: { tagNumber } }),
      });
      const result = await response.json() as { animal?: Animal; farmer?: Farmer; error?: string };
      if (!response.ok || !result.animal || !result.farmer) {
        setVetTagSearchResult(null);
        setVetTagSearchMessage(result.error ?? "No cow was found with that tag number.");
        return;
      }
      setVetTagSearchResult({ animal: result.animal, farmer: result.farmer });
      setVetFarmerId(result.farmer.farmerId);
      setVetForm((current) => ({ ...current, animalId: result.animal!.animalId }));
      setVetTagSearchMessage(`Owner found: ${result.farmer.fullName}.`);
    } catch {
      setVetTagSearchResult(null);
      setVetTagSearchMessage("Cow owner search failed. Please try again.");
    }
  }
  const treatmentWarnings = currentState.veterinaryRecords
    .filter((record) => selectedFarmerCows.some((cow) => cow.animalId === record.animalId))
    .filter((record) => record.clearanceStatus !== "CLEARED" && (!record.withdrawalUntil || record.withdrawalUntil > new Date().toISOString().slice(0, 10)));
  const treatedCowIds = new Set(treatmentWarnings.map((record) => record.animalId));
  const collectorRecords = currentState.farmers
    .map((farmer) => ({
      farmer,
      cows: currentState.animals.filter((animal) => animal.farmerId === farmer.farmerId),
    }))
    .filter(({ farmer, cows }) => {
      const query = recordsSearch.trim().toLowerCase();
      if (!query) return true;
      return [farmer.farmerId, farmer.fullName, farmer.email, farmer.phone, ...cows.flatMap((cow) => [cow.tagNumber, cow.breed])]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    })
    .filter(({ farmer }) => (!recordsFrom || farmer.createdAt.slice(0, 10) >= recordsFrom) && (!recordsTo || farmer.createdAt.slice(0, 10) <= recordsTo))
    .sort((a, b) => {
      const comparison = new Date(a.farmer.createdAt).getTime() - new Date(b.farmer.createdAt).getTime();
      return recordsSort === "newest" ? -comparison : comparison;
    });
  const collectionRecords = currentState.farmers
    .map((farmer) => ({
      farmer,
      collections: currentState.collections.filter((collection) => collection.farmerId === farmer.farmerId),
    }))
    .filter(({ collections }) => collections.length > 0)
    .filter(({ farmer, collections }) => {
      const query = recordsSearch.trim().toLowerCase();
      if (!query) return true;
      return [farmer.farmerId, farmer.fullName, farmer.email, farmer.phone]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
    })
    .sort((a, b) => {
      const aDate = Math.max(...a.collections.map((collection) => new Date(collection.collectionDate).getTime()));
      const bDate = Math.max(...b.collections.map((collection) => new Date(collection.collectionDate).getTime()));
      return recordsSort === "newest" ? bDate - aDate : aDate - bDate;
    });
  const batchEligibleCollections = currentState.collections.filter((collection) =>
    collection.collectorAcceptanceStatus === "ACCEPTED"
    && collection.mccAcceptanceStatus === "PENDING"
    && collection.acceptanceStatus !== "REJECTED"
    && collection.acceptanceStatus !== "ACCEPTED"
    && !currentState.batches.some((batch) => batch.status !== "REJECTED" && batch.collectionIds?.includes(collection.collectionId)),
  );
  const collectedMilkRecords = currentState.collections
    .map((collection) => ({
      collection,
      farmer: currentState.farmers.find((farmer) => farmer.farmerId === collection.farmerId),
    }))
    .filter(({ farmer }) => Boolean(farmer))
    .filter(({ collection, farmer }) => {
      const query = recordsSearch.trim().toLowerCase();
      return !query || [farmer?.fullName, farmer?.phone, farmer?.email].filter(Boolean).some((value) => String(value).toLowerCase().includes(query));
    })
    .filter(({ collection }) => recordsStatus === "ALL" || collection.mccAcceptanceStatus === recordsStatus)
    .filter(({ collection }) => recordsSource === "ALL" || collection.collectionSource === recordsSource)
    .filter(({ collection }) => (!recordsFrom || collection.collectionDate.slice(0, 10) >= recordsFrom) && (!recordsTo || collection.collectionDate.slice(0, 10) <= recordsTo))
    .sort((a, b) => {
      const comparison = new Date(a.collection.collectionDate).getTime() - new Date(b.collection.collectionDate).getTime();
      return recordsSort === "newest" ? -comparison : comparison;
    });
  async function refresh() {
    const response = await fetch("/api/system", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "phase2", userId: currentUser.uid }) });
    setState(await response.json() as Phase2State);
  }

  async function submitSelectedBatchTests(decision: "PASS" | "FAIL" = qualityForm.result === "FAIL" ? "FAIL" : "PASS") {
    if (!selectedQualityBatchIds.length) {
      setMessage("Select at least one batch.");
      return;
    }
    const failedParameter = decision === "FAIL" || qualityForm.organolepticResult === "FAIL" || qualityForm.alcoholTestResult === "FAIL" || qualityForm.adulterationDetected;
    if (!qualityForm.comment.trim()) {
      setMessage("Add a comment before approving or rejecting the selected batches.");
      return;
    }
    try {
      for (const batchId of selectedQualityBatchIds) {
        await postAction("createBatchQualityTest", {
          testId: `QT-${Date.now()}-${batchId}`,
          ...qualityForm,
          result: decision,
          batchId,
          acidity: Number(qualityForm.acidity) || undefined,
          density: Number(qualityForm.density) || undefined,
          lactometerReading: Number(qualityForm.lactometerReading),
          testedBy: currentUser.uid,
          testedAt: new Date().toISOString(),
        }, currentUser.uid);
      }
      setSelectedQualityBatchIds([]);
      setExpandedQualityBatchIds([]);
      setShowBatchTestWindow(false);
      setMessage("Second Level Test results saved for the selected batches and their farmers.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Batch quality results could not be saved.");
    }
  }

  function generateReport() {
    const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    })[character] ?? character);
    const maskPhone = (value: string) => {
      const digits = value.replace(/\D/g, "");
      if (digits.length < 5) return "********";
      return `${digits.slice(0, 3)}${"*".repeat(Math.max(1, digits.length - 5))}${digits.slice(-2)}`;
    };
    const farmerRows = collectorRecords.map(({ farmer, cows }) => `
      <tr>
        <td><strong>${escapeHtml(farmer.fullName)}</strong></td>
        <td>${escapeHtml(maskPhone(farmer.phone))}</td>
        <td>${escapeHtml(new Date(farmer.createdAt).toLocaleDateString())}</td>
        <td>${cows.length} ${cows.length === 1 ? "cow" : "cows"}<br><small>${cows.map((cow) => `${escapeHtml(cow.tagNumber)} · ${escapeHtml(cow.breed || "Breed not provided")} · ${escapeHtml(cow.sex.toLowerCase())}`).join("<br>") || "No cows assigned"}</small></td>
      </tr>
    `).join("");
    const cowCount = collectorRecords.reduce((total, item) => total + item.cows.length, 0);
    const reportHtml = `<!doctype html><html><head><title>Farmer and Cow Registration Report</title><style>
      *{box-sizing:border-box}body{margin:0;padding:32px;color:#0f172a;font-family:Arial,Helvetica,sans-serif;background:#fff}
      .header{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #059669;padding-bottom:20px}
      .brand{display:flex;gap:16px;align-items:center}.logo{width:56px;height:56px;border-radius:16px;background:#059669;color:#fff;display:grid;place-items:center;font-size:28px;font-weight:700}
      .eyebrow{margin:0;color:#047857;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase}.title{margin:5px 0;font-size:25px}.muted{color:#64748b;font-size:12px}.qr{text-align:center}.qr img{width:100px;height:100px}.qr small{display:block;color:#64748b;font-size:9px;text-transform:uppercase}
      .summary{display:flex;justify-content:space-between;margin:22px 0;padding:12px 16px;border-radius:10px;background:#ecfdf5;color:#065f46;font-size:13px;font-weight:600}
      table{width:100%;border-collapse:collapse;font-size:12px}th{padding:11px 10px;text-align:left;background:#f1f5f9;color:#475569;font-size:10px;text-transform:uppercase;letter-spacing:.5px}td{padding:12px 10px;border-bottom:1px solid #e2e8f0;vertical-align:top}td span,td small{color:#64748b;font-size:11px;line-height:1.7}
      .footer{display:flex;justify-content:space-between;border-top:1px solid #cbd5e1;padding-top:14px;margin-top:28px;color:#64748b;font-size:10px}
      @media print{body{padding:18mm}.no-print{display:none!important}}
    </style></head><body>
      <header class="header"><div class="brand"><div class="logo">M</div><div><p class="eyebrow">Digital Milk Collection</p><h1 class="title">Farmer &amp; Cow Registration Report</h1><p class="muted">Collector: ${escapeHtml(currentUser.fullName)} · Generated ${escapeHtml(reportGeneratedAt)}</p></div></div>
      ${reportQrCode ? `<div class="qr"><img src="${reportQrCode}" alt="Report verification QR code"><small>Scan to verify</small></div>` : ""}
      </header>
      <div class="summary"><span>Official registration summary</span><span>${collectorRecords.length} farmers · ${cowCount} cows</span></div>
      <table><thead><tr><th>Owner</th><th>Phone</th><th>Registered</th><th>Assigned cows</th></tr></thead><tbody>${farmerRows || '<tr><td colspan="4">No matching records found.</td></tr>'}</tbody></table>
      <footer class="footer"><span>Digital Milk Collection · Official farmer and cow records</span><span>Report reference: ${escapeHtml(reportReference)}</span></footer>
    </body></html>`;
    setReportPreviewHtml(reportHtml);
    setMessage("Report generated. Review it below, then choose Print / Save as PDF.");
  }

  function printReportPreview() {
    if (!reportPreviewHtml) return;
    const printFrame = document.createElement("iframe");
    printFrame.setAttribute("title", "Print report");
    printFrame.style.position = "fixed";
    printFrame.style.width = "0";
    printFrame.style.height = "0";
    printFrame.style.border = "0";
    printFrame.srcdoc = reportPreviewHtml;
    printFrame.onload = () => {
      printFrame.contentWindow?.focus();
      printFrame.contentWindow?.print();
      window.setTimeout(() => printFrame.remove(), 1000);
    };
    document.body.appendChild(printFrame);
  }

  function generateMilkDecisionReport() {
    const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character] ?? character);
    const accepted = collectedMilkRecords.filter(({ collection }) => collection.mccAcceptanceStatus === "ACCEPTED");
    const rejected = collectedMilkRecords.filter(({ collection }) => collection.mccAcceptanceStatus === "REJECTED");
    const pending = collectedMilkRecords.filter(({ collection }) => collection.mccAcceptanceStatus === "PENDING");
    const litres = (items: typeof collectedMilkRecords) => items.reduce((total, item) => total + item.collection.litres, 0).toFixed(2);
    const rows = collectedMilkRecords.map(({ collection, farmer }) => `<tr><td>${escapeHtml(farmer?.fullName ?? "Unknown farmer")}</td><td>${escapeHtml(new Date(collection.collectionDate).toLocaleString())}</td><td>${collection.litres.toFixed(2)} L</td><td>${escapeHtml(collection.collectorAcceptanceStatus)}</td><td class="${collection.mccAcceptanceStatus.toLowerCase()}">${escapeHtml(collection.mccAcceptanceStatus)}</td><td>${escapeHtml(collection.mccComment ?? "—")}</td></tr>`).join("");
    const reportHtml = `<!doctype html><html><head><title>MCC Milk Decision Report</title><style>
      *{box-sizing:border-box}body{margin:0;padding:32px;color:#0f172a;font-family:Arial,Helvetica,sans-serif}header{border-bottom:3px solid #059669;padding-bottom:20px}.eyebrow{color:#047857;font-size:11px;font-weight:700;letter-spacing:3px;text-transform:uppercase}.muted{color:#64748b;font-size:12px}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:22px 0}.card{padding:12px;border-radius:10px;background:#f1f5f9;font-size:12px}.card strong{display:block;font-size:17px;margin-top:4px}table{width:100%;border-collapse:collapse;font-size:11px}th{padding:10px;text-align:left;background:#f1f5f9;color:#475569;font-size:9px;text-transform:uppercase}td{padding:10px;border-bottom:1px solid #e2e8f0}.accepted{color:#047857}.rejected{color:#be123c}.pending{color:#b45309}.footer{display:flex;justify-content:space-between;border-top:1px solid #cbd5e1;padding-top:14px;margin-top:28px;color:#64748b;font-size:10px}@media print{body{padding:18mm}}
    </style></head><body><header><p class="eyebrow">Digital Milk Collection</p><h1>Milk Accepted and Rejected by MCC</h1><p class="muted">Prepared by ${escapeHtml(currentUser.fullName)} · Generated ${escapeHtml(reportGeneratedAt)} · Filter: ${escapeHtml(recordsStatus)}</p></header><div class="summary"><div class="card">Accepted by MCC<strong class="accepted">${accepted.length} records · ${litres(accepted)} L</strong></div><div class="card">Rejected by MCC<strong class="rejected">${rejected.length} records · ${litres(rejected)} L</strong></div><div class="card">Pending MCC decision<strong class="pending">${pending.length} records · ${litres(pending)} L</strong></div><div class="card">Total displayed<strong>${collectedMilkRecords.length} records · ${litres(collectedMilkRecords)} L</strong></div></div><table><thead><tr><th>Farmer</th><th>Supplied at</th><th>Litres</th><th>Collector status</th><th>MCC decision</th><th>MCC comment</th></tr></thead><tbody>${rows || '<tr><td colspan="6">No milk collections match the selected filters.</td></tr>'}</tbody></table><footer class="footer"><span>Official MCC milk decision report</span><span>Report reference: ${escapeHtml(reportReference)}</span></footer></body></html>`;
    setReportPreviewHtml(reportHtml);
    setMessage("MCC milk decision report generated. Review it, then choose Print / Save as PDF.");
  }

  function RedirectToDashboard() {
    const router = useRouter();
    useEffect(() => {
      router.replace("/dashboard");
    }, [router]);
    return <div className="flex min-h-screen items-center justify-center text-slate-500">Returning to dashboard...</div>;
  }

  async function manageRecord(action: string, data: Record<string, unknown>): Promise<boolean> {
    try {
      await postAction(action, data, currentUser.uid);
      await refresh();
      setEditingFarmer(null);
      setEditingCow(null);
      if (action === "updateVeterinaryRecordDates" || action === "clearVeterinaryRecord") {
        setEditingVeterinaryRecord(null);
        window.dispatchEvent(new Event("veterinary-record-updated"));
      }
      setMessage("Record updated successfully.");
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Record operation failed.");
      return false;
    }

  }

  function startVeterinaryDateEdit(record: VeterinaryRecord) {
    setEditingVeterinaryRecord(record.recordId);
    setVeterinaryDateForm({ visitDate: record.visitDate, withdrawalUntil: record.withdrawalUntil ?? record.visitDate });
  }

  async function saveRejectedBatchComment(batchId: string) {
    if (await manageRecord("updateRejectedBatchComment", { batchId, comment: batchComments[batchId] ?? "" })) {
      setBatchComments((current) => ({ ...current, [batchId]: "" }));
    }
  }

  function isValidEmail(email: string) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  }

  async function submit(action: string, data: Record<string, unknown>, success: string) {
    if (!canWrite) return;
    try {
      await postAction(action, data, currentUser.uid);
      await refresh();
      if (action === "createFarmer") setFarmerForm({ fullName: "", username: "", password: "", email: "", phone: "", nationalId: "", province: "", district: "", sector: "", cell: "", village: "", mccId: "MCC-001", collectorId: "" });
      if (action === "createAnimal") {
        setAnimalForm({ farmerId: "", tagNumber: "", breed: "", sex: "FEMALE" });
        setVerifiedFarmer(null);
      }

      if (action === "createCollection") setCollectionForm({ farmerId: "", animalId: "", litres: "", fatPercentage: "", temperatureC: "", collectionSource: "FARMER_COLLECTION_CHAIN" });
      if (action === "createVeterinaryRecord") {
        setVetFarmerId("");
        setVetForm({ animalId: "", visitDate: new Date().toISOString().slice(0, 10), diagnosis: "", treatment: "", medicine: "", withdrawalUntil: "" });
      }
      if (action === "createQualityTest" || action === "createBatchQualityTest") setQualityForm({ collectionId: "", batchId: "", acidity: "", density: "", organolepticResult: "PASS", lactometerReading: "", alcoholTestResult: "PASS", adulterationDetected: false, result: "PASS", comment: "" });
      if (action === "createBatch") setBatchForm({ totalLitres: "", destination: "", collectionIds: [] });
      if (action === "createPayment") setPaymentForm({ farmerId: "", periodStart: new Date().toISOString().slice(0, 10), periodEnd: new Date().toISOString().slice(0, 10), litres: "", ratePerLitre: "620" });
      setMessage(success);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "The operation could not be saved.");
    }

  }

  function requestConfirmation(dialog: Omit<ConfirmationDialog, "onConfirm">, onConfirm: () => void) {
    setConfirmationDialog({ ...dialog, onConfirm });
  }

  function requestSubmitConfirmation(action: string, data: Record<string, unknown>, success: string, recordName: string) {
    requestConfirmation(
      { title: "Confirm save", message: `Do you want to save this ${recordName}?`, confirmLabel: "Save record" },
      () => { void submit(action, data, success); },
    );
  }

  function requestManageConfirmation(action: string, data: Record<string, unknown>, title: string, messageText: string, destructive = false) {
    requestConfirmation(
      { title, message: messageText, confirmLabel: destructive ? "Delete record" : "Save changes", destructive },
      () => { void manageRecord(action, data); },
    );
  }

  function requestFarmerUpdate() {
    if (!editingFarmer) return;
    const normalizedPhone = normalizePhoneNumber(editingFarmer.phone);
    if (!isValidRwandaPhoneNumber(normalizedPhone)) {
      setMessage("Enter a valid Rwanda phone number in the format 078XXXXXXX.");
      return;
    }
    if (!isValidNationalId(editingFarmer.nationalId ?? "")) {
      setMessage("Enter a valid 16-digit national ID number.");
      return;
    }
    if (editingFarmer.email && !isValidEmail(editingFarmer.email)) {
      setMessage("Enter a valid farmer email address before saving.");
      return;
    }
    if (!farmerForm.province || !farmerForm.district || !farmerForm.sector || !farmerForm.cell || !farmerForm.village) {
      setMessage("Select a complete Rwanda address before saving the farmer.");
      return;
    }
    requestManageConfirmation("updateFarmer", { ...editingFarmer, phone: normalizedPhone, province: farmerForm.province, district: farmerForm.district, sector: farmerForm.sector, cell: farmerForm.cell, village: farmerForm.village }, "Confirm changes", "Save your changes to this farmer record?");
  }

  async function verifyFarmer() {
    try {
      const response = await fetch("/api/system", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "verifyFarmer", userId: currentUser.uid, data: { farmerId: animalForm.farmerId } }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error);
      setVerifiedFarmer(result.farmer as Farmer);
      setVerificationDialog({
        type: "success",
        title: "Farmer ID verified",
        message: `Farmer ID ${result.farmer.farmerId} was found in your registered farmers.`,
        farmer: result.farmer,
      });
      setMessage(`Verified Farmer ID: ${result.farmer.farmerId}`);
    } catch (error) {
      setVerifiedFarmer(null);
      setVerificationDialog({
        type: "error",
        title: "Farmer ID not found",
        message: error instanceof Error ? error.message : "Farmer verification failed.",
      });
    }
  }

  function addCowToBatch() {
      if (!cowBatchFarmerId || !cowDraft.tagNumber.trim() || !cowDraft.breed.trim()) {
        setMessage("Select a farmer and provide the cow tag number and breed.");
        return;
      }
      if (cowBatchCows.some((cow) => cow.tagNumber.trim().toLowerCase() === cowDraft.tagNumber.trim().toLowerCase())) {
        setMessage("That cow tag is already in this batch.");
        return;
      }
      setCowBatchCows((current) => [...current, {
        animalId: `A-${Date.now()}-${current.length}`,
        farmerId: cowBatchFarmerId,
        tagNumber: cowDraft.tagNumber.trim(),
        breed: cowDraft.breed.trim(),
        sex: cowDraft.sex,
        status: "ACTIVE",
      }]);
      setCowDraft({ tagNumber: "", breed: "", sex: "FEMALE" });
      setMessage("");
    }

  function startEditCowBatchCow(cow: CowBatchDraft) {
    setCowDraft({ tagNumber: cow.tagNumber, breed: cow.breed, sex: cow.sex });
    setCowBatchCows((current) => current.filter((item) => item.animalId !== cow.animalId));
    setMessage("Cow moved back into the form for editing. Update the fields and choose Add another cow, or resubmit the batch.");
  }

  function removeCowBatchCow(animalId: string) {
    setCowBatchCows((current) => current.filter((item) => item.animalId !== animalId));
  }

  async function submitCowBatch() {
      const cowsToSubmit = [...cowBatchCows];
      if (cowDraft.tagNumber.trim() || cowDraft.breed.trim()) {
        if (!cowDraft.tagNumber.trim() || !cowDraft.breed.trim()) {
          setMessage("Complete the current cow row before submitting.");
          return;
        }
        cowsToSubmit.push({
          animalId: `A-${Date.now()}-${cowsToSubmit.length}`,
          farmerId: cowBatchFarmerId,
          tagNumber: cowDraft.tagNumber.trim(),
          breed: cowDraft.breed.trim(),
          sex: cowDraft.sex,
          status: "ACTIVE",
        });
      }
      if (!canWrite || !cowBatchFarmerId || !cowsToSubmit.length) {
        setMessage("Select a farmer and add at least one cow before requesting authorization.");
        return;
      }
      const farmer = (state?.farmers ?? []).find((item) => item.farmerId === cowBatchFarmerId);
      if (!farmer) {
        setMessage("Select a valid farmer before requesting authorization.");
        return;
      }
      setCowBatchBusy("generating");
      setMessage("Generating OTP...");
      try {
        const response = await fetch("/api/system", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "createCowRegistrationBatch",
            userId: currentUser.uid,
            data: { farmerId: cowBatchFarmerId, cows: cowsToSubmit },
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Authorization request failed.");
        setPendingCowBatch({
          batchId: result.batchId,
          farmerId: cowBatchFarmerId,
          farmerName: farmer.fullName,
          farmerPhone: farmer.phone,
          cowCount: cowsToSubmit.length,
          cows: cowsToSubmit.map((cow) => ({ tagNumber: cow.tagNumber, breed: cow.breed })),
          expiresAt: result.expiresAt,
        });
        // Back up the submitted cows so Cancel OTP can restore them for editing.
        setCowBatchBackup(cowsToSubmit);
        setCowBatchOtpExpired(false);
        setCowBatchCows([]);
        setCowDraft({ tagNumber: "", breed: "", sex: "FEMALE" });
        setMessage("One OTP was sent to the farmer phone and is visible on the farmer dashboard.");
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Authorization request failed.");
      } finally {
        setCowBatchBusy("idle");
      }
    }

  function resetCowRegistrationVerification() {
    setPendingCowBatch(null);
    setCowBatchOtp("");
    setCowBatchOtpExpired(false);
    setCowBatchOtpSecondsLeft(0);
  }

  async function verifyCowBatchOtp() {
      if (!pendingCowBatch || cowBatchBusy !== "idle") return;
      setCowBatchBusy("verifying");
      setMessage("Verifying OTP...");
      try {
        const response = await fetch("/api/system", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "verifyCowRegistrationBatch",
            userId: currentUser.uid,
            data: { batchId: pendingCowBatch.batchId, otp: cowBatchOtp },
          }),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Unable to process the request.\nPlease try again.");
        setCowBatchBackup([]);
        resetCowRegistrationVerification();
        await refresh();
        setMessage(`${result.registeredCount} cows registered. Farmer authorization was confirmed by the OTP.`);
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Unable to process the request.\nPlease try again.");
      } finally {
        setCowBatchBusy("idle");
    }
  }

  function requestCancelCowRegistration() {
    if (!pendingCowBatch || cowBatchBusy !== "idle") return;
    setConfirmationDialog({
      title: "Cancel OTP Verification?",
      message: "Are you sure you want to cancel this cow registration verification? The current OTP will become invalid, but the cows you submitted will be restored so you can edit them and submit again.",
      confirmLabel: "Yes, Cancel",
      destructive: true,
      onConfirm: () => void cancelCowBatchOtp(),
    });
  }

  async function cancelCowBatchOtp() {
    if (!pendingCowBatch) return;
    const batchId = pendingCowBatch.batchId;
    const farmerId = pendingCowBatch.farmerId;
    const farmerName = pendingCowBatch.farmerName;
    setCowBatchBusy("cancelling");
    setMessage("Cancelling OTP...");
    try {
      const response = await fetch("/api/system", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "cancelCowRegistrationBatch", userId: currentUser.uid, data: { batchId } }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to process the request.\nPlease try again.");

      // Restore the cows and re-select the farmer so the user can continue editing.
      const restoredCows = cowBatchBackup.length ? cowBatchBackup : [];
      setCowBatchCows(restoredCows);
      setCowBatchFarmerId(farmerId);
      setCowFarmerSearch(farmerName);
      setCowBatchBackup([]);
      setCowDraft({ tagNumber: "", breed: "", sex: "FEMALE" });

      resetCowRegistrationVerification();
      setMessage(
        restoredCows.length
          ? "Cow registration verification cancelled successfully.\nThe cows have been restored so you can edit and resubmit."
          : "Cow registration verification cancelled successfully.\nNo cow registration was completed.",
      );
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to process the request.\nPlease try again.");
    } finally {
      setCowBatchBusy("idle");
    }
  }

  async function resendCowBatchOtp() {
    if (!pendingCowBatch || cowBatchBusy !== "idle") return;
    setCowBatchBusy("resending");
    setMessage("Generating OTP...");
    try {
      const response = await fetch("/api/system", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "resendCowRegistrationOtp", userId: currentUser.uid, data: { batchId: pendingCowBatch.batchId } }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Unable to process the request.\nPlease try again.");
      setPendingCowBatch((current) => (current ? { ...current, expiresAt: result.expiresAt } : current));
      setCowBatchOtp("");
      setCowBatchOtpExpired(false);
      setMessage("A new OTP was sent to the farmer phone. The previous OTP is no longer valid.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to process the request.\nPlease try again.");
    } finally {
      setCowBatchBusy("idle");
    }
  }

  return (
    <AuthGuard>
      <AppShell>
        <div className="space-y-6">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Phase 2</p>
            <h1 className="text-3xl font-semibold text-slate-900">{managementOnly ? "Farmer & Cow Management" : "Operational workflows"}</h1>
            <p className="mt-2 text-sm text-slate-500">
              {currentUser.role === "MILK_COLLECTOR"
                ? "Register farmers and their cows under your collector account, then record their milk collection."
                : `Signed in as ${currentUser.role}. Your records are scoped to your account and assigned responsibilities.`}
            </p>
          </div>
          {message ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</div> : null}
          {confirmationDialog ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="confirmation-dialog-title">
              <div className="w-full max-w-md overflow-hidden rounded-3xl border border-white/70 bg-white shadow-2xl">
                <div className="bg-gradient-to-br from-emerald-600 to-teal-700 px-6 py-7 text-white">
                  <div className="flex items-center justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/20 text-2xl ring-1 ring-white/30">?</div>
                    <button type="button" onClick={() => setConfirmationDialog(null)} aria-label="Close confirmation dialog" className="rounded-full p-2 text-white/80 transition hover:bg-white/15 hover:text-white">X</button>
                  </div>
                  <h2 id="confirmation-dialog-title" className="mt-5 text-2xl font-semibold">{confirmationDialog.title}</h2>
                  <p className="mt-2 text-sm leading-6 text-emerald-50">{confirmationDialog.message}</p>
                </div>
                <div className="flex flex-col-reverse gap-3 bg-white px-6 py-5 sm:flex-row sm:justify-end">
                  <button type="button" onClick={() => setConfirmationDialog(null)} className="rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50">Cancel</button>
                  <button type="button" onClick={() => { const confirm = confirmationDialog.onConfirm; setConfirmationDialog(null); confirm(); }} className={`rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition ${confirmationDialog.destructive ? "bg-rose-600 hover:bg-rose-700" : "bg-slate-900 hover:bg-slate-800"}`}>{confirmationDialog.confirmLabel}</button>
                </div>
              </div>
            </div>
          ) : null}
          {verificationDialog ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true" aria-labelledby="verification-dialog-title">
              <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl">
                <div className={`flex h-10 w-10 items-center justify-center rounded-full text-lg ${verificationDialog.type === "success" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                  {verificationDialog.type === "success" ? "✓" : "!"}
                </div>
                <h2 id="verification-dialog-title" className="mt-4 text-xl font-semibold text-slate-900">{verificationDialog.title}</h2>
                <p className="mt-2 text-sm text-slate-600">{verificationDialog.message}</p>
                {verificationDialog.farmer ? (
                  <dl className="mt-4 grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-4 text-sm">
                    <div><dt className="text-slate-500">Farmer ID</dt><dd className="font-medium text-slate-900">{verificationDialog.farmer.farmerId}</dd></div>
                    <div><dt className="text-slate-500">Status</dt><dd className="font-medium text-slate-900">{verificationDialog.farmer.status}</dd></div>
                    <div><dt className="text-slate-500">Full name</dt><dd className="font-medium text-slate-900">{verificationDialog.farmer.fullName}</dd></div>
                    <div><dt className="text-slate-500">Phone</dt><dd className="font-medium text-slate-900">{verificationDialog.farmer.phone}</dd></div>
                    <div><dt className="text-slate-500">Email</dt><dd className="break-all font-medium text-slate-900">{verificationDialog.farmer.email ?? "Not provided"}</dd></div>
                    <div><dt className="text-slate-500">National ID</dt><dd className="font-medium text-slate-900">{verificationDialog.farmer.nationalId ?? "Not provided"}</dd></div>
                    <div><dt className="text-slate-500">MCC Name</dt><dd className="font-medium text-slate-900">{verificationDialog.farmer.mccName ?? verificationDialog.farmer.mccId}</dd></div>
                    <div><dt className="text-slate-500">District</dt><dd className="font-medium text-slate-900">{verificationDialog.farmer.district ?? "Not provided"}</dd></div>
                    <div><dt className="text-slate-500">Sector</dt><dd className="font-medium text-slate-900">{verificationDialog.farmer.sector ?? "Not provided"}</dd></div>
                    <div><dt className="text-slate-500">Village</dt><dd className="font-medium text-slate-900">{verificationDialog.farmer.village ?? "Not provided"}</dd></div>
                  </dl>
                ) : null}
                <button type="button" onClick={() => setVerificationDialog(null)} className="mt-5 w-full rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white">
                  {verificationDialog.type === "success" ? "Continue registration" : "Close"}
                </button>
              </div>
            </div>
          ) : null}
          {editingFarmer || editingCow ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4" role="dialog" aria-modal="true">
              <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
                <h2 className="text-xl font-semibold text-slate-900">{editingFarmer ? "Edit farmer record" : "Edit cow record"}</h2>
                {editingFarmer ? (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <input value={editingFarmer.fullName} onChange={(e) => setEditingFarmer({ ...editingFarmer, fullName: e.target.value })} placeholder="Full name" className="rounded-xl border px-3 py-2" />
                    <input value={editingFarmer.phone} onChange={(e) => setEditingFarmer({ ...editingFarmer, phone: e.target.value })} placeholder="Phone" className="rounded-xl border px-3 py-2" />
                    <input value={editingFarmer.email ?? ""} onChange={(e) => setEditingFarmer({ ...editingFarmer, email: e.target.value })} placeholder="Email" className="rounded-xl border px-3 py-2" />
                    <input value={editingFarmer.nationalId ?? ""} onChange={(e) => setEditingFarmer({ ...editingFarmer, nationalId: e.target.value })} placeholder="National ID" className="rounded-xl border px-3 py-2" />
                    <select value={farmerForm.province} onChange={(e) => updateAddressSelection("province", e.target.value)} className="rounded-xl border px-3 py-2"><option value="">Select Province</option>{provinceOptions.map((province) => <option key={province} value={province}>{province}</option>)}</select>
                    <select value={farmerForm.district} onChange={(e) => updateAddressSelection("district", e.target.value)} disabled={!farmerForm.province} className="rounded-xl border px-3 py-2"><option value="">Select District</option>{districtOptions.map((district: string) => <option key={district} value={district}>{district}</option>)}</select>
                    <select value={farmerForm.sector} onChange={(e) => updateAddressSelection("sector", e.target.value)} disabled={!farmerForm.district} className="rounded-xl border px-3 py-2"><option value="">Select Sector</option>{sectorOptions.map((sector: string) => <option key={sector} value={sector}>{sector}</option>)}</select>
                    <select value={farmerForm.cell} onChange={(e) => updateAddressSelection("cell", e.target.value)} disabled={!farmerForm.sector} className="rounded-xl border px-3 py-2"><option value="">Select Cell</option>{cellOptions.map((cell: string) => <option key={cell} value={cell}>{cell}</option>)}</select>
                    <select value={farmerForm.village} onChange={(e) => updateAddressSelection("village", e.target.value)} disabled={!farmerForm.cell} className="rounded-xl border px-3 py-2"><option value="">Select Village</option>{villageOptions.map((village: string) => <option key={village} value={village}>{village}</option>)}</select>
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 sm:col-span-2">{buildFarmerAddress({ province: farmerForm.province, district: farmerForm.district, sector: farmerForm.sector, cell: farmerForm.cell, village: farmerForm.village }) || "Select a complete Rwanda address"}</div>
                  </div>
                ) : (
                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <input value={editingCow?.tagNumber ?? ""} onChange={(e) => setEditingCow(editingCow ? { ...editingCow, tagNumber: e.target.value } : null)} placeholder="Tag number" className="rounded-xl border px-3 py-2" />
                    <input value={editingCow?.breed ?? ""} onChange={(e) => setEditingCow(editingCow ? { ...editingCow, breed: e.target.value } : null)} placeholder="Breed" className="rounded-xl border px-3 py-2" />
                  </div>
                )}
                <div className="mt-5 flex justify-end gap-2">
                  <button type="button" onClick={() => { setEditingFarmer(null); setEditingCow(null); }} className="rounded-xl border px-4 py-2 text-sm">Cancel</button>
                  <button type="button" onClick={() => editingFarmer ? requestFarmerUpdate() : editingCow ? requestManageConfirmation("updateAnimal", editingCow, "Confirm changes", "Save your changes to this cow record?") : undefined} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white">Save changes</button>
                </div>
              </div>
            </div>
          ) : null}

          <div className={`${!showSection("records") ? "hidden " : ""}grid gap-4 md:grid-cols-3 xl:grid-cols-6 print:hidden`}>
            {[
              ["Farmers", currentState.summary.farmers],
              ["Cows", currentState.summary.animals],
              ["Collections today", currentState.summary.collectionsToday],
              ["Litres today", currentState.summary.litresToday],
              ["Open batches", currentState.summary.openBatches],
              ["Pending payments", currentState.summary.pendingPayments],
            ].map(([label, value]) => <div key={label} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"><p className="text-xs text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold text-slate-900">{value}</p></div>)}
          </div>

          {currentUser.role === "MCC_OFFICER" && showSection("records") ? (
            <div className="grid gap-4 md:grid-cols-3 print:hidden">
              {[
                ["Milk Collector Collection", currentState.collections.filter((item) => item.collectionSource === "FARMER_COLLECTION_CHAIN" && item.mccAcceptanceStatus !== "REJECTED").reduce((sum, item) => sum + item.litres, 0)],
                ["Direct MCC Collection", currentState.collections.filter((item) => item.collectionSource === "DIRECT_MCC_COLLECTION" && item.mccAcceptanceStatus !== "REJECTED").reduce((sum, item) => sum + item.litres, 0)],
                ["Total Milk Received", currentState.collections.filter((item) => item.mccAcceptanceStatus !== "REJECTED").reduce((sum, item) => sum + item.litres, 0)],
              ].map(([label, litres]) => <div key={label} className="rounded-2xl border border-sky-200 bg-sky-50 p-4"><p className="text-xs text-sky-700">{label}</p><p className="mt-2 text-2xl font-semibold text-sky-950">{Number(litres).toFixed(2)} L</p></div>)}
            </div>
          ) : null}

          {currentUser.role === "MILK_COLLECTOR" && showSection("records") ? (
            <div className="grid gap-6 lg:grid-cols-2 print:hidden">
              <InteractivePieChart
                title="Farmer ownership"
                slices={[
                  { label: "Farmers with cows", value: cowsAssigned, color: "#10b981" },
                  { label: "Farmers without cows", value: Math.max(currentState.farmers.length - cowsAssigned, 0), color: "#94a3b8" },
                ]}
                selected={selectedChartSlice.ownership}
                onSelect={(index) => setSelectedChartSlice((current) => ({ ...current, ownership: index }))}
              />
              <InteractivePieChart
                title="Collection status"
                slices={collectionSlices}
                selected={selectedChartSlice.collections}
                onSelect={(index) => setSelectedChartSlice((current) => ({ ...current, collections: index }))}
              />
            </div>
          ) : null}

          <div className="grid gap-6 xl:grid-cols-2 print:hidden">
            <form id="farmer-management" className={`${!showSection("farmer-management") || !canRegisterFarmer ? "hidden " : ""}rounded-2xl border border-slate-200 bg-white p-5 shadow-sm`} onSubmit={(event) => { event.preventDefault(); if (farmerForm.email && !isValidEmail(farmerForm.email)) { setMessage("Enter a valid farmer email address before saving."); return; } if (!farmerForm.phone.trim()) { setMessage("Phone Number is required."); return; } const normalizedPhone = normalizePhoneNumber(farmerForm.phone); if (!isValidRwandaPhoneNumber(normalizedPhone)) { setMessage("Enter a valid Rwanda phone number in the format 078XXXXXXX."); return; } if (!farmerForm.nationalId.trim() || !isValidNationalId(farmerForm.nationalId)) { setMessage("Enter a valid 16-digit national ID number."); return; } if (!farmerForm.province || !farmerForm.district || !farmerForm.sector || !farmerForm.cell || !farmerForm.village) { setMessage("Select a complete Rwanda address before registering the farmer."); return; } requestSubmitConfirmation("createFarmer", { farmerId: `F-${Date.now()}`, ...farmerForm, phone: normalizedPhone, nationalId: farmerForm.nationalId.trim(), status: "ACTIVE" }, currentUser.role === "VETERINARY_OFFICER" ? "Farmer registered and assigned to the collector." : "Farmer registered to your account.", "farmer"); }}>
              <h2 className="text-lg font-semibold">Register farmer</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <label className="flex flex-col gap-1.5"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Farmer Name / Full Name <span className="text-rose-500">*</span></span><input required placeholder="Full name" value={farmerForm.fullName} onChange={(e) => setFarmerForm({ ...farmerForm, fullName: e.target.value })} className="rounded-xl border px-3 py-2" /></label>
                <label className="flex flex-col gap-1.5 md:col-span-2"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Email (Optional)</span><input type="email" inputMode="email" autoComplete="email" placeholder="farmer@example.com" value={farmerForm.email} onChange={(e) => setFarmerForm({ ...farmerForm, email: e.target.value })} onBlur={() => { if (farmerForm.email && !isValidEmail(farmerForm.email)) setMessage("Enter a valid farmer email address."); }} aria-invalid={Boolean(farmerForm.email && !isValidEmail(farmerForm.email))} className={`w-full rounded-xl border px-3 py-2.5 outline-none transition focus:ring-2 focus:ring-emerald-200 ${farmerForm.email && !isValidEmail(farmerForm.email) ? "border-rose-400 bg-rose-50" : "border-slate-200 bg-slate-50 focus:border-emerald-500"}`} />{farmerForm.email && !isValidEmail(farmerForm.email) ? <span className="text-xs text-rose-600">Use a valid format such as farmer@example.com.</span> : null}</label>
                <label className="flex flex-col gap-1.5"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Phone Number <span className="text-rose-500">*</span></span><input required placeholder="078XXXXXXX" value={farmerForm.phone} onChange={(e) => setFarmerForm({ ...farmerForm, phone: e.target.value })} className="rounded-xl border px-3 py-2" /></label>
                <label className="flex flex-col gap-1.5"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">ID Number <span className="text-rose-500">*</span></span><input required placeholder="119XXXXXXXXXXXX" value={farmerForm.nationalId} onChange={(e) => setFarmerForm({ ...farmerForm, nationalId: e.target.value })} className="rounded-xl border px-3 py-2" /></label>
                <label className="flex flex-col gap-1.5"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Province <span className="text-rose-500">*</span></span><select value={farmerForm.province} onChange={(e) => updateAddressSelection("province", e.target.value)} className="rounded-xl border px-3 py-2"><option value="">Select Province</option>{provinceOptions.map((province) => <option key={province} value={province}>{province}</option>)}</select></label>
                <label className="flex flex-col gap-1.5"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">District <span className="text-rose-500">*</span></span><select value={farmerForm.district} onChange={(e) => updateAddressSelection("district", e.target.value)} disabled={!farmerForm.province} className="rounded-xl border px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-100"><option value="">Select District</option>{districtOptions.map((district: string) => <option key={district} value={district}>{district}</option>)}</select></label>
                <label className="flex flex-col gap-1.5"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Sector <span className="text-rose-500">*</span></span><select value={farmerForm.sector} onChange={(e) => updateAddressSelection("sector", e.target.value)} disabled={!farmerForm.district} className="rounded-xl border px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-100"><option value="">Select Sector</option>{sectorOptions.map((sector: string) => <option key={sector} value={sector}>{sector}</option>)}</select></label>
                <label className="flex flex-col gap-1.5"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cell <span className="text-rose-500">*</span></span><select value={farmerForm.cell} onChange={(e) => updateAddressSelection("cell", e.target.value)} disabled={!farmerForm.sector} className="rounded-xl border px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-100"><option value="">Select Cell</option>{cellOptions.map((cell: string) => <option key={cell} value={cell}>{cell}</option>)}</select></label>
                <label className="flex flex-col gap-1.5"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Village <span className="text-rose-500">*</span></span><select value={farmerForm.village} onChange={(e) => updateAddressSelection("village", e.target.value)} disabled={!farmerForm.cell} className="rounded-xl border px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-100"><option value="">Select Village</option>{villageOptions.map((village: string) => <option key={village} value={village}>{village}</option>)}</select></label>
                <label className="flex flex-col gap-1.5 md:col-span-2"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Generated Address</span><div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">{generatedFarmerAddress || "Select province, district, sector, cell, and village"}</div></label>
                <select required aria-label="MCC Name" value={farmerForm.mccId} onChange={(e) => setFarmerForm({ ...farmerForm, mccId: e.target.value })} className="rounded-xl border px-3 py-2"><option value="">Select MCC Name</option>{currentState.mccs.map((mcc) => <option key={mcc.mccId} value={mcc.mccId}>{mcc.name}</option>)}</select>
                {currentUser.role === "VETERINARY_OFFICER" ? <select required value={farmerForm.collectorId} onChange={(e) => setFarmerForm({ ...farmerForm, collectorId: e.target.value })} className="rounded-xl border px-3 py-2"><option value="">Assign collector</option>{collectors.map((collector) => <option key={collector.uid} value={collector.uid}>{collector.fullName}</option>)}</select> : null}
              </div>
              <button disabled={!canWrite} className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Register Farmer</button>
            </form>

            <section id="cow-management" className={`${!showSection("cow-management") || (managementOnly ? currentUser.role !== "VETERINARY_OFFICER" : !["MCC_OFFICER", "MILK_COLLECTOR"].includes(currentUser.role)) ? "hidden " : ""}rounded-2xl border border-slate-200 bg-white p-5 shadow-sm`}>
              <h2 className="text-lg font-semibold">Register cows with farmer OTP authorization</h2>
              <p className="mt-1 text-sm text-slate-500">Add any number of cows, submit one batch, then enter the one OTP shown on the farmer dashboard. Successful OTP verification registers the complete batch immediately.</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="relative">
                  <input
                    required
                    placeholder="Search farmer by name, NID, or telephone"
                    value={cowFarmerSearch}
                    onChange={(e) => {
                      setCowFarmerSearch(e.target.value);
                      setCowBatchFarmerId("");
                    }}
                    className="w-full rounded-xl border px-3 py-2"
                  />
                  {cowFarmerSearch.trim() && !cowBatchFarmerId ? (
                    <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
                      {matchingCowFarmers.length ? matchingCowFarmers.map((farmer) => (
                        <button
                          key={farmer.farmerId}
                          type="button"
                          onClick={() => {
                            setCowBatchFarmerId(farmer.farmerId);
                            setCowFarmerSearch(farmer.fullName);
                          }}
                          className="block w-full rounded-lg px-3 py-2 text-left text-sm hover:bg-slate-50"
                        >
                          <span className="font-medium text-slate-900">{farmer.fullName}</span>
                        </button>
                      )) : <p className="px-3 py-2 text-sm text-slate-500">No farmer found.</p>}
                    </div>
                  ) : null}
                </div>
                <div className="grid gap-2 rounded-xl border border-slate-100 bg-white p-2 md:grid-cols-[1fr,1fr,auto]">
                  <input required placeholder={`Cow ${cowBatchCows.length + 1} tag number`} value={cowDraft.tagNumber} onChange={(e) => setCowDraft({ ...cowDraft, tagNumber: e.target.value })} className="rounded-xl border px-3 py-2" />
                  <select required value={cowDraft.breed} onChange={(e) => setCowDraft({ ...cowDraft, breed: e.target.value })} className="rounded-xl border px-3 py-2"><option value="">Breed</option>{currentState.breedTypes.map((breed) => <option key={breed.id} value={breed.name}>{breed.name}</option>)}</select>
                  <select required value={cowDraft.sex} onChange={(e) => setCowDraft({ ...cowDraft, sex: e.target.value as Animal["sex"] })} className="rounded-xl border px-3 py-2"><option value="FEMALE">Female</option><option value="MALE">Male</option></select>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" disabled={!canWrite || Boolean(pendingCowBatch)} onClick={addCowToBatch} className="rounded-xl border border-emerald-300 px-4 py-2 text-sm font-medium text-emerald-700 disabled:opacity-50">Add another cow</button>
                <button type="button" disabled={!canWrite || (!cowBatchCows.length && !cowDraft.tagNumber.trim()) || Boolean(pendingCowBatch)} onClick={() => void submitCowBatch()} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Submit for farmer authorization</button>
              </div>
              {cowBatchCows.length ? (
                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-emerald-950">Cows to be added</p>
                    <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-emerald-800">{cowBatchCows.length} cows</span>
                  </div>
                  <p className="mt-1 text-sm text-emerald-800">All listed cows will be saved together after the farmer provides one OTP.</p>
                  <div className="mt-3 overflow-x-auto rounded-lg bg-white">
                    <table className="min-w-full text-left text-sm">
                      <thead className="border-b border-emerald-100 text-xs uppercase tracking-wide text-slate-500">
                        <tr><th className="px-3 py-2">#</th><th className="px-3 py-2">Tag number</th><th className="px-3 py-2">Breed</th><th className="px-3 py-2">Sex</th><th className="px-3 py-2">Action</th></tr>
                      </thead>
                      <tbody>
                        {cowBatchCows.map((cow, index) => (
                          <tr key={cow.animalId} className="border-b border-slate-100 last:border-0">
                            <td className="px-3 py-2">{index + 1}</td>
                            <td className="px-3 py-2 font-medium text-slate-900">{cow.tagNumber}</td>
                            <td className="px-3 py-2">{cow.breed}</td>
                            <td className="px-3 py-2">{cow.sex === "FEMALE" ? "Female" : "Male"}</td>
                            <td className="px-3 py-2">
                              <button type="button" onClick={() => startEditCowBatchCow(cow)} className="text-xs font-semibold text-slate-700 hover:underline">Edit</button>
                              <button type="button" onClick={() => removeCowBatchCow(cow.animalId)} className="ml-3 text-xs font-semibold text-rose-600">Remove</button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
              {pendingCowBatch ? (
                <div className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-4">
                  <p className="text-base font-semibold text-amber-950">Verify Cow Registration</p>
                  <dl className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-white p-3 text-sm">
                    <div><dt className="text-xs uppercase tracking-wide text-slate-500">Farmer</dt><dd className="font-medium text-slate-900">{pendingCowBatch.farmerName}</dd></div>
                    <div><dt className="text-xs uppercase tracking-wide text-slate-500">Phone</dt><dd className="font-medium text-slate-900">{maskPhoneNumber(pendingCowBatch.farmerPhone)}</dd></div>
                    <div className="col-span-2"><dt className="text-xs uppercase tracking-wide text-slate-500">Cow tag(s) &amp; breed</dt><dd className="font-medium text-slate-900">{pendingCowBatch.cows.map((cow) => `${cow.tagNumber} (${cow.breed})`).join(", ")}</dd></div>
                  </dl>
                  <p className="mt-3 text-sm text-amber-800">An OTP has been sent to the farmer&apos;s registered phone number.</p>
                  {!cowBatchOtpExpired ? (
                    <p className="mt-1 text-xs font-semibold text-amber-900">OTP expires in: {formatCountdown(cowBatchOtpSecondsLeft)}</p>
                  ) : (
                    <p className="mt-1 text-xs font-semibold text-rose-700">OTP has expired. Please request a new OTP to continue.</p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <input
                      inputMode="numeric"
                      maxLength={6}
                      placeholder="Enter OTP"
                      disabled={cowBatchOtpExpired || cowBatchBusy !== "idle"}
                      value={cowBatchOtp}
                      onChange={(e) => setCowBatchOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      className="rounded-xl border px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-100"
                    />
                    <button
                      type="button"
                      disabled={cowBatchOtp.length !== 6 || cowBatchOtpExpired || cowBatchBusy !== "idle"}
                      onClick={() => void verifyCowBatchOtp()}
                      className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    >
                      {cowBatchBusy === "verifying" ? "Verifying OTP..." : "Verify OTP"}
                    </button>
                    <button
                      type="button"
                      disabled={cowBatchBusy !== "idle"}
                      onClick={requestCancelCowRegistration}
                      className="rounded-xl border-2 border-rose-600 px-4 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-50 disabled:opacity-50"
                    >
                      {cowBatchBusy === "cancelling" ? "Cancelling OTP..." : "Cancel OTP"}
                    </button>
                    <button
                      type="button"
                      disabled={cowBatchBusy !== "idle"}
                      onClick={() => void resendCowBatchOtp()}
                      className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                      {cowBatchBusy === "resending" ? "Generating OTP..." : "Resend OTP"}
                    </button>
                  </div>
                </div>
              ) : null}
            </section>

            <form id="milk-collection" className={`${!showSection("milk-collection") || managementOnly || !canCollect ? "hidden " : ""}rounded-2xl border border-slate-200 bg-white p-5 shadow-sm`} onSubmit={(event) => { event.preventDefault(); if (selectedFarmerCows.length && !collectionForm.animalId) { setMessage("Select an eligible cow before recording milk collection."); return; } requestSubmitConfirmation("createCollection", { collectionId: `COL-${Date.now()}`, farmerId: collectionForm.farmerId, animalId: collectionForm.animalId || undefined, mccId: selectedCollectionFarmer?.mccId ?? farmerForm.mccId, collectionDate: new Date().toISOString(), collectionSource: currentUser.role === "MILK_COLLECTOR" ? "FARMER_COLLECTION_CHAIN" : collectionForm.collectionSource, litres: Number(collectionForm.litres), fatPercentage: Number(collectionForm.fatPercentage), temperatureC: Number(collectionForm.temperatureC), acceptanceStatus: "PENDING", collectedBy: currentUser.uid }, "Milk collection recorded.", "milk collection"); }}>
              <h2 className="text-lg font-semibold">Record milk collection</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {currentUser.role === "MCC_OFFICER" ? <select required value={collectionForm.collectionSource} onChange={(e) => setCollectionForm({ ...collectionForm, collectionSource: e.target.value as MilkCollection["collectionSource"] })} className="rounded-xl border px-3 py-2 md:col-span-2"><option value="DIRECT_MCC_COLLECTION">Direct Milk Collection at MCC</option><option value="FARMER_COLLECTION_CHAIN">Milk Collector Collection</option></select> : <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800 md:col-span-2">Collection source: Farmer collection chain</p>}
                <select required value={collectionForm.farmerId} onChange={(e) => setCollectionForm({ ...collectionForm, farmerId: e.target.value, animalId: "" })} className="rounded-xl border px-3 py-2"><option value="">Select farmer</option>{currentState.farmers.map((farmer) => <option key={farmer.farmerId} value={farmer.farmerId}>{farmer.fullName}</option>)}</select>
                {selectedCollectionFarmer && treatmentWarnings.length ? (
                  <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 md:col-span-2" role="alert">
                    <p className="font-semibold">Milk collection warning</p>
                    <p className="mt-1">This farmer has a cow under treatment or milk withdrawal.</p>
                    <ul className="mt-2 space-y-1">
                      {treatmentWarnings.map((record) => {
                        const cow = selectedFarmerCows.find((item) => item.animalId === record.animalId);
                        return <li key={record.recordId}><strong>{cow?.tagNumber ?? record.animalId}</strong>: {record.diagnosis}{record.treatment ? ` - ${record.treatment}` : ""}. Recovery/clearance date: <strong>{record.withdrawalUntil}</strong>.</li>;
                      })}
                    </ul>
                    <p className="mt-2 text-xs font-medium">Do not accept milk from the affected cow until the recovery date.</p>
                  </div>
                ) : null}
                <select required={selectedFarmerCows.length > 0} disabled={!collectionForm.farmerId || !selectedFarmerCows.length} value={collectionForm.animalId} onChange={(e) => setCollectionForm({ ...collectionForm, animalId: e.target.value })} className="rounded-xl border px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-100">
                  <option value="">{selectedFarmerCows.length ? "Select eligible cow" : "No registered cows"}</option>
                  {selectedFarmerCows.map((cow) => <option key={cow.animalId} value={cow.animalId} disabled={treatedCowIds.has(cow.animalId)}>{cow.tagNumber}{treatedCowIds.has(cow.animalId) ? " - Under treatment" : " - Cleared - milk acceptable"}</option>)}
                </select>
                <input required type="number" min="0.01" step="0.01" placeholder="Litres" value={collectionForm.litres} onChange={(e) => setCollectionForm({ ...collectionForm, litres: e.target.value })} className="rounded-xl border px-3 py-2" />
                <input required type="number" min="0" step="0.01" placeholder="Fat %" value={collectionForm.fatPercentage} onChange={(e) => setCollectionForm({ ...collectionForm, fatPercentage: e.target.value })} className="rounded-xl border px-3 py-2" />
                <input required type="number" step="0.1" placeholder="Temperature C" value={collectionForm.temperatureC} onChange={(e) => setCollectionForm({ ...collectionForm, temperatureC: e.target.value })} className="rounded-xl border px-3 py-2" />
              </div>
              <button disabled={!canWrite} className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Record collection</button>
            </form>

            <form className={`${!(showSection("cow-management") || showSection("veterinary-treatment")) || managementOnly || !canPracticeVeterinary ? "hidden " : ""}rounded-2xl border border-slate-200 bg-white p-5 shadow-sm`} onSubmit={(event) => { event.preventDefault(); requestSubmitConfirmation("createVeterinaryRecord", { recordId: `VET-${Date.now()}`, ...vetForm, veterinarianId: currentUser.uid }, "Veterinary record saved.", "veterinary record"); }}>
              <h2 className="text-lg font-semibold">Veterinary visit</h2>
              <p className="mt-1 text-sm text-slate-500">Record the cow as under treatment and set the date when milk can safely be collected again.</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="md:col-span-2 rounded-xl border border-sky-200 bg-sky-50 p-3">
                  <label className="block text-sm font-medium text-sky-950">Find cow owner by tag number</label>
                  <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                    <input value={vetTagSearch} onChange={(e) => setVetTagSearch(e.target.value)} placeholder="Enter cow tag number" className="min-w-0 flex-1 rounded-xl border border-sky-200 bg-white px-3 py-2" />
                    <button type="button" onClick={() => void searchCowOwnerByTag()} className="rounded-xl bg-sky-700 px-4 py-2 text-sm font-medium text-white">Search cow</button>
                  </div>
                  {vetTagSearchMessage ? <p className={`mt-2 text-xs ${vetTagSearchResult ? "text-emerald-700" : "text-rose-600"}`}>{vetTagSearchMessage}</p> : null}
                </div>
                <select required value={vetFarmerId} onChange={(e) => { setVetFarmerId(e.target.value); setVetTagSearchResult(null); setVetForm({ ...vetForm, animalId: "" }); }} className="rounded-xl border px-3 py-2"><option value="">Select farmer</option>{currentState.farmers.map((farmer) => <option key={farmer.farmerId} value={farmer.farmerId}>{farmer.fullName}</option>)}</select>
                <select required disabled={!vetFarmerId} value={vetForm.animalId} onChange={(e) => setVetForm({ ...vetForm, animalId: e.target.value })} className="rounded-xl border px-3 py-2 disabled:cursor-not-allowed disabled:bg-slate-100"><option value="">{vetFarmerId ? "Select cow identification" : "Select a farmer first"}</option>{veterinaryCows.map((animal) => <option key={animal.animalId} value={animal.animalId}>{animal.tagNumber}{animal.breed ? ` - ${animal.breed}` : ""}</option>)}</select>
                <input required type="date" value={vetForm.visitDate} onChange={(e) => setVetForm({ ...vetForm, visitDate: e.target.value })} className="rounded-xl border px-3 py-2" />
                <input required type="date" value={vetForm.withdrawalUntil} onChange={(e) => setVetForm({ ...vetForm, withdrawalUntil: e.target.value })} className="rounded-xl border px-3 py-2" aria-label="Recovery or milk clearance date" />
                <input required placeholder="Diagnosis" value={vetForm.diagnosis} onChange={(e) => setVetForm({ ...vetForm, diagnosis: e.target.value })} className="rounded-xl border px-3 py-2" />
                <input required placeholder="Medicine or treatment product" value={vetForm.medicine} onChange={(e) => setVetForm({ ...vetForm, medicine: e.target.value })} className="rounded-xl border px-3 py-2" />
                <textarea required placeholder="Treatment given and instructions" value={vetForm.treatment} onChange={(e) => setVetForm({ ...vetForm, treatment: e.target.value })} className="rounded-xl border px-3 py-2 md:col-span-2" />
              </div>
              <button disabled={!canWrite} className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Save veterinary record</button>
            </form>

            <form className={`${!(["MCC_OFFICER", "MCC_MANAGER", "ADMIN", "SUPER_ADMIN"].includes(currentUser.role) ? (showSection("batches") || showSection("records")) : showSection("records")) || managementOnly || !canTestQuality ? "hidden " : ""}rounded-2xl border border-slate-200 bg-white p-5 shadow-sm`} onSubmit={(event) => { event.preventDefault(); const batchTest = ["MCC_OFFICER", "MCC_MANAGER", "ADMIN", "SUPER_ADMIN"].includes(currentUser.role) && mccQualityTarget === "BATCH"; if (batchTest) { void submitSelectedBatchTests(); return; } requestSubmitConfirmation("createQualityTest", { testId: `QT-${Date.now()}`, ...qualityForm, acidity: Number(qualityForm.acidity) || undefined, density: Number(qualityForm.density) || undefined, lactometerReading: Number(qualityForm.lactometerReading), testedBy: currentUser.uid, testedAt: new Date().toISOString() }, "Quality result saved.", "quality result"); }}>
              <h2 className="text-lg font-semibold">{["MCC_OFFICER", "MCC_MANAGER", "ADMIN", "SUPER_ADMIN"].includes(currentUser.role) && mccQualityTarget === "BATCH" ? "Second Level Test - Batch Acceptance" : "Level 1 milk quality testing"}</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {["MCC_OFFICER", "MCC_MANAGER", "ADMIN", "SUPER_ADMIN"].includes(currentUser.role) ? <select value={mccQualityTarget} onChange={(e) => setMccQualityTarget(e.target.value as "DIRECT_COLLECTION" | "BATCH")} className="rounded-xl border px-3 py-2 md:col-span-2"><option value="BATCH">Milk Collector batch - Second Level Test</option>{currentUser.role === "MCC_OFFICER" ? <option value="DIRECT_COLLECTION">Direct MCC collection - Level 1 test</option> : null}</select> : null}
                {["MCC_OFFICER", "MCC_MANAGER", "ADMIN", "SUPER_ADMIN"].includes(currentUser.role) && mccQualityTarget === "BATCH" ? <div className="md:col-span-2 overflow-x-auto rounded-xl border border-slate-200"><table className="min-w-full text-left text-sm"><thead className="bg-slate-50"><tr><th className="px-3 py-2">No.</th><th className="px-3 py-2">Collector</th><th className="px-3 py-2">Batch and farmers</th><th className="px-3 py-2">Timestamp</th><th className="px-3 py-2">Status</th></tr></thead><tbody>{currentState.batches.filter((batch) => batch.collectorId).map((batch, index) => { const expanded = expandedQualityBatchIds.includes(batch.batchId); const statusExpanded = expandedQualityStatusBatchIds.includes(batch.batchId); const linked = currentState.collections.filter((collection) => batch.collectionIds?.includes(collection.collectionId)); const farmers = [...new Set(linked.map((collection) => currentState.farmers.find((farmer) => farmer.farmerId === collection.farmerId)?.fullName ?? collection.farmerId))]; const batchTests = linked.flatMap((collection) => currentState.qualityTests.filter((test) => test.collectionId === collection.collectionId)).sort((a, b) => new Date(b.testedAt).getTime() - new Date(a.testedAt).getTime()); const latestTest = batchTests[0]; const statusLabel = batch.status === "ACCEPTED" ? "Approved" : batch.status === "REJECTED" ? "Rejected" : "Pending"; return <Fragment key={batch.batchId}><tr className="border-t align-top"><td className="px-3 py-2">{index + 1}</td><td className="px-3 py-2">{batch.collectorName ?? batch.collectorId}</td><td className="px-3 py-2"><button type="button" onClick={() => setExpandedQualityBatchIds((current) => expanded ? current.filter((id) => id !== batch.batchId) : [...current, batch.batchId])} className="mr-2 rounded bg-slate-100 px-2 py-1 text-xs">{expanded ? "−" : "+"}</button><label className="font-medium"><input type="checkbox" disabled={batch.status !== "OPEN"} className="mr-2" checked={selectedQualityBatchIds.includes(batch.batchId)} onChange={(event) => setSelectedQualityBatchIds((current) => event.target.checked ? [...current, batch.batchId] : current.filter((id) => id !== batch.batchId))} />{batch.parentBatchCode ?? batch.batchId}</label>{expanded ? <div className="ml-7 mt-2 text-xs text-slate-600">{farmers.length ? farmers.join(", ") : "No farmers linked"}</div> : null}</td><td className="whitespace-nowrap px-3 py-2 text-xs text-slate-600">{formatTimestamp(batch.createdAt)}</td><td className="px-3 py-2"><button type="button" onClick={() => setExpandedQualityStatusBatchIds((current) => statusExpanded ? current.filter((id) => id !== batch.batchId) : [...current, batch.batchId])} className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusLabel === "Approved" ? "bg-emerald-50 text-emerald-700" : statusLabel === "Rejected" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>{statusLabel} {statusLabel !== "Pending" ? (statusExpanded ? "−" : "+") : ""}</button></td></tr>{statusExpanded ? <tr className="border-t bg-slate-50"><td colSpan={5} className="px-4 py-3"><div className="grid gap-2 text-xs text-slate-700 md:grid-cols-3"><p><strong>Result:</strong> {latestTest?.result ?? statusLabel.toUpperCase()}</p><p><strong>Acidity:</strong> {latestTest?.acidity ?? "Not recorded"}</p><p><strong>Density:</strong> {latestTest?.density ?? "Not recorded"}</p><p><strong>Organoleptic:</strong> {latestTest?.organolepticResult ?? "Not recorded"}</p><p><strong>Lactometer:</strong> {latestTest?.lactometerReading ?? "Not recorded"}</p><p><strong>Alcohol:</strong> {latestTest?.alcoholTestResult ?? "Not recorded"}</p><p><strong>Adulteration:</strong> {latestTest ? (latestTest.adulterationDetected ? "Detected" : "Not detected") : "Not recorded"}</p><p><strong>Tested at:</strong> {latestTest ? formatTimestamp(latestTest.testedAt) : "Not recorded"}</p><p><strong>Comment:</strong> {batch.approvalComment ?? latestTest?.comment ?? "No comment"}</p></div></td></tr> : null}</Fragment>; })}</tbody></table></div> : null}
                {(!["MCC_OFFICER", "MCC_MANAGER", "ADMIN", "SUPER_ADMIN"].includes(currentUser.role) || mccQualityTarget === "DIRECT_COLLECTION") ? <select required value={qualityForm.collectionId} onChange={(e) => setQualityForm({ ...qualityForm, collectionId: e.target.value })} className="rounded-xl border px-3 py-2 md:col-span-2"><option value="">{currentUser.role === "MCC_OFFICER" ? "Select direct MCC collection" : "Select pending collection"}</option>{currentState.collections.filter((collection) => collection.acceptanceStatus === "PENDING" && (currentUser.role !== "MCC_OFFICER" || collection.collectionSource === "DIRECT_MCC_COLLECTION")).map((collection) => <option key={collection.collectionId} value={collection.collectionId}>{collection.collectionId} - {collection.litres} L</option>)}</select> : null}
                {!(["MCC_OFFICER", "MCC_MANAGER", "ADMIN", "SUPER_ADMIN"].includes(currentUser.role) && mccQualityTarget === "BATCH") ? <input type="number" step="0.01" placeholder="Acidity" value={qualityForm.acidity} onChange={(e) => setQualityForm({ ...qualityForm, acidity: e.target.value })} className="rounded-xl border px-3 py-2" /> : null}
                {!(["MCC_OFFICER", "MCC_MANAGER", "ADMIN", "SUPER_ADMIN"].includes(currentUser.role) && mccQualityTarget === "BATCH") ? <input type="number" step="0.001" placeholder="Density" value={qualityForm.density} onChange={(e) => setQualityForm({ ...qualityForm, density: e.target.value })} className="rounded-xl border px-3 py-2" /> : null}
                {!(["MCC_OFFICER", "MCC_MANAGER", "ADMIN", "SUPER_ADMIN"].includes(currentUser.role) && mccQualityTarget === "BATCH") ? <select required aria-label="Organoleptic result" value={qualityForm.organolepticResult} onChange={(e) => setQualityForm({ ...qualityForm, organolepticResult: e.target.value as "PASS" | "FAIL", result: e.target.value === "FAIL" ? "FAIL" : qualityForm.result })} className="rounded-xl border px-3 py-2"><option value="PASS">Organoleptic: Pass</option><option value="FAIL">Organoleptic: Fail</option></select> : null}
                {!(["MCC_OFFICER", "MCC_MANAGER", "ADMIN", "SUPER_ADMIN"].includes(currentUser.role) && mccQualityTarget === "BATCH") ? <input required type="number" step="0.001" placeholder="Lactometer reading" value={qualityForm.lactometerReading} onChange={(e) => setQualityForm({ ...qualityForm, lactometerReading: e.target.value })} className="rounded-xl border px-3 py-2" /> : null}
                {!(["MCC_OFFICER", "MCC_MANAGER", "ADMIN", "SUPER_ADMIN"].includes(currentUser.role) && mccQualityTarget === "BATCH") ? <select required aria-label="Alcohol test result" value={qualityForm.alcoholTestResult} onChange={(e) => setQualityForm({ ...qualityForm, alcoholTestResult: e.target.value as "PASS" | "FAIL", result: e.target.value === "FAIL" ? "FAIL" : qualityForm.result })} className="rounded-xl border px-3 py-2"><option value="PASS">Alcohol test: Pass</option><option value="FAIL">Alcohol test: Fail</option></select> : null}
                {!(["MCC_OFFICER", "MCC_MANAGER", "ADMIN", "SUPER_ADMIN"].includes(currentUser.role) && mccQualityTarget === "BATCH") ? <select aria-label="Decision" value={qualityForm.result} onChange={(e) => setQualityForm({ ...qualityForm, result: e.target.value as QualityTest["result"] })} className="rounded-xl border px-3 py-2"><option value="PASS">Accepted</option><option value="FAIL">Rejected</option><option value="PENDING">Pending</option></select> : null}
                {!(["MCC_OFFICER", "MCC_MANAGER", "ADMIN", "SUPER_ADMIN"].includes(currentUser.role) && mccQualityTarget === "BATCH") ? <label className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"><input type="checkbox" checked={qualityForm.adulterationDetected} onChange={(e) => setQualityForm({ ...qualityForm, adulterationDetected: e.target.checked })} /> Adulteration detected</label> : null}
                {!(["MCC_OFFICER", "MCC_MANAGER", "ADMIN", "SUPER_ADMIN"].includes(currentUser.role) && mccQualityTarget === "BATCH") ? <textarea placeholder="Comment to farmer" value={qualityForm.comment} onChange={(e) => setQualityForm({ ...qualityForm, comment: e.target.value })} className="min-h-20 rounded-xl border px-3 py-2 md:col-span-2" /> : null}
                {["MCC_OFFICER", "MCC_MANAGER", "ADMIN", "SUPER_ADMIN"].includes(currentUser.role) && mccQualityTarget === "BATCH" ? <button type="button" disabled={!selectedQualityBatchIds.length} onClick={() => setShowBatchTestWindow(true)} className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50 md:col-span-2">Open test window for {selectedQualityBatchIds.length} selected batch(es)</button> : null}
              </div>
              <button disabled={!canWrite} className="mt-4 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{["MCC_OFFICER", "MCC_MANAGER", "ADMIN", "SUPER_ADMIN"].includes(currentUser.role) && mccQualityTarget === "BATCH" ? "Apply Second Level Test to selected batches" : "Save quality result"}</button>
            </form>

            <form className={`${!showSection("batches") || managementOnly || !canCreateBatch ? "hidden " : ""}rounded-2xl border border-slate-200 bg-white p-5 shadow-sm`} onSubmit={(event) => { event.preventDefault(); if (currentUser.role === "MILK_COLLECTOR" && !selectedAssignedBatch) { setMessage("Select a batch assigned by the MCC Manager."); return; } const parentBatchCode = currentUser.role === "MILK_COLLECTOR" ? selectedAssignedBatch : undefined; const batchId = parentBatchCode || `BATCH-${Date.now()}`; requestSubmitConfirmation("createBatch", { batchId, parentBatchCode, mccId: farmerForm.mccId, batchDate: new Date().toISOString().slice(0, 10), totalLitres: Number(batchForm.totalLitres), destination: batchForm.destination, status: "OPEN", collectionIds: batchForm.collectionIds, createdBy: currentUser.uid, createdAt: new Date().toISOString() }, "Milk added to batch.", "milk batch"); }}>
              <h2 className="text-lg font-semibold">{currentUser.role === "MILK_COLLECTOR" ? "Add milk to assigned batch" : "Create milk batch"}</h2>
              {currentUser.role === "MILK_COLLECTOR" ? <p className="mt-1 text-sm text-slate-500">Choose an MCC Manager-assigned batch, then add accepted milk from multiple farmers.</p> : null}
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {currentUser.role === "MILK_COLLECTOR" ? <select required value={selectedAssignedBatch} onChange={(event) => setSelectedAssignedBatch(event.target.value)} className="rounded-xl border px-3 py-2 md:col-span-2"><option value="">Select assigned batch</option>{assignedBatches.map((assignment) => <option key={assignment.assignmentId} value={assignment.batchCode}>{assignment.batchCode}</option>)}</select> : null}
                <input required type="number" min="0.01" step="0.01" placeholder="Total litres" value={batchForm.totalLitres} onChange={(e) => setBatchForm({ ...batchForm, totalLitres: e.target.value })} className="rounded-xl border px-3 py-2" />
                <input placeholder="Destination / processor" value={batchForm.destination} onChange={(e) => setBatchForm({ ...batchForm, destination: e.target.value })} className="rounded-xl border px-3 py-2" />
              </div>
              {currentUser.role === "MILK_COLLECTOR" ? <div className="mt-4 max-h-48 overflow-y-auto rounded-xl border border-slate-200 p-3">{batchEligibleCollections.length ? batchEligibleCollections.map((collection) => { const farmer = currentState.farmers.find((item) => item.farmerId === collection.farmerId); const selected = batchForm.collectionIds.includes(collection.collectionId); return <label key={collection.collectionId} className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 text-sm last:border-0"><span className="flex items-center gap-2"><input type="checkbox" checked={selected} onChange={(event) => { const collectionIds = event.target.checked ? [...batchForm.collectionIds, collection.collectionId] : batchForm.collectionIds.filter((id) => id !== collection.collectionId); const totalLitres = currentState.collections.filter((item) => collectionIds.includes(item.collectionId)).reduce((sum, item) => sum + item.litres, 0); setBatchForm({ ...batchForm, collectionIds, totalLitres: totalLitres.toFixed(2) }); }} />{farmer?.fullName ?? collection.farmerId}</span><span className="text-slate-500">{collection.litres.toFixed(2)} L · Collector ACCEPTED · MCC PENDING</span></label>; }) : <p className="text-sm text-slate-500">No milk accepted by the collector is currently waiting for MCC decision.</p>}</div> : null}
              <button disabled={!canWrite} className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">{currentUser.role === "MILK_COLLECTOR" ? "Add to selected batch" : "Create batch"}</button>
            </form>

            <section className={`${!(currentUser.role === "MCC_OFFICER" ? (showSection("batches") || showSection("records")) : showSection("batches")) || managementOnly || !canViewBatches ? "hidden " : ""}rounded-2xl border border-slate-200 bg-white p-5 shadow-sm`}>
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Batch records</h2>
                  <p className="mt-1 text-sm text-slate-500">Batches created from collected milk. Deleting a batch does not delete the original collection records.</p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{currentState.batches.length} batches</span>
              </div>
              <div className="mt-4 space-y-2">
                {currentState.batches.map((batch) => { const expanded = expandedBatch === batch.batchId; const linkedCollections = currentState.collections.filter((collection) => batch.collectionIds?.includes(collection.collectionId)); const farmerIds = [...new Set(linkedCollections.map((collection) => collection.farmerId))]; const decision = batch.status === "OPEN" ? "PENDING" : batch.status; const canAddComment = decision === "REJECTED" && !linkedCollections.some((collection) => collection.mccComment?.trim()); const canDelete = currentUser.role !== "MCC_OFFICER" && !(currentUser.role === "MILK_COLLECTOR" && ["ACCEPTED", "REJECTED"].includes(decision)); return <div key={batch.batchId} className="rounded-xl border border-slate-200 p-3"><div className="flex flex-wrap items-center justify-between gap-3"><div><button type="button" onClick={() => setExpandedBatch(expanded ? null : batch.batchId)} className="mr-2 rounded bg-slate-100 px-2 py-1 text-xs" aria-expanded={expanded}>{expanded ? "−" : "+"}</button><span className="font-medium text-slate-900">{batch.batchId}</span><p className="ml-9 text-xs text-slate-500">{batch.batchDate} · {batch.totalLitres.toFixed(2)} L{batch.destination ? ` · ${batch.destination}` : ""}</p><p className="ml-9 text-xs text-slate-500">Created: {formatTimestamp(batch.createdAt)}</p></div><div className="flex items-center gap-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${decision === "ACCEPTED" ? "bg-emerald-50 text-emerald-700" : decision === "REJECTED" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>{decision}</span>{canDelete ? <button type="button" onClick={() => requestConfirmation({ title: "Delete batch?", message: `${batch.batchId} will be deleted, but its milk collection records will remain available.`, confirmLabel: "Delete batch", destructive: true }, () => void manageRecord("deleteBatch", { batchId: batch.batchId }))} className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white">Delete</button> : null}</div></div>{expanded ? <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm"><p className="font-medium text-slate-700">{farmerIds.length} farmers included</p><ul className="mt-2 space-y-1 text-slate-600">{farmerIds.map((farmerId) => { const farmer = currentState.farmers.find((entry) => entry.farmerId === farmerId); const litres = linkedCollections.filter((collection) => collection.farmerId === farmerId).reduce((sum, collection) => sum + collection.litres, 0); return <li key={farmerId} className="flex justify-between"><span>{farmer?.fullName ?? "Unknown farmer"}</span><strong>{litres.toFixed(2)} L</strong></li>; })}</ul>{canAddComment ? <div className="mt-3 flex flex-col gap-2 sm:flex-row"><textarea aria-label={`Comment for ${batch.batchId}`} placeholder="Add comment for farmers" value={batchComments[batch.batchId] ?? ""} onChange={(event) => setBatchComments({ ...batchComments, [batch.batchId]: event.target.value })} className="min-h-16 flex-1 rounded-lg border px-3 py-2" /><button type="button" disabled={!batchComments[batch.batchId]?.trim()} onClick={() => requestConfirmation({ title: "Add MCC comment?", message: "This will add a comment to the rejected batch without changing its decision.", confirmLabel: "Add comment" }, () => saveRejectedBatchComment(batch.batchId))} className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white disabled:opacity-50">Add comment</button></div> : null}</div> : null}</div>; })}
                {!currentState.batches.length ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No batches have been created yet.</p> : null}
              </div>
            </section>

            <form className={`${!showSection("records") || managementOnly || !canCreatePayment ? "hidden " : ""}rounded-2xl border border-slate-200 bg-white p-5 shadow-sm`} onSubmit={(event) => { event.preventDefault(); const litres = Number(paymentForm.litres); const rate = Number(paymentForm.ratePerLitre); requestSubmitConfirmation("createPayment", { paymentId: `PAY-${Date.now()}`, farmerId: paymentForm.farmerId, periodStart: paymentForm.periodStart, periodEnd: paymentForm.periodEnd, litres, ratePerLitre: rate, amount: litres * rate, status: "PENDING", processedBy: currentUser.uid, createdAt: new Date().toISOString() }, "Farmer payment created.", "farmer payment"); }}>
              <h2 className="text-lg font-semibold">Create farmer payment</h2>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <select required value={paymentForm.farmerId} onChange={(e) => setPaymentForm({ ...paymentForm, farmerId: e.target.value })} className="rounded-xl border px-3 py-2 md:col-span-2"><option value="">Select farmer</option>{currentState.farmers.map((farmer) => <option key={farmer.farmerId} value={farmer.farmerId}>{farmer.fullName}</option>)}</select>
                <input required type="date" value={paymentForm.periodStart} onChange={(e) => setPaymentForm({ ...paymentForm, periodStart: e.target.value })} className="rounded-xl border px-3 py-2" />
                <input required type="date" value={paymentForm.periodEnd} onChange={(e) => setPaymentForm({ ...paymentForm, periodEnd: e.target.value })} className="rounded-xl border px-3 py-2" />
                <input required type="number" min="0.01" step="0.01" placeholder="Litres" value={paymentForm.litres} onChange={(e) => setPaymentForm({ ...paymentForm, litres: e.target.value })} className="rounded-xl border px-3 py-2" />
                <input required type="number" min="0.01" step="0.01" placeholder="Rate per litre" value={paymentForm.ratePerLitre} onChange={(e) => setPaymentForm({ ...paymentForm, ratePerLitre: e.target.value })} className="rounded-xl border px-3 py-2" />
              </div>
              <button disabled={!canWrite} className="mt-4 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50">Create payment</button>
            </form>
          </div>

          {canPracticeVeterinary && !managementOnly && (showSection("cow-management") || showSection("veterinary-treatment")) ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Cow treatment records</h2>
              <p className="mt-1 text-sm text-slate-500">Active treatment records prevent milk collection until the listed clearance date.</p>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Cow</th><th className="px-3 py-3">Owner</th><th className="px-3 py-3">Diagnosis</th><th className="px-3 py-3">Treatment</th><th className="px-3 py-3">Clearance date</th><th className="px-3 py-3">Status</th></tr></thead>
                  <tbody>
                    {currentState.veterinaryRecords.map((record) => {
                      const cow = currentState.animals.find((animal) => animal.animalId === record.animalId);
                      const owner = currentState.farmers.find((farmer) => farmer.farmerId === cow?.farmerId);
                      const active = record.clearanceStatus !== "CLEARED" && Boolean(record.withdrawalUntil && record.withdrawalUntil > new Date().toISOString().slice(0, 10));
                      const editing = editingVeterinaryRecord === record.recordId;
                      return <tr key={record.recordId} className="border-t border-slate-100"><td className="px-3 py-3 font-medium">{cow?.tagNumber ?? record.animalId}</td><td className="px-3 py-3">{owner ? <><div className="font-medium text-slate-800">{owner.fullName}</div><div className="text-xs text-slate-500">{owner.farmerId}</div></> : "Unknown owner"}</td><td className="px-3 py-3">{record.diagnosis}</td><td className="px-3 py-3">{record.treatment}</td><td className="px-3 py-3">{editing ? <div className="flex min-w-56 flex-col gap-2"><label className="text-xs text-slate-500">Visit date<input type="date" value={veterinaryDateForm.visitDate} onChange={(event) => setVeterinaryDateForm({ ...veterinaryDateForm, visitDate: event.target.value })} className="mt-1 rounded-lg border px-2 py-1.5" /></label><label className="text-xs text-slate-500">Clearance date<input type="date" value={veterinaryDateForm.withdrawalUntil} onChange={(event) => setVeterinaryDateForm({ ...veterinaryDateForm, withdrawalUntil: event.target.value })} className="mt-1 rounded-lg border px-2 py-1.5" /></label></div> : record.withdrawalUntil}</td><td className="px-3 py-3"><div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${active ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}`}>{active ? "Under treatment" : "Cleared - milk acceptable"}</span>{editing ? <><button type="button" onClick={() => requestConfirmation({ title: "Save treatment dates?", message: "Update the visit and milk-clearance dates for this treatment record.", confirmLabel: "Save dates" }, () => void manageRecord("updateVeterinaryRecordDates", { recordId: record.recordId, ...veterinaryDateForm }))} className="rounded-lg bg-slate-900 px-2.5 py-1.5 text-xs font-medium text-white">Save</button><button type="button" onClick={() => setEditingVeterinaryRecord(null)} className="rounded-lg border px-2.5 py-1.5 text-xs">Cancel</button></> : <><button type="button" onClick={() => startVeterinaryDateEdit(record)} className="rounded-lg border px-2.5 py-1.5 text-xs font-medium text-slate-700">Change dates</button>{active ? <button type="button" onClick={() => requestConfirmation({ title: "Clear cow for milk?", message: "This cow will be cleared immediately and its milk can be accepted for collection.", confirmLabel: "Mark cleared" }, () => void manageRecord("clearVeterinaryRecord", { recordId: record.recordId }))} className="rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-medium text-white">Mark cleared</button> : null}</>}</div></td></tr>;
                    })}
                    {!currentState.veterinaryRecords.length ? <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">No cow treatment records yet.</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          {["MCC_OFFICER", "MILK_COLLECTOR"].includes(currentUser.role) && !managementOnly && showSection("records") ? (
            <section id="records" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between print:hidden">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Registered farmers and cows</h2>
                  <p className="mt-1 text-sm text-slate-500">Only farmers registered by your collector account and their assigned cows are shown.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm text-slate-500">{collectorRecords.length} farmers · {collectorRecords.reduce((total, item) => total + item.cows.length, 0)} cows</span>
                  <button type="button" onClick={generateReport} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white">Generate report</button>
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row print:hidden">
                <input value={recordsSearch} onChange={(event) => setRecordsSearch(event.target.value)} placeholder="Search farmer name, ID, phone, or cow tag" className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-emerald-500" />
                <input type="date" value={recordsFrom} onChange={(event) => setRecordsFrom(event.target.value)} aria-label="From date" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" />
                <input type="date" value={recordsTo} onChange={(event) => setRecordsTo(event.target.value)} aria-label="To date" className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm" />
                <select value={recordsSort} onChange={(event) => setRecordsSort(event.target.value as "newest" | "oldest")} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm">
                  <option value="newest">Newest registration first</option>
                  <option value="oldest">Oldest registration first</option>
                </select>
              </div>
              <div className="mt-4 hidden print:flex print:items-center print:justify-between print:border-b-2 print:border-emerald-600 print:pb-5">
                <div className="flex items-center gap-4">
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-600 text-2xl font-bold text-white">M</div>
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-emerald-700">Digital Milk Collection</p>
                    <h2 className="mt-1 text-2xl font-bold text-slate-900">Farmer &amp; Cow Registration Report</h2>
                    <p className="mt-1 text-sm text-slate-500">Collector: {currentUser.fullName} · Generated {reportGeneratedAt}</p>
                  </div>
                </div>
                {reportQrCode ? <div className="text-center"><img src={reportQrCode} alt="QR code for report verification" className="h-24 w-24" /><p className="mt-1 text-[9px] font-medium uppercase tracking-wide text-slate-500">Scan to verify</p></div> : null}
              </div>
              <div className="mt-4 hidden print:flex print:items-center print:justify-between print:rounded-xl print:bg-emerald-50 print:px-4 print:py-3">
                <span className="text-sm font-medium text-emerald-900">Official registration summary</span>
                <span className="text-sm text-emerald-800">{collectorRecords.length} farmers · {collectorRecords.reduce((total, item) => total + item.cows.length, 0)} cows</span>
              </div>
              <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
                <div className="overflow-x-auto">
                <table className="min-w-full border-collapse text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="border-b border-slate-200 px-3 py-3 font-semibold">Owner</th>
                      <th className="border-b border-slate-200 px-3 py-3 font-semibold">Phone</th>
                      <th className="border-b border-slate-200 px-3 py-3 font-semibold">
                        <button type="button" onClick={() => setRecordsSort(recordsSort === "newest" ? "oldest" : "newest")} className="inline-flex items-center gap-1 rounded px-1 py-1 text-left hover:bg-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500">
                          Registered <span aria-hidden="true">{recordsSort === "newest" ? "↓" : "↑"}</span>
                        </button>
                      </th>
                      <th className="border-b border-slate-200 px-3 py-3 font-semibold">Assigned cows</th>
                    </tr>
                  </thead>
                  <tbody>
                    {collectorRecords.map(({ farmer, cows }) => {
                      const isExpanded = expandedFarmer === farmer.farmerId;
                      return (
                        <Fragment key={farmer.farmerId}>
                        <tr className="border-b border-slate-100 transition-colors odd:bg-white even:bg-slate-50/50 hover:bg-emerald-50/50">
                          <td className="px-3 py-3"><button type="button" onClick={() => setExpandedFarmer(isExpanded ? null : farmer.farmerId)} className="mr-2 rounded bg-slate-100 px-2 py-1 text-xs">{isExpanded ? "−" : "+"}</button><span className="text-slate-800">{farmer.fullName}</span><div className="ml-9 text-xs text-slate-500">{farmer.email ?? "No email"}</div></td>
                          <td className="px-3 py-3 text-slate-600">{farmer.phone}</td>
                          <td className="whitespace-nowrap px-3 py-3 text-slate-600">{new Date(farmer.createdAt).toLocaleDateString()}</td>
                          <td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${cows.length ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{cows.length} {cows.length === 1 ? "cow" : "cows"}</span></td>
                        </tr>
                        {isExpanded ? <tr className="bg-slate-50">                        <td colSpan={4} className="px-5 py-4">
                          <div className="flex flex-wrap gap-2 text-sm text-slate-600">
                            <span>Owner: <strong>{farmer.fullName}</strong></span><span>National ID: <strong>{farmer.nationalId ?? "Not provided"}</strong></span><span>MCC Name: <strong>{farmer.mccName ?? farmer.mccId}</strong></span>
                          </div>
                          <p className="mt-3 text-sm text-slate-600">Address: <strong className="text-slate-900">{farmer.fullAddress ?? "Not provided"}</strong></p>
                          <div className="mt-2 grid gap-2 text-sm text-slate-600 sm:grid-cols-2"><span>Province: <strong>{farmer.province ?? "Not provided"}</strong></span><span>District: <strong>{farmer.district ?? "Not provided"}</strong></span><span>Sector: <strong>{farmer.sector ?? "Not provided"}</strong></span><span>Cell: <strong>{farmer.cell ?? "Not provided"}</strong></span><span>Village: <strong>{farmer.village ?? "Not provided"}</strong></span></div>
                          <div className="mt-3 flex flex-wrap gap-2 print:hidden">
                            {currentUser.role !== "MILK_COLLECTOR" ? (
                              <>
                                <button type="button" onClick={() => { setFarmerForm((current) => ({ ...current, province: farmer.province ?? "", district: farmer.district ?? "", sector: farmer.sector ?? "", cell: farmer.cell ?? "", village: farmer.village ?? "" })); setEditingFarmer(farmer); }} className="rounded-lg border px-3 py-1.5 text-xs font-medium">Edit farmer</button>
                                <button type="button" onClick={() => requestManageConfirmation("deleteFarmer", { farmerId: farmer.farmerId }, "Confirm deletion", "Delete this farmer and all assigned cows? This action cannot be undone.", true)} className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white">Delete farmer</button>
                              </>
                            ) : null}
                          </div>
                          <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-white">
                            <table className="min-w-full text-left text-sm">
                              <thead className="bg-slate-100 text-xs uppercase tracking-wide text-slate-500">
                                <tr><th className="px-3 py-2">Identification</th><th className="px-3 py-2">Breed</th><th className="px-3 py-2">Sex</th><th className="px-3 py-2 print:hidden">Actions</th></tr>
                              </thead>
                              <tbody>
                                {cows.map((cow) => (
                                  <tr key={cow.animalId} className="border-t border-slate-100">
                                    <td className="px-3 py-2 font-medium text-slate-800">{cow.tagNumber}</td>
                                    <td className="px-3 py-2 text-slate-600">{cow.breed || "Breed not provided"}</td>
                                    <td className="px-3 py-2 text-slate-600">{cow.sex.toLowerCase()}</td>
                                    <td className="px-3 py-2 print:hidden">
                                      <div className="flex flex-wrap gap-2">
                                        <button type="button" onClick={() => setEditingCow(cow)} className="rounded-lg border px-3 py-1.5 text-xs font-medium">Edit cow</button>
                                        <button type="button" onClick={() => requestManageConfirmation("deleteAnimal", { animalId: cow.animalId }, "Confirm deletion", "Delete this cow record? This action cannot be undone.", true)} className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white">Delete cow</button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                                {!cows.length ? <tr><td colSpan={4} className="px-3 py-4 text-center text-slate-500">No cows assigned to this farmer.</td></tr> : null}
                              </tbody>
                            </table>
                          </div>
                        </td></tr> : null}
                         <tr className="hidden print:table-row bg-white"><td colSpan={4} className="px-5 py-2">
                          <div className="border-l-2 border-emerald-200 pl-3 text-xs text-slate-600">
                            {cows.length ? cows.map((cow) => <span key={cow.animalId} className="mr-4 inline-block"><strong>{cow.tagNumber}</strong> · {cow.breed || "Breed not provided"} · {cow.sex.toLowerCase()}</span>) : "No cows assigned"}
                          </div>
                        </td></tr>
                        </Fragment>
                      );
                    })}
                    {!collectorRecords.length ? <tr><td colSpan={4} className="px-3 py-6 text-center text-slate-500">No matching farmers or cows found.</td></tr> : null}
                  </tbody>
                </table>
                </div>
              </div>
              <div className="mt-5 hidden print:flex print:items-center print:justify-between print:border-t print:border-slate-200 print:pt-4 print:text-xs print:text-slate-500">
                <span>Digital Milk Collection · Official farmer and cow records</span>
                <span>Report reference: {reportReference}</span>
              </div>
            </section>
          ) : null}

          {["MCC_OFFICER", "MILK_COLLECTOR"].includes(currentUser.role) && (showSection("milk-collection") || showSection("records")) ? (
            <div className="grid gap-6 xl:grid-cols-3 print:hidden">
              <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
                  <div><h2 className="font-semibold">Collected milk records</h2><p className="mt-1 text-xs text-slate-500">Every milk supply is listed separately. Filter by MCC decision or sort by collection time.</p></div>
                  <span className="text-xs text-slate-500">{collectedMilkRecords.length} records</span>
                </div>
                <div className="mt-4 flex flex-wrap gap-3">
                  <select aria-label="Filter by MCC status" value={recordsStatus} onChange={(event) => setRecordsStatus(event.target.value as typeof recordsStatus)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                    <option value="ALL">All MCC statuses</option><option value="ACCEPTED">Accepted by MCC</option><option value="REJECTED">Rejected by MCC</option><option value="PENDING">Pending MCC</option>
                  </select>
                  <select aria-label="Filter by collection source" value={recordsSource} onChange={(event) => setRecordsSource(event.target.value as typeof recordsSource)} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                    <option value="ALL">All collection sources</option><option value="FARMER_COLLECTION_CHAIN">Milk Collector chain</option><option value="DIRECT_MCC_COLLECTION">Direct MCC collection</option>
                  </select>
                  <select aria-label="Sort collection time" value={recordsSort} onChange={(event) => setRecordsSort(event.target.value as "newest" | "oldest")} className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                    <option value="newest">Newest supply first</option><option value="oldest">Oldest supply first</option>
                  </select>
                  <button type="button" onClick={generateMilkDecisionReport} className="rounded-xl bg-slate-900 px-3 py-2 text-sm font-medium text-white">MCC decision report</button>
                </div>
                <div className="mt-4 overflow-x-auto rounded-xl border border-slate-200">
                  <table className="min-w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Farmer</th><th className="px-3 py-3">Source</th><th className="px-3 py-3">Supplied at</th><th className="px-3 py-3">Litres</th><th className="px-3 py-3">Collector status</th><th className="px-3 py-3">MCC status</th></tr></thead>
                    <tbody>
                      {collectedMilkRecords.map(({ collection, farmer }) => <tr key={collection.collectionId} className="border-t border-slate-100 hover:bg-emerald-50/50"><td className="px-3 py-3 font-medium">{farmer?.fullName}</td><td className="px-3 py-3 text-xs">{collection.collectionSource === "DIRECT_MCC_COLLECTION" ? "Direct MCC" : "Collector chain"}</td><td className="px-3 py-3">{new Date(collection.collectionDate).toLocaleString()}</td><td className="px-3 py-3">{collection.litres.toFixed(2)} L</td><td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${collection.collectorAcceptanceStatus === "REJECTED" ? "bg-rose-50 text-rose-700" : "bg-emerald-50 text-emerald-700"}`}>{collection.collectorAcceptanceStatus}</span></td><td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${collection.mccAcceptanceStatus === "REJECTED" ? "bg-rose-50 text-rose-700" : collection.mccAcceptanceStatus === "PENDING" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{collection.mccAcceptanceStatus}</span></td></tr>)}
                      {!collectedMilkRecords.length ? <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-500">No milk collections match the selected filters.</td></tr> : null}
                    </tbody>
                  </table>
                </div>
              </section>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold">Open batches</h2><div className="mt-3 space-y-2 text-sm">{currentState.batches.filter((item) => item.status === "OPEN").slice(0, 5).map((item) => <div key={item.batchId} className="flex justify-between border-b pb-2"><span>{item.batchId}</span><span className="text-slate-500">{item.totalLitres} L</span></div>)}</div></div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"><h2 className="font-semibold">Pending payments</h2><div className="mt-3 space-y-2 text-sm">{currentState.payments.filter((item) => item.status === "PENDING").slice(0, 5).map((item) => <div key={item.paymentId} className="flex justify-between border-b pb-2"><span>{item.paymentId}</span><span className="text-slate-500">{item.amount.toFixed(2)}</span></div>)}</div></div>
            </div>
          ) : null}
          {showBatchTestWindow ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
              <section className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl">
                <div className="flex items-start justify-between gap-4">
                  <div><p className="text-xs uppercase tracking-[0.2em] text-slate-500">Second Level Test</p><h2 className="mt-1 text-2xl font-semibold text-slate-900">Review selected batches</h2><p className="mt-1 text-sm text-slate-500">{selectedQualityBatchIds.length} batch(es) will receive the same parameters and comment.</p></div>
                  <button type="button" onClick={() => setShowBatchTestWindow(false)} className="rounded-lg border px-3 py-1 text-sm">Close</button>
                </div>
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  <input type="number" step="0.01" placeholder="Acidity" value={qualityForm.acidity} onChange={(e) => setQualityForm({ ...qualityForm, acidity: e.target.value })} className="rounded-xl border px-3 py-2" />
                  <input type="number" step="0.001" placeholder="Density" value={qualityForm.density} onChange={(e) => setQualityForm({ ...qualityForm, density: e.target.value })} className="rounded-xl border px-3 py-2" />
                  <select aria-label="Organoleptic result" value={qualityForm.organolepticResult} onChange={(e) => setQualityForm({ ...qualityForm, organolepticResult: e.target.value as "PASS" | "FAIL" })} className="rounded-xl border px-3 py-2"><option value="PASS">Organoleptic: Pass</option><option value="FAIL">Organoleptic: Fail</option></select>
                  <input required type="number" step="0.001" placeholder="Lactometer reading" value={qualityForm.lactometerReading} onChange={(e) => setQualityForm({ ...qualityForm, lactometerReading: e.target.value })} className="rounded-xl border px-3 py-2" />
                  <select aria-label="Alcohol test result" value={qualityForm.alcoholTestResult} onChange={(e) => setQualityForm({ ...qualityForm, alcoholTestResult: e.target.value as "PASS" | "FAIL" })} className="rounded-xl border px-3 py-2"><option value="PASS">Alcohol test: Pass</option><option value="FAIL">Alcohol test: Fail</option></select>
                  <label className="flex items-center gap-2 rounded-xl border px-3 py-2 text-sm"><input type="checkbox" checked={qualityForm.adulterationDetected} onChange={(e) => setQualityForm({ ...qualityForm, adulterationDetected: e.target.checked })} /> Adulteration detected</label>
                  <textarea required placeholder="Comment sent to every farmer in the selected batches" value={qualityForm.comment} onChange={(e) => setQualityForm({ ...qualityForm, comment: e.target.value })} className="min-h-24 rounded-xl border px-3 py-2 md:col-span-2" />
                </div>
                <div className="mt-5 flex flex-wrap justify-end gap-3">
                  <button type="button" onClick={() => void submitSelectedBatchTests("FAIL")} className="rounded-xl bg-rose-700 px-4 py-2 text-sm font-semibold text-white">Reject selected batches</button>
                  <button type="button" onClick={() => void submitSelectedBatchTests("PASS")} className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white">Approve selected batches</button>
                </div>
              </section>
            </div>
          ) : null}
          {reportPreviewHtml ? (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4">
              <section className="flex h-[90vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-5 py-4">
                  <div>
                    <h2 className="font-semibold text-slate-900">Report preview</h2>
                    <p className="text-xs text-slate-500">Review the report inside the system. Select <strong>Print / Save as PDF</strong>, then choose “Save as PDF” in the browser print window.</p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={printReportPreview} className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white">Print / Save as PDF</button>
                    <button type="button" onClick={() => setReportPreviewHtml("")} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700">Close</button>
                  </div>
                </div>
                <iframe title="Report PDF preview" srcDoc={reportPreviewHtml} className="min-h-0 flex-1 bg-slate-100" />
              </section>
            </div>
          ) : null}
        </div>
      </AppShell>
    </AuthGuard>
  );
}