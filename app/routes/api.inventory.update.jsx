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

  const inventoryItemId = body?.inventoryItemId;
  const locationId = body?.locationId;
  const quantity = body?.quantity;

  if (!inventoryItemId || !locationId || quantity == null) {
    return new Response(
      JSON.stringify({ ok: false, error: "inventoryItemId, locationId, quantity required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const resp = await admin.graphql(MUTATION, {
    variables: {
      input: {
        name: "available",
        reason: "correction",
        ignoreCompareQuantity: true,
        quantities: [
          {
            inventoryItemId,
            locationId,
            quantity: Number(quantity),
          },
        ],
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

  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json" },
  });
}
