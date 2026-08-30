export function systemStatusFixture(status = "operational") {
  return {
    ok: true,
    status,
    components: [
      { id: "website", status },
      { id: "api", status },
      { id: "contact", status },
    ],
    checkedAt: "2026-08-28T12:00:00.000Z",
  };
}

export function systemStatusHistoryFixture(records = [
  { date: "2026-08-30", status: "operational", downtimeSeconds: 0, maintenanceSeconds: 0 },
]) {
  const components = ["website", "api", "contact"].map((id) => ({
    id,
    status: "operational",
    availabilityPercent: records.length ? 100 : null,
    observedDays: records.length,
    historyStartDate: records[0]?.date ?? null,
    historyEndDate: records.at(-1)?.date ?? null,
    history: records.map((record) => ({ ...record })),
  }));
  const complete = components.every((component) =>
    component.status !== "unknown" && component.availabilityPercent !== null &&
    component.history.every((item) => item.status !== "unknown")
  );
  return {
    ok: complete,
    source: "better_stack",
    complete,
    windowDays: 90,
    fetchedAt: "2026-08-30T12:34:56.000Z",
    components,
  };
}
