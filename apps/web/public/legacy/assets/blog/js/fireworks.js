// 烟花：点击爆炸（上层 canvas），使用 destination-out 轻擦除避免把背景刷黑
(() => {
  class Spark {
    constructor(x, y, vx, vy, life) {
      this.x = x; this.y = y;
      this.vx = vx; this.vy = vy;
      this.life = life;
      this.max = life;
    }
    step() {
      this.life--;
      this.vx *= 0.985;
      this.vy *= 0.985;
      this.vy += 0.03; // 重力
      this.x += this.vx;
      this.y += this.vy;
    }
    get a() { return Math.max(0, this.life / this.max); }
  }

  class Fireworks {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: true });
      this.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      this.sparks = [];
      this.resize();
      window.addEventListener('resize', () => this.resize());
      requestAnimationFrame(() => this.loop());
    }

    resize() {
      const w = window.innerWidth, h = window.innerHeight;
      this.canvas.width = Math.floor(w * this.dpr);
      this.canvas.height = Math.floor(h * this.dpr);
      this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      this.w = w; this.h = h;
    }

    burst(x, y) {
      const n = 60 + Math.floor(Math.random() * 50);
      for (let i = 0; i < n; i++) {
        const ang = Math.random() * Math.PI * 2;
        const sp = 2.2 + Math.random() * 3.6;
        const vx = Math.cos(ang) * sp;
        const vy = Math.sin(ang) * sp;
        const life = 40 + Math.floor(Math.random() * 30);
        this.sparks.push(new Spark(x, y, vx, vy, life));
      }
    }

    loop() {
      const ctx = this.ctx;

      // 轻微擦除上一帧（透明拖尾，不盖黑底）
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      ctx.fillRect(0, 0, this.w, this.h);
      ctx.restore();

      // 画火花
      ctx.globalCompositeOperation = 'source-over';
      ctx.lineWidth = 2;

      for (let i = this.sparks.length - 1; i >= 0; i--) {
        const s = this.sparks[i];
        s.step();
        if (s.life <= 0) { this.sparks.splice(i, 1); continue; }
        const a = 0.9 * s.a;
        ctx.strokeStyle = `rgba(255,255,255,${a})`;
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(s.x - s.vx * 2, s.y - s.vy * 2);
        ctx.stroke();
      }

      requestAnimationFrame(() => this.loop());
    }
  }

  window.Fireworks = Fireworks;
})();
