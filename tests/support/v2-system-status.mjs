// Fixed environment-health fixture; browser suites never depend on live health.
export const statusEndpoint = "https://huihui-api-beta.huihuigames01.workers.dev/api/system-status";
export const statusFixture = (status = "partial_outage") => ({
  ok: true, status, checkedAt: "2026-09-25T09:10:48.104Z",
  components: [{ id: "api", status: "operational" }, { id: "contact", status: "operational" }, { id: "website", status }],
});
export async function mockSystemStatus(target) {
  await target.route(statusEndpoint, (route) => route.fulfill({ json: statusFixture() }));
}
