/* ============================================================
   分散型防災データ利活用研究会 コンセプトページ スクリプト
   ------------------------------------------------------------
   story.html から読み込まれます。同じフォルダに置いてください。
   Three.js (r128) の読み込み後に実行される必要があるため、
   story.html では three.min.js の次に読み込んでいます。

   収録内容
     1. 読み込み演出とナビゲーションの状態切替
     2. スクロールに応じた各セクションの出現
     3. お知らせ（news.js の内容を反映）
     4. 最下部の夜明け（最下部で1秒待ってから日の出）
     5. 座組の星座（タッチ端末で牛の姿を表示する切替）
     6. Three.js によるトップの太陽系表現

   ※ 会員情報・入会案内・活動記録は入り口ページ（index.html）が
     担当します。このページは思想と物語に専念させています。
   ============================================================ */

(function(){
  "use strict";
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ----- load sequence ----- */
  window.addEventListener("load", function(){ document.body.classList.add("is-loaded"); });
  setTimeout(function(){ document.body.classList.add("is-loaded"); }, 1800); /* fallback */

  /* 会員情報の掲載は入り口ページ（index.html）へ移しました。
     このページは思想と物語に専念します。 */

  /* ----- お知らせ: news.js を読み込んで差し替える -----
     1行1件。「日付 半角スペース 本文」。# 行と空行は無視。
     news.js は index.html / story.html の両方から読み込まれます。
     読み込めない場合は、HTMLに書かれた予備の項目がそのまま表示されます。 */
  (function(){
    var box = document.getElementById("news");
    var list = document.getElementById("news-list");
    if(!box || !list) return;

    /* 高さの制御はCSS（フレックスと max-height）に任せているため、
       JSでの実測・調整は行わない。 */
    if(typeof window.NEWS !== "string") return;
    function esc(s){ return String(s).replace(/[&<>"]/g, function(c){
      return {"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]; }); }
    var items = window.NEWS.split(/\r?\n/)
      .map(function(l){ return l.trim(); })
      .filter(function(l){ return l && l.charAt(0) !== "#"; });
    if(!items.length){ box.hidden = true; return; }
    list.innerHTML = items.map(function(l){
      var m = l.match(/^(\d{4}[.\-\/]\d{1,2}[.\-\/]\d{1,2})[ \t　]+(.+)$/);
      return '<li class="news__item">' +
             (m ? '<time class="news__date">' + esc(m[1]) + '</time>' : '') +
             '<span class="news__text">' + esc(m ? m[2] : l) + '</span></li>';
    }).join("");
  })();

  /* ----- 最下部の夜明け -----
     ページの一番下に到達し、そこに1秒とどまってから日の出を始める。
     途中で離れた場合は待機を取り消し、次に到達したときに数え直す。 */
  (function(){
    var dawn = document.querySelector(".dawn");
    if(!dawn) return;
    var timer = null, started = false;
    function atBottom(){
      return window.innerHeight + window.scrollY >=
             document.documentElement.scrollHeight - 4;
    }
    function check(){
      if(started) return;
      if(atBottom()){
        if(timer === null){
          timer = setTimeout(function(){
            timer = null; started = true;
            dawn.classList.add("is-rising");
          }, 1000);
        }
      }else if(timer !== null){
        clearTimeout(timer); timer = null;
      }
    }
    window.addEventListener("scroll", check, {passive:true});
    window.addEventListener("resize", check);
    check();
  })();

  /* ----- 座組: 牛の姿(タッチ端末用トグル) ----- */
  var constSvg = document.querySelector(".alliance__constellation");
  if(constSvg){
    constSvg.addEventListener("touchstart", function(){ constSvg.classList.toggle("show-bull"); }, {passive:true});
  }

  /* ----- nav state ----- */
  var nav = document.getElementById("nav");
  function onScrollNav(){ nav.classList.toggle("is-scrolled", window.scrollY > 40); }
  window.addEventListener("scroll", onScrollNav, {passive:true});
  onScrollNav();

  /* ----- reveals ----- */
  var revealEls = document.querySelectorAll(".reveal");
  if("IntersectionObserver" in window && !reduced){
    var io = new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        if(e.isIntersecting){ e.target.classList.add("is-in"); io.unobserve(e.target); }
      });
    },{threshold:.18,rootMargin:"0px 0px -40px 0px"});
    revealEls.forEach(function(el){ io.observe(el); });
  }else{
    revealEls.forEach(function(el){ el.classList.add("is-in"); });
  }

  /* ----- layer stack ----- */
  var layers = document.getElementById("layers");
  if(layers && "IntersectionObserver" in window){
    var lio = new IntersectionObserver(function(entries){
      entries.forEach(function(e){
        if(e.isIntersecting){ layers.classList.add("is-in"); lio.unobserve(layers); }
      });
    },{threshold:.45});
    lio.observe(layers);
  }else if(layers){
    layers.classList.add("is-in");
  }

  /* ================= THREE.JS COSMOS ================= */
  var canvas = document.getElementById("cosmos");
  if(!canvas || typeof THREE === "undefined") return;

  var renderer, scene, camera, orbitGroup, starsA, starsB, planets = [];
  var W = 0, H = 0;
  var mouseX = 0, mouseY = 0, heroVisible = true;

  function dotTexture(color, glow){
    var s = 64, cv = document.createElement("canvas");
    cv.width = cv.height = s;
    var ctx = cv.getContext("2d");
    var g = ctx.createRadialGradient(s/2,s/2,0,s/2,s/2,s/2);
    g.addColorStop(0,"rgba(255,255,255,1)");
    g.addColorStop(.25,color);
    g.addColorStop(.6, glow);
    g.addColorStop(1,"rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0,0,s,s);
    var t = new THREE.CanvasTexture(cv);
    return t;
  }

  function makeStars(count, spread, size, opacity){
    var geo = new THREE.BufferGeometry();
    var pos = new Float32Array(count*3);
    for(var i=0;i<count;i++){
      var r = spread * (0.35 + 0.65*Math.random());
      var th = Math.random()*Math.PI*2;
      var ph = Math.acos(2*Math.random()-1);
      pos[i*3]   = r*Math.sin(ph)*Math.cos(th);
      pos[i*3+1] = r*Math.cos(ph)*0.6;
      pos[i*3+2] = r*Math.sin(ph)*Math.sin(th) - spread*0.3;
    }
    geo.setAttribute("position", new THREE.BufferAttribute(pos,3));
    var mat = new THREE.PointsMaterial({
      size:size, map:dotTexture("rgba(198,214,240,.9)","rgba(91,155,230,.35)"),
      transparent:true, opacity:opacity, depthWrite:false,
      blending:THREE.AdditiveBlending, sizeAttenuation:true
    });
    return new THREE.Points(geo, mat);
  }

  /* スマートフォンでは描画を軽くする。
     ヒーローは画面いっぱいの WebGL で、初期画面にいる間だけ描画し続ける。
     ここが重いと、最初のスクロールが引っかかって「固まった」ように感じられる */
  var lowPower = window.innerWidth < 820 || (navigator.hardwareConcurrency || 8) <= 4;

  function init(){
    renderer = new THREE.WebGLRenderer({
      canvas:canvas, antialias:!lowPower, alpha:true,
      powerPreference:"low-power"
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio||1, lowPower ? 1.5 : 2));
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(55, 1, .1, 400);
    camera.position.set(0, 9, 46);

    starsA = makeStars(lowPower ? 420 : 900, 120, 1.5, .8);
    starsB = makeStars(lowPower ? 220 : 500, 160, 2.2, .5);
    scene.add(starsA); scene.add(starsB);

    orbitGroup = new THREE.Group();
    scene.add(orbitGroup);

    /* sun */
    var sunTex = dotTexture("rgba(255,224,80,.95)","rgba(255,180,0,.35)");
    var sun = new THREE.Sprite(new THREE.SpriteMaterial({
      map:sunTex, transparent:true, depthWrite:false, blending:THREE.AdditiveBlending
    }));
    sun.scale.set(10,10,1);
    orbitGroup.add(sun);
    var core = new THREE.Mesh(
      new THREE.SphereGeometry(.9, 24, 24),
      new THREE.MeshBasicMaterial({color:0xffe25e})
    );
    orbitGroup.add(core);

    /* orbits + planets */
    var planetTexBlue = dotTexture("rgba(120,180,255,.95)","rgba(0,91,186,.4)");
    var planetTexGold = dotTexture("rgba(255,224,120,.95)","rgba(255,180,0,.35)");
    var N = 6;
    for(var i=0;i<N;i++){
      var a = 9 + i*4.6;
      var b = a * (0.52 + Math.random()*0.2);
      var curve = new THREE.EllipseCurve(0,0,a,b,0,Math.PI*2,false,0);
      var pts = curve.getPoints(140);
      var g3 = new THREE.BufferGeometry().setFromPoints(pts);
      /* 軌道の線。1px固定で細く見えるため、明度と不透明度で視認性を出す */
      var line = new THREE.Line(g3, new THREE.LineBasicMaterial({
        color:0x8fc0f5, transparent:true, opacity:.38
      }));
      var holder = new THREE.Group();
      holder.rotation.x = Math.PI/2 - 0.28 - Math.random()*0.12;
      holder.rotation.z = (Math.random()-0.5)*0.5;
      holder.add(line);
      orbitGroup.add(holder);

      var isGold = (i === 2);
      var sprite = new THREE.Sprite(new THREE.SpriteMaterial({
        map:isGold ? planetTexGold : planetTexBlue,
        transparent:true, depthWrite:false, blending:THREE.AdditiveBlending
      }));
      var sc = 1.5 + Math.random()*1.1;
      sprite.scale.set(sc,sc,1);
      holder.add(sprite);
      planets.push({sprite:sprite, a:a, b:b, t:Math.random()*Math.PI*2,
                    speed:(0.14/Math.sqrt(a))*(Math.random()*.4+.8)});
    }

    orbitGroup.rotation.z = 0.06;
    orbitGroup.position.set(13, 9.5, -6);
    resize();
    if(reduced){ renderOnce(); } else { requestAnimationFrame(tick); }
  }

  function resize(){
    var rect = canvas.parentElement.getBoundingClientRect();
    W = rect.width; H = rect.height;
    renderer.setSize(W, H, false);
    camera.aspect = W/H;
    camera.updateProjectionMatrix();
  }

  function renderOnce(){
    planets.forEach(function(p){
      p.sprite.position.set(Math.cos(p.t)*p.a, Math.sin(p.t)*p.b, 0);
    });
    renderer.render(scene, camera);
  }

  var lastT = 0;
  function tick(now){
    requestAnimationFrame(tick);
    if(!heroVisible || document.hidden) return;
    var dt = Math.min((now - lastT)/1000, .05); lastT = now;

    var scrollP = Math.min(Math.max(window.scrollY / (H||1), 0), 1);

    planets.forEach(function(p){
      p.t += p.speed*dt;
      p.sprite.position.set(Math.cos(p.t)*p.a, Math.sin(p.t)*p.b, 0);
    });

    starsA.rotation.y += dt*0.004;
    starsB.rotation.y -= dt*0.003;

    /* the copernican turn: viewpoint rotates as you scroll */
    orbitGroup.rotation.y += dt*0.03;
    var targetTilt = 0.12 + scrollP*0.85;
    orbitGroup.rotation.x += (targetTilt - orbitGroup.rotation.x)*0.06;

    camera.position.x += (mouseX*3 - camera.position.x)*0.04;
    camera.position.y += (9 - scrollP*5 + mouseY*1.6 - camera.position.y)*0.04;
    camera.lookAt(1.5,1,0);

    renderer.render(scene, camera);
  }

  /* iOS Safari は、スクロールでアドレスバーが出入りするたびに resize を投げてくる。
     そのつど描画バッファを作り直すと、いちばん最初のスクロールが引っかかり、
     固まったように感じられる。幅が変わったとき（＝画面回転やPCのウィンドウ操作）と、
     高さが大きく変わったときだけ作り直す */
  var lastW = window.innerWidth, lastH = window.innerHeight, resizeTimer = 0;
  window.addEventListener("resize", function(){
    var w = window.innerWidth, h = window.innerHeight;
    if(w === lastW && Math.abs(h - lastH) < 140) return;   /* アドレスバーの出入りは無視 */
    lastW = w; lastH = h;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(function(){ resize(); if(reduced) renderOnce(); }, 120);
  }, {passive:true});
  /* 視点を指の動きに追従させるのはマウス環境だけにする。
     指で操作する端末では、スクロール中の指の動きまで拾って視点が揺れてしまう */
  if(window.matchMedia("(hover:hover) and (pointer:fine)").matches){
    window.addEventListener("pointermove", function(e){
      mouseX = (e.clientX / window.innerWidth - .5)*2;
      mouseY = (e.clientY / window.innerHeight - .5)*-2;
    }, {passive:true});
  }

  if("IntersectionObserver" in window){
    new IntersectionObserver(function(entries){
      heroVisible = entries[0].isIntersecting;
    },{threshold:0}).observe(canvas.parentElement);
  }

  /* 3Dの初期化（星の生成・テクスチャ作成・WebGLの確保）は数百ミリ秒かかる。
     これをスクリプト読み込み直後に走らせると、利用者が最初にスクロールしようと
     した瞬間と重なり、画面が固まったように感じられる。
     ヒーローは背景の演出なので、ページが操作できるようになってから動き出せばよい */
  var started = false;
  function start(){ if(started) return; started = true; init(); }
  function scheduleStart(){
    if("requestIdleCallback" in window){ requestIdleCallback(start, {timeout:1200}); }
    else { setTimeout(start, 250); }
  }
  if(document.readyState === "complete"){ scheduleStart(); }
  else { window.addEventListener("load", scheduleStart, {once:true}); }
})();
