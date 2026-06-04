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
  source: "square" | "toast"
) {
  const { error } = await supabaseAdmin.from("daily_sales").upsert(
    { location_id, business_date, total_cents, source },
    { onConflict: "location_id,business_date" }
  );
  if (error) throw new Error(`daily_sales upsert: ${error.message}`);
}

// -----------------------------------------------------------------------------
// SQUARE
// -----------------------------------------------------------------------------
async function squareDayTotal(
  accessToken: string,
  locationId: string,
  businessDate: string
): Promise<number> {
  const start = `${businessDate}T00:00:00Z`;
  const end = `${businessDate}T23:59:59Z`;
  let cursor: string | undefined;
  let totalCents = 0;

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
    }
    cursor = json.cursor;
  } while (cursor);

  return totalCents;
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
        const total = await squareDayTotal(
          loc.square_access_token,
          loc.square_location_id,
          businessDate
        );
        r.total_cents = total;
        await upsertDailySales(supabaseAdmin, loc.id, businessDate, total, "square");
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

async function toastDayTotalWithBase(
  base: string,
  accessToken: string,
  restaurantGuid: string,
  businessDate: string
): Promise<number> {
  const compact = businessDate.replace(/-/g, "");
  let page = 1;
  let totalCents = 0;
  for (;;) {
    const url = `${base}/orders/v2/ordersBulk?businessDate=${compact}&page=${page}&pageSize=100`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Toast-Restaurant-External-ID": restaurantGuid,
      },
    });
    if (!res.ok) throw new Error(`Toast ${res.status}: ${(await res.text()).slice(0, 240)}`);
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

// keep older helpers referenced (suppress unused warnings)
void toastAccessToken;
void toastDayTotal;

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

    let q = supabaseAdmin
      .from("locations")
      .select("id,name,toast_restaurant_guid,toast_client_id,toast_client_secret,toast_api_url,toast_credential_name")
      .not("toast_restaurant_guid", "is", null)
      .not("toast_client_id", "is", null)
      .not("toast_client_secret", "is", null);
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
        const base = (loc.toast_api_url || TOAST_BASE).replace(/\/+$/, "");
        const token = await toastAccessTokenWithBase(base, loc.toast_client_id, loc.toast_client_secret);
        const total = await toastDayTotalWithBase(base, token, loc.toast_restaurant_guid, businessDate);
        r.total_cents = total;
        await upsertDailySales(supabaseAdmin, loc.id, businessDate, total, "toast");
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
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Returns flags only — never the secret values themselves.
export const getLocationsPosStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("locations")
      .select(
        "id,name,pos_provider,square_location_id,square_access_token,toast_credential_name,toast_api_url,toast_restaurant_guid,toast_client_id,toast_client_secret"
      )
      .order("name");
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
