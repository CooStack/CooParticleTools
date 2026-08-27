// 代码流：读取 assets/blog/code.kt 并“逐字打字”，带打错字->删除->修正效果
// 特点：
// 1) 不做“幽灵显示”（不会提前展示未输入的代码）
// 2) 自动滚动，让光标始终靠近展示框中间
// 3) 简单代码高亮（依赖 window.CodeHighlighter.highlightKotlin）
// 4) 不靠“每行双回车”造行距；改为自动滚动让光标保持在展示框中间
(() => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const nextFrame = () => new Promise(requestAnimationFrame);

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function isTypoCandidate(ch) {
    // 只对字母/数字做“打错字”，避免把符号打乱太夸张
    return /[A-Za-z0-9]/.test(ch);
  }

  function randomWrongChar(correct) {
    const pool = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let c = correct;
    for (let t = 0; t < 12 && c === correct; t++) {
      c = pool[Math.floor(Math.random() * pool.length)];
    }
    return c;
  }

  function safeLineStart(text, idx) {
    const i = text.lastIndexOf('\n', Math.max(0, idx - 1));
    return i === -1 ? 0 : i + 1;
  }

  const DEFAULT_CODE = `package com.coostack.particles

import kotlin.math.*
import kotlin.random.Random

// 简单的向量 + 粒子定义
data class Vec3(val x: Double, val y: Double, val z: Double)
data class Particle(val id: Long, val pos: Vec3, val vel: Vec3, val life: Int)

interface Emitter<T> {
    fun emit(input: T): List<Particle>
}

data class EmitContext(
    val origin: Vec3,
    val seed: Int,
    val count: Int,
)

// 一些工具函数
fun randVec3(r: Random): Vec3 {
    val a = r.nextDouble(-1.0, 1.0)
    val b = r.nextDouble(-1.0, 1.0)
    val c = r.nextDouble(-1.0, 1.0)
    return Vec3(a, b, c)
}

abstract class ClassParticleEmitters {
    abstract fun emit(ctx: EmitContext): List<Particle>

    protected fun id(ctx: EmitContext, i: Int): Long =
        (ctx.seed.toLong() shl 32) or i.toLong()

    protected fun baseVel(r: Random): Vec3 {
        val v = randVec3(r)
        return Vec3(v.x * 0.06, v.y * 0.10, v.z * 0.06)
    }
}

class SpiralEmitter : ClassParticleEmitters() {
    override fun emit(ctx: EmitContext): List<Particle> {
        val r = Random(ctx.seed)
        val list = ArrayList<Particle>(ctx.count)
        for (i in 0 until ctx.count) {
            val theta = i * 0.24
            val pos = Vec3(
                ctx.origin.x + cos(theta) * 0.55,
                ctx.origin.y + i * 0.012,
                ctx.origin.z + sin(theta) * 0.55
            )
            val vel = baseVel(r)
            list += Particle(id(ctx, i), pos, vel, life = 34 + r.nextInt(0, 18))
        }
        return list
    }
}

fun main() {
    val e: ClassParticleEmitters = SpiralEmitter()
    val ctx = EmitContext(origin = Vec3(0.0, 64.0, 0.0), seed = 42, count = 28)
    println(e.emit(ctx).take(3))
}
`;

  class CodeFlow {
    constructor({
      url,
      boxEl,
      codeEl,
      cursorEl,
      minDelay = 22,
      maxDelay = 85,
      typoChance = 0.055,
      pauseChance = 0.07,
      startAnchor = 'abstract class ClassParticleEmitters',
      startFromAnchor = true,
      doubleEnter = true,
    }) {
      this.url = url;
      this.boxEl = boxEl;
      this.codeEl = codeEl;
      this.cursorEl = cursorEl;

      this.minDelay = minDelay;
      this.maxDelay = maxDelay;
      this.typoChance = typoChance;
      this.pauseChance = pauseChance;

      this.startAnchor = startAnchor;
      this.startFromAnchor = startFromAnchor;
      this.doubleEnter = doubleEnter;

      this.text = '';
      this.pos = 0;     // 正确进度
      this.extra = '';  // 临时“打错字”插入
      this.running = false;
      this._scrollRaf = 0;
      this.anchorPos = 0;
    }

    async load() {
      // 优先读取文件；失败就用内置默认代码（不弹“失败提示”，避免破坏观感）
      try {
        const res = await fetch(this.url, { cache: 'no-store' });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        let t = (await res.text()).replaceAll('\r\n', '\n');
        t = t.replace(/^\n+/, '');
        this.text = t;
      } catch (_) {
        this.text = DEFAULT_CODE;
      }

      this.anchorPos = 0;
      if (this.startFromAnchor && this.startAnchor) {
        const idx = this.text.indexOf(this.startAnchor);
        if (idx !== -1) this.anchorPos = safeLineStart(this.text, idx);
      }
    }

    highlight(raw) {
      const fn = window.CodeHighlighter?.highlightKotlin;
      return fn ? fn(raw) : raw;
    }

    toDisplayText(raw) {
      if (!this.doubleEnter) return raw;
      // 视觉“按两次回车”：每行之间空一行（更易读）
      return raw.replace(/\n/g, '\n\n');
    }

    scrollToCursor() {
      if (!this.boxEl || !this.cursorEl) return;

      const boxRect = this.boxEl.getBoundingClientRect();
      const curRect = this.cursorEl.getBoundingClientRect();
      const delta = curRect.top - boxRect.top;
      // 让光标保持在展示框中间
      const target = this.boxEl.scrollTop + delta - this.boxEl.clientHeight * 0.50;

      const max = Math.max(0, this.boxEl.scrollHeight - this.boxEl.clientHeight);
      this.boxEl.scrollTop = clamp(target, 0, max);
    }

    render() {
      if (!this.codeEl) return;

      const typed = this.text.slice(0, this.pos) + this.extra;
      const display = this.toDisplayText(typed);
      this.codeEl.innerHTML = this.highlight(display);

      if (this._scrollRaf) cancelAnimationFrame(this._scrollRaf);
      this._scrollRaf = requestAnimationFrame(() => this.scrollToCursor());
    }

    async stepTypeOne() {
      if (this.pos >= this.text.length) return false;
      const ch = this.text[this.pos];

      // newline 直接打，不做 typo
      if (ch === '\n') {
        this.pos++;
        this.extra = '';
        this.render();
        await nextFrame();
        await sleep(clamp(110 + Math.random() * 120, this.minDelay, 240));
        return true;
      }

      // 随机打错字：先打错 -> 停顿 -> 删除 -> 打正确
      const doTypo = (Math.random() < this.typoChance) && isTypoCandidate(ch);
      if (doTypo) {
        this.extra = randomWrongChar(ch);
        this.render();
        await nextFrame();
        await sleep(80 + Math.random() * 170);

        this.extra = '';
        this.render();
        await nextFrame();
        await sleep(55 + Math.random() * 120);

        this.pos++;
        this.render();
        await nextFrame();
        await sleep(clamp(this.minDelay + Math.random() * (this.maxDelay - this.minDelay), 16, 130));
        return true;
      }

      // 正常：打一个字符
      this.pos++;
      this.extra = '';
      this.render();
      await nextFrame();

      if (Math.random() < this.pauseChance) {
        await sleep(120 + Math.random() * 420);
      } else {
        await sleep(clamp(this.minDelay + Math.random() * (this.maxDelay - this.minDelay), 14, 120));
      }
      return true;
    }

    async start() {
      if (this.running) return;
      this.running = true;

      await this.load();

      // 关键：从 anchor 行开始“继续打字”，但 anchor 之前的内容要直接显示
      this.pos = (typeof this.anchorPos === 'number') ? this.anchorPos : 0;
      this.extra = '';
      this.render();
      await nextFrame();

      while (this.running) {
        const ok = await this.stepTypeOne();
        if (!ok) break;
      }

      this.extra = '';
      this.render();
    }

    stop() {
      this.running = false;
    }
  }

  window.CodeFlow = CodeFlow;
})();
