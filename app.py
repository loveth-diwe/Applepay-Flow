# Payment Session - Universal Wallet Processing
from flask import Flask, jsonify, request, send_from_directory, render_template
from flask_cors import CORS
from checkout_sdk import CheckoutSdk
from checkout_sdk.environment import Environment
import json, os, uuid, requests, traceback
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
BUILD_FOLDER = BASE_DIR / 'build'

app = Flask(__name__, static_folder=str(BUILD_FOLDER / 'static'), template_folder=str(BUILD_FOLDER))
app.config["DEBUG"] = True

CORS(app, origins=["https://applepay-flow.onrender.com"])

CHECKOUT_SECRET_KEY = os.environ.get('CHECKOUT_SECRET_KEY')
CHECKOUT_PUBLIC_KEY = os.environ.get('CHECKOUT_PUBLIC_KEY')

# Apple Pay Specifics (Still needed for Apple validation only)
APPLE_PAY_CERT = './certificate_sandbox.pem'
APPLE_PAY_KEY = './certificate_sandbox.key'
MERCHANT_ID = 'merchant.com.reactFlask.sandbox'

# Initialise Checkout SDK
checkout_api = CheckoutSdk.builder() \
    .secret_key(CHECKOUT_SECRET_KEY) \
    .public_key(CHECKOUT_PUBLIC_KEY) \
    .environment(Environment.sandbox()) \
    .build()


@app.route('/')
def get_data():
    return render_template('index.html')


# --- RENAMED UNIVERSAL ROUTE ---
@app.route('/api/process-payment', methods=['POST'])
def process_payment():
    data = request.get_json()
    # Accept 'applepay' or 'googlepay' from frontend. Default to applepay for safety.
    wallet_type = data.get("walletType", "applepay")

    print(f"Processing {wallet_type} tokenization...")

    # 1. Tokenize the Wallet data
    try:
        token_response = checkout_api.tokens.request_wallet_token({
            "type": wallet_type,
            "token_data": data["tokenData"]
        })
        token = token_response.token
    except Exception as e:
        print(f"Tokenization failed: {e}")
        return jsonify({"error": "Tokenization failed", "details": str(e)}), 400

    # 2. Create payment request
    try:
        payment_request = {
            "source": {
                "type": "token",
                "token": token,
                "billing_address": {
                    "country": data.get("countryCode", "GB"),
                }
            },
            "amount": data["amount"],
            "currency": data["currencyCode"],
            "reference": f"{wallet_type}-demo-{uuid.uuid4().hex[:6]}",
            "processing_channel_id": "pc_pxk25jk2hvuenon5nyv3p6nf2i",
        }

        # Risk Data
        device_session_id = data.get("deviceSessionId")
        if device_session_id:
            payment_request['risk'] = {"enabled": True, "device_session_id": device_session_id}

        payment_response = checkout_api.payments.request_payment(payment_request)

        is_approved = payment_response.status in ["Authorized", "Captured"]
        return jsonify({
            "approved": is_approved,
            "status": payment_response.status,
            "payment_id": payment_response.id
        }), 200
    except Exception as e:
        print(f"Payment failed: {str(e)}")
        return jsonify({"approved": False, "error": str(e), "status": "Failed"}), 400


# Keep Apple-specific validation routes (Google Pay doesn't need these)
@app.route('/api/apple-pay/validate-merchant', methods=['POST'])
def validate_merchant():
    # ... (Keep your existing merchant validation code here) ...
    pass


@app.route('/.well-known/apple-developer-merchantid-domain-association.txt')
def serve_apple_pay_verification():
    well_known_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.well-known')
    return send_from_directory(well_known_dir, 'apple-developer-merchantid-domain-association.txt')


@app.route('/<path:path>')
def catch_all(path):
    return render_template("index.html")


if __name__ == '__main__':
    app.run()