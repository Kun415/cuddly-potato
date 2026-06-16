# ConfessCraft (Python)

本项目是一个创意的“表白程序”原型，Flask 后端负责（可选）加密生成分享链接与二维码，前端负责解密、3D 心形动画与语音朗读。

快速运行
1. python -m venv venv
2. source venv/bin/activate  # Windows: venv\Scripts\activate
3. pip install -r requirements.txt
4. python app.py
5. 打开 http://127.0.0.1:5000

说明
- 密文使用 PBKDF2（240k 迭代）+ AES-GCM 打包为 (salt|iv|cipher) 的 urlsafe base64。
- 分享链接把密文放在 URL fragment（#后面），浏览器打开时 fragment 不会被发送到服务器，接收者隐私更好。
- 若你完全不想在服务器上提交明文，请把前端加密逻辑替换为 WebCrypto 并在客户端生成分享链接（我可以帮你改）。
