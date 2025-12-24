import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

const GET_VARIANTS = `#graphql
  query GetProductVariants($id: ID!) {
    product(id: $id) {
      id
      title
      variants(first: 250) {
        nodes {
          id
          price
        }
      }
    }
  }
`;

const VARIANTS_BULK_UPDATE = `#graphql
  mutation VariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      product {
        id
      }
      productVariants {
        id
        price
      }
      userErrors {
        field
        message
      }
    }
  }
`;

function toProductGid(id) {
  if (!id) return "";
  return String(id).startsWith("gid://")
    ? String(id)
    : `gid://shopify/Product/${String(id)}`;
}

function num(val, fallback = 0) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function roundPrice(value, rounding) {
  const v = num(value, 0);

  if (rounding === "none") return Number(v.toFixed(2));

  if (rounding === "nearest_whole") return Math.round(v);

  if (rounding === "down_whole") return Math.floor(v);

  if (rounding === "up_99") {
    const whole = Math.floor(v);
    return Number((whole + 0.99).toFixed(2));
  }

  return Number(v.toFixed(2));
}

function calcNewPrice({
  oldPrice,
  adjustType,
  amountType,
  percentage,
  fixedAmount,
  rounding,
}) {
  const oldVal = num(oldPrice, 0);

  let next = oldVal;

  if (amountType === "percentage") {
    const pct = num(percentage, 0) / 100;
    next = adjustType === "increase" ? oldVal * (1 + pct) : oldVal * (1 - pct);
  } else {
    const amt = num(fixedAmount, 0);
    next = adjustType === "increase" ? oldVal + amt : oldVal - amt;
  }

  if (next < 0) next = 0;

  return roundPrice(next, rounding);
}

function validateBody(body) {
  const productIds = Array.isArray(body?.productIds) ? body.productIds : [];
  const adjustType = body?.adjustType;
  const amountType = body?.amountType;

  const rounding = body?.rounding || "none";

  if (!productIds.length) return "No products selected";
  if (adjustType !== "increase" && adjustType !== "decrease")
    return "Invalid adjustType (use increase/decrease)";
  if (amountType !== "percentage" && amountType !== "fixed")
    return "Invalid amountType (use percentage/fixed)";

  if (amountType === "percentage") {
    const pct = num(body?.percentage, NaN);
    if (!Number.isFinite(pct)) return "percentage is required";
    if (pct < 0 || pct > 100) return "percentage must be between 0 and 100";
  }

  if (amountType === "fixed") {
    const amt = num(body?.fixedAmount, NaN);
    if (!Number.isFinite(amt)) return "fixedAmount is required";
    if (amt < 0) return "fixedAmount must be >= 0";
  }

  const allowedRounding = new Set(["none", "nearest_whole", "down_whole", "up_99"]);
  if (!allowedRounding.has(rounding)) return "Invalid rounding option";

  return null;
}

export async function action({ request }) {
  if (request.method !== "POST") {
    return json({ ok: false, message: "Method not allowed" }, { status: 405 });
  }

  const { admin } = await authenticate.admin(request);

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, message: "Invalid JSON body" }, { status: 400 });
  }

  const err = validateBody(body);
  if (err) return json({ ok: false, message: err }, { status: 400 });

  const {
    productIds,
    adjustType,
    amountType,
    percentage,
    fixedAmount,
    rounding,
  } = body;

  const results = [];
  const errors = [];

  try {
    for (const pid of productIds) {
      const productGid = toProductGid(pid);

      const qRes = await admin.graphql(GET_VARIANTS, {
        variables: { id: productGid },
      });

      const qJson = await qRes.json();
      const product = qJson?.data?.product;

      if (!product) {
        errors.push({
          productId: pid,
          message: "Product not found",
        });
        continue;
      }

      const variants = product?.variants?.nodes || [];

      if (!variants.length) {
        results.push({
          productId: pid,
          ok: true,
          updated: 0,
          note: "No variants found",
        });
        continue;
      }

      const updates = variants.map((v) => {
        const newPrice = calcNewPrice({
          oldPrice: v.price,
          adjustType,
          amountType,
          percentage,
          fixedAmount,
          rounding,
        });

        return {
          id: v.id,
          price: String(newPrice),
        };
      });

      const mRes = await admin.graphql(VARIANTS_BULK_UPDATE, {
        variables: { productId: productGid, variants: updates },
      });

      const mJson = await mRes.json();
      const userErrors = mJson?.data?.productVariantsBulkUpdate?.userErrors || [];

      if (userErrors.length) {
        errors.push({
          productId: pid,
          message: userErrors[0]?.message || "Variant update failed",
          userErrors,
        });
        continue;
      }

      results.push({
        productId: pid,
        ok: true,
        updated: updates.length,
      });
    }

    return json({
      ok: errors.length === 0,
      results,
      errors,
      message:
        errors.length === 0
          ? "Bulk price adjustment completed."
          : "Bulk price adjustment completed with some errors.",
    });
  } catch (e) {
    return json(
      { ok: false, message: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
