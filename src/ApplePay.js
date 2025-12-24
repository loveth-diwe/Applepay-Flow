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
    displayName: 'My Awesome Store',
    paymentMode: 'processPayment',
};

const ApplePay = () => {
  const containerRef = useRef(null);
  const navigate = useNavigate();
  const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || "";

  const [config, setConfig] = useState(defaultConfig);
  const [paymentToken, setPaymentToken] = useState(null);
  const [viewRaw, setViewRaw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showMainContent, setShowMainContent] = useState(false);
  const [initialPaymentMode, setInitialPaymentMode] = useState(defaultConfig.paymentMode);

  useEffect(() => {
    const savedConfig = localStorage.getItem('applePayConfig');
    if (savedConfig) setConfig(JSON.parse(savedConfig));
  }, []);

  useEffect(() => {
    localStorage.setItem('applePayConfig', JSON.stringify(config));
  }, [config]);

  useEffect(() => {
    const scriptId = 'risk-js';
    if (document.getElementById(scriptId)) return;
    const script = document.createElement('script');
    script.id = scriptId;
    script.src = "https://risk.sandbox.checkout.com/cdn/risk/2.3/risk.js";
    script.defer = true;
    script.integrity = "sha384-ZGdiIppkJzwran7Bjk0sUZy5z1mZGpR/MJx7LC0xCTyFE2sBpPFeLu4r15yGVei6";
    script.crossOrigin = "anonymous";
    document.body.appendChild(script);
    return () => { const s = document.getElementById(scriptId); if (s) s.remove(); };
  }, []);

  useEffect(() => {
    if (!showMainContent) return;
    const existingButton = document.querySelector('apple-pay-button');
    if (existingButton) existingButton.remove();
    const applePayButton = document.createElement('apple-pay-button');
    applePayButton.setAttribute('buttonstyle', 'black');
    applePayButton.setAttribute('type', 'plain');
    applePayButton.setAttribute('locale', 'en-GB');
    containerRef.current?.appendChild(applePayButton);
    applePayButton.addEventListener('click', handleApplePay);
    return () => applePayButton.removeEventListener('click', handleApplePay);
  }, [config, showMainContent]);

  const handleApplePay = () => {
    if (!window.ApplePaySession || !ApplePaySession.canMakePayments()) {
      toast.error("Apple Pay is not available on this device/browser.");
      return;
    }
    setLoading(true);
    let deviceSessionId = null;

    const paymentRequest = {
      countryCode: config.countryCode,
      currencyCode: config.currencyCode,
      supportedNetworks: config.supportedNetworks,
      merchantCapabilities: config.merchantCapabilities,
      merchantIdentifier: config.merchantIdentifier,
      total: { label: config.displayName, amount: parseFloat(config.amount).toFixed(2) },
    };

    const session = new window.ApplePaySession(3, paymentRequest);

    session.onvalidatemerchant = async (event) => {
        try {
            const risk = await window.Risk.create("pk_sbox_w5tsowjlb3s27oveipn5bmrs34f");
            deviceSessionId = await risk.publishRiskData();
            const res = await axios.post(`${API_BASE_URL}/api/apple-pay/validate-merchant`, {
                validationURL: event.validationURL,
                initiativeContext: config.initiativeContext,
                merchantIdentifier: config.merchantIdentifier,
                displayName: config.displayName
            });
            session.completeMerchantValidation(res.data);
        } catch (err) { session.abort(); toast.error("Validation failed"); }
    };

    session.onpaymentauthorized = async (event) => {
      const token = event.payment.token;
      const params = {
          version: token.paymentData.version,
          data: token.paymentData.data,
          signature: token.paymentData.signature,
          header: {
            ephemeralPublicKey: token.paymentData.header.ephemeralPublicKey,
            publicKeyHash: token.paymentData.header.publicKeyHash,
            transactionId: token.paymentData.header.transactionId
          }
      };

      if (config.paymentMode === 'processPayment') {
        try {
          const res = await axios.post(`${API_BASE_URL}/api/process-payment`, {
            walletType: 'applepay', // Updated parameter
            tokenData: params,
            amount: Math.round(parseFloat(config.amount) * 100),
            currencyCode: config.currencyCode,
            countryCode: config.countryCode,
            deviceSessionId: deviceSessionId
          });

          if (res.data.approved) {
              setPaymentToken(JSON.stringify(token.paymentData));
              session.completePayment(window.ApplePaySession.STATUS_SUCCESS);
              toast.success('Apple Pay payment successful!');
          } else {
              session.completePayment(window.ApplePaySession.STATUS_FAILURE);
              toast.error('Payment declined.');
          }
        } catch (err) { session.completePayment(window.ApplePaySession.STATUS_FAILURE); }
      } else {
          setPaymentToken(JSON.stringify(token.paymentData));
          session.completePayment(window.ApplePaySession.STATUS_SUCCESS);
          toast.info('Token generated!');
      }
      setLoading(false);
    };
    session.begin();
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <button onClick={() => navigate('/')} className="mb-6 flex items-center text-gray-600 hover:text-black font-medium">
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
          Back to Selection
      </button>

      {!showMainContent ? (
        <div className="flex items-center justify-center min-h-[60vh]">
            <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md text-center">
                <h2 className="text-2xl font-bold mb-6">Apple Pay Flow</h2>
                <select value={initialPaymentMode} onChange={(e) => setInitialPaymentMode(e.target.value)} className="w-full border rounded-lg px-4 py-3 mb-6">
                    <option value="processPayment">End-to-End Payment</option>
                    <option value="generateTokenOnly">Token Generation</option>
                </select>
                <button onClick={() => setShowMainContent(true)} className="w-full bg-black text-white py-3 rounded-lg">Continue</button>
            </div>
        </div>
      ) : (
        /* ... existing configuration UI grid ... */
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
             <div className="bg-white p-6 rounded-xl shadow-md">
                <h2 className="text-xl font-semibold mb-4">Configuration</h2>
                <div className="mb-4">
                    <label className="block text-sm font-medium mb-1">Amount</label>
                    <input type="text" value={config.amount} onChange={(e) => setConfig({ ...config, amount: e.target.value })} className="w-full border rounded px-3 py-2" />
                </div>
                {/* ... Add other config fields as needed ... */}
             </div>
             <div className="flex flex-col items-center">
                <div ref={containerRef} />
                <div className="w-full bg-black text-green-400 p-4 rounded mt-4 font-mono text-xs overflow-auto h-64">
                    {paymentToken ? JSON.stringify(JSON.parse(paymentToken), null, 2) : "Waiting for Apple Pay..."}
                </div>
             </div>
        </div>
      )}
    </div>
  );
};

export default ApplePay;