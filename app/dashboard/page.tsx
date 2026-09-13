"use client";

import { useEffect, useState } from "react";
import { AppShell, AuthGuard } from "@/components/layout/app-shell";
import { useAuth } from "@/components/auth/auth-provider";
import type { Animal, CowRegistrationAuthorization, Farmer, MilkCollection, VeterinaryRecord, CollectionRequest } from "@/lib/phase2-data";

type DashboardData = {
  farmers: Farmer[];
  animals: Animal[];
  collections: MilkCollection[];
  veterinaryRecords: VeterinaryRecord[];
  milkPrice: number;
  mccSharePercent: number;
  collectorSharePercent: number;
  collectionRequests: CollectionRequest[];
  cowRegistrationAuthorizations: CowRegistrationAuthorization[];
};

const emptyDashboardData: DashboardData = {
  farmers: [],
  animals: [],
  collections: [],
  veterinaryRecords: [],
  collectionRequests: [],
  cowRegistrationAuthorizations: [],
  milkPrice: 620,
  mccSharePercent: 10,
  collectorSharePercent: 5,
};

function normalizeDashboardData(payload: Partial<DashboardData>): DashboardData {
  return {
    ...emptyDashboardData,
    ...payload,
    farmers: Array.isArray(payload.farmers) ? payload.farmers : [],
    animals: Array.isArray(payload.animals) ? payload.animals : [],
    collections: Array.isArray(payload.collections) ? payload.collections : [],
    veterinaryRecords: Array.isArray(payload.veterinaryRecords) ? payload.veterinaryRecords : [],
    collectionRequests: Array.isArray(payload.collectionRequests) ? payload.collectionRequests : [],
    cowRegistrationAuthorizations: Array.isArray(payload.cowRegistrationAuthorizations) ? payload.cowRegistrationAuthorizations : [],
  };
}

type Slice = { label: string; value: number; color: string };

function PieSummary({ title, slices }: { title: string; slices: Slice[] }) {
  const [selected, setSelected] = useState(0);
  const total = slices.reduce((sum, slice) => sum + slice.value, 0);
  let offset = 0;
  const gradient = total
    ? slices.map((slice) => {
      const start = offset;
      offset += (slice.value / total) * 100;
      return `${slice.color} ${start}% ${offset}%`;
    }).join(", ")
    : "#cbd5e1 0% 100%";

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
      <div className="mt-6 flex flex-col items-center gap-6 sm:flex-row">
        <button type="button" aria-label={`${title} chart`} onClick={() => setSelected((selected + 1) % Math.max(slices.length, 1))} className="relative h-40 w-40 shrink-0 rounded-full" style={{ background: `conic-gradient(${gradient})` }}>
          <div className="absolute inset-8 flex flex-col items-center justify-center rounded-full bg-white text-center">
            <strong className="text-2xl text-slate-900">{slices[selected]?.value ?? total}</strong>
            <span className="text-xs text-slate-500">{slices[selected]?.label ?? "Total"}</span>
          </div>
        </button>
        <div className="w-full space-y-3">
          {slices.map((slice, index) => (
            <button type="button" key={slice.label} onClick={() => setSelected(index)} className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm ${selected === index ? "bg-slate-200" : "bg-slate-50"}`}>
              <span className="flex items-center gap-2 font-medium text-slate-700"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: slice.color }} />{slice.label}</span>
              <span className="text-slate-500">{slice.value} ({total ? Math.round((slice.value / total) * 100) : 0}%)</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = useState<DashboardData | null>(null);
  const [mccSharePercent, setMccSharePercent] = useState("");
  const [collectorSharePercent, setCollectorSharePercent] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [collectors, setCollectors] = useState<Array<{ uid: string; fullName: string }>>([]);
  const [selectedCollector, setSelectedCollector] = useState("");
  const [requestMessage, setRequestMessage] = useState("");

  useEffect(() => {
    let active = true;
    if (!user) return () => { active = false; };
    fetch("/api/system", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "phase2", userId: user.uid }),
    })
      .then(async (response) => {
        const payload = await response.json() as Partial<DashboardData> & { error?: string };
        if (!response.ok || payload.error) throw new Error(payload.error ?? "Dashboard data could not be loaded.");
        return normalizeDashboardData(payload);
      })
      .then((nextData) => { if (active) { setData(nextData); setMccSharePercent(String(nextData.mccSharePercent)); setCollectorSharePercent(String(nextData.collectorSharePercent)); } })
      .catch(() => { if (active) { setData(emptyDashboardData); setMccSharePercent(String(emptyDashboardData.mccSharePercent)); setCollectorSharePercent(String(emptyDashboardData.collectorSharePercent)); } });
    return () => { active = false; };
  }, [user?.uid]);

  useEffect(() => {
    if (user?.role !== "FARMER") return;
    fetch("/api/system", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "activeCollectors", userId: user.uid }) })
      .then((response) => response.json())
      .then((payload: { collectors?: Array<{ uid: string; fullName: string }> }) => setCollectors(payload.collectors ?? []))
      .catch(() => setCollectors([]));
  }, [user?.role, user?.uid]);

  if (!data) {
    return <AuthGuard><AppShell><div className="rounded-2xl border border-slate-200 bg-white p-8 text-slate-500">Loading dashboard summary...</div></AppShell></AuthGuard>;
  }

  if (user?.role === "FARMER") {
    const recordedCollections = data.collections;
    const collectorAcceptedCollections = data.collections.filter((collection) => collection.collectorAcceptanceStatus === "ACCEPTED");
    const finalAcceptedCollections = data.collections.filter((collection) => collection.mccAcceptanceStatus === "ACCEPTED");
    const recordedLitres = recordedCollections.reduce((total, collection) => total + collection.litres, 0);
    const collectorAcceptedLitres = collectorAcceptedCollections.reduce((total, collection) => total + collection.litres, 0);
    const finalAcceptedLitres = finalAcceptedCollections.reduce((total, collection) => total + collection.litres, 0);
    const collectorAcceptedAmount = collectorAcceptedLitres * data.milkPrice;
    const finalAcceptedAmount = finalAcceptedLitres * data.milkPrice;
    const farmerAmount = finalAcceptedAmount * (1 - (data.mccSharePercent + data.collectorSharePercent) / 100);
    const suppliedSlices: Slice[] = [
      { label: "Accepted", value: Number(finalAcceptedLitres.toFixed(2)), color: "#10b981" },
      { label: "Pending", value: Number(data.collections.filter((collection) => collection.mccAcceptanceStatus === "PENDING").reduce((total, collection) => total + collection.litres, 0).toFixed(2)), color: "#f59e0b" },
      { label: "Rejected", value: Number(data.collections.filter((collection) => collection.mccAcceptanceStatus === "REJECTED").reduce((total, collection) => total + collection.litres, 0).toFixed(2)), color: "#f43f5e" },
    ];
    const amountSlices: Slice[] = suppliedSlices.map((slice) => ({ ...slice, value: Math.round(slice.value * data.milkPrice) }));

    return (
      <AuthGuard>
        <AppShell>
          <div className="space-y-8">
            <header>
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Farmer account</p>
              <h1 className="mt-2 text-3xl font-semibold text-slate-900">Milk delivery summary</h1>
              <p className="mt-2 text-sm text-slate-500">Milk accepted by your collector while awaiting final MCC quality approval.</p>
            </header>
            <section className="rounded-3xl border border-sky-200 bg-sky-50 p-6 shadow-sm">
              <p className="text-xs uppercase tracking-[0.2em] text-sky-700">Profile</p>
              <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
                <div><h2 className="text-xl font-semibold text-sky-950">{data.farmers[0]?.fullName ?? user?.fullName}</h2><p className="mt-1 text-sm text-sky-700">Farmer account profile</p></div>
                <div><p className="text-xs uppercase tracking-wide text-sky-700">Farmer ID</p><p className="mt-1 text-2xl font-semibold text-sky-950">{data.farmers[0]?.farmerId ?? "Not assigned"}</p><p className="mt-2 text-xs text-sky-700">{[data.farmers[0]?.district, data.farmers[0]?.sector, data.farmers[0]?.cell, data.farmers[0]?.village].filter(Boolean).join(" · ") || "Location not provided"}</p></div>
              </div>
              <div className="mt-5 border-t border-sky-200 pt-5">
                <p className="text-sm font-semibold text-sky-950">Request milk collection from another collector</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <select value={selectedCollector} onChange={(event) => setSelectedCollector(event.target.value)} className="rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm"><option value="">Select collector</option>{collectors.map((collector) => <option key={collector.uid} value={collector.uid}>{collector.fullName}</option>)}</select>
                  <button type="button" disabled={!selectedCollector} onClick={() => { void fetch("/api/system", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "createCollectionRequest", userId: user?.uid, data: { collectorId: selectedCollector } }) }).then(async (response) => { const payload = await response.json(); setRequestMessage(response.ok ? "Collection request sent." : payload.error ?? "Request failed."); if (response.ok) setSelectedCollector(""); }); }} className="rounded-xl bg-sky-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Send request</button>
                </div>
                {requestMessage ? <p className="mt-2 text-sm text-sky-800">{requestMessage}</p> : null}
                {data.collectionRequests.length ? <div className="mt-4 space-y-2">{data.collectionRequests.map((request) => <div key={request.requestId} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-200 bg-white px-3 py-2 text-xs"><span><strong>{request.collectorName ?? request.collectorId}</strong> · {request.status === "REJECTED" ? "Collector rejected the supply" : request.status === "ACCEPTED" ? "Collector accepted the supply" : "Awaiting collector decision"} · {new Date(request.requestedAt).toLocaleString()}</span>{request.status === "PENDING" ? <button type="button" onClick={() => { void fetch("/api/system", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancelCollectionRequest", userId: user?.uid, data: { requestId: request.requestId } }) }).then(() => window.location.reload()); }} className="rounded-lg border border-rose-200 px-2 py-1 font-semibold text-rose-700">Cancel</button> : null}</div>)}</div> : null}
              </div>
            </section>
            <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-6 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-emerald-700">My cows</p>
                  <h2 className="mt-2 text-xl font-semibold text-emerald-950">Registered cows under your account</h2>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-sm font-semibold text-emerald-800">{data.animals.length} cows</span>
              </div>
              {data.animals.length ? (
                <div className="mt-4 overflow-x-auto rounded-2xl bg-white">
                  <table className="min-w-full text-left text-sm">
                    <thead className="border-b border-emerald-100 text-xs uppercase tracking-wide text-slate-500">
                      <tr><th className="px-3 py-3">#</th><th className="px-3 py-3">Tag number</th><th className="px-3 py-3">Breed</th><th className="px-3 py-3">Sex</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Registered</th></tr>
                    </thead>
                    <tbody>
                      {data.animals.map((animal, index) => (
                        <tr key={animal.animalId} className="border-b border-slate-100 last:border-0">
                          <td className="px-3 py-3">{index + 1}</td>
                          <td className="px-3 py-3 font-semibold text-slate-900">{animal.tagNumber}</td>
                          <td className="px-3 py-3">{animal.breed ?? "—"}</td>
                          <td className="px-3 py-3">{animal.sex === "FEMALE" ? "Female" : "Male"}</td>
                          <td className="px-3 py-3"><span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">{animal.status}</span></td>
                          <td className="px-3 py-3">{new Date(animal.createdAt).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <p className="mt-4 rounded-xl bg-white p-4 text-sm text-slate-500">No cows have been registered under your account yet.</p>}
            </section>
            {data.cowRegistrationAuthorizations?.length ? <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm">
              <p className="text-xs uppercase tracking-[0.2em] text-amber-700">Farmer authorization</p>
              <h2 className="mt-2 text-xl font-semibold text-amber-950">Cow registration authorization</h2>
              <div className="mt-4 space-y-3">
                {data.cowRegistrationAuthorizations.map((authorization) => <div key={authorization.batchId} className="rounded-2xl border border-amber-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div><p className="font-semibold text-slate-900">{authorization.cowCount} cows requested</p><p className="text-sm text-slate-600">Requested by {authorization.requestedByName}</p></div>
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${authorization.status === "EXPIRED" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-800"}`}>{authorization.status === "EXPIRED" ? "Expired" : "Pending authorization"}</span>
                  </div>
                  <div className="mt-3 rounded-xl bg-slate-50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Cows to be registered</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {authorization.cowTags.map((tag) => <span key={tag} className="rounded-full bg-white px-3 py-1 text-sm font-medium text-slate-700 ring-1 ring-slate-200">{tag}</span>)}
                    </div>
                  </div>
                  {authorization.status !== "EXPIRED" ? <div className="mt-4 grid gap-3 sm:grid-cols-2"><div className="rounded-xl bg-amber-100 p-3"><p className="text-xs uppercase tracking-wide text-amber-700">Your authorization OTP</p><p className="mt-1 text-3xl font-bold tracking-[0.3em] text-amber-950">{authorization.otpCode}</p></div><div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-700"><p className="font-semibold">Authorization expires</p><p className="mt-1">{new Date(authorization.expiresAt).toLocaleString()}</p><p className="mt-1 text-xs text-slate-500">Give this one OTP to the authorized collector. It authorizes all {authorization.cowCount} cows in this batch.</p></div></div> : <p className="mt-3 text-sm text-rose-700">This authorization window ended before verification. Ask the collector to submit a new batch.</p>}
                </div>)}
              </div>
            </section> : null}
            <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">Recorded milk</p><p className="mt-2 text-3xl font-semibold text-slate-900">{recordedLitres.toFixed(2)} L</p><p className="mt-1 text-xs text-slate-500">{recordedCollections.length} deliveries recorded</p></div>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><p className="text-sm text-emerald-700">Collector-accepted milk</p><p className="mt-2 text-3xl font-semibold text-emerald-900">{collectorAcceptedLitres.toFixed(2)} L</p><p className="mt-1 text-xs text-emerald-700">{collectorAcceptedCollections.length} deliveries accepted by collector</p></div>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5"><p className="text-sm text-amber-700">Collector-accepted amount</p><p className="mt-2 text-3xl font-semibold text-amber-900">{collectorAcceptedAmount.toLocaleString()} RWF</p><p className="mt-1 text-xs text-amber-700">Estimated at {data.milkPrice.toLocaleString()} RWF/L · MCC approval pending</p></div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5"><p className="text-sm text-slate-700">Farmer payment approved by MCC</p><p className="mt-2 text-3xl font-semibold text-slate-900">{farmerAmount.toLocaleString()} RWF</p><p className="mt-1 text-xs text-slate-600">{finalAcceptedLitres.toFixed(2)} L · MCC {data.mccSharePercent}% · Collector {data.collectorSharePercent}%</p></div>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <PieSummary title="Supplied milk by decision" slices={suppliedSlices} />
              <PieSummary title="Estimated milk amount" slices={amountSlices} />
            </div>
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Milk collection history</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Date</th><th className="px-3 py-3">Quantity</th><th className="px-3 py-3">Collector</th><th className="px-3 py-3">MCC</th><th className="px-3 py-3">Milk collector level</th><th className="px-3 py-3">MCC level</th><th className="px-3 py-3">Final MCC amount</th><th className="px-3 py-3">MCC comment</th></tr></thead>
                  <tbody>
                    {recordedCollections.map((collection) => <tr key={collection.collectionId} className="border-t border-slate-100"><td className="px-3 py-3">{new Date(collection.collectionDate).toLocaleDateString()}</td><td className="px-3 py-3 font-medium">{collection.litres.toFixed(2)} L</td><td className="px-3 py-3">{collection.collectorName || "—"}</td><td className="px-3 py-3">{collection.collectorMccName || "—"}</td><td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${collection.collectorAcceptanceStatus === "ACCEPTED" ? "bg-emerald-50 text-emerald-700" : collection.collectorAcceptanceStatus === "REJECTED" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>{collection.collectorAcceptanceStatus}</span></td><td className="px-3 py-3"><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${collection.mccAcceptanceStatus === "ACCEPTED" ? "bg-emerald-50 text-emerald-700" : collection.mccAcceptanceStatus === "REJECTED" ? "bg-rose-50 text-rose-700" : "bg-amber-50 text-amber-700"}`}>{collection.mccAcceptanceStatus}</span></td><td className={`px-3 py-3 font-semibold ${collection.mccAcceptanceStatus === "REJECTED" ? "text-rose-700" : "text-slate-700"}`}>{collection.mccAcceptanceStatus === "ACCEPTED" ? `${(collection.litres * data.milkPrice * (1 - (data.mccSharePercent + data.collectorSharePercent) / 100)).toLocaleString()} RWF` : collection.mccAcceptanceStatus === "REJECTED" ? "Rejected by MCC" : "Pending MCC approval"}</td><td className="max-w-xs px-3 py-3 text-slate-600">{collection.mccComment || "—"}</td></tr>)}
                    {!recordedCollections.length ? <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-500">No milk collections have been recorded yet.</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </AppShell>
      </AuthGuard>
    );
  }

  const farmersWithCows = data.farmers.filter((farmer) => data.animals.some((cow) => cow.farmerId === farmer.farmerId)).length;
  const today = new Date().toISOString().slice(0, 10);
  const underTreatment = data.veterinaryRecords.filter((record) => record.clearanceStatus !== "CLEARED" && (!record.withdrawalUntil || record.withdrawalUntil > today)).length;

  const isAdmin = user?.role === "SUPER_ADMIN" || user?.role === "ADMIN";
  const approvedCollections = data.collections.filter((item) => item.mccAcceptanceStatus === "ACCEPTED");
  const approvedAmount = approvedCollections.reduce((total, item) => total + item.litres * data.milkPrice, 0);
  const collectorAmount = approvedAmount * data.collectorSharePercent / 100;
  const mccAmount = approvedAmount * data.mccSharePercent / 100;
  async function saveShares(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const mcc = Number(mccSharePercent);
    const collector = Number(collectorSharePercent);
    if (mcc < 0 || collector < 0 || mcc + collector > 100) {
      setShareMessage("Shares must be non-negative and total no more than 100%.");
      return;
    }
    const response = await fetch("/api/system", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "updatePaymentShares", userId: user?.uid, data: { mccSharePercent: mcc, collectorSharePercent: collector } }) });
    if (!response.ok) {
      setShareMessage("Payment shares could not be saved.");
      return;
    }
    setData((current) => current ? { ...current, mccSharePercent: mcc, collectorSharePercent: collector } : current);
    setShareMessage("Payment shares updated.");
  }

  return (
    <AuthGuard>
      <AppShell>
        <div className="space-y-8">
          <header>
            <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Summary dashboard</p>
            <h1 className="mt-2 text-3xl font-semibold text-slate-900">Recorded operations overview</h1>
            <p className="mt-2 text-sm text-slate-500">Interactive summaries of the farmers, cows, collections, and treatment records in the system.</p>
          </header>
          {user?.role === "MILK_COLLECTOR" ? <section className="rounded-3xl border border-amber-200 bg-amber-50 p-6 shadow-sm"><h2 className="text-lg font-semibold text-amber-950">Farmers supplying you</h2><p className="mt-1 text-sm text-amber-800">Farmers who selected this collector are shown here. Accept pending requests to add them to your collection list.</p><div className="mt-4 space-y-3">{data.collectionRequests.length ? data.collectionRequests.map((request) => { const farmer = data.farmers.find((entry) => entry.farmerId === request.farmerId); const location = [farmer?.district, farmer?.sector, farmer?.cell, farmer?.village].filter(Boolean).join(" · "); return <div key={request.requestId} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200 bg-white p-4"><div><p className="font-semibold text-slate-900">{farmer?.fullName ?? request.farmerId}</p><p className="text-xs text-slate-600">{farmer?.farmerId ?? request.farmerId}{farmer?.phone ? ` · ${farmer.phone}` : ""}</p><p className="text-xs text-slate-500">{location || "Location not provided"} · Requested {new Date(request.requestedAt).toLocaleString()}</p></div><div className="flex items-center gap-2">{request.status === "PENDING" ? <><button type="button" onClick={() => { void fetch("/api/system", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "decideCollectionRequest", userId: user.uid, data: { requestId: request.requestId, status: "ACCEPTED" } }) }).then(() => window.location.reload()); }} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold text-white">Accept</button><button type="button" onClick={() => { void fetch("/api/system", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "decideCollectionRequest", userId: user.uid, data: { requestId: request.requestId, status: "REJECTED" } }) }).then(() => window.location.reload()); }} className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-semibold text-white">Reject</button></> : <span className={`rounded-full px-3 py-1 text-xs font-semibold ${request.status === "ACCEPTED" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>{request.status}</span>}</div></div>; }) : <p className="rounded-xl border border-dashed border-amber-300 bg-white/70 p-4 text-sm text-amber-800">No farmers have selected you yet.</p>}</div></section> : null}
          {user?.role === "MILK_COLLECTOR" || user?.role === "MCC_OFFICER" || user?.role === "MCC_MANAGER" ? (
            <section className="grid gap-4 md:grid-cols-3">
              {user.role === "MILK_COLLECTOR" ? <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5"><p className="text-sm text-emerald-700">Your collector share</p><p className="mt-2 text-3xl font-semibold text-emerald-900">{collectorAmount.toLocaleString()} RWF</p><p className="mt-1 text-xs text-emerald-700">{data.collectorSharePercent}% of MCC-approved milk</p></div> : null}
              {user.role === "MCC_OFFICER" || user.role === "MCC_MANAGER" ? <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5"><p className="text-sm text-sky-700">MCC share</p><p className="mt-2 text-3xl font-semibold text-sky-900">{mccAmount.toLocaleString()} RWF</p><p className="mt-1 text-xs text-sky-700">{data.mccSharePercent}% of MCC-approved milk</p></div> : null}
              <div className="rounded-2xl border border-slate-200 bg-white p-5"><p className="text-sm text-slate-500">MCC-approved milk value</p><p className="mt-2 text-3xl font-semibold text-slate-900">{approvedAmount.toLocaleString()} RWF</p><p className="mt-1 text-xs text-slate-500">{approvedCollections.reduce((total, item) => total + item.litres, 0).toFixed(2)} L approved</p></div>
            </section>
          ) : null}
          {user?.role === "MCC_MANAGER" ? (
            <form onSubmit={saveShares} className="rounded-2xl border border-violet-200 bg-violet-50 p-5">
              <h2 className="font-semibold text-violet-950">Payment share settings</h2>
              <p className="mt-1 text-sm text-violet-800">Set the percentages deducted from each MCC-approved milk payment. The remaining amount goes to the farmer.</p>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <label className="text-sm font-medium text-violet-950">MCC share (% )<input type="number" min="0" max="100" step="0.01" value={mccSharePercent} onChange={(event) => setMccSharePercent(event.target.value)} className="mt-2 w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5" /></label>
                <label className="text-sm font-medium text-violet-950">Milk collector share (% )<input type="number" min="0" max="100" step="0.01" value={collectorSharePercent} onChange={(event) => setCollectorSharePercent(event.target.value)} className="mt-2 w-full rounded-xl border border-violet-200 bg-white px-3 py-2.5" /></label>
              </div>
              <div className="mt-4 flex items-center gap-4"><button type="submit" className="rounded-xl bg-violet-700 px-4 py-2.5 text-sm font-medium text-white">Save payment shares</button><span className="text-sm text-violet-800">Farmer receives {Math.max(0, 100 - Number(mccSharePercent || 0) - Number(collectorSharePercent || 0)).toFixed(2)}%</span></div>
              {shareMessage ? <p className="mt-3 text-sm text-violet-800">{shareMessage}</p> : null}
            </form>
          ) : null}
          <div className="grid gap-6 lg:grid-cols-2">
            <PieSummary title="Farmer and cow registration" slices={[
              { label: "Farmers with cows", value: farmersWithCows, color: "#10b981" },
              { label: "Farmers without cows", value: Math.max(data.farmers.length - farmersWithCows, 0), color: "#94a3b8" },
            ]} />
            <PieSummary title="Collection status" slices={[
              { label: "Accepted", value: data.collections.filter((item) => item.acceptanceStatus === "ACCEPTED").length, color: "#10b981" },
              { label: "Pending", value: data.collections.filter((item) => item.acceptanceStatus === "PENDING").length, color: "#f59e0b" },
              { label: "Rejected", value: data.collections.filter((item) => item.acceptanceStatus === "REJECTED").length, color: "#f43f5e" },
            ]} />
            <PieSummary title="Veterinary treatment status" slices={[
              { label: "Under treatment", value: underTreatment, color: "#ef4444" },
              { label: "Cleared", value: Math.max(data.veterinaryRecords.length - underTreatment, 0), color: "#10b981" },
            ]} />
            <PieSummary title="Registered animals by sex" slices={[
              { label: "Female", value: data.animals.filter((animal) => animal.sex === "FEMALE").length, color: "#8b5cf6" },
              { label: "Male", value: data.animals.filter((animal) => animal.sex === "MALE").length, color: "#0ea5e9" },
            ]} />
          </div>
          {isAdmin ? (
            <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Farmer IDs</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead className="bg-slate-50 text-xs uppercase tracking-wide text-slate-500"><tr><th className="px-3 py-3">Farmer ID</th><th className="px-3 py-3">Farmer name</th><th className="px-3 py-3">Phone</th></tr></thead>
                  <tbody>{data.farmers.map((farmer) => <tr key={farmer.farmerId} className="border-t border-slate-100"><td className="px-3 py-3 font-semibold text-slate-800">{farmer.farmerId}</td><td className="px-3 py-3">{farmer.fullName}</td><td className="px-3 py-3">{farmer.phone}</td></tr>)}</tbody>
                </table>
              </div>
            </section>
          ) : null}
        </div>
      </AppShell>
    </AuthGuard>
  );
}
