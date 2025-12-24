import { useEffect,  useState } from "react";
import {
  Page,
  Card,
  Text,
  Badge,
  InlineStack,
  Box,
  Banner,
  IndexTable,
  Spinner,
} from "@shopify/polaris";


function badgeTone(status) {
  if (status === "DONE") return "success";
  if (status === "FAILED") return "critical";
  if (status === "RUNNING") return "attention";
  return "info";
}

function fmt(val) {
  if (!val) return "—";
  try {
    return new Date(val).toLocaleString();
  } catch {
    return String(val);
  }
}

export default function SchedulesListPage() {
  const [schedules, setSchedules] = useState([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function fetchSchedules() {
    setLoading(true);
    setErrorMsg("");

    try {
      const res = await fetch("/api/schedules/list?limit=50", {
        method: "GET",
        headers: { Accept: "application/json" },
      });

      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Failed to load schedules");

      setSchedules(Array.isArray(json.schedules) ? json.schedules : []);
    } catch (e) {
      setErrorMsg(String(e?.message || e));
      setSchedules([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchSchedules();
  }, []);

  return (
    <Page
      title="Schedule list"
      subtitle="Bulk price update schedules"
      backAction={{
        content: "Price update",
        onAction: () => window.history.back(),
      }}
      primaryAction={{
        content: "Refresh",
        onAction: fetchSchedules,
        loading,
      }}
    >
      {errorMsg ? (
        <Box paddingBlockEnd="300">
          <Banner tone="critical" title="Unable to load schedules">
            <p>{errorMsg}</p>
          </Banner>
        </Box>
      ) : null}

      <Card>
        <Box padding="0">
          {loading ? (
            <Box padding="400">
              <InlineStack gap="200" align="center">
                <Spinner size="small" />
                <Text as="span" tone="subdued">
                  Loading schedules…
                </Text>
              </InlineStack>
            </Box>
          ) : schedules.length === 0 ? (
            <Box padding="400">
              <Text tone="subdued">No schedules found.</Text>
            </Box>
          ) : (
            <IndexTable
              resourceName={{ singular: "schedule", plural: "schedules" }}
              itemCount={schedules.length}
              selectable={false} 
              headings={[
                { title: "Schedule ID" },
                { title: "Status" },
                { title: "Run at" },
                { title: "Created at" },
                { title: "Products" },
                { title: "Items" },
                { title: "Error" },
              ]}
            >
              {schedules.map((s, index) => (
                <IndexTable.Row
                  id={s.id}
                  key={s.id}
                  position={index}
                >
                  <IndexTable.Cell>
                    <Text as="span" variant="bodySm" fontWeight="medium">
                      {s.id}
                    </Text>
                  </IndexTable.Cell>

                  <IndexTable.Cell>
                    <Badge tone={badgeTone(s.status)}>
                      {s.status}
                    </Badge>
                  </IndexTable.Cell>

                  <IndexTable.Cell>
                    <Text as="span" tone="subdued">
                      {fmt(s.runAt)}
                    </Text>
                  </IndexTable.Cell>

                  <IndexTable.Cell>
                    <Text as="span" tone="subdued">
                      {fmt(s.createdAt)}
                    </Text>
                  </IndexTable.Cell>

                  <IndexTable.Cell>
                    {s.productCount ?? "—"}
                  </IndexTable.Cell>

                  <IndexTable.Cell>
                    {s.itemCount ?? "—"}
                  </IndexTable.Cell>

                  <IndexTable.Cell>
                    {s.error ? (
                      <Text tone="critical">{s.error}</Text>
                    ) : (
                      <Text tone="subdued">—</Text>
                    )}
                  </IndexTable.Cell>
                </IndexTable.Row>
              ))}
            </IndexTable>
          )}
        </Box>
      </Card>
    </Page>
  );
}
