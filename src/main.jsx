import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
// Fonts ship with the site (no request to Google from a bystander's phone).
import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-500.css';
import '@fontsource/poppins/latin-600.css';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
