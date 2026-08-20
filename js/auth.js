(function () {
  const loginForm = document.getElementById('login-form');
  const signupForm = document.getElementById('signup-form');
  const errorEl = document.getElementById('error');

  function setError(msg) {
    if (errorEl) errorEl.textContent = msg || '';
  }

  async function afterAuth(user) {
    if (!user.onboarding_completed) {
      window.location.href = '/onboarding.html';
    } else {
      window.location.href = '/index.html';
    }
  }

  if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      setError('');
      const submitBtn = document.getElementById('submit-btn');
      submitBtn.disabled = true;
      try {
        const email = document.getElementById('email').value.trim();
        const password = document.getElementById('password').value;
        const data = await apiFetch('/api/auth/login', { method: 'POST', body: { email, password } });
        await afterAuth(data.user);
      } catch (err) {
        setError(err.message);
      } finally {
        submitBtn.disabled = false;
      }
    });
  }

  if (signupForm) {
    signupForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      setError('');
      const password = document.getElementById('password').value;
      const password2 = document.getElementById('password2').value;
      if (password !== password2) {
        setError('Le password non coincidono');
        return;
      }
      const submitBtn = document.getElementById('submit-btn');
      submitBtn.disabled = true;
      try {
        const email = document.getElementById('email').value.trim();
        const data = await apiFetch('/api/auth/signup', { method: 'POST', body: { email, password } });
        await afterAuth(data.user);
      } catch (err) {
        setError(err.message);
      } finally {
        submitBtn.disabled = false;
      }
    });
  }
})();
