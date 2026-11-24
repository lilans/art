// Production Worker custom domain. Override locally only during development.
window.NAROD_CHAT_ENDPOINT = ['localhost','127.0.0.1'].includes(location.hostname)
  ? 'ws://127.0.0.1:8787/ws' : 'wss://chat.lanskikh.art/ws';
