import { useMemo, useState, useCallback } from "react";
import {
  Page,
  Card,
  Box,
  Text,
  InlineStack,
  BlockStack,
  Button,
  Badge,
  Divider,
  ChoiceList,
  List,
  Banner,
  InlineGrid,
} from "@shopify/polaris";

const PLANS = [
  {
    key: "free",
    name: "Free",
    tagline: "For trying Bulk-Edit",
    priceMonthly: 0,
    priceAnnual: 0,
    features: [
      "Bulk price preview",
      "Basic bulk updates",
      "Up to 50 variants per action",
      "Community support",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    tagline: "For growing stores",
    priceMonthly: 19,
    priceAnnual: 190,
    features: [
      "Everything in Free",
      "Schedule price updates",
      "Bulk edit up to 5,000 variants",
      "Priority support",
    ],
    highlight: true,
  },
  {
    key: "enterprise",
    name: "Enterprise",
    tagline: "For high-volume teams",
    priceMonthly: 49,
    priceAnnual: 490,
    features: [
      "Everything in Pro",
      "Unlimited bulk actions",
      "Multi-user access",
      "Dedicated onboarding",
    ],
  },
];

function money(amount) {
  return amount === 0 ? "Free" : `$${amount}`;
}

export default function SubscriptionPricingPage() {
  
  const [currentPlanKey, setCurrentPlanKey] = useState("free");
  const [billingCycle, setBillingCycle] = useState("monthly");

  const [busyPlanKey, setBusyPlanKey] = useState(null);
  const [banner, setBanner] = useState(null);

  const plans = useMemo(() => {
    return PLANS.map((p) => {
      const price = billingCycle === "annual" ? p.priceAnnual : p.priceMonthly;
      return { ...p, displayPrice: price };
    });
  }, [billingCycle]);

  const onSelectPlan = useCallback(
    async (planKey) => {
      setBusyPlanKey(planKey);
      setBanner(null);

      try {

        await new Promise((r) => setTimeout(r, 500));
        setCurrentPlanKey(planKey);

        setBanner({
          tone: "success",
          title: "Plan updated",
          message: `Your plan is now ${planKey.toUpperCase()} (${billingCycle}).`,
        });
      } catch (e) {
        setBanner({
          tone: "critical",
          title: "Subscription failed",
          message: e?.message || "Something went wrong.",
        });
      } finally {
        setBusyPlanKey(null);
      }
    },
    [billingCycle]
  );

  return (
    <Page
      title="Plans & pricing"
      subtitle="Choose a subscription that fits your store"
      backAction={{ content: "Back", onAction: () => window.history.back() }}
    >
      {banner ? (
        <Box paddingBlockEnd="300">
          <Banner tone={banner.tone} title={banner.title}>
            <p>{banner.message}</p>
          </Banner>
        </Box>
      ) : null}

      <Card>
        <Box padding="400">
          <InlineStack align="space-between" blockAlign="center">
            <BlockStack gap="100">
              <Text as="h2" variant="headingMd">
                Billing cycle
              </Text>
              <Text tone="subdued">Switch monthly or annual billing.</Text>
            </BlockStack>

            <ChoiceList
              title=""
              titleHidden
              choices={[
                { label: "Monthly", value: "monthly" },
                { label: "Annual", value: "annual" },
              ]}
              selected={[billingCycle]}
              onChange={(v) => setBillingCycle(v[0])}
            />
          </InlineStack>
        </Box>
      </Card>

      <Box paddingBlockStart="400" />

      <InlineGrid
        columns={{ xs: 1, sm: 2, md: 3, lg: 3, xl: 3 }}
        gap="400"
      >
        {plans.map((p) => {
          const isCurrent = p.key === currentPlanKey;

          const priceLabel =
            p.displayPrice === 0
              ? "Free"
              : billingCycle === "annual"
              ? `${money(p.displayPrice)}/yr`
              : `${money(p.displayPrice)}/mo`;

          const ctaLabel = isCurrent ? "Current plan" : "Choose plan";

          return (
            <Card key={p.key}>
              <Box padding="400">
                <BlockStack gap="300">
                  <InlineStack align="space-between" blockAlign="center">
                    <Text as="h3" variant="headingMd">
                      {p.name}
                    </Text>

                    {isCurrent ? (
                      <Badge tone="success">Current</Badge>
                    ) : p.highlight ? (
                      <Badge tone="attention">Popular</Badge>
                    ) : null}
                  </InlineStack>

                  <Text tone="subdued">{p.tagline}</Text>

                  <Divider />

                  <BlockStack gap="100">
                    <Text as="p" variant="headingLg">
                      {priceLabel}
                    </Text>
                    <Text tone="subdued">Cancel anytime.</Text>
                  </BlockStack>

                  <Divider />

                  <List type="bullet">
                    {p.features.map((f) => (
                      <List.Item key={f}>{f}</List.Item>
                    ))}
                  </List>

                  <Divider />

                  <Button
                    fullWidth
                    variant={isCurrent ? "secondary" : p.highlight ? "primary" : "primary"}
                    disabled={isCurrent || busyPlanKey !== null}
                    loading={busyPlanKey === p.key}
                    onClick={() => onSelectPlan(p.key)}
                  >
                    {ctaLabel}
                  </Button>

                  {p.key === "enterprise" ? (
                    <Button
                      fullWidth
                      variant="secondary"
                      onClick={() =>
                        setBanner({
                          tone: "info",
                          title: "Contact sales",
                          message: "Add your contact flow here.",
                        })
                      }
                    >
                      Contact sales
                    </Button>
                  ) : null}
                </BlockStack>
              </Box>
            </Card>
          );
        })}
      </InlineGrid>

      <Box paddingBlockStart="400" />

      
      <Card>
        <Box padding="400">
          <InlineStack align="space-between" blockAlign="center">
            <Text tone="subdued">
              Current plan: <b>{currentPlanKey.toUpperCase()}</b>
            </Text>
            <Text tone="subdued">
              Billing: <b>{billingCycle.toUpperCase()}</b>
            </Text>
          </InlineStack>
        </Box>
      </Card>
    </Page>
  );
}
