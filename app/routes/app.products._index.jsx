import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router";
import {
  Page,
  Card,
  IndexTable,
  Text,
  Badge,
  Thumbnail,
  Tabs,
  Spinner,
  Banner,
  Button,
  ButtonGroup,
  Popover,
  ActionList,
  Icon,
  useIndexResourceState,
  TextField,
  Select,
  Checkbox,
  InlineStack,
  Box,
} from "@shopify/polaris";
import { MenuHorizontalIcon, SearchIcon, FilterIcon } from "@shopify/polaris-icons";
import "/app/css/app.css.products.css";

function statusBadgeTone(status) {
  if (status === "ACTIVE") return "success";
  if (status === "DRAFT") return "warning";
  if (status === "ARCHIVED") return "critical";
  return "info";
}

function safeNumericId(gidOrId) {
  if (!gidOrId) return "";
  return String(gidOrId).includes("/") ? String(gidOrId).split("/").pop() : String(gidOrId);
}

export default function ProductsPage() {
  const navigate = useNavigate();

  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [selectedTab, setSelectedTab] = useState(0);

  // Top-right controls
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("title_asc");

  // Filters popover
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filterStatus, setFilterStatus] = useState("ALL");

  // “...” menu (in the bulk actions row)
  const [moreOpen, setMoreOpen] = useState(false);

  // Show selected toggle
  const [showSelectedOnly, setShowSelectedOnly] = useState(false);

  // Banner message + loading for status updates
  const [statusBusy, setStatusBusy] = useState(false);
  const [bulkMsg, setBulkMsg] = useState("");

  // Fetch products
  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        const res = await fetch("/api/products", {
          method: "GET",
          credentials: "include",
          headers: { Accept: "application/json" },
        });

        if (!res.ok) {
          const text = await res.text();
          throw new Error(text || `API failed: ${res.status}`);
        }

        const data = await res.json();
        const list = Array.isArray(data.products) ? data.products : [];

        if (alive) {
          setProducts(list);
        }
      } catch (e) {
        if (alive) setError(e?.message || "Failed to load products");
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // Tabs
  const tabs = useMemo(
    () => [
      { id: "all", content: "All" },
      { id: "active", content: "Active" },
      { id: "draft", content: "Draft" },
      { id: "archived", content: "Archived" },
    ],
    []
  );

  const onTabChange = useCallback((index) => setSelectedTab(index), []);

  // Base filter by tab
  const tabFiltered = useMemo(() => {
    const tab = tabs[selectedTab]?.id;
    if (tab === "active") return products.filter((p) => p.status === "ACTIVE");
    if (tab === "draft") return products.filter((p) => p.status === "DRAFT");
    if (tab === "archived") return products.filter((p) => p.status === "ARCHIVED");
    return products;
  }, [products, selectedTab, tabs]);

  // Additional filter (popover)
  const statusFiltered = useMemo(() => {
    if (!filterStatus || filterStatus === "ALL") return tabFiltered;
    return tabFiltered.filter((p) => p.status === filterStatus);
  }, [tabFiltered, filterStatus]);

  // Search filter
  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return statusFiltered;
    return statusFiltered.filter((p) => {
      const title = (p.title || "").toLowerCase();
      const handle = (p.handle || "").toLowerCase();
      return title.includes(q) || handle.includes(q);
    });
  }, [statusFiltered, query]);

  // Sort
  const sorted = useMemo(() => {
    const copy = [...searched];
    if (sort === "title_asc") copy.sort((a, b) => (a.title || "").localeCompare(b.title || ""));
    if (sort === "title_desc") copy.sort((a, b) => (b.title || "").localeCompare(a.title || ""));
    if (sort === "status_asc") copy.sort((a, b) => (a.status || "").localeCompare(b.status || ""));
    if (sort === "status_desc") copy.sort((a, b) => (b.status || "").localeCompare(a.status || ""));
    if (sort === "inventory_desc")
      copy.sort((a, b) => (b.totalInventory ?? -1) - (a.totalInventory ?? -1));
    if (sort === "inventory_asc")
      copy.sort((a, b) => (a.totalInventory ?? -1) - (b.totalInventory ?? -1));
    return copy;
  }, [searched, sort]);

  // Selection state must match the rendered list (sorted)
  const { selectedResources, allResourcesSelected, handleSelectionChange, clearSelection } =
    useIndexResourceState(sorted, {
      resourceIDResolver: (p) => p.id,
    });

  const selectedCount = allResourcesSelected ? "All" : selectedResources.length;

  // Show selected only
  const visibleProducts = useMemo(() => {
    if (!showSelectedOnly) return sorted;
    if (allResourcesSelected) return sorted;
    return sorted.filter((p) => selectedResources.includes(p.id));
  }, [sorted, showSelectedOnly, selectedResources, allResourcesSelected]);

  const showBulkBar = selectedResources.length > 0 || allResourcesSelected;

  const filterActivator = (
    <Button
      icon={<Icon source={FilterIcon} />}
      onClick={() => setFiltersOpen((v) => !v)}
      accessibilityLabel="Filters"
    >
      Filters
    </Button>
  );

  const moreActivator = (
    <Button
      icon={<Icon source={MenuHorizontalIcon} />}
      onClick={() => setMoreOpen((v) => !v)}
      accessibilityLabel="More actions"
    />
  );

  // ==========================
  // Delete functionality
  // ==========================
  const getSelectedIdsSet = useCallback(() => {
    if (allResourcesSelected) return new Set(sorted.map((p) => p.id));
    return new Set(selectedResources);
  }, [allResourcesSelected, sorted, selectedResources]);

  const handleDeleteSelected = useCallback(() => {
    const idsToDelete = getSelectedIdsSet();
    if (idsToDelete.size === 0) return;

    setProducts((prev) => prev.filter((p) => !idsToDelete.has(p.id)));

    clearSelection();
    setShowSelectedOnly(false);
    setMoreOpen(false);
  }, [getSelectedIdsSet, clearSelection]);

  // ==========================
  // Status change (Draft / Active)
  // ==========================
  const selectedProducts = useMemo(() => {
    if (!showBulkBar) return [];
    const selectedSet = getSelectedIdsSet();
    return sorted.filter((p) => selectedSet.has(p.id));
  }, [showBulkBar, getSelectedIdsSet, sorted]);

  const allSelectedAreActive = useMemo(
    () => selectedProducts.length > 0 && selectedProducts.every((p) => p.status === "ACTIVE"),
    [selectedProducts]
  );

  const allSelectedAreDraft = useMemo(
    () => selectedProducts.length > 0 && selectedProducts.every((p) => p.status === "DRAFT"),
    [selectedProducts]
  );

  const statusLabel = allSelectedAreActive ? "Set Draft" : "Set Active";
  const nextStatus = allSelectedAreActive ? "DRAFT" : "ACTIVE";

  const statusButtonEnabled = (allSelectedAreActive || allSelectedAreDraft) && !statusBusy;

  const handleStatusChange = useCallback(async () => {
    const selectedSet = getSelectedIdsSet();
    const ids = Array.from(selectedSet);
    if (!ids.length) return;

    setStatusBusy(true);
    setBulkMsg("");

    try {
      const res = await fetch("/api/products/status", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          status: nextStatus, // "ACTIVE" | "DRAFT"
          productIds: ids.map((gid) =>
            String(gid).includes("/") ? String(gid).split("/").pop() : gid
          ),
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false) {
        throw new Error(data?.message || "Status update failed");
      }

      // Update UI locally
      setProducts((prev) =>
        prev.map((p) => {
          if (!selectedSet.has(p.id)) return p;
          return { ...p, status: nextStatus };
        })
      );

      setBulkMsg(`${statusLabel} completed for ${ids.length} product(s).`);
    } catch (e) {
      setBulkMsg(e?.message || "Something went wrong");
    } finally {
      setStatusBusy(false);
    }
  }, [getSelectedIdsSet, nextStatus, statusLabel]);

  if (loading) {
    return (
      <Page title="Products">
        <Card sectioned>
          <Spinner accessibilityLabel="Loading products" size="large" />
        </Card>
      </Page>
    );
  }

  return (
    <Page>
      {error ? (
        <Banner title="Couldn’t load products" tone="critical">
          <p>{error}</p>
        </Banner>
      ) : null}

      {bulkMsg ? (
        <Box padding="300">
          <Banner
            title="Update"
            tone={bulkMsg.toLowerCase().includes("fail") ? "critical" : "success"}
          >
            <p>{bulkMsg}</p>
          </Banner>
        </Box>
      ) : null}

      <Card>
        <Box padding="300" paddingBlockEnd="0">
          <InlineStack align="space-between" blockAlign="center" gap="300">
            <Tabs tabs={tabs} selected={selectedTab} onSelect={onTabChange} />

            <InlineStack gap="300" blockAlign="center">
              <TextField
                value={query}
                onChange={setQuery}
                placeholder="Search"
                autoComplete="off"
                prefix={<Icon source={SearchIcon} />}
              />

              <Select
                labelInline
                label="Sort"
                options={[
                  { label: "Title (A–Z)", value: "title_asc" },
                  { label: "Title (Z–A)", value: "title_desc" },
                  { label: "Status (A–Z)", value: "status_asc" },
                  { label: "Status (Z–A)", value: "status_desc" },
                  { label: "Inventory (High–Low)", value: "inventory_desc" },
                  { label: "Inventory (Low–High)", value: "inventory_asc" },
                ]}
                value={sort}
                onChange={setSort}
              />

              <Popover
                active={filtersOpen}
                activator={filterActivator}
                onClose={() => setFiltersOpen(false)}
              >
                <ActionList
                  items={[
                    {
                      content: "All statuses",
                      active: filterStatus === "ALL",
                      onAction: () => {
                        setFilterStatus("ALL");
                        setFiltersOpen(false);
                      },
                    },
                    {
                      content: "Active",
                      active: filterStatus === "ACTIVE",
                      onAction: () => {
                        setFilterStatus("ACTIVE");
                        setFiltersOpen(false);
                      },
                    },
                    {
                      content: "Draft",
                      active: filterStatus === "DRAFT",
                      onAction: () => {
                        setFilterStatus("DRAFT");
                        setFiltersOpen(false);
                      },
                    },
                    {
                      content: "Archived",
                      active: filterStatus === "ARCHIVED",
                      onAction: () => {
                        setFilterStatus("ARCHIVED");
                        setFiltersOpen(false);
                      },
                    },
                  ]}
                />
              </Popover>
            </InlineStack>
          </InlineStack>
        </Box>

        {showBulkBar ? (
          <Box padding="300" paddingBlockStart="200" paddingBlockEnd="200">
            <InlineStack align="end" blockAlign="center" gap="300">
              <Checkbox
                label="Show all selected"
                checked={showSelectedOnly}
                onChange={setShowSelectedOnly}
              />

              <Text as="p" variant="bodySm" tone="subdued">
                {selectedCount} selected
              </Text>

              <ButtonGroup>
                <Button
  onClick={() => {
    const set = getSelectedIdsSet();
    const ids = Array.from(set).map((gid) =>
      String(gid).includes("/") ? String(gid).split("/").pop() : String(gid)
    );

    if (!ids.length) return;
    navigate(`/app/bulk-edit?ids=${encodeURIComponent(ids.join(","))}`);
  }}
>
  Bulk edit
</Button>


                {/* Only status change button remains */}
                <Button
                  loading={statusBusy}
                  disabled={!statusButtonEnabled}
                  onClick={handleStatusChange}
                >
                  {statusLabel}
                </Button>

                <Popover
                  active={moreOpen}
                  activator={moreActivator}
                  onClose={() => setMoreOpen(false)}
                >
                  <ActionList
                    items={[
                      {
                        content: "Archive",
                        onAction: () => {
                          setMoreOpen(false);
                          alert("Archive");
                        },
                      },
                      {
                        content: "Delete",
                        destructive: true,
                        onAction: handleDeleteSelected,
                      },
                      {
                        content: "Clear selection",
                        onAction: () => {
                          setMoreOpen(false);
                          clearSelection();
                        },
                      },
                    ]}
                  />
                </Popover>
              </ButtonGroup>
            </InlineStack>
          </Box>
        ) : null}

        <IndexTable
          resourceName={{ singular: "product", plural: "products" }}
          itemCount={visibleProducts.length}
          selectable
          selectedItemsCount={selectedCount}
          onSelectionChange={handleSelectionChange}
          headings={[
            { title: "Product" },
            { title: "Status" },
            { title: "Inventory" },
            { title: "Category" },
          ]}
        >
          {visibleProducts.map((p, index) => {
            const image = p.images?.nodes?.[0];
            const category =
              p.productCategory?.productTaxonomyNode?.fullName || "Uncategorized";
            const invNum = typeof p.totalInventory === "number" ? p.totalInventory : null;
            const inventory = invNum === null ? "—" : `${invNum} in stock`;
            const numericId = safeNumericId(p.id);

            return (
              <IndexTable.Row
                id={p.id}
                key={p.id}
                position={index}
                selected={selectedResources.includes(p.id) || allResourcesSelected}
              >
                <IndexTable.Cell>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <Thumbnail
                      source={
                        image?.url ||
                        "https://cdn.shopify.com/static/images/placeholders/product-1.png"
                      }
                      alt={image?.altText || p.title}
                      size="medium"
                    />

                    <div>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/app/products/${numericId}`);
                        }}
                        style={{
                          all: "unset",
                          cursor: "pointer",
                          color: "#005bd3",
                          fontWeight: 600,
                        }}
                      >
                        {p.title}
                      </button>

                      <Text variant="bodySm" tone="subdued" as="p">
                        {p.handle}
                      </Text>
                    </div>
                  </div>
                </IndexTable.Cell>

                <IndexTable.Cell>
                  <Badge tone={statusBadgeTone(p.status)}>{p.status}</Badge>
                </IndexTable.Cell>

                <IndexTable.Cell>{inventory}</IndexTable.Cell>
                <IndexTable.Cell>{category}</IndexTable.Cell>
              </IndexTable.Row>
            );
          })}
        </IndexTable>
      </Card>
    </Page>
  );
}
