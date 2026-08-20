import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import Demo from './pages/Demo.jsx';
import './index.css';

// ?demo → showroom de mini-jogos/eventos (offline, sem socket). Usado no /admin.
const isDemo = new URLSearchParams(window.location.search).has('demo');

createRoot(document.getElementById('root')).render(
  <StrictMode>{isDemo ? <Demo /> : <App />}</StrictMode>
);
