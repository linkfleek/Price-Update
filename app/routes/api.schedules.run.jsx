import prisma from "../db.server";
import { authenticate } from "../shopify.server";

/**
 * Runs pending schedules:
 * - Finds PENDING schedules where runAt <= now
 * - For each schedule, fetch products/variants
 * - Computes new price based on payload (percentage/fixed + rounding)
 * - Updates variant prices via Shopify Admin GraphQL
 */
const GET_PRODUCT_VARIANTS = `#graphql
  query GetProductVariants($id: ID!) {
    product(id: $id) {
      id
      variants(first: 100) {
        nodes {
          id
          price
          compareAtPrice
        }
      }
    }
  }
`;

const VARIANT_UPDATE = `#graphql
  mutation UpdateVariant($input: ProductVariantInput!) {
    productVariantUpdate(input: $input) {
      productVariant {
        id
        price
        compareAtPrice
      }
      userErrors { field message }
    }
  }
`;

function num(val, fallback = 0) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function roundPrice(value, rounding) {
  const v = num(value, 0);
  if (rounding === "none") return Number(v.toFixed(2));
  if (rounding === "nearest_whole") return Math.round(v);
  if (rounding === "down_whole") return Math.floor(v);
  if (rounding === "up_99") return Math.floor(v) + 0.99;
  return Number(v.toFixed(2));
}

function computeNewPrice(oldPrice, payload) {
  const { adjustType, amountType, percentage, fixedAmount, rounding } = payload;

  let next = num(oldPrice, 0);

  if (amountType === "percentage") {
    const pct = num(percentage, 0) / 100;
    const delta = next * pct;
    next = adjustType === "increase" ? next + delta : next - delta;
  } else {
    const amt = num(fixedAmount, 0);
    next = adjustType === "increase" ? next + amt : next - amt;
  }

  if (next < 0) next = 0;
  return roundPrice(next, rounding);
}

export async function action({ request }) {
  const { admin, session } = await authenticate.admin(request);

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Only POST allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const now = new Date();

  const due = await prisma.priceSchedule.findMany({
    where: {
      shop: session.shop,
      status: "PENDING",
      runAt: { lte: now },
    },
    orderBy: { runAt: "asc" },
    take: 10,
  });

  const results = [];

  for (const s of due) {
    try {
      // lock schedule
      await prisma.priceSchedule.update({
        where: { id: s.id },
        data: { status: "RUNNING", error: null },
      });

      const payload = s.payload || {};
      const productIds = Array.isArray(payload.productIds) ? payload.productIds : [];

      if (!productIds.length) throw new Error("No productIds in payload");

      // Update each product's variants
      for (const pid of productIds) {
        const gid = String(pid).startsWith("gid://") ? String(pid) : `gid://shopify/Product/${pid}`;

        const prodRes = await admin.graphql(GET_PRODUCT_VARIANTS, { variables: { id: gid } });
        const prodJson = await prodRes.json();
        const variants = prodJson?.data?.product?.variants?.nodes || [];

        for (const v of variants) {
          const oldPrice = num(v.price, 0);
          const newPrice = computeNewPrice(oldPrice, payload);

          const upRes = await admin.graphql(VARIANT_UPDATE, {
            variables: { input: { id: v.id, price: String(newPrice) } },
          });
          const upJson = await upRes.json();
          const errs = upJson?.data?.productVariantUpdate?.userErrors || [];
          if (errs.length) {
            throw new Error(`Variant update error: ${errs.map(e => e.message).join(", ")}`);
          }
        }
      }

      await prisma.priceSchedule.update({
        where: { id: s.id },
        data: { status: "DONE" },
      });

      results.push({ id: s.id, ok: true });
    } catch (e) {
      await prisma.priceSchedule.update({
        where: { id: s.id },
        data: { status: "FAILED", error: String(e?.message || e) },
      });
      results.push({ id: s.id, ok: false, error: String(e?.message || e) });
    }
  }

  return new Response(JSON.stringify({ ok: true, now, processed: results }), {
    headers: { "Content-Type": "application/json" },
  });
}
