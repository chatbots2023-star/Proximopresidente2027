import { app } from './app.js';

const PORT = process.env.PORT || 3001;

const PUSHIN_PAY_TOKEN = (process.env.PUSHIN_PAY_TOKEN || '').trim();
const MODE = Boolean(PUSHIN_PAY_TOKEN) ? 'pushin' : 'mock';

app.listen(PORT, () => {
  console.log(`API Próximo Presidente rodando em http://localhost:${PORT} (modo: ${MODE})`);
  if (MODE === 'pushin') {
    console.log('Pushin Pay conectado. Divulgações serão cobradas via PIX.');
  } else {
    console.log('Sem token Pushin Pay -> modo demonstração com PIX simulado.');
  }
});
