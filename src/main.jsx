import React from 'react'
import ReactDOM from 'react-dom/client'

  import App from './App.jsx'
// Register service worker for offline caching — skip in dev to avoid stale JS cache bugs
if ('serviceWorker' in navigator && !import.meta.env.DEV) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.log('Service worker registration failed:', err);
    });
  });
} else if ('serviceWorker' in navigator && import.meta.env.DEV) {
  // Unregister any lingering service workers in dev to prevent stale cache serving
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const reg of registrations) reg.unregister();
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)