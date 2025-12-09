# Apple Pay session - Tokenize and Pay
from flask import Flask, jsonify, request, send_from_directory
from flask_cors import CORS
from checkout_sdk import CheckoutSdk
from checkout_sdk.environment import Environment
from checkout_sdk.payments.contexts.contexts import PaymentContextsRequest
import json, datetime, traceback, os, requests, uuid, traceback

app = Flask(__name__)
app.config["DEBUG"] = True
# change domain
CORS(app, origins=["https://react-frontend-elpl.onrender.com", "https://react-flask-project-kpyi.onrender.com"]) #Frontend is running on https://
# These will be loaded from your .env file locally, or from Render's environment settings in production
CHECKOUT_SECRET_KEY = os.environ.get('CHECKOUT_SECRET_KEY')
CHECKOUT_PUBLIC_KEY = os.environ.get('CHECKOUT_PUBLIC_KEY')
# Path to your Apple Pay merchant certificate and key
APPLE_PAY_CERT = './certificate_sandbox.pem'
APPLE_PAY_KEY = './certificate_sandbox.key'
MERCHANT_ID = 'merchant.com.reactFlask.sandbox'
# Initialise Checkout SDK
checkout_api = CheckoutSdk.builder() \
    .secret_key(CHECKOUT_SECRET_KEY) \
    .public_key(CHECKOUT_PUBLIC_KEY)\
    .environment(Environment.sandbox()) \
    .build()
payments_client = checkout_api.payments
# Test to show FE and BE communicating ff
@app.route('/')
def get_data():
    return jsonify({"message": "Hello from Flask!"})
#Route for verify domain with apple pay file.
@app.route('/.well-known/apple-developer-merchantid-domain-association.txt')
def serve_apple_pay_verification():
    well_known_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.well-known')
    return send_from_directory(well_known_dir, 'apple-developer-merchantid-domain-association.txt')
# Recursively convert the payment details to a JSON-serializable structure
def make_json_serializable(data):
    """ Recursively make data JSON serializable """
    if isinstance(data, dict):
        return {key: make_json_serializable(value) for key, value in data.items()}
    elif isinstance(data, list):
        return [make_json_serializable(item) for item in data]
    elif hasattr(data, '__dict__'):
        return make_json_serializable(vars(data))
    elif isinstance(data, (str, int, float, bool, type(None))):
        return data
    elif hasattr(data, 'href'):  # Specific handling for ResponseWrapper links
        return data.href  # Assuming href holds the URL link
    else:
        return str(data)

@app.route('/api/apple-pay-session', methods=['POST'])
def apple_pay_session():
    data = request.get_json()
    print("Token Data in Apple Pay session call:", data["tokenData"])
    
    # 1. Tokenize the Apple Pay token using the SDK
    try:
        token_response = checkout_api.tokens.request_wallet_token({
            "type": "applepay",
            "token_data": data["tokenData"]
        })
        token = token_response.token  # The Checkout.com card token
        print("Tokenized Apple Pay token:", token)
    except Exception as e:
        print(f"Tokenization failed: {e}")
        return jsonify({"error": "Tokenization failed", "details": str(e)}), 400
    
    # 2. Use the token to create a payment request
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
            "reference": f"apple-pay-risk-demo-{uuid.uuid4().hex[:6]}",
            "processing_channel_id": "pc_pxk25jk2hvuenon5nyv3p6nf2i",
        }

        # --- NEW: Add risk data if device session ID is provided ---
        device_session_id = data.get("deviceSessionId")
        if device_session_id:
            payment_request['risk'] = {
                "enabled": True, # It's good practice to explicitly enable risk
                "device_session_id": device_session_id
            }
            print(f"Including risk data with device_session_id: {device_session_id}")
        
        payment_response = payments_client.request_payment(payment_request)
        
        # Determine payment status
        is_approved = payment_response.status == "Authorized" or payment_response.status == "Captured"
        return jsonify({
            "approved": is_approved,
            "status": payment_response.status,
            "payment_id": payment_response.id
        }), 200
    except Exception as e:
        print(f"Payment failed: {str(e)}")
        # Try to get more detailed error info from the SDK exception
        error_details = str(e)
        if hasattr(e, 'error_details'):
            error_details = e.error_details
        return jsonify({
            "approved": False,
            "error": error_details,
            "status": "Failed"
        }), 400

#Apple Pay - Validate Merchant
@app.route('/api/apple-pay/validate-merchant', methods=['POST'])
def validate_merchant():
    data = request.get_json()
    validation_url = data.get('validationURL')
    print("Validation URL:", validation_url)
    merchant_identifier = data.get('merchantIdentifier', MERCHANT_ID)  # Default to the defined MERCHANT_I
    print("Merchant Identifier:", merchant_identifier)
    display_name = data.get('displayName', "CKO Integrations")  # Default display name
    print("Display Name:", display_name)
    initiative_context = data.get('initiativeContext',"react-flask-project-kpyi.onrender.com")
    print("Initiative Context:", initiative_context)

    if not validation_url:
        return jsonify({"error": "Missing validationURL"}), 400
    payload = {
        "merchantIdentifier": merchant_identifier,
        "displayName": display_name,
        "initiative": "web",
        "initiativeContext": initiative_context  
    }
    
    try:
        response = requests.post(
            validation_url,
            json=payload,
            cert=(APPLE_PAY_CERT, APPLE_PAY_KEY),
            headers={"Content-Type": "application/json"}
        )
        response.raise_for_status()
        print("Merchant Verified")
        return jsonify(response.json())
    except requests.RequestException as e:
        print("❌ Error validating merchant:")
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run()