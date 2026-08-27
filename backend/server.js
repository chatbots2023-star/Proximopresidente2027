import { app } from './app.js';

const PORT = process.env.PORT || 3001;

const SEDEPAY_API_KEY = (process.env.SEDEPAY_API_KEY || '').trim();
const HAS_KEY = SEDEPAY_API_KEY && SEDEPAY_API_KEY !== 'sk_live_SUA_CHAVE';
const MODE = HAS_KEY ? 'sedepay' : 'mock';
const SEDEPAY_WEBHOOK_SECRET = (process.env.SEDEPAY_WEBHOOK_SECRET || '').trim();
const WEBHOOK_READY = Boolean(SEDEPAY_WEBHOOK_SECRET) && !SEDEPAY_WEBHOOK_SECRET.includes('SUA_CHAVE');

app.listen(PORT, () => {
  console.log(`API Próximo Presidente rodando em http://localhost:${PORT} (modo: ${MODE})`);
  if (MODE === 'sedepay') {
    console.log(`SedePay conectada. Webhook: ${WEBHOOK_READY ? 'configurado' : 'NÃO configurado (defina SEDEPAY_WEBHOOK_SECRET)'}`);
  } else {
    console.log('Sem chave SedePay válida -> modo demonstração com PIX simulado.');
  }
});
