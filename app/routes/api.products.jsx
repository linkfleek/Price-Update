import { authenticate } from "../shopify.server";

const GET_PRODUCTS = `#graphql
{
  products(first: 50) {
    edges {
      node {
        id
        title
        handle
        status
        totalInventory

        # ✅ Needed to detect if variants are created or not (refresh persistence)
        hasOnlyDefaultVariant

        # ✅ Needed to detect if "Type" option exists (refresh persistence)
        options {
          name
          values
        }

        images(first: 1) {
          nodes { url altText }
        }

        productCategory {
          productTaxonomyNode { fullName }
        }
      }
    }
  }
}
`;

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(GET_PRODUCTS);
  const result = await response.json();

  if (result?.errors?.length) {
    return jsonResponse(
      { ok: false, message: result.errors[0]?.message || "Failed to load products" },
      500
    );
  }

  const products = (result?.data?.products?.edges || []).map(({ node }) => node);

  return jsonResponse({ ok: true, products });
}
