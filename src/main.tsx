import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import './styles.css';
registerSW({ onOfflineReady: () => window.dispatchEvent(new Event('cq-offline-ready')), onRegisterError: () => window.dispatchEvent(new Event('cq-offline-error')) });
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
