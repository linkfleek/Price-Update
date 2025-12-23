import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider as ShopifyAppProvider } from "@shopify/shopify-app-react-router/react";
import { AppProvider as PolarisProvider } from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import { authenticate } from "../shopify.server";
import { useEffect } from "react";


export const loader = async ({ request }) => {
  await authenticate.admin(request);

  // eslint-disable-next-line no-undef
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData();
    useEffect(() => {
    const timer = setInterval(() => {
      fetch("/api/schedules/run", {
        method: "POST",
        credentials: "include",
      }).catch(() => {});
    }, 30000); // every 30 seconds

    return () => clearInterval(timer);
  }, []);

  return (
<ShopifyAppProvider embedded apiKey={apiKey}>
  <PolarisProvider i18n={enTranslations}>
    <s-app-nav>
      <s-link href="/app">Home</s-link>
      <s-link href="/app/products">Products</s-link>
      <s-link href="/app/inventory">Inventory</s-link> 
    </s-app-nav>
    <Outlet />
  </PolarisProvider>
</ShopifyAppProvider>

  );
}

// Shopify needs React Router to catch some thrown responses, so that their headers are included in the response.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
