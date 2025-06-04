document.addEventListener('DOMContentLoaded', function() {
    const themeToggleButton = document.getElementById('theme-toggle-btn');
    const body = document.body;

    // Function to apply theme
    function applyTheme(theme) {
        if (theme === 'dark') {
            body.classList.add('dark-mode');
            if (themeToggleButton) themeToggleButton.textContent = '☀️ 浅色模式';
        } else {
            body.classList.remove('dark-mode');
            if (themeToggleButton) themeToggleButton.textContent = '🌙 深色模式';
        }
    }

    // Load saved theme from localStorage or default to 'light'
    let currentTheme = localStorage.getItem('theme') || 'light';
    applyTheme(currentTheme);

    // Toggle theme on button click
    if (themeToggleButton) {
        themeToggleButton.addEventListener('click', function() {
            currentTheme = body.classList.contains('dark-mode') ? 'light' : 'dark';
            localStorage.setItem('theme', currentTheme);
            applyTheme(currentTheme);
        });
    }
});
