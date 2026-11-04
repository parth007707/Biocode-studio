import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Safely suppress benign ResizeObserver loop notifications across browsers
if (typeof window !== 'undefined') {
  const resizeObserverErrorHandler = (e: ErrorEvent) => {
    if (
      e.message &&
      (e.message.includes('ResizeObserver loop completed with undelivered notifications') ||
       e.message.includes('ResizeObserver loop limit exceeded') ||
       e.message.includes('ResizeObserver loop'))
    ) {
      e.stopImmediatePropagation();
      e.preventDefault();
      return true;
    }
  };
  window.addEventListener('error', resizeObserverErrorHandler);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

