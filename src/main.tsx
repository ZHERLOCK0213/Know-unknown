import React from 'react';
import ReactDOM from 'react-dom/client';
import { startUpdates } from './pwa';
import App from './App';
import './styles.css';
startUpdates();
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
