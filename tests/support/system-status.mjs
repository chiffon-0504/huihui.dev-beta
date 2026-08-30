export function systemStatusIncidentsFixture(reports = []) {
  return { ok: true, source: "better_stack", reports, fetchedAt: "2026-08-31T12:34:56.000Z" };
}

export function systemStatusIncidentReport(index = 0, updateCount = 1) {
  return {
    key: index.toString(16).padStart(64, "0"),
    title: `Status report ${index + 1}`,
    url: `https://huihui-dev.betteruptime.com/incident/test_${index + 1}`,
    updates: Array.from({ length: updateCount }, (_, update) => ({
      publishedAt: new Date(Date.UTC(2026, 7, 30 - index, update)).toISOString(),
      message: `Public update ${update + 1}\nDetails for report ${index + 1}.`,
    })),
  };
}

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
