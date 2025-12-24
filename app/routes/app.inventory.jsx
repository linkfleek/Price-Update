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
  Badge,
  useIndexResourceState,
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
  const [rows, setRows] = useState([]); 

  const [loadingLevels, setLoadingLevels] = useState(false);

  
  const [query, setQuery] = useState("");
  const [sortValue, setSortValue] = useState("product_asc");

  
  const [edited, setEdited] = useState({});

  
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

        if (!locRes.ok || locJson?.ok === false) {
          throw new Error(locJson?.error || "Failed to load locations");
        }
        if (!prodRes.ok || prodJson?.ok === false) {
          throw new Error(prodJson?.error || "Failed to load products");
        }

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

  
  useEffect(() => {
    const out = [];

    for (const p of products) {
      const pImg = p?.featuredImage?.url || null;
      const pAlt = p?.featuredImage?.altText || p?.title || "Product";

      for (const v of p?.variants?.nodes || []) {
        const rowId = v?.inventoryItem?.id || v?.id; // stable id for IndexTable selection

        out.push({
          id: rowId,
          key: rowId,

          productTitle: p?.title,
          variantTitle: v?.title,
          sku: v?.sku || "—",
          inventoryItemId: v?.inventoryItem?.id,

          imageUrl: pImg,
          imageAlt: pAlt,

          unavailable: null,
          committed: null,
          available: null,
          onHand: null,
        });
      }
    }

    setRows(out);
    setEdited({});
  }, [products]);

  
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
              return {
                id: r.id,
                unavailable: 0,
                committed: 0,
                available: 0,
                onHand: 0,
              };
            }

            const res = await fetch("/api/inventory/level", {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                inventoryItemId: r.inventoryItemId,
                locationId,
              }),
            });

            const json = await res.json().catch(() => ({}));
            if (!res.ok || json?.ok === false) {
              return {
                id: r.id,
                unavailable: 0,
                committed: 0,
                available: 0,
                onHand: 0,
              };
            }

            return {
              id: r.id,
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
            const hit = map.get(r.id);
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
      } catch (e) {
        setTone("critical");
        setMsg(e?.message || "Inventory load error");
      } finally {
        setLoadingLevels(false);
      }
    })();
  }, [locationId, rows.length]);

  const locationOptions = useMemo(
    () => (locations || []).map((l) => ({ label: l.name, value: l.id })),
    [locations]
  );

  const sortOptions = useMemo(
    () => [
      { label: "Sort: Product (A–Z)", value: "product_asc" },
      { label: "Sort: Product (Z–A)", value: "product_desc" },
      { label: "Sort: Available (low to high)", value: "available_asc" },
      { label: "Sort: Available (high to low)", value: "available_desc" },
      { label: "Sort: On hand (low to high)", value: "onhand_asc" },
      { label: "Sort: On hand (high to low)", value: "onhand_desc" },
    ],
    []
  );

  
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

  
  const {
    selectedResources,
    allResourcesSelected,
    handleSelectionChange,
    clearSelection,
  } = useIndexResourceState(visibleRows);

  const selectedItemsCount = allResourcesSelected ? "All" : selectedResources.length;

  
  const onEditQty = useCallback((rowId, val) => {
    setEdited((prev) => ({
      ...prev,
      [rowId]: val,
    }));
  }, []);

  
  const saveRow = useCallback(
    async (row) => {
      try {
        const newVal = edited[row.id];
        if (newVal == null || newVal === "") return;

        const qty = Number(newVal);
        if (!Number.isFinite(qty) || qty < 0) {
          throw new Error("Quantity must be a valid number (0 or more)");
        }

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
        if (!res.ok || json?.ok === false) {
          throw new Error(json?.error || "Update failed");
        }

        setRows((prev) => prev.map((r) => (r.id === row.id ? { ...r, available: qty } : r)));

        setEdited((prev) => {
          const copy = { ...prev };
          delete copy[row.id];
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

  
  const saveAll = useCallback(async () => {
    try {
      const editedKeys = Object.keys(edited);
      if (!editedKeys.length) {
        setTone("critical");
        setMsg("No changes to save.");
        return;
      }

      
      const targetIds = selectedResources.length ? selectedResources : editedKeys;

      const updates = targetIds
        .map((id) => {
          const row = rows.find((r) => r.id === id);
          const val = edited[id];
          if (!row?.inventoryItemId) return null;
          if (val == null || val === "") return null;

          return {
            inventoryItemId: row.inventoryItemId,
            quantity: Number(val),
          };
        })
        .filter(Boolean);

      if (!updates.length) {
        setTone("critical");
        setMsg("No valid changes to save.");
        return;
      }

      const bad = updates.find(
        (u) => !u.inventoryItemId || !Number.isFinite(u.quantity) || u.quantity < 0
      );
      if (bad) throw new Error("One or more edited rows have invalid quantity.");

      const res = await fetch("/api/inventory/update-bulk", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ locationId, updates }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || json?.ok === false) throw new Error(json?.error || "Bulk update failed");

      
      const byInvItem = new Map(updates.map((u) => [u.inventoryItemId, u.quantity]));
      setRows((prev) =>
        prev.map((r) => {
          const v = byInvItem.get(r.inventoryItemId);
          return v == null ? r : { ...r, available: v };
        })
      );

      
      setEdited((prev) => {
        const copy = { ...prev };
        for (const id of targetIds) delete copy[id];
        return copy;
      });

      clearSelection();

      setTone("success");
      setMsg(`Bulk saved successfully. Updated ${json.updated || updates.length} row(s).`);
    } catch (e) {
      setTone("critical");
      setMsg(e?.message || "Bulk save failed");
    }
  }, [edited, locationId, rows, selectedResources, clearSelection]);

  const editedCount = Object.keys(edited).length;

  return (
    <Page
      title="Inventory"
      primaryAction={{
        content: "Bulk Save",
        onAction: saveAll,
        disabled: !locationId || editedCount === 0,
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
              
              <InlineStack align="space-between" blockAlign="center" gap="300">
                <InlineStack gap="200" blockAlign="center">
                  <Text as="h2" variant="headingMd">
                    Inventory
                  </Text>
                  {busy ? <Spinner size="small" /> : null}
                </InlineStack>

                <InlineStack gap="200" blockAlign="center" wrap={false}>
                  <Box minWidth="320px">
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

                  <Box minWidth="280px">
                    <Select
                      label="Sort"
                      labelHidden
                      options={sortOptions}
                      value={sortValue}
                      onChange={setSortValue}
                    />
                  </Box>

                  <Box minWidth="280px">
                    <Select
                      label="Shop location"
                      labelHidden
                      options={locationOptions}
                      value={locationId}
                      onChange={(v) => setLocationId(v)}
                      disabled={!locationOptions.length}
                    />
                  </Box>
                </InlineStack>
              </InlineStack>

              <Box paddingBlockStart="300">
                <Divider />
              </Box>
              <Box paddingBlockStart="200">
                <InlineStack align="space-between" blockAlign="center">
                  <InlineStack gap="200" blockAlign="center">
                    {selectedItemsCount !== 0 ? (
                      <Badge tone="info">{selectedItemsCount} selected</Badge>
                    ) : null}
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
                  selectedItemsCount={selectedItemsCount}
                  onSelectionChange={handleSelectionChange}
                  headings={[
                    { title: "Product" },
                    { title: "SKU" },
                    { title: "Unavailable" },
                    { title: "Committed" },
                    { title: "Available" },
                    { title: "On hand" },
                    { title: "Action" },
                  ]}
                >
                  {visibleRows.map((r, idx) => {
                    const editedVal = edited[r.id];
                    const displayAvailable =
                      editedVal != null ? String(editedVal) : r.available == null ? "" : String(r.available);

                    const dirty = editedVal != null;

                    return (
                      <IndexTable.Row
                        id={r.id}
                        key={r.id}
                        position={idx}
                        selected={selectedResources.includes(r.id)}
                      >
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

                        <IndexTable.Cell>{r.sku}</IndexTable.Cell>
                        <IndexTable.Cell>{num(r.unavailable, 0)}</IndexTable.Cell>
                        <IndexTable.Cell>{num(r.committed, 0)}</IndexTable.Cell>

                        <IndexTable.Cell>
                          <div style={{ maxWidth: 140 }}>
                            <TextField
                              labelHidden
                              label="Available"
                              type="number"
                              value={displayAvailable}
                              onChange={(v) => onEditQty(r.id, v)}
                              autoComplete="off"
                            />
                          </div>
                        </IndexTable.Cell>

                        <IndexTable.Cell>{num(r.onHand, 0)}</IndexTable.Cell>

                        <IndexTable.Cell>
                          <Button
                            onClick={() => saveRow(r)}
                              disabled={!dirty || !locationId || !r.inventoryItemId}
                          >
                            Save
                          </Button>
                        </IndexTable.Cell>
                      </IndexTable.Row>
                    );
                  })}
                </IndexTable>

                <Box paddingBlockStart="200">
                  <Text as="p" tone="subdued">
                    Showing first 50 variants.
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
