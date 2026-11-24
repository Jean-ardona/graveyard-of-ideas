import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { installTheme } from './ui/theme/installTheme';
import './ui/kit/haunted.css';

const rootEl = document.getElementById('root');
if (!rootEl) throw new Error('Root element not found');

installTheme();

createRoot(rootEl).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
