// app/routes/app.inventory.jsx
import { Thumbnail } from "@shopify/polaris";
import { useEffect, useMemo, useState, useCallback } from "react";
import {
  Page,
  Card,
  Layout,
  Box,
  Text,
  Select,
  Banner,
  Spinner,
  IndexTable,
  TextField,
  Button,
  InlineStack,
  Divider,
//   ButtonGroup,
  Badge,
} from "@shopify/polaris";

function num(val, fallback = 0) {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

export default function InventoryPage() {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [tone, setTone] = useState("success");

  const [locations, setLocations] = useState([]);
  const [locationId, setLocationId] = useState("");

  const [products, setProducts] = useState([]);
  const [rows, setRows] = useState([]); // flattened

  const [loadingLevels, setLoadingLevels] = useState(false);

  // Search + Sort
  const [query, setQuery] = useState("");
  const [sortValue, setSortValue] = useState("product_asc");

  // Track edits (rowKey -> { available?, onHand? })
  const [edited, setEdited] = useState({});

  // Selection state (IndexTable)
  const [selectedResources, setSelectedResources] = useState([]);
  const allResourceIds = useMemo(() => rows.map((r) => r.key), [rows]);

  const handleSelectionChange = useCallback(
    (selectionType, toggleType, selection) => {
      if (selectionType === "all") {
        setSelectedResources(toggleType ? allResourceIds : []);
      } else {
        setSelectedResources(selection);
      }
    },
    [allResourceIds]
  );

  const selectedCount = selectedResources.length;

  // -------- Load locations + products ----------
  useEffect(() => {
    (async () => {
      setBusy(true);
      setMsg("");

      try {
        const [locRes, prodRes] = await Promise.all([
          fetch("/api/inventory/locations", { credentials: "include" }),
          fetch("/api/inventory/list", { credentials: "include" }),
        ]);

        const locJson = await locRes.json().catch(() => ({}));
        const prodJson = await prodRes.json().catch(() => ({}));

        if (!locRes.ok || locJson?.ok === false)
          throw new Error(locJson?.error || "Failed to load locations");
        if (!prodRes.ok || prodJson?.ok === false)
          throw new Error(prodJson?.error || "Failed to load products");

        setLocations(locJson.locations || []);
        const defaultLoc = locJson.locations?.[0]?.id || "";
        setLocationId(defaultLoc);

        setProducts(prodJson.products || []);
      } catch (e) {
        setTone("critical");
        setMsg(e?.message || "Load error");
      } finally {
        setBusy(false);
      }
    })();
  }, []);

  // -------- Flatten products into table rows ----------
  useEffect(() => {
    const out = [];
    for (const p of products) {
      const pImg = p?.featuredImage?.url || null;
      const pAlt = p?.featuredImage?.altText || p?.title || "Product";

      for (const v of p?.variants?.nodes || []) {
        out.push({
          key: v?.inventoryItem?.id || v?.id,
          productTitle: p?.title,
          variantTitle: v?.title,
          sku: v?.sku || "—",
          inventoryItemId: v?.inventoryItem?.id,
          imageUrl: pImg,
          imageAlt: pAlt,

          // inventory fields
          unavailable: null,
          committed: null,
          available: null,
          onHand: null,
        });
      }
    }

    setRows(out);
    setSelectedResources([]);
    setEdited({});
  }, [products]);

  // -------- Load inventory levels for current location ----------
  useEffect(() => {
    if (!locationId || !rows.length) return;

    (async () => {
      setLoadingLevels(true);
      setMsg("");

      try {
        const slice = rows.slice(0, 50);

        const results = await Promise.all(
          slice.map(async (r) => {
            if (!r.inventoryItemId) {
              return { id: r.key, unavailable: 0, committed: 0, available: 0, onHand: 0 };
            }

            const res = await fetch("/api/inventory/level", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ inventoryItemId: r.inventoryItemId, locationId }),
            });

            const json = await res.json().catch(() => ({}));
            if (!res.ok || json?.ok === false) {
              return { id: r.key, unavailable: 0, committed: 0, available: 0, onHand: 0 };
            }

            return {
              id: r.key,
              unavailable: num(json.unavailable, 0),
              committed: num(json.committed, 0),
              available: num(json.available, 0),
              onHand: num(json.onHand ?? json.on_hand, 0),
            };
          })
        );

        const map = new Map(results.map((x) => [x.id, x]));
        setRows((prev) =>
          prev.map((r) => {
            const hit = map.get(r.key);
            if (!hit) return r;
            return {
              ...r,
              unavailable: hit.unavailable,
              committed: hit.committed,
              available: hit.available,
              onHand: hit.onHand,
            };
          })
        );

        setEdited({});
        setSelectedResources([]);
      } catch (e) {
        setTone("critical");
        setMsg(e?.message || "Inventory load error");
      } finally {
        setLoadingLevels(false);
      }
    })();
  }, [locationId, rows.length]);

  const locationOptions = useMemo(() => {
    return (locations || []).map((l) => ({ label: l.name, value: l.id }));
  }, [locations]);

  const sortOptions = useMemo(
    () => [
      { label: "Sort: Product (A–Z)", value: "product_asc" },
      { label: "Sort: Product (Z–A)", value: "product_desc" },
      { label: "Sort: Available (low → high)", value: "available_asc" },
      { label: "Sort: Available (high → low)", value: "available_desc" },
      { label: "Sort: On hand (low → high)", value: "onhand_asc" },
      { label: "Sort: On hand (high → low)", value: "onhand_desc" },
    ],
    []
  );

  const onEditQty = useCallback((rowKey, field, val) => {
    setEdited((prev) => ({
      ...prev,
      [rowKey]: {
        ...(prev[rowKey] || {}),
        [field]: val,
      },
    }));
  }, []);

  // Filter + Sort + limit to first 50
  const visibleRows = useMemo(() => {
    let list = rows.slice(0, 50);

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((r) => {
        return (
          String(r.productTitle || "").toLowerCase().includes(q) ||
          String(r.variantTitle || "").toLowerCase().includes(q) ||
          String(r.sku || "").toLowerCase().includes(q)
        );
      });
    }

    const cmpText = (a, b) => String(a || "").localeCompare(String(b || ""));
    const cmpNum = (a, b) => num(a) - num(b);

    const sorted = [...list];
    switch (sortValue) {
      case "product_desc":
        sorted.sort((a, b) => cmpText(b.productTitle, a.productTitle));
        break;
      case "available_asc":
        sorted.sort((a, b) => cmpNum(a.available, b.available));
        break;
      case "available_desc":
        sorted.sort((a, b) => cmpNum(b.available, a.available));
        break;
      case "onhand_asc":
        sorted.sort((a, b) => cmpNum(a.onHand, b.onHand));
        break;
      case "onhand_desc":
        sorted.sort((a, b) => cmpNum(b.onHand, a.onHand));
        break;
      case "product_asc":
      default:
        sorted.sort((a, b) => cmpText(a.productTitle, b.productTitle));
        break;
    }

    return sorted;
  }, [rows, query, sortValue]);

  // -------- Save single row ----------
  const saveRow = useCallback(
    async (row) => {
      try {
        const patch = edited[row.key];
        if (!patch) return;

        const availableVal = patch.available;

        if (availableVal != null && availableVal !== "") {
          const qty = Number(availableVal);
          if (!Number.isFinite(qty) || qty < 0) throw new Error("Available must be 0 or more");

          const res = await fetch("/api/inventory/update", {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              inventoryItemId: row.inventoryItemId,
              locationId,
              quantity: qty,
            }),
          });

          const json = await res.json().catch(() => ({}));
          if (!res.ok || json?.ok === false) throw new Error(json?.error || "Update failed");

          setRows((prev) => prev.map((r) => (r.key === row.key ? { ...r, available: qty } : r)));
        }

        setEdited((prev) => {
          const copy = { ...prev };
          delete copy[row.key];
          return copy;
        });

        setTone("success");
        setMsg("Inventory updated successfully.");
      } catch (e) {
        setTone("critical");
        setMsg(e?.message || "Save failed");
      }
    },
    [edited, locationId]
  );

  // -------- Bulk Save (selected rows first; if none selected -> all edited) ----------
  const saveAll = useCallback(async () => {
    try {
      const editedKeys = Object.keys(edited);
      if (!editedKeys.length) {
        setTone("critical");
        setMsg("No changes to save.");
        return;
      }

      const targetKeys = selectedResources.length ? selectedResources : editedKeys;

      const updates = targetKeys
        .map((k) => {
          const row = rows.find((r) => r.key === k);
          const patch = edited[k];
          if (!row?.inventoryItemId || !patch) return null;
          if (patch.available == null || patch.available === "") return null;

          return {
            inventoryItemId: row.inventoryItemId,
            quantity: Number(patch.available),
          };
        })
        .filter(Boolean);

      if (!updates.length) {
        setTone("critical");
        setMsg("No valid edits to save (for selected rows).");
        return;
      }

      const bad = updates.find((u) => !u.inventoryItemId || !Number.isFinite(u.quantity) || u.quantity < 0);
      if (bad) throw new Error("One or more edited rows have invalid quantity.");

      const res = await fetch("/api/inventory/update-bulk", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId, updates }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) throw new Error(json?.error || "Bulk update failed");

      const map = new Map(updates.map((u) => [u.inventoryItemId, u.quantity]));
      setRows((prev) =>
        prev.map((r) => {
          const v = map.get(r.inventoryItemId);
          return v == null ? r : { ...r, available: v };
        })
      );

      setEdited({});
      setSelectedResources([]);

      setTone("success");
      setMsg(`Bulk saved successfully. Updated ${json.updated || updates.length} row(s).`);
    } catch (e) {
      setTone("critical");
      setMsg(e?.message || "Bulk save failed");
    }
  }, [edited, locationId, rows, selectedResources]);

  const editedCount = Object.keys(edited).length;
  const primaryDisabled = !locationId || editedCount === 0;

  return (
    <Page
      title="Inventory"
      primaryAction={{
        content: "Bulk Save",
        onAction: saveAll,
        disabled: primaryDisabled,
      }}
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
              {/* ✅ SINGLE ROW TOOLBAR (Inventory + Search + Sort + Location + Columns + Filters) */}
              <InlineStack align="space-between" blockAlign="center" gap="300" wrap={false}>
                <InlineStack gap="200" blockAlign="center" wrap={false}>
                  <Text as="h2" variant="headingLg">
                    Inventory
                  </Text>
                  {busy ? <Spinner size="small" /> : null}
                </InlineStack>

                <InlineStack gap="200" blockAlign="center" wrap={false}>
                  {/* Search */}
                  <Box minWidth="260px">
                    <TextField
                      label="Search"
                      labelHidden
                      placeholder="Search"
                      value={query}
                      onChange={setQuery}
                      autoComplete="off"
                      clearButton
                      onClearButtonClick={() => setQuery("")}
                    />
                  </Box>

                  {/* Sort */}
                  <Box minWidth="220px">
                    <Select
                      label="Sort"
                      labelHidden
                      options={sortOptions}
                      value={sortValue}
                      onChange={setSortValue}
                    />
                  </Box>

                  {/* Location */}
                  <Box minWidth="240px">
                    <Select
                      label="Shop location"
                      labelHidden
                      options={locationOptions}
                      value={locationId}
                      onChange={(v) => setLocationId(v)}
                      disabled={!locationOptions.length}
                    />
                  </Box>

                  {/* Buttons (text only) */}
                  {/* <ButtonGroup>
                    <Button onClick={() => setMsg("Columns clicked (UI only).")}>Columns</Button>
                    <Button onClick={() => setMsg("Filters clicked (UI only).")}>Filters</Button>
                  </ButtonGroup> */}
                </InlineStack>
              </InlineStack>

              <Box paddingBlockStart="300">
                <Divider />
              </Box>

              {/* Status row */}
              <Box paddingBlockStart="200">
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="200" blockAlign="center">
                    {selectedCount ? <Badge tone="info">{selectedCount} selected</Badge> : null}
                    {editedCount ? <Badge tone="attention">{editedCount} edited</Badge> : null}
                  </InlineStack>

                  {loadingLevels ? (
                    <InlineStack gap="200" blockAlign="center">
                      <Spinner size="small" accessibilityLabel="Loading inventory" />
                      <Text as="span" tone="subdued">
                        Loading inventory…
                      </Text>
                    </InlineStack>
                  ) : null}
                </InlineStack>
              </Box>

              <Box paddingBlockStart="300">
                <IndexTable
                  resourceName={{ singular: "variant", plural: "variants" }}
                  itemCount={visibleRows.length}
                  selectable
                  selectedItemsCount={selectedResources.length}
                  onSelectionChange={handleSelectionChange}
                  headings={[
                    { title: "Product" },
                    { title: "SKU" },
                    { title: "Unavailable" },
                    { title: "Committed" },
                    { title: "Available" },
                    { title: "On hand" },
                    { title: "" },
                  ]}
                >
                  {visibleRows.map((r, idx) => {
                    const patch = edited[r.key] || {};
                    const dirtyAvailable = patch.available != null;
                    const dirtyOnHand = patch.onHand != null;

                    const displayAvailable =
                      patch.available != null ? String(patch.available) : r.available == null ? "" : String(r.available);

                    const displayOnHand =
                      patch.onHand != null ? String(patch.onHand) : r.onHand == null ? "" : String(r.onHand);

                    const dirty = dirtyAvailable || dirtyOnHand;

                    return (
                      <IndexTable.Row
                        id={r.key}
                        key={r.key}
                        position={idx}
                        selected={selectedResources.includes(r.key)}
                      >
                        <IndexTable.Cell>
                          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                            {r.imageUrl ? <Thumbnail source={r.imageUrl} alt={r.imageAlt} size="small" /> : null}
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

                        <IndexTable.Cell>{r.sku}</IndexTable.Cell>
                        <IndexTable.Cell>{num(r.unavailable, 0)}</IndexTable.Cell>
                        <IndexTable.Cell>{num(r.committed, 0)}</IndexTable.Cell>

                        <IndexTable.Cell>
                          <div style={{ maxWidth: 130 }}>
                            <TextField
                              labelHidden
                              label="Available"
                              type="number"
                              value={displayAvailable}
                              onChange={(v) => onEditQty(r.key, "available", v)}
                              autoComplete="off"
                            />
                          </div>
                        </IndexTable.Cell>

                        <IndexTable.Cell>
                          <div style={{ maxWidth: 130 }}>
                            <TextField
                              labelHidden
                              label="On hand"
                              type="number"
                              value={displayOnHand}
                              onChange={(v) => onEditQty(r.key, "onHand", v)}
                              autoComplete="off"
                              disabled
                            />
                          </div>
                        </IndexTable.Cell>

                        <IndexTable.Cell>
                          <Button onClick={() => saveRow(r)} disabled={!dirty || !locationId || !r.inventoryItemId}>
                            Save
                          </Button>
                        </IndexTable.Cell>
                      </IndexTable.Row>
                    );
                  })}
                </IndexTable>

                <Box paddingBlockStart="200">
                  <Text as="p" tone="subdued">
                    Showing first 50 variants. (Pagination can be added next.)
                  </Text>
                </Box>
              </Box>
            </Box>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
