import { app } from './app.js';

const PORT = process.env.PORT || 3001;

const PEPPER_API_TOKEN = (process.env.PEPPER_API_TOKEN || '').trim();
const HAS_KEY = Boolean(PEPPER_API_TOKEN);
const MODE = HAS_KEY ? 'pepper' : 'mock';

app.listen(PORT, () => {
  console.log(`API Próximo Presidente rodando em http://localhost:${PORT} (modo: ${MODE})`);
  if (MODE === 'pepper') {
    console.log('Pepper conectada. Cobranças PIX serão geradas pela Pepper.');
  } else {
    console.log('Sem token Pepper válido -> modo demonstração com PIX simulado.');
  }
});
