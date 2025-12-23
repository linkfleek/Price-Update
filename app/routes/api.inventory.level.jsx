import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";

const GET_LEVEL = `#graphql
  query GetInventoryLevel($inventoryItemId: ID!, $locationId: ID!) {
    inventoryItem(id: $inventoryItemId) {
      id
      inventoryLevel(locationId: $locationId) {
        quantities(names: ["available"]) {
          name
          quantity
        }
      }
    }
  }
`;

export async function action({ request }) {
  console.log("[inventory.level] HIT");

  try {
    if (request.method !== "POST") {
      return json({ ok: false, error: "Only POST allowed" }, { status: 405 });
    }

    const { admin } = await authenticate.admin(request);

    const body = await request.json();
    console.log("[inventory.level] body =", body);

    const { inventoryItemId, locationId } = body;

    if (!inventoryItemId || !locationId) {
      return json(
        { ok: false, error: "inventoryItemId and locationId required" },
        { status: 400 }
      );
    }

    const resp = await admin.graphql(GET_LEVEL, {
      variables: { inventoryItemId, locationId },
    });

    const data = await resp.json();
    console.log("[inventory.level] graphql =", JSON.stringify(data));

    const level = data?.data?.inventoryItem?.inventoryLevel;
    const qtyObj = level?.quantities?.find((q) => q.name === "available");

    return json({
      ok: true,
      available: qtyObj ? Number(qtyObj.quantity) : 0,
    });
  } catch (e) {
    console.error("[inventory.level] ERROR", e);
    return json(
      { ok: false, error: "Server error", details: String(e?.message || e) },
      { status: 500 }
    );
  }
}
