import { app } from './app.js';

const PORT = process.env.PORT || 3001;

const STRIPE_SECRET_KEY = (process.env.STRIPE_SECRET_KEY || '').trim();
const MODE = Boolean(STRIPE_SECRET_KEY) ? 'stripe' : 'mock';

app.listen(PORT, () => {
  console.log(`API Próximo Presidente rodando em http://localhost:${PORT} (modo: ${MODE})`);
  if (MODE === 'stripe') {
    console.log('Stripe conectado. PIX e Cartão (divulgação) serão cobrados pela Stripe.');
  } else {
    console.log('Sem chave Stripe -> modo demonstração com PIX simulado.');
  }
});
