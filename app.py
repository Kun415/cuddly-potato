from flask import Flask, render_template, request, jsonify, url_for
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import os, base64, qrcode, io

app = Flask(__name__)

# Config: PBKDF2 iterations and sizes
ITERATIONS = 240000
SALT_LEN = 16
IV_LEN = 12

def derive_key(passphrase: bytes, salt: bytes) -> bytes:
    kdf = PBKDF2HMAC(
        algorithm=hashes.SHA256(),
        length=32,
        salt=salt,
        iterations=ITERATIONS,
    )
    return kdf.derive(passphrase)

def encrypt_message(passphrase: str, plaintext: str) -> str:
    salt = os.urandom(SALT_LEN)
    iv = os.urandom(IV_LEN)
    key = derive_key(passphrase.encode('utf-8'), salt)
    aesgcm = AESGCM(key)
    ct = aesgcm.encrypt(iv, plaintext.encode('utf-8'), None)
    packed = salt + iv + ct
    return base64.urlsafe_b64encode(packed).decode('ascii')

# Optional server-side decrypt (for debug/admin). Note: if you want receiver privacy,
# we will use client-side WebCrypto and not call this on the receiver visit.
def decrypt_message(passphrase: str, b64_packed: str) -> str:
    packed = base64.urlsafe_b64decode(b64_packed)
    salt = packed[:SALT_LEN]
    iv = packed[SALT_LEN:SALT_LEN+IV_LEN]
    ct = packed[SALT_LEN+IV_LEN:]
    key = derive_key(passphrase.encode('utf-8'), salt)
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(iv, ct, None).decode('utf-8')

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/encrypt', methods=['POST'])
def api_encrypt():
    data = request.get_json(force=True)
    plain = data.get('plain', '')
    password = data.get('password', '')
    if not plain:
        return jsonify({'error': 'plain required'}), 400
    # create ciphertext (base64 urlsafe)
    b64 = encrypt_message(password or '', plain)
    # build share URL with fragment (so server won't receive plaintext on open)
    share = request.host_url.rstrip('/') + request.path.replace('/api/encrypt','') + '#' + b64
    # generate QR code data URI
    qr = qrcode.make(share)
    buf = io.BytesIO()
    qr.save(buf, format='PNG')
    buf.seek(0)
    data_uri = 'data:image/png;base64,' + base64.b64encode(buf.read()).decode('ascii')
    return jsonify({'url': share, 'b64': b64, 'qr': data_uri})

@app.route('/api/decrypt', methods=['POST'])
def api_decrypt():
    # optional endpoint if you want server-side decryption (not used by default)
    data = request.get_json(force=True)
    b64 = data.get('b64', '')
    password = data.get('password', '')
    try:
        plain = decrypt_message(password or '', b64)
        return jsonify({'plain': plain})
    except Exception as e:
        return jsonify({'error': 'decrypt failed'}), 400

if __name__ == '__main__':
    # dev server
    app.run(debug=True, host='0.0.0.0', port=5000)
