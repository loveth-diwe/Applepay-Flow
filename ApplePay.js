/* global ApplePaySession */
import React, { useEffect, useRef, useState } from 'react';
import axios from 'axios';
import { toast } from 'react-toastify';

// Default configuration for Apple Pay
const defaultConfig = {
    amount: '1.00',
    currencyCode: 'GBP',
    countryCode: 'GB',
    supportedNetworks: ['masterCard', 'visa', 'amex'],
    merchantCapabilities: ['supports3DS'],
    initiativeContext: 'react-flask-project-kpyi.onrender.com',
    merchantIdentifier: 'merchant.com.reactFlask.sandbox',
    displayName: 'My Awesome Store',
    paymentMode: 'processPayment', // 'processPayment' or 'generateTokenOnly'
};

// All possible networks for selection
const allNetworks = ['masterCard', 'visa', 'amex', 'discover', 'cartesBancaires', 'jcb'];

// All optional merchant capabilities for selection
const allOptionalMerchantCapabilities = ['supportsCredit', 'supportsDebit', 'supportsEMV'];

const ApplePay = () => {
  const containerRef = useRef(null);
  const API_BASE_URL = process.env.REACT_APP_BACKEND_URL || "";

  const [config, setConfig] = useState(defaultConfig);
  const [paymentToken, setPaymentToken] = useState(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [viewRaw, setViewRaw] = useState(false);
  const [loading, setLoading] = useState(false);

  const [showMainContent, setShowMainContent] = useState(false);
  const [initialPaymentMode, setInitialPaymentMode] = useState(defaultConfig.paymentMode);


  // Load config from localStorage on mount
  useEffect(() => {
    const savedConfig = localStorage.getItem('applePayConfig');
    if (savedConfig) {
        setConfig(JSON.parse(savedConfig));
    }
  }, []);

  // Save config to localStorage on change
  useEffect(() => {
    localStorage.setItem('applePayConfig', JSON.stringify(config));
  }, [config]);

  // Effect to load the Risk.js script when the component mounts
  useEffect(() => {
    const scriptId = 'risk-js';
    if (document.getElementById(scriptId)) {
        return; // Script already on the page
    }

    const script = document.createElement('script');
    script.id = scriptId;
    script.src = "https://risk.sandbox.checkout.com/cdn/risk/2.3/risk.js";
    script.defer = true;
    script.integrity = "sha384-ZGdiIppkJzwran7Bjk0sUZy5z1mZGpR/MJx7LC0xCTyFE2sBpPFeLu4r15yGVei6";
    script.crossOrigin = "anonymous";
    
    script.onload = () => {
        console.log("Risk.js SDK script has been loaded.");
    };
    
    document.body.appendChild(script);

    // Cleanup function to remove the script when the component unmounts
    return () => {
        const riskScript = document.getElementById(scriptId);
        if (riskScript) {
            riskScript.remove();
        }
    };
  }, []);


  // Effect to create/re-create the Apple Pay button when config changes
  useEffect(() => {
    if (!showMainContent) return;

    const existingButton = document.querySelector('apple-pay-button');
    if (existingButton) existingButton.remove();

    // Create new Apple Pay button
    const applePayButton = document.createElement('apple-pay-button');
    applePayButton.setAttribute('buttonstyle', 'black');
    applePayButton.setAttribute('type', 'plain');
    applePayButton.setAttribute('locale', 'en-GB');
    containerRef.current?.appendChild(applePayButton);

    // Add click listener
    applePayButton.addEventListener('click', handleApplePay);

    return () => {
      applePayButton.removeEventListener('click', handleApplePay);
    };
  }, [config, showMainContent]); 


  const toggleNetwork = (network) => {
    setConfig((prev) => ({
      ...prev,
      supportedNetworks: prev.supportedNetworks.includes(network)
        ? prev.supportedNetworks.filter((n) => n !== network)
        : [...prev.supportedNetworks, network],
    }));
  };

  const toggleMerchantCapability = (capability) => {
      setConfig((prev) => ({
          ...prev,
          merchantCapabilities: prev.merchantCapabilities.includes(capability)
              ? prev.merchantCapabilities.filter((c) => c !== capability)
              : [...prev.merchantCapabilities, capability],
      }));
  };

  const handleReset = () => {
    setConfig(defaultConfig);
    localStorage.removeItem('applePayConfig');
    setPaymentToken(null);
    setPaymentSuccess(false);
  };


  const handleApplePay = () => { // --- REMOVED ASYNC ---
    if (!window.ApplePaySession || !ApplePaySession.canMakePayments()) {
      toast.error("Apple Pay is not available on this device/browser.");
      return;
    }
    
    if (typeof window.Risk === 'undefined') {
        toast.error("Fraud detection script is still loading. Please try again in a moment.");
        return;
    }

    setLoading(true);
    // This variable will be accessible across the session's event handlers
    let deviceSessionId = null;

    const paymentRequest = {
      countryCode: config.countryCode,
      currencyCode: config.currencyCode,
      supportedNetworks: config.supportedNetworks,
      merchantCapabilities: config.merchantCapabilities,
      merchantIdentifier: config.merchantIdentifier,
      total: {
        label: config.displayName,
        amount: parseFloat(config.amount).toFixed(2),
      },
    };

    // --- Create the session SYNCHRONOUSLY ---
    const session = new window.ApplePaySession(3, paymentRequest);

    session.onvalidatemerchant = async (event) => {
        // --- MODIFIED: Perform Risk.js logic and merchant validation here ---
        try {
            // 1. Run Risk.js data collection
            toast.info("Starting security check...");
            const risk = await window.Risk.create("pk_sbox_w5tsowjlb3s27oveipn5bmrs34f");
            const dsid = await risk.publishRiskData();
            deviceSessionId = "dsid"; // Store the ID for the payment step
            toast.success(`Security check complete.`);
            console.log("Risk.js Device Session ID:", dsid);

            // 2. Validate the merchant with your backend
            const validationURL = event.validationURL;
            const res = await axios.post(`${API_BASE_URL}/api/apple-pay/validate-merchant`, {
                validationURL,
                initiativeContext: config.initiativeContext,
                merchantIdentifier: config.merchantIdentifier,
                displayName: config.displayName
            });
            session.completeMerchantValidation(res.data);

        } catch (err) {
            console.error("Risk assessment or Merchant validation failed", err);
            toast.error("Security check or merchant validation failed. Please try again.");
            session.abort();
        }
    };

    session.onpaymentauthorized = async (event) => {
      const token = event.payment.token;

      const params ={
          "version":token.paymentData.version,
          "data":token.paymentData.data,
          "signature": token.paymentData.signature,
          "header":{
            "ephemeralPublicKey":token.paymentData.header.ephemeralPublicKey,
            "publicKeyHash": token.paymentData.header.publicKeyHash,
            "transactionId": token.paymentData.header.transactionId
          }
      };

      console.log("Apple Pay Payment Token version:", token.paymentData.version);
      console.log("Apple Pay Payment Token data:", token.paymentData.data);
      console.log("Apple Pay Payment Token signature:", token.paymentData.signature);
      console.log("Apple Pay Payment Token transactionId:", token.paymentData.header.transactionId);


      if (config.paymentMode === 'processPayment') {
        try {
          const res = await axios.post(`${API_BASE_URL}/api/apple-pay-session`, {
            //tokenData: token.paymentData,
            tokenData: params,
            amount: Math.round(parseFloat(config.amount) * 100),
            currencyCode: config.currencyCode,
            countryCode: config.countryCode,
            deviceSessionId: deviceSessionId // Use the ID generated during validation
          });

          if (res.data.approved) {
              setPaymentToken(JSON.stringify(token.paymentData));
              setPaymentSuccess(true);
              session.completePayment(window.ApplePaySession.STATUS_SUCCESS);
              toast.success('Apple Pay payment successful!');
            } else {
              setPaymentToken(JSON.stringify(token.paymentData));
              setPaymentSuccess(false);
              session.completePayment(window.ApplePaySession.STATUS_FAILURE);
              toast.error('Apple Pay payment failed.');
            }
          } catch (err) {
            console.error('Payment failed', err);
            setPaymentToken(JSON.stringify(token.paymentData));
            setPaymentSuccess(false);
            toast.error('Apple Pay payment failed due to an error.');
            session.completePayment(window.ApplePaySession.STATUS_FAILURE);
          }
      } else { 
          setPaymentToken(JSON.stringify(token.paymentData));
          setPaymentSuccess(true);
          session.completePayment(window.ApplePaySession.STATUS_SUCCESS);
          toast.info('Apple Pay token generated successfully on frontend!');
      }
      setLoading(false);
    };
    
    session.oncancel = () => {
        setLoading(false);
        toast.warn("Payment cancelled by user.");
    };

    session.begin();
  };

  const handleDownload = () => {
    if (!paymentToken) return;
    const blob = new Blob([paymentToken], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'payment-token.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleInitialModeSelection = () => {
      setConfig(prevConfig => ({
          ...prevConfig,
          paymentMode: initialPaymentMode
      }));
      setShowMainContent(true);
  };


  return (
    <div className="min-h-screen bg-gray-100 p-6">
      {!showMainContent ? (
        <div className="flex items-center justify-center min-h-[calc(100vh-100px)]">
            <div className="bg-white p-8 rounded-xl shadow-lg w-full max-w-md text-center">
                <h2 className="text-2xl font-bold mb-6 text-gray-800">Choose your Apple Pay flow</h2>
                <div className="mb-6">
                    <select
                        id="paymentModeSelect"
                        value={initialPaymentMode}
                        onChange={(e) => setInitialPaymentMode(e.target.value)}
                        className="w-full border rounded-lg px-4 py-3 text-gray-900 focus:ring-blue-500 focus:border-blue-500"
                    >
                        <option value="processPayment">End-to-End Payment</option>
                        <option value="generateTokenOnly">Token Generation</option>
                    </select>
                </div>
                <button
                    onClick={handleInitialModeSelection}
                    className="w-full bg-blue-600 text-white font-semibold py-3 px-6 rounded-lg hover:bg-blue-700 transition duration-300 ease-in-out"
                >
                    Continue
                </button>
            </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Configuration Panel */}
          <div className="bg-white p-6 rounded-xl shadow-md">
            <h2 className="text-xl font-semibold mb-4">Configuration</h2>

            <div className="mb-6">
                <label className="block text-sm font-medium mb-2">Payment Action</label>
                <div className="flex flex-col space-y-2">
                    <label className="inline-flex items-center">
                        <input
                            type="radio"
                            name="paymentAction"
                            value="processPayment"
                            checked={config.paymentMode === 'processPayment'}
                            onChange={() => setConfig({...config, paymentMode: 'processPayment'})}
                            className="form-radio h-4 w-4 text-blue-600"
                        />
                        <span className="ml-2 text-gray-700">End-to-End Payment</span>
                    </label>
                    <label className="inline-flex items-center">
                        <input
                            type="radio"
                            name="paymentAction"
                            value="generateTokenOnly"
                            checked={config.paymentMode === 'generateTokenOnly'}
                            onChange={() => setConfig({...config, paymentMode: 'generateTokenOnly'})}
                            className="form-radio h-4 w-4 text-blue-600"
                        />
                        <span className="ml-2 text-gray-700">Token Generation</span>
                    </label>
                </div>
            </div>

            <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Merchant Identifier</label>
                <input
                    type="text"
                    value={config.merchantIdentifier}
                    onChange={(e) => setConfig({ ...config, merchantIdentifier: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                />
            </div>

            <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Display Name</label>
                <input
                    type="text"
                    value={config.displayName}
                    onChange={(e) => setConfig({ ...config, displayName: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                />
            </div>

            <div className="mb-4">
                <label className="block text-sm font-medium mb-1">Initiative Context</label>
                <input
                    type="text"
                    value={config.initiativeContext}
                    onChange={(e) => setConfig({ ...config, initiativeContext: e.target.value })}
                    className="w-full border rounded px-3 py-2"
                />
            </div>

            <div className="flex gap-4 mb-4">
                <div className="flex-1">
                    <label className="block text-sm font-medium mb-1">Country Code</label>
                    <input
                        type="text"
                        value={config.countryCode}
                        onChange={(e) => setConfig({ ...config, countryCode: e.target.value })}
                        className="w-full border rounded px-3 py-2"
                    />
                </div>
                <div className="flex-1">
                    <label className="block text-sm font-medium mb-1">Currency Code</label>
                    <input
                        type="text"
                        value={config.currencyCode}
                        onChange={(e) => setConfig({ ...config, currencyCode: e.target.value })}
                        className="w-full border rounded px-3 py-2"
                    />
                </div>
                <div className="flex-1">
                    <label className="block text-sm font-medium mb-1">Amount</label>
                    <input
                        type="text"
                        value={config.amount}
                        onChange={(e) => setConfig({ ...config, amount: e.target.value })}
                        className="w-full border rounded px-3 py-2"
                    />
                </div>
            </div>

            <div className="mb-6 text-center">
                <label className="block text-sm font-medium mb-2">Supported Card Networks</label>
                <div className="flex flex-wrap justify-center gap-2">
                    {allNetworks.map(network => (
                        <button
                            key={network}
                            onClick={() => toggleNetwork(network)}
                            className={`px-3 py-1 rounded border text-sm ${config.supportedNetworks.includes(network)
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-gray-800 border-gray-300'
                                }`}
                        >
                            {network}
                        </button>
                    ))}
                </div>
            </div>

            <div className="mb-6 text-center">
                <label className="block text-sm font-medium mb-2">Merchant Capabilities</label>
                <div className="flex flex-wrap justify-center gap-2">
                    <button
                        className="px-3 py-1 rounded border text-sm bg-blue-600 text-white border-blue-600 cursor-not-allowed"
                        onClick={() => toast.info("supports3DS is a required capability and is always enabled.")}
                    >
                        supports3DS (Required)
                    </button>
                    {allOptionalMerchantCapabilities.map(capability => (
                        <button
                            key={capability}
                            onClick={() => toggleMerchantCapability(capability)}
                            className={`px-3 py-1 rounded border text-sm ${(config.merchantCapabilities || []).includes(capability)
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-gray-800 border-gray-300'
                                }`}
                        >
                            {capability}
                        </button>
                    ))}
                </div>
            </div>

            <button
              onClick={handleReset}
              className="mt-2 px-4 py-2 rounded bg-red-600 text-white hover:bg-red-700"
            >
              Reset to Defaults
            </button>
          </div>

          <div className="flex flex-col h-full">
            <div className="flex justify-center items-center mb-6">
              <div ref={containerRef} className="text-center" />
            </div>

            <div className="flex-1 bg-black text-green-400 font-mono text-sm p-4 rounded-lg overflow-auto h-64 whitespace-pre-wrap break-words">
              {paymentToken
                ? viewRaw
                  ? paymentToken
                  : JSON.stringify(JSON.parse(paymentToken), null, 2)
                : config.paymentMode === 'generateTokenOnly' ? 'Apple Pay token will appear here after generation (Frontend Only).' : 'Waiting for payment...'}
            </div>

            <div className="flex justify-between items-center mt-4">
              {paymentToken && (
                <button
                  onClick={handleDownload}
                  className="px-4 py-2 rounded bg-green-600 text-white hover:bg-green-700"
                >
                  Download Token as JSON
                </button>
              )}

              <button
                className={`px-3 py-1 text-sm rounded ${paymentToken ? 'bg-gray-700 text-white hover:bg-gray-600' : 'bg-gray-300 text-gray-500 cursor-not-allowed'}`}
                onClick={() => {
                  if (paymentToken) setViewRaw(!viewRaw);
                }}
                disabled={!paymentToken}
              >
                {viewRaw ? 'Pretty View' : 'Raw View'}
              </button>
            </div>
          </div>
        </div>
      )}
      <style>
        {`
          apple-pay-button {
            --apple-pay-button-width: 200px;
            --apple-pay-button-height: 40px;
            --apple-pay-button-border-radius: 8px;
            display: block;
            margin: 2rem auto;
            opacity: 0;
            transform: translateY(20px);
            animation: fadeInUp 0.6s ease-out forwards;
            transition: transform 0.3s ease, box-shadow 0.3s ease;
          }

          apple-pay-button:hover {
            transform: translateY(15px) scale(1.05);
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
          }

          @keyframes fadeInUp {
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }
        `}
      </style>
    </div>
  );
};

export default ApplePay;
