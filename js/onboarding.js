(function () {
  const steps = Array.from(document.querySelectorAll('.wizard-step'));
  const progressDots = Array.from(document.querySelectorAll('.wizard-progress span'));
  const backBtn = document.getElementById('back-btn');
  const nextBtn = document.getElementById('next-btn');
  const finishBtn = document.getElementById('finish-btn');
  const errorEl = document.getElementById('error');
  const hasSalaryCheckbox = document.getElementById('has_salary');
  const salaryFields = document.getElementById('salary-fields');

  let current = 1;

  hasSalaryCheckbox.addEventListener('change', () => {
    salaryFields.style.display = hasSalaryCheckbox.checked ? 'block' : 'none';
  });

  function setError(msg) {
    errorEl.textContent = msg || '';
  }

  function showStep(n) {
    steps.forEach((s) => s.classList.toggle('active', Number(s.dataset.step) === n));
    progressDots.forEach((d) => d.classList.toggle('active', Number(d.dataset.step) <= n));
    backBtn.disabled = n === 1;
    nextBtn.style.display = n === steps.length ? 'none' : 'inline-block';
    finishBtn.style.display = n === steps.length ? 'inline-block' : 'none';
  }

  function validateStep(n) {
    setError('');
    if (n === 1) {
      const val = document.getElementById('initial_balance').value;
      if (val === '' || Number.isNaN(Number(val))) {
        setError('Inserisci un saldo valido');
        return false;
      }
    }
    if (n === 2 && hasSalaryCheckbox.checked) {
      const amount = document.getElementById('salary_amount').value;
      if (amount === '' || Number(amount) <= 0) {
        setError('Inserisci un importo valido per lo stipendio');
        return false;
      }
    }
    return true;
  }

  nextBtn.addEventListener('click', () => {
    if (!validateStep(current)) return;
    current = Math.min(current + 1, steps.length);
    showStep(current);
  });

  backBtn.addEventListener('click', () => {
    current = Math.max(current - 1, 1);
    showStep(current);
  });

  document.getElementById('onboarding-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validateStep(1) || !validateStep(2)) return;

    finishBtn.disabled = true;
    setError('');
    try {
      const payload = {
        initial_balance: Number(document.getElementById('initial_balance').value),
        has_salary: hasSalaryCheckbox.checked,
      };
      if (payload.has_salary) {
        payload.salary_amount = Number(document.getElementById('salary_amount').value);
        payload.salary_frequency = document.getElementById('salary_frequency').value;
      }
      await apiFetch('/api/onboarding', { method: 'POST', body: payload });
      window.location.href = '/index.html';
    } catch (err) {
      setError(err.message);
    } finally {
      finishBtn.disabled = false;
    }
  });

  showStep(current);
})();
