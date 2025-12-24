import { authenticate } from "../shopify.server";


const PRODUCT_UPDATE = `#graphql
  mutation UpdateProduct($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product {
        id
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

function toGid(rawId) {
  if (!rawId) return "";
  return String(rawId).startsWith("gid://")
    ? String(rawId)
    : `gid://shopify/Product/${rawId}`;
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function action({ request }) {
  const { admin } = await authenticate.admin(request);

  if (request.method !== "POST") {
    return jsonResponse({ ok: false, message: "Method Not Allowed" }, 405);
  }

  const body = await request.json().catch(() => ({}));

  const incomingIds = Array.isArray(body?.productIds)
    ? body.productIds
    : Array.isArray(body?.ids)
      ? body.ids
      : [];

  const status = body?.status;

  if (!incomingIds.length) {
    return jsonResponse({ ok: false, message: "No product ids provided" }, 400);
  }

  if (!["DRAFT", "ACTIVE", "ARCHIVED"].includes(status)) {
    return jsonResponse({ ok: false, message: "Invalid status" }, 400);
  }

  const results = [];
  const errors = [];

  for (const rawId of incomingIds) {
    const gid = toGid(rawId);

    try {
      const res = await admin.graphql(PRODUCT_UPDATE, {
        variables: {
          product: {
            id: gid,
            status,
          },
        },
      });

      const json = await res.json();

      if (json?.errors?.length) {
        errors.push({ id: rawId, error: json.errors?.[0]?.message || "GraphQL error" });
        continue;
      }

      const payload = json?.data?.productUpdate;
      const userErrors = payload?.userErrors || [];

      if (userErrors.length) {
        errors.push({
          id: rawId,
          error: userErrors.map((e) => e.message).join(", "),
        });
        continue;
      }

      results.push(payload?.product);
    } catch (e) {
      errors.push({ id: rawId, error: e?.message || "Failed" });
    }
  }

  if (errors.length) {
    return jsonResponse(
      {
        ok: false,
        message: "Status update failed",
        updated: results,
        errors,
      },
      200
    );
  }

  return jsonResponse({
    ok: true,
    message: "Status updated",
    updated: results,
    errors: [],
  });
}
