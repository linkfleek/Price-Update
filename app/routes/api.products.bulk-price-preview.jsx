import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

const GET_PRODUCT_PREVIEW = `#graphql
  query GetProductPreview($id: ID!) {
    product(id: $id) {
      id
      title
      featuredImage {
        url
        altText
      }
      variants(first: 100) {
        nodes {
          id
          title
          price
          image {
            url
            altText
          }
        }
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

  // round up to .99
  if (rounding === "up_99") {
    const whole = Math.floor(v);
    return Number((whole + 0.99).toFixed(2));
  }

  return Number(v.toFixed(2));
}

function calcNewPrice({ oldPrice, adjustType, amountType, percentage, fixedAmount, rounding }) {
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
  if (!["increase", "decrease"].includes(adjustType)) return "Invalid adjustType";
  if (!["percentage", "fixed"].includes(amountType)) return "Invalid amountType";
  if (!["none", "nearest_whole", "down_whole", "up_99"].includes(rounding)) return "Invalid rounding";

  if (amountType === "percentage") {
    const pct = num(body?.percentage, NaN);
    if (!Number.isFinite(pct)) return "percentage is required";
    if (pct < 0 || pct > 100) return "percentage must be 0..100";
  }

  if (amountType === "fixed") {
    const amt = num(body?.fixedAmount, NaN);
    if (!Number.isFinite(amt)) return "fixedAmount is required";
    if (amt < 0) return "fixedAmount must be >= 0";
  }

  return null;
}

export async function action({ request }) {
  try {
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

    const { productIds, adjustType, amountType, percentage, fixedAmount, rounding } = body;

    const preview = [];

    for (const pid of productIds) {
      const productGid = toProductGid(pid);

      const qRes = await admin.graphql(GET_PRODUCT_PREVIEW, {
        variables: { id: productGid },
      });

      const qJson = await qRes.json();
      const product = qJson?.data?.product;

      if (!product) {
        preview.push({ productId: pid, title: "(Product not found)", image: null, variants: [] });
        continue;
      }

      const productImage = product?.featuredImage
        ? { url: product.featuredImage.url, altText: product.featuredImage.altText || product.title }
        : null;

      const variants = product?.variants?.nodes || [];

      preview.push({
        productId: pid,
        title: product.title,
        image: productImage,
        variants: variants.map((v) => {
          const variantImage = v?.image
            ? { url: v.image.url, altText: v.image.altText || `${product.title} - ${v.title}` }
            : null;

          return {
            variantId: v.id,
            variantTitle: v.title,
            image: variantImage, // may be null
            oldPrice: num(v.price, 0),
            newPrice: calcNewPrice({
              oldPrice: v.price,
              adjustType,
              amountType,
              percentage,
              fixedAmount,
              rounding,
            }),
          };
        }),
      });
    }

    return json({ ok: true, preview });
  } catch (e) {
    return json({ ok: false, message: e?.message || "Preview API server error" }, { status: 500 });
  }
}
