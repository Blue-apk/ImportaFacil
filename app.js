/* ==========================================
   IMPORTAFÁCIL
   JavaScript nativo + Supabase
   ========================================== */

"use strict";

const ImportaFacil = {
  products: [],
  editingProductId: null,
  currentView: "dashboard",
  currentUserId: null,
  loadingProducts: false,
  searchTerm: "",
  initialized: false,

  /* ---------- UTILIDADES ---------- */

  $(id) {
    return document.getElementById(id);
  },

  number(id, fallback = 0) {
    const element = this.$(id);
    if (!element || element.value.trim() === "") return fallback;

    const value = Number(element.value);
    return Number.isFinite(value) ? value : fallback;
  },

  money(value) {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Number(value) || 0);
  },

  setText(id, value) {
    const element = this.$(id);
    if (element) element.textContent = value;
  },

  showMessage(id, message, isError = false) {
    const element = this.$(id);
    if (!element) return;

    element.textContent = message;
    element.style.color = isError ? "#ff9999" : "#75e0c0";
  },

  escapeCSV(value) {
    const text = String(value ?? "");
    return `"${text.replace(/"/g, '""')}"`;
  },

  /* ---------- NAVEGACIÓN ---------- */

  showView(viewName) {
    const target = document.querySelector(
      `.view-section[data-section="${viewName}"]`
    );

    if (!target) return;

    this.currentView = viewName;

    document.querySelectorAll(".view-section").forEach((section) => {
      section.hidden = section !== target;
    });

    document.querySelectorAll(".nav-item[data-view]").forEach((button) => {
      const active = button.dataset.view === viewName;

      button.classList.toggle("active", active);

      if (active) {
        button.setAttribute("aria-current", "page");
      } else {
        button.removeAttribute("aria-current");
      }
    });

    if (
      this.currentUserId &&
      ["dashboard", "inventory", "finances"].includes(viewName)
    ) {
      this.loadProducts();
    }

    if (viewName === "calculator") {
      this.calculatePrices();
    }

    if (viewName === "imports") {
      this.calculateImportCosts();
    }

    this.closeMobileMenu();
  },

  closeMobileMenu() {
    const sidebar = this.$("sidebar");
    const overlay = document.querySelector(".mobile-overlay");

    if (sidebar) sidebar.classList.remove("active");
    if (overlay) overlay.classList.remove("active");
  },

  /* ---------- AUTENTICACIÓN ---------- */

  setAuthenticatedView(session) {
    const user = session?.user || null;
    const userId = user?.id || null;
    const loggedIn = Boolean(userId);

    const authSection = this.$("auth-section");
    const workspace = this.$("dashboard-content");
    const sidebar = this.$("sidebar");
    const logoutButton = this.$("logout-button");
    const status = document.querySelector(".connection-status");

    if (authSection) authSection.hidden = loggedIn;
    if (workspace) workspace.hidden = !loggedIn;
    if (sidebar) sidebar.hidden = !loggedIn;
    if (logoutButton) logoutButton.hidden = !loggedIn;

    if (status) {
      status.replaceChildren();

      const dot = document.createElement("span");
      dot.className = "status-dot";

      status.append(
        dot,
        document.createTextNode(
          loggedIn ? " Sesión activa" : " Sin sesión"
        )
      );
    }

    const previousUserId = this.currentUserId;
    this.currentUserId = userId;

    if (loggedIn && userId !== previousUserId) {
      this.showView("dashboard");
      this.loadRates();
      this.loadProducts();
    }

    if (!loggedIn) {
      this.products = [];
      this.editingProductId = null;
      this.searchTerm = "";

      const search = this.$("inventory-search");
      if (search) search.value = "";

      this.resetProductForm();
      this.renderProducts();
      this.resetCalculator();
      this.currentView = "dashboard";
    }
  },

  async handleAuth(action) {
    // Buscamos el formulario y los campos
    const form = this.$("login-form") || this.$("auth-form");
    const emailInput = this.$("login-email") || this.$("auth-email");
    const passwordInput = this.$("login-password") || this.$("auth-password");
    const loginButton = this.$("login-button");
    const registerButton = this.$("signup-button") || this.$("register-button");

    // Validación manual (reemplaza al reportValidity que causaba el error)
    if (!form || !emailInput.value || !passwordInput.value) {
      this.showMessage("auth-message", "Por favor, llena todos los campos.", true);
      this.showMessage("signup-message", "Por favor, llena todos los campos.", true);
      return;
    }

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (loginButton) loginButton.disabled = true;
    if (registerButton) registerButton.disabled = true;

    this.showMessage("auth-message", "Procesando...");
    this.showMessage("signup-message", "Procesando...");

    try {
      if (action === "register") {
        const result = await window.ImportaFacilAuth.register(email, password);
        this.showMessage("signup-message", result?.message || "Registro completado. Revisa tu correo.");
      } else {
        await window.ImportaFacilAuth.login(email, password);
        this.showMessage("auth-message", "Sesión iniciada correctamente.");
      }
    } catch (error) {
      console.error("Error de autenticación:", error);
      this.showMessage("auth-message", error.message || "No se pudo iniciar sesión.", true);
      this.showMessage("signup-message", error.message || "No se pudo registrar.", true);
    } finally {
      if (loginButton) loginButton.disabled = false;
      if (registerButton) registerButton.disabled = false;
    }
  },

  async handleLogout() {
    const button = this.$("logout-button");
    if (button) button.disabled = true;

    try {
      await window.ImportaFacilAuth.logout();
      this.showMessage("auth-message", "Sesión cerrada correctamente.");
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
      this.showMessage("auth-message", error.message || "No se pudo cerrar la sesión.", true);
    } finally {
      if (button) button.disabled = false;
    }
  },

  /* ---------- TASAS ---------- */

  async loadRates() {
    const bcv = this.$("rate-bcv");
    const euro = this.$("rate-euro");
    const usdt = this.$("rate-usdt");
    const button = this.$("refresh-rates-btn");

    if (!bcv || !euro || !usdt) return;

    if (button) {
      button.disabled = true;
      button.textContent = "Cargando...";
    }

    const fetchRate = async (url) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error("No disponible");

      const data = await response.json();
      return Number(data.promedio || data.venta || 0);
    };

    try {
      const [dollarRate, euroRate] = await Promise.all([
        fetchRate("https://ve.dolarapi.com/v1/dolares/oficial"),
        fetchRate("https://ve.dolarapi.com/v1/euros/oficial")
      ]);

      bcv.textContent = dollarRate ? `${dollarRate.toFixed(2)} Bs.` : "N/D";
      euro.textContent = euroRate ? `${euroRate.toFixed(2)} Bs.` : "N/D";
    } catch (error) {
      console.error("Error al consultar tasas BCV:", error);
      bcv.textContent = "N/D";
      euro.textContent = "N/D";
    }

    try {
      const response = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=USDTVES");
      if (!response.ok) throw new Error("Tasa no disponible");

      const data = await response.json();
      const rate = Number(data.price);

      usdt.textContent = Number.isFinite(rate) ? `${rate.toFixed(2)} Bs.` : "N/D";
    } catch (error) {
      console.error("Error al consultar USDT:", error);
      usdt.textContent = "N/D";
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "↻ Actualizar";
      }
    }
  },

  /* ---------- SUPABASE / INVENTARIO ---------- */

  getUnitCost(product) {
    return (
      Number(product.purchase_unit_usd || 0) +
      Number(product.shipping_unit_usd || 0) +
      Number(product.other_cost_unit_usd || 0)
    );
  },

  async loadProducts() {
    if (this.loadingProducts || !this.currentUserId) return;

    this.loadingProducts = true;

    if (this.currentView === "inventory") {
      this.showMessage("inventory-message", "Cargando productos...");
    }

    try {
      const { data, error } = await window.supabaseClient
        .from("products")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      this.products = data || [];
      this.renderProducts();

      if (this.currentView === "inventory") {
        this.showMessage(
          "inventory-message",
          this.products.length
            ? "Inventario actualizado correctamente."
            : "Todavía no tienes productos registrados."
        );
      }
    } catch (error) {
      console.error("Error al cargar inventario:", error);
      this.showMessage("inventory-message", error.message || "No se pudo cargar el inventario.", true);
    } finally {
      this.loadingProducts = false;
    }
  },

  renderProducts() {
    this.renderDashboard();
    this.renderInventory();
  },

  renderDashboard() {
    const totalProducts = this.products.length;

    const investment = this.products.reduce((total, product) => {
      return total + Number(product.quantity || 0) * this.getUnitCost(product);
    }, 0);

    const sales = this.products.reduce((total, product) => {
      const cost = this.getUnitCost(product);
      const margin = Number(product.retail_margin ?? 0.35);
      const safeMargin = margin >= 0 && margin < 1 ? margin : 0;
      const price = cost / (1 - safeMargin);

      return total + price * Number(product.quantity || 0);
    }, 0);

    this.setText("product-count", totalProducts);
    this.setText("total-investment", this.money(investment));
    this.setText("potential-sales", this.money(sales));
    this.setText("potential-profit", this.money(sales - investment));

    this.setText("inventory-product-count", totalProducts);

    const units = this.products.reduce(
      (total, product) => total + Number(product.quantity || 0), 0
    );

    this.setText("inventory-unit-count", units);
    this.setText("inventory-total-value", this.money(investment));
  },

  renderInventory() {
    const body = this.$("inventory-table-body");
    if (!body) return;

    body.replaceChildren();

    const term = this.searchTerm.toLowerCase();

    const filtered = this.products.filter((product) => {
      const name = String(product.name || "").toLowerCase();
      const sku = String(product.sku || "").toLowerCase();

      return name.includes(term) || sku.includes(term);
    });

    if (!filtered.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");

      cell.colSpan = 5;
      cell.textContent = this.products.length
        ? "No se encontraron productos."
        : "Todavía no tienes productos registrados.";

      row.appendChild(cell);
      body.appendChild(row);
      return;
    }

    filtered.forEach((product) => {
      const row = document.createElement("tr");

      const nameCell = document.createElement("td");
      nameCell.textContent = product.name || "Sin nombre";

      const skuCell = document.createElement("td");
      skuCell.textContent = product.sku || "—";

      const quantityCell = document.createElement("td");
      const quantityInput = document.createElement("input");

      quantityInput.type = "number";
      quantityInput.min = "0";
      quantityInput.step = "1";
      quantityInput.value = product.quantity;
      quantityInput.className = "inline-quantity-input";

      if (Number(product.quantity) <= 5) {
        quantityInput.classList.add("low-stock");
        quantityInput.title = "Quedan pocas unidades";
      }

      quantityInput.addEventListener("change", async () => {
        const quantity = Number(quantityInput.value);

        if (!Number.isInteger(quantity) || quantity < 0) {
          quantityInput.value = product.quantity;
          alert("La cantidad debe ser un entero mayor o igual a cero.");
          return;
        }

        quantityInput.disabled = true;

        try {
          const { error } = await window.supabaseClient
            .from("products")
            .update({ quantity })
            .eq("id", product.id);

          if (error) throw error;

          product.quantity = quantity;
          this.renderProducts();
        } catch (error) {
          console.error("Error al actualizar existencias:", error);
          quantityInput.value = product.quantity;
          alert("No se pudo actualizar la cantidad.");
        } finally {
          quantityInput.disabled = false;
        }
      });

      quantityCell.appendChild(quantityInput);

      const costCell = document.createElement("td");
      costCell.textContent = this.money(this.getUnitCost(product));

      const actionsCell = document.createElement("td");
      actionsCell.className = "table-actions"; // Clase para agrupar y alinear

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.textContent = "Editar";
      editButton.className = "btn btn-secondary btn-sm"; // ESTILO VERDE
      editButton.addEventListener("click", () => {
        this.editProduct(product.id);
      });

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.textContent = "Eliminar";
      deleteButton.className = "btn btn-danger btn-sm"; // ESTILO ROJO
      deleteButton.addEventListener("click", () => {
        this.deleteProduct(product.id);
      });

      actionsCell.append(editButton, deleteButton);
      row.append(nameCell, skuCell, quantityCell, costCell, actionsCell);
      body.appendChild(row);
    });
  },

  /* ---------- FORMULARIO DE PRODUCTOS ---------- */

  openProductForm(product = null) {
    const section = this.$("product-form-section");
    const title = section?.querySelector("h2");
    const button = this.$("save-product-button");

    if (!section) return;

    this.editingProductId = product?.id || null;

    if (title) {
      title.textContent = product ? "Editar producto" : "Agregar producto";
    }

    if (button) {
      button.textContent = product ? "Guardar cambios" : "Guardar producto";
    }

    this.$("product-name").value = product?.name || "";
    this.$("product-sku").value = product?.sku || "";
    this.$("product-quantity").value = product?.quantity ?? 0;
    this.$("product-purchase-cost").value = product?.purchase_unit_usd ?? 0;
    this.$("product-shipping-cost").value = product?.shipping_unit_usd ?? 0;
    this.$("product-other-cost").value = product?.other_cost_unit_usd ?? 0;

    section.hidden = false;
    section.scrollIntoView({ behavior: "smooth", block: "start" });
    this.$("product-name").focus();
  },

  resetProductForm() {
    const form = this.$("product-form");
    const section = this.$("product-form-section");

    if (form) form.reset();
    if (section) section.hidden = true;

    this.editingProductId = null;

    const button = this.$("save-product-button");
    const title = section?.querySelector("h2");

    if (button) button.textContent = "Guardar producto";
    if (title) title.textContent = "Agregar producto";
  },

  async saveProduct(event) {
    event.preventDefault();

    const form = this.$("product-form");
    const button = this.$("save-product-button");

    if (!form || !form.reportValidity()) return;

    const product = {
      user_id: this.currentUserId,
      name: this.$("product-name").value.trim(),
      sku: this.$("product-sku").value.trim() || null,
      quantity: Number(this.$("product-quantity").value),
      purchase_unit_usd: Number(this.$("product-purchase-cost").value),
      shipping_unit_usd: Number(this.$("product-shipping-cost").value),
      other_cost_unit_usd: Number(this.$("product-other-cost").value)
    };

    const valid =
      product.name &&
      Number.isInteger(product.quantity) &&
      product.quantity >= 0 &&
      product.purchase_unit_usd >= 0 &&
      product.shipping_unit_usd >= 0 &&
      product.other_cost_unit_usd >= 0;

    if (!valid) {
      this.showMessage("inventory-message", "Revisa el nombre, la cantidad y los costos.", true);
      return;
    }

    const editingId = this.editingProductId;

    if (button) {
      button.disabled = true;
      button.textContent = "Guardando...";
    }

    try {
      let result;

      if (editingId) {
        result = await window.supabaseClient
          .from("products")
          .update(product)
          .eq("id", editingId);
      } else {
        result = await window.supabaseClient
          .from("products")
          .insert(product);
      }

      if (result.error) throw result.error;

      this.resetProductForm();
      await this.loadProducts();

      this.showMessage("inventory-message", editingId ? "Producto actualizado correctamente." : "Producto guardado correctamente.");
    } catch (error) {
      console.error("Error al guardar producto:", error);
      this.showMessage("inventory-message", error.message || "No se pudo guardar el producto.", true);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = this.editingProductId ? "Guardar cambios" : "Guardar producto";
      }
    }
  },

  editProduct(productId) {
    const product = this.products.find((item) => item.id === productId);
    if (product) this.openProductForm(product);
  },

  async deleteProduct(productId) {
    const product = this.products.find((item) => item.id === productId);
    if (!product) return;

    const confirmed = confirm(`¿Seguro que deseas eliminar "${product.name}"? Esta acción no se puede deshacer.`);
    if (!confirmed) return;

    try {
      const { error } = await window.supabaseClient
        .from("products")
        .delete()
        .eq("id", productId);

      if (error) throw error;

      await this.loadProducts();
      this.showMessage("inventory-message", "Producto eliminado correctamente.");
    } catch (error) {
      console.error("Error al eliminar producto:", error);
      this.showMessage("inventory-message", error.message || "No se pudo eliminar el producto.", true);
    }
  },

  /* ---------- EXPORTAR INVENTARIO ---------- */

  exportInventoryToCSV() {
    if (!this.products.length) {
      this.showMessage("inventory-message", "No hay productos para exportar.", true);
      return;
    }

    const headers = [
      "Producto", "SKU", "Existencias", "Costo de compra", "Envío por unidad", "Otros costos", "Costo real unitario"
    ];

    const rows = this.products.map((product) => [
      product.name, product.sku || "", product.quantity, product.purchase_unit_usd, product.shipping_unit_usd, product.other_cost_unit_usd, this.getUnitCost(product).toFixed(2)
    ]);

    const csv = [
      headers.map((value) => this.escapeCSV(value)).join(","),
      ...rows.map((row) => row.map((value) => this.escapeCSV(value)).join(","))
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `inventario_importafacil_${new Date().toISOString().slice(0, 10)}.csv`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
    this.showMessage("inventory-message", "Inventario exportado correctamente.");
  },

  /* ---------- CALCULADORA DE IMPORTACIONES ---------- */

  getCalculatorItems() {
    const container = this.$("calculator-items");
    if (!container) return [];

    return Array.from(container.querySelectorAll("[data-calculator-item]")).map((row) => ({
      row,
      name: row.querySelector(".calculator-item-name")?.value.trim() || "",
      quantity: Number(row.querySelector(".calculator-item-quantity")?.value || 0),
      purchaseUnit: Number(row.querySelector(".calculator-item-cost")?.value || 0),
      subtotalOutput: row.querySelector(".calculator-item-subtotal")
    }));
  },

  addCalculatorItem(values = {}) {
    const container = this.$("calculator-items");
    if (!container) return;

    const row = document.createElement("div");
    row.className = "calculator-item-row";
    row.dataset.calculatorItem = "";

    const fields = [
      { label: "Producto", className: "calculator-item-name", type: "text", placeholder: "Nombre del producto", value: values.name || "" },
      { label: "Cantidad", className: "calculator-item-quantity", type: "number", min: "1", step: "1", value: String(values.quantity ?? 1) },
      { label: "Costo unitario ($)", className: "calculator-item-cost", type: "number", min: "0", step: "0.01", value: String(values.purchaseUnit ?? 0) }
    ];

    fields.forEach((field) => {
      const wrapper = document.createElement("div");
      wrapper.className = "field";
      const label = document.createElement("label");
      const input = document.createElement("input");

      label.textContent = field.label;
      input.type = field.type;
      input.className = field.className;
      input.value = field.value;

      if (field.placeholder) input.placeholder = field.placeholder;
      if (field.min !== undefined) input.min = field.min;
      if (field.step !== undefined) input.step = field.step;

      input.addEventListener("input", () => this.calculatePrices());

      wrapper.append(label, input);
      row.appendChild(wrapper);
    });

    const subtotalWrapper = document.createElement("div");
    subtotalWrapper.className = "field";
    const subtotalLabel = document.createElement("label");
    const subtotal = document.createElement("output");

    subtotalLabel.textContent = "Subtotal";
    subtotal.className = "calculator-item-subtotal";
    subtotal.textContent = this.money(0);

    subtotalWrapper.append(subtotalLabel, subtotal);
    row.appendChild(subtotalWrapper);

    const removeButton = document.createElement("button");

    removeButton.type = "button";
    removeButton.className = "calculator-remove-item";
    removeButton.textContent = "✕";
    removeButton.title = "Eliminar producto";
    removeButton.setAttribute("aria-label", "Eliminar producto");

    removeButton.addEventListener("click", () => {
      const rows = container.querySelectorAll("[data-calculator-item]");

      if (rows.length <= 1) {
        row.querySelector(".calculator-item-name").value = "";
        row.querySelector(".calculator-item-quantity").value = "1";
        row.querySelector(".calculator-item-cost").value = "0";
      } else {
        row.remove();
      }

      this.calculatePrices();
    });

    row.appendChild(removeButton);
    container.appendChild(row);

    this.calculatePrices();
  },

  getCalculatorCalculation() {
    const items = this.getCalculatorItems();

    const shippingTotal = Math.max(0, this.number("calculator-shipping-total"));
    const otherTotal = Math.max(0, this.number("calculator-other-total"));

    const activeItems = items.filter((item) => item.name || item.purchaseUnit > 0);

    const productsSubtotal = activeItems.reduce((total, item) => {
      return total + item.quantity * item.purchaseUnit;
    }, 0);

    const sharedCosts = shippingTotal + otherTotal;

    const retailMargin = this.number("calculator-retail-margin", 35);
    const wholesaleMargin = this.number("calculator-wholesale-margin", 20);

    const validMargins = retailMargin >= 0 && wholesaleMargin >= 0;

    const calculatedItems = activeItems.map((item) => {
      const purchaseSubtotal = item.quantity * item.purchaseUnit;
      const proportion = productsSubtotal > 0 ? purchaseSubtotal / productsSubtotal : 0;

      const allocatedShipping = shippingTotal * proportion;
      const allocatedOther = otherTotal * proportion;

      const shippingPerUnit = item.quantity > 0 ? allocatedShipping / item.quantity : 0;
      const otherPerUnit = item.quantity > 0 ? allocatedOther / item.quantity : 0;

      const unitCost = item.purchaseUnit + shippingPerUnit + otherPerUnit;

      // NUEVA FÓRMULA DE MARKUP (Costo * (1 + Margen/100))
      const retailPrice = validMargins ? unitCost * (1 + (retailMargin / 100)) : 0;
      const wholesalePrice = validMargins ? unitCost * (1 + (wholesaleMargin / 100)) : 0;

      return {
        ...item,
        purchaseSubtotal,
        allocatedShipping,
        allocatedOther,
        shippingPerUnit,
        otherPerUnit,
        unitCost,
        retailPrice,
        wholesalePrice,
        retailProfit: (retailPrice - unitCost) * item.quantity,
        wholesaleProfit: (wholesalePrice - unitCost) * item.quantity
      };
    });

    const totalUnits = calculatedItems.reduce((total, item) => {
      return total + (Number.isInteger(item.quantity) && item.quantity > 0 ? item.quantity : 0);
    }, 0);

    const retailSales = calculatedItems.reduce((total, item) => total + item.retailPrice * item.quantity, 0);
    const wholesaleSales = calculatedItems.reduce((total, item) => total + item.wholesalePrice * item.quantity, 0);
    const retailProfit = calculatedItems.reduce((total, item) => total + item.retailProfit, 0);
    const wholesaleProfit = calculatedItems.reduce((total, item) => total + item.wholesaleProfit, 0);

    return {
      items: calculatedItems,
      productsSubtotal,
      sharedCosts,
      investment: productsSubtotal + sharedCosts,
      totalUnits,
      retailSales,
      wholesaleSales,
      retailProfit,
      wholesaleProfit,
      validMargins,
      allocationValid: productsSubtotal > 0 || sharedCosts === 0
    };
  },

  calculatePrices() {
    const result = this.getCalculatorCalculation();

    const invalidItems = result.items.some((item) => {
      return (
        !Number.isInteger(item.quantity) || item.quantity < 1 ||
        !Number.isFinite(item.purchaseUnit) || item.purchaseUnit < 0
      );
    });

    result.items.forEach((item) => {
      if (item.subtotalOutput) {
        item.subtotalOutput.textContent = this.money(item.purchaseSubtotal);
      }
    });

    // 1. Tarjetas del Paso 02 (Sin las palabras "unidades" ni "$")
    this.setText("calculator-products-subtotal", this.money(result.productsSubtotal));
    this.setText("calculator-total-units", result.totalUnits);
    this.setText("calculator-products-total", result.items.length);

    // 2. Tarjetas del Paso 03 y 04
    this.setText("calculator-shared-costs", this.money(result.sharedCosts));
    this.setText("calculator-order-investment", this.money(result.investment));

    // 3. Promedio de Precios Unitarios para el Paso 05
    let avgRetailUnitPrice = 0;
    let avgWholesaleUnitPrice = 0;

    if (result.totalUnits > 0) {
      const sumRetailPrices = result.items.reduce((sum, item) => sum + (item.retailPrice * item.quantity), 0);
      const sumWholesalePrices = result.items.reduce((sum, item) => sum + (item.wholesalePrice * item.quantity), 0);
      
      avgRetailUnitPrice = sumRetailPrices / result.totalUnits;
      avgWholesaleUnitPrice = sumWholesalePrices / result.totalUnits;
    }

    this.setText("calculator-retail-unit-price", this.money(avgRetailUnitPrice));
    this.setText("calculator-wholesale-unit-price", this.money(avgWholesaleUnitPrice));

    // 4. Totales y Ganancias del Paso 05
    this.setText("calculator-retail-sales", this.money(result.retailSales));
    this.setText("calculator-retail-profit", this.money(result.retailProfit));
    this.setText("calculator-wholesale-sales", this.money(result.wholesaleSales));
    this.setText("calculator-wholesale-profit", this.money(result.wholesaleProfit));

    /* Impuestos opcionales */
    const taxEnabled = this.$("calculator-tax-enabled")?.checked || false;
    const taxRate = this.number("calculator-tax-rate") / 100;
    const taxMode = this.$("calculator-tax-mode")?.value || "added";
    const taxResults = this.$("calculator-tax-results");

    const validTaxRate = taxRate >= 0 && taxRate <= 1;

    if (taxEnabled && taxRate > 0 && validTaxRate && !invalidItems && result.validMargins) {
      const taxFactor = taxMode === "included" ? taxRate / (1 + taxRate) : taxRate;

      const retailTax = result.retailSales * taxFactor;
      const wholesaleTax = result.wholesaleSales * taxFactor;

      const retailFinal = taxMode === "added" ? result.retailSales + retailTax : result.retailSales;
      const wholesaleFinal = taxMode === "added" ? result.wholesaleSales + wholesaleTax : result.wholesaleSales;

      if (taxResults) taxResults.hidden = false;

      this.setText("calculator-retail-total-tax", this.money(retailTax));
      this.setText("calculator-retail-final-price", this.money(retailFinal));
      this.setText("calculator-wholesale-total-tax", this.money(wholesaleTax));
      this.setText("calculator-wholesale-final-price", this.money(wholesaleFinal));
    } else if (taxResults) {
      taxResults.hidden = true;
    }

    /* Mensajes de validación */
    if (invalidItems) {
      this.showMessage("calculator-message", "Verifica que cada producto tenga una cantidad entera mayor que cero y costos válidos.", true);
    } else if (!result.validMargins) {
      this.showMessage("calculator-message", "Los márgenes no pueden ser negativos.", true);
    } else if (!validTaxRate) {
      this.showMessage("calculator-message", "La tasa de impuesto debe estar entre 0 y 100 %.", true);
    } else if (!result.allocationValid) {
      this.showMessage("calculator-message", "Agrega costos de compra para distribuir los gastos compartidos.", true);
    } else {
      this.showMessage("calculator-message", "Cálculo actualizado. Los gastos compartidos se distribuyen según el valor de compra.");
    }

    return result;
  },

  resetCalculator() {
    const orderName = this.$("calculator-order-name");
    const orderDate = this.$("calculator-order-date");

    if (orderName) orderName.value = "";

    if (orderDate) {
      const now = new Date();
      const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
      orderDate.value = localDate.toISOString().slice(0, 10);
    }

    ["calculator-shipping-total", "calculator-other-total"].forEach((id) => {
      const input = this.$(id);
      if (input) input.value = "0";
    });

    const retail = this.$("calculator-retail-margin");
    const wholesale = this.$("calculator-wholesale-margin");

    if (retail) retail.value = "35";
    if (wholesale) wholesale.value = "20";

    const taxEnabled = this.$("calculator-tax-enabled");
    const taxRate = this.$("calculator-tax-rate");
    const taxMode = this.$("calculator-tax-mode");

    if (taxEnabled) taxEnabled.checked = false;
    if (taxRate) taxRate.value = "";
    if (taxMode) taxMode.value = "added";

    const taxOptions = this.$("calculator-tax-options");
    const taxResults = this.$("calculator-tax-results");

    if (taxOptions) taxOptions.hidden = true;
    if (taxResults) taxResults.hidden = true;

    const container = this.$("calculator-items");

    if (container) {
      container.replaceChildren();
      this.addCalculatorItem();
    }

    this.calculatePrices();
  },

  initCalculator() {
    const dateInput = this.$("calculator-order-date");

    if (dateInput && !dateInput.value) {
      const now = new Date();
      const localDate = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
      dateInput.value = localDate.toISOString().slice(0, 10);
    }

    const container = this.$("calculator-items");

    if (container) {
      container.querySelectorAll("[data-calculator-item]").forEach((row) => {
        row.querySelectorAll("input").forEach((input) => {
          input.addEventListener("input", () => this.calculatePrices());
        });

        const removeButton = row.querySelector(".calculator-remove-item");

        if (removeButton) {
          removeButton.addEventListener("click", () => {
            const rows = container.querySelectorAll("[data-calculator-item]");

            if (rows.length <= 1) {
              row.querySelector(".calculator-item-name").value = "";
              row.querySelector(".calculator-item-quantity").value = "1";
              row.querySelector(".calculator-item-cost").value = "0";
            } else {
              row.remove();
            }

            this.calculatePrices();
          });
        }
      });
    }

    const addButton = this.$("calculator-add-item");

    if (addButton) {
      addButton.addEventListener("click", () => {
        this.addCalculatorItem();
      });
    }

    [
      "calculator-shipping-total",
      "calculator-other-total",
      "calculator-retail-margin",
      "calculator-wholesale-margin",
      "calculator-tax-rate"
    ].forEach((id) => {
      const input = this.$(id);

      if (input) {
        input.addEventListener("input", () => this.calculatePrices());
      }
    });

    const taxEnabled = this.$("calculator-tax-enabled");
    const taxOptions = this.$("calculator-tax-options");

    if (taxEnabled) {
      taxEnabled.addEventListener("change", () => {
        if (taxOptions) {
          taxOptions.hidden = !taxEnabled.checked;
        }
        this.calculatePrices();
      });
    }

    const taxMode = this.$("calculator-tax-mode");

    if (taxMode) {
      taxMode.addEventListener("change", () => this.calculatePrices());
    }

    ["calculator-reset", "calculator-reset-bottom"].forEach((id) => {
      const button = this.$(id);

      if (button) {
        button.addEventListener("click", () => this.resetCalculator());
      }
    });

    const saveButton = this.$("calculator-save-to-inventory");

    if (saveButton) {
      saveButton.addEventListener("click", () => {
        this.saveCalculatedProduct();
      });
    }

    this.calculatePrices();
  },

  async saveCalculatedProduct() {
    const button = this.$("calculator-save-to-inventory");
    const calculation = this.calculatePrices();

    const allItems = this.getCalculatorItems();

    const validItems = allItems.filter((item) => {
      return (
        item.name &&
        Number.isInteger(item.quantity) &&
        item.quantity >= 1 &&
        Number.isFinite(item.purchaseUnit) &&
        item.purchaseUnit >= 0
      );
    });

    if (validItems.length !== allItems.length || !validItems.length) {
      this.showMessage("calculator-message", "Completa el nombre, la cantidad y el costo de compra de todos los productos.", true);
      return;
    }

    if (!calculation.validMargins || !calculation.allocationValid) {
      this.showMessage("calculator-message", "Corrige los márgenes y los costos antes de guardar.", true);
      return;
    }

    if (!this.currentUserId) {
      this.showMessage("calculator-message", "Debes iniciar sesión para guardar productos.", true);
      return;
    }

    const retailMargin = this.number("calculator-retail-margin", 35) / 100;
    const wholesaleMargin = this.number("calculator-wholesale-margin", 20) / 100;

    const records = calculation.items.map((item) => ({
      user_id: this.currentUserId,
      name: item.name,
      sku: null,
      quantity: item.quantity,
      purchase_unit_usd: item.purchaseUnit,
      shipping_unit_usd: item.shippingPerUnit,
      other_cost_unit_usd: item.otherPerUnit,
      retail_margin: retailMargin,
      wholesale_margin: wholesaleMargin
    }));

    if (button) {
      button.disabled = true;
      button.textContent = "Guardando...";
    }

    try {
      const { error } = await window.supabaseClient.from("products").insert(records);
      if (error) throw error;

      await this.loadProducts();
      this.showMessage("calculator-message", `${records.length} producto(s) guardado(s) en el inventario correctamente.`);
    } catch (error) {
      console.error("Error al guardar productos:", error);
      this.showMessage("calculator-message", error.message || "No se pudieron guardar los productos.", true);
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Guardar en Inventario";
      }
    }
  },

  /* ---------- IMPORTACIONES ---------- */

  calculateImportCosts() {
    const quantity = this.number("import-quantity", 1);
    const productCost = this.number("import-product-cost");
    const shippingCost = this.number("import-shipping-cost");
    const otherCosts = this.number("import-other-costs");

    if (!Number.isInteger(quantity) || quantity < 1) {
      this.setText("import-unit-result", this.money(0));
      return;
    }

    const totalCost = productCost + shippingCost + otherCosts;
    const unitCost = totalCost / quantity;

    this.setText("import-unit-result", this.money(unitCost));
  },

  initImports() {
    [
      "import-quantity", "import-product-cost", "import-shipping-cost", "import-other-costs"
    ].forEach((id) => {
      const input = this.$(id);

      if (input) {
        input.addEventListener("input", () => {
          this.calculateImportCosts();
        });
      }
    });

    const sendButton = this.$("import-send-to-calculator");

    if (!sendButton) return;

    sendButton.addEventListener("click", () => {
      const quantity = this.number("import-quantity", 1);
      const productCost = this.number("import-product-cost");
      const shippingCost = this.number("import-shipping-cost");
      const otherCosts = this.number("import-other-costs");

      if (
        !Number.isInteger(quantity) || quantity < 1 || productCost < 0 || shippingCost < 0 || otherCosts < 0 || productCost + shippingCost + otherCosts <= 0
      ) {
        alert("Ingresa una cantidad y costos válidos antes de continuar.");
        return;
      }

      this.showView("calculator");
      this.resetCalculator();

      const container = this.$("calculator-items");
      const firstRow = container?.querySelector("[data-calculator-item]");

      if (firstRow) {
        firstRow.querySelector(".calculator-item-name").value = "Importación";
        firstRow.querySelector(".calculator-item-quantity").value = String(quantity);
        firstRow.querySelector(".calculator-item-cost").value = (productCost / quantity).toFixed(2);
      }

      this.$("calculator-shipping-total").value = shippingCost.toFixed(2);
      this.$("calculator-other-total").value = otherCosts.toFixed(2);

      this.calculatePrices();
    });
  },

  /* ---------- INICIALIZACIÓN ---------- */

  initMobileMenu() {
    const button = this.$("mobile-menu-btn");
    const sidebar = this.$("sidebar");

    if (!button || !sidebar) return;

    let overlay = document.querySelector(".mobile-overlay");

    if (!overlay) {
      overlay = document.createElement("div");
      overlay.className = "mobile-overlay";
      document.body.appendChild(overlay);
    }

    const toggleMenu = () => {
      sidebar.classList.toggle("active");
      overlay.classList.toggle("active");
    };

    button.addEventListener("click", toggleMenu);
    overlay.addEventListener("click", () => this.closeMobileMenu());
  },

  initEvents() {
    // --- LOGIN Y REGISTRO ---
    const loginForm = this.$("login-form") || this.$("auth-form");

    if (loginForm) {
      loginForm.addEventListener("submit", (event) => {
        event.preventDefault();
        this.handleAuth("login");
      });
    }

    const signupForm = this.$("signup-form");
    if (signupForm) {
      signupForm.addEventListener("submit", (event) => {
        event.preventDefault();
        this.handleAuth("register");
      });
    }

    const showSignupBtn = this.$("show-signup-button");
    const showLoginBtn = this.$("show-login-button");

    if (showSignupBtn && showLoginBtn && loginForm && signupForm) {
      showSignupBtn.addEventListener("click", () => {
        loginForm.hidden = true;
        showSignupBtn.hidden = true;
        signupForm.hidden = false;
        showLoginBtn.hidden = false;
      });

      showLoginBtn.addEventListener("click", () => {
        signupForm.hidden = true;
        showLoginBtn.hidden = true;
        loginForm.hidden = false;
        showSignupBtn.hidden = false;
      });
    }

    const logoutButton = this.$("logout-button");
    if (logoutButton) {
      logoutButton.addEventListener("click", () => this.handleLogout());
    }

    // --- NAVEGACIÓN ---
    document.querySelectorAll(".nav-item[data-view]").forEach((button) => {
      button.addEventListener("click", () => {
        this.showView(button.dataset.view);
      });
    });

    // --- INVENTARIO ---
    const addButton = this.$("add-product-button");
    if (addButton) {
      addButton.addEventListener("click", () => this.openProductForm());
    }

    const cancelButton = this.$("cancel-product-button");
    if (cancelButton) {
      cancelButton.addEventListener("click", () => this.resetProductForm());
    }

    const productForm = this.$("product-form");
    if (productForm) {
      productForm.addEventListener("submit", (event) => {
        this.saveProduct(event);
      });
    }

    const searchInput = this.$("inventory-search");
    if (searchInput) {
      searchInput.addEventListener("input", () => {
        this.searchTerm = searchInput.value.trim();
        this.renderInventory();
      });
    }

    const exportButton = this.$("export-inventory-button");
    if (exportButton) {
      exportButton.addEventListener("click", () => this.exportInventoryToCSV());
    }

    const refreshButton = this.$("refresh-rates-btn");
    if (refreshButton) {
      refreshButton.addEventListener("click", () => this.loadRates());
    }

    this.initMobileMenu();
    this.initCalculator();
    this.initImports();
  },

  async init() {
    if (this.initialized) return;

    this.initialized = true;

    this.setText("product-count", "0");
    this.setText("total-investment", this.money(0));
    this.setText("potential-sales", this.money(0));
    this.setText("potential-profit", this.money(0));

    this.initEvents();

    try {
      window.ImportaFacilAuth.onSessionChange((_event, session) => {
        this.setAuthenticatedView(session);
      });

      const session = await window.ImportaFacilAuth.getSession();
      this.setAuthenticatedView(session);
    } catch (error) {
      console.error("Error al comprobar la sesión:", error);
      this.setAuthenticatedView(null);
      this.showMessage("auth-message", "No se pudo comprobar tu sesión. Recarga la página.", true);
    }

    console.info("ImportaFácil se inició correctamente.");
  }
};

/* ---------- ARRANQUE ---------- */

document.addEventListener("DOMContentLoaded", () => {
  ImportaFacil.init();
});