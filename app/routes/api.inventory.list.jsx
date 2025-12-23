import { authenticate } from "../shopify.server";

const QUERY = `#graphql
  query InventoryProducts($first: Int!) {
    products(first: $first) {
      nodes {
        id
        title
        featuredImage { url altText }
        variants(first: 50) {
          nodes {
            id
            title
            sku
            inventoryItem { id }
          }
        }
      }
    }
  }
`;

export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);

  const resp = await admin.graphql(QUERY, { variables: { first: 50 } });
  const data = await resp.json();

  const products = data?.data?.products?.nodes || [];
  return new Response(JSON.stringify({ ok: true, products }), {
    headers: { "Content-Type": "application/json" },
  });
}
