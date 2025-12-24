import prisma from "../db.server";
import { authenticate } from "../shopify.server";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function loader({ request }) {
  try {
    const { session } = await authenticate.admin(request);

    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") || 20);
    const status = url.searchParams.get("status"); 

    const where = { shop: session.shop };
    if (status) where.status = status;

    const rows = await prisma.priceSchedule.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: Math.min(Math.max(limit, 1), 100),
      select: {
        id: true,
        createdAt: true,
        runAt: true,
        revertAt: true,
        status: true,
        error: true,
        payload: true,
      },
    });

    const schedules = rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      runAt: r.runAt,
      revertAt: r.revertAt,
      status: r.status,
      error: r.error,
      itemCount: Array.isArray(r.payload?.items) ? r.payload.items.length : 0,
      productCount: Array.isArray(r.payload?.productIds) ? r.payload.productIds.length : 0,
      changeMode: r.payload?.schedule?.changeMode || null,
    }));

    return jsonResponse({ ok: true, schedules });
  } catch (e) {
    return jsonResponse(
      { ok: false, error: "Failed to list schedules", details: String(e?.message || e) },
      500
    );
  }
}
