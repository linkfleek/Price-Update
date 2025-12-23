import prisma from "../db.server";
import { authenticate } from "../shopify.server";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function action({ request }) {
  console.log("🔵 [CREATE] Schedule API called");

  try {
    const { session } = await authenticate.admin(request);
    console.log("🟢 Authenticated shop:", session?.shop);

    if (request.method !== "POST") {
      console.log("🔴 Invalid method:", request.method);
      return jsonResponse({ ok: false, error: "Only POST allowed" }, 405);
    }

    const body = await request.json().catch(() => null);
    console.log("📦 Request body:", body);

    if (!body) {
      console.log("🔴 Invalid JSON body");
      return jsonResponse({ ok: false, error: "Invalid JSON" }, 400);
    }

    const schedule = body?.schedule;
    console.log("⏰ Schedule object:", schedule);

    if (!schedule || schedule.changeMode !== "later" || !schedule.runAtIso) {
      console.log("🔴 Schedule validation failed");
      return jsonResponse(
        { ok: false, error: "Schedule details missing" },
        400
      );
    }

    const items = Array.isArray(body?.items) ? body.items : [];
    console.log("📦 Items count:", items.length);
    console.log("📦 Items sample:", items[0]);

    const itemsValid =
      items.length > 0 &&
      items.every(
        (i) =>
          i?.variantId &&
          i?.newPrice !== undefined &&
          i?.newPrice !== null
      );

    if (!itemsValid) {
      console.log("🔴 Items validation failed");
      return jsonResponse(
        { ok: false, error: "items required (variantId + newPrice)" },
        400
      );
    }

    const runAt = new Date(schedule.runAtIso);
    console.log("⏰ Parsed runAt (UTC):", runAt.toISOString());

    if (Number.isNaN(runAt.getTime())) {
      console.log("🔴 Invalid runAtIso:", schedule.runAtIso);
      return jsonResponse({ ok: false, error: "Invalid runAtIso" }, 400);
    }

    const revertAt =
      schedule.revertEnabled && schedule.revertAtIso
        ? new Date(schedule.revertAtIso)
        : null;

    if (revertAt) {
      console.log("⏪ Parsed revertAt (UTC):", revertAt.toISOString());
      if (Number.isNaN(revertAt.getTime())) {
        console.log("🔴 Invalid revertAtIso:", schedule.revertAtIso);
        return jsonResponse(
          { ok: false, error: "Invalid revertAtIso" },
          400
        );
      }
    }

    console.log("💾 Creating PriceSchedule record…");

    const row = await prisma.priceSchedule.create({
      data: {
        shop: session.shop,
        runAt,
        revertAt,
        status: "PENDING",
        payload: body,
      },
    });

    console.log("✅ Schedule created:", row.id);

    return jsonResponse({ ok: true, scheduleId: row.id }, 200);
  } catch (e) {
    console.error("🔥 CREATE SCHEDULE ERROR:", e);

    return jsonResponse(
      {
        ok: false,
        error: "Server error while creating schedule",
        details: String(e?.message || e),
      },
      500
    );
  }
}
