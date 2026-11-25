// تشغيل المنصة بـ PM2: إعادة تشغيل تلقائية عند الانهيار، وحد لاستهلاك الذاكرة
// الاستخدام: npm install -g pm2 && pm2 start ecosystem.config.cjs && pm2 save
module.exports = {
  apps: [{
    name: 'nebula',
    script: 'index.js',
    instances: 1,
    exec_mode: 'fork',
    autorestart: true,
    max_restarts: 20,
    restart_delay: 3000,
    max_memory_restart: '400M',
    env: { NODE_ENV: 'production' },
  }],
};
