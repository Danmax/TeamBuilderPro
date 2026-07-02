(function initTeamBuilderParticles(global) {
  const canvas = global.document?.getElementById('particles');
  if (!canvas || typeof canvas.getContext !== 'function') return;

  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const particles = [];

  function resizeCanvas() {
    canvas.width = global.innerWidth;
    canvas.height = global.innerHeight;
  }

  function createParticle() {
    return {
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      vx: (Math.random() - 0.5) * 0.3,
      vy: (Math.random() - 0.5) * 0.3,
      r: Math.random() * 1.5 + 0.3,
      a: Math.random() * 0.3 + 0.05
    };
  }

  function drawParticles() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    particles.forEach(particle => {
      particle.x += particle.vx;
      particle.y += particle.vy;
      if (particle.x < 0) particle.x = canvas.width;
      if (particle.x > canvas.width) particle.x = 0;
      if (particle.y < 0) particle.y = canvas.height;
      if (particle.y > canvas.height) particle.y = 0;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255,255,255,${particle.a})`;
      ctx.fill();
    });
    global.requestAnimationFrame(drawParticles);
  }

  global.addEventListener('resize', resizeCanvas);
  resizeCanvas();
  for (let i = 0; i < 40; i++) {
    particles.push(createParticle());
  }
  drawParticles();
})(window);
