require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3003;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

app.post('/api/criar-pagamento',  require('./api/criar-pagamento'));
app.get('/api/status-pagamento',  require('./api/status-pagamento'));
app.post('/api/webhook-dice',     require('./api/webhook-dice'));

app.listen(PORT, () => {
  console.log(`[Popozuda] Backend rodando em http://localhost:${PORT}`);
});
