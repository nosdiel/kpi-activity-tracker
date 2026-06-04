import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

// Production endpoints
const SQUARE_BASE = "https://connect.squareup.com";
const TOAST_BASE = "https://ws-api.toasttab.com";

type SyncResult = {
  location_id: string;
  location_name: string;
  business_date: string;
  status: "ok" | "error";
  total_cents?: number;
  customer_count?: number;
  message?: string;
};

function yesterdayISO(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

async function logSync(supabaseAdmin: any, source: "square" | "toast", r: SyncResult) {
  await supabaseAdmin.from("pos_sync_log").insert({
    source,
    location_id: r.location_id,
    business_date: r.business_date,
    status: r.status,
    total_cents: r.total_cents ?? null,
    message: r.message ?? null,
  });
}

async function upsertDailySales(
  supabaseAdmin: any,
  location_id: string,
  business_date: string,
  total_cents: number,
  source: "square" | "toast",
  customer_count: number
) {
  const actual_sales = Math.round(total_cents) / 100;
  const { error } = await supabaseAdmin.from("daily_sales").upsert(
    {
      location_id,
      business_date,
      total_cents,
      actual_sales,
      actual_customer_count: customer_count,
      source,
    },
    { onConflict: "location_id,business_date" }
  );
  if (error) throw new Error(`daily_sales upsert: ${error.message}`);

  const nextYearDate = isoShiftDays(business_date, 364);
  const { error: lyError } = await supabaseAdmin.from("daily_sales").upsert(
    {
      location_id,
      business_date: nextYearDate,
      last_year_sales: actual_sales,
      last_year_customer_count: customer_count,
      source,
    },
    { onConflict: "location_id,business_date" }
  );
  if (lyError) throw new Error(`daily_sales LY upsert: ${lyError.message}`);
}


// -----------------------------------------------------------------------------
// SQUARE
// -----------------------------------------------------------------------------
async function squareDayTotal(
  accessToken: string,
  locationId: string,
  businessDate: string
): Promise<{ totalCents: number; customerCount: number }> {
  const start = `${businessDate}T00:00:00Z`;
  const end = `${businessDate}T23:59:59Z`;
  let cursor: string | undefined;
  let totalCents = 0;
  let customerCount = 0;

  do {
    const res = await fetch(`${SQUARE_BASE}/v2/orders/search`, {
      method: "POST",
      headers: {
        "Square-Version": "2024-09-19",
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
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
    if (!res.ok) {
      throw new Error(`Square ${res.status}: ${(await res.text()).slice(0, 240)}`);
    }
    const json = (await res.json()) as {
      orders?: Array<{ net_amounts?: { total_money?: { amount?: number } }; total_money?: { amount?: number } }>;
      cursor?: string;
    };
    for (const o of json.orders ?? []) {
      const amt = o.net_amounts?.total_money?.amount ?? o.total_money?.amount ?? 0;
      totalCents += Number(amt);
      customerCount += 1;
    }
    cursor = json.cursor;
  } while (cursor);

  return { totalCents, customerCount };
}


export const syncSquare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        business_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        location_id: z.string().uuid().optional(),
      })
      .parse(input)
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const businessDate = data.business_date ?? yesterdayISO();

    let q = supabaseAdmin
      .from("locations")
      .select("id,name,square_location_id,square_access_token")
      .not("square_location_id", "is", null)
      .not("square_access_token", "is", null);
    if (data.location_id) q = q.eq("id", data.location_id);
    const { data: locs, error } = await q;
    if (error) throw new Error(error.message);

    const results: SyncResult[] = [];
    for (const loc of locs ?? []) {
      const r: SyncResult = {
        location_id: loc.id,
        location_name: loc.name,
        business_date: businessDate,
        status: "ok",
      };
      try {
        const { totalCents, customerCount } = await squareDayTotal(
          loc.square_access_token,
          loc.square_location_id,
          businessDate
        );
        r.total_cents = totalCents;
        r.customer_count = customerCount;
        await upsertDailySales(supabaseAdmin, loc.id, businessDate, totalCents, "square", customerCount);
      } catch (e) {
        r.status = "error";
        r.message = (e as Error).message;
      }
      await logSync(supabaseAdmin, "square", r);
      results.push(r);
    }

    return { business_date: businessDate, results };
  });

// -----------------------------------------------------------------------------
// TOAST
// -----------------------------------------------------------------------------
async function toastAccessToken(clientId: string, clientSecret: string): Promise<string> {
  const res = await fetch(`${TOAST_BASE}/authentication/v1/authentication/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId,
      clientSecret,
      userAccessType: "TOAST_MACHINE_CLIENT",
    }),
  });
  if (!res.ok) {
    throw new Error(`Toast auth ${res.status}: ${(await res.text()).slice(0, 240)}`);
  }
  const json = (await res.json()) as { token?: { accessToken?: string } };
  const tok = json.token?.accessToken;
  if (!tok) throw new Error("Toast auth: missing accessToken");
  return tok;
}

async function toastDayTotal(
  accessToken: string,
  restaurantGuid: string,
  businessDate: string
): Promise<number> {
  const compact = businessDate.replace(/-/g, "");
  let page = 1;
  let totalCents = 0;
  for (;;) {
    const url = `${TOAST_BASE}/orders/v2/ordersBulk?businessDate=${compact}&page=${page}&pageSize=100`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Toast-Restaurant-External-ID": restaurantGuid,
      },
    });
    if (!res.ok) {
      throw new Error(`Toast ${res.status}: ${(await res.text()).slice(0, 240)}`);
    }
    const orders = (await res.json()) as Array<{
      voided?: boolean;
      checks?: Array<{ totalAmount?: number; voided?: boolean }>;
    }>;
    if (!orders || orders.length === 0) break;
    for (const o of orders) {
      if (o.voided) continue;
      for (const c of o.checks ?? []) {
        if (c.voided) continue;
        totalCents += Math.round(Number(c.totalAmount ?? 0) * 100);
      }
    }
    if (orders.length < 100) break;
    page += 1;
  }
  return totalCents;
}

async function toastAccessTokenWithBase(
  base: string,
  clientId: string,
  clientSecret: string
): Promise<string> {
  const res = await fetch(`${base}/authentication/v1/authentication/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId,
      clientSecret,
      userAccessType: "TOAST_MACHINE_CLIENT",
    }),
  });
  if (!res.ok) {
    throw new Error(`Toast auth ${res.status}: ${(await res.text()).slice(0, 240)}`);
  }
  const json = (await res.json()) as { token?: { accessToken?: string } };
  const tok = json.token?.accessToken;
  if (!tok) throw new Error("Toast auth: missing accessToken");
  return tok;
}

type ToastMetricsRow = {
  businessDate?: string | number;
  netSalesAmount?: number;
  grossSalesAmount?: number;
  guestCount?: number;
  ordersCount?: number;
  closedOrderCount?: number;
  closedOrdersCount?: number;
};

function compactBusinessDate(iso: string) {
  return Number(iso.replace(/-/g, ""));
}

function isoFromToastBusinessDate(value: string | number | undefined) {
  const raw = String(value ?? "");
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const compact = raw.replace(/\D/g, "");
  return /^\d{8}$/.test(compact) ? `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}` : "";
}

async function createToastMetricsReport(
  base: string,
  accessToken: string,
  restaurantGuid: string,
  startDate: string,
  endDate: string,
  timeRange: "week" | "month" | "year"
): Promise<string> {
  const startCompact = compactBusinessDate(startDate);
  const endCompact = compactBusinessDate(endDate);
  let createRes: Response | null = null;
  let attempt = 0;
  for (;;) {
    createRes = await fetch(`${base}/era/v1/metrics/${timeRange}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startBusinessDate: startCompact,
        endBusinessDate: endCompact,
        restaurantIds: [restaurantGuid],
        excludedRestaurantIds: [],
        groupBy: [],
      }),
    });
    if (createRes.status !== 429 || attempt >= 5) break;
    const ra = Number(createRes.headers.get("retry-after"));
    const waitMs = Number.isFinite(ra) && ra > 0 ? ra * 1000 : Math.min(30_000, 2000 * 2 ** attempt);
    await new Promise((r) => setTimeout(r, waitMs));
    attempt += 1;
  }
  if (!createRes!.ok) {
    throw new Error(`Toast analytics create ${timeRange} ${createRes!.status}: ${(await createRes!.text()).slice(0, 240)}`);
  }
  const createdRaw = await createRes.text();
  let reportRequestGuid = "";
  try {
    const parsed = JSON.parse(createdRaw);
    reportRequestGuid = typeof parsed === "string" ? parsed : (parsed?.reportRequestGuid ?? "");
  } catch {
    reportRequestGuid = createdRaw.replace(/^"|"$/g, "");
  }
  if (!reportRequestGuid) throw new Error(`Toast analytics: missing reportRequestGuid (${createdRaw.slice(0, 200)})`);
  return reportRequestGuid;
}

async function fetchToastMetricsReport(
  base: string,
  accessToken: string,
  reportRequestGuid: string
): Promise<ToastMetricsRow[]> {
  const deadline = Date.now() + 90_000;
  let lastStatus = 0;
  let lastBody = "";
  while (Date.now() < deadline) {
    const getRes = await fetch(`${base}/era/v1/metrics/${reportRequestGuid}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    lastStatus = getRes.status;
    if (getRes.status === 200) {
      const body = await getRes.json();
      if (Array.isArray(body)) return body as ToastMetricsRow[];
    } else if (getRes.status === 202 || getRes.status === 204) {
      lastBody = (await getRes.text()).slice(0, 200);
    } else {
      throw new Error(`Toast analytics get ${getRes.status}: ${(await getRes.text()).slice(0, 240)}`);
    }
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error(`Toast analytics: report not ready in time (last status ${lastStatus}${lastBody ? `: ${lastBody}` : ""})`);
}

async function fetchToastMetricsRows(
  base: string,
  accessToken: string,
  restaurantGuid: string,
  startDate: string,
  endDate: string,
  timeRange: "week" | "month" | "year" = "week"
): Promise<ToastMetricsRow[]> {
  const reportRequestGuid = await createToastMetricsReport(base, accessToken, restaurantGuid, startDate, endDate, timeRange);
  return fetchToastMetricsReport(base, accessToken, reportRequestGuid);
}

function toastTotalsFromRows(rows: ToastMetricsRow[]) {
  let totalCents = 0;
  let customerCount = 0;
  for (const row of rows) {
    const amount = Number(row?.netSalesAmount ?? row?.grossSalesAmount ?? 0);
    if (Number.isFinite(amount)) totalCents += Math.round(amount * 100);
    const guestCount = Number(row?.guestCount ?? 0);
    const orderCount = Number(row?.ordersCount ?? row?.closedOrderCount ?? row?.closedOrdersCount ?? 0);
    const guests = guestCount > 0 ? guestCount : orderCount;
    if (Number.isFinite(guests)) customerCount += Math.round(guests);
  }
  return { totalCents, customerCount };
}

async function toastDayTotalWithBase(
  base: string,
  accessToken: string,
  restaurantGuid: string,
  businessDate: string
): Promise<{ totalCents: number; customerCount: number }> {
  const rows = await fetchToastMetricsRows(base, accessToken, restaurantGuid, businessDate, businessDate);
  return toastTotalsFromRows(rows);
}


// keep older helpers referenced (suppress unused warnings)
void toastAccessToken;
void toastDayTotal;

const toastBaseLocationColumns =
  "id,name,toast_restaurant_guid,toast_client_id,toast_client_secret";
const toastExtendedLocationColumns = `${toastBaseLocationColumns},toast_api_url,toast_credential_name`;

function isMissingToastMetadataColumn(error: { message?: string; code?: string; details?: string } | null | undefined) {
  if (!error) return false;
  const blob = `${error.message ?? ""} ${error.details ?? ""}`;
  if (error.code === "42703" && (blob.includes("toast_credential_name") || blob.includes("toast_api_url"))) return true;
  return blob.includes("toast_credential_name") || blob.includes("toast_api_url");
}

async function selectToastLocations(supabaseAdmin: any, locationId?: string) {
  const buildQuery = (columns: string) => {
    let query = supabaseAdmin
      .from("locations")
      .select(columns)
      .not("toast_restaurant_guid", "is", null)
      .not("toast_client_id", "is", null)
      .not("toast_client_secret", "is", null);
    if (locationId) query = query.eq("id", locationId);
    return query;
  };

  const extended = await buildQuery(toastExtendedLocationColumns);
  if (!extended.error || !isMissingToastMetadataColumn(extended.error)) return extended;

  return buildQuery(toastBaseLocationColumns);
}

async function selectLocationsPosStatus(supabaseAdmin: any) {
  const baseColumns =
    "id,name,pos_provider,square_location_id,square_access_token,toast_restaurant_guid,toast_client_id,toast_client_secret";
  const extendedColumns = `${baseColumns},toast_credential_name,toast_api_url`;

  const extended = await supabaseAdmin.from("locations").select(extendedColumns).order("name");
  if (!extended.error || !isMissingToastMetadataColumn(extended.error)) return extended;

  return supabaseAdmin.from("locations").select(baseColumns).order("name");
}

export const syncToast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        business_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        location_id: z.string().uuid().optional(),
      })
      .parse(input)
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const businessDate = data.business_date ?? yesterdayISO();

    const { data: locs, error } = await selectToastLocations(supabaseAdmin, data.location_id);
    if (error) throw new Error(error.message);

    const results: SyncResult[] = [];
    for (const loc of locs ?? []) {
      const r: SyncResult = {
        location_id: loc.id,
        location_name: loc.name,
        business_date: businessDate,
        status: "ok",
      };
      try {
        const base = ((loc as any).toast_api_url || TOAST_BASE).replace(/\/+$/, "");
        const token = await toastAccessTokenWithBase(base, loc.toast_client_id, loc.toast_client_secret);
        const { totalCents, customerCount } = await toastDayTotalWithBase(base, token, loc.toast_restaurant_guid, businessDate);
        r.total_cents = totalCents;
        r.customer_count = customerCount;
        await upsertDailySales(supabaseAdmin, loc.id, businessDate, totalCents, "toast", customerCount);
      } catch (e) {
        r.status = "error";
        r.message = (e as Error).message;
      }
      await logSync(supabaseAdmin, "toast", r);
      results.push(r);
    }

    return { business_date: businessDate, results };
  });

// -----------------------------------------------------------------------------
// Credentials (write-only from client; never returned)
// -----------------------------------------------------------------------------
export const updateLocationPosCredentials = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        location_id: z.string().uuid(),
        provider: z.enum(["square", "toast"]),
        // Square
        square_location_id: z.string().max(64).nullable().optional(),
        square_access_token: z.string().min(10).max(512).nullable().optional(),
        // Toast
        toast_credential_name: z.string().max(128).nullable().optional(),
        toast_api_url: z.string().url().max(256).nullable().optional(),
        toast_restaurant_guid: z.string().max(64).nullable().optional(),
        toast_client_id: z.string().max(128).nullable().optional(),
        toast_client_secret: z.string().min(10).max(512).nullable().optional(),
      })
      .parse(input)
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: Record<string, string | null> = { pos_provider: data.provider };
    const setIfPresent = (k: keyof typeof data) => {
      if ((data as any)[k] !== undefined) patch[k as string] = ((data as any)[k] || null) as any;
    };
    setIfPresent("square_location_id");
    setIfPresent("square_access_token");
    setIfPresent("toast_credential_name");
    setIfPresent("toast_api_url");
    setIfPresent("toast_restaurant_guid");
    setIfPresent("toast_client_id");
    setIfPresent("toast_client_secret");

    const { error } = await supabaseAdmin
      .from("locations")
      .update(patch)
      .eq("id", data.location_id);
    if (error && isMissingToastMetadataColumn(error)) {
      const { toast_credential_name, toast_api_url, ...fallbackPatch } = patch;
      void toast_credential_name;
      void toast_api_url;
      const fallback = await supabaseAdmin.from("locations").update(fallbackPatch).eq("id", data.location_id);
      if (fallback.error) throw new Error(fallback.error.message);
      return { ok: true };
    }
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Returns flags only — never the secret values themselves.
export const getLocationsPosStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await selectLocationsPosStatus(supabaseAdmin);
    if (error) throw new Error(error.message);
    return (data ?? []).map((l: any) => ({
      id: l.id,
      name: l.name,
      provider: (l.pos_provider ?? null) as "square" | "toast" | null,
      square_location_id: l.square_location_id ?? null,
      square_token_set: Boolean(l.square_access_token),
      toast_credential_name: l.toast_credential_name ?? null,
      toast_api_url: l.toast_api_url ?? null,
      toast_restaurant_guid: l.toast_restaurant_guid ?? null,
      toast_client_id: l.toast_client_id ?? null,
      toast_secret_set: Boolean(l.toast_client_secret),
    }));
  });

// Backfill actual_sales from total_cents for any rows where actual_sales is missing/zero.
export const backfillActualSales = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let updated = 0;
    let scanned = 0;
    const pageSize = 500;
    for (;;) {
      const { data, error } = await supabaseAdmin
        .from("daily_sales")
        .select("location_id,business_date,total_cents,actual_sales")
        .not("total_cents", "is", null)
        .or("actual_sales.is.null,actual_sales.eq.0")
        .range(0, pageSize - 1);
      if (error) throw new Error(error.message);
      const rows = data ?? [];
      if (rows.length === 0) break;
      scanned += rows.length;

      for (const r of rows as Array<{ location_id: string; business_date: string; total_cents: number }>) {
        const actual_sales = Math.round(Number(r.total_cents)) / 100;
        const { error: upErr } = await supabaseAdmin
          .from("daily_sales")
          .update({ actual_sales })
          .eq("location_id", r.location_id)
          .eq("business_date", r.business_date);
        if (upErr) throw new Error(`backfill update: ${upErr.message}`);
        updated += 1;
      }
      if (rows.length < pageSize) break;
    }
    return { ok: true, scanned, updated };
  });

function isoDaysAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
}

function isoShiftDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function currentWeekDatesLastYear(): string[] {
  const today = new Date();
  const weekStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  weekStart.setUTCDate(weekStart.getUTCDate() - weekStart.getUTCDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setUTCDate(d.getUTCDate() + i - 364);
    return d.toISOString().slice(0, 10);
  });
}

function daysBetweenISO(startISO: string, endISO: string): number {
  const start = new Date(`${startISO}T00:00:00Z`).getTime();
  const end = new Date(`${endISO}T00:00:00Z`).getTime();
  return Math.floor((end - start) / 86_400_000);
}

function chunkDatesByMaxSpan(dates: string[], maxInclusiveDays = 366): string[][] {
  const sorted = Array.from(new Set(dates)).sort();
  const chunks: string[][] = [];
  let current: string[] = [];
  let start = "";
  for (const date of sorted) {
    if (!start || daysBetweenISO(start, date) + 1 > maxInclusiveDays) {
      if (current.length) chunks.push(current);
      current = [date];
      start = date;
    } else {
      current.push(date);
    }
  }
  if (current.length) chunks.push(current);
  return chunks;
}

// Pull historical daily sales from POS for the last N days (default 365).
// Skips days that already have actual_sales and actual_customer_count populated so repeat runs are cheap.
export const backfillSalesRange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        source: z.enum(["square", "toast"]),
        days: z.number().int().min(1).max(730).optional(),
        start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        include_last_year: z.boolean().optional(),
        include_current_week_last_year: z.boolean().optional(),
        location_id: z.string().uuid().optional(),
      })
      .parse(input)
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const source = data.source;

    // Build the explicit list of business dates to backfill (inclusive).
    let dateList: string[];
    if (data.start_date && data.end_date) {
      const start = new Date(`${data.start_date}T00:00:00Z`);
      const end = new Date(`${data.end_date}T00:00:00Z`);
      if (end < start) throw new Error("end_date must be on or after start_date");
      dateList = [];
      for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
        dateList.push(d.toISOString().slice(0, 10));
      }
    } else {
      const days = data.days ?? 365;
      dateList = Array.from({ length: days }, (_, i) => isoDaysAgo(i + 1));
    }
    if (data.include_last_year) {
      dateList = Array.from(new Set([...dateList, ...dateList.map((d) => isoShiftDays(d, -364))]));
    }
    if (data.include_current_week_last_year) {
      dateList = Array.from(new Set([...dateList, ...currentWeekDatesLastYear()]));
    }
    if (dateList.length > 760) throw new Error("Date range too large (max 760 total days, including LY dates)");
    const days = dateList.length;

    let locs: any[] = [];
    if (source === "square") {
      let q = supabaseAdmin
        .from("locations")
        .select("id,name,square_location_id,square_access_token")
        .not("square_location_id", "is", null)
        .not("square_access_token", "is", null);
      if (data.location_id) q = q.eq("id", data.location_id);
      const { data: rows, error } = await q;
      if (error) throw new Error(error.message);
      locs = rows ?? [];
    } else {
      const { data: rows, error } = await selectToastLocations(supabaseAdmin, data.location_id);
      if (error) throw new Error(error.message);
      locs = rows ?? [];
    }

    const sortedDates = [...dateList].sort();
    const startDate = sortedDates[0];
    const endDate = sortedDates[sortedDates.length - 1];

    const locIds = locs.map((l: any) => l.id);
    const have = new Set<string>();
    if (locIds.length > 0) {
      const { data: existing, error: exErr } = await supabaseAdmin
        .from("daily_sales")
        .select("location_id,business_date,actual_sales,actual_customer_count")
        .in("location_id", locIds)
        .gte("business_date", startDate)
        .lte("business_date", endDate);
      if (exErr) throw new Error(exErr.message);
      for (const r of (existing ?? []) as Array<{
        location_id: string;
        business_date: string;
        actual_sales: number | null;
        actual_customer_count: number | null;
      }>) {
        // Only skip dates that already have BOTH sales and customer count populated;
        // otherwise re-fetch so the customer count column gets backfilled.
        if (r.actual_sales && r.actual_sales > 0 && r.actual_customer_count && r.actual_customer_count > 0) {
          have.add(`${r.location_id}|${r.business_date}`);
        }
      }
    }

    let processed = 0;
    let inserted = 0;
    const errors: Array<{ location_id: string; business_date: string; message: string }> = [];

    for (const loc of locs) {
      let toastToken: string | null = null;
      let toastBase = TOAST_BASE;
      if (source === "toast") {
        toastBase = (((loc as any).toast_api_url || TOAST_BASE) as string).replace(/\/+$/, "");
        try {
          toastToken = await toastAccessTokenWithBase(
            toastBase,
            loc.toast_client_id,
            loc.toast_client_secret
          );
        } catch (e) {
          errors.push({
            location_id: loc.id,
            business_date: "-",
            message: `auth: ${(e as Error).message}`,
          });
          continue;
        }
      }

      if (source === "toast") {
        processed += dateList.length;
        const neededDates = dateList.filter((businessDate) => !have.has(`${loc.id}|${businessDate}`)).sort();
        const neededSet = new Set(neededDates);
        for (const chunk of chunkDatesByMaxSpan(neededDates)) {
          try {
            const timeRange = chunk.length <= 7 ? "week" : chunk.length <= 31 ? "month" : "year";
            const rows = await fetchToastMetricsRows(
              toastBase,
              toastToken!,
              loc.toast_restaurant_guid,
              chunk[0],
              chunk[chunk.length - 1],
              timeRange
            );
            const rowsByDate = new Map<string, ToastMetricsRow[]>();
            for (const row of rows) {
              const businessDate = isoFromToastBusinessDate(row.businessDate);
              if (!businessDate || !neededSet.has(businessDate)) continue;
              rowsByDate.set(businessDate, [...(rowsByDate.get(businessDate) ?? []), row]);
            }
            for (const businessDate of chunk) {
              const dayRows = rowsByDate.get(businessDate) ?? [];
              const { totalCents, customerCount } = toastTotalsFromRows(dayRows);
              await upsertDailySales(supabaseAdmin, loc.id, businessDate, totalCents, source, customerCount);
              inserted += 1;
            }
          } catch (e) {
            errors.push({
              location_id: loc.id,
              business_date: `${chunk[0]}..${chunk[chunk.length - 1]}`,
              message: (e as Error).message,
            });
          }
        }
        continue;
      }

      for (const businessDate of dateList) {

        processed += 1;
        if (have.has(`${loc.id}|${businessDate}`)) continue;
        try {
          const { totalCents, customerCount } = await squareDayTotal(
            loc.square_access_token,
            loc.square_location_id,
            businessDate
          );
          await upsertDailySales(supabaseAdmin, loc.id, businessDate, totalCents, source, customerCount);
          inserted += 1;
        } catch (e) {
          errors.push({
            location_id: loc.id,
            business_date: businessDate,
            message: (e as Error).message,
          });
        }
      }
    }

    return { ok: true, days, processed, inserted, errors };
  });

export const clearSyncErrors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { source: "square" | "toast" }) =>
    z.object({ source: z.enum(["square", "toast"]) }).parse(input)
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error, count } = await supabaseAdmin
      .from("pos_sync_log")
      .delete({ count: "exact" })
      .eq("source", data.source)
      .eq("status", "error");
    if (error) throw new Error(error.message);
    return { deleted: count ?? 0 };
  });



