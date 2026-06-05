import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SQUARE_BASE = "https://connect.squareup.com";
const TOAST_BASE = "https://ws-api.toasttab.com";

type CateringDay = { location_id: string; business_date: string; amount: number };
type ToastDiningMetricsRow = {
  businessDate?: string | number;
  diningOption?: string | null;
  netSalesAmount?: number;
  grossSalesAmount?: number;
};

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 12_000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function minISO(a: string, b: string): string {
  return a <= b ? a : b;
}

function isoFromToastBusinessDate(value: string | number | undefined): string {
  const raw = String(value ?? "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const compact = raw.replace(/\D/g, "");
  return /^\d{8}$/.test(compact) ? `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}` : "";
}

function compactBusinessDate(iso: string): number {
  return Number(iso.replace(/-/g, ""));
}

function readableToastError(area: string, status: number): string {
  if (status === 429) {
    return "Toast is temporarily rate-limiting catering sales. Please wait 5–10 minutes, then click Refresh again.";
  }
  return `${area} failed with status ${status}.`;
}

function toastMetricsRange(startISO: string, endISO: string): "week" | "month" | "year" {
  const start = new Date(`${startISO}T00:00:00Z`).getTime();
  const end = new Date(`${endISO}T00:00:00Z`).getTime();
  const inclusiveDays = Math.floor((end - start) / 86_400_000) + 1;
  if (inclusiveDays <= 7) return "week";
  if (inclusiveDays <= 31) return "month";
  return "year";
}

function isoRangeDates(startISO: string, endISO: string): string[] {
  const out: string[] = [];
  const start = new Date(`${startISO}T00:00:00Z`);
  const end = new Date(`${endISO}T00:00:00Z`);
  for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

function pickToastCreds(loc: any): { clientId: string; clientSecret: string } | null {
  const std = { clientId: loc?.toast_client_id as string | null, clientSecret: loc?.toast_client_secret as string | null };
  const ana = { clientId: loc?.toast_analytics_client_id as string | null, clientSecret: loc?.toast_analytics_client_secret as string | null };
  const chosen = ana.clientId && ana.clientSecret ? ana : std;
  if (!chosen.clientId || !chosen.clientSecret) return null;
  return { clientId: chosen.clientId!, clientSecret: chosen.clientSecret! };
}

async function toastAccessToken(base: string, clientId: string, clientSecret: string): Promise<string> {
  const res = await fetchWithTimeout(`${base}/authentication/v1/authentication/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ clientId, clientSecret, userAccessType: "TOAST_MACHINE_CLIENT" }),
  });
  if (!res.ok) throw new Error(`Toast auth ${res.status}: ${(await res.text()).slice(0, 240)}`);
  const json = (await res.json()) as { token?: { accessToken?: string } };
  const tok = json.token?.accessToken;
  if (!tok) throw new Error("Toast auth: missing accessToken");
  return tok;
}

async function toastCateringDiningOptionGuids(base: string, accessToken: string, restaurantGuid: string): Promise<Set<string>> {
  const res = await fetchWithTimeout(`${base}/config/v2/diningOptions`, {
    headers: { Authorization: `Bearer ${accessToken}`, "Toast-Restaurant-External-ID": restaurantGuid },
  });
  if (!res.ok) throw new Error(`Toast diningOptions ${res.status}: ${(await res.text()).slice(0, 240)}`);
  const list = (await res.json()) as Array<{ guid?: string; name?: string }>;
  const set = new Set<string>();
  for (const d of list ?? []) {
    if (d?.guid && /catering/i.test(d?.name ?? "")) set.add(d.guid);
  }
  return set;
}

async function createToastDiningMetricsReport(
  base: string,
  accessToken: string,
  restaurantGuid: string,
  startDate: string,
  endDate: string
): Promise<string> {
  const range = toastMetricsRange(startDate, endDate);
  let res: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    res = await fetchWithTimeout(
      `${base}/era/v1/metrics/${range}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          startBusinessDate: compactBusinessDate(startDate),
          endBusinessDate: compactBusinessDate(endDate),
          restaurantIds: [restaurantGuid],
          excludedRestaurantIds: [],
          groupBy: ["DINING_OPTION"],
        }),
      },
      8_000
    );
    if (res.status !== 429) break;
    await new Promise((r) => setTimeout(r, 1_500 * (attempt + 1)));
  }
  if (!res) throw new Error("Toast dining metrics request did not run");
  if (!res.ok) throw new Error(readableToastError(`Toast dining metrics create ${range}`, res.status));
  const raw = await res.text();
  let guid = "";
  try {
    const parsed = JSON.parse(raw);
    guid = typeof parsed === "string" ? parsed : (parsed?.reportRequestGuid ?? "");
  } catch {
    guid = raw.replace(/^"|"$/g, "");
  }
  if (!guid) throw new Error(`Toast dining metrics: missing reportRequestGuid (${raw.slice(0, 200)})`);
  return guid;
}

async function fetchToastDiningMetricsReport(base: string, accessToken: string, reportGuid: string): Promise<ToastDiningMetricsRow[]> {
  const deadline = Date.now() + 14_000;
  let lastStatus = 0;
  while (Date.now() < deadline) {
    const res = await fetchWithTimeout(`${base}/era/v1/metrics/${reportGuid}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }, 8_000);
    lastStatus = res.status;
    if (res.status === 200) {
      const body = await res.json();
      if (Array.isArray(body)) return body as ToastDiningMetricsRow[];
      if (Array.isArray((body as any)?.data)) return (body as any).data as ToastDiningMetricsRow[];
      return [];
    }
    if (res.status !== 202 && res.status !== 204) {
      throw new Error(readableToastError("Toast dining metrics get", res.status));
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Toast dining metrics: report not ready in time (last status ${lastStatus})`);
}

async function toastCateringRangeByDiningOption(
  base: string,
  accessToken: string,
  restaurantGuid: string,
  locationId: string,
  startDate: string,
  endDate: string
): Promise<CateringDay[]> {
  const guid = await createToastDiningMetricsReport(base, accessToken, restaurantGuid, startDate, endDate);
  const rows = await fetchToastDiningMetricsReport(base, accessToken, guid);
  const byDate = new Map<string, number>();
  for (const row of rows) {
    if (!/catering/i.test(row.diningOption ?? "")) continue;
    const businessDate = isoFromToastBusinessDate(row.businessDate);
    if (!businessDate) continue;
    const amount = Number(row.netSalesAmount ?? row.grossSalesAmount ?? 0);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    byDate.set(businessDate, (byDate.get(businessDate) ?? 0) + amount);
  }
  return [...byDate.entries()].map(([business_date, amount]) => ({ location_id: locationId, business_date, amount }));
}

async function toastCateringDay(base: string, accessToken: string, restaurantGuid: string, businessDate: string, cateringGuids: Set<string>): Promise<number> {
  if (cateringGuids.size === 0) return 0;
  const compact = businessDate.replace(/-/g, "");
  let page = 1;
  let totalCents = 0;
  for (;;) {
    const url = `${base}/orders/v2/ordersBulk?businessDate=${compact}&page=${page}&pageSize=100`;
    const res = await fetchWithTimeout(url, {
      headers: { Authorization: `Bearer ${accessToken}`, "Toast-Restaurant-External-ID": restaurantGuid },
    });
    if (!res.ok) throw new Error(`Toast orders ${res.status}: ${(await res.text()).slice(0, 240)}`);
    const orders = (await res.json()) as Array<{
      voided?: boolean;
      diningOption?: { guid?: string } | null;
      checks?: Array<{ totalAmount?: number; voided?: boolean; diningOption?: { guid?: string } | null }>;
    }>;
    if (!orders || orders.length === 0) break;
    for (const o of orders) {
      if (o.voided) continue;
      const orderDoGuid = o.diningOption?.guid ?? "";
      for (const c of o.checks ?? []) {
        if (c.voided) continue;
        const guid = c.diningOption?.guid ?? orderDoGuid;
        if (guid && cateringGuids.has(guid)) {
          totalCents += Math.round(Number(c.totalAmount ?? 0) * 100);
        }
      }
    }
    if (orders.length < 100) break;
    page += 1;
  }
  return totalCents / 100;
}

async function squareCateringDay(accessToken: string, locationId: string, businessDate: string): Promise<number> {
  const start = `${businessDate}T00:00:00Z`;
  const end = `${businessDate}T23:59:59Z`;
  let cursor: string | undefined;
  let totalCents = 0;
  do {
    const res = await fetchWithTimeout(`${SQUARE_BASE}/v2/orders/search`, {
      method: "POST",
      headers: { "Square-Version": "2024-09-19", Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        location_ids: [locationId],
        cursor,
        limit: 500,
        query: {
          filter: {
            date_time_filter: { closed_at: { start_at: start, end_at: end } },
            state_filter: { states: ["COMPLETED"] },
          },
        },
      }),
    });
    if (!res.ok) throw new Error(`Square ${res.status}: ${(await res.text()).slice(0, 240)}`);
    const json = (await res.json()) as {
      orders?: Array<{
        source?: { name?: string };
        line_items?: Array<{ name?: string; variation_name?: string; category_name?: string }>;
        net_amounts?: { total_money?: { amount?: number } };
        total_money?: { amount?: number };
      }>;
      cursor?: string;
    };
    for (const o of json.orders ?? []) {
      const sourceName = o.source?.name ?? "";
      const items = o.line_items ?? [];
      const isCatering =
        /catering/i.test(sourceName) ||
        items.some((li) =>
          /catering/i.test(li?.name ?? "") ||
          /catering/i.test(li?.variation_name ?? "") ||
          /catering/i.test(li?.category_name ?? "")
        );
      if (!isCatering) continue;
      const amt = o.net_amounts?.total_money?.amount ?? o.total_money?.amount ?? 0;
      totalCents += Number(amt);
    }
    cursor = json.cursor;
  } while (cursor);
  return totalCents / 100;
}

export const getCateringSales = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        location_ids: z.array(z.string().uuid()).min(1).max(50),
        start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(input)
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const effectiveEndDate = minISO(data.end_date, todayISO());
    if (effectiveEndDate < data.start_date) return { results: [], errors: [] };
    const dates = isoRangeDates(data.start_date, effectiveEndDate);
    if (dates.length > 100) throw new Error("Date range too large (max 100 days)");

    const { data: locs, error } = await supabaseAdmin
      .from("locations")
      .select(
        "id,name,pos_provider,square_location_id,square_access_token,toast_restaurant_guid,toast_client_id,toast_client_secret,toast_analytics_client_id,toast_analytics_client_secret,toast_api_url"
      )
      .in("id", data.location_ids);
    if (error) throw new Error(error.message);

    const perLocation: Array<{ results: CateringDay[]; errors: Array<{ location_id: string; message: string }> }> = [];
    for (const loc of ((locs as any[]) ?? [])) {
      const locResults: CateringDay[] = [];
      const locErrors: Array<{ location_id: string; message: string }> = [];
      try {
        if (loc.pos_provider === "square" && loc.square_location_id && loc.square_access_token) {
          for (const d of dates) {
            const amt = await squareCateringDay(loc.square_access_token, loc.square_location_id, d);
            if (amt > 0) locResults.push({ location_id: loc.id, business_date: d, amount: amt });
          }
        } else if (loc.pos_provider === "toast" && loc.toast_restaurant_guid) {
          const base = (loc.toast_api_url || TOAST_BASE).replace(/\/+$/, "");
          const creds = pickToastCreds(loc);
          if (!creds) throw new Error("Toast credentials not configured");
          const token = await toastAccessToken(base, creds.clientId, creds.clientSecret);
          try {
            locResults.push(
              ...(await toastCateringRangeByDiningOption(
                base,
                token,
                loc.toast_restaurant_guid,
                loc.id,
                data.start_date,
                effectiveEndDate
              ))
            );
          } catch (metricsError) {
            try {
              const cateringGuids = await toastCateringDiningOptionGuids(base, token, loc.toast_restaurant_guid);
              for (const d of dates) {
                const amt = await toastCateringDay(base, token, loc.toast_restaurant_guid, d, cateringGuids);
                if (amt > 0) locResults.push({ location_id: loc.id, business_date: d, amount: amt });
              }
            } catch {
              throw metricsError;
            }
            if (locResults.length === 0) throw metricsError;
          }
        }
      } catch (e) {
        locErrors.push({ location_id: loc.id, message: (e as Error).message });
      }
      perLocation.push({ results: locResults, errors: locErrors });
      await new Promise((r) => setTimeout(r, 400));
    }

    const results = perLocation.flatMap((r) => r.results);
    const errors = perLocation.flatMap((r) => r.errors);

    return { results, errors };
  });
