# CAATINGA — servidor online

Servidor autoritativo em Node.js: salas privadas por código, dois ou três participantes, um bot quando há duas pessoas, turnos validados no servidor, dados aleatórios criptográficos, mãos privadas, propostas de troca com aceite, prevenção de jogadas duplicadas e reconexão à mesma vaga.

## Hospedar no Render

1. Entre em https://render.com com sua conta do GitHub.
2. Crie um **Web Service**, conecte `wezzleymaxwel-maker/Wezzley-Maxwell` e escolha a branch **online-server**.
3. Runtime: **Node**. Build Command: `npm ci --include=dev && npm run online:build`. Start Command: `npm run online:server`. Health Check: `/health`.
4. Escolha o plano Free para começar. O serviço fornece uma URL HTTPS após o deploy. A primeira conexão depois de o serviço ficar inativo pode demorar enquanto ele inicia.
5. No jogo, entre em **Multijogador → Conexão do servidor**, cole essa URL e crie uma sala. O convite copiado já leva o endereço e o código da sala; nunca contém o token da pessoa que convidou.

O arquivo `render.yaml` também contém uma configuração Blueprint equivalente. Não precisa de chave secreta do GitHub no jogo nem de banco de dados para começar.

Para deixar a URL do servidor predefinida para todos, compile o jogo com `VITE_CAATINGA_SERVER=https://seu-servico.onrender.com` e publique a nova versão do site.

## Rodar localmente

```sh
npm ci --include=dev
npm run online:build
npm run online:server
```

O servidor abre a porta `8787`, ou a porta definida em `PORT`. No jogo em desenvolvimento, use `http://127.0.0.1:8787`. Em produção, use HTTPS.

## Variáveis

- `PORT`: porta HTTP, preenchida automaticamente pelo Render.
- `CAATINGA_ORIGINS`: origens do site autorizadas, separadas por vírgula. O padrão permite o GitHub Pages deste projeto e desenvolvimento local na porta 5174.
- `CAATINGA_DATA_DIR`: pasta de salvamento das salas. O padrão é `.online-data`. Em hospedagens com disco persistente, a pasta deve apontar para o volume montado.

As salas expiram após 24 horas sem jogadas. O navegador guarda a sessão na aba para reconectar após atualizar a página. Um participante desconectado mantém sua vaga; não é substituído por um bot. O servidor só controla a vaga que já estava vazia ao começar.

No plano gratuito do Render, o armazenamento local é temporário. Reiniciar ou republicar o serviço pode apagar as salas. Para preservar partidas entre reinícios, configure um disco persistente em um plano compatível ou um armazenamento externo. Não trate o plano gratuito como salvamento permanente.

## Validação

```sh
npm run test:online
npm run online:build
```

`npm run test:sertao:online` também testa três navegadores independentes com Vite em `5174` e servidor em `8787`.

## Protocolo

`GET /health` informa disponibilidade. `POST /api` aceita create, join, resume, poll, start, action e leave. Cada sessão recebe um token aleatório próprio; o token não aparece nos convites nem nas visões dos outros jogadores. Ações enviam comando, versão esperada e identificador único, nunca o estado completo. Apenas o servidor calcula resultados. O baralho usa embaralhamento criptográfico independente da semente pública do tabuleiro.
