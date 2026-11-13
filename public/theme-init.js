// Applies the saved day/night theme before the first paint (loaded from index.html; CSP allows 'self' scripts).
try {
  var t = localStorage.getItem('khabsa:theme') === 'light' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', t);
  document.addEventListener('DOMContentLoaded', function () {
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', t === 'light' ? '#f5f2ff' : '#0c0819');
  });
} catch (e) {
  document.documentElement.setAttribute('data-theme', 'dark');
}
