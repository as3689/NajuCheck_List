document.addEventListener('DOMContentLoaded', () => {
  const loginForm = document.getElementById('login-form');
  if (!loginForm) {
    console.error('Error: login-form element not found in the DOM.');
    return;
  }

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    console.log('Submitting login:', { username, password });

    if (!username || !password) {
      console.warn('Username or password is empty.');
      alert('아이디와 비밀번호를 모두 입력하세요.');
      return;
    }

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      console.log('Login response status:', response.status);

      const result = await response.json();
      console.log('Login result:', result);

      if (result.success) {
        console.log(`Login successful for user: ${username}`);
        localStorage.setItem('username', username);
        window.location.href = '/main';
      } else {
        console.warn('Login failed:', result.message);
        alert(result.message || '로그인에 실패했습니다.');
      }
    } catch (error) {
      console.error('Login error:', error.message);
      alert('로그인 중 오류가 발생했습니다: ' + error.message);
    }
  });
});