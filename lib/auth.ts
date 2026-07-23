// Shared dual-auth gate for API routes that serve both machines and the
// browser dashboard: x-report-secret (agents, Mission Control, hooks) OR the
// fleet_session cookie (logged-in dashboard). Previously copy-pasted in
// agents/tasks/run routes — one implementation now.
//
// Structurally typed (not NextRequest) so it accepts a NextRequest and still
// unit-tests with plain stub objects.

export function authorized(req: {
  headers: { get(name: string): string | null };
  cookies: { get(name: string): { value: string } | undefined };
}): boolean {
  const secret = req.headers.get('x-report-secret');
  if (secret && process.env.REPORT_SECRET && secret === process.env.REPORT_SECRET) return true;
  const session = req.cookies.get('fleet_session')?.value;
  const expected = process.env.FLEET_PASSWORD ?? '';
  return !!expected && session === expected;
}
