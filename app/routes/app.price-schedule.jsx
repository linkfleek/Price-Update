import { useState, useMemo, useCallback } from "react";
import {
  Page,
  Layout,
  Card,
  Button,
  InlineStack,
  BlockStack,
  Text,
  Modal,
  RadioButton,
  Checkbox,
  Popover,
  DatePicker,
  TextField,
  Divider,
  Banner,
} from "@shopify/polaris";

// ---------- helpers ----------
function formatYmd(date) {
  // YYYY-MM-DD
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
function toLocalDatetime(dateObj, timeStr) {
  // dateObj = Date (date), timeStr = "HH:MM"
  if (!dateObj || !timeStr) return null;
  const [hh, mm] = timeStr.split(":").map((n) => Number(n));
  const d = new Date(dateObj);
  d.setHours(hh || 0, mm || 0, 0, 0);
  return d.toISOString();
}

export default function PriceUpdatePage() {
  // ---------------------------------------
  // Existing states from your page (example)
  // ---------------------------------------
  const [submitResult, setSubmitResult] = useState(null);

  // ---------------------------------------
  // Schedule UI state
  // ---------------------------------------
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);

  // Change now vs later
  const [changeMode, setChangeMode] = useState("now"); // "now" | "later"
  const [revertEnabled, setRevertEnabled] = useState(false);

  // FROM (start)
  const [fromPopoverOpen, setFromPopoverOpen] = useState(false);
  const [fromDate, setFromDate] = useState(new Date());
  const [fromMonth, setFromMonth] = useState(fromDate.getMonth());
  const [fromYear, setFromYear] = useState(fromDate.getFullYear());
  const [fromTime, setFromTime] = useState("12:00");

  // TO (end)
  const [toPopoverOpen, setToPopoverOpen] = useState(false);
  const [toDate, setToDate] = useState(new Date());
  const [toMonth, setToMonth] = useState(toDate.getMonth());
  const [toYear, setToYear] = useState(toDate.getFullYear());
  const [toTime, setToTime] = useState("12:00");

  // Saved schedule snapshot (used on Submit)
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

  const onFromMonthChange = useCallback((m, y) => {
    setFromMonth(m);
    setFromYear(y);
  }, []);
  const onToMonthChange = useCallback((m, y) => {
    setToMonth(m);
    setToYear(y);
  }, []);

  function openSchedule() {
    setScheduleModalOpen(true);
  }

  function saveScheduleSettings() {
    const snapshot = {
      changeMode,
      revertEnabled,
      fromDate: formatYmd(fromDate),
      fromTime,
      toDate: formatYmd(toDate),
      toTime,
      // ISO values for backend:
      runAtIso: changeMode === "later" ? toLocalDatetime(fromDate, fromTime) : null,
      revertAtIso:
        changeMode === "later" && revertEnabled ? toLocalDatetime(toDate, toTime) : null,
    };

    // Basic validation
    if (snapshot.changeMode === "later" && !snapshot.runAtIso) {
      setSubmitResult({ ok: false, error: "Please select a valid start date/time." });
      return;
    }
    if (snapshot.changeMode === "later" && snapshot.revertEnabled && !snapshot.revertAtIso) {
      setSubmitResult({ ok: false, error: "Please select a valid revert date/time." });
      return;
    }

    setSavedSchedule(snapshot);
    setScheduleModalOpen(false);
  }

  // ---------------------------------------
  // Your existing Submit handler
  // Add schedule info into payload
  // ---------------------------------------
  async function handleSubmit() {
    try {
      // Example: build your existing payload here (prices, ids, rounding, etc.)
      const payload = {
        // ...your existing payload
        schedule: savedSchedule, // 👈 includes runAtIso + revertAtIso
      };

      // If changeMode == later => call your schedule endpoint instead of applying immediately
      if (savedSchedule?.changeMode === "later") {
        // POST to your schedule creation API/route (use whichever you built)
        const res = await fetch("/api/schedules/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const json = await res.json();
        setSubmitResult(json);
        return;
      }

      // else apply immediately (your existing apply endpoint)
      const res = await fetch("/api/products/bulk-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      setSubmitResult(json);
    } catch (e) {
      setSubmitResult({ ok: false, error: String(e?.message || e) });
    }
  }

  return (
    <Page
      title="Price Update"
      backAction={{ content: "Back", url: "/app" }}
      primaryAction={{
        content: "Submit",
        onAction: handleSubmit,
      }}
      secondaryActions={[
        { content: "Cancel", onAction: () => window.history.back() },
        // ✅ NEW BUTTON next to Submit/Cancel
        { content: "Price Schedule", onAction: openSchedule },
      ]}
    >
      <Layout>
        <Layout.Section>
          {submitResult?.error && (
            <Banner tone="critical" title="Error">
              <pre style={{ margin: 0, whiteSpace: "pre-wrap" }}>
                {JSON.stringify(submitResult, null, 2)}
              </pre>
            </Banner>
          )}

          <Card padding="400">
            <BlockStack gap="200">
              <Text as="h2" variant="headingMd">
                Adjustment Type / Details (your existing UI here)
              </Text>

              <Divider />

              <InlineStack align="space-between">
                <Text as="p" variant="bodyMd">
                  Schedule: <strong>{scheduleSummary}</strong>
                </Text>
                <Button onClick={openSchedule}>Edit schedule</Button>
              </InlineStack>

              {/* Your existing form UI continues here */}
            </BlockStack>
          </Card>
        </Layout.Section>

        <Layout.Section variant="oneThird">
          <Card padding="400">
            <Text as="h3" variant="headingMd">
              Price Preview
            </Text>
            {/* your preview UI */}
          </Card>
        </Layout.Section>
      </Layout>

      {/* ✅ Schedule Modal */}
      <Modal
        open={scheduleModalOpen}
        onClose={() => setScheduleModalOpen(false)}
        title="Price Schedule"
        primaryAction={{ content: "Save", onAction: saveScheduleSettings }}
        secondaryActions={[{ content: "Close", onAction: () => setScheduleModalOpen(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p" variant="bodyMd">
              Select when the prices should change
            </Text>

            <InlineStack gap="400">
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

            {changeMode === "later" && (
              <>
                <Divider />

                {/* FROM */}
                <InlineStack gap="300" align="start">
                  <div style={{ flex: 1 }}>
                    <Popover
                      active={fromPopoverOpen}
                      autofocusTarget="first-node"
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

                <Checkbox
                  label="Revert to original prices later?"
                  checked={revertEnabled}
                  onChange={setRevertEnabled}
                />

                {/* TO */}
                {revertEnabled && (
                  <InlineStack gap="300" align="start">
                    <div style={{ flex: 1 }}>
                      <Popover
                        active={toPopoverOpen}
                        autofocusTarget="first-node"
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
                )}
              </>
            )}
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}
