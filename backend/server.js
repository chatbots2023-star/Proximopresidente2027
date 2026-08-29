import { app } from './app.js';

const PORT = process.env.PORT || 3001;

const ASAAS_API_TOKEN = (process.env.ASAAS_API_TOKEN || '').trim();
const ASAAS_WALLET_ID = (process.env.ASAAS_WALLET_ID || '').trim();
const MODE = Boolean(ASAAS_API_TOKEN) && Boolean(ASAAS_WALLET_ID) ? 'asaas' : 'mock';

app.listen(PORT, () => {
  console.log(`API Próximo Presidente rodando em http://localhost:${PORT} (modo: ${MODE})`);
  if (MODE === 'asaas') {
    console.log('Asaas conectado. Cobranças PIX (divulgação) serão geradas pelo Asaas sandbox.');
  } else {
    console.log('Sem token Asaas válido -> modo demonstração com PIX simulado.');
  }
});
