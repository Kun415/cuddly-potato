// 前端逻辑：调用后端生成加密数据（base64），并用 WebCrypto 解密（与后端参数一致）。
(async function(){
  // --- Elements
  const plainEl = document.getElementById('plain');
  const passEl = document.getElementById('password');
  const btnEncrypt = document.getElementById('btnEncrypt');
  const btnCopy = document.getElementById('btnCopy');
  const cipherEl = document.getElementById('cipher');
  const btnDecrypt = document.getElementById('btnDecrypt');
  const btnSpeak = document.getElementById('btnSpeak');
  const btnConfess = document.getElementById('btnConfess');
  const btnReset = document.getElementById('btnReset');
  const qrImg = document.getElementById('qr');
  const status = document.getElementById('status');
  const result = document.getElementById('result');

  function setStatus(t){ status.textContent = '状态：' + t; }

  // On load, if location.hash present, prefill cipher input
  if(location.hash && location.hash.length>1){
    cipherEl.value = location.hash.slice(1);
    setStatus('检测到分享链接的密文已填入。输入口令并解密或直接表白。');
  }

  btnEncrypt.onclick = async ()=>{
    setStatus('请求服务器加密…');
    const resp = await fetch('/api/encrypt', {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ plain: plainEl.value, password: passEl.value })
    });
    const j = await resp.json();
    if(resp.ok){
      cipherEl.value = j.b64;
      qrImg.src = j.qr;
      // Construct share URL and copy
      const share = window.location.origin + window.location.pathname + '#' + j.b64;
      await navigator.clipboard.writeText(share);
      setStatus('生成并复制了分享链接（已放入剪贴板）。');
      result.textContent = share;
    }else{
      setStatus('加密失败：' + (j.error||'未知'));
    }
  };

  btnCopy.onclick = async ()=>{
    if(!cipherEl.value){ setStatus('先生成或粘贴密文'); return; }
    const share = window.location.origin + window.location.pathname + '#' + cipherEl.value;
    await navigator.clipboard.writeText(share);
    setStatus('分享链接已复制');
  };

  // WebCrypto-compatible decryption to match server-side PBKDF2 + AES-GCM
  async function webcryptoDecrypt(pass, b64packed){
    const packed = Uint8Array.from(atob(b64packed.replace(/-/g,'+').replace(/_/g,'/')), c=>c.charCodeAt(0));
    const SALT_LEN = 16, IV_LEN = 12;
    const salt = packed.slice(0, SALT_LEN);
    const iv = packed.slice(SALT_LEN, SALT_LEN+IV_LEN);
    const ct = packed.slice(SALT_LEN+IV_LEN);
    const passKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(pass), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 240000, hash: 'SHA-256' },
      passKey,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    const plainBuffer = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, ct);
    return new TextDecoder().decode(plainBuffer);
  }

  btnDecrypt.onclick = async ()=>{
    if(!cipherEl.value){ setStatus('请先生成或粘贴密文'); return; }
    setStatus('前端解密中…');
    try{
      const plain = await webcryptoDecrypt(passEl.value||'', cipherEl.value.trim());
      window._lastPlain = plain;
      setStatus('解密成功，已准备播放');
      result.textContent = plain;
    }catch(e){
      setStatus('解密失败：口令不对或密文损坏');
    }
  };

  btnSpeak.onclick = async ()=>{
    if(!window._lastPlain){ setStatus('请先解密得到明文'); return; }
    const u = new SpeechSynthesisUtterance(window._lastPlain);
    u.lang = 'zh-CN'; u.rate = 0.95;
    speechSynthesis.speak(u);
    playVisualPulse();
  };

  btnConfess.onclick = async ()=>{
    // Try auto-decrypt if needed
    if(cipherEl.value && !window._lastPlain){
      setStatus('尝试自动解密…');
      try{
        window._lastPlain = await webcryptoDecrypt(passEl.value||'', cipherEl.value.trim());
      }catch(e){
        setStatus('自动解密失败，请确认口令');
        return;
      }
    }
    if(window._lastPlain){
      btnSpeak.onclick();
    }else{
      setStatus('没有内容可以表白');
    }
  };

  btnReset.onclick = ()=>{
    window._lastPlain = null;
    cipherEl.value = '';
    qrImg.src = '';
    result.textContent = '';
    setStatus('已重置');
  };

  // --- Minimal Three.js heart visual (borrowed idea) ---
  const container = document.getElementById('canvas-container');
  let renderer, scene, camera, heartMesh, controls, clock;
  function initThree(){
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(45, innerWidth/innerHeight, 0.1, 100);
    camera.position.set(0,1.2,3.5);
    renderer = new THREE.WebGLRenderer({antialias:true, alpha:true});
    renderer.setSize(innerWidth, innerHeight);
    container.appendChild(renderer.domElement);
    const hemi = new THREE.HemisphereLight(0xffd6e1, 0x101020, 0.9); scene.add(hemi);
    const spot = new THREE.PointLight(0xff4d80, 1.2, 12); spot.position.set(2,2,2); scene.add(spot);

    const heartShape = new THREE.Shape();
    const x=0,y=0;
    heartShape.moveTo(x, y+0.5);
    heartShape.bezierCurveTo(x, y+0.5, x-0.5, y+0.5, x-0.5, y);
    heartShape.bezierCurveTo(x-0.5, y-0.6, x, y-0.6, x, y-0.3);
    heartShape.bezierCurveTo(x, y-0.6, x+0.5, y-0.6, x+0.5, y);
    heartShape.bezierCurveTo(x+0.5, y+0.5, x, y+0.5, x, y+0.5);
    const geom = new THREE.ExtrudeGeometry(heartShape, {depth:0.4, bevelEnabled:true, bevelSegments:2, steps:2, bevelSize:0.04, bevelThickness:0.04});
    const mat = new THREE.MeshStandardMaterial({color:0xff2d6f, roughness:0.35, metalness:0.2, emissive:0x220013, emissiveIntensity:0.25});
    heartMesh = new THREE.Mesh(geom, mat);
    heartMesh.rotation.x = Math.PI; heartMesh.scale.set(1.2,1.2,1.2);
    scene.add(heartMesh);

    controls = new THREE.OrbitControls(camera, renderer.domElement); controls.enableDamping=true;
    clock = new THREE.Clock();
    animate();
    window.addEventListener('resize', ()=>{ camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
  }
  let pulse=1.0;
  function animate(){
    requestAnimationFrame(animate);
    const t = clock.getElapsedTime();
    pulse = 0.95 + 0.06*Math.sin(t*2.8);
    heartMesh.scale.set(pulse*1.12,pulse*1.12,pulse*1.12);
    heartMesh.rotation.y += 0.002 * Math.sin(t*0.8);
    controls.update();
    renderer.render(scene,camera);
  }
  function playVisualPulse(){
    const orig = heartMesh.material.emissiveIntensity;
    let p=0; const id = setInterval(()=>{ p+=0.04; heartMesh.material.emissiveIntensity = orig + Math.sin(p*Math.PI)*0.9; if(p>1.4){ clearInterval(id); heartMesh.material.emissiveIntensity = orig; } }, 16);
  }

  try{ initThree(); }catch(e){ console.error(e); setStatus('无法初始化 3D 场景（浏览器可能不支持 WebGL）'); }

})();
