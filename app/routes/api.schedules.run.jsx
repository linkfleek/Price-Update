import prisma from "../db.server";
import { authenticate } from "../shopify.server";


const PRODUCT_VARIANTS_BULK_UPDATE = `#graphql
  mutation ProductVariantsBulkUpdate(
    $productId: ID!,
    $variants: [ProductVariantsBulkInput!]!
  ) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
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

export async function action({ request }) {
  const { admin, session } = await authenticate.admin(request);

  if (request.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "Only POST allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  const now = new Date();

  const dueSchedules = await prisma.priceSchedule.findMany({
    where: {
      shop: session.shop,
      status: "PENDING",
      runAt: { lte: now },
    },
    orderBy: { runAt: "asc" },
    take: 10,
  });

  const results = [];

  for (const s of dueSchedules) {
    try {
      await prisma.priceSchedule.update({
        where: { id: s.id },
        data: { status: "RUNNING", error: null },
      });

      const payload = s.payload || {};
      const items = Array.isArray(payload.items) ? payload.items : [];

      if (!items.length) {
        throw new Error("No items found in schedule payload");
      }

      const grouped = new Map(); 

      for (const it of items) {
        const productId = it.productId || it.productGid || it.pid; 
        const variantId = it.variantId;
        const newPrice = it.newPrice;

        if (!productId) throw new Error("Item missing productId");
        if (!variantId) throw new Error("Item missing variantId");
        if (newPrice === undefined || newPrice === null || newPrice === "")
          throw new Error("Item missing newPrice");

        const pGid = toProductGid(productId);

        if (!grouped.has(pGid)) grouped.set(pGid, []);

        grouped.get(pGid).push({
          id: String(variantId),          
          price: String(newPrice),        
        });
      }

      
      for (const [productIdGid, variants] of grouped.entries()) {
        const res = await admin.graphql(PRODUCT_VARIANTS_BULK_UPDATE, {
          variables: {
            productId: productIdGid,
            variants,
          },
        });

        const json = await res.json();

       
        if (json?.errors?.length) {
          throw new Error(json.errors.map((e) => e.message).join(", "));
        }

        const userErrors = json?.data?.productVariantsBulkUpdate?.userErrors || [];
        if (userErrors.length) {
          throw new Error(userErrors.map((e) => e.message).join(", "));
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

      results.push({
        id: s.id,
        ok: false,
        error: String(e?.message || e),
      });
    }
  }

  return new Response(
    JSON.stringify(
      {
        ok: true,
        now: now.toISOString(),
        processed: results,
      },
      null,
      2
    ),
    {
      headers: { "Content-Type": "application/json" },
    }
  );
}
