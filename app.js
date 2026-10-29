/* =================================
   IMPORTAFÁCIL — LÓGICA PRINCIPAL
   ================================= */

"use strict";

const ImportaFacil = {
  products: [],
  editingProductId: null,
  loadingProducts: false,
  currentView: "dashboard",
  initialized: false,
  searchTerm: "",

  formatMoney(amount) {
    return new Intl.NumberFormat("es-VE", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Number(amount) || 0);
  },

  formatPercent(value) {
    return `${(Number(value) || 0).toFixed(2).replace(".", ",")}%`;
  },

  setText(id, value) {
    const element = document.getElementById(id);
    if (element) element.textContent = value;
  },

  getNumber(id, fallback = 0) {
    const element = document.getElementById(id);
    if (!element || element.value.trim() === "") return fallback;

    const value = Number(element.value);
    return Number.isFinite(value) ? value : fallback;
  },

  showMessage(message, isError = false) {
    const element = document.getElementById("auth-message");
    if (!element) return;
    element.textContent = message;
    element.style.color = isError ? "#ff9999" : "#75e0c0";
  },

  showInventoryMessage(message, isError = false) {
    const element = document.getElementById("inventory-message");
    if (!element) return;
    element.textContent = message;
    element.style.color = isError ? "#ff9999" : "#75e0c0";
  },

  showCalculatorMessage(message, isError = false) {
    const element = document.getElementById("calculator-message");
    if (!element) return;
    element.textContent = message;
    element.style.color = isError ? "#ff9999" : "#75e0c0";
  },

  showView(viewName) {
    const targetSection = document.querySelector(
      `.view-section[data-section="${viewName}"]`
    );

    if (!targetSection) return;

    this.currentView = viewName;

    document.querySelectorAll(".view-section").forEach((section) => {
      section.hidden = section !== targetSection;
    });

    document.querySelectorAll(".nav-item[data-view]").forEach((item) => {
      const isActive = item.dataset.view === viewName;

      item.classList.toggle("active", isActive);

      if (isActive) {
        item.setAttribute("aria-current", "page");
      } else {
        item.removeAttribute("aria-current");
      }
    });

    if (
      viewName === "inventory" ||
      viewName === "calculator" ||
      viewName === "finances"
    ) {
      this.loadProducts();
    }

    if (viewName === "calculator") {
      this.calculatePrices();
    }
    
    if (viewName === "imports") {
      this.calculateImportCosts();
    }

    // Cerrar menú móvil al cambiar de vista
    if (window.innerWidth <= 850) {
      const sidebar = document.getElementById("sidebar");
      const overlay = document.querySelector(".mobile-overlay");
      if (sidebar) sidebar.classList.remove("active");
      if (overlay) overlay.classList.remove("active");
    }
  },

  showAuthenticatedView(session) {
    const authSection = document.getElementById("auth-section");
    const dashboard = document.getElementById("dashboard-content");
    const sidebar = document.getElementById("sidebar");
    const logoutButton = document.getElementById("logout-button");
    const status = document.querySelector(".connection-status");

    const isLoggedIn = Boolean(session);

    if (authSection) authSection.hidden = isLoggedIn;
    if (dashboard) dashboard.hidden = !isLoggedIn;
    if (sidebar) sidebar.hidden = !isLoggedIn;
    if (logoutButton) logoutButton.hidden = !isLoggedIn;

    if (status) {
      status.replaceChildren();
      const dot = document.createElement("span");
      dot.className = "status-dot";
      status.appendChild(dot);
      status.appendChild(
        document.createTextNode(isLoggedIn ? " Sesión activa" : " Sin sesión")
      );
    }

    if (isLoggedIn) {
      if (!this.initialized) {
        this.showView("dashboard");
        this.loadRates();
      }
    } else {
      this.products = [];
      this.editingProductId = null;
      this.searchTerm = "";
      
      const searchInput = document.getElementById("inventory-search");
      if (searchInput) searchInput.value = "";

      this.resetProductForm();
      this.renderProducts();
      this.populateCalculatorProducts();
      this.resetCalculator();
      this.currentView = "dashboard";
    }

    this.initialized = true;
  },

  async handleAuth(action) {
    const form = document.getElementById("auth-form");
    const emailInput = document.getElementById("auth-email");
    const passwordInput = document.getElementById("auth-password");
    const loginButton = document.getElementById("login-button");
    const registerButton = document.getElementById("register-button");

    if (!form || !emailInput || !passwordInput) return;
    if (!form.reportValidity()) return;

    const email = emailInput.value.trim();
    const password = passwordInput.value;

    if (loginButton) loginButton.disabled = true;
    if (registerButton) registerButton.disabled = true;

    this.showMessage("Procesando...");

    try {
      if (action === "register") {
        const result = await window.ImportaFacilAuth.register(email, password);
        this.showMessage(result?.message || "Registro completado. Revisa tu correo.");
      } else {
        await window.ImportaFacilAuth.login(email, password);
        this.showMessage("¡Sesión iniciada correctamente!");
      }
    } catch (error) {
      console.error("Error de autenticación:", error);
      this.showMessage(error.message || "No se pudo completar la operación.", true);
    } finally {
      if (loginButton) loginButton.disabled = false;
      if (registerButton) registerButton.disabled = false;
    }
  },

  async handleLogout() {
    const logoutButton = document.getElementById("logout-button");
    if (logoutButton) logoutButton.disabled = true;

    try {
      await window.ImportaFacilAuth.logout();
      this.showMessage("Sesión cerrada correctamente.");
    } catch (error) {
      console.error("Error al cerrar sesión:", error);
      this.showMessage(error.message || "No se pudo cerrar la sesión.", true);
    } finally {
      if (logoutButton) logoutButton.disabled = false;
    }
  },

  async loadRates() {
    const bcvEl = document.getElementById("rate-bcv");
    const euroEl = document.getElementById("rate-euro");
    const usdtEl = document.getElementById("rate-usdt");
    const refreshBtn = document.getElementById("refresh-rates-btn");

    if (!bcvEl || !euroEl || !usdtEl) return;

    if (refreshBtn) {
      refreshBtn.disabled = true;
      refreshBtn.textContent = "Cargando...";
    }

    try {
      const [dolarRes, euroRes] = await Promise.all([
        fetch("https://ve.dolarapi.com/v1/dolares/oficial"),
        fetch("https://ve.dolarapi.com/v1/euros/oficial")
      ]);

      if (dolarRes.ok) {
        const data = await dolarRes.json();
        const rate = data.promedio || data.venta || 0;
        bcvEl.textContent = `${Number(rate).toFixed(2)} Bs.`;
      } else {
        bcvEl.textContent = "N/D";
      }

      if (euroRes.ok) {
        const data = await euroRes.json();
        const rate = data.promedio || data.venta || 0;
        euroEl.textContent = `${Number(rate).toFixed(2)} Bs.`;
      } else {
        euroEl.textContent = "N/D";
      }

      try {
        const usdtRes = await fetch("https://api.binance.com/api/v3/ticker/price?symbol=USDTVES");
        if (usdtRes.ok) {
          const data = await usdtRes.json();
          usdtEl.textContent = `${Number(data.price).toFixed(2)} Bs.`;
        } else {
          usdtEl.textContent = "N/D";
        }
      } catch (e) {
        usdtEl.textContent = "N/D";
      }

    } catch (error) {
      console.error("Error al cargar tasas:", error);
      bcvEl.textContent = "Error";
      euroEl.textContent = "Error";
      usdtEl.textContent = "Error";
    } finally {
      if (refreshBtn) {
        refreshBtn.disabled = false;
        refreshBtn.textContent = "↻ Actualizar";
      }
    }
  },

  async loadProducts() {
    if (this.loadingProducts) return;
    this.loadingProducts = true;

    if (this.currentView === "inventory") {
      this.showInventoryMessage("Cargando productos...");
    }

    try {
      const { data, error } = await window.supabaseClient
        .from("products")
        .select("id, user_id, name, sku, quantity, purchase_unit_usd, shipping_unit_usd, other_cost_unit_usd, retail_margin, wholesale_margin, created_at, updated_at")
        .order("created_at", { ascending: false });

      if (error) throw error;

      this.products = data || [];

      this.renderProducts();
      this.populateCalculatorProducts();
      this.calculatePrices();

      if (this.currentView === "inventory") {
        this.showInventoryMessage(this.products.length ? "Inventario actualizado correctamente." : "Todavía no tienes productos registrados.");
      }
    } catch (error) {
      console.error("Error al cargar productos:", error);
      if (this.currentView === "inventory") {
        this.showInventoryMessage(error.message || "No se pudieron cargar los productos.", true);
      }
      if (this.currentView === "calculator") {
        this.showCalculatorMessage(error.message || "No se pudo cargar el inventario.", true);
      }
    } finally {
      this.loadingProducts = false;
    }
  },

  getUnitCost(product) {
    return (
      Number(product.purchase_unit_usd || 0) +
      Number(product.shipping_unit_usd || 0) +
      Number(product.other_cost_unit_usd || 0)
    );
  },

  renderProducts() {
    const tableBody = document.getElementById("inventory-table-body");

    const totalUnits = this.products.reduce((sum, product) => sum + Number(product.quantity || 0), 0);
    const totalValue = this.products.reduce((sum, product) => sum + Number(product.quantity || 0) * this.getUnitCost(product), 0);

    this.setText("inventory-product-count", this.products.length);
    this.setText("inventory-unit-count", totalUnits);
    this.setText("inventory-total-value", this.formatMoney(totalValue));

    this.setText("product-count", this.products.length);
    this.setText("total-investment", this.formatMoney(totalValue));

    const totalSales = this.products.reduce((sum, product) => {
      const cost = this.getUnitCost(product);
      const markup = Number(product.retail_margin ?? 0.35);
      return sum + Number(product.quantity || 0) * cost * (1 + markup);
    }, 0);

    this.setText("potential-sales", this.formatMoney(totalSales));
    this.setText("potential-profit", this.formatMoney(totalSales - totalValue));

    this.setText("finances-investment", this.formatMoney(totalValue));
    this.setText("finances-sales", this.formatMoney(totalSales));
    this.setText("finances-profit", this.formatMoney(totalSales - totalValue));

    if (!tableBody) return;
    tableBody.replaceChildren();

    if (!this.products.length) {
      const row = document.createElement("tr");
      const cell = document.createElement("td");
      cell.colSpan = 5;
      cell.textContent = "Todavía no tienes productos registrados.";
      row.appendChild(cell);
      tableBody.appendChild(row);
      return;
    }

    this.products.forEach((product) => {
      const row = document.createElement("tr");
      
      const term = this.searchTerm.toLowerCase();
      const nameMatch = product.name.toLowerCase().includes(term);
      const skuMatch = product.sku ? product.sku.toLowerCase().includes(term) : false;
      
      if (this.searchTerm && (nameMatch || skuMatch)) {
        row.classList.add("search-match");
      }

      const nameCell = document.createElement("td");
      nameCell.textContent = product.name;

      const skuCell = document.createElement("td");
      skuCell.textContent = product.sku || "—";

      const quantityCell = document.createElement("td");
      const quantityInput = document.createElement("input");
      quantityInput.type = "number";
      quantityInput.min = "0";
      quantityInput.step = "1";
      quantityInput.value = product.quantity;
      quantityInput.className = "inline-quantity-input";
      
      if (product.quantity <= 5) {
        quantityInput.classList.add("low-stock");
        quantityInput.title = "¡Quedan pocas unidades!";
      }

      const updateQuantity = async () => {
        const newQuantity = Number(quantityInput.value);
        if (newQuantity === product.quantity) return;
        
        if (newQuantity < 0 || !Number.isInteger(newQuantity)) {
          quantityInput.value = product.quantity;
          alert("La cantidad debe ser un número entero mayor o igual a 0.");
          return;
        }

        try {
          quantityInput.disabled = true;
          const { error } = await window.supabaseClient
            .from("products")
            .update({ quantity: newQuantity })
            .eq("id", product.id);

          if (error) throw error;
          
          product.quantity = newQuantity;
          await this.loadProducts();
        } catch (error) {
          console.error("Error al actualizar stock:", error);
          quantityInput.value = product.quantity;
          alert("No se pudo actualizar la cantidad.");
        } finally {
          quantityInput.disabled = false;
        }
      };

      quantityInput.addEventListener("blur", updateQuantity);
      quantityInput.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          quantityInput.blur();
        }
      });

      quantityCell.appendChild(quantityInput);

      const costCell = document.createElement("td");
      costCell.textContent = this.formatMoney(this.getUnitCost(product));

      const actionsCell = document.createElement("td");
      actionsCell.className = "product-actions";

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.textContent = "Editar";
      editButton.addEventListener("click", () => this.editProduct(product.id));

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.textContent = "Eliminar";
      deleteButton.addEventListener("click", () => this.deleteProduct(product.id));

      actionsCell.append(editButton, deleteButton);
      row.append(nameCell, skuCell, quantityCell, costCell, actionsCell);
      tableBody.appendChild(row);
    });
  },

  openProductForm(product = null) {
    const section = document.getElementById("product-form-section");
    if (!section) return;

    const title = section.querySelector("h2");
    const saveButton = document.getElementById("save-product-button");

    this.editingProductId = product?.id || null;

    if (title) title.textContent = product ? "Editar producto" : "Agregar producto";
    if (saveButton) saveButton.textContent = product ? "Guardar cambios" : "Guardar producto";

    document.getElementById("product-name").value = product?.name || "";
    document.getElementById("product-sku").value = product?.sku || "";
    document.getElementById("product-quantity").value = product?.quantity ?? 0;
    document.getElementById("product-purchase-cost").value = product?.purchase_unit_usd ?? 0;
    document.getElementById("product-shipping-cost").value = product?.shipping_unit_usd ?? 0;
    document.getElementById("product-other-cost").value = product?.other_cost_unit_usd ?? 0;

    section.hidden = false;
    section.scrollIntoView({ behavior: "smooth", block: "start" });
    document.getElementById("product-name").focus();
  },

  resetProductForm() {
    const form = document.getElementById("product-form");
    const section = document.getElementById("product-form-section");

    if (form) form.reset();
    if (section) section.hidden = true;

    this.editingProductId = null;

    const saveButton = document.getElementById("save-product-button");
    if (saveButton) saveButton.textContent = "Guardar producto";

    const title = section?.querySelector("h2");
    if (title) title.textContent = "Agregar producto";
  },

  async saveProduct(event) {
    event.preventDefault();
    const form = document.getElementById("product-form");
    const saveButton = document.getElementById("save-product-button");

    if (!form || !form.reportValidity()) return;

    try {
      const { data: { user }, error: userError } = await window.supabaseClient.auth.getUser();
      if (userError) throw userError;

      if (!user) {
        this.showInventoryMessage("Inicia sesión para guardar productos.", true);
        return;
      }

      const product = {
        user_id: user.id,
        name: document.getElementById("product-name").value.trim(),
        sku: document.getElementById("product-sku").value.trim() || null,
        quantity: Number(document.getElementById("product-quantity").value),
        purchase_unit_usd: Number(document.getElementById("product-purchase-cost").value),
        shipping_unit_usd: Number(document.getElementById("product-shipping-cost").value),
        other_cost_unit_usd: Number(document.getElementById("product-other-cost").value)
      };

      if (
        !product.name ||
        !Number.isInteger(product.quantity) ||
        product.quantity < 0 ||
        product.purchase_unit_usd < 0 ||
        product.shipping_unit_usd < 0 ||
        product.other_cost_unit_usd < 0
      ) {
        this.showInventoryMessage("Revisa el nombre, la cantidad y los costos.", true);
        return;
      }

      const editingId = this.editingProductId;
      const wasEditing = Boolean(editingId);

      if (saveButton) {
        saveButton.disabled = true;
        saveButton.textContent = "Guardando...";
      }

      let result;
      if (wasEditing) {
        result = await window.supabaseClient.from("products").update(product).eq("id", editingId).select().single();
      } else {
        result = await window.supabaseClient.from("products").insert(product).select().single();
      }

      if (result.error) throw result.error;

      this.resetProductForm();
      await this.loadProducts();
      this.showInventoryMessage(`Producto ${wasEditing ? "actualizado" : "guardado"} correctamente.`);
    } catch (error) {
      console.error("Error al guardar producto:", error);
      this.showInventoryMessage(error.message || "No se pudo guardar el producto.", true);
    } finally {
      if (saveButton) {
        saveButton.disabled = false;
        saveButton.textContent = this.editingProductId ? "Guardar cambios" : "Guardar producto";
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

    const confirmed = window.confirm(`¿Seguro que deseas eliminar "${product.name}"? Esta acción no se puede deshacer.`);
    if (!confirmed) return;

    try {
      const { error } = await window.supabaseClient.from("products").delete().eq("id", productId);
      if (error) throw error;

      await this.loadProducts();
      this.showInventoryMessage("Producto eliminado correctamente.");
    } catch (error) {
      console.error("Error al eliminar producto:", error);
      this.showInventoryMessage(error.message || "No se pudo eliminar el producto.", true);
    }
  },

  exportInventoryToCSV() {
    if (!this.products.length) {
      this.showInventoryMessage("No hay productos para exportar.", true);
      return;
    }

    const headers = ["Producto", "SKU", "Existencias", "Costo Compra", "Costo Envío", "Otros Costos", "Costo Unitario Total"];
    
    const rows = this.products.map(p => [
      p.name,
      p.sku || "",
      p.quantity,
      p.purchase_unit_usd || 0,
      p.shipping_unit_usd || 0,
      p.other_cost_unit_usd || 0,
      this.getUnitCost(p).toFixed(2)
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(row => row.join(","))
    ].join("\n");

    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `inventario_importafacil_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    this.showInventoryMessage("Inventario exportado correctamente.");
  },

  populateCalculatorProducts() {
    const select = document.getElementById("calculator-product");
    if (!select) return;

    const selectedId = select.value;
    select.replaceChildren();

    const manualOption = document.createElement("option");
    manualOption.value = "";
    manualOption.textContent = "Calcular un producto manualmente";
    select.appendChild(manualOption);

    this.products.forEach((product) => {
      const option = document.createElement("option");
      option.value = product.id;
      option.textContent = product.sku ? `${product.name} (${product.sku})` : product.name;
      select.appendChild(option);
    });

    if (this.products.some((product) => product.id === selectedId)) {
      select.value = selectedId;
    }
  },

  loadProductIntoCalculator(productId) {
    const product = this.products.find((item) => item.id === productId);
    if (!product) return;

    document.getElementById("calculator-name").value = product.name;
    document.getElementById("calculator-purchase").value = Number(product.purchase_unit_usd || 0).toFixed(2);
    
    document.getElementById("calculator-box-shipping").value = Number(product.shipping_unit_usd || 0).toFixed(2);
    document.getElementById("calculator-box-units").value = "1";
    
    document.getElementById("calculator-other").value = Number(product.other_cost_unit_usd || 0).toFixed(2);
    document.getElementById("calculator-retail-margin").value = Math.round(Number(product.retail_margin ?? 0.35) * 100);
    document.getElementById("calculator-wholesale-margin").value = Math.round(Number(product.wholesale_margin ?? 0.20) * 100);

    this.calculatePrices();
  },

  calculatePrices() {
    const purchase = this.getNumber("calculator-purchase");
    const other = this.getNumber("calculator-other");
    const quantity = this.getNumber("calculator-quantity", 1);
    
    const boxShipping = this.getNumber("calculator-box-shipping");
    const boxUnits = this.getNumber("calculator-box-units", 1);
    
    const retailMarkup = this.getNumber("calculator-retail-margin") / 100;
    const wholesaleMarkup = this.getNumber("calculator-wholesale-margin") / 100;
    const taxEnabled = document.getElementById("calculator-tax-enabled")?.checked || false;
    const taxRate = this.getNumber("calculator-tax-rate") / 100;
    const taxMode = document.getElementById("calculator-tax-mode")?.value || "added";

    if (boxUnits < 1 || quantity < 1 || !Number.isInteger(boxUnits) || !Number.isInteger(quantity)) {
      this.showCalculatorMessage("Las cantidades (unidades a vender y unidades por caja) deben ser enteros mayores a 0.", true);
      return;
    }

    const shippingPerUnit = boxShipping / boxUnits;
    const unitCost = purchase + shippingPerUnit + other;

    const retailPrice = unitCost * (1 + retailMarkup);
    const wholesalePrice = unitCost * (1 + wholesaleMarkup);
    
    const totalCost = unitCost * quantity;
    const retailProfit = (retailPrice - unitCost) * quantity;
    const wholesaleProfit = (wholesalePrice - unitCost) * quantity;
    
    const retailActualMargin = retailPrice > 0 ? ((retailPrice - unitCost) / retailPrice) * 100 : 0;
    const wholesaleActualMargin = wholesalePrice > 0 ? ((wholesalePrice - unitCost) / wholesalePrice) * 100 : 0;

    this.setText("calculator-unit-cost", this.formatMoney(unitCost));
    this.setText("calculator-retail-price", this.formatMoney(retailPrice));
    this.setText("calculator-wholesale-price", this.formatMoney(wholesalePrice));
    this.setText("calculator-total-cost", this.formatMoney(totalCost));
    this.setText("calculator-retail-profit", this.formatMoney(retailProfit));
    this.setText("calculator-wholesale-profit", this.formatMoney(wholesaleProfit));
    this.setText("calculator-retail-margin-result", `Margen real: ${this.formatPercent(retailActualMargin)}`);
    this.setText("calculator-wholesale-margin-result", `Margen real: ${this.formatPercent(wholesaleActualMargin)}`);

    const taxResultsContainer = document.getElementById("calculator-tax-results");
    if (taxEnabled && taxRate > 0) {
      if (taxResultsContainer) taxResultsContainer.hidden = false;
      let retailTaxUnit, retailFinalPrice, wholesaleTaxUnit, wholesaleFinalPrice;

      if (taxMode === "added") {
        retailTaxUnit = retailPrice * taxRate;
        retailFinalPrice = retailPrice + retailTaxUnit;
        wholesaleTaxUnit = wholesalePrice * taxRate;
        wholesaleFinalPrice = wholesalePrice + wholesaleTaxUnit;
      } else {
        retailFinalPrice = retailPrice;
        retailTaxUnit = retailPrice - (retailPrice / (1 + taxRate));
        wholesaleFinalPrice = wholesalePrice;
        wholesaleTaxUnit = wholesalePrice - (wholesalePrice / (1 + taxRate));
      }

      this.setText("calculator-retail-tax", this.formatMoney(retailTaxUnit));
      this.setText("calculator-retail-final-price", this.formatMoney(retailFinalPrice));
      this.setText("calculator-wholesale-tax", this.formatMoney(wholesaleTaxUnit));
      this.setText("calculator-wholesale-final-price", this.formatMoney(wholesaleFinalPrice));
      this.setText("calculator-retail-total-tax", this.formatMoney(retailTaxUnit * quantity));
      this.setText("calculator-wholesale-total-tax", this.formatMoney(wholesaleTaxUnit * quantity));
    } else {
      if (taxResultsContainer) taxResultsContainer.hidden = true;
    }

    this.showCalculatorMessage(`Cálculo actualizado. Envío por unidad: ${this.formatMoney(shippingPerUnit)}.`);
  },

  resetCalculator() {
    const defaults = {
      "calculator-product": "",
      "calculator-name": "",
      "calculator-quantity": "1",
      "calculator-purchase": "0",
      "calculator-box-shipping": "0",
      "calculator-box-units": "1",
      "calculator-other": "0",
      "calculator-retail-margin": "35",
      "calculator-wholesale-margin": "20",
      "calculator-tax-enabled": false,
      "calculator-tax-rate": "0",
      "calculator-tax-mode": "added"
    };

    Object.entries(defaults).forEach(([id, value]) => {
      const element = document.getElementById(id);
      if (element) {
        if (element.type === "checkbox") element.checked = value;
        else element.value = value;
      }
    });

    const taxOptions = document.getElementById("calculator-tax-options");
    if (taxOptions) taxOptions.hidden = true;

    this.calculatePrices();
  },

  initCalculator() {
    const inputIds = [
      "calculator-quantity",
      "calculator-purchase",
      "calculator-box-shipping",
      "calculator-box-units",
      "calculator-other",
      "calculator-retail-margin",
      "calculator-wholesale-margin",
      "calculator-tax-rate"
    ];

    inputIds.forEach((id) => {
      const element = document.getElementById(id);
      if (element) element.addEventListener("input", () => this.calculatePrices());
    });

    const productSelect = document.getElementById("calculator-product");
    if (productSelect) {
      productSelect.addEventListener("change", () => {
        if (productSelect.value) this.loadProductIntoCalculator(productSelect.value);
        else this.calculatePrices();
      });
    }

    const resetButton = document.getElementById("calculator-reset");
    if (resetButton) resetButton.addEventListener("click", () => this.resetCalculator());

    const taxEnabled = document.getElementById("calculator-tax-enabled");
    const taxOptions = document.getElementById("calculator-tax-options");
    const taxMode = document.getElementById("calculator-tax-mode");

    if (taxEnabled) {
      taxEnabled.addEventListener("change", () => {
        if (taxOptions) taxOptions.hidden = !taxEnabled.checked;
        this.calculatePrices();
      });
    }

    if (taxMode) taxMode.addEventListener("change", () => this.calculatePrices());

    const saveToInventoryBtn = document.getElementById("calculator-save-to-inventory");
    if (saveToInventoryBtn) {
      saveToInventoryBtn.addEventListener("click", () => this.saveCalculatedProduct());
    }

    this.calculatePrices();
  },

  async saveCalculatedProduct() {
    const saveToInventoryBtn = document.getElementById("calculator-save-to-inventory");
    
    const { data: { user }, error: userError } = await window.supabaseClient.auth.getUser();
    if (userError || !user) {
      this.showCalculatorMessage("Debes iniciar sesión para guardar productos.", true);
      return;
    }

    const nameInput = document.getElementById("calculator-name");
    const name = nameInput.value.trim();

    if (!name) {
      this.showCalculatorMessage("El nombre del producto es obligatorio para guardarlo.", true);
      nameInput.focus();
      return;
    }

    const quantity = this.getNumber("calculator-quantity", 1);
    const purchase = this.getNumber("calculator-purchase");
    const boxShipping = this.getNumber("calculator-box-shipping");
    const boxUnits = this.getNumber("calculator-box-units", 1);
    const other = this.getNumber("calculator-other");
    const retailMargin = this.getNumber("calculator-retail-margin") / 100;
    const wholesaleMargin = this.getNumber("calculator-wholesale-margin") / 100;

    if (quantity < 1 || !Number.isInteger(quantity) || boxUnits < 1 || !Number.isInteger(boxUnits)) {
      this.showCalculatorMessage("Las cantidades deben ser números enteros mayores a 0.", true);
      return;
    }

    const shippingPerUnit = boxShipping / boxUnits;

    const product = {
      user_id: user.id,
      name: name,
      quantity: quantity,
      purchase_unit_usd: purchase,
      shipping_unit_usd: shippingPerUnit,
      other_cost_unit_usd: other,
      retail_margin: retailMargin,
      wholesale_margin: wholesaleMargin
    };

    try {
      if (saveToInventoryBtn) {
        saveToInventoryBtn.disabled = true;
        saveToInventoryBtn.textContent = "Guardando...";
      }

      const { error } = await window.supabaseClient
        .from("products")
        .insert(product);

      if (error) throw error;

      this.showCalculatorMessage("¡Producto guardado en el inventario exitosamente!");
      await this.loadProducts();

    } catch (error) {
      console.error("Error al guardar producto desde calculadora:", error);
      this.showCalculatorMessage(error.message || "No se pudo guardar el producto.", true);
    } finally {
      if (saveToInventoryBtn) {
        saveToInventoryBtn.disabled = false;
        saveToInventoryBtn.textContent = "Guardar en Inventario";
      }
    }
  },

  calculateImportCosts() {
    const quantity = this.getNumber("import-quantity", 1);
    const productCost = this.getNumber("import-product-cost");
    const shippingCost = this.getNumber("import-shipping-cost");
    const otherCosts = this.getNumber("import-other-costs");

    if (quantity < 1) {
      this.setText("import-unit-result", "$0.00");
      return;
    }

    const totalCost = productCost + shippingCost + otherCosts;
    const unitCost = totalCost / quantity;

    this.setText("import-unit-result", this.formatMoney(unitCost));
  },

  initImports() {
    const importInputs = [
      "import-quantity",
      "import-product-cost",
      "import-shipping-cost",
      "import-other-costs"
    ];

    importInputs.forEach((id) => {
      const element = document.getElementById(id);
      if (element) {
        element.addEventListener("input", () => this.calculateImportCosts());
      }
    });

    const sendBtn = document.getElementById("import-send-to-calculator");
    if (sendBtn) {
      sendBtn.addEventListener("click", () => {
        const quantity = this.getNumber("import-quantity", 1);
        const productCost = this.getNumber("import-product-cost");
        const shippingCost = this.getNumber("import-shipping-cost");
        const otherCosts = this.getNumber("import-other-costs");
        const totalCost = productCost + shippingCost + otherCosts;
        
        if (quantity < 1 || totalCost <= 0) {
          alert("Por favor, ingresa una cantidad y costos válidos antes de enviar a la calculadora.");
          return;
        }

        const unitCost = totalCost / quantity;

        this.showView("calculator");
        this.resetCalculator();

        document.getElementById("calculator-purchase").value = unitCost.toFixed(2);
        document.getElementById("calculator-quantity").value = quantity;

        this.calculatePrices();
      });
    }
  },

  async init() {
    this.setText("product-count", "0");
    this.setText("total-investment", this.formatMoney(0));
    this.setText("potential-sales", this.formatMoney(0));
    this.setText("potential-profit", this.formatMoney(0));

    const form = document.getElementById("auth-form");
    const registerButton = document.getElementById("register-button");
    const logoutButton = document.getElementById("logout-button");
    const navItems = document.querySelectorAll(".nav-item[data-view]");
    const productForm = document.getElementById("product-form");
    const addProductButton = document.getElementById("add-product-button");
    const cancelProductButton = document.getElementById("cancel-product-button");
    const exportButton = document.getElementById("export-inventory-button");
    const refreshRatesBtn = document.getElementById("refresh-rates-btn");

    if (form) {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        this.handleAuth("login");
      });
    }

    if (registerButton) registerButton.addEventListener("click", () => this.handleAuth("register"));
    if (logoutButton) logoutButton.addEventListener("click", () => this.handleLogout());

    navItems.forEach((item) => {
      item.addEventListener("click", () => {
        this.showView(item.dataset.view);
      });
    });

    if (addProductButton) addProductButton.addEventListener("click", () => this.openProductForm());
    if (cancelProductButton) cancelProductButton.addEventListener("click", () => this.resetProductForm());
    
    if (exportButton) {
      exportButton.addEventListener("click", () => this.exportInventoryToCSV());
    }

    if (refreshRatesBtn) {
      refreshRatesBtn.addEventListener("click", () => this.loadRates());
    }

    if (productForm) {
      productForm.addEventListener("submit", (event) => this.saveProduct(event));
    }

    const searchInput = document.getElementById("inventory-search");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        this.searchTerm = e.target.value;
        this.renderProducts();
      });
    }

    // NUEVO: Lógica del menú móvil
    const mobileMenuBtn = document.getElementById("mobile-menu-btn");
    const sidebar = document.getElementById("sidebar");
    
    const overlay = document.createElement("div");
    overlay.className = "mobile-overlay";
    document.body.appendChild(overlay);

    const toggleMenu = () => {
      sidebar.classList.toggle("active");
      overlay.classList.toggle("active");
    };

    if (mobileMenuBtn) {
      mobileMenuBtn.addEventListener("click", toggleMenu);
    }

    if (overlay) {
      overlay.addEventListener("click", toggleMenu);
    }

    this.initCalculator();
    this.initImports();

    window.ImportaFacilAuth.onSessionChange((_event, session) => {
      this.showAuthenticatedView(session);
    });

    try {
      const session = await window.ImportaFacilAuth.getSession();
      this.showAuthenticatedView(session);
    } catch (error) {
      console.error("No se pudo comprobar la sesión:", error);
      this.showAuthenticatedView(null);
      this.showMessage("No se pudo comprobar tu sesión. Recarga la página.", true);
    }

    console.info("ImportaFácil se ha iniciado correctamente.");
  }
};

document.addEventListener("DOMContentLoaded", () => {
  ImportaFacil.init();
});