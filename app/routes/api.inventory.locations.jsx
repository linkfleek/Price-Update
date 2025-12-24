import { authenticate } from "../shopify.server";

export async function loader({ request }) {
  const { admin } = await authenticate.admin(request);

  try {
    const res = await admin.graphql(`
      query {
        locations(first: 50) {
          nodes {
            id
            name
            isActive
          }
        }
      }
    `);

    const json = await res.json();

    const locations = json?.data?.locations?.nodes || [];

    return new Response(
      JSON.stringify({ ok: true, locations }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: "Failed to load locations" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
