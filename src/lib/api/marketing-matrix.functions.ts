import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const SQUARE_BASE = "https://connect.squareup.com";
const TOAST_BASE = "https://ws-api.toasttab.com";

type MenuItem = { id: string; name: string };

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs = 15_000): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function loadLocation(locationId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("locations")
    .select(
      "id,name,pos_provider,square_location_id,square_access_token,toast_restaurant_guid,toast_client_id,toast_client_secret,toast_api_url"
    )
    .eq("id", locationId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Location not found");
  return data as any;
}

function inferProvider(loc: any): "square" | "toast" {
  if (loc.pos_provider === "square" || loc.pos_provider === "toast") return loc.pos_provider;
  if (loc.square_location_id && loc.square_access_token) return "square";
  if (loc.toast_restaurant_guid && loc.toast_client_id && loc.toast_client_secret) return "toast";
  throw new Error("Location has no POS credentials configured");
}

// ---------------- Toast auth ----------------
async function toastAuth(base: string, clientId: string, clientSecret: string): Promise<string> {
  const res = await fetchWithTimeout(
    `${base}/authentication/v1/authentication/login`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, clientSecret, userAccessType: "TOAST_MACHINE_CLIENT" }),
    },
    8_000
  );
  if (!res.ok) throw new Error(`Toast auth ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = (await res.json()) as { token?: { accessToken?: string } };
  if (!j.token?.accessToken) throw new Error("Toast auth: missing token");
  return j.token.accessToken;
}

// ---------------- Menu / Catalog ----------------
async function squareMenu(accessToken: string): Promise<MenuItem[]> {
  const items: MenuItem[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 20; i++) {
    const url = new URL(`${SQUARE_BASE}/v2/catalog/list`);
    url.searchParams.set("types", "ITEM");
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetchWithTimeout(url.toString(), {
      headers: {
        "Square-Version": "2024-09-19",
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!res.ok) throw new Error(`Square catalog ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = (await res.json()) as { objects?: Array<{ id: string; item_data?: { name?: string } }>; cursor?: string };
    for (const o of j.objects ?? []) {
      const name = o.item_data?.name;
      if (name) items.push({ id: o.id, name });
    }
    cursor = j.cursor;
    if (!cursor) break;
  }
  items.sort((a, b) => a.name.localeCompare(b.name));
  return items;
}

async function toastMenu(base: string, token: string, guid: string): Promise<MenuItem[]> {
  const headers = {
    Authorization: `Bearer ${token}`,
    "Toast-Restaurant-External-ID": guid,
  };

  // 1) Try published menus (requires menus.read scope)
  try {
    const res = await fetchWithTimeout(`${base}/menus/v2/menus`, { headers });
    if (res.ok) {
      const j = (await res.json()) as any;
      const items = new Map<string, string>();
      const walk = (node: any) => {
        if (!node) return;
        if (Array.isArray(node)) return node.forEach(walk);
        if (typeof node === "object") {
          if (
            typeof node.guid === "string" &&
            typeof node.name === "string" &&
            (node.price !== undefined || node.itemGroupGuid !== undefined)
          ) {
            items.set(node.guid, node.name);
          }
          for (const k of Object.keys(node)) walk(node[k]);
        }
      };
      walk(j);
      if (items.size > 0) {
        return [...items.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
      }
    }
  } catch {
    // fall through
  }

  // 2) Try config menuItems (requires config:read)
  try {
    const out: MenuItem[] = [];
    for (let page = 1; page <= 20; page++) {
      const res = await fetchWithTimeout(
        `${base}/config/v2/menuItems?pageSize=200&page=${page}`,
        { headers }
      );
      if (!res.ok) break;
      const arr = (await res.json()) as Array<{ guid?: string; name?: string }>;
      if (!Array.isArray(arr) || arr.length === 0) break;
      for (const it of arr) {
        if (it.guid && it.name) out.push({ id: it.guid, name: it.name });
      }
      if (arr.length < 200) break;
    }
    if (out.length > 0) {
      return out.sort((a, b) => a.name.localeCompare(b.name));
    }
  } catch {
    // fall through
  }

  // 3) Fallback: derive distinct items from recent orders (last 14 days)
  const seen = new Map<string, string>();
  const today = new Date();
  for (let i = 1; i <= 14; i++) {
    const d = new Date(today);
    d.setUTCDate(d.getUTCDate() - i);
    const compact = d.toISOString().slice(0, 10).replace(/-/g, "");
    try {
      for (let page = 1; page < 10; page++) {
        const res = await fetchWithTimeout(
          `${base}/orders/v2/ordersBulk?businessDate=${compact}&page=${page}&pageSize=100`,
          { headers }
        );
        if (!res.ok) break;
        const orders = (await res.json()) as Array<{
          checks?: Array<{ selections?: Array<{ item?: { guid?: string }; displayName?: string }> }>;
        }>;
        if (!orders || orders.length === 0) break;
        for (const o of orders) {
          for (const c of o.checks ?? []) {
            for (const s of c.selections ?? []) {
              const id = s.item?.guid;
              const name = s.displayName;
              if (id && name && !seen.has(id)) seen.set(id, name);
            }
          }
        }
        if (orders.length < 100) break;
      }
    } catch {
      // continue to next day
    }
    if (seen.size > 500) break;
  }
  // No source available — caller will enable manual entry.
  return [];
}

export const getPosMenu = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ location_id: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const loc = await loadLocation(data.location_id);
    const provider = inferProvider(loc);
    if (provider === "square") {
      try {
        const items = await squareMenu(loc.square_access_token);
        return { provider, items, manual_required: items.length === 0 };
      } catch {
        return { provider, items: [] as MenuItem[], manual_required: true };
      }
    }
    const base = (loc.toast_api_url || TOAST_BASE).replace(/\/+$/, "");
    try {
      const tok = await toastAuth(base, loc.toast_client_id, loc.toast_client_secret);
      let items = await toastMenu(base, tok, loc.toast_restaurant_guid);
      if (items.length === 0) {
        // Analytics-API fallback (same endpoint the sync uses): /era/v1/menu/day
        const seen = new Map<string, { id: string; name: string }>();
        const today = new Date();
        let lastErr = "";
        for (let i = 1; i <= 14 && seen.size < 1000; i++) {
          const d = new Date(today);
          d.setUTCDate(d.getUTCDate() - i);
          const compact = Number(d.toISOString().slice(0, 10).replace(/-/g, ""));
          try {
            const createRes = await fetchWithTimeout(
              `${base}/era/v1/menu/day`,
              {
                method: "POST",
                headers: { Authorization: `Bearer ${tok}`, "Content-Type": "application/json" },
                body: JSON.stringify({
                  startBusinessDate: compact,
                  endBusinessDate: compact,
                  restaurantIds: [loc.toast_restaurant_guid],
                  excludedRestaurantIds: [],
                  groupBy: ["MENU_ITEM"],
                }),
              },
              8_000
            );
            if (!createRes.ok) {
              lastErr = `create ${createRes.status}: ${(await createRes.text()).slice(0, 200)}`;
              continue;
            }
            const raw = await createRes.text();
            let guid = "";
            try {
              const p = JSON.parse(raw);
              guid = typeof p === "string" ? p : (p?.reportRequestGuid ?? "");
            } catch {
              guid = raw.replace(/^"|"$/g, "");
            }
            if (!guid) continue;
            const deadline = Date.now() + 12_000;
            while (Date.now() < deadline) {
              const r = await fetchWithTimeout(
                `${base}/era/v1/menu/${guid}`,
                { headers: { Authorization: `Bearer ${tok}` } },
                8_000
              );
              if (r.status === 200) {
                const body = await r.json();
                const rows: any[] = Array.isArray(body) ? body : Array.isArray((body as any)?.data) ? (body as any).data : [];
                for (const row of rows) {
                  const id = String(row?.menuItemGuid ?? row?.menuItemId ?? "").trim();
                  const name = String(row?.menuItemName ?? "").trim();
                  if (id && name && !seen.has(id)) seen.set(id, { id, name });
                }
                break;
              }
              if (r.status !== 202 && r.status !== 204) {
                lastErr = `poll ${r.status}: ${(await r.text()).slice(0, 200)}`;
                break;
              }
              await new Promise((res) => setTimeout(res, 1500));
            }
          } catch (e) {
            lastErr = (e as Error).message;
          }
        }
        items = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
        if (items.length === 0) {
          return { provider, items, manual_required: false, error: `Analytics fallback returned no items. ${lastErr}` };
        }
      }
      return { provider, items, manual_required: false };
    } catch (e) {
      return { provider, items: [] as MenuItem[], manual_required: false, error: (e as Error).message };
    }
  });

// ---------------- Order fetching ----------------
type CheckRow = {
  business_date: string;
  total_cents: number;
  items: Array<{ id: string; name: string; qty: number; cents: number }>;
};

async function fetchSquareChecks(
  accessToken: string,
  locationId: string,
  startISO: string,
  endISO: string
): Promise<CheckRow[]> {
  const start = `${startISO}T00:00:00Z`;
  const end = `${endISO}T23:59:59Z`;
  const checks: CheckRow[] = [];
  let cursor: string | undefined;
  for (let page = 0; page < 200; page++) {
    const res = await fetchWithTimeout(`${SQUARE_BASE}/v2/orders/search`, {
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
    if (!res.ok) throw new Error(`Square orders ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = (await res.json()) as {
      orders?: Array<{
        closed_at?: string;
        created_at?: string;
        net_amounts?: { total_money?: { amount?: number } };
        total_money?: { amount?: number };
        line_items?: Array<{
          catalog_object_id?: string;
          name?: string;
          quantity?: string;
          base_price_money?: { amount?: number };
          total_money?: { amount?: number };
        }>;
      }>;
      cursor?: string;
    };
    for (const o of j.orders ?? []) {
      const ts = o.closed_at || o.created_at || "";
      const bd = ts.slice(0, 10) || startISO;
      const total = Number(o.net_amounts?.total_money?.amount ?? o.total_money?.amount ?? 0);
      const items = (o.line_items ?? []).map((li) => ({
        id: li.catalog_object_id || li.name || "unknown",
        name: li.name || "Unknown",
        qty: Number(li.quantity ?? 1) || 1,
        cents: Number(li.total_money?.amount ?? (Number(li.base_price_money?.amount ?? 0) * (Number(li.quantity ?? 1) || 1))) || 0,
      }));
      checks.push({ business_date: bd, total_cents: total, items });
    }
    cursor = j.cursor;
    if (!cursor) break;
  }
  return checks;
}

async function fetchToastChecks(
  base: string,
  token: string,
  guid: string,
  startISO: string,
  endISO: string
): Promise<CheckRow[]> {
  const checks: CheckRow[] = [];
  // iterate per day
  for (let d = new Date(`${startISO}T00:00:00Z`); d <= new Date(`${endISO}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    const compact = iso.replace(/-/g, "");
    for (let page = 1; page < 200; page++) {
      const url = `${base}/orders/v2/ordersBulk?businessDate=${compact}&page=${page}&pageSize=100`;
      const res = await fetchWithTimeout(url, {
        headers: {
          Authorization: `Bearer ${token}`,
          "Toast-Restaurant-External-ID": guid,
        },
      });
      if (!res.ok) throw new Error(`Toast orders ${res.status}: ${(await res.text()).slice(0, 200)}`);
      const orders = (await res.json()) as Array<{
        voided?: boolean;
        checks?: Array<{
          voided?: boolean;
          totalAmount?: number;
          selections?: Array<{
            voided?: boolean;
            quantity?: number;
            price?: number;
            displayName?: string;
            item?: { guid?: string };
          }>;
        }>;
      }>;
      if (!orders || orders.length === 0) break;
      for (const o of orders) {
        if (o.voided) continue;
        for (const c of o.checks ?? []) {
          if (c.voided) continue;
          const items = (c.selections ?? [])
            .filter((s) => !s.voided)
            .map((s) => ({
              id: s.item?.guid || s.displayName || "unknown",
              name: s.displayName || "Unknown",
              qty: Number(s.quantity ?? 1) || 1,
              cents: Math.round(Number(s.price ?? 0) * 100),
            }));
          checks.push({
            business_date: iso,
            total_cents: Math.round(Number(c.totalAmount ?? 0) * 100),
            items,
          });
        }
      }
      if (orders.length < 100) break;
    }
  }
  return checks;
}

// ---------------- Analysis ----------------
type WindowResult = {
  start_date: string;
  end_date: string;
  check_count: number;
  checks_with_item: number;
  units_sold: number;
  attach_rate: number; // %
  avg_check_with: number; // dollars
  avg_check_without: number; // dollars
  addon_revenue: number; // dollars (sum of non-marketed item totals on marketed checks)
  daily: Array<{ date: string; units: number }>;
  co_items: Array<{ id: string; name: string; checks: number; units: number; attach_rate: number }>;
};

function analyze(checks: CheckRow[], itemId: string, itemName: string, startISO: string, endISO: string): WindowResult {
  const matchId = itemId.toLowerCase();
  const matchName = itemName.toLowerCase();
  const isMarketed = (it: { id: string; name: string }) =>
    it.id.toLowerCase() === matchId || it.name.toLowerCase() === matchName;

  let withCount = 0;
  let withSum = 0;
  let withoutCount = 0;
  let withoutSum = 0;
  let units = 0;
  let addonCents = 0;
  const dailyMap = new Map<string, number>();
  const coMap = new Map<string, { name: string; checks: number; units: number }>();

  for (const c of checks) {
    const marketedItems = c.items.filter(isMarketed);
    if (marketedItems.length > 0) {
      withCount += 1;
      withSum += c.total_cents;
      const u = marketedItems.reduce((a, it) => a + it.qty, 0);
      units += u;
      dailyMap.set(c.business_date, (dailyMap.get(c.business_date) ?? 0) + u);
      const seen = new Set<string>();
      for (const it of c.items) {
        if (isMarketed(it)) continue;
        addonCents += it.cents;
        const key = it.id;
        const existing = coMap.get(key) ?? { name: it.name, checks: 0, units: 0 };
        existing.units += it.qty;
        if (!seen.has(key)) {
          existing.checks += 1;
          seen.add(key);
        }
        coMap.set(key, existing);
      }
    } else {
      withoutCount += 1;
      withoutSum += c.total_cents;
    }
  }

  const totalChecks = withCount + withoutCount;
  // fill daily zeros
  const daily: Array<{ date: string; units: number }> = [];
  for (let d = new Date(`${startISO}T00:00:00Z`); d <= new Date(`${endISO}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    daily.push({ date: iso, units: dailyMap.get(iso) ?? 0 });
  }
  const co_items = [...coMap.entries()]
    .map(([id, v]) => ({
      id,
      name: v.name,
      checks: v.checks,
      units: v.units,
      attach_rate: withCount > 0 ? (v.checks / withCount) * 100 : 0,
    }))
    .sort((a, b) => b.checks - a.checks)
    .slice(0, 20);

  return {
    start_date: startISO,
    end_date: endISO,
    check_count: totalChecks,
    checks_with_item: withCount,
    units_sold: units,
    attach_rate: totalChecks > 0 ? (withCount / totalChecks) * 100 : 0,
    avg_check_with: withCount > 0 ? withSum / withCount / 100 : 0,
    avg_check_without: withoutCount > 0 ? withoutSum / withoutCount / 100 : 0,
    addon_revenue: addonCents / 100,
    daily,
    co_items,
  };
}

function shiftISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function isPermissionError(e: unknown): boolean {
  const m = (e as Error)?.message ?? "";
  return /\b40[13]\b/.test(m) || /not permitted/i.test(m) || /forbidden/i.test(m);
}

// ---------- Toast Analytics menu reporting (fallback when orders blocked) ----------
async function toastAnalyticsItemRows(
  base: string,
  token: string,
  guid: string,
  startISO: string,
  endISO: string
): Promise<Array<Record<string, any>>> {
  const startCompact = Number(startISO.replace(/-/g, ""));
  const endCompact = Number(endISO.replace(/-/g, ""));
  const groupByAttempts = [["MENU_ITEMS", "DAY"], ["MENU_ITEM", "DAY"], ["MENU_ITEMS"]];

  for (const groupBy of groupByAttempts) {
    try {
      const createRes = await fetchWithTimeout(`${base}/era/v1/metrics/week`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "Toast-Restaurant-External-ID": guid },
        body: JSON.stringify({
          startBusinessDate: startCompact,
          endBusinessDate: endCompact,
          restaurantIds: [guid],
          excludedRestaurantIds: [],
          groupBy,
        }),
      }, 15_000);
      if (!createRes.ok) continue;
      const createdRaw = await createRes.text();
      let reportRequestGuid = "";
      try {
        const parsed = JSON.parse(createdRaw);
        reportRequestGuid = typeof parsed === "string" ? parsed : parsed?.reportRequestGuid ?? "";
      } catch {
        reportRequestGuid = createdRaw.replace(/^"|"$/g, "");
      }
      if (!reportRequestGuid) continue;

      const deadline = Date.now() + 60_000;
      while (Date.now() < deadline) {
        const getRes = await fetchWithTimeout(`${base}/era/v1/metrics/${reportRequestGuid}`, {
          headers: { Authorization: `Bearer ${token}` },
        }, 15_000);
        if (getRes.status === 200) {
          const body = await getRes.json();
          if (Array.isArray(body)) return body as Array<Record<string, any>>;
          break;
        }
        if (getRes.status !== 202 && getRes.status !== 204) break;
        await new Promise((r) => setTimeout(r, 1500));
      }
    } catch {
      // try next groupBy
    }
  }
  return [];
}

function emptyWindow(startISO: string, endISO: string): WindowResult {
  const daily: Array<{ date: string; units: number }> = [];
  for (let d = new Date(`${startISO}T00:00:00Z`); d <= new Date(`${endISO}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    daily.push({ date: d.toISOString().slice(0, 10), units: 0 });
  }
  return {
    start_date: startISO,
    end_date: endISO,
    check_count: 0,
    checks_with_item: 0,
    units_sold: 0,
    attach_rate: 0,
    avg_check_with: 0,
    avg_check_without: 0,
    addon_revenue: 0,
    daily,
    co_items: [],
  };
}

function analyzeAnalyticsRows(
  rows: Array<Record<string, any>>,
  itemName: string,
  startISO: string,
  endISO: string
): WindowResult {
  const match = itemName.trim().toLowerCase();
  const w = emptyWindow(startISO, endISO);
  const dayIdx = new Map(w.daily.map((d, i) => [d.date, i]));

  for (const row of rows) {
    const name = String(
      row.menuItemName ?? row.menuItem ?? row.itemName ?? row.name ?? ""
    ).toLowerCase();
    if (!name || !name.includes(match)) continue;
    const qty = Number(row.itemQuantity ?? row.quantity ?? row.unitsSold ?? row.count ?? 0) || 0;
    const rev = Number(row.netSalesAmount ?? row.grossSalesAmount ?? row.sales ?? 0) || 0;
    w.units_sold += qty;
    w.addon_revenue += rev; // reused field to surface item revenue in analytics-only mode
    const rawDate = String(row.businessDate ?? row.date ?? "");
    const iso = /^\d{8}$/.test(rawDate)
      ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
      : rawDate.slice(0, 10);
    const idx = dayIdx.get(iso);
    if (idx !== undefined) w.daily[idx].units += qty;
  }
  return w;
}

export const runMarketBasketAnalysis = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        location_id: z.string().uuid(),
        item_id: z.string().min(1).max(256),
        item_name: z.string().min(1).max(256),
        start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
        end_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      })
      .parse(input)
  )
  .handler(async ({ data }) => {
    const span =
      Math.floor(
        (new Date(`${data.end_date}T00:00:00Z`).getTime() - new Date(`${data.start_date}T00:00:00Z`).getTime()) /
          86_400_000
      ) + 1;
    if (span < 1) throw new Error("end_date must be >= start_date");
    if (span > 45) throw new Error("Date range too large (max 45 days)");

    const loc = await loadLocation(data.location_id);
    const provider = inferProvider(loc);

    const prevStart = shiftISO(data.start_date, -364);
    const prevEnd = shiftISO(data.end_date, -364);

    if (provider === "square") {
      const currentChecks = await fetchSquareChecks(loc.square_access_token, loc.square_location_id, data.start_date, data.end_date);
      const priorChecks = await fetchSquareChecks(loc.square_access_token, loc.square_location_id, prevStart, prevEnd);
      return {
        provider,
        location_name: loc.name,
        item_id: data.item_id,
        item_name: data.item_name,
        analytics_only: false,
        notice: null as string | null,
        current: analyze(currentChecks, data.item_id, data.item_name, data.start_date, data.end_date),
        prior: analyze(priorChecks, data.item_id, data.item_name, prevStart, prevEnd),
      };
    }

    // Toast
    const base = (loc.toast_api_url || TOAST_BASE).replace(/\/+$/, "");
    const tok = await toastAuth(base, loc.toast_client_id, loc.toast_client_secret);
    try {
      const currentChecks = await fetchToastChecks(base, tok, loc.toast_restaurant_guid, data.start_date, data.end_date);
      const priorChecks = await fetchToastChecks(base, tok, loc.toast_restaurant_guid, prevStart, prevEnd);
      return {
        provider,
        location_name: loc.name,
        item_id: data.item_id,
        item_name: data.item_name,
        analytics_only: false,
        notice: null as string | null,
        current: analyze(currentChecks, data.item_id, data.item_name, data.start_date, data.end_date),
        prior: analyze(priorChecks, data.item_id, data.item_name, prevStart, prevEnd),
      };
    } catch (e) {
      if (!isPermissionError(e)) throw e;
      // Analytics-only fallback: units sold + revenue by menu item, no basket data.
      const [curRows, priorRows] = await Promise.all([
        toastAnalyticsItemRows(base, tok, loc.toast_restaurant_guid, data.start_date, data.end_date),
        toastAnalyticsItemRows(base, tok, loc.toast_restaurant_guid, prevStart, prevEnd),
      ]);
      const current = analyzeAnalyticsRows(curRows, data.item_name, data.start_date, data.end_date);
      const prior = analyzeAnalyticsRows(priorRows, data.item_name, prevStart, prevEnd);
      return {
        provider,
        location_name: loc.name,
        item_id: data.item_id,
        item_name: data.item_name,
        analytics_only: true,
        notice:
          "Toast credentials only have Analytics access. Showing units sold and item revenue from the Analytics Menu report. Co-purchase/attach-rate analysis requires the orders:read scope.",
        current,
        prior,
      };
    }
  });

export const listPosLocations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("locations")
      .select("id,name,pos_provider,square_location_id,toast_restaurant_guid")
      .order("name");
    if (error) throw new Error(error.message);
    return (data ?? [])
      .filter(
        (l: any) =>
          l.pos_provider === "square" ||
          l.pos_provider === "toast" ||
          l.square_location_id ||
          l.toast_restaurant_guid
      )
      .map((l: any) => ({
        id: l.id,
        name: l.name,
        provider: (l.pos_provider as "square" | "toast" | null) ?? (l.square_location_id ? "square" : "toast"),
      }));
  });
