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
