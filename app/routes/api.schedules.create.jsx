import prisma from "../db.server";
import { authenticate } from "../shopify.server";

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function toProductGid(rawId) {
  if (!rawId) return "";
  return String(rawId).startsWith("gid://")
    ? String(rawId)
    : `gid://shopify/Product/${String(rawId)}`;
}

function toVariantGid(rawId) {
  if (!rawId) return "";
  return String(rawId).startsWith("gid://")
    ? String(rawId)
    : `gid://shopify/ProductVariant/${String(rawId)}`;
}

const GET_VARIANT_PRODUCT = `#graphql
  query VariantProduct($id: ID!) {
    productVariant(id: $id) {
      id
      product {
        id
      }
    }
  }
`;

async function resolveProductIdForVariant(admin, variantId) {
  const vGid = toVariantGid(variantId);

  const res = await admin.graphql(GET_VARIANT_PRODUCT, {
    variables: { id: vGid },
  });

  const json = await res.json();
  if (json?.errors?.length) {
    throw new Error(json.errors.map((e) => e.message).join(", "));
  }

  const pid = json?.data?.productVariant?.product?.id;
  if (!pid) throw new Error(`Unable to resolve productId for variant ${vGid}`);

  return pid; 
}

export async function action({ request }) {
  try {
    const { admin, session } = await authenticate.admin(request);
    if (request.method !== "POST") {
      return jsonResponse({ ok: false, error: "Only POST allowed" }, 405);
    }
    const body = await request.json().catch(() => null);

    if (!body) {
      return jsonResponse({ ok: false, error: "Invalid JSON" }, 400);
    }

    const schedule = body?.schedule;
    if (!schedule || schedule.changeMode !== "later" || !schedule.runAtIso) {
      return jsonResponse({ ok: false, error: "Schedule details missing" }, 400);
    }

    const items = Array.isArray(body?.items) ? body.items : [];
    const itemsValid =
      items.length > 0 &&
      items.every(
        (i) => i?.variantId && i?.newPrice !== undefined && i?.newPrice !== null
      );

    if (!itemsValid) {
      return jsonResponse(
        { ok: false, error: "items required (variantId + newPrice)" },
        400
      );
    }

    const productIds = Array.isArray(body?.productIds) ? body.productIds : [];
    const fallbackProductId = productIds?.length === 1 ? toProductGid(productIds[0]) : null;

    const variantToProductCache = new Map();

    body.items = await Promise.all(
      items.map(async (it) => {
        if (it.productId) {
          return { ...it, productId: toProductGid(it.productId), variantId: toVariantGid(it.variantId) };
        }

        if (fallbackProductId) {
          return { ...it, productId: fallbackProductId, variantId: toVariantGid(it.variantId) };
        }

        const vGid = toVariantGid(it.variantId);

        let pid = variantToProductCache.get(vGid);
        if (!pid) {
          pid = await resolveProductIdForVariant(admin, vGid);
          variantToProductCache.set(vGid, pid);
        }

        return { ...it, productId: pid, variantId: vGid };
      })
    );

    const runAt = new Date(schedule.runAtIso);

    if (Number.isNaN(runAt.getTime())) {
      return jsonResponse({ ok: false, error: "Invalid runAtIso" }, 400);
    }

    const revertAt =
      schedule.revertEnabled && schedule.revertAtIso
        ? new Date(schedule.revertAtIso)
        : null;

    if (revertAt) {
      if (Number.isNaN(revertAt.getTime())) {
        return jsonResponse({ ok: false, error: "Invalid revertAtIso" }, 400);
      }
    }
    const row = await prisma.priceSchedule.create({
      data: {
        shop: session.shop,
        runAt,
        revertAt,
        status: "PENDING",
        payload: body, 
      },
    });


    return jsonResponse({ ok: true, scheduleId: row.id }, 200);
  } catch (e) {

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
