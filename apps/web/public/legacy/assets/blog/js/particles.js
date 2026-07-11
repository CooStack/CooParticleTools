// 粒子背景：下落漂浮 + 近距离连线（每粒子最多连 3 条）+ 鼠标吸引（带范围上限）
(() => {
    class Particle {
        constructor(w, h, opts) {
            this.opts = opts;
            this.reset(w, h, true);
        }

        reset(w, h, initial = false) {
            this.x = Math.random() * w;
            // 初始：随机分布；重生：从顶部上方进入
            this.y = initial ? Math.random() * h : (-20 - Math.random() * 160);

            const [rMin, rMax] = this.opts.radius;
            this.r = rMin + Math.random() * (rMax - rMin);

            // 速度：默认向下 + 少量左右漂移
            const fs = this.opts.fallSpeed + Math.random() * this.opts.fallJitter;
            const drift = (Math.random() * 2 - 1) * this.opts.drift;

            this.vx = drift;
            this.vy = fs;
            this.life = 1000

            // 轻微闪烁
            this.tw = Math.random() * Math.PI * 2;
            this.alpha = 0.85;
        }

        step(w, h, pointer) {
            // 鼠标吸引（范围上限）
            if (pointer.active) {
                const dx = pointer.x - this.x;
                const dy = pointer.y - this.y;
                const d2 = dx * dx + dy * dy;
                const max2 = this.opts.mouseRadius * this.opts.mouseRadius;
                if (d2 < max2) {
                    const d = Math.sqrt(d2) || 1;
                    const strength = (1 - d / this.opts.mouseRadius) * this.opts.mousePull;
                    this.vx += (dx / d) * strength;
                    this.vy += (dy / d) * strength;
                    if (this.life > 0) {
                        this.life--;
                    } else {
                        this.reset(w, h, false)
                    }
                }
            }

            // 摩擦 + 重力（保证一直下落）
            this.vx *= this.opts.friction;
            this.vy *= this.opts.friction;
            this.vy += this.opts.gravity;

            this.x += this.vx;
            this.y += this.vy;

            // 左右循环
            if (this.x < -10) this.x = w + 10;
            if (this.x > w + 10) this.x = -10;

            // alpha：轻微呼吸（不再按寿命消散，保证在底部才消散）
            this.tw += 0.05;
            this.alpha = 0.70 + 0.20 * Math.sin(this.tw);

            // 只有到底部出屏才重生
            if (this.y > h + 40) {
                this.reset(w, h, false);
            }
        }
    }

    class ParticleField {
        constructor(canvas) {
            this.canvas = canvas;
            this.ctx = canvas.getContext('2d', {alpha: true});
            this.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

            this.pointer = {x: 0, y: 0, active: false};
            this.opts = {
                count: 240,
                radius: [1.0, 2.4],
                fallSpeed: 0.3,
                fallJitter: 0.55,
                drift: 0.32,
                gravity: 0.004,
                friction: 0.985,
                linkDist: 140,
                maxLinks: 4,       // 每个粒子最多连线数（强制）
                mouseRadius: 300,  // 鼠标吸引范围
                mousePull: 0.02
            };

            this.particles = [];
            this.resize();
            this.seed();

            window.addEventListener('resize', () => this.resize());
            window.addEventListener('pointermove', (e) => this.onPointerMove(e));
            window.addEventListener('pointerdown', (e) => this.onPointerMove(e));
            window.addEventListener('pointerleave', () => (this.pointer.active = false));
            window.addEventListener('pointerout', () => (this.pointer.active = false));
        }

        onPointerMove(e) {
            const rect = this.canvas.getBoundingClientRect();
            this.pointer.x = e.clientX - rect.left;
            this.pointer.y = e.clientY - rect.top;
            this.pointer.active = true;
        }

        resize() {
            const w = window.innerWidth;
            const h = window.innerHeight;
            this.canvas.width = Math.floor(w * this.dpr);
            this.canvas.height = Math.floor(h * this.dpr);
            this.canvas.style.width = w + 'px';
            this.canvas.style.height = h + 'px';
            this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
            this.w = w;
            this.h = h;
        }

        seed() {
            this.particles.length = 0;
            for (let i = 0; i < this.opts.count; i++) {
                this.particles.push(new Particle(this.w, this.h, this.opts));
            }
        }

        step() {
            for (const p of this.particles) p.step(this.w, this.h, this.pointer);
        }

        render() {
            const ctx = this.ctx;
            ctx.clearRect(0, 0, this.w, this.h);

            // 连线：限制“每个粒子”总连接数（两端都计数）
            const n = this.particles.length;
            const linkCounts = new Array(n).fill(0);
            const maxD2 = this.opts.linkDist * this.opts.linkDist;

            ctx.lineWidth = 1;

            for (let i = 0; i < n; i++) {
                if (linkCounts[i] >= this.opts.maxLinks) continue;
                const a = this.particles[i];

                for (let j = i + 1; j < n; j++) {
                    if (linkCounts[i] >= this.opts.maxLinks) break;
                    if (linkCounts[j] >= this.opts.maxLinks) continue;

                    const b = this.particles[j];
                    const dx = a.x - b.x;
                    const dy = a.y - b.y;
                    const d2 = dx * dx + dy * dy;

                    if (d2 < maxD2) {
                        const t = 1 - d2 / maxD2;
                        const alpha = 0.22 * t * Math.min(a.alpha, b.alpha);
                        ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
                        ctx.beginPath();
                        ctx.moveTo(a.x, a.y);
                        ctx.lineTo(b.x, b.y);
                        ctx.stroke();
                        linkCounts[i]++;
                        linkCounts[j]++;
                    }
                }
            }

            // 画粒子
            for (const p of this.particles) {
                const alpha = 0.70 * p.alpha;
                ctx.fillStyle = `rgba(255,255,255,${alpha})`;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    window.ParticleField = ParticleField;
})();