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
  
  Modal,
  RadioButton,
  Checkbox,
  Popover,
  DatePicker,
} from "@shopify/polaris";

function money(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "—";
  return `$${v.toFixed(2)}`;
}


function formatYmd(date) {
  
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function toLocalDatetimeIso(dateObj, timeStr) {
  
  if (!dateObj || !timeStr) return null;

  const [hh, mm] = timeStr.split(":").map((n) => Number(n));
  const d = new Date(dateObj);

  d.setHours(hh || 0, mm || 0, 0, 0);

  return d.toISOString();
}

export default function BulkEditPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();


  
  const idsParam = searchParams.get("ids") || "";
  const productIds = useMemo(() => {
    const raw = idsParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return Array.from(new Set(raw));
  }, [idsParam]);

  
  const [adjustType, setAdjustType] = useState("decrease");
  const [amountType, setAmountType] = useState("percentage"); 
  const [percentage, setPercentage] = useState(25);
  const [fixedAmount, setFixedAmount] = useState("10");
  const [rounding, setRounding] = useState("none");

 
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [tone, setTone] = useState("success");

  
  const [previewBusy, setPreviewBusy] = useState(false);
  const [previewErr, setPreviewErr] = useState("");
  const [previewData, setPreviewData] = useState([]); 
  const debounceRef = useRef(null);

  const helperText = useMemo(() => {
    if (amountType === "percentage") {
      return `${adjustType === "increase" ? "Increase" : "Decrease"} by ${percentage}%`;
    }
    return `${adjustType === "increase" ? "Increase" : "Decrease"} by $${fixedAmount || 0}`;
  }, [amountType, adjustType, percentage, fixedAmount]);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);

  
  const [changeMode, setChangeMode] = useState("now");
  const [revertEnabled, setRevertEnabled] = useState(false);

 
  const [fromPopoverOpen, setFromPopoverOpen] = useState(false);
  const [fromDate, setFromDate] = useState(new Date());
  const [fromMonth, setFromMonth] = useState(fromDate.getMonth());
  const [fromYear, setFromYear] = useState(fromDate.getFullYear());
  const [fromTime, setFromTime] = useState("12:00");

  
  const [toPopoverOpen, setToPopoverOpen] = useState(false);
  const [toDate, setToDate] = useState(new Date());
  const [toMonth, setToMonth] = useState(toDate.getMonth());
  const [toYear, setToYear] = useState(toDate.getFullYear());
  const [toTime, setToTime] = useState("12:00");


  const [savedSchedule, setSavedSchedule] = useState(null);

  const scheduleSummary = useMemo(() => {
    if (!savedSchedule) return "Not set";
    if (savedSchedule.changeMode === "now") return "Change prices now";
    const from = `${savedSchedule.fromDate} ${savedSchedule.fromTime}`;
    const to = savedSchedule.revertEnabled
      ? ` → Revert ${savedSchedule.toDate} ${savedSchedule.toTime}`
      : "";
    return `Change later: ${from}${to}`;
  }, [savedSchedule]);

  const openSchedule = useCallback(() => setScheduleModalOpen(true), []);
  const closeSchedule = useCallback(() => setScheduleModalOpen(false), []);

  const onFromMonthChange = useCallback((m, y) => {
    setFromMonth(m);
    setFromYear(y);
  }, []);
  const onToMonthChange = useCallback((m, y) => {
    setToMonth(m);
    setToYear(y);
  }, []);

  const saveScheduleSettings = useCallback(() => {
    const snapshot = {
      changeMode,
      revertEnabled,
      fromDate: formatYmd(fromDate),
      fromTime,
      toDate: formatYmd(toDate),
      toTime,
      runAtIso: changeMode === "later" ? toLocalDatetimeIso(fromDate, fromTime) : null,
      revertAtIso:
        changeMode === "later" && revertEnabled ? toLocalDatetimeIso(toDate, toTime) : null,
    };

   
    if (snapshot.changeMode === "later" && !snapshot.runAtIso) {
      setTone("critical");
      setMsg("Please select a valid From date/time.");
      return;
    }
    if (snapshot.changeMode === "later" && snapshot.revertEnabled && !snapshot.revertAtIso) {
      setTone("critical");
      setMsg("Please select a valid To date/time.");
      return;
    }

   
    if (snapshot.changeMode === "later" && snapshot.revertEnabled) {
      const a = new Date(snapshot.runAtIso).getTime();
      const b = new Date(snapshot.revertAtIso).getTime();
      if (b <= a) {
        setTone("critical");
        setMsg("To date/time must be after From date/time.");
        return;
      }
    }

    setSavedSchedule(snapshot);
    setScheduleModalOpen(false);

    setTone("success");
    setMsg(`Schedule saved: ${snapshot.changeMode === "now" ? "Now" : "Later"}`);
  }, [changeMode, revertEnabled, fromDate, fromTime, toDate, toTime]);

  
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


  const flatRows = useMemo(() => {
    const rows = [];

    for (const p of previewData) {
      const productImageUrl = p?.image?.url || null;
      const productImageAlt = p?.image?.altText || p?.title || "Product";

      for (const v of p.variants || []) {
        const variantImageUrl = v?.image?.url || null;
        const variantImageAlt = v?.image?.altText || v?.variantTitle || "Variant";

        const imageUrl = variantImageUrl || productImageUrl || null;
        const imageAlt = variantImageUrl ? variantImageAlt : productImageAlt;

        rows.push({
          productTitle: p.title,
          variantTitle: v.variantTitle,
          variantId: v.variantId || v.id, 
          imageUrl,
          imageAlt,
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

  
const onSubmit = useCallback(async () => {
  if (!productIds.length) return;

  setBusy(true);
  setMsg("");

  try {
    
    const items = [];
    for (const p of previewData || []) {
      for (const v of p?.variants || []) {
        const variantId = v?.variantId;      
        const newPrice = v?.newPrice;

        if (!variantId || newPrice == null) continue;

        items.push({
          productId: p?.productId || null, 
          variantId,
          newPrice: String(newPrice),
          oldPrice: v?.oldPrice != null ? String(v.oldPrice) : null,
        });
      }
    }

    const payload = {
      productIds,
      adjustType,
      amountType,
      percentage: amountType === "percentage" ? Number(percentage) : null,
      fixedAmount: amountType === "fixed" ? Number(fixedAmount || 0) : null,
      rounding,
      schedule: savedSchedule, 
 
      items: flatRows.map(r => ({
        variantId: r.variantId,
        newPrice: String(r.newPrice),
        oldPrice: String(r.oldPrice ?? ""),
      })),
        };

    
    if (savedSchedule?.changeMode === "later") {
      
      if (!items.length) {
        setTone("critical");
        setMsg("items required (variantId + newPrice). Preview data missing variantId/newPrice.");
        return;
      }

      const res = await fetch("/api/schedules/create", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        throw new Error(
          data?.details
            ? `${data.error}\n${data.details}`
            : data?.error || data?.message || "Schedule create failed"
        );
      }

      setTone("success");
      setMsg(`Schedule created successfully. Schedule ID: ${data.scheduleId || "—"}`);
      return;
    }

    
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
}, [
  productIds,
  adjustType,
  amountType,
  percentage,
  fixedAmount,
  rounding,
  savedSchedule,
  previewData, 
]);

  
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
        { content: "Price Schedule", onAction: openSchedule, disabled: busy },
        { content: "Cancel", onAction: () => navigate(-1), disabled: busy },
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
        
        <Layout.Section>
          <Card>
            <Box padding="400">
              <Box paddingBlockStart="100">
               <InlineStack align="space-between">
  <Text as="p" tone="subdued">
    Schedule: <b>{scheduleSummary}</b>
  </Text>

  <InlineStack gap="200">
    <Button onClick={openSchedule} disabled={busy}>
      Edit schedule
    </Button>

   
    <Button
      onClick={() => navigate("/app/schedules/list")}
      variant="secondary"
    >
      Schedule List
    </Button>
  </InlineStack>
</InlineStack>

              </Box>

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
                    Selected IDs:{" "}
                    <span style={{ wordBreak: "break-word" }}>{productIds.join(", ")}</span>
                  </Text>
                </Box>
              </Box>
            </Box>
          </Card>
        </Layout.Section>

        
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
                    headings={[{ title: "Variant" }, { title: "Old" }, { title: "New" }]}
                  >
                    {flatRows.slice(0, 25).map((r, idx) => (
                      <IndexTable.Row id={`${idx}`} key={`${idx}`} position={idx}>
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

      <Modal
        open={scheduleModalOpen}
        onClose={closeSchedule}
        title="Price Schedule"
        primaryAction={{ content: "Save", onAction: saveScheduleSettings }}
        secondaryActions={[{ content: "Close", onAction: closeSchedule }]}
      >
        <Modal.Section>
          <Box paddingBlockEnd="200">
            <Text as="p" tone="subdued">
              Select when the prices should change
            </Text>
          </Box>

          <InlineStack gap="500" align="space-between">
            <RadioButton
              label="Change prices now"
              checked={changeMode === "now"}
              id="change_now"
              name="changeMode"
              onChange={() => setChangeMode("now")}
            />
            <RadioButton
              label="Change prices later"
              checked={changeMode === "later"}
              id="change_later"
              name="changeMode"
              onChange={() => setChangeMode("later")}
            />
          </InlineStack>

          {changeMode === "later" ? (
            <Box paddingBlockStart="400">
              <Divider />


              <Box paddingBlockStart="400">
                <InlineStack gap="300" align="start">
                  <div style={{ flex: 1 }}>
                    <Popover
                      active={fromPopoverOpen}
                      onClose={() => setFromPopoverOpen(false)}
                      activator={
                        <TextField
                          label="From date"
                          value={formatYmd(fromDate)}
                          onFocus={() => setFromPopoverOpen(true)}
                          autoComplete="off"
                        />
                      }
                    >
                      <DatePicker
                        month={fromMonth}
                        year={fromYear}
                        onMonthChange={onFromMonthChange}
                        selected={fromDate}
                        onChange={({ start }) => {
                          setFromDate(start);
                          setFromPopoverOpen(false);
                        }}
                      />
                    </Popover>
                  </div>

                  <div style={{ width: 180 }}>
                    <TextField
                      label="From time"
                      type="time"
                      value={fromTime}
                      onChange={setFromTime}
                      autoComplete="off"
                    />
                  </div>
                </InlineStack>
              </Box>

              
              <Box paddingBlockStart="300">
                <Checkbox
                  label="Revert to original prices later?"
                  checked={revertEnabled}
                  onChange={setRevertEnabled}
                />
              </Box>

              
              {revertEnabled ? (
                <Box paddingBlockStart="300">
                  <InlineStack gap="300" align="start">
                    <div style={{ flex: 1 }}>
                      <Popover
                        active={toPopoverOpen}
                        onClose={() => setToPopoverOpen(false)}
                        activator={
                          <TextField
                            label="To date"
                            value={formatYmd(toDate)}
                            onFocus={() => setToPopoverOpen(true)}
                            autoComplete="off"
                          />
                        }
                      >
                        <DatePicker
                          month={toMonth}
                          year={toYear}
                          onMonthChange={onToMonthChange}
                          selected={toDate}
                          onChange={({ start }) => {
                            setToDate(start);
                            setToPopoverOpen(false);
                          }}
                        />
                      </Popover>
                    </div>

                    <div style={{ width: 180 }}>
                      <TextField
                        label="To time"
                        type="time"
                        value={toTime}
                        onChange={setToTime}
                        autoComplete="off"
                      />
                    </div>
                  </InlineStack>
                </Box>
              ) : null}
            </Box>
          ) : null}
        </Modal.Section>
      </Modal>
    </Page>
  );
}
