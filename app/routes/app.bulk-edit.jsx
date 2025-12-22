
import { Thumbnail } from "@shopify/polaris";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import {
  Page,
  Card,
  Text,
  InlineStack,
  Box,
  Button,
  Banner,
  Select,
  TextField,
  ChoiceList,
  RangeSlider,
  Divider,
  Layout,
  Spinner,
  IndexTable,
} from "@shopify/polaris";


function money(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `$${v.toFixed(2)}`;
}

export default function BulkEditPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // ids from URL: ?ids=9197,123
  const idsParam = searchParams.get("ids") || "";
  const productIds = useMemo(() => {
    const raw = idsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return Array.from(new Set(raw));
  }, [idsParam]);

  // left form
  const [adjustType, setAdjustType] = useState("decrease"); // decrease | increase
  const [amountType, setAmountType] = useState("percentage"); // percentage | fixed
  const [percentage, setPercentage] = useState(25);
  const [fixedAmount, setFixedAmount] = useState("10");
  const [rounding, setRounding] = useState("none");

  // submit
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [tone, setTone] = useState("success");

  // preview (right side)
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewErr, setPreviewErr] = useState("");
  const [previewData, setPreviewData] = useState([]); // [{productId,title,variants:[...]}]
  const debounceRef = useRef(null);

  const helperText = useMemo(() => {
    if (amountType === "percentage") {
      return `${adjustType === "increase" ? "Increase" : "Decrease"} by ${percentage}%`;
    }
    return `${adjustType === "increase" ? "Increase" : "Decrease"} by $${fixedAmount || 0}`;
  }, [amountType, adjustType, percentage, fixedAmount]);

  // -------- Preview loader (debounced) --------
  useEffect(() => {
    if (!productIds.length) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      setPreviewBusy(true);
      setPreviewErr("");

      try {
        const res = await fetch("/api/products/bulk-price-preview", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            productIds,
            adjustType,
            amountType,
            percentage: amountType === "percentage" ? Number(percentage) : null,
            fixedAmount: amountType === "fixed" ? Number(fixedAmount || 0) : null,
            rounding,
          }),
        });

        const data = await res.json().catch(() => ({}));
        if (!res.ok || data?.ok === false) {
          throw new Error(data?.message || "Preview failed");
        }

        setPreviewData(Array.isArray(data.preview) ? data.preview : []);
      } catch (e) {
        setPreviewErr(e?.message || "Preview error");
        setPreviewData([]);
      } finally {
        setPreviewBusy(false);
      }
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [productIds, adjustType, amountType, percentage, fixedAmount, rounding]);

  // -------- Preview summary --------
const flatRows = useMemo(() => {
  const rows = [];

  for (const p of previewData) {
    // ✅ API returns p.image (NOT p.featuredImage)
    const productImageUrl = p?.image?.url || null;
    const productImageAlt = p?.image?.altText || p?.title || "Product";

    for (const v of p.variants || []) {
      // ✅ API returns v.image (correct)
      const variantImageUrl = v?.image?.url || null;
      const variantImageAlt = v?.image?.altText || v?.variantTitle || "Variant";

      const imageUrl = variantImageUrl || productImageUrl || null;
      const imageAlt = variantImageUrl ? variantImageAlt : productImageAlt;

      rows.push({
        productTitle: p.title,
        variantTitle: v.variantTitle,
        imageUrl,
        imageAlt,
        // ✅ API returns oldPrice (NOT v.price)
        oldPrice: v.oldPrice,
        newPrice: v.newPrice,
      });
    }
  }

  return rows;
}, [previewData]);

  const summary = useMemo(() => {
    if (!flatRows.length) return null;
    const oldTotal = flatRows.reduce((a, r) => a + (Number(r.oldPrice) || 0), 0);
    const newTotal = flatRows.reduce((a, r) => a + (Number(r.newPrice) || 0), 0);
    const diff = newTotal - oldTotal;
    return { oldTotal, newTotal, diff };
  }, [flatRows]);

  // -------- Submit (actual update) --------
  const onSubmit = useCallback(async () => {
    if (!productIds.length) return;

    setBusy(true);
    setMsg("");

    try {
      const payload = {
        productIds,
        adjustType,
        amountType,
        percentage: amountType === "percentage" ? Number(percentage) : null,
        fixedAmount: amountType === "fixed" ? Number(fixedAmount || 0) : null,
        rounding,
      };

      const res = await fetch("/api/products/bulk-price-adjust", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        throw new Error(data?.message || "Bulk price update failed");
      }

      setTone("success");
      setMsg(`Price update completed for ${productIds.length} product(s).`);
    } catch (e) {
      setTone("critical");
      setMsg(e?.message || "Something went wrong");
    } finally {
      setBusy(false);
    }
  }, [productIds, adjustType, amountType, percentage, fixedAmount, rounding]);

  // Guard message if no ids
  useEffect(() => {
    if (!productIds.length) {
      setTone("critical");
      setMsg("No products selected. Go back and select products, then click Bulk edit.");
    }
  }, [productIds.length]);

  return (
    <Page
      title="Price Update"
      backAction={{ content: "Products", onAction: () => navigate(-1) }}
      primaryAction={{
        content: "Submit",
        onAction: onSubmit,
        loading: busy,
        disabled: !productIds.length,
      }}
      secondaryActions={[
        {
          content: "Cancel",
          onAction: () => navigate(-1),
          disabled: busy,
        },
      ]}
    >
      {msg ? (
        <Box paddingBlockEnd="300">
          <Banner title={tone === "success" ? "Update" : "Error"} tone={tone}>
            <p>{msg}</p>
          </Banner>
        </Box>
      ) : null}

      <Layout>
        {/* LEFT CARD */}
        <Layout.Section>
          <Card>
            <Box padding="400">
              <Text variant="headingLg" as="h2">
                Adjustment
              </Text>

              <Box paddingBlockStart="400">
                <Text variant="headingMd" as="h3">
                  Adjustment Type
                </Text>

                <Box paddingBlockStart="200">
                  <InlineStack gap="300">
                    <Button
                      pressed={adjustType === "decrease"}
                      onClick={() => setAdjustType("decrease")}
                    >
                      Decrease pricing
                    </Button>

                    <Button
                      pressed={adjustType === "increase"}
                      onClick={() => setAdjustType("increase")}
                    >
                      Increase pricing
                    </Button>
                  </InlineStack>
                </Box>
              </Box>

              <Box paddingBlockStart="400">
                <Divider />
              </Box>

              <Box paddingBlockStart="400">
                <Text variant="headingMd" as="h3">
                  Adjustment Details
                </Text>

                <Box paddingBlockStart="200">
                  <Select
                    label="Percentage/Fixed Amount"
                    options={[
                      { label: "Percentage", value: "percentage" },
                      { label: "Fixed amount", value: "fixed" },
                    ]}
                    value={amountType}
                    onChange={setAmountType}
                  />
                </Box>

                {amountType === "percentage" ? (
                  <Box paddingBlockStart="300">
                    <RangeSlider
                      label={`Adjustment Percentage ${percentage}%`}
                      value={percentage}
                      min={0}
                      max={100}
                      onChange={setPercentage}
                      output
                    />
                  </Box>
                ) : (
                  <Box paddingBlockStart="300">
                    <TextField
                      label="Fixed amount"
                      value={fixedAmount}
                      onChange={setFixedAmount}
                      type="number"
                      autoComplete="off"
                      prefix="$"
                    />
                  </Box>
                )}

                <Box paddingBlockStart="200">
                  <Text as="p" tone="subdued">
                    Preview: <b>{helperText}</b>
                  </Text>
                </Box>
              </Box>

              <Box paddingBlockStart="400">
                <Divider />
              </Box>

              <Box paddingBlockStart="400">
                <Text variant="headingMd" as="h3">
                  Rounding Options
                </Text>

                <Box paddingBlockStart="200">
                  <ChoiceList
                    choices={[
                      { label: "Do not round results", value: "none" },
                      { label: "Round to nearest whole value", value: "nearest_whole" },
                      { label: "Round down to nearest whole value", value: "down_whole" },
                      { label: "Round up to .99", value: "up_99" },
                    ]}
                    selected={[rounding]}
                    onChange={(v) => setRounding(v[0])}
                  />
                </Box>
              </Box>

              <Box paddingBlockStart="400">
                <Divider />
              </Box>

              <Box paddingBlockStart="400">
                <Text as="p" tone="subdued">
                  Products selected: <b>{productIds.length}</b>
                </Text>
                <Box paddingBlockStart="200">
                  <Text as="p" tone="subdued">
                    Selected IDs: <span style={{ wordBreak: "break-word" }}>{productIds.join(", ")}</span>
                  </Text>
                </Box>
              </Box>
            </Box>
          </Card>
        </Layout.Section>

        {/* RIGHT PREVIEW CARD */}
<Layout.Section variant="oneThird">
  <Card>
    <Box padding="400">
      <Text variant="headingMd" as="h3">
        Price Preview
      </Text>

      <Box paddingBlockStart="200">
        <Text as="p" tone="subdued">
          Shows the first 100 variants per product.
        </Text>
      </Box>

      {previewErr ? (
        <Box paddingBlockStart="300">
          <Banner title="Preview error" tone="critical">
            <p>{previewErr}</p>
          </Banner>
        </Box>
      ) : null}

      {previewBusy ? (
        <Box paddingBlockStart="300">
          <InlineStack gap="200" blockAlign="center">
            <Spinner size="small" accessibilityLabel="Loading preview" />
            <Text as="span" tone="subdued">
              Calculating preview…
            </Text>
          </InlineStack>
        </Box>
      ) : null}

      {!previewBusy && summary ? (
        <Box paddingBlockStart="300">
          <Text as="p">
            Current total: <b>{money(summary.oldTotal)}</b>
          </Text>
          <Text as="p">
            New total: <b>{money(summary.newTotal)}</b>
          </Text>
          <Text as="p" tone={summary.diff >= 0 ? "success" : "critical"}>
            Difference: <b>{money(summary.diff)}</b>
          </Text>
        </Box>
      ) : null}

      <Box paddingBlockStart="300">
        <Divider />
      </Box>

      <Box paddingBlockStart="300">
        {!previewBusy && !flatRows.length ? (
          <Text as="p" tone="subdued">
            No preview data available.
          </Text>
        ) : null}

        {!previewBusy && flatRows.length ? (
          <IndexTable
            resourceName={{ singular: "variant", plural: "variants" }}
            itemCount={Math.min(flatRows.length, 25)}
            selectable={false}
            headings={[
              { title: "Variant" },
              { title: "Old" },
              { title: "New" },
            ]}
          >
            {flatRows.slice(0, 25).map((r, idx) => (
              <IndexTable.Row id={`${idx}`} key={`${idx}`} position={idx}>
                {/* ✅ Variant column WITH IMAGE */}
                <IndexTable.Cell>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    {r.imageUrl ? (
                      <Thumbnail source={r.imageUrl} alt={r.imageAlt} size="small" />
                    ) : null}

                    <div>
                      <Text as="p" variant="bodySm">
                        <b>{r.productTitle}</b>
                      </Text>
                      <Text as="p" variant="bodySm" tone="subdued">
                        {r.variantTitle}
                      </Text>
                    </div>
                  </div>
                </IndexTable.Cell>

                <IndexTable.Cell>{money(r.oldPrice)}</IndexTable.Cell>
                <IndexTable.Cell>{money(r.newPrice)}</IndexTable.Cell>
              </IndexTable.Row>
            ))}
          </IndexTable>
        ) : null}

        {!previewBusy && flatRows.length > 25 ? (
          <Box paddingBlockStart="200">
            <Text as="p" tone="subdued">
              Showing 25 of {flatRows.length} variants in preview.
            </Text>
          </Box>
        ) : null}
      </Box>
    </Box>
  </Card>
</Layout.Section>

      </Layout>
    </Page>
  );
}
