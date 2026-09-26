const form = document.querySelector('#account-form');
const status = document.querySelector('#account-status');
const mode = document.body.dataset.accountMode;

document.querySelectorAll('[data-toggle-password]').forEach(button => {
  button.addEventListener('click', () => {
    const input = document.getElementById(button.dataset.togglePassword);
    const showing = input.type === 'password';
    input.type = showing ? 'text' : 'password';
    button.textContent = showing ? 'Hide' : 'Show';
    button.setAttribute('aria-pressed', String(showing));
    button.setAttribute('aria-label', `${showing ? 'Hide' : 'Show'} ${input.labels[0].textContent.toLowerCase()}`);
    input.focus();
  });
});

const confirm = document.querySelector('#account-confirm');
confirm?.addEventListener('input', () => confirm.setCustomValidity(''));
document.querySelector('#account-password').addEventListener('input', () => confirm?.setCustomValidity(''));

form.addEventListener('submit', event => {
  event.preventDefault();
  status.hidden = true;
  if (!form.reportValidity()) return;

  const password = document.querySelector('#account-password');
  if (confirm && confirm.value !== password.value) {
    confirm.setCustomValidity('Passwords do not match.');
    confirm.reportValidity();
    return;
  }

  password.value = '';
  if (confirm) confirm.value = '';
  status.textContent = mode === 'register'
    ? 'Registration is not available yet. Nothing was sent or saved. You can explore SportsLab without an account.'
    : 'Sign in is not available yet. Nothing was sent or saved. You can explore SportsLab without an account.';
  status.hidden = false;
});
