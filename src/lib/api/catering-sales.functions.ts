import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SQUARE_BASE = "https://connect.squareup.com";
const TOAST_BASE = "https://ws-api.toasttab.com";

type CateringDay = { location_id: string; business_date: string; amount: number };
type CateringWeekInput = { fiscal_year?: number; fiscal_week?: number; start_date: string; end_date: string };
type ToastDiningMetricsRow = {
  businessDate?: string | number;
  date?: string | number;
  diningOption?: string | { name?: string | null; value?: string | null } | null;
  diningOptionName?: string | null;
  name?: string | null;
  dimensions?: Record<string, unknown>;
  netSalesAmount?: number;
  grossSalesAmount?: number;
  sales?: number;
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
    return "Toast rate limit reached, try again later.";
  }
  return `${area} failed with status ${status}.`;
}

class ToastRateLimitError extends Error {
  readonly rateLimited = true as const;
  constructor() {
    super("Toast rate limit reached, try again later.");
  }
}

// Serialize Toast Analytics report-create calls across the whole request.
// Toast 429s aggressively when multiple create calls happen in quick succession.
const TOAST_CREATE_DELAY_MS = 12_000;
let toastCreateChain: Promise<unknown> = Promise.resolve();
let lastToastCreateAt = 0;
function queueToastCreate<T>(fn: () => Promise<T>): Promise<T> {
  const run = toastCreateChain.then(async () => {
    const wait = Math.max(0, TOAST_CREATE_DELAY_MS - (Date.now() - lastToastCreateAt));
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    try {
      return await fn();
    } finally {
      lastToastCreateAt = Date.now();
    }
  });
  toastCreateChain = run.catch(() => undefined);
  return run as Promise<T>;
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

function pickToastCreds(
  loc: any,
  opts: { analyticsOnly?: boolean } = {}
): { clientId: string; clientSecret: string; source: "analytics" | "standard" } | null {
  const std = { clientId: loc?.toast_client_id as string | null, clientSecret: loc?.toast_client_secret as string | null };
  const ana = { clientId: loc?.toast_analytics_client_id as string | null, clientSecret: loc?.toast_analytics_client_secret as string | null };
  if (ana.clientId && ana.clientSecret) return { clientId: ana.clientId!, clientSecret: ana.clientSecret!, source: "analytics" };
  if (opts.analyticsOnly) return null;
  if (std.clientId && std.clientSecret) return { clientId: std.clientId!, clientSecret: std.clientSecret!, source: "standard" };
  return null;
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
  endDate: string,
  forceWeekEndpoint = false
): Promise<string> {
  const range = forceWeekEndpoint ? "week" : toastMetricsRange(startDate, endDate);
  const res = await fetchWithTimeout(
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
  if (res.status === 429) throw new ToastRateLimitError();
  if (!res.ok) {
    const body = (await res.text()).slice(0, 300);
    const hint = res.status === 401 || res.status === 403
      ? " Toast Analytics (ERA) credentials required — set toast_analytics_client_id/secret on this location; standard Toast API creds don't have ERA scope."
      : "";
    throw new Error(`Toast dining metrics create ${range} failed with status ${res.status}.${hint} ${body}`.trim());
  }
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
  const deadline = Date.now() + 90_000;
  let lastStatus = 0;
  while (Date.now() < deadline) {
    const res = await fetchWithTimeout(`${base}/era/v1/metrics/${reportGuid}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    }, 20_000);
    lastStatus = res.status;
    if (res.status === 429) throw new ToastRateLimitError();
    if (res.status === 200) {
      const body = await res.json();
      if (Array.isArray(body)) return body as ToastDiningMetricsRow[];
      if (Array.isArray((body as any)?.data)) return (body as any).data as ToastDiningMetricsRow[];
      if (Array.isArray((body as any)?.rows)) return (body as any).rows as ToastDiningMetricsRow[];
      if (Array.isArray((body as any)?.results)) return (body as any).results as ToastDiningMetricsRow[];
      if (Array.isArray((body as any)?.reportData)) return (body as any).reportData as ToastDiningMetricsRow[];
      return [];
    }
    if (res.status !== 202 && res.status !== 204) {
      throw new Error(readableToastError("Toast dining metrics get", res.status));
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Toast dining metrics: report not ready in time (last status ${lastStatus})`);
}

// Cache TTL — reuse a successful Toast dining-metrics report for this long.
const TOAST_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

function diningReportType(startDate: string, endDate: string, fiscalYear?: number, fiscalWeek?: number): string {
  if (fiscalWeek) return `catering_actual_dining_option:fy:${fiscalYear ?? "unknown"}:week:${fiscalWeek}`;
  return `catering_actual_dining_option:${startDate}:${endDate}`;
}

async function readCachedDiningRows(
  supabaseAdmin: any,
  locationId: string,
  startDate: string,
  endDate: string,
  reportType: string,
  fiscalYear?: number,
  fiscalWeek?: number
): Promise<{ rows: ToastDiningMetricsRow[]; reportRequestGuid: string | null } | null> {
  let query = supabaseAdmin
    .from("toast_report_jobs")
    .select("rows, report_request_guid, status, updated_at")
    .eq("location_id", locationId)
    .eq("report_type", reportType);
  query = fiscalWeek ? query.eq("fiscal_year", fiscalYear).eq("fiscal_week", fiscalWeek) : query.eq("business_date", startDate);
  const { data } = await query.maybeSingle();
  if (!data || data.status !== "ready" || !Array.isArray(data.rows)) return null;
  const ageMs = Date.now() - new Date(data.updated_at as string).getTime();
  if (ageMs > TOAST_CACHE_TTL_MS) return null;
  return { rows: data.rows as ToastDiningMetricsRow[], reportRequestGuid: (data.report_request_guid as string | null) ?? null };
}

async function writeCachedDiningRows(
  supabaseAdmin: any,
  locationId: string,
  startDate: string,
  fiscalYear: number | undefined,
  fiscalWeek: number | undefined,
  reportType: string,
  reportRequestGuid: string,
  rows: ToastDiningMetricsRow[]
): Promise<void> {
  const onConflict = fiscalWeek ? "location_id,fiscal_year,fiscal_week,report_type" : "location_id,business_date,report_type";
  await supabaseAdmin
    .from("toast_report_jobs")
    .upsert(
      {
        location_id: locationId,
        business_date: startDate,
        fiscal_year: fiscalYear ?? null,
        fiscal_week: fiscalWeek ?? null,
        report_type: reportType,
        report_request_guid: reportRequestGuid,
        status: "ready",
        rows,
        error: null,
        updated_at: new Date().toISOString(),
      },
      { onConflict }
    );
}

function diningRowsToCatering(rows: ToastDiningMetricsRow[], locationId: string, fallbackBusinessDate?: string): CateringDay[] {
  const centsByDate = new Map<string, number>();
  for (const row of rows) {
    const diningOption = diningOptionLabel(row).trim().toLowerCase();
    // ERA returns DINING_OPTION = "Catering" directly; match exactly, not substring.
    if (diningOption !== "catering") continue;
    const businessDate = isoFromToastBusinessDate(row.businessDate ?? row.date) || fallbackBusinessDate || "";
    if (!businessDate) continue;
    const net = Number(row.netSalesAmount ?? row.grossSalesAmount ?? row.sales ?? 0);
    if (!Number.isFinite(net) || net <= 0) continue;
    const cents = Math.round(net * 100);
    centsByDate.set(businessDate, (centsByDate.get(businessDate) ?? 0) + cents);
  }
  return [...centsByDate.entries()].map(([business_date, cents]) => ({ location_id: locationId, business_date, amount: cents / 100 }));
}

function diningOptionLabel(row: ToastDiningMetricsRow): string {
  const direct = row.diningOption;
  if (typeof direct === "string") return direct;
  if (direct && typeof direct === "object") return direct.name ?? direct.value ?? "";
  const dimDining = row.dimensions?.DINING_OPTION ?? row.dimensions?.diningOption ?? row.dimensions?.dining_option;
  if (typeof dimDining === "string") return dimDining;
  if (dimDining && typeof dimDining === "object") {
    const d = dimDining as { name?: string; value?: string };
    return d.name ?? d.value ?? "";
  }
  return row.diningOptionName ?? row.name ?? "";
}

async function toastCateringRangeByDiningOption(
  supabaseAdmin: any,
  base: string,
  accessToken: string,
  restaurantGuid: string,
  locationId: string,
  startDate: string,
  endDate: string,
  fiscalYear?: number,
  fiscalWeek?: number
): Promise<CateringDay[]> {
  const reportType = diningReportType(startDate, endDate, fiscalYear, fiscalWeek);
  const cached = await readCachedDiningRows(supabaseAdmin, locationId, startDate, endDate, reportType, fiscalYear, fiscalWeek);
  if (cached) return diningRowsToCatering(cached.rows, locationId, startDate);

  // Serialize create-report calls; Toast 429s on bursty creates.
  const guid = await queueToastCreate(() =>
    createToastDiningMetricsReport(base, accessToken, restaurantGuid, startDate, endDate, true)
  );
  const rows = await fetchToastDiningMetricsReport(base, accessToken, guid);
  await writeCachedDiningRows(supabaseAdmin, locationId, startDate, fiscalYear, fiscalWeek, reportType, guid, rows).catch(() => undefined);
  return diningRowsToCatering(rows, locationId, startDate);
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
        fiscal_year: z.number().int().optional(),
        weeks: z
          .array(
            z.object({
              fiscal_week: z.number().int().min(1).max(53),
              start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
              end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
            })
          )
          .max(53)
          .optional(),
      })
      .parse(input)
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const effectiveEndDate = minISO(data.end_date, todayISO());
    if (effectiveEndDate < data.start_date) return { results: [], errors: [] };
    const requestedWeeks: CateringWeekInput[] = (data.weeks?.length ? data.weeks : [{ start_date: data.start_date, end_date: effectiveEndDate }]).flatMap((w) => {
      const weekEnd = minISO(w.end_date, effectiveEndDate);
      return weekEnd < w.start_date ? [] : [{ ...w, end_date: weekEnd }];
    });
    const totalDays = requestedWeeks.reduce((sum, w) => sum + isoRangeDates(w.start_date, w.end_date).length, 0);
    if (totalDays > 370) throw new Error("Date range too large (max 370 days)");

    const { data: locs, error } = await supabaseAdmin
      .from("locations")
      .select(
        "id,name,pos_provider,square_location_id,square_access_token,toast_restaurant_guid,toast_client_id,toast_client_secret,toast_analytics_client_id,toast_analytics_client_secret,toast_api_url"
      )
      .in("id", data.location_ids);
    if (error) throw new Error(error.message);

    const perLocation: Array<{ results: CateringDay[]; errors: Array<{ location_id: string; message: string }> }> = [];
    let rateLimited = false;
    for (const loc of ((locs as any[]) ?? [])) {
      const locResults: CateringDay[] = [];
      const locErrors: Array<{ location_id: string; message: string }> = [];
      if (rateLimited) {
        locErrors.push({ location_id: loc.id, message: "Toast rate limit reached, try again later." });
        perLocation.push({ results: locResults, errors: locErrors });
        continue;
      }
      try {
        if (loc.pos_provider === "square" && loc.square_location_id && loc.square_access_token) {
          for (const week of requestedWeeks) {
            for (const d of isoRangeDates(week.start_date, week.end_date)) {
              const amt = await squareCateringDay(loc.square_access_token, loc.square_location_id, d);
              if (amt > 0) locResults.push({ location_id: loc.id, business_date: d, amount: amt });
            }
          }
        } else if (loc.pos_provider === "toast" && loc.toast_restaurant_guid) {
          const base = (loc.toast_api_url || TOAST_BASE).replace(/\/+$/, "");
          const creds = pickToastCreds(loc);
          if (!creds) throw new Error("Toast credentials not configured");
          const token = await toastAccessToken(base, creds.clientId, creds.clientSecret);
          try {
            for (const week of requestedWeeks) {
              locResults.push(
                ...(await toastCateringRangeByDiningOption(
                  supabaseAdmin,
                  base,
                  token,
                  loc.toast_restaurant_guid,
                  loc.id,
                  week.start_date,
                  week.end_date,
                  data.fiscal_year,
                  week.fiscal_week
                ))
              );
            }
          } catch (metricsError) {
            if ((metricsError as any)?.rateLimited) throw metricsError;
            try {
              const cateringGuids = await toastCateringDiningOptionGuids(base, token, loc.toast_restaurant_guid);
              for (const week of requestedWeeks) {
                for (const d of isoRangeDates(week.start_date, week.end_date)) {
                  const amt = await toastCateringDay(base, token, loc.toast_restaurant_guid, d, cateringGuids);
                  if (amt > 0) locResults.push({ location_id: loc.id, business_date: d, amount: amt });
                }
              }
            } catch {
              throw metricsError;
            }
            if (locResults.length === 0) throw metricsError;
          }
        }
      } catch (e) {
        if ((e as any)?.rateLimited) {
          rateLimited = true;
          locErrors.push({ location_id: loc.id, message: "Toast rate limit reached, try again later." });
        } else {
          locErrors.push({ location_id: loc.id, message: (e as Error).message });
        }
      }
      perLocation.push({ results: locResults, errors: locErrors });
      await new Promise((r) => setTimeout(r, 400));
    }

    const results = perLocation.flatMap((r) => r.results);
    const errors = perLocation.flatMap((r) => r.errors);

    return { results, errors, rateLimited };
  });

export const getToastCateringDiagnostics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        location_id: z.string().uuid(),
        start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(input)
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: loc, error } = await supabaseAdmin
      .from("locations")
      .select(
        "id,name,pos_provider,toast_restaurant_guid,toast_client_id,toast_client_secret,toast_analytics_client_id,toast_analytics_client_secret,toast_api_url"
      )
      .eq("id", data.location_id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!loc) throw new Error("Location not found");
    if (loc.pos_provider !== "toast" || !loc.toast_restaurant_guid) {
      throw new Error("Location is not configured for Toast");
    }
    const creds = pickToastCreds(loc, { analyticsOnly: true });
    if (!creds) throw new Error("Toast Analytics credentials not configured for this location. Set toast_analytics_client_id and toast_analytics_client_secret — the ERA /metrics endpoints reject standard Toast API credentials with 401.");
    const base = (loc.toast_api_url || TOAST_BASE).replace(/\/+$/, "");

    const requestBody = {
      startBusinessDate: compactBusinessDate(data.start_date),
      endBusinessDate: compactBusinessDate(data.end_date),
      restaurantIds: [loc.toast_restaurant_guid],
      excludedRestaurantIds: [] as string[],
      groupBy: ["DINING_OPTION"],
    };

    const token = await toastAccessToken(base, creds.clientId, creds.clientSecret);
    const guid = await queueToastCreate(() =>
      createToastDiningMetricsReport(base, token, loc.toast_restaurant_guid!, data.start_date, data.end_date, true)
    );
    const rows = await fetchToastDiningMetricsReport(base, token, guid);

    const normalized = rows.map((r) => ({
      diningOption: diningOptionLabel(r) || null,
      netSalesAmount: r.netSalesAmount ?? null,
      grossSalesAmount: r.grossSalesAmount ?? null,
      businessDate: isoFromToastBusinessDate(r.businessDate ?? r.date) || null,
      restaurantGuid: loc.toast_restaurant_guid,
      raw: JSON.stringify(r),
    }));

    return {
      location: { id: loc.id, name: loc.name, restaurantGuid: loc.toast_restaurant_guid },
      endpoint: `${base}/era/v1/metrics/week`,
      requestBody,
      reportRequestGuid: guid,
      rowCount: rows.length,
      rows: normalized,
    };
  });


