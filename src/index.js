import React from 'react';
import ReactDOM from 'react-dom/client';
import ApplePay from './Applepay'; // Note: Ensure this file name matches your component file!
import 'react-toastify/dist/ReactToastify.css'; // Add CSS for react-toastify

// 1. Get the root element from index.html
const container = document.getElementById('root');

// 2. Create a React root
const root = ReactDOM.createRoot(container);

// 3. Render your main component
root.render(
  <React.StrictMode>
    <ApplePay />
  </React.StrictMode>
);