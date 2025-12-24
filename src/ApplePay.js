/* global ApplePaySession */
import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';
import { useNavigate } from 'react-router-dom';

const defaultConfig = {
    amount: '1.00',
    currencyCode: 'GBP',
    countryCode: 'GB',
    supportedNetworks: ['masterCard', 'visa', 'amex'],
    merchantCapabilities: ['supports3DS'],
    initiativeContext: 'apm-test-c5yi.onrender.com',
    merchantIdentifier: 'merchant.com.reactFlask.sandbox',
    displayName: 'APM Test Store',
    paymentMode: 'processPayment',
};

const ApplePay = () => {
  const containerRef = useRef(null);
  const navigate = useNavigate();
  const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || "";

  const [config, setConfig] = useState(defaultConfig);
  const [paymentToken, setPaymentToken] = useState(null);
  const [showMainContent, setShowMainContent] = useState(false);

  // Merchant Validation & Payment Logic (Keep your existing handleApplePay here)
  const handleApplePay = async () => { /* ... existing logic ... */ };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <button onClick={() => navigate('/')} className="mb-6 flex items-center text-gray-500 hover:text-black transition-colors font-medium">
          ← Back to Hub
      </button>

      {!showMainContent ? (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-md text-center">
                <h2 className="text-2xl font-bold mb-4">Configure Apple Pay</h2>
                <p className="text-gray-500 mb-6 text-sm">Select your testing mode to proceed to the checkout sheet.</p>
                <select
                  value={config.paymentMode}
                  onChange={(e) => setConfig({...config, paymentMode: e.target.value})}
                  className="w-full border border-gray-200 rounded-xl px-4 py-3 mb-6 focus:ring-2 focus:ring-black outline-none"
                >
                    <option value="processPayment">End-to-End (Capture Funds)</option>
                    <option value="generateTokenOnly">Token Generation Only</option>
                </select>
                <button onClick={() => setShowMainContent(true)} className="w-full bg-black text-white font-bold py-4 rounded-xl hover:bg-gray-800 transition">
                    Open Test Panel
                </button>
            </div>
        </div>
      ) : (
        <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* LEFT: CONFIGURATION PANEL */}
          <div className="bg-white p-8 rounded-2xl shadow-sm border border-gray-100">
            <h3 className="text-lg font-bold mb-6 border-b pb-4">Merchant Settings</h3>
            <div className="space-y-4">
                <div>
                    <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Display Name</label>
                    <input type="text" value={config.displayName} onChange={(e) => setConfig({...config, displayName: e.target.value})} className="w-full p-3 bg-gray-50 rounded-lg border-none focus:ring-1 focus:ring-black" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Currency</label>
                        <input type="text" value={config.currencyCode} className="w-full p-3 bg-gray-100 rounded-lg border-none" readOnly />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-gray-400 uppercase mb-1">Amount</label>
                        <input type="text" value={config.amount} onChange={(e) => setConfig({...config, amount: e.target.value})} className="w-full p-3 bg-gray-50 rounded-lg border-none" />
                    </div>
                </div>
            </div>
          </div>

          {/* RIGHT: PAYMENT BOX */}
          <div className="flex flex-col space-y-6">
            <div className="bg-white p-8 rounded-2xl shadow-lg text-center">
                <div className="mb-6">
                    <span className="text-gray-400 text-sm">Total to Pay</span>
                    <h1 className="text-4xl font-black text-gray-900">{config.currencyCode} {config.amount}</h1>
                </div>
                <div className="flex justify-center py-4" ref={containerRef}></div>
            </div>

            {/* LIVE CONSOLE */}
            <div className="bg-gray-900 rounded-2xl p-6 h-64 overflow-hidden flex flex-col shadow-inner">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-gray-500 text-xs font-mono uppercase">Transaction Logs</span>
                    <div className="flex gap-1"><div className="w-2 h-2 rounded-full bg-red-500"></div><div className="w-2 h-2 rounded-full bg-yellow-500"></div><div className="w-2 h-2 rounded-full bg-green-500"></div></div>
                </div>
                <pre className="text-green-400 font-mono text-xs overflow-auto flex-1 custom-scrollbar">
                    {paymentToken ? JSON.stringify(JSON.parse(paymentToken), null, 2) : "// Awaiting interaction..."}
                </pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ApplePay;