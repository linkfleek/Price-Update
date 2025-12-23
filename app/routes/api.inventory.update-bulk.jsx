import { authenticate } from "../shopify.server";

const MUTATION = `#graphql
  mutation SetQty($input: InventorySetQuantitiesInput!) {
    inventorySetQuantities(input: $input) {
      inventoryAdjustmentGroup { id }
      userErrors { field message }
    }
  }
`;

export async function action({ request }) {
  const { admin } = await authenticate.admin(request);

  const body = await request.json().catch(() => null);
  const locationId = body?.locationId;
  const updates = Array.isArray(body?.updates) ? body.updates : [];

  if (!locationId || !updates.length) {
    return new Response(JSON.stringify({ ok: false, error: "locationId + updates[] required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const quantities = updates
    .filter((u) => u?.inventoryItemId && u?.quantity != null)
    .map((u) => ({
      inventoryItemId: u.inventoryItemId,
      locationId,
      quantity: Number(u.quantity),
    }));

  if (!quantities.length) {
    return new Response(JSON.stringify({ ok: false, error: "No valid updates" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const resp = await admin.graphql(MUTATION, {
    variables: {
      input: {
        name: "available",
        reason: "correction",
        ignoreCompareQuantity: true,
        quantities,
      },
    },
  });

  const json = await resp.json();
  const errs = json?.data?.inventorySetQuantities?.userErrors || [];

  if (errs.length) {
    return new Response(JSON.stringify({ ok: false, error: errs[0].message, errors: errs }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ ok: true, updated: quantities.length }), {
    headers: { "Content-Type": "application/json" },
  });
}
