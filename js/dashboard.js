(function () {
  let accounts = [];
  let categories = [];
  let editingTransactionId = null;
  let categoryChart = null;
  let monthsChart = null;

  const globalError = document.getElementById('global-error');
  const txError = document.getElementById('tx-error');

  function setGlobalError(msg) {
    globalError.textContent = msg || '';
  }

  function setTxError(msg) {
    txError.textContent = msg || '';
  }

  async function init() {
    let me;
    try {
      me = await fetch('/api/auth/me', { credentials: 'same-origin' });
    } catch {
      window.location.href = '/login.html';
      return;
    }
    if (me.status === 401) {
      window.location.href = '/login.html';
      return;
    }
    const meData = await me.json();
    if (!meData.user.onboarding_completed) {
      window.location.href = '/onboarding.html';
      return;
    }
    document.getElementById('user-email').textContent = meData.user.email;

    await loadAccountsAndCategories();
    await loadSummary();
    await Promise.all([loadAlerts(), loadTransactions()]);

    bindEvents();
  }

  async function loadAccountsAndCategories() {
    const [accRes, catRes] = await Promise.all([apiFetch('/api/accounts'), apiFetch('/api/categories')]);
    accounts = accRes.accounts;
    categories = catRes.categories;
    renderAccountSelects();
    renderCategorySelects();
    renderManageLists();
  }

  function renderAccountSelects() {
    const filterAccount = document.getElementById('filter-account');
    const txAccount = document.getElementById('tx-account');
    const filterValue = filterAccount.value;

    filterAccount.innerHTML = '<option value="">Tutti</option>' + accounts.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('');
    txAccount.innerHTML = accounts.map((a) => `<option value="${a.id}">${escapeHtml(a.name)}</option>`).join('');

    filterAccount.value = filterValue;
  }

  function renderCategorySelects() {
    const filterCategory = document.getElementById('filter-category');
    const filterValue = filterCategory.value;
    filterCategory.innerHTML =
      '<option value="">Tutte</option>' +
      categories.map((c) => `<option value="${c.id}">${escapeHtml(c.name)} (${c.type === 'income' ? 'entrata' : 'uscita'})</option>`).join('');
    filterCategory.value = filterValue;

    renderTxCategoryOptions();
  }

  function renderTxCategoryOptions() {
    const txType = document.getElementById('tx-type').value;
    const txCategory = document.getElementById('tx-category');
    const matching = categories.filter((c) => c.type === txType);
    txCategory.innerHTML = matching.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
  }

  function renderManageLists() {
    const accountsList = document.getElementById('accounts-tag-list');
    accountsList.innerHTML = accounts
      .map((a) => `<span class="tag">${escapeHtml(a.name)}<button type="button" data-account-id="${a.id}" class="delete-account-tag" title="Elimina">&times;</button></span>`)
      .join('') || '<span class="muted">Nessun conto</span>';

    const categoriesList = document.getElementById('categories-tag-list');
    categoriesList.innerHTML = categories
      .map(
        (c) =>
          `<span class="tag">${escapeHtml(c.name)} <span class="muted">(${c.type === 'income' ? 'entrata' : 'uscita'})</span><button type="button" data-category-id="${c.id}" class="delete-category-tag" title="Elimina">&times;</button></span>`
      )
      .join('') || '<span class="muted">Nessuna categoria</span>';

    accountsList.querySelectorAll('.delete-account-tag').forEach((btn) =>
      btn.addEventListener('click', () => deleteAccount(btn.dataset.accountId))
    );
    categoriesList.querySelectorAll('.delete-category-tag').forEach((btn) =>
      btn.addEventListener('click', () => deleteCategory(btn.dataset.categoryId))
    );
  }

  function currentFilters() {
    return {
      period: document.getElementById('filter-period').value,
      category_id: document.getElementById('filter-category').value,
      account_id: document.getElementById('filter-account').value,
      compare: document.getElementById('filter-compare').checked,
    };
  }

  function buildQuery(params) {
    const usp = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== '' && v !== undefined && v !== null && v !== false) usp.set(k, v === true ? '1' : v);
    });
    return usp.toString();
  }

  async function loadSummary() {
    setGlobalError('');
    const filters = currentFilters();
    try {
      const query = buildQuery(filters);
      const data = await apiFetch(`/api/summary?${query}`);
      lastSummaryRange = data.range;
      renderSummaryCards(data);
      renderCharts(data);
    } catch (err) {
      setGlobalError(err.message);
    }
  }

  function formatDelta(current, previous) {
    if (previous === null || previous === undefined) return '';
    const diff = current - previous;
    if (previous === 0) return diff === 0 ? 'invariato rispetto al periodo precedente' : `${diff >= 0 ? '+' : ''}${formatCurrency(diff)} rispetto al periodo precedente`;
    const pct = (diff / Math.abs(previous)) * 100;
    return `${diff >= 0 ? '+' : ''}${formatCurrency(diff)} (${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%) rispetto al periodo precedente`;
  }

  function renderSummaryCards(data) {
    document.getElementById('card-balance').textContent = formatCurrency(data.current_balance);
    document.getElementById('card-income').textContent = formatCurrency(data.current.income);
    document.getElementById('card-expense').textContent = formatCurrency(data.current.expense);
    document.getElementById('card-net').textContent = formatCurrency(data.current.net);

    const prev = data.previous;
    document.getElementById('card-income-delta').textContent = prev ? formatDelta(data.current.income, prev.income) : '';
    document.getElementById('card-expense-delta').textContent = prev ? formatDelta(data.current.expense, prev.expense) : '';
    document.getElementById('card-net-delta').textContent = prev ? formatDelta(data.current.net, prev.net) : '';
  }

  function renderCharts(data) {
    const expenseByCategory = data.current.byCategory.filter((c) => c.type === 'expense' && c.total > 0);
    const ctxCategory = document.getElementById('chart-category');
    if (categoryChart) categoryChart.destroy();
    categoryChart = new Chart(ctxCategory, {
      type: 'pie',
      data: {
        labels: expenseByCategory.map((c) => c.category_name),
        datasets: [{ data: expenseByCategory.map((c) => c.total) }],
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } } },
    });

    const months = data.current.byMonth;
    const ctxMonths = document.getElementById('chart-months');
    if (monthsChart) monthsChart.destroy();
    monthsChart = new Chart(ctxMonths, {
      type: 'bar',
      data: {
        labels: months.map((m) => m.month),
        datasets: [
          { label: 'Entrate', data: months.map((m) => m.income), backgroundColor: '#1a9e6b' },
          { label: 'Uscite', data: months.map((m) => m.expense), backgroundColor: '#d4423e' },
        ],
      },
      options: { responsive: true, plugins: { legend: { position: 'bottom' } } },
    });
  }

  async function loadAlerts() {
    try {
      const data = await apiFetch('/api/alerts');
      const list = document.getElementById('alerts-list');
      const noAlerts = document.getElementById('no-alerts');
      if (!data.alerts.length) {
        list.innerHTML = '';
        noAlerts.style.display = 'block';
        return;
      }
      noAlerts.style.display = 'none';
      list.innerHTML = data.alerts
        .map((a) => `<li class="alert-item ${a.type}">${escapeHtml(a.message)}</li>`)
        .join('');
    } catch (err) {
      setGlobalError(err.message);
    }
  }

  let lastSummaryRange = null;

  async function loadTransactions() {
    try {
      const filters = currentFilters();
      const range = lastSummaryRange || (await apiFetch(`/api/summary?${buildQuery(filters)}`)).range;
      const query = buildQuery({
        from: range.from,
        to: range.to,
        category_id: filters.category_id,
        account_id: filters.account_id,
      });
      const data = await apiFetch(`/api/transactions?${query}`);
      renderTransactions(data.transactions);
    } catch (err) {
      setGlobalError(err.message);
    }
  }

  function renderTransactions(transactions) {
    const tbody = document.getElementById('tx-table-body');
    const empty = document.getElementById('tx-empty');
    if (!transactions.length) {
      tbody.innerHTML = '';
      empty.style.display = 'block';
      return;
    }
    empty.style.display = 'none';
    tbody.innerHTML = transactions
      .map(
        (t) => `
      <tr>
        <td>${toDisplay(t.date)}</td>
        <td>${escapeHtml(t.category_name)}</td>
        <td>${escapeHtml(t.account_name)}</td>
        <td>${escapeHtml(t.description || '')}</td>
        <td class="amount ${t.type}">${t.type === 'income' ? '+' : '-'}${formatCurrency(t.amount)}</td>
        <td class="row-actions">
          <button type="button" class="secondary edit-tx-btn" data-id="${t.id}">Modifica</button>
          <button type="button" class="danger delete-tx-btn" data-id="${t.id}">Elimina</button>
        </td>
      </tr>`
      )
      .join('');

    tbody.querySelectorAll('.edit-tx-btn').forEach((btn) =>
      btn.addEventListener('click', () => startEditTransaction(transactions.find((t) => t.id === btn.dataset.id)))
    );
    tbody.querySelectorAll('.delete-tx-btn').forEach((btn) => btn.addEventListener('click', () => deleteTransaction(btn.dataset.id)));
  }

  async function refreshAll() {
    await loadSummary();
    await Promise.all([loadAlerts(), loadTransactions()]);
  }

  function startEditTransaction(t) {
    if (!t) return;
    editingTransactionId = t.id;
    document.getElementById('tx-date').value = toDisplay(t.date);
    document.getElementById('tx-amount').value = t.amount;
    document.getElementById('tx-type').value = t.type;
    renderTxCategoryOptions();
    document.getElementById('tx-category').value = t.category_id;
    document.getElementById('tx-account').value = t.account_id;
    document.getElementById('tx-description').value = t.description || '';
    document.getElementById('tx-recurring').checked = !!t.is_recurring;
    document.getElementById('tx-frequency-field').style.display = t.is_recurring ? 'block' : 'none';
    if (t.recurrence_frequency) document.getElementById('tx-frequency').value = t.recurrence_frequency;
    document.getElementById('tx-submit-btn').textContent = 'Salva modifiche';
    document.getElementById('tx-cancel-edit-field').style.display = 'block';
    document.getElementById('tx-form').scrollIntoView({ behavior: 'smooth' });
  }

  function cancelEditTransaction() {
    editingTransactionId = null;
    document.getElementById('tx-form').reset();
    document.getElementById('tx-frequency-field').style.display = 'none';
    renderTxCategoryOptions();
    document.getElementById('tx-submit-btn').textContent = 'Aggiungi';
    document.getElementById('tx-cancel-edit-field').style.display = 'none';
  }

  async function deleteTransaction(id) {
    if (!confirm('Eliminare questa transazione?')) return;
    try {
      await apiFetch(`/api/transactions/${id}`, { method: 'DELETE' });
      await refreshAll();
    } catch (err) {
      setGlobalError(err.message);
    }
  }

  async function deleteAccount(id) {
    if (!confirm('Eliminare questo conto?')) return;
    try {
      await apiFetch(`/api/accounts/${id}`, { method: 'DELETE' });
      await loadAccountsAndCategories();
      await refreshAll();
    } catch (err) {
      setGlobalError(err.message);
    }
  }

  async function deleteCategory(id) {
    if (!confirm('Eliminare questa categoria?')) return;
    try {
      await apiFetch(`/api/categories/${id}`, { method: 'DELETE' });
      await loadAccountsAndCategories();
      await refreshAll();
    } catch (err) {
      setGlobalError(err.message);
    }
  }

  function bindEvents() {
    document.getElementById('filter-period').addEventListener('change', refreshAll);
    document.getElementById('filter-category').addEventListener('change', refreshAll);
    document.getElementById('filter-account').addEventListener('change', refreshAll);
    document.getElementById('filter-compare').addEventListener('change', loadSummary);

    document.getElementById('tx-type').addEventListener('change', renderTxCategoryOptions);
    document.getElementById('tx-recurring').addEventListener('change', (e) => {
      document.getElementById('tx-frequency-field').style.display = e.target.checked ? 'block' : 'none';
    });

    document.getElementById('tx-cancel-edit-btn').addEventListener('click', cancelEditTransaction);

    document.getElementById('tx-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      setTxError('');
      const isoDate = toISO(document.getElementById('tx-date').value);
      if (!isoDate) {
        setTxError('Data non valida. Usa il formato GG-MM-AAAA.');
        return;
      }
      const payload = {
        date: isoDate,
        amount: Number(document.getElementById('tx-amount').value),
        type: document.getElementById('tx-type').value,
        category_id: document.getElementById('tx-category').value,
        account_id: document.getElementById('tx-account').value,
        description: document.getElementById('tx-description').value.trim(),
        is_recurring: document.getElementById('tx-recurring').checked,
        recurrence_frequency: document.getElementById('tx-recurring').checked ? document.getElementById('tx-frequency').value : null,
      };
      const submitBtn = document.getElementById('tx-submit-btn');
      submitBtn.disabled = true;
      try {
        if (editingTransactionId) {
          await apiFetch(`/api/transactions/${editingTransactionId}`, { method: 'PUT', body: payload });
        } else {
          await apiFetch('/api/transactions', { method: 'POST', body: payload });
        }
        cancelEditTransaction();
        await refreshAll();
      } catch (err) {
        setTxError(err.message);
      } finally {
        submitBtn.disabled = false;
      }
    });

    document.getElementById('add-account-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('new-account-name');
      const name = input.value.trim();
      if (!name) return;
      try {
        await apiFetch('/api/accounts', { method: 'POST', body: { name } });
        input.value = '';
        await loadAccountsAndCategories();
      } catch (err) {
        setGlobalError(err.message);
      }
    });

    document.getElementById('add-category-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = document.getElementById('new-category-name');
      const name = input.value.trim();
      const type = document.getElementById('new-category-type').value;
      if (!name) return;
      try {
        await apiFetch('/api/categories', { method: 'POST', body: { name, type } });
        input.value = '';
        await loadAccountsAndCategories();
      } catch (err) {
        setGlobalError(err.message);
      }
    });

    document.getElementById('logout-btn').addEventListener('click', async () => {
      try {
        await apiFetch('/api/auth/logout', { method: 'POST' });
      } finally {
        window.location.href = '/login.html';
      }
    });

    const modal = document.getElementById('delete-account-modal');
    document.getElementById('delete-account-btn').addEventListener('click', () => {
      document.getElementById('delete-account-error').textContent = '';
      document.getElementById('delete-account-password').value = '';
      modal.classList.remove('hidden');
    });
    document.getElementById('delete-account-cancel').addEventListener('click', () => modal.classList.add('hidden'));
    document.getElementById('delete-account-confirm').addEventListener('click', async () => {
      const password = document.getElementById('delete-account-password').value;
      const errEl = document.getElementById('delete-account-error');
      if (!password) {
        errEl.textContent = 'Inserisci la password';
        return;
      }
      try {
        await apiFetch('/api/account', { method: 'DELETE', body: { password } });
        window.location.href = '/login.html';
      } catch (err) {
        errEl.textContent = err.message;
      }
    });
  }

  init();
})();
