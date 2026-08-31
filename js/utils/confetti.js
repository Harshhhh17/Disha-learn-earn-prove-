/* ==========================================================================
   Disha Confetti Engine (Canvas-based Celebration Particles)
   ========================================================================== */

class ConfettiEngine {
  constructor() {
    this.canvas = null;
    this.ctx = null;
    this.particles = [];
    this.animationId = null;
  }

  init() {
    if (!this.canvas) {
      this.canvas = document.createElement('canvas');
      this.canvas.id = 'disha-confetti-canvas';
      this.canvas.style.position = 'fixed';
      this.canvas.style.top = '0';
      this.canvas.style.left = '0';
      this.canvas.style.width = '100vw';
      this.canvas.style.height = '100vh';
      this.canvas.style.pointerEvents = 'none';
      this.canvas.style.zIndex = '99999';
      document.body.appendChild(this.canvas);
      this.ctx = this.canvas.getContext('2d');
      this.resize();
      window.addEventListener('resize', () => this.resize());
    }
  }

  resize() {
    if (this.canvas) {
      this.canvas.width = window.innerWidth * window.devicePixelRatio;
      this.canvas.height = window.innerHeight * window.devicePixelRatio;
      if (this.ctx) {
        this.ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
      }
    }
  }

  fire(count = 120) {
    this.init();
    const colors = [
      '#f59e0b', '#fbbf24', '#3b82f6', '#60a5fa', 
      '#10b981', '#34d399', '#ec4899', '#8b5cf6', '#ffffff'
    ];

    const centerX = window.innerWidth / 2;
    const centerY = window.innerHeight * 0.45;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = 8 + Math.random() * 16;
      this.particles.push({
        x: centerX,
        y: centerY,
        vx: Math.cos(angle) * velocity + (Math.random() - 0.5) * 4,
        vy: Math.sin(angle) * velocity - 6,
        size: 6 + Math.random() * 8,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 12,
        opacity: 1,
        decay: 0.008 + Math.random() * 0.012,
        shape: Math.random() > 0.4 ? 'rect' : 'circle'
      });
    }

    if (!this.animationId) {
      this.render();
    }
  }

  render() {
    if (!this.ctx) return;
    this.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.38; // Gravity
      p.vx *= 0.98; // Air resistance
      p.rotation += p.rotationSpeed;
      p.opacity -= p.decay;

      if (p.opacity <= 0 || p.y > window.innerHeight + 50) {
        this.particles.splice(i, 1);
        continue;
      }

      this.ctx.save();
      this.ctx.translate(p.x, p.y);
      this.ctx.rotate((p.rotation * Math.PI) / 180);
      this.ctx.globalAlpha = Math.max(0, p.opacity);
      this.ctx.fillStyle = p.color;

      if (p.shape === 'rect') {
        this.ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      } else {
        this.ctx.beginPath();
        this.ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        this.ctx.fill();
      }
      this.ctx.restore();
    }

    if (this.particles.length > 0) {
      this.animationId = requestAnimationFrame(() => this.render());
    } else {
      this.animationId = null;
      this.ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    }
  }
}

export const Confetti = new ConfettiEngine();
